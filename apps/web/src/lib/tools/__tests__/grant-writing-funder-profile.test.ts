/**
 * Tests for draft_grant_content funder-profile injection (PR-B — read side).
 *
 * Covers (per PRD §4 read-path criteria):
 *
 * I1. Injection with profile present: funder profile block appears in
 *     systemBlocks, positioned in Block-2 (uncached — after the cached
 *     sectionPrompt block with cache_control: ephemeral).
 * I2. Without profile: drafting proceeds unchanged + one-line suggestion
 *     appended to draft result.
 * S1. Staleness flag — profile older than 6 months: STALE warning appears
 *     in the serialized block.
 * S2. Staleness flag — deadline/cycle fields older than 90 days: per-section
 *     STALE warning appears.
 * SR. Serializer output shape: key sections present, [cited: funder_profile]
 *     tags present.
 * VP. Citation validator pass-through: [cited: funder_profile] tags in draft
 *     text survive the annotation step unchanged.
 *
 * Block-2 evidence:
 *   In executeDraftGrantContent, systemBlocks[0] is the sectionPrompt with
 *   cache_control: ephemeral (Block-1/cached). systemBlocks[1] is the
 *   substrate (uncached). systemBlocks[2] is the funder profile block
 *   (uncached, injected here — Block-2). systemBlocks[3] is the draft
 *   instruction (uncached). No cache_control on blocks 1–3.
 *
 * File: apps/web/src/lib/tools/__tests__/grant-writing-funder-profile.test.ts
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import {
  serializeFunderProfileForPrompt,
  checkFunderProfileStaleness,
} from "@/lib/memory/get-by-category";
import type { MemoryEntryRow } from "@/lib/memory/get-by-category";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** Build a minimal MemoryEntryRow for a funder_profile entry */
function makeFunderProfileEntry(
  overrides: Partial<Record<string, unknown>> = {},
  dataOverrides: Partial<Record<string, unknown>> = {}
): MemoryEntryRow {
  const today = new Date().toISOString().split("T")[0];
  return {
    id: "fp-test-id",
    org_id: "org-test-id",
    category: "funder_profile",
    title: "Test Foundation",
    content: "Test Foundation — private foundation\nGeography: New York City",
    source: "save_funder_profile tool",
    auto_generated: true,
    created_at: `${today}T00:00:00.000Z`,
    data: {
      funder_name: "Test Foundation",
      funder_type: "private_foundation",
      website: "https://testfoundation.org",
      geography_served: "New York City",
      ein: "12-3456789",
      built_on: today,
      refreshed_on: null,
      aliases: [],
      priorities: {
        verbatim_phrases: [
          {
            phrase: "economic mobility for young people disconnected from school and work",
            source: "testfoundation.org/guidelines",
            retrieved_date: today,
          },
          {
            phrase: "direct-service programs in New York City",
            source: "testfoundation.org/guidelines",
            retrieved_date: today,
          },
        ],
        summary: "Focus on youth economic mobility and NYC direct service.",
        retrieved_date: today,
        source: "testfoundation.org/guidelines",
      },
      giving_profile: {
        median_grant: "$40,000",
        grant_range: "$10,000–$75,000",
        total_annual_giving: "$2.1M in FY2024",
        grants_per_year: "~52",
        multi_year_tendency: "primarily one-time",
        recent_grantees: [
          { name: "Youth Works NYC", amount: "$40,000", purpose: "workforce training", year: "2024" },
          { name: "Career Bridge", amount: "$35,000", purpose: "youth development", year: "2023" },
        ],
        retrieved_date: today,
        source: "990-PF FY2024 via foundation_grants tool",
      },
      fit_signals: {
        for_signals: [
          "NYC direct service to disconnected young adults matches funder geography and population",
        ],
        counter_signals: [
          "Funder stance on disability-specific programs not stated in guidelines",
        ],
        retrieved_date: today,
        source: "testfoundation.org/guidelines + 990-PF",
      },
      process_and_calendar: {
        application_route: "LOI-first, rolling",
        cycle_dates: "Rolling — no fixed deadlines",
        decision_timeline: "8–12 weeks",
        next_action: "Submit LOI via online portal",
        next_action_date: "2026-07-01",
        retrieved_date: today,
        source: "testfoundation.org/apply",
      },
      style_and_format: {
        page_word_limits: "LOI: 2 pages. Full proposal: 10 pages.",
        required_sections: ["need statement", "program description", "evaluation plan"],
        stylistic_preferences: "Data-heavy with participant stories",
        org_prior_submissions: "",
        retrieved_date: today,
        source: "testfoundation.org/guidelines",
      },
      relationship_history: {
        entries: [
          {
            type: "application",
            date: "2024-03-01",
            description: "Applied for $30K workforce grant — declined",
          },
        ],
        retrieved_date: today,
        source: "get_org_memory prior_grants",
      },
      ...dataOverrides,
    },
    ...overrides,
  } as MemoryEntryRow;
}

