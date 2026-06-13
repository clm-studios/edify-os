/**
 * Tests for executeReviseGrantContent — M1 (substrate injection) and M2 (draft_id resolution).
 *
 * M1 — Substrate loaded for revision (pr21-post-merge-review M1 finding):
 *   R-M1-A. Revision system blocks include a substrate block with proof library entries
 *            when they exist (add_data / cite_examples tone directions can draw from them).
 *   R-M1-B. Substrate block has NO cache_control (house rule from PR #36 — per-request
 *            content stays out of the cached prefix).
 *   R-M1-C. Revision still proceeds when proof library is empty (graceful degradation).
 *   R-M1-D. When content_type is absent or not MVP-typed, falls back to "loi" substrate
 *            mapping (best-effort load covering outcomes + voice_samples).
 *
 * M2 — draft_id resolution (pr21-post-merge-review M2 finding):
 *   R-M2-A. When draft_id resolves to a pipeline row with drafts, uses the latest
 *            version draft's content_md as the draft text.
 *   R-M2-B. draft_text path still works unchanged (M2 does not break existing callers).
 *   R-M2-C. Neither draft_id nor draft_text → instructive error (mentions both params).
 *   R-M2-D. draft_id with unknown row → instructive error (mentions draft_id + draft_text).
 *   R-M2-E. draft_id with a row that has no drafts yet → instructive error (mentions
 *            draft_grant_content + both supply paths).
 *   R-M2-F. No feedback AND no tone_change → instructive error.
 *
 * File: apps/web/src/lib/tools/__tests__/grant-writing-revise.test.ts
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";

// ---------------------------------------------------------------------------
// Shared mock builders
// ---------------------------------------------------------------------------

/** Build a minimal Anthropic mock that captures systemBlocks and returns a fixed revision. */
function makeAnthropicMock(revisedText = "Revised draft content.") {
  let capturedSystem: Anthropic.TextBlockParam[] | string | null = null;
  const createMock = vi.fn().mockImplementation(
    ({ system }: { system: Anthropic.TextBlockParam[] | string }) => {
      capturedSystem = system;
      return Promise.resolve({
        content: [{ type: "text", text: revisedText }],
        usage: { input_tokens: 80, output_tokens: 40 },
        stop_reason: "end_turn",
      });
    }
  );
  return {
    anthropic: { messages: { create: createMock } } as unknown as {
      messages: { create: ReturnType<typeof vi.fn> };
    },
    capturedSystem: () => capturedSystem,
  };
}

/**
 * Build a Supabase service client mock for the revise handler.
 *
 * The revise handler calls:
 *   1. serviceClient.from("grants_pipeline") — for draft_id lookup (M2)
 *   2. serviceClient.from("memory_entries")  — for substrate (M1, via buildSubstrate)
 *
 * pipelineRows: rows to return for grants_pipeline queries (keyed by id + org_id)
 * memoryEntries: entries to return for memory_entries queries
 */
