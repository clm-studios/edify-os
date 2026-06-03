/**
 * Anthropic tool definitions and executor for the Eventbrite API v3.
 * Four READ-ONLY tools (v1): eventbrite_list_events, eventbrite_get_event,
 * eventbrite_list_attendees, eventbrite_event_sales_summary.
 *
 * Mirrors the Mailchimp tool pattern: org-scoped, reads its own credential row,
 * decrypts the OAuth token, and makes direct REST calls to the Eventbrite API v3.
 *
 * IMPORTANT: v1 is READ-ONLY. This executor never creates, publishes, or edits
 * events, and never emails attendees. If asked to do so, the model offers to
 * draft the content for the user to action in Eventbrite themselves.
 */

import type Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptIfEncrypted, CRYPTO_LABEL_EVENTBRITE_TOKEN } from "@/lib/crypto";

// ---------------------------------------------------------------------------
// System-prompt addendum for archetypes that have Eventbrite tools active.
// ---------------------------------------------------------------------------

export const EVENTBRITE_TOOLS_ADDENDUM = `\nYou have access to the organization's Eventbrite account via tools. Key rules:

1. **Connect first.** If Eventbrite isn't connected, tell the user to connect it in Settings → Integrations. Never invent events, attendee counts, or revenue data when it isn't connected.
2. **Every figure comes from a tool result.** Never fabricate attendee counts, ticket sales, or revenue. If you don't have the data, call a tool — do not estimate or guess.
3. **Attendee emails are PII.** Attendee data may include email addresses. Use them only for context the user asks about. Never bulk-export, copy out a full list of, or auto-email attendees.
4. **Read-only in v1.** You can read events, attendees, and sales data, but you CANNOT create, edit, publish, or cancel events, and you CANNOT message attendees through these tools. If the user asks for any of those, explain it's not yet supported here and offer to draft the content (event description, attendee email copy, etc.) for them to action directly in Eventbrite.
5. **Discover IDs first.** Call eventbrite_list_events before referencing an event_id. Never invent or guess event IDs.`;

// ---------------------------------------------------------------------------
// Internal error class for surfacing Eventbrite API errors
// ---------------------------------------------------------------------------

class EventbriteError extends Error {
  constructor(
    message: string,
    public readonly detail?: string,
    public readonly status?: number
  ) {
    super(message);
    this.name = "EventbriteError";
  }
}

// ---------------------------------------------------------------------------
// Not-connected sentinel (mirror MAILCHIMP_NOT_CONNECTED pattern)
// ---------------------------------------------------------------------------

const EVENTBRITE_NOT_CONNECTED =
  "Eventbrite is not connected. Visit Settings → Integrations to connect it.";

// ---------------------------------------------------------------------------
// Eventbrite REST helper
// ---------------------------------------------------------------------------