// ---------------------------------------------------------------------------
// SR. Serializer output shape
// ---------------------------------------------------------------------------

describe("SR — serializeFunderProfileForPrompt output shape", () => {
  it("includes funder name in the block header", () => {
    const entry = makeFunderProfileEntry();
    const result = serializeFunderProfileForPrompt(entry);
    expect(result).toContain("Test Foundation");
  });

  it("includes §2 verbatim phrases with citation tags", () => {
    const entry = makeFunderProfileEntry();
    const result = serializeFunderProfileForPrompt(entry);
    expect(result).toContain("economic mobility for young people disconnected from school and work");
    expect(result).toContain("[cited: funder_profile]");
  });

  it("includes §3 giving profile data", () => {
    const entry = makeFunderProfileEntry();
    const result = serializeFunderProfileForPrompt(entry);
    expect(result).toContain("$40,000");
    expect(result).toContain("median grant");
  });

  it("includes §4 fit for-signals and counter-signals", () => {
    const entry = makeFunderProfileEntry();
    const result = serializeFunderProfileForPrompt(entry);
    expect(result).toContain("FOR this org");
    expect(result).toContain("COUNTER-SIGNALS");
  });

  it("includes §5 process and next action", () => {
    const entry = makeFunderProfileEntry();
    const result = serializeFunderProfileForPrompt(entry);
    expect(result).toContain("LOI-first");
    expect(result).toContain("Submit LOI via online portal");
  });

  it("includes §6 style/format constraints", () => {
    const entry = makeFunderProfileEntry();
    const result = serializeFunderProfileForPrompt(entry);
    expect(result).toContain("LOI: 2 pages");
  });

  it("includes §7 relationship history when entries exist", () => {
    const entry = makeFunderProfileEntry();
    const result = serializeFunderProfileForPrompt(entry);
    expect(result).toContain("Relationship history");
    expect(result).toContain("Applied for $30K workforce grant — declined");
  });

  it("shows 'first approach' when no relationship history", () => {
    const entry = makeFunderProfileEntry({}, {
      relationship_history: {
        entries: [],
        retrieved_date: new Date().toISOString().split("T")[0],
        source: "get_org_memory prior_grants",
      },
    });
    const result = serializeFunderProfileForPrompt(entry);
    expect(result).toContain("first approach");
  });

  it("includes the how-to-use instruction block", () => {
    const entry = makeFunderProfileEntry();
    const result = serializeFunderProfileForPrompt(entry);
    expect(result).toContain("How to use this profile");
  });

  it("contains [cited: funder_profile] tags on every main section", () => {
    const entry = makeFunderProfileEntry();
    const result = serializeFunderProfileForPrompt(entry);
    // At least 5 occurrences across all sections
    const matches = result.match(/\[cited: funder_profile\]/g) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(5);
  });
});

// ---------------------------------------------------------------------------
// S1 & S2. Staleness flags
// ---------------------------------------------------------------------------