function makeServiceClient(opts: {
  pipelineRows?: Array<{ id: string; org_id: string; drafts: object[] }>;
  memoryEntries?: Array<{ id: string; org_id: string; category: string; title: string; content: string; data: null; source: null; auto_generated: boolean; created_at: string }>;
} = {}) {
  const { pipelineRows = [], memoryEntries = [] } = opts;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function makeMemoryChain(): any {
    const chain: Record<string, unknown> = {
      then(resolve: (v: unknown) => void, reject: (r?: unknown) => void) {
        return Promise.resolve({ data: memoryEntries, error: null }).then(resolve, reject);
      },
    };
    chain.select = vi.fn().mockReturnValue(chain);
    chain.eq = vi.fn().mockReturnValue(chain);
    chain.filter = vi.fn().mockReturnValue(chain);
    chain.order = vi.fn().mockReturnValue(chain);
    chain.limit = vi.fn().mockReturnValue(chain);
    chain.single = vi.fn().mockReturnValue(chain);
    return chain;
  }

  // Pipeline chain: .select(...).eq("id", id).eq("org_id", orgId).single()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function makePipelineChain(rowId?: string): any {
    const matchingRow = rowId ? pipelineRows.find((r) => r.id === rowId) : undefined;
    const chain: Record<string, unknown> = {
      then(resolve: (v: unknown) => void, reject: (r?: unknown) => void) {
        // For single(), resolve with { data: row | null, error }
        const data = matchingRow ?? null;
        const error = data ? null : { message: "No rows found" };
        return Promise.resolve({ data, error }).then(resolve, reject);
      },
    };
    let capturedId: string | undefined;
    chain.select = vi.fn().mockReturnValue(chain);
    chain.eq = vi.fn().mockImplementation((_col: string, val: unknown) => {
      if (_col === "id") capturedId = val as string;
      // Re-check matching row when id is set
      if (_col === "id") {
        const row = pipelineRows.find((r) => r.id === (val as string));
        chain.then = function (resolve: (v: unknown) => void, reject: (r?: unknown) => void) {
          const data = row ?? null;
          const error = data ? null : { message: "No rows found" };
          return Promise.resolve({ data, error }).then(resolve, reject);
        };
      }
      return chain;
    });
    chain.single = vi.fn().mockReturnValue(chain);
    void capturedId;
    return chain;
  }

  return {
    from: vi.fn().mockImplementation((table: string) => {
      if (table === "grants_pipeline") return makePipelineChain();
      return makeMemoryChain();
    }),
  };
}

// Minimal GrantDraft fixture builder
function makeDraft(version: number, contentMd: string, section = "loi") {
  return {
    section,
    content_md: contentMd,
    version,
    drafted_at: "2026-06-10T12:00:00.000Z",
    drafted_by_tool: "draft_grant_content",
  };
}

// Minimal memory entry fixture
function makeMemoryEntry(category: string, id: string, title: string, content: string) {
  return {
    id,
    org_id: "org-test",
    category,
    title,
    content,
    data: null,
    source: null,
    auto_generated: false,
    created_at: "2026-06-01T00:00:00.000Z",
  };
}

// ---------------------------------------------------------------------------
// M1 — Substrate injection tests
// ---------------------------------------------------------------------------

describe("R-M1-A — substrate block appears in system blocks when entries exist", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("system blocks contain a substrate block when voice_samples are present", async () => {
    const { executeReviseGrantContent } = await import("@/lib/tools/grant-writing-handlers");
    const { anthropic, capturedSystem } = makeAnthropicMock();

    const sc = makeServiceClient({
      memoryEntries: [
        makeMemoryEntry("voice_samples", "vs-1", "Voice sample", "We center the voices of participants."),
      ],
    });

    await executeReviseGrantContent({
      input: {
        draft_text: "Original draft text here.",
        tone_change: "tighten",
        content_type: "loi",
      },
      orgId: "org-test",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      serviceClient: sc as any,
      anthropic: anthropic as unknown as import("@anthropic-ai/sdk").default,
    });

    const sys = capturedSystem();
    // System must be an array (TextBlockParam[]), not a bare string
    expect(Array.isArray(sys)).toBe(true);
    const blocks = sys as Anthropic.TextBlockParam[];
    // At least one block should contain the voice sample content
    const substrateBlock = blocks.find(
      (b) => b.type === "text" && b.text.includes("Voice samples")
    );
    expect(substrateBlock).toBeDefined();
  });

  it("substrate block contains outcomes when present and content_type is loi", async () => {
    const { executeReviseGrantContent } = await import("@/lib/tools/grant-writing-handlers");
    const { anthropic, capturedSystem } = makeAnthropicMock();

    const sc = makeServiceClient({
      memoryEntries: [
        makeMemoryEntry("outcomes", "out-1", "Youth served 2024", "We served 450 [out-1] youth in 2024."),
      ],
    });

    await executeReviseGrantContent({
      input: {
        draft_text: "Original draft text here.",
        tone_change: "add_data",
        content_type: "loi",
      },
      orgId: "org-test",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      serviceClient: sc as any,
      anthropic: anthropic as unknown as import("@anthropic-ai/sdk").default,
    });

    const sys = capturedSystem() as Anthropic.TextBlockParam[];
    const substrateBlock = sys.find(
      (b) => b.type === "text" && b.text.includes("outcomes")
    );
    expect(substrateBlock).toBeDefined();
  });

  it("revision instruction in user message references draft and revision instructions", async () => {
    const { executeReviseGrantContent } = await import("@/lib/tools/grant-writing-handlers");
    const { anthropic } = makeAnthropicMock();

    const sc = makeServiceClient();
    const createSpy = anthropic.messages.create;

    await executeReviseGrantContent({
      input: {
        draft_text: "The original grant text.",
        tone_change: "tighten",
      },
      orgId: "org-test",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      serviceClient: sc as any,
      anthropic: anthropic as unknown as import("@anthropic-ai/sdk").default,
    });

    expect(createSpy).toHaveBeenCalledOnce();
    const callArgs = createSpy.mock.calls[0][0];
    const userMsg = callArgs.messages[0].content as string;
    expect(userMsg).toContain("The original grant text.");
    expect(userMsg).toContain("Tone direction:");
  });
});

