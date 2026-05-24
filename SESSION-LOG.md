# SESSION-LOG — Batch 1 Performance Sprint (cache fix + TTFT instrumentation)

**Identity:** Sonnet coding agent (spawned by Lopmon)
**Branch:** `lopmon/fix-perf-batch-1-cache-instrumentation`
**Worktree:** `C:\Users\Araly\edify-os-speed-batch-1`
**Base:** `origin/main` @ `e3f8788`
**Date:** 2026-05-24
**Task:** Batch 1 of the Edify-OS speed performance sprint — Fix #1 (TTFT instrumentation), Fix #2 (split cached system prompt), Fix #3 (stabilize tools array). Greenlit by Minervamon.

---

## Plan

1. Read speed audit doc (`life/projects/edify-os/speed-audit-2026-05-24.md`). Done.
2. Read affected files (`run-archetype-turn.ts`, `team/[slug]/chat/route.ts`). Done.
3. Create worktree (initial path mangled — fixed by removing bad worktree and recreating with relative `../edify-os-speed-batch-1` path). Done.
4. Implement Fix #1 (TTFT instrumentation). Done.
5. Implement Fix #2 (split stable vs conditional system prompt). Done.
6. Implement Fix #3 (unconditional CODE_EXECUTION_TOOL). Done.
7. TypeScript typecheck — passed clean. Done.
8. Commit + push. Done.
9. Open draft PR. Done.
10. /simplify — two cleanups applied + re-checked. Done.
11. Write SESSION-LOG files. Done.

---

## File changed

**Single file:** `apps/web/src/lib/chat/run-archetype-turn.ts`

---

## Fix #1 — TTFT + cache instrumentation

Added structured performance logging without any behavioral change.

- `turnStartMs = Date.now()` captured before the tool-use loop
- `ttftMs` captured inside `stream.on("text", ...)` on first invocation (both beta and non-beta streaming paths). Guards `firstTokenSeen` flag to capture only the first delta.
- Per-round log after each API call: `[perf] round { orgId, archetype, round, durationMs, inputTokens, outputTokens, cacheReadTokens, cacheCreationTokens, stopReason }`
- Per-turn aggregate log before return: `[perf] turn { orgId, archetype, ttftMs, totalMs, totalCacheReadTokens, totalCacheCreationTokens, totalInputTokens, totalOutputTokens }`
- Filter in Vercel logs with prefix `[perf]`
- Zero PII: no message content, no user IDs

---

## Fix #2 — Split stable vs conditional system prompt

Changed `systemBlocks` from a single cached block to two blocks:

- **Block 1 (CACHED):** `systemPrompt + orgContext + toolAddendums` — stable for the entire conversation regardless of intent. Marked `cache_control: { type: "ephemeral" }`.
- **Block 2 (NOT cached):** `skillsAddendum + frontendDesignAddendum` when non-empty.

Previously both were concatenated into a single cached block. Now Block 1 caches reliably across the full conversation, even when intent flips between chat and doc-generation.

Expected impact: ~40-60% TTFT reduction on turns 2+ once cache is warm.

---

## Fix #3 — Stabilize tools array cache marker

Removed the `attachSkills` conditional for `CODE_EXECUTION_TOOL`. Now always included.

Behavioral verification: `attachSkills` is effectively always `true` for all 6 production archetypes (all have non-empty `ARCHETYPE_PLUGIN_SKILLS`). Removing the conditional does not change runtime behavior.

---

## /simplify findings

Two issues fixed:

1. **Duplicated `stableBlock` literal** — extracted to `const stableBlock` and referenced in both branches of the `systemBlocks` ternary.
2. **`roundDurationMs` computed outside `if (response.usage)` guard** — moved inside the guard since it's only used there.

---

## Commits

- `e1692d2` — perf(chat): TTFT instrumentation + split cached system prompt + stabilize tools array (Batch 1)
- `a9e1379` — simplify: extract stableBlock literal, move roundDurationMs inside usage guard

## PR

https://github.com/clm-studios/edify-os/pull/13 — DRAFT. Awaiting Minervamon smoke test before merge.
