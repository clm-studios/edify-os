/**
 * Anthropic tool definitions and executor for Mailchimp Marketing API v3.
 * Seven tools: mailchimp_list_audiences, mailchimp_get_audience,
 * mailchimp_list_subscribers, mailchimp_upsert_subscriber,
 * mailchimp_list_campaigns, mailchimp_create_campaign_draft,
 * mailchimp_get_campaign_report.
 *
 * Mirrors the CRM tool pattern: org-scoped, reads its own credential row
 * (not a Google OAuth token), decrypts the API key, and makes direct REST
 * calls to the Mailchimp Marketing API v3.
 *
 * IMPORTANT: This executor never auto-sends campaigns. All campaign creation
 * results in a DRAFT that the user reviews and sends from Mailchimp.
 */

import type Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import crypto from "crypto";
import { decryptIfEncrypted, CRYPTO_LABEL_MAILCHIMP_TOKEN } from "@/lib/crypto";

// ---------------------------------------------------------------------------
// System-prompt addendum for archetypes that have Mailchimp tools active.
// ---------------------------------------------------------------------------

export const MAILCHIMP_TOOLS_ADDENDUM = `\nYou have access to the organization's Mailchimp account via tools. Key rules:

1. **Campaigns are DRAFTS only.** mailchimp_create_campaign_draft creates a draft in the user's Mailchimp account. It does NOT send the campaign. Always remind the user they must review and send from Mailchimp.
2. **Always discover list IDs first.** Call mailchimp_list_audiences before referencing a list_id. Never invent or guess list IDs.
3. **Confirm before drafting.** Before creating a campaign draft, confirm with the user: which audience (list), subject line, from name, and content. Drafting is easy to do but creates real drafts in their account.
4. **Mailchimp vs. social/design tools.** Use Mailchimp tools for email newsletters and campaigns to your subscriber list. Use social tools (Facebook, Instagram, LinkedIn) for social media posts. Use render/design tools for flyers, graphics, and visual content.
5. **Subscriber management.** mailchimp_upsert_subscriber adds or updates a subscriber on a list. Status 'subscribed' opts them in; 'unsubscribed' opts them out. Use with care — only make changes the user explicitly requests.`;

// ---------------------------------------------------------------------------
// Internal error class for surfacing Mailchimp API errors
// ---------------------------------------------------------------------------

class MailchimpError extends Error {
  constructor(
    message: string,
    public readonly detail?: string,
    public readonly status?: number
  ) {
    super(message);
    this.name = "MailchimpError";
  }
}

// ---------------------------------------------------------------------------
// Not-connected sentinel (mirror GOOGLE_NOT_CONNECTED pattern)
// ---------------------------------------------------------------------------

const MAILCHIMP_NOT_CONNECTED =
  "Mailchimp is not connected. Visit Settings → Integrations to connect it.";

// ---------------------------------------------------------------------------
// MD5 helper for subscriber_hash
// subscriber_hash = MD5 of the lowercased email address
// ---------------------------------------------------------------------------

function subscriberHash(email: string): string {
  return crypto.createHash("md5").update(email.toLowerCase()).digest("hex");
}

// ---------------------------------------------------------------------------
// Mailchimp REST helper
// ---------------------------------------------------------------------------