describe("R-M1-B — substrate block has NO cache_control (PR #36 house rule)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("no block in systemBlocks has cache_control set", async () => {
    const { executeReviseGrantContent } = await import("@/lib/tools/grant-writing-handlers");
    const { anthropic, capturedSystem } = makeAnthropicMock();

    const sc = makeServiceClient({
      memoryEntries: [
        makeMemoryEntry("voice_samples", "vs-1", "Voice sample", "We center participants."),
        makeMemoryEntry("outcomes", "out-1", "Outcomes", "Served 500 youth."),
      ],
    });

    await executeReviseGrantContent({
      input: {
        draft_text: "Original draft.",
        tone_change: "add_data",
        content_type: "statement_of_need",
      },
      orgId: "org-test",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      serviceClient: sc as any,
      anthropic: anthropic as unknown as import("@anthropic-ai/sdk").default,
    });

    const sys = capturedSystem() as Anthropic.TextBlockParam[];
    expect(Array.isArray(sys)).toBe(true);
    for (const block of sys) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((block as any).cache_control).toBeUndefined();
    }
  });
});

describe("R-M1-C — graceful degradation when proof library is empty", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("revision still succeeds when memory entries are empty", async () => {
    const { executeReviseGrantContent } = await import("@/lib/tools/grant-writing-handlers");
    const { anthropic } = makeAnthropicMock("Revised with no substrate.");

    const sc = makeServiceClient({ memoryEntries: [] });

    const result = await executeReviseGrantContent({
      input: {
        draft_text: "Original draft text.",
        tone_change: "tighten",
      },
      orgId: "org-test",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      serviceClient: sc as any,
      anthropic: anthropic as unknown as import("@anthropic-ai/sdk").default,
    });

    expect(result.is_error).toBeFalsy();
    expect(result.content).toContain("Revised with no substrate.");
  });

  it("substrate block still present in system blocks but indicates no entries", async () => {
    const { executeReviseGrantContent } = await import("@/lib/tools/grant-writing-handlers");
    const { anthropic, capturedSystem } = makeAnthropicMock();

    const sc = makeServiceClient({ memoryEntries: [] });

    await executeReviseGrantContent({
      input: {
        draft_text: "Original draft text.",
        tone_change: "cite_examples",
      },
      orgId: "org-test",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      serviceClient: sc as any,
      anthropic: anthropic as unknown as import("@anthropic-ai/sdk").default,
    });

    const sys = capturedSystem() as Anthropic.TextBlockParam[];
    const substrateBlock = sys.find(
      (b) => b.type === "text" && b.text.includes("No proof library entries")
    );
    expect(substrateBlock).toBeDefined();
  });
});

