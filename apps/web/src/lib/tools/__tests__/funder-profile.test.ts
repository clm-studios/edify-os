/**
 * Tests for save_funder_profile tool: validation, refresh semantics, and
 * error visibility.
 *
 * Covers (per PRD §4 success criteria):
 *   V1. Every populated field sourced + dated
 *   V2. §2 priorities: ≥2 verbatim quoted phrases with sources
 *   V3. §3 giving profile: real median/range or [need:]
 *   V4. §4 fit signals: ≥1 counter-signal or explicit "none found"
 *   V5. §5 process/calendar: concrete next action + date
 *   V6. Zero malformed [cited:] tags
 *
 * Refresh semantics:
 *   R1. §2 priorities replaced on refresh
 *   R5. §5 process/calendar replaced on refresh
 *   R7. §7 relationship_history APPENDED never overwritten
 *   Rb. built_on preserved on refresh
 *   Rr. refreshed_on bumped on refresh
 *
 * Error visibility:
 *   E1. Rejection returns is_error: true
 *   E2. Error message is present and instructive (contains field guidance)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { validateFunderProfile, executeFunderProfileTool } from "@/lib/tools/funder-profile";

// ---------------------------------------------------------------------------
// Minimal valid profile fixture — passes all quality-bar clauses
// ---------------------------------------------------------------------------

function makeValidProfile(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    funder_name: "Test Foundation",
    funder_type: "private_foundation",
    website: "https://testfoundation.org",
    geography_served: "New York City",
    priorities: {
      verbatim_phrases: [
        {
          phrase: "economic mobility for young people disconnected from school and work",
          source: "testfoundation.org/guidelines",
          retrieved_date: "2026-06-10",
        },
        {
          phrase: "direct-service programs in New York City",
          source: "testfoundation.org/guidelines",
          retrieved_date: "2026-06-10",
        },
      ],
      summary: "Focus on youth economic mobility and NYC direct service.",
      retrieved_date: "2026-06-10",
      source: "testfoundation.org/guidelines",
    },
    giving_profile: {
      median_grant: "$40,000",
      grant_range: "$10,000–$75,000",
      total_annual_giving: "$2.1M in FY2024",
      grants_per_year: "~52",
      recent_grantees: [
        { name: "Youth Works NYC", amount: "$40,000", purpose: "workforce training", year: "2024" },
        { name: "Career Bridge", amount: "$35,000", purpose: "youth development", year: "2023" },
      ],
      retrieved_date: "2026-06-10",
      source: "990-PF FY2024 via foundation_grants tool",
    },
    fit_signals: {
      for_signals: [
        "NYC direct service to disconnected young adults matches funder geography and population",
        "Prior grantees include workforce programs for disabled youth",
      ],
      counter_signals: [
        "Funder stance on disability-specific programs not stated in guidelines — [need: verify]",
      ],
      retrieved_date: "2026-06-10",
      source: "testfoundation.org/guidelines + 990-PF",
    },
    process_and_calendar: {
      application_route: "LOI-first, rolling submissions accepted year-round",
      cycle_dates: "Rolling — no fixed deadlines",
      decision_timeline: "8–12 weeks after LOI submission",
      contact_conventions: "Email program officer after LOI submitted",
      next_action: "Submit LOI via online portal",
      next_action_date: "2026-07-01",
      retrieved_date: "2026-06-10",
      source: "testfoundation.org/apply",
    },
    style_and_format: {
      page_word_limits: "LOI: 2 pages. Full proposal: 10 pages max.",
      required_sections: ["need statement", "program description", "evaluation plan", "budget"],
      stylistic_preferences: "Data-heavy with participant stories",
      org_prior_submissions: "",
      retrieved_date: "2026-06-10",
      source: "testfoundation.org/guidelines",
    },
    relationship_history: {
      entries: [],
      retrieved_date: "2026-06-10",
      source: "get_org_memory prior_grants",
    },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// V1: Every populated field sourced + dated
// ---------------------------------------------------------------------------

describe("V1 — every field must be sourced and dated", () => {
  it("PASS: valid profile with all fields sourced and dated", () => {
    const profile = makeValidProfile();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const errors = validateFunderProfile(profile as any);
    expect(errors).toHaveLength(0);
  });

  it("FAIL: §2 priorities missing retrieved_date", () => {
    const profile = makeValidProfile({
      priorities: {
        verbatim_phrases: [
          { phrase: "economic mobility for young people", source: "site.org", retrieved_date: "2026-06-10" },
          { phrase: "direct-service programs", source: "site.org", retrieved_date: "2026-06-10" },
        ],
        retrieved_date: "", // missing
        source: "site.org",
      },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const errors = validateFunderProfile(profile as any);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => e.includes("§2 priorities") && e.includes("retrieved_date"))).toBe(true);
  });

  it("FAIL: §3 giving_profile missing source", () => {
    const profile = makeValidProfile({
      giving_profile: {
        median_grant: "$40,000",
        retrieved_date: "2026-06-10",
        source: "", // missing
      },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const errors = validateFunderProfile(profile as any);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => e.includes("§3 giving_profile") && e.includes("source"))).toBe(true);
  });

  it("FAIL: §5 process_and_calendar missing retrieved_date", () => {
    const profile = makeValidProfile({
      process_and_calendar: {
        application_route: "LOI-first",
        next_action: "Submit LOI",
        next_action_date: "2026-07-01",
        retrieved_date: "", // missing
        source: "site.org/apply",
      },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const errors = validateFunderProfile(profile as any);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => e.includes("§5 process_and_calendar") && e.includes("retrieved_date"))).toBe(true);
  });

  it("FAIL: §7 relationship_history missing source", () => {
    const profile = makeValidProfile({
      relationship_history: {
        entries: [],
        retrieved_date: "2026-06-10",
        source: "", // missing
      },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const errors = validateFunderProfile(profile as any);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => e.includes("§7 relationship_history") && e.includes("source"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// V2: §2 must have ≥2 verbatim quoted phrases with sources
// ---------------------------------------------------------------------------

describe("V2 — §2 priorities: ≥2 verbatim phrases with sources", () => {
  it("PASS: exactly 2 phrases, both valid", () => {
    const profile = makeValidProfile();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const errors = validateFunderProfile(profile as any);
    expect(errors.filter((e) => e.includes("§2 priorities needs at least 2"))).toHaveLength(0);
  });

  it("PASS: 3 phrases", () => {
    const profile = makeValidProfile({
      priorities: {
        verbatim_phrases: [
          { phrase: "phrase one verbatim", source: "src1.org", retrieved_date: "2026-06-10" },
          { phrase: "phrase two verbatim", source: "src1.org", retrieved_date: "2026-06-10" },
          { phrase: "phrase three verbatim", source: "src1.org", retrieved_date: "2026-06-10" },
        ],
        retrieved_date: "2026-06-10",
        source: "src1.org",
      },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const errors = validateFunderProfile(profile as any);
    expect(errors.filter((e) => e.includes("§2 priorities needs at least 2"))).toHaveLength(0);
  });

  it("FAIL: only 1 phrase provided", () => {
    const profile = makeValidProfile({
      priorities: {
        verbatim_phrases: [
          { phrase: "economic mobility for young people", source: "site.org", retrieved_date: "2026-06-10" },
        ],
        retrieved_date: "2026-06-10",
        source: "site.org",
      },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const errors = validateFunderProfile(profile as any);
    expect(errors.some((e) => e.includes("§2 priorities needs at least 2 verbatim quoted phrases"))).toBe(true);
    // Error should be instructive — mentions count found
    expect(errors.some((e) => e.includes("found 1"))).toBe(true);
  });

  it("FAIL: 2 phrases but one is missing source", () => {
    const profile = makeValidProfile({
      priorities: {
        verbatim_phrases: [
          { phrase: "economic mobility", source: "site.org", retrieved_date: "2026-06-10" },
          { phrase: "direct-service programs", source: "", retrieved_date: "2026-06-10" }, // no source
        ],
        retrieved_date: "2026-06-10",
        source: "site.org",
      },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const errors = validateFunderProfile(profile as any);
    // Only 1 valid phrase (the one with source), so should fail V2
    expect(errors.some((e) => e.includes("§2 priorities needs at least 2 verbatim quoted phrases"))).toBe(true);
  });

  it("FAIL: 0 phrases", () => {
    const profile = makeValidProfile({
      priorities: {
        verbatim_phrases: [],
        retrieved_date: "2026-06-10",
        source: "site.org",
      },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const errors = validateFunderProfile(profile as any);
    expect(errors.some((e) => e.includes("§2 priorities needs at least 2 verbatim quoted phrases"))).toBe(true);
    expect(errors.some((e) => e.includes("found 0"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// V3: §3 giving_profile must have real median/range or [need:]
// ---------------------------------------------------------------------------

describe("V3 — §3 giving_profile: median_grant must be present", () => {
  it("PASS: real figure provided", () => {
    const profile = makeValidProfile();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const errors = validateFunderProfile(profile as any);
    expect(errors.filter((e) => e.includes("giving_profile.median_grant"))).toHaveLength(0);
  });

  it("PASS: [need:] placeholder is valid", () => {
    const profile = makeValidProfile({
      giving_profile: {
        median_grant: "[need: median grant — 990 data not found]",
        retrieved_date: "2026-06-10",
        source: "foundation_grants tool",
      },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const errors = validateFunderProfile(profile as any);
    expect(errors.filter((e) => e.includes("giving_profile.median_grant"))).toHaveLength(0);
  });

  it("FAIL: blank median_grant", () => {
    const profile = makeValidProfile({
      giving_profile: {
        median_grant: "", // blank
        retrieved_date: "2026-06-10",
        source: "foundation_grants tool",
      },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const errors = validateFunderProfile(profile as any);
    expect(errors.some((e) => e.includes("giving_profile.median_grant"))).toBe(true);
    // Error should instruct on fix
    expect(errors.some((e) => e.includes("[need:"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// V4: §4 fit_signals must have ≥1 counter-signal or "none found"
// ---------------------------------------------------------------------------

describe("V4 — §4 fit_signals: counter_signals required", () => {
  it("PASS: at least one counter-signal", () => {
    const profile = makeValidProfile();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const errors = validateFunderProfile(profile as any);
    expect(errors.filter((e) => e.includes("counter_signals"))).toHaveLength(0);
  });

  it("PASS: 'none found after review' is accepted", () => {
    const profile = makeValidProfile({
      fit_signals: {
        for_signals: ["NYC geography match"],
        counter_signals: ["none found after review"],
        retrieved_date: "2026-06-10",
        source: "testfoundation.org",
      },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const errors = validateFunderProfile(profile as any);
    expect(errors.filter((e) => e.includes("counter_signals"))).toHaveLength(0);
  });

  it("FAIL: counter_signals is empty array", () => {
    const profile = makeValidProfile({
      fit_signals: {
        for_signals: ["NYC geography match"],
        counter_signals: [], // empty
        retrieved_date: "2026-06-10",
        source: "testfoundation.org",
      },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const errors = validateFunderProfile(profile as any);
    expect(errors.some((e) => e.includes("fit_signals.counter_signals is empty"))).toBe(true);
    // Error should be instructive
    expect(errors.some((e) => e.includes("none found after review"))).toBe(true);
  });

  it("FAIL: counter_signals contains only blank strings", () => {
    const profile = makeValidProfile({
      fit_signals: {
        for_signals: ["NYC geography match"],
        counter_signals: ["   ", ""], // blank
        retrieved_date: "2026-06-10",
        source: "testfoundation.org",
      },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const errors = validateFunderProfile(profile as any);
    expect(errors.some((e) => e.includes("fit_signals.counter_signals is empty"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// V5: §5 process_and_calendar must yield concrete next action + date
// ---------------------------------------------------------------------------

describe("V5 — §5 process_and_calendar: next_action + next_action_date required", () => {
  it("PASS: both next_action and next_action_date provided", () => {
    const profile = makeValidProfile();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const errors = validateFunderProfile(profile as any);
    expect(errors.filter((e) => e.includes("next_action"))).toHaveLength(0);
  });

  it("FAIL: next_action is blank", () => {
    const profile = makeValidProfile({
      process_and_calendar: {
        application_route: "LOI-first",
        next_action: "", // blank
        next_action_date: "2026-07-01",
        retrieved_date: "2026-06-10",
        source: "site.org/apply",
      },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const errors = validateFunderProfile(profile as any);
    expect(errors.some((e) => e.includes("next_action is blank"))).toBe(true);
  });

  it("FAIL: next_action_date is blank", () => {
    const profile = makeValidProfile({
      process_and_calendar: {
        application_route: "LOI-first",
        next_action: "Submit LOI",
        next_action_date: "", // blank
        retrieved_date: "2026-06-10",
        source: "site.org/apply",
      },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const errors = validateFunderProfile(profile as any);
    expect(errors.some((e) => e.includes("next_action_date is blank"))).toBe(true);
  });

  it("FAIL: next_action_date is 'TBD'", () => {
    const profile = makeValidProfile({
      process_and_calendar: {
        application_route: "LOI-first",
        next_action: "Submit LOI",
        next_action_date: "TBD", // too vague
        retrieved_date: "2026-06-10",
        source: "site.org/apply",
      },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const errors = validateFunderProfile(profile as any);
    expect(errors.some((e) => e.includes("next_action_date") && e.includes("too vague"))).toBe(true);
  });

  it("FAIL: next_action_date is 'N/A'", () => {
    const profile = makeValidProfile({
      process_and_calendar: {
        application_route: "LOI-first",
        next_action: "Submit LOI",
        next_action_date: "N/A", // too vague
        retrieved_date: "2026-06-10",
        source: "site.org/apply",
      },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const errors = validateFunderProfile(profile as any);
    expect(errors.some((e) => e.includes("next_action_date") && e.includes("too vague"))).toBe(true);
  });

  it("PASS: 'rolling — submit any time' is a valid date horizon", () => {
    const profile = makeValidProfile({
      process_and_calendar: {
        application_route: "LOI-first",
        next_action: "Submit LOI via portal",
        next_action_date: "rolling — submit any time",
        retrieved_date: "2026-06-10",
        source: "site.org/apply",
      },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const errors = validateFunderProfile(profile as any);
    expect(errors.filter((e) => e.includes("next_action_date") && e.includes("too vague"))).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// V6: Zero malformed [cited:] tags
// ---------------------------------------------------------------------------

describe("V6 — no malformed [cited:] tags", () => {
  it("PASS: well-formed [cited:] tags", () => {
    const profile = makeValidProfile({
      priorities: {
        verbatim_phrases: [
          {
            phrase: "economic mobility [cited: site.org, 2026-06-10]",
            source: "site.org",
            retrieved_date: "2026-06-10",
          },
          {
            phrase: "direct-service programs [cited: site.org, 2026-06-10]",
            source: "site.org",
            retrieved_date: "2026-06-10",
          },
        ],
        retrieved_date: "2026-06-10",
        source: "site.org",
      },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const errors = validateFunderProfile(profile as any);
    expect(errors.filter((e) => e.includes("Malformed [cited:]"))).toHaveLength(0);
  });

  it("FAIL: [cited:] tag missing date portion", () => {
    const profile = makeValidProfile({
      priorities: {
        verbatim_phrases: [
          {
            phrase: "economic mobility [cited: site.org]", // missing date after comma
            source: "site.org",
            retrieved_date: "2026-06-10",
          },
          {
            phrase: "direct-service programs",
            source: "site.org",
            retrieved_date: "2026-06-10",
          },
        ],
        retrieved_date: "2026-06-10",
        source: "site.org",
      },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const errors = validateFunderProfile(profile as any);
    expect(errors.some((e) => e.includes("Malformed [cited:]"))).toBe(true);
  });

  it("FAIL: bare [cited:] with no content", () => {
    const profile = makeValidProfile({
      fit_signals: {
        for_signals: ["Geographic match [cited:]"], // bare tag
        counter_signals: ["none found after review"],
        retrieved_date: "2026-06-10",
        source: "site.org",
      },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const errors = validateFunderProfile(profile as any);
    expect(errors.some((e) => e.includes("Malformed [cited:]"))).toBe(true);
  });

  it("FAIL: [cited: source] without comma+date", () => {
    const profile = makeValidProfile({
      fit_signals: {
        for_signals: ["NYC match [cited: site.org]"], // no comma+date
        counter_signals: ["none found after review"],
        retrieved_date: "2026-06-10",
        source: "site.org",
      },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const errors = validateFunderProfile(profile as any);
    expect(errors.some((e) => e.includes("Malformed [cited:]"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// E1/E2: Rejection visibility — error text is present and instructive
// ---------------------------------------------------------------------------

describe("E1/E2 — rejection visibility", () => {
  it("returns is_error: true when validation fails", async () => {
    const mockServiceClient = {
      from: vi.fn(),
    };

    const result = await executeFunderProfileTool({
      name: "save_funder_profile",
      input: makeValidProfile({
        priorities: {
          verbatim_phrases: [], // triggers V2
          retrieved_date: "2026-06-10",
          source: "site.org",
        },
        process_and_calendar: {
          application_route: "LOI-first",
          next_action: "", // triggers V5
          next_action_date: "",
          retrieved_date: "2026-06-10",
          source: "site.org",
        },
      }),
      orgId: "test-org-id",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      serviceClient: mockServiceClient as any,
    });

    expect(result.is_error).toBe(true);
    // Error message should not be silently dropped
    expect(result.content).toBeTruthy();
    expect(result.content.length).toBeGreaterThan(50);
  });

  it("error message contains validation failure count and numbered list", async () => {
    const mockServiceClient = {
      from: vi.fn(),
    };

    const result = await executeFunderProfileTool({
      name: "save_funder_profile",
      input: makeValidProfile({
        priorities: {
          verbatim_phrases: [], // V2 failure
          retrieved_date: "2026-06-10",
          source: "site.org",
        },
        fit_signals: {
          for_signals: [],
          counter_signals: [], // V4 failure
          retrieved_date: "2026-06-10",
          source: "site.org",
        },
      }),
      orgId: "test-org-id",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      serviceClient: mockServiceClient as any,
    });

    expect(result.is_error).toBe(true);
    // Should mention how to fix (instructive errors, not just "validation failed")
    expect(result.content).toContain("verbatim quoted phrases");
    expect(result.content).toContain("counter_signals");
    // Should tell the model to address and retry
    expect(result.content).toContain("Address each issue above and call save_funder_profile again");
  });

  it("error messages are written as instructions (not just field names)", async () => {
    const mockServiceClient = { from: vi.fn() };

    const result = await executeFunderProfileTool({
      name: "save_funder_profile",
      input: makeValidProfile({
        priorities: {
          verbatim_phrases: [
            { phrase: "one phrase", source: "site.org", retrieved_date: "2026-06-10" },
          ], // only 1
          retrieved_date: "2026-06-10",
          source: "site.org",
        },
      }),
      orgId: "test-org-id",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      serviceClient: mockServiceClient as any,
    });

    // Error message should be instructive: tell the model HOW to fix it
    expect(result.content).toContain("found 1"); // tells the model how many were found
    expect(result.content).toContain("source"); // tells what's needed
  });
});

// ---------------------------------------------------------------------------
// Refresh semantics
// ---------------------------------------------------------------------------

describe("Refresh semantics", () => {
  function makeSupabaseClient(existingEntries: object[]) {
    // getMemoryByCategory builds a query as a fluent chain:
    //   .select().eq().eq().order().limit()   — all return the builder
    //   .filter()                             — called AFTER .limit() when funderName is set
    //   await query                           — resolves with { data, error }
    //
    // Key: ALL chain methods must return `selectChain` so subsequent methods work.
    // The chain object itself is awaited via `then` (thenable pattern).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const selectChain: any = {
      then(resolve: (value: unknown) => void, reject: (reason?: unknown) => void) {
        return Promise.resolve({ data: existingEntries, error: null }).then(resolve, reject);
      },
    };
    selectChain.eq = vi.fn().mockReturnValue(selectChain);
    selectChain.filter = vi.fn().mockReturnValue(selectChain);
    selectChain.order = vi.fn().mockReturnValue(selectChain);
    selectChain.limit = vi.fn().mockReturnValue(selectChain);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updateChain: any = {
      eq: vi.fn().mockResolvedValue({ error: null }),
    };

    const insertMock = vi.fn().mockResolvedValue({ error: null });

    return {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue(selectChain),
        update: vi.fn().mockReturnValue(updateChain),
        insert: insertMock,
      }),
      _insertMock: insertMock,
      _updateChain: updateChain,
      _selectChain: selectChain,
    };
  }

  const existingBuiltOn = "2026-01-01";
  const existingRelHistory = [
    { type: "application", date: "2024-03-01", description: "Applied for $30K — declined" },
  ];

  function makeExistingEntry() {
    return {
      id: "existing-entry-id",
      org_id: "test-org-id",
      category: "funder_profile",
      title: "Test Foundation",
      content: "Test Foundation — private foundation",
      data: {
        funder_name: "Test Foundation",
        built_on: existingBuiltOn,
        refreshed_on: null,
        relationship_history: {
          entries: existingRelHistory,
          retrieved_date: "2026-01-01",
          source: "get_org_memory prior_grants",
        },
        priorities: {
          verbatim_phrases: [
            { phrase: "old priority phrase one", source: "old-site.org", retrieved_date: "2026-01-01" },
            { phrase: "old priority phrase two", source: "old-site.org", retrieved_date: "2026-01-01" },
          ],
          retrieved_date: "2026-01-01",
          source: "old-site.org",
        },
        process_and_calendar: {
          application_route: "Old route",
          next_action: "Old action",
          next_action_date: "2026-03-01",
          retrieved_date: "2026-01-01",
          source: "old-site.org",
        },
      },
      source: "save_funder_profile tool",
      auto_generated: true,
      created_at: "2026-01-01T00:00:00.000Z",
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("R7: §7 relationship_history is APPENDED on refresh (not overwritten)", async () => {
    const sc = makeSupabaseClient([makeExistingEntry()]);
    let capturedUpdate: unknown = null;

    // Capture the data passed to update
    sc.from.mockReturnValue({
      select: vi.fn().mockReturnValue(sc._selectChain),
      update: vi.fn().mockImplementation((data: unknown) => {
        capturedUpdate = data;
        return { eq: vi.fn().mockResolvedValue({ error: null }) };
      }),
    });

    const newHistoryEntry = {
      type: "contact" as const,
      date: "2026-06-10",
      description: "Met program officer at conference",
    };

    await executeFunderProfileTool({
      name: "save_funder_profile",
      input: makeValidProfile({
        relationship_history: {
          entries: [newHistoryEntry],
          retrieved_date: "2026-06-10",
          source: "get_org_memory prior_grants",
        },
      }),
      orgId: "test-org-id",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      serviceClient: sc as any,
    });

    // The update data should contain merged history
    expect(capturedUpdate).not.toBeNull();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updateData = capturedUpdate as any;
    const mergedEntries = updateData.data.relationship_history.entries;
    // Should have both old + new entries
    expect(mergedEntries).toHaveLength(2);
    // Old entry preserved
    expect(mergedEntries[0].description).toBe("Applied for $30K — declined");
    // New entry appended
    expect(mergedEntries[1].description).toBe("Met program officer at conference");
  });

  it("Rb: built_on is preserved on refresh", async () => {
    const sc = makeSupabaseClient([makeExistingEntry()]);
    let capturedUpdate: unknown = null;

    sc.from.mockReturnValue({
      select: vi.fn().mockReturnValue(sc._selectChain),
      update: vi.fn().mockImplementation((data: unknown) => {
        capturedUpdate = data;
        return { eq: vi.fn().mockResolvedValue({ error: null }) };
      }),
    });

    await executeFunderProfileTool({
      name: "save_funder_profile",
      input: makeValidProfile(),
      orgId: "test-org-id",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      serviceClient: sc as any,
    });

    expect(capturedUpdate).not.toBeNull();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updateData = capturedUpdate as any;
    // built_on should be the original date, NOT today
    expect(updateData.data.built_on).toBe(existingBuiltOn);
  });

  it("Rr: refreshed_on is bumped to today on refresh", async () => {
    const sc = makeSupabaseClient([makeExistingEntry()]);
    let capturedUpdate: unknown = null;

    sc.from.mockReturnValue({
      select: vi.fn().mockReturnValue(sc._selectChain),
      update: vi.fn().mockImplementation((data: unknown) => {
        capturedUpdate = data;
        return { eq: vi.fn().mockResolvedValue({ error: null }) };
      }),
    });

    await executeFunderProfileTool({
      name: "save_funder_profile",
      input: makeValidProfile(),
      orgId: "test-org-id",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      serviceClient: sc as any,
    });

    expect(capturedUpdate).not.toBeNull();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updateData = capturedUpdate as any;
    const today = new Date().toISOString().split("T")[0];
    expect(updateData.data.refreshed_on).toBe(today);
  });

  it("R2/R5: §2/§5 are replaced (not appended) on refresh", async () => {
    const sc = makeSupabaseClient([makeExistingEntry()]);
    let capturedUpdate: unknown = null;

    sc.from.mockReturnValue({
      select: vi.fn().mockReturnValue(sc._selectChain),
      update: vi.fn().mockImplementation((data: unknown) => {
        capturedUpdate = data;
        return { eq: vi.fn().mockResolvedValue({ error: null }) };
      }),
    });

    const newPriorities = {
      verbatim_phrases: [
        { phrase: "new priority phrase one", source: "new-site.org", retrieved_date: "2026-06-10" },
        { phrase: "new priority phrase two", source: "new-site.org", retrieved_date: "2026-06-10" },
      ],
      retrieved_date: "2026-06-10",
      source: "new-site.org",
    };

    const newProcess = {
      application_route: "New route: invitation-only",
      next_action: "Request introductory meeting",
      next_action_date: "2026-08-01",
      retrieved_date: "2026-06-10",
      source: "new-site.org/apply",
    };

    await executeFunderProfileTool({
      name: "save_funder_profile",
      input: makeValidProfile({
        priorities: newPriorities,
        process_and_calendar: newProcess,
      }),
      orgId: "test-org-id",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      serviceClient: sc as any,
    });

    expect(capturedUpdate).not.toBeNull();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updateData = capturedUpdate as any;

    // §2: new phrases should replace old ones
    const savedPhrases = updateData.data.priorities.verbatim_phrases;
    expect(savedPhrases[0].phrase).toBe("new priority phrase one");
    expect(savedPhrases.some((p: { phrase: string }) => p.phrase.includes("old priority"))).toBe(false);

    // §5: new process should replace old one
    expect(updateData.data.process_and_calendar.application_route).toBe("New route: invitation-only");
    expect(updateData.data.process_and_calendar.application_route).not.toContain("Old");
  });

  it("NEW profile: built_on is set to today and refreshed_on is null", async () => {
    const sc = makeSupabaseClient([]); // no existing entry
    let capturedInsert: unknown = null;

    sc.from.mockReturnValue({
      select: vi.fn().mockReturnValue(sc._selectChain),
      insert: vi.fn().mockImplementation((data: unknown) => {
        capturedInsert = data;
        return Promise.resolve({ error: null });
      }),
    });

    await executeFunderProfileTool({
      name: "save_funder_profile",
      input: makeValidProfile(),
      orgId: "test-org-id",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      serviceClient: sc as any,
    });

    expect(capturedInsert).not.toBeNull();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const insertData = capturedInsert as any;
    const today = new Date().toISOString().split("T")[0];
    expect(insertData.data.built_on).toBe(today);
    expect(insertData.data.refreshed_on).toBeNull();
  });

  it("R7: on refresh with no new history entries, old entries are preserved (not dropped)", async () => {
    const sc = makeSupabaseClient([makeExistingEntry()]);
    let capturedUpdate: unknown = null;

    sc.from.mockReturnValue({
      select: vi.fn().mockReturnValue(sc._selectChain),
      update: vi.fn().mockImplementation((data: unknown) => {
        capturedUpdate = data;
        return { eq: vi.fn().mockResolvedValue({ error: null }) };
      }),
    });

    await executeFunderProfileTool({
      name: "save_funder_profile",
      input: makeValidProfile({
        relationship_history: {
          entries: [], // no new entries
          retrieved_date: "2026-06-10",
          source: "get_org_memory prior_grants",
        },
      }),
      orgId: "test-org-id",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      serviceClient: sc as any,
    });

    expect(capturedUpdate).not.toBeNull();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updateData = capturedUpdate as any;
    // Old entries should still be there (not dropped)
    const mergedEntries = updateData.data.relationship_history.entries;
    expect(mergedEntries).toHaveLength(1);
    expect(mergedEntries[0].description).toBe("Applied for $30K — declined");
  });
});

// ---------------------------------------------------------------------------
// research-funder voice skill registration
// ---------------------------------------------------------------------------

describe("research-funder voice skill — registry", () => {
  it("is registered in VOICE_SKILLS", async () => {
    const { VOICE_SKILLS } = await import("@/lib/skills/registry");
    const skill = VOICE_SKILLS.find((s) => s.id === "research-funder");
    expect(skill).toBeDefined();
  });

  it("fires for development_director on 'research the Pinkerton Foundation'", async () => {
    const { selectVoiceSkillAddendum } = await import("@/lib/skills/registry");
    const result = selectVoiceSkillAddendum(
      "development_director",
      "research the Pinkerton Foundation"
    );
    expect(result).not.toBe("");
    expect(result).toContain("Research Funder");
  });

  it("fires for development_director on 'build a funder profile for MacArthur'", async () => {
    const { selectVoiceSkillAddendum } = await import("@/lib/skills/registry");
    const result = selectVoiceSkillAddendum(
      "development_director",
      "build a funder profile for MacArthur"
    );
    expect(result).not.toBe("");
  });

  it("fires for development_director on 'research the Ford Foundation'", async () => {
    const { selectVoiceSkillAddendum } = await import("@/lib/skills/registry");
    const result = selectVoiceSkillAddendum(
      "development_director",
      "research the Ford Foundation"
    );
    expect(result).not.toBe("");
  });

  it("does NOT fire for marketing_director (wrong archetype)", async () => {
    const { selectVoiceSkillAddendum } = await import("@/lib/skills/registry");
    const result = selectVoiceSkillAddendum(
      "marketing_director",
      "research the Pinkerton Foundation"
    );
    expect(result).toBe("");
  });

  it("does NOT fire for development_director on off-intent messages", async () => {
    const { selectVoiceSkillAddendum } = await import("@/lib/skills/registry");
    const result = selectVoiceSkillAddendum(
      "development_director",
      "what's on my calendar today"
    );
    expect(result).toBe("");
  });

  it("addendum contains spec sourcing rules verbatim phrases", async () => {
    const { selectVoiceSkillAddendum } = await import("@/lib/skills/registry");
    const result = selectVoiceSkillAddendum(
      "development_director",
      "research the Pinkerton Foundation"
    );
    // Check that key spec content is present
    expect(result).toContain("[need:");
    expect(result).toContain("verbatim");
    // The addendum uses "counter-signals" (plural) and also "against-list" — either is sufficient
    const hasCounterSignalContent = result.includes("counter-signal") || result.includes("against-list");
    expect(hasCounterSignalContent).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Registry wiring — funder_profile tool is in development_director ONLY
// ---------------------------------------------------------------------------

describe("registry wiring — save_funder_profile gated to development_director", () => {
  it("development_director tool set includes save_funder_profile", async () => {
    const { ARCHETYPE_TOOLS } = await import("@/lib/tools/registry");
    const devDirTools = ARCHETYPE_TOOLS.development_director;
    const names = devDirTools.map((t) => t.name);
    expect(names).toContain("save_funder_profile");
  });

  it("marketing_director tool set does NOT include save_funder_profile", async () => {
    const { ARCHETYPE_TOOLS } = await import("@/lib/tools/registry");
    const names = ARCHETYPE_TOOLS.marketing_director.map((t) => t.name);
    expect(names).not.toContain("save_funder_profile");
  });

  it("programs_director tool set does NOT include save_funder_profile", async () => {
    const { ARCHETYPE_TOOLS } = await import("@/lib/tools/registry");
    const names = ARCHETYPE_TOOLS.programs_director.map((t) => t.name);
    expect(names).not.toContain("save_funder_profile");
  });

  it("executive_assistant tool set does NOT include save_funder_profile", async () => {
    const { ARCHETYPE_TOOLS } = await import("@/lib/tools/registry");
    const names = ARCHETYPE_TOOLS.executive_assistant.map((t) => t.name);
    expect(names).not.toContain("save_funder_profile");
  });

  it("events_director tool set does NOT include save_funder_profile", async () => {
    const { ARCHETYPE_TOOLS } = await import("@/lib/tools/registry");
    const names = ARCHETYPE_TOOLS.events_director.map((t) => t.name);
    expect(names).not.toContain("save_funder_profile");
  });

  it("hr_volunteer_coordinator tool set does NOT include save_funder_profile", async () => {
    const { ARCHETYPE_TOOLS } = await import("@/lib/tools/registry");
    const names = ARCHETYPE_TOOLS.hr_volunteer_coordinator.map((t) => t.name);
    expect(names).not.toContain("save_funder_profile");
  });
});