describe("S1 — staleness: profile older than 6 months", () => {
  it("checkFunderProfileStaleness: profileStale = false when built today", () => {
    const today = new Date();
    const data = { built_on: today.toISOString().split("T")[0], refreshed_on: null };
    const result = checkFunderProfileStaleness(data, today);
    expect(result.profileStale).toBe(false);
  });

  it("checkFunderProfileStaleness: profileStale = true when built 7 months ago", () => {
    const today = new Date("2026-06-10");
    const sevenMonthsAgo = new Date("2025-11-10");
    const data = { built_on: sevenMonthsAgo.toISOString().split("T")[0], refreshed_on: null };
    const result = checkFunderProfileStaleness(data, today);
    expect(result.profileStale).toBe(true);
  });

  it("uses refreshed_on over built_on for staleness when present", () => {
    const today = new Date("2026-06-10");
    const data = {
      built_on: "2025-01-01", // very old
      refreshed_on: "2026-05-10", // recent refresh
    };
    const result = checkFunderProfileStaleness(data, today);
    // refreshed_on is recent — should NOT be stale
    expect(result.profileStale).toBe(false);
  });

  it("serializer includes STALE warning header for profile older than 6 months", () => {
    const today = new Date("2026-06-10");
    const sevenMonthsAgo = "2025-11-10";
    const entry = makeFunderProfileEntry({}, {
      built_on: sevenMonthsAgo,
      refreshed_on: null,
    });
    const result = serializeFunderProfileForPrompt(entry, today);
    expect(result).toContain("STALE PROFILE");
    expect(result).toContain("Surface this staleness to the user");
  });

  it("serializer does NOT include STALE profile warning for fresh profile", () => {
    const today = new Date("2026-06-10");
    const entry = makeFunderProfileEntry({}, {
      built_on: "2026-06-01",
      refreshed_on: null,
    });
    const result = serializeFunderProfileForPrompt(entry, today);
    expect(result).not.toContain("STALE PROFILE");
  });
});

describe("S2 — staleness: deadline/cycle fields older than 90 days", () => {
  it("checkFunderProfileStaleness: deadlineFieldsStale = false when retrieved 30 days ago", () => {
    const today = new Date("2026-06-10");
    const thirtyDaysAgo = "2026-05-11";
    const data = {
      built_on: today.toISOString().split("T")[0],
      process_and_calendar: { retrieved_date: thirtyDaysAgo },
    };
    const result = checkFunderProfileStaleness(data, today);
    expect(result.deadlineFieldsStale).toBe(false);
  });

  it("checkFunderProfileStaleness: deadlineFieldsStale = true when retrieved 100 days ago", () => {
    const today = new Date("2026-06-10");
    const hundredDaysAgo = new Date("2026-03-01");
    const data = {
      built_on: today.toISOString().split("T")[0],
      process_and_calendar: { retrieved_date: hundredDaysAgo.toISOString().split("T")[0] },
    };
    const result = checkFunderProfileStaleness(data, today);
    expect(result.deadlineFieldsStale).toBe(true);
  });

  it("serializer includes deadline STALE warning on §5 process section when >90 days old", () => {
    const today = new Date("2026-06-10");
    const oldDate = "2026-02-01"; // ~129 days ago from 2026-06-10
    const entry = makeFunderProfileEntry({}, {
      built_on: today.toISOString().split("T")[0],
      refreshed_on: null,
      process_and_calendar: {
        application_route: "LOI-first, rolling",
        cycle_dates: "Rolling",
        next_action: "Submit LOI",
        next_action_date: "2026-07-01",
        retrieved_date: oldDate,
        source: "testfoundation.org/apply",
      },
    });
    const result = serializeFunderProfileForPrompt(entry, today);
    expect(result).toContain("STALE DEADLINE");
    expect(result).toContain("VERIFY BEFORE ADVISING");
  });

  it("serializer does NOT include deadline STALE warning for fresh deadline data", () => {
    const today = new Date("2026-06-10");
    const entry = makeFunderProfileEntry({}, {
      built_on: today.toISOString().split("T")[0],
      refreshed_on: null,
      process_and_calendar: {
        application_route: "LOI-first, rolling",
        cycle_dates: "Rolling",
        next_action: "Submit LOI",
        next_action_date: "2026-07-01",
        retrieved_date: "2026-06-01", // fresh
        source: "testfoundation.org/apply",
      },
    });
    const result = serializeFunderProfileForPrompt(entry, today);
    expect(result).not.toContain("STALE DEADLINE");
  });

  it("serializer shows both STALE warnings when both horizons exceeded", () => {
    const today = new Date("2026-06-10");
    const entry = makeFunderProfileEntry({}, {
      built_on: "2025-11-01", // >6 months
      refreshed_on: null,
      process_and_calendar: {
        application_route: "LOI-first",
        next_action: "Submit LOI",
        next_action_date: "rolling",
        retrieved_date: "2026-01-01", // >90 days from 2026-06-10
        source: "testfoundation.org/apply",
      },
    });
    const result = serializeFunderProfileForPrompt(entry, today);
    expect(result).toContain("STALE PROFILE");
    expect(result).toContain("STALE DEADLINE");
  });
});