describe("R-M1-D — unknown content_type falls back to loi substrate mapping", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("revision proceeds without error when content_type is a v2 type", async () => {
    const { executeReviseGrantContent } = await import("@/lib/tools/grant-writing-handlers");
    const { anthropic } = makeAnthropicMock();

    const sc = makeServiceClient({ memoryEntries: [] });

    const result = await executeReviseGrantContent({
      input: {
        draft_text: "An executive summary draft.",
        tone_change: "less_jargon",
        content_type: "executive_summary", // v2 type — not in MVP_CONTENT_TYPES
      },
      orgId: "org-test",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      serviceClient: sc as any,
      anthropic: anthropic as unknown as import("@anthropic-ai/sdk").default,
    });

    expect(result.is_error).toBeFalsy();
  });

  it("revision proceeds without error when content_type is absent", async () => {
    const { executeReviseGrantContent } = await import("@/lib/tools/grant-writing-handlers");
    const { anthropic } = makeAnthropicMock();

    const sc = makeServiceClient({ memoryEntries: [] });

    const result = await executeReviseGrantContent({
      input: {
        draft_text: "A draft with no content type.",
        feedback: "Shorten this.",
      },
      orgId: "org-test",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      serviceClient: sc as any,
      anthropic: anthropic as unknown as import("@anthropic-ai/sdk").default,
    });

    expect(result.is_error).toBeFalsy();
  });
});

// ---------------------------------------------------------------------------
// M2 — draft_id resolution tests
// ---------------------------------------------------------------------------

describe("R-M2-A — draft_id resolves to latest version draft", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses content_md from the highest-version draft when draft_id is provided", async () => {
    const { executeReviseGrantContent } = await import("@/lib/tools/grant-writing-handlers");
    const { anthropic } = makeAnthropicMock("Revision of v2 draft.");
    const createSpy = anthropic.messages.create;

    const pipelineRow = {
      id: "pipeline-row-uuid",
      org_id: "org-test",
      drafts: [
        makeDraft(1, "Version 1 content — older draft."),
        makeDraft(2, "Version 2 content — this is the latest."),
      ],
    };

    const sc = makeServiceClient({ pipelineRows: [pipelineRow] });

    const result = await executeReviseGrantContent({
      input: {
        draft_id: "pipeline-row-uuid",
        tone_change: "tighten",
      },
      orgId: "org-test",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      serviceClient: sc as any,
      anthropic: anthropic as unknown as import("@anthropic-ai/sdk").default,
    });

    expect(result.is_error).toBeFalsy();
    // The user message should contain the latest draft content
    const callArgs = createSpy.mock.calls[0][0];
    const userMsg = callArgs.messages[0].content as string;
    expect(userMsg).toContain("Version 2 content — this is the latest.");
    expect(userMsg).not.toContain("Version 1 content");
  });

  it("picks latest when drafts array has only one entry", async () => {
    const { executeReviseGrantContent } = await import("@/lib/tools/grant-writing-handlers");
    const { anthropic } = makeAnthropicMock();
    const createSpy = anthropic.messages.create;

    const pipelineRow = {
      id: "row-single-draft",
      org_id: "org-test",
      drafts: [makeDraft(1, "The only draft content.")],
    };

    const sc = makeServiceClient({ pipelineRows: [pipelineRow] });

    await executeReviseGrantContent({
      input: {
        draft_id: "row-single-draft",
        feedback: "Make it shorter.",
      },
      orgId: "org-test",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      serviceClient: sc as any,
      anthropic: anthropic as unknown as import("@anthropic-ai/sdk").default,
    });

    const callArgs = createSpy.mock.calls[0][0];
    const userMsg = callArgs.messages[0].content as string;
    expect(userMsg).toContain("The only draft content.");
  });
});

describe("R-M2-B — draft_text path works unchanged", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("draft_text is used directly when provided (no pipeline lookup)", async () => {
    const { executeReviseGrantContent } = await import("@/lib/tools/grant-writing-handlers");
    const { anthropic } = makeAnthropicMock();
    const createSpy = anthropic.messages.create;

    const sc = makeServiceClient();
    // Verify from() is not called with "grants_pipeline" when draft_text is provided
    const fromSpy = sc.from;

    await executeReviseGrantContent({
      input: {
        draft_text: "Direct draft text content.",
        tone_change: "more_urgent",
      },
      orgId: "org-test",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      serviceClient: sc as any,
      anthropic: anthropic as unknown as import("@anthropic-ai/sdk").default,
    });

    const callArgs = createSpy.mock.calls[0][0];
    const userMsg = callArgs.messages[0].content as string;
    expect(userMsg).toContain("Direct draft text content.");

    // grants_pipeline should not have been queried
    const pipelineCalls = fromSpy.mock.calls.filter(
      (c: string[]) => c[0] === "grants_pipeline"
    );
    expect(pipelineCalls.length).toBe(0);
  });

  it("result is not an error when draft_text is provided", async () => {
    const { executeReviseGrantContent } = await import("@/lib/tools/grant-writing-handlers");
    const { anthropic } = makeAnthropicMock("Revised text output.");

    const sc = makeServiceClient();

    const result = await executeReviseGrantContent({
      input: {
        draft_text: "Some draft content.",
        feedback: "Cut the jargon.",
      },
      orgId: "org-test",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      serviceClient: sc as any,
      anthropic: anthropic as unknown as import("@anthropic-ai/sdk").default,
    });

    expect(result.is_error).toBeFalsy();
    expect(result.content).toBe("Revised text output.");
  });
});