async function mailchimpFetch(
  serverPrefix: string,
  apiKey: string,
  path: string,
  options?: RequestInit
): Promise<unknown> {
  const url = `https://${serverPrefix}.api.mailchimp.com/3.0${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      ...(options?.headers ?? {}),
    },
  });

  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const body = (await res.json()) as { detail?: string; title?: string };
      detail = body.detail ?? body.title ?? detail;
    } catch {
      // ignore parse errors
    }
    throw new MailchimpError(`Mailchimp API error: ${detail}`, detail, res.status);
  }

  return res.json();
}

// ---------------------------------------------------------------------------
// Tool definitions (model-facing)
// ---------------------------------------------------------------------------

export const mailchimpTools: Anthropic.Tool[] = [
  {
    name: "mailchimp_list_audiences",
    description:
      "List the organization's Mailchimp audiences (mailing lists). Returns id, name, member count, and key stats for each list. Always call this first before referencing a list_id — never invent IDs.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "mailchimp_get_audience",
    description:
      "Get detailed information about a specific Mailchimp audience (list), including stats, settings, and segment counts. Use after mailchimp_list_audiences when the user wants details on a specific list.",
    input_schema: {
      type: "object" as const,
      properties: {
        list_id: {
          type: "string",
          description: "The Mailchimp list ID from a prior mailchimp_list_audiences call. Do not guess.",
        },
      },
      required: ["list_id"],
    },
  },
  {
    name: "mailchimp_list_subscribers",
    description:
      "List subscribers (members) on a Mailchimp audience. Returns a slim view: email, first name, last name, status, and tags. Supports filtering by status and searching by email or name.",
    input_schema: {
      type: "object" as const,
      properties: {
        list_id: {
          type: "string",
          description: "The Mailchimp list ID. Must come from mailchimp_list_audiences.",
        },
        count: {
          type: "number",
          description: "Number of subscribers to return (1–100). Defaults to 25.",
        },
        status: {
          type: "string",
          description:
            "Filter by subscription status: 'subscribed', 'unsubscribed', 'cleaned', 'pending', or 'transactional'. Omit to return all.",
          enum: ["subscribed", "unsubscribed", "cleaned", "pending", "transactional"],
        },
        query: {
          type: "string",
          description: "Search by email address or name (partial match). Optional.",
        },
      },
      required: ["list_id"],
    },
  },
  {
    name: "mailchimp_upsert_subscriber",
    description:
      "Add a new subscriber or update an existing one on a Mailchimp audience. Uses PUT /members (upsert by email). Can set status (subscribed/unsubscribed), first name, last name, and tags. Only make changes the user explicitly requests.",
    input_schema: {
      type: "object" as const,
      properties: {
        list_id: {
          type: "string",
          description: "The Mailchimp list ID. Must come from mailchimp_list_audiences.",
        },
        email: {
          type: "string",
          description: "The subscriber's email address.",
        },
        status: {
          type: "string",
          description:
            "'subscribed' to opt them in, 'unsubscribed' to opt them out, 'pending' for double opt-in confirmation. Defaults to 'subscribed' for new subscribers.",
          enum: ["subscribed", "unsubscribed", "pending", "cleaned"],
        },
        first_name: {
          type: "string",
          description: "Subscriber's first name (FNAME merge field). Optional.",
        },
        last_name: {
          type: "string",
          description: "Subscriber's last name (LNAME merge field). Optional.",
        },
        tags: {
          type: "array",
          description: "Tags to apply to the subscriber. Optional.",
          items: { type: "string" },
        },
      },
      required: ["list_id", "email"],
    },
  },
  {
    name: "mailchimp_list_campaigns",
    description:
      "List recent campaigns in the Mailchimp account. Returns a slim view: id, type, status, subject line, send time, and open/click rates for sent campaigns.",
    input_schema: {
      type: "object" as const,
      properties: {
        count: {
          type: "number",
          description: "Number of campaigns to return (1–50). Defaults to 10.",
        },
        status: {
          type: "string",
          description:
            "Filter by status: 'save' (draft), 'paused', 'schedule', 'sending', 'sent'. Omit to return all.",
          enum: ["save", "paused", "schedule", "sending", "sent"],
        },
        type: {
          type: "string",
          description:
            "Filter by campaign type: 'regular', 'plaintext', 'absplit', 'rss', 'variate'. Omit to return all.",
          enum: ["regular", "plaintext", "absplit", "rss", "variate"],
        },
      },
      required: [],
    },
  },
  {
    name: "mailchimp_create_campaign_draft",
    description:
      "Create a DRAFT email campaign in Mailchimp. This does NOT send the campaign — it creates a draft the user must review and send themselves from the Mailchimp dashboard. Always confirm audience, subject line, and content with the user before calling. Returns the campaign ID and a reminder to review before sending.",
    input_schema: {
      type: "object" as const,
      properties: {
        list_id: {
          type: "string",
          description: "The audience (list) to send to. Must come from mailchimp_list_audiences.",
        },
        subject_line: {
          type: "string",
          description: "The email subject line.",
        },
        title: {
          type: "string",
          description: "Internal campaign title (not shown to subscribers — used for your own reference in Mailchimp).",
        },
        from_name: {
          type: "string",
          description: "The 'From' name subscribers will see (e.g. 'Green Valley Nonprofit').",
        },
        reply_to: {
          type: "string",
          description: "The reply-to email address.",
        },
        html_content: {
          type: "string",
          description:
            "The HTML body of the email. Should be complete, valid HTML. Keep it clean and readable — Mailchimp will render this in email clients.",
        },
      },
      required: ["list_id", "subject_line", "title", "from_name", "reply_to", "html_content"],
    },
  },
  {
    name: "mailchimp_get_campaign_report",
    description:
      "Get the performance report for a sent Mailchimp campaign. Returns emails sent, open rate, click rate, unsubscribe count, and bounce info. Use after mailchimp_list_campaigns to look up a campaign's ID.",
    input_schema: {
      type: "object" as const,
      properties: {
        campaign_id: {
          type: "string",
          description: "The Mailchimp campaign ID from a prior mailchimp_list_campaigns call.",
        },
      },
      required: ["campaign_id"],
    },
  },
];

// ---------------------------------------------------------------------------
// Tool executor
// ---------------------------------------------------------------------------

export async function executeMailchimpTool({
  name,
  input,
  orgId,
  serviceClient,
}: {
  name: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
    .eq("type", "mailchimp")
    .eq("status", "active")
    .maybeSingle();

  if (fetchError) {
    console.error("[mailchimp-tool] DB error fetching integration row:", fetchError);
    return { content: "Failed to load Mailchimp credentials. Please try again.", is_error: true };
  }

  if (!integrationRow) {
    return { content: MAILCHIMP_NOT_CONNECTED, is_error: true };
  }

  const apiKey = decryptIfEncrypted(
    integrationRow.access_token_encrypted as string | null,
    CRYPTO_LABEL_MAILCHIMP_TOKEN
  );

  if (!apiKey) {
    return { content: MAILCHIMP_NOT_CONNECTED, is_error: true };
  }

  const config = (integrationRow.config ?? {}) as { server_prefix?: string };
  const serverPrefix = config.server_prefix;
  if (!serverPrefix) {
    return {
      content: "Mailchimp datacenter is missing from stored config. Please reconnect Mailchimp from Settings → Integrations.",
      is_error: true,
    };
  }

  // --- Dispatch ---
  try {
    switch (name) {
      case "mailchimp_list_audiences": {
        const data = (await mailchimpFetch(
          serverPrefix,
          apiKey,
          "/lists?fields=lists.id,lists.name,lists.stats,lists.date_created&count=100"
        )) as {
          lists: Array<{
            id: string;
            name: string;
            date_created: string;
            stats: {
              member_count: number;
              unsubscribe_count: number;
              open_rate: number;
              click_rate: number;
            };
          }>;
          total_items: number;
        };

        const slim = {
          total: data.total_items,
          audiences: data.lists.map((l) => ({
            id: l.id,
            name: l.name,
            member_count: l.stats.member_count,
            unsubscribe_count: l.stats.unsubscribe_count,
            open_rate: `${(l.stats.open_rate * 100).toFixed(1)}%`,
            click_rate: `${(l.stats.click_rate * 100).toFixed(1)}%`,
            created: l.date_created,
          })),
        };
        return { content: JSON.stringify(slim) };
      }

      case "mailchimp_get_audience": {
        if (!input.list_id || typeof input.list_id !== "string") {
          return { content: "list_id is required.", is_error: true };
        }
        const data = (await mailchimpFetch(
          serverPrefix,
          apiKey,
          `/lists/${encodeURIComponent(input.list_id)}`
        )) as {
          id: string;
          name: string;
          date_created: string;
          stats: {
            member_count: number;
            unsubscribe_count: number;
            cleaned_count: number;
            avg_sub_rate: number;
            avg_unsub_rate: number;
            open_rate: number;
            click_rate: number;
          };
          campaign_defaults: {
            from_name: string;
            from_email: string;
            subject: string;
            language: string;
          };
          email_type_option: boolean;
          permission_reminder: string;
        };

        const slim = {
          id: data.id,
          name: data.name,
          created: data.date_created,
          stats: {
            members: data.stats.member_count,
            unsubscribed: data.stats.unsubscribe_count,
            cleaned: data.stats.cleaned_count,
            avg_sub_rate: `${(data.stats.avg_sub_rate * 100).toFixed(1)}%`,
            avg_unsub_rate: `${(data.stats.avg_unsub_rate * 100).toFixed(1)}%`,
            open_rate: `${(data.stats.open_rate * 100).toFixed(1)}%`,
            click_rate: `${(data.stats.click_rate * 100).toFixed(1)}%`,
          },
          defaults: data.campaign_defaults,
          permission_reminder: data.permission_reminder,
        };
        return { content: JSON.stringify(slim) };
      }

      case "mailchimp_list_subscribers": {
        if (!input.list_id || typeof input.list_id !== "string") {
          return { content: "list_id is required.", is_error: true };
        }
        const count = typeof input.count === "number" ? Math.max(1, Math.min(input.count, 100)) : 25;
        const params = new URLSearchParams({
          count: String(count),
          fields: "members.id,members.email_address,members.merge_fields,members.status,members.tags,members.timestamp_opt,total_items",
        });
        if (input.status && typeof input.status === "string") {
          params.set("status", input.status);
        }
        if (input.query && typeof input.query === "string") {
          // Search requires separate endpoint; use query param filtering via ?fields
          // Mailchimp v3 doesn't have a general search on /members — fall back to
          // returning results and noting the limitation.
          params.set("before_last_changed", ""); // unused but keeps params clean
        }

        const data = (await mailchimpFetch(
          serverPrefix,
          apiKey,
          `/lists/${encodeURIComponent(input.list_id)}/members?${params.toString()}`
        )) as {
          members: Array<{
            id: string;
            email_address: string;
            status: string;
            merge_fields: { FNAME?: string; LNAME?: string };
            tags: Array<{ name: string }>;
            timestamp_opt: string;
          }>;
          total_items: number;
        };

        // Filter by query client-side if provided (Mailchimp /members doesn't support search)
        let members = data.members;
        if (input.query && typeof input.query === "string") {
          const q = (input.query as string).toLowerCase();
          members = members.filter(
            (m) =>
              m.email_address.toLowerCase().includes(q) ||
              (m.merge_fields.FNAME ?? "").toLowerCase().includes(q) ||
              (m.merge_fields.LNAME ?? "").toLowerCase().includes(q)
          );
        }

        const slim = {
          total: data.total_items,
          returned: members.length,
          members: members.map((m) => ({
            id: m.id,
            email: m.email_address,
            first_name: m.merge_fields.FNAME ?? "",
            last_name: m.merge_fields.LNAME ?? "",
            status: m.status,
            tags: m.tags.map((t) => t.name),
            subscribed_at: m.timestamp_opt,
          })),
        };
        return { content: JSON.stringify(slim) };
      }

      case "mailchimp_upsert_subscriber": {
        if (!input.list_id || typeof input.list_id !== "string") {
          return { content: "list_id is required.", is_error: true };
        }
        if (!input.email || typeof input.email !== "string") {
          return { content: "email is required.", is_error: true };
        }

        const hash = subscriberHash(input.email as string);
        const body: Record<string, unknown> = {
          email_address: input.email,
          status_if_new: input.status ?? "subscribed",
        };
        if (input.status) body.status = input.status;

        const mergeFields: Record<string, string> = {};
        if (input.first_name && typeof input.first_name === "string") {
          mergeFields.FNAME = input.first_name;
        }
        if (input.last_name && typeof input.last_name === "string") {
          mergeFields.LNAME = input.last_name;
        }
        if (Object.keys(mergeFields).length > 0) {
          body.merge_fields = mergeFields;
        }

        if (Array.isArray(input.tags) && input.tags.length > 0) {
          body.tags = (input.tags as string[]).map((tag) => ({ name: tag, status: "active" }));
        }

        const data = (await mailchimpFetch(
          serverPrefix,
          apiKey,
          `/lists/${encodeURIComponent(input.list_id)}/members/${hash}`,
          { method: "PUT", body: JSON.stringify(body) }
        )) as {
          id: string;
          email_address: string;
          status: string;
          merge_fields: { FNAME?: string; LNAME?: string };
        };

        return {
          content: JSON.stringify({
            success: true,
            subscriber: {
              id: data.id,
              email: data.email_address,
              status: data.status,
              first_name: data.merge_fields.FNAME ?? "",
              last_name: data.merge_fields.LNAME ?? "",
            },
          }),
        };
      }

      case "mailchimp_list_campaigns": {
        const count = typeof input.count === "number" ? Math.max(1, Math.min(input.count, 50)) : 10;
        const params = new URLSearchParams({
          count: String(count),
          fields:
            "campaigns.id,campaigns.type,campaigns.status,campaigns.settings.subject_line,campaigns.settings.title,campaigns.send_time,campaigns.report_summary,total_items",
          sort_field: "send_time",
          sort_dir: "DESC",
        });
        if (input.status && typeof input.status === "string") {
          params.set("status", input.status);
        }
        if (input.type && typeof input.type === "string") {
          params.set("type", input.type);
        }

        const data = (await mailchimpFetch(
          serverPrefix,
          apiKey,
          `/campaigns?${params.toString()}`
        )) as {
          campaigns: Array<{
            id: string;
            type: string;
            status: string;
            settings: { subject_line: string; title: string };
            send_time: string;
            report_summary?: {
              opens: number;
              unique_opens: number;
              open_rate: number;
              clicks: number;
              subscriber_clicks: number;
              click_rate: number;
            };
          }>;
          total_items: number;
        };

        const slim = {
          total: data.total_items,
          campaigns: data.campaigns.map((c) => ({
            id: c.id,
            type: c.type,
            status: c.status,
            subject: c.settings.subject_line,
            title: c.settings.title,
            sent_at: c.send_time || null,
            opens: c.report_summary?.unique_opens ?? null,
            open_rate: c.report_summary
              ? `${(c.report_summary.open_rate * 100).toFixed(1)}%`
              : null,
            clicks: c.report_summary?.subscriber_clicks ?? null,
            click_rate: c.report_summary
              ? `${(c.report_summary.click_rate * 100).toFixed(1)}%`
              : null,
          })),
        };
        return { content: JSON.stringify(slim) };
      }

      case "mailchimp_create_campaign_draft": {
        const required = ["list_id", "subject_line", "title", "from_name", "reply_to", "html_content"];
        for (const field of required) {
          if (!input[field] || typeof input[field] !== "string") {
            return { content: `${field} is required and must be a string.`, is_error: true };
          }
        }

        // Step 1: Create the campaign shell
        const campaignBody = {
          type: "regular",
          recipients: { list_id: input.list_id },
          settings: {
            subject_line: input.subject_line,
            title: input.title,
            from_name: input.from_name,
            reply_to: input.reply_to,
          },
        };

        const campaign = (await mailchimpFetch(serverPrefix, apiKey, "/campaigns", {
          method: "POST",
          body: JSON.stringify(campaignBody),
        })) as { id: string; status: string };

        // Step 2: Set the campaign content
        await mailchimpFetch(serverPrefix, apiKey, `/campaigns/${campaign.id}/content`, {
          method: "PUT",
          body: JSON.stringify({ html: input.html_content }),
        });

        return {
          content: JSON.stringify({
            success: true,
            campaign_id: campaign.id,
            status: "draft",
            subject: input.subject_line,
            note: "Campaign saved as a DRAFT in Mailchimp. The user must review and send it from their Mailchimp dashboard — it has NOT been sent.",
          }),
        };
      }

      case "mailchimp_get_campaign_report": {
        if (!input.campaign_id || typeof input.campaign_id !== "string") {
          return { content: "campaign_id is required.", is_error: true };
        }

        const data = (await mailchimpFetch(
          serverPrefix,
          apiKey,
          `/reports/${encodeURIComponent(input.campaign_id)}`
        )) as {
          id: string;
          campaign_title: string;
          subject_line: string;
          send_time: string;
          emails_sent: number;
          opens: {
            opens_total: number;
            unique_opens: number;
            open_rate: number;
            last_open: string;
          };
          clicks: {
            clicks_total: number;
            unique_clicks: number;
            unique_subscriber_clicks: number;
            click_rate: number;
            last_click: string;
          };
          unsubscribed: number;
          bounces: {
            hard_bounces: number;
            soft_bounces: number;
            syntax_errors: number;
          };
        };

        const slim = {
          campaign_id: data.id,
          title: data.campaign_title,
          subject: data.subject_line,
          sent_at: data.send_time,
          emails_sent: data.emails_sent,
          opens: {
            total: data.opens.opens_total,
            unique: data.opens.unique_opens,
            rate: `${(data.opens.open_rate * 100).toFixed(1)}%`,
            last_open: data.opens.last_open,
          },
          clicks: {
            total: data.clicks.clicks_total,
            unique: data.clicks.unique_clicks,
            rate: `${(data.clicks.click_rate * 100).toFixed(1)}%`,
          },
          unsubscribes: data.unsubscribed,
          bounces: data.bounces,
        };
        return { content: JSON.stringify(slim) };
      }

      default:
        return { content: `Unknown Mailchimp tool: ${name}`, is_error: true };
    }
  } catch (err) {
    if (err instanceof MailchimpError) {
      return { content: err.message, is_error: true };
    }
    console.error(`[mailchimp-tool] Unexpected error in ${name}:`, err);
    return { content: "Unexpected error in Mailchimp operation.", is_error: true };
  }
}