// ---------------------------------------------------------------------------
// VP. Citation validator pass-through for [cited: funder_profile]
// ---------------------------------------------------------------------------

// Shared CITATION_RE — mirrors the constant in grant-writing-handlers.ts.
// Kept here so VP tests exercise the same regex logic without importing
// the unexported constant.
const CITATION_RE = /\[cited:[^\]]+\]|\[\w[\w-]*\]|\[\d+\]/;

describe("VP — citation validator pass-through for [cited: funder_profile]", () => {
  // Tests verify that CITATION_RE correctly recognises [cited: funder_profile]
  // and [cited: <source>, <date>] tags so that numbers adjacent to funder-cited
  // figures pass the citation validator clean (no [?] annotation).

  it("serializeFunderProfileForPrompt output contains [cited: funder_profile] tags", () => {
    // The serialized block contains these tags in the system prompt.
    // They survive through to the model context unchanged.
    const entry = makeFunderProfileEntry();
    const result = serializeFunderProfileForPrompt(entry);
    expect(result).toContain("[cited: funder_profile]");
  });

  it("CITATION_RE matches [cited: funder_profile]", () => {
    // After PR-C: the updated regex DOES match [cited: funder_profile].
    // Numbers adjacent to this tag must pass clean — no [?] annotation.
    const citationTag = "[cited: funder_profile]";
    const hasCitation = CITATION_RE.test(citationTag);
    expect(hasCitation).toBe(true);
  });

  it("CITATION_RE matches [cited: <source>, <date>] full form", () => {
    const fullCitedTag = "[cited: 990-PF FY2024 via foundation_grants, 2026-01-15]";
    expect(CITATION_RE.test(fullCitedTag)).toBe(true);
  });

  it("numbers adjacent to [cited: funder_profile] pass clean — no [?] annotation", () => {
    // Core spec-conformance assertion: a figure with a nearby [cited: funder_profile]
    // tag must NOT receive a [?] (missing citation) annotation.
    const mockDraft = 'Their median grant is $40,000 [cited: funder_profile]. They fund ~52 grants per year [cited: funder_profile].';

    const annotated = mockDraft.replace(
      /\b(\d{2,}(?:[,]\d{3})*(?:\.\d+)?%?)\b/g,
      (match: string, _num: string, offset: number) => {
        const clean = match.replace(/[,%]/g, "");
        if (clean.length === 4 && (clean.startsWith("19") || clean.startsWith("20"))) return match;
        const window = mockDraft.slice(Math.max(0, offset - 80), offset + 80);
        const hasCitation = CITATION_RE.test(window);
        if (!hasCitation) return `${match} [?] _(missing citation)_`;
        return match;
      }
    );

    // [?] must NOT appear — the figures are cited
    expect(annotated).not.toContain("[?]");
    // [cited: funder_profile] tags survive intact in the output
    expect(annotated).toContain("[cited: funder_profile]");
  });

  it("genuinely uncited figure still gets [?] annotation (negative case)", () => {
    // A number with NO citation tag in its 80-char window must still be flagged.
    const mockDraftUncited = 'We serve 250 youth annually. Our budget is $180,000.';

    const annotated = mockDraftUncited.replace(
      /\b(\d{2,}(?:[,]\d{3})*(?:\.\d+)?%?)\b/g,
      (match: string, _num: string, offset: number) => {
        const clean = match.replace(/[,%]/g, "");
        if (clean.length === 4 && (clean.startsWith("19") || clean.startsWith("20"))) return match;
        const window = mockDraftUncited.slice(Math.max(0, offset - 80), offset + 80);
        const hasCitation = CITATION_RE.test(window);
        if (!hasCitation) return `${match} [?] _(missing citation)_`;
        return match;
      }
    );

    // Both figures are uncited — both must be annotated
    expect(annotated).toContain("250 [?]");
    expect(annotated).toContain("180,000 [?]");
  });
});