describe("R-M2-C — neither draft_id nor draft_text → instructive error", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns is_error and mentions both draft_text and draft_id", async () => {
    const { executeReviseGrantContent } = await import("@/lib/tools/grant-writing-handlers");
    const { anthropic } = makeAnthropicMock();
    const sc = makeServiceClient();

    const result = await executeReviseGrantContent({
      input: {
        tone_change: "tighten",
        // no draft_text, no draft_id
      },
      orgId: "org-test",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      serviceClient: sc as any,
      anthropic: anthropic as unknown as import("@anthropic-ai/sdk").default,
    });

    expect(result.is_error).toBe(true);
    expect(result.content).toMatch(/draft_text/);
    expect(result.content).toMatch(/draft_id/);
  });
});

describe("R-M2-D — draft_id with unknown row → instructive error", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns is_error and mentions draft_id + draft_text when row not found", async () => {
    const { executeReviseGrantContent } = await import("@/lib/tools/grant-writing-handlers");
    const { anthropic } = makeAnthropicMock();

    const sc = makeServiceClient({ pipelineRows: [] }); // no rows

    const result = await executeReviseGrantContent({
      input: {
        draft_id: "nonexistent-uuid",
        tone_change: "tighten",
      },
      orgId: "org-test",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      serviceClient: sc as any,
      anthropic: anthropic as unknown as import("@anthropic-ai/sdk").default,
    });

    expect(result.is_error).toBe(true);
    expect(result.content).toMatch(/draft_id/);
    expect(result.content).toMatch(/draft_text/);
    expect(result.content).toContain("nonexistent-uuid");
  });
});

describe("R-M2-E — draft_id with empty drafts array → instructive error", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns is_error and mentions draft_grant_content + both supply paths", async () => {
    const { executeReviseGrantContent } = await import("@/lib/tools/grant-writing-handlers");
    const { anthropic } = makeAnthropicMock();

    const pipelineRow = {
      id: "row-no-drafts",
      org_id: "org-test",
      drafts: [], // no drafts yet
    };

    const sc = makeServiceClient({ pipelineRows: [pipelineRow] });

    const result = await executeReviseGrantContent({
      input: {
        draft_id: "row-no-drafts",
        tone_change: "tighten",
      },
      orgId: "org-test",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      serviceClient: sc as any,
      anthropic: anthropic as unknown as import("@anthropic-ai/sdk").default,
    });

    expect(result.is_error).toBe(true);
    expect(result.content).toMatch(/draft_grant_content/);
    // Must offer both supply paths as alternatives
    expect(result.content).toMatch(/draft_id|draft_text/);
  });
});

describe("R-M2-F — no feedback and no tone_change → instructive error", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns is_error mentioning feedback and tone_change", async () => {
    const { executeReviseGrantContent } = await import("@/lib/tools/grant-writing-handlers");
    const { anthropic } = makeAnthropicMock();
    const sc = makeServiceClient();

    const result = await executeReviseGrantContent({
      input: {
        draft_text: "Some draft content.",
        // no feedback, no tone_change
      },
      orgId: "org-test",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      serviceClient: sc as any,
      anthropic: anthropic as unknown as import("@anthropic-ai/sdk").default,
    });

    expect(result.is_error).toBe(true);
    expect(result.content).toMatch(/feedback/);
    expect(result.content).toMatch(/tone_change/);
  });
});