async function eventbriteFetch(
  token: string,
  path: string,
  options?: RequestInit
): Promise<unknown> {
  const url = `https://www.eventbriteapi.com/v3${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(options?.headers ?? {}),
    },
  });

  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const body = (await res.json()) as {
        error_description?: string;
        error?: string;
      };
      detail = body.error_description ?? body.error ?? detail;
    } catch {
      // ignore parse errors
    }
    throw new EventbriteError(`Eventbrite API error: ${detail}`, detail, res.status);
  }

  return res.json();
}

// ---------------------------------------------------------------------------
// Shared Eventbrite response shapes
// ---------------------------------------------------------------------------

interface EventbriteEvent {
  id: string;
  name?: { text?: string };
  description?: { text?: string };
  summary?: string;
  start?: { local?: string; utc?: string };
  end?: { local?: string; utc?: string };
  status?: string;
  url?: string;
  capacity?: number | null;
  venue?: {
    name?: string;
    address?: { localized_address_display?: string };
  } | null;
  ticket_classes?: Array<{
    name?: string;
    cost?: { display?: string; value?: number; currency?: string } | null;
    free?: boolean;
    quantity_total?: number | null;
    quantity_sold?: number | null;
  }>;
}

// ---------------------------------------------------------------------------
// Tool definitions (model-facing)
// ---------------------------------------------------------------------------

export const eventbriteTools: Anthropic.Tool[] = [
  {
    name: "eventbrite_list_events",
    description:
      "List the organization's Eventbrite events. Returns a slim list: id, name, start, end, status, url, and capacity for each event. Always call this first before referencing an event_id — never invent IDs.",
    input_schema: {
      type: "object" as const,
      properties: {
        status: {
          type: "string",
          description:
            "Filter by event status. Use 'live' for currently-published events, 'ended' for past events, 'all' for everything. Defaults to 'live,started,ended'.",
        },
      },
      required: [],
    },
  },
  {
    name: "eventbrite_get_event",
    description:
      "Get detailed information about a specific Eventbrite event, including description summary, start/end, venue, status, capacity, and ticket classes (name, cost, quantity total, quantity sold). Use after eventbrite_list_events to look up an event's ID.",
    input_schema: {
      type: "object" as const,
      properties: {
        event_id: {
          type: "string",
          description: "The Eventbrite event ID from a prior eventbrite_list_events call. Do not guess.",
        },
      },
      required: ["event_id"],
    },
  },
  {
    name: "eventbrite_list_attendees",
    description:
      "List attendees for a specific Eventbrite event. Returns a slim view: name, email, ticket class, status, and check-in state. Attendee emails are PII — use for context only, never bulk-export or auto-email. Capped at ~100 attendees per call.",
    input_schema: {
      type: "object" as const,
      properties: {
        event_id: {
          type: "string",
          description: "The Eventbrite event ID. Must come from eventbrite_list_events.",
        },
      },
      required: ["event_id"],
    },
  },
  {
    name: "eventbrite_event_sales_summary",
    description:
      "Get a ticket-sales summary for a specific Eventbrite event: total capacity, total tickets sold, percent sold, and a per-ticket-class breakdown (sold, total, gross revenue). Derived purely from the event's ticket classes — pure read/aggregation.",
    input_schema: {
      type: "object" as const,
      properties: {
        event_id: {
          type: "string",
          description: "The Eventbrite event ID. Must come from eventbrite_list_events.",
        },
      },
      required: ["event_id"],
    },
  },
];

// ---------------------------------------------------------------------------
// Tool executor
// ---------------------------------------------------------------------------

export async function executeEventbriteTool({
  name,
  input,
  orgId,
  serviceClient,
}: {
  name: string;
  input: Record<string, unknown>;
  orgId: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  serviceClient: SupabaseClient<any>;
}): Promise<{ content: string; is_error?: boolean }> {
  // --- Resolve credentials ---
  const { data: integrationRow, error: fetchError } = await serviceClient
    .from("integrations")
    .select("access_token_encrypted, config")
    .eq("org_id", orgId)
    .eq("type", "eventbrite")
    .eq("status", "active")
    .maybeSingle();

  if (fetchError) {
    console.error("[eventbrite-tool] DB error fetching integration row:", fetchError);
    return { content: "Failed to load Eventbrite credentials. Please try again.", is_error: true };
  }

  if (!integrationRow) {
    return { content: EVENTBRITE_NOT_CONNECTED, is_error: true };
  }

  const token = decryptIfEncrypted(
    integrationRow.access_token_encrypted as string | null,
    CRYPTO_LABEL_EVENTBRITE_TOKEN
  );

  if (!token) {
    return { content: EVENTBRITE_NOT_CONNECTED, is_error: true };
  }

  const config = (integrationRow.config ?? {}) as { organization_id?: string };
  const organizationId = config.organization_id;
  if (!organizationId) {
    return {
      content:
        "Eventbrite organization is missing from stored config. Please reconnect Eventbrite from Settings → Integrations.",
      is_error: true,
    };
  }

  // --- Dispatch ---
  try {
    switch (name) {
      case "eventbrite_list_events": {
        const statusFilter =
          input.status && typeof input.status === "string" && input.status !== "all"
            ? (input.status as string)
            : null;
        const params = new URLSearchParams({ order_by: "start_desc" });
        if (statusFilter) params.set("status", statusFilter);

        const data = (await eventbriteFetch(
          token,
          `/organizations/${encodeURIComponent(organizationId)}/events/?${params.toString()}`
        )) as {
          events: EventbriteEvent[];
          pagination?: { object_count?: number; has_more_items?: boolean };
        };

        const CAP = 50;
        const all = data.events ?? [];
        const events = all.slice(0, CAP);

        const slim = {
          total: data.pagination?.object_count ?? all.length,
          returned: events.length,
          has_more: all.length > CAP || data.pagination?.has_more_items === true,
          events: events.map((e) => ({
            id: e.id,
            name: e.name?.text ?? "(untitled)",
            start: e.start?.local ?? e.start?.utc ?? null,
            end: e.end?.local ?? e.end?.utc ?? null,
            status: e.status ?? null,
            url: e.url ?? null,
            capacity: e.capacity ?? null,
          })),
        };
        return { content: JSON.stringify(slim) };
      }

      case "eventbrite_get_event": {
        if (!input.event_id || typeof input.event_id !== "string") {
          return { content: "event_id is required.", is_error: true };
        }

        const event = (await eventbriteFetch(
          token,
          `/events/${encodeURIComponent(input.event_id)}/?expand=ticket_classes,venue`
        )) as EventbriteEvent;

        const slim = {
          id: event.id,
          name: event.name?.text ?? "(untitled)",
          summary: event.summary ?? event.description?.text?.slice(0, 500) ?? null,
          start: event.start?.local ?? event.start?.utc ?? null,
          end: event.end?.local ?? event.end?.utc ?? null,
          status: event.status ?? null,
          url: event.url ?? null,
          capacity: event.capacity ?? null,
          venue: event.venue
            ? {
                name: event.venue.name ?? null,
                address: event.venue.address?.localized_address_display ?? null,
              }
            : null,
          ticket_classes: (event.ticket_classes ?? []).map((tc) => ({
            name: tc.name ?? "(unnamed)",
            cost: tc.free ? "Free" : tc.cost?.display ?? null,
            quantity_total: tc.quantity_total ?? null,
            quantity_sold: tc.quantity_sold ?? null,
          })),
        };
        return { content: JSON.stringify(slim) };
      }

      case "eventbrite_list_attendees": {
        if (!input.event_id || typeof input.event_id !== "string") {
          return { content: "event_id is required.", is_error: true };
        }

        const data = (await eventbriteFetch(
          token,
          `/events/${encodeURIComponent(input.event_id)}/attendees/`
        )) as {
          attendees: Array<{
            profile?: { name?: string; email?: string };
            ticket_class_name?: string;
            status?: string;
            checked_in?: boolean;
          }>;
          pagination?: { object_count?: number; has_more_items?: boolean };
        };

        const CAP = 100;
        const all = data.attendees ?? [];
        const attendees = all.slice(0, CAP);

        const slim = {
          total: data.pagination?.object_count ?? all.length,
          returned: attendees.length,
          has_more: all.length > CAP || data.pagination?.has_more_items === true,
          attendees: attendees.map((a) => ({
            name: a.profile?.name ?? null,
            email: a.profile?.email ?? null,
            ticket_class_name: a.ticket_class_name ?? null,
            status: a.status ?? null,
            checked_in: a.checked_in ?? false,
          })),
        };
        return { content: JSON.stringify(slim) };
      }

      case "eventbrite_event_sales_summary": {
        if (!input.event_id || typeof input.event_id !== "string") {
          return { content: "event_id is required.", is_error: true };
        }

        const event = (await eventbriteFetch(
          token,
          `/events/${encodeURIComponent(input.event_id)}/?expand=ticket_classes`
        )) as EventbriteEvent;

        const ticketClasses = event.ticket_classes ?? [];

        let totalCapacity = 0;
        let totalSold = 0;
        let grossValue = 0;
        let currency: string | null = null;

        const byClass = ticketClasses.map((tc) => {
          const total = tc.quantity_total ?? 0;
          const sold = tc.quantity_sold ?? 0;
          const unitValue = tc.free ? 0 : (tc.cost?.value ?? 0) / 100; // Eventbrite cost.value is in minor units
          const gross = unitValue * sold;
          if (tc.cost?.currency) currency = tc.cost.currency;
          totalCapacity += total;
          totalSold += sold;
          grossValue += gross;
          return {
            name: tc.name ?? "(unnamed)",
            cost: tc.free ? "Free" : tc.cost?.display ?? null,
            quantity_total: total,
            quantity_sold: sold,
            percent_sold: total > 0 ? `${((sold / total) * 100).toFixed(1)}%` : null,
            gross: tc.free ? "Free" : gross.toFixed(2),
          };
        });

        // Prefer the event-level capacity when present; otherwise sum of ticket totals.
        const capacity = event.capacity ?? totalCapacity;

        const slim = {
          event_id: event.id,
          name: event.name?.text ?? "(untitled)",
          status: event.status ?? null,
          total_capacity: capacity,
          total_sold: totalSold,
          percent_sold: capacity > 0 ? `${((totalSold / capacity) * 100).toFixed(1)}%` : null,
          gross_revenue: currency ? `${grossValue.toFixed(2)} ${currency}` : grossValue.toFixed(2),
          ticket_classes: byClass,
        };
        return { content: JSON.stringify(slim) };
      }

      default:
        return { content: `Unknown Eventbrite tool: ${name}`, is_error: true };
    }
  } catch (err) {
    if (err instanceof EventbriteError) {
      return { content: err.message, is_error: true };
    }
    console.error(`[eventbrite-tool] Unexpected error in ${name}:`, err);
    return { content: "Unexpected error in Eventbrite operation.", is_error: true };
  }
}