// ---------------------------------------------------------------------------
// I1. Injection with profile present — Block-2 placement
// ---------------------------------------------------------------------------

describe("I1 — draft_grant_content injects profile in Block-2 (uncached)", () => {
  // We test the systemBlocks structure built by executeDraftGrantContent
  // by mocking the Anthropic client and capturing the system argument.

  // Minimal Anthropic mock
  function makeAnthropicMock(): {
    anthropic: { messages: { create: ReturnType<typeof vi.fn> } };
    capturedSystemBlocks: () => Anthropic.TextBlockParam[] | null;
  } {
    let captured: Anthropic.TextBlockParam[] | null = null;
    const createMock = vi.fn().mockImplementation(
      ({ system }: { system: Anthropic.TextBlockParam[] }) => {
        captured = system;
        return Promise.resolve({
          content: [{ type: "text", text: "Drafted content for the test." }],
          usage: { input_tokens: 100, output_tokens: 50, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
          stop_reason: "end_turn",
        });
      }
    );
    return {
      anthropic: { messages: { create: createMock } } as unknown as { messages: { create: ReturnType<typeof vi.fn> } },
      capturedSystemBlocks: () => captured,
    };
  }

  // Supabase mock — returns profile entries when the query targets category="funder_profile",
  // empty arrays for all other categories (prior_grants, outcomes, voice_samples, overlays).
  //
  // Detection strategy: getMemoryByCategory calls .eq("category", category). We intercept
  // the second .eq() call (first is org_id) to check if it's "funder_profile".
  function makeServiceClient(profileEntries: object[]) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    function makeChain(dataFn: () => object[]): any {
      let eqCallCount = 0;
      let isFunderProfileQuery = false;

      const chain: Record<string, unknown> = {
        then(resolve: (v: unknown) => void, reject: (r?: unknown) => void) {
          const data = isFunderProfileQuery ? dataFn() : [];
          return Promise.resolve({ data, error: null }).then(resolve, reject);
        },
      };
      chain.select = vi.fn().mockReturnValue(chain);
      chain.eq = vi.fn().mockImplementation((_col: string, val: unknown) => {
        eqCallCount++;
        // The second .eq() call is .eq("category", category)
        if (eqCallCount === 2 && val === "funder_profile") {
          isFunderProfileQuery = true;
        }
        return chain;
      });
      chain.filter = vi.fn().mockReturnValue(chain);
      chain.order = vi.fn().mockReturnValue(chain);
      chain.limit = vi.fn().mockReturnValue(chain);
      return chain;
    }

    return {
      from: vi.fn().mockImplementation((table: string) => {
        if (table !== "memory_entries") return makeChain(() => []);
        return makeChain(() => profileEntries);
      }),
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("Block-1 is the section prompt with cache_control: ephemeral", async () => {
    const { executeDraftGrantContent } = await import("@/lib/tools/grant-writing-handlers");
    const { anthropic, capturedSystemBlocks } = makeAnthropicMock();
    const profileEntry = makeFunderProfileEntry();
    const sc = makeServiceClient([profileEntry]);

    await executeDraftGrantContent({
      input: { content_type: "loi", funder_name: "Test Foundation" },
      orgId: "org-id",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      serviceClient: sc as any,
      anthropic: anthropic as unknown as import("@anthropic-ai/sdk").default,
    });

    const blocks = capturedSystemBlocks();
    expect(blocks).not.toBeNull();
    // Block-1 (index 0) must have cache_control
    expect(blocks![0]).toHaveProperty("cache_control");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((blocks![0] as any).cache_control?.type).toBe("ephemeral");
  });

  it("funder profile block appears in systemBlocks and has NO cache_control (Block-2)", async () => {
    const { executeDraftGrantContent } = await import("@/lib/tools/grant-writing-handlers");
    const { anthropic, capturedSystemBlocks } = makeAnthropicMock();
    const profileEntry = makeFunderProfileEntry();
    const sc = makeServiceClient([profileEntry]);

    await executeDraftGrantContent({
      input: { content_type: "loi", funder_name: "Test Foundation" },
      orgId: "org-id",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      serviceClient: sc as any,
      anthropic: anthropic as unknown as import("@anthropic-ai/sdk").default,
    });

    const blocks = capturedSystemBlocks();
    expect(blocks).not.toBeNull();

    // Find the block containing the funder profile content
    const profileBlock = blocks!.find(
      (b) => b.type === "text" && b.text.includes("Funder profile:")
    );
    expect(profileBlock).toBeDefined();
    // The funder profile block must NOT have cache_control (Block-2 = uncached)
    expect(profileBlock).not.toHaveProperty("cache_control");
  });

  it("funder profile block appears AFTER Block-1 (cached) and BEFORE the draft instruction", async () => {
    const { executeDraftGrantContent } = await import("@/lib/tools/grant-writing-handlers");
    const { anthropic, capturedSystemBlocks } = makeAnthropicMock();
    const profileEntry = makeFunderProfileEntry();
    const sc = makeServiceClient([profileEntry]);

    await executeDraftGrantContent({
      input: { content_type: "loi", funder_name: "Test Foundation" },
      orgId: "org-id",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      serviceClient: sc as any,
      anthropic: anthropic as unknown as import("@anthropic-ai/sdk").default,
    });

    const blocks = capturedSystemBlocks();
    expect(blocks).not.toBeNull();

    const profileIdx = blocks!.findIndex(
      (b) => b.type === "text" && b.text.includes("Funder profile:")
    );
    const draftInstrIdx = blocks!.findIndex(
      (b) => b.type === "text" && b.text.includes("Draft the")
    );
    const cachedIdx = 0; // Block-1 is always index 0

    expect(profileIdx).toBeGreaterThan(cachedIdx);
    expect(profileIdx).toBeLessThan(draftInstrIdx);
  });

  it("funder profile block contains [cited: funder_profile] tags", async () => {
    const { executeDraftGrantContent } = await import("@/lib/tools/grant-writing-handlers");
    const { anthropic, capturedSystemBlocks } = makeAnthropicMock();
    const profileEntry = makeFunderProfileEntry();
    const sc = makeServiceClient([profileEntry]);

    await executeDraftGrantContent({
      input: { content_type: "loi", funder_name: "Test Foundation" },
      orgId: "org-id",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      serviceClient: sc as any,
      anthropic: anthropic as unknown as import("@anthropic-ai/sdk").default,
    });

    const blocks = capturedSystemBlocks();
    const profileBlock = blocks!.find(
      (b) => b.type === "text" && b.text.includes("Funder profile:")
    );
    expect(profileBlock?.text).toContain("[cited: funder_profile]");
  });

  it("draft instruction mentions [cited: funder_profile] citation convention", async () => {
    const { executeDraftGrantContent } = await import("@/lib/tools/grant-writing-handlers");
    const { anthropic, capturedSystemBlocks } = makeAnthropicMock();
    const profileEntry = makeFunderProfileEntry();
    const sc = makeServiceClient([profileEntry]);

    await executeDraftGrantContent({
      input: { content_type: "loi", funder_name: "Test Foundation" },
      orgId: "org-id",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      serviceClient: sc as any,
      anthropic: anthropic as unknown as import("@anthropic-ai/sdk").default,
    });

    const blocks = capturedSystemBlocks();
    const draftInstrBlock = blocks!.find(
      (b) => b.type === "text" && b.text.includes("Draft the")
    );
    expect(draftInstrBlock?.text).toContain("[cited: funder_profile]");
  });
});

// ---------------------------------------------------------------------------
// I2. Without profile — unchanged behavior + suggestion line
// ---------------------------------------------------------------------------

describe("I2 — no funder profile: drafting proceeds + suggestion appended", () => {
  function makeServiceClientNoProfile() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const makeChain = (data: object[]): any => {
      const chain: Record<string, unknown> = {
        then(resolve: (v: unknown) => void, reject: (r?: unknown) => void) {
          return Promise.resolve({ data, error: null }).then(resolve, reject);
        },
      };
      chain.select = vi.fn().mockReturnValue(chain);
      chain.eq = vi.fn().mockReturnValue(chain);
      chain.filter = vi.fn().mockReturnValue(chain);
      chain.order = vi.fn().mockReturnValue(chain);
      chain.limit = vi.fn().mockReturnValue(chain);
      return chain;
    };

    return {
      from: vi.fn().mockReturnValue(makeChain([])), // all queries return empty
    };
  }

  function makeAnthropicMock() {
    let capturedBlocks: Anthropic.TextBlockParam[] | null = null;
    const createMock = vi.fn().mockImplementation(
      ({ system }: { system: Anthropic.TextBlockParam[] }) => {
        capturedBlocks = system;
        return Promise.resolve({
          content: [{ type: "text", text: "Drafted content without funder profile." }],
          usage: { input_tokens: 80, output_tokens: 40 },
          stop_reason: "end_turn",
        });
      }
    );
    return {
      anthropic: { messages: { create: createMock } },
      capturedSystemBlocks: () => capturedBlocks,
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("no funder profile block in systemBlocks when funder has no saved profile", async () => {
    const { executeDraftGrantContent } = await import("@/lib/tools/grant-writing-handlers");
    const { anthropic, capturedSystemBlocks } = makeAnthropicMock();
    const sc = makeServiceClientNoProfile();

    await executeDraftGrantContent({
      input: { content_type: "loi", funder_name: "Unknown Funder" },
      orgId: "org-id",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      serviceClient: sc as any,
      anthropic: anthropic as unknown as import("@anthropic-ai/sdk").default,
    });

    const blocks = capturedSystemBlocks();
    const profileBlock = blocks!.find(
      (b) => b.type === "text" && b.text.includes("Funder profile:")
    );
    expect(profileBlock).toBeUndefined();
  });

  it("result contains the no-profile suggestion when funder name is provided but profile missing", async () => {
    const { executeDraftGrantContent } = await import("@/lib/tools/grant-writing-handlers");
    const { anthropic } = makeAnthropicMock();
    const sc = makeServiceClientNoProfile();

    const result = await executeDraftGrantContent({
      input: { content_type: "loi", funder_name: "Unknown Funder" },
      orgId: "org-id",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      serviceClient: sc as any,
      anthropic: anthropic as unknown as import("@anthropic-ai/sdk").default,
    });

    expect(result.is_error).toBeFalsy();
    expect(result.content).toContain("No funder profile found");
    expect(result.content).toContain("research_funder workflow");
    expect(result.content).toContain("save_funder_profile tool");
  });

  it("result does NOT contain suggestion when no funder_name passed", async () => {
    const { executeDraftGrantContent } = await import("@/lib/tools/grant-writing-handlers");
    const { anthropic } = makeAnthropicMock();
    const sc = makeServiceClientNoProfile();

    const result = await executeDraftGrantContent({
      input: { content_type: "statement_of_need" },
      orgId: "org-id",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      serviceClient: sc as any,
      anthropic: anthropic as unknown as import("@anthropic-ai/sdk").default,
    });

    expect(result.is_error).toBeFalsy();
    expect(result.content).not.toContain("No funder profile found");
  });

  it("drafting still produces output when profile is missing (unchanged behavior)", async () => {
    const { executeDraftGrantContent } = await import("@/lib/tools/grant-writing-handlers");
    const { anthropic } = makeAnthropicMock();
    const sc = makeServiceClientNoProfile();

    const result = await executeDraftGrantContent({
      input: { content_type: "loi", funder_name: "Unknown Funder" },
      orgId: "org-id",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      serviceClient: sc as any,
      anthropic: anthropic as unknown as import("@anthropic-ai/sdk").default,
    });

    expect(result.is_error).toBeFalsy();
    // Draft content should be present
    expect(result.content).toContain("Drafted content without funder profile");
  });
});
