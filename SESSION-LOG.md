# SESSION-LOG — Async UX Hardening Agent

**Identity:** Async UX Hardening Agent (Sonnet)
**Branch:** `lopmon/fix-async-ux-hardening`
**Worktree:** `C:/Users/Araly/edify-os-async-ux-fix-20260511`
**Date:** 2026-05-11
**Task:** Bundle three coordinated fixes addressing the class of bugs where
long-running tool chains hang indefinitely past Vercel's 60s function ceiling
with no UI error feedback. Sourced from smoke-test-findings-2026-05-11.md
(bugs 1 + 2).

---

## What shipped

### Fix 1: Per-source timeout protection inside long-running tools

**`apps/web/src/lib/with-timeout.ts`** (new) — small `withTimeout(promise, ms,
fallback, onTimeout?)` utility racing a promise against a timer. Used by three
sites in this PR. Documents the caveat that the losing promise keeps running
in the background until the request tears down (source helpers don't accept
AbortSignals yet — plumb-through is left for a follow-up since changing each
helper's signature touched too many files).

**`apps/web/src/lib/grant-matcher.ts`** — wrapped each of the 4 source fan-out
calls (grants.gov, ca_grants, federal_register, foundation_grant_history) in
`withTimeout(..., 8000)`. On timeout the source resolves to `null` → the
mapper returns `[]` and the source label gets recorded in `sourceErrors` with
message `"timeout"`. Also bounded the Grants.gov amount-enrichment per-grant
fetch and the Sonnet judge call (the judge gets an `AbortController` with a
30s deadline via the SDK's `{ signal }` request option).

**`apps/web/src/lib/tools/render.ts`** — wrapped the full HTML→PNG+upload
pipeline in `withTimeout(..., 45000)` with a discriminated-union outcome shape
(`{ ok: true, ... } | { ok: false, reason: 'timeout' | 'failed', message }`)
so the caller switches on `ok` rather than checking instanceof / sentinel
equality. On timeout the tool returns an `is_error: true` content explaining
the failure so the model can apologize / suggest simpler HTML.

### Fix 2: `maxDuration` configured in `vercel.json`

**`apps/web/vercel.json`** — added a `functions` block with `maxDuration: 60`
on the chat-streaming route plus the decision-lab, heartbeat, and briefing
routes (all of which can fire multi-step tool chains). Vercel Hobby's hard
ceiling is 60s; without explicit config the SDK defaults to 10s, which is
what was likely killing the streams long before our app-level timeouts could
react.

### Fix 3: Server-side stream-end cleanup + DB status + frontend retry UI

**`supabase/migrations/00036_message_error_status.sql`** (new) — adds
`messages.status` text column with check constraint
(`'streaming' | 'complete' | 'errored'`), defaults to `'complete'`, plus a
partial index on rows where `status <> 'complete'` so the frontend's
rehydrate query stays cheap as the table grows. **Manual apply required by
Citlali in Supabase SQL Editor** (same workflow as 00027/00028).

**`apps/web/src/app/api/team/[slug]/chat/route.ts`** — restructured the
streaming handler:

- Assistant message row is now pre-inserted with `status='streaming'` *before*
  the stream starts (instead of after, post-completion). The pre-insert
  returns the real DB ID, which becomes `msgId` and is sent to the frontend
  via the `meta` event.
- Success path: the existing post-stream side-effects were rewritten from
  `INSERT` to `UPDATE` on `msgId`, setting `status='complete'` and the final
  content + token_usage metadata.
- Failure path: added `try/catch/finally` around the stream body. The `catch`
  sets `streamErrored = true` and surfaces the SSE error event as before; the
  new `finally` writes `status='errored'` with whatever partial text the
  `onTextDelta` callback accumulated, so a refresh later still shows the
  partial response with a retry affordance.

**`apps/web/src/app/api/team/[slug]/messages/route.ts`** — the GET endpoint
now selects and returns `status` so the frontend can use it during
rehydrate.

**`apps/web/src/app/dashboard/team/[slug]/api.ts`** — added `status?:
'streaming' | 'complete' | 'errored'` to the `Message` type.

**`apps/web/src/app/dashboard/team/[slug]/TeamChatClient.tsx`** — two changes:

1. **Stall detection during streaming:** the SSE consumer now arms a 90s
   timer that resets on every chunk. If the timer fires (server went silent
   — e.g. function timeout), the AbortController fires and a flag
   (`stallAborted`) tells the catch block to render the existing error-card
   shape with a "request timed out" message + retry button.
2. **DB-status respect on rehydrate:** new helper `projectErroredMessages`
   walks the messages array and converts any `assistant` row with
   `status='errored'` into the existing `isError + failedMessageText` shape,
   reusing the most recent prior user message as the retry text. Any
   partial assistant content captured server-side is preserved with a
   "timed out before completion" italic suffix so the user can see how far
   the response got.

---

## Files changed

- `apps/web/vercel.json` (modified)
- `apps/web/src/lib/with-timeout.ts` (new)
- `apps/web/src/lib/grant-matcher.ts` (modified)
- `apps/web/src/lib/tools/render.ts` (modified)
- `apps/web/src/app/api/team/[slug]/chat/route.ts` (modified)
- `apps/web/src/app/api/team/[slug]/messages/route.ts` (modified)
- `apps/web/src/app/dashboard/team/[slug]/api.ts` (modified)
- `apps/web/src/app/dashboard/team/[slug]/TeamChatClient.tsx` (modified)
- `supabase/migrations/00036_message_error_status.sql` (new)

---

## Needs Citlali action

**Apply migration 00036** in the Supabase SQL Editor before merging /
deploying. Paste the contents of
`supabase/migrations/00036_message_error_status.sql`. Until that runs:

- The chat route's insert of `status: 'streaming'` will succeed (column has
  default `'complete'`) but the value will be silently ignored — meaning
  errored streams will still appear as `complete` on rehydrate.
- The GET messages endpoint's `select("... status")` will return `null` for
  status; the frontend's fallback (`?? "complete"`) keeps the dead-state UI
  from breaking, but the retry-card-on-rehydrate fix won't kick in until the
  column exists.

The stall detection + maxDuration + per-source timeouts work without the
migration — they're all app-side. The migration just unlocks the cross-mount
"retry on refresh" piece.

---

## Known limitations

1. **`withTimeout` doesn't cancel the underlying HTTP call.** Source helpers
   in `apps/web/src/lib/{grants-gov,ca-grants-portal,federal-register,foundation-grants}.ts`
   don't accept an `AbortSignal` yet — refactoring all four was scope creep
   for this PR. The losing fetch keeps running in the background until the
   serverless function tears down. Real fix: thread `signal` through each
   helper. Logged for a future PR.

2. **Frontend retry button on rehydrate** projects errored DB rows onto the
   existing `isError + failedMessageText` UI. If multiple user messages
   precede the errored assistant, the retry sends the *most recent* prior
   user message — which is correct for normal flow but could pick the wrong
   one in unusual interleavings. Acceptable for the dead-state class of
   bugs; tighten if it bites in practice.

3. **No test coverage** added for the new code paths. The existing repo has
   no test harness for the chat-streaming route. Verifying the fixes will be
   smoke-test driven (re-run the find_grants_for_org + render_design_to_image
   reproductions from smoke-test-findings-2026-05-11.md after migration 00036
   is applied).

---

## Verification

- `pnpm typecheck` — passes (4/4 packages green).
- No lint script exists in `apps/web/package.json`; relied on TS strictness.

---

# SESSION-LOG — Routing + Copy Cleanup Agent

**Identity:** Routing + Copy Cleanup Agent (Sonnet)
**Branch:** `lopmon/fix-routing-and-copy-cleanup`
**Worktree:** `C:/Users/Araly/edify-os-routing-cleanup-20260511`
**Date:** 2026-05-11
**Task:** Bundle three small fixes from
`smoke-test-findings-2026-05-11.md` (bugs 3, 4, 5).

---

## What shipped (2 of 3 fixes)

### Fix 2 (Bug 4): `/dashboard/settings/integrations` redirect — SHIPPED

**`apps/web/src/app/dashboard/settings/integrations/page.tsx`** (new, 9 lines
incl. comments). Server component that calls `redirect('/dashboard/integrations')`
from `next/navigation`. No client flash, no middleware change, no
`next.config.mjs` edit. Catches the predictable-but-wrong URL users would
type given the Settings card hierarchy.

### Fix 3 (Bug 5): MCP Integrations card copy — SHIPPED

**`apps/web/src/app/dashboard/settings/page.tsx`** (1-line change, line 230).
Old: `"Connect tools your AI team uses as live actions — Canva, Figma, and more."`
New: `"Connect tools your AI team uses as live actions — Gmail, Notion, Asana, social posting, and more."`

Reflects the actual current pipeline (Composio for Gmail / social posting,
direct MCP for Notion / Asana / Zapier, HTML+CSS via `@vercel/og` for
design output). Drops Canva (deprecated per Sprint 2 WOW) and Figma
(deferred — handoff tool not output tool). Grepped the repo for
`"Canva, Figma"` and `"Canva and Figma"` — no other stale references.

---

## NOT shipped — Fix 1 (Bug 3): Knowledge Base sidebar link

**Decision: paused and surfaced to Lopmon. Did NOT modify the sidebar.**

**Why:** the PRD's premise about Bug 3 does not match the code on this
branch. The PRD says:

> "The sidebar has a 'Knowledge Base' nav item that links to
> `/dashboard/knowledge`. That route doesn't exist and returns a 404."

In `apps/web/src/components/sidebar.tsx` (line 41 on this branch and on
the production commit `163cfab` that the smoke test ran against), the
"Knowledge Base" entry actually links to **`/dashboard/memory`**, not
`/dashboard/knowledge`:

```ts
{ href: '/dashboard/memory', label: 'Knowledge Base', icon: Brain },
```

`/dashboard/memory/page.tsx` exists, ships a full Memory entries CRUD
surface (categories: mission / programs / donors / grants / campaigns /
brand_voice / contacts / processes / general / financials / volunteers /
events), and renders cleanly. Backed by `/api/memory/entries`.

So clicking the sidebar item from production routes to a working page.
Minervamon's smoke test reported `/dashboard/knowledge → 404` — that's
real, but it's not because the sidebar links there. The most likely
explanation is that she URL-typed `/dashboard/knowledge` based on the
sidebar label "Knowledge Base" without inspecting the underlying href,
then concluded "Sidebar has 'Knowledge Base' nav item but the route
doesn't exist." Her conclusion was wrong; the link is fine.

**Two possible interpretations of the PRD's intent:**

1. **Lopmon wanted the broken link fixed.** In this case there is
   nothing to do — the link goes to a working route. Action: no change.
2. **Lopmon wanted "Knowledge Base" gone regardless** because
   `/dashboard/memory` is considered an inadequate placeholder and the
   real surface should land via the Programs Director PRD
   (`PRD-programs-director-knowledge-curation-2026-05-10.md`). In this
   case, removing the link would break the in-product discovery path for
   a working surface that orgs are presumably using to store mission /
   programs / donor knowledge. That seems user-hostile.

Without being able to ask, the conservative call is to **not** touch
the sidebar and let Lopmon decide. If interpretation 2 is correct,
Lopmon can ship the removal in a one-line follow-up.

**If Lopmon wants interpretation 2, the one-line removal is:**

In `apps/web/src/components/sidebar.tsx` around line 41, delete:

```ts
{ href: '/dashboard/memory', label: 'Knowledge Base', icon: Brain },
```

(And remove the now-unused `Brain` import on line 11. The `/dashboard/memory`
route stub stays — only the nav link goes, matching the PRD spirit.)

---

## Files changed

- `apps/web/src/app/dashboard/settings/integrations/page.tsx` (new)
- `apps/web/src/app/dashboard/settings/page.tsx` (1-line copy update)

---

## Verification

- `pnpm typecheck` — passes (4/4 packages green, web rebuilt with cache miss).
- `/simplify` pass: diff is minimal (10 lines new + 1 line changed); no
  dead imports, no leftover references. Grep for `"Canva, Figma"` /
  `"Canva and Figma"` returned no other matches in the repo, so the copy
  fix is the only place that staleness lived.

---

## PR

To be filled after `gh pr create`.

---

# SESSION-LOG — Sprint α.5 (search_grants meta-tool consolidation)

**Identity:** Sonnet coding agent spawned by Lopmon for Sprint α.5
**Branch:** `sprint-alpha-half-search-grants-2026-05-14`
**Worktree:** `C:\Users\Araly\edify-os-sprint-alpha-half\`
**Start UTC:** 2026-05-14T16:23Z
**Base SHA:** `d5e1d2212d67c33c732df19cb62b7d8a65c11caa`
**PRD:** `~/life/projects/edify-os/PRD-search-grants-consolidation-2026-05-13.md`

## Plan

Apply **Option A (clean rename)** per PRD recommendation:

1. Reshape `apps/web/src/lib/tools/grant-matcher.ts`: rename tool
   `find_grants_for_org` → `search_grants`, add PRD F1 schema (`keyword`,
   `sources` enum array, `due_within_days`, `min_amount`/`max_amount`),
   thread through to existing engine. Export `searchGrantsTools` +
   `executeSearchGrantsTool` + `SEARCH_GRANTS_TOOLS_ADDENDUM`.
2. Extend `apps/web/src/lib/grant-matcher.ts` engine to accept an optional
   `sources` narrowing array, and a `keyword`/`dueWithinDays` pass-through.
   Behavior parity: when unspecified, fan out to the same sources as today.
3. Update Dev Director's `ARCHETYPE_TOOLS` array (registry.ts:304): replace
   10 grant-related family spreads with `searchGrantsTools` alone.
4. Update Programs Director's array (registry.ts:320): swap `grantsTools`
   for `searchGrantsTools` (PRD F3-extension, in scope).
5. Update `apps/web/src/lib/hours-saved/estimates.ts`: rename
   `tool:find_grants_for_org` → `tool:search_grants`.
6. Update `registry.ts` family-set guards + `buildSystemAddendums`: drop
   the 10 de-registered branches, add a single `search_grants` branch.
7. Keep the 10 source-helper tool files intact (per PRD F3 backward-compat).
8. typecheck, /simplify, commit, push, open PR.

## Survey notes

- Dev Director `ARCHETYPE_TOOLS` before: 18 families spread top-level
  (calendar + 10 grant-related + crm + gmail + drive + memory + report_event
  + impact_data + consult_teammate).
- Programs Director before: 7 families including `grantsTools`.
- Engine (`lib/grant-matcher.ts`) currently fans out to 4 sources:
  grants.gov, ca_grants, federal_register, foundation_grant_history (opt-in
  via EINs). The 5 other source helpers (nonprofit/ProPublica, USAspending,
  Charity Navigator, Candid Demographics, Inside Philanthropy) are not yet
  wired into the engine. PRD F1 schema lists all 9 enum values; per PRD
  "behavior parity, not a rewrite", I'll accept all 9 enum values but only
  filter against the 4 currently-wired sources. Unknown sources are
  silently ignored (the engine still runs the wired sources unless they're
  explicitly excluded by a narrowing array). This preserves the enum
  surface contract while staying strictly within PRD's "no new behavior"
  scope.
- No tests in repo. Verification = `pnpm --filter web typecheck`.
- Files I'll touch:
  - `apps/web/src/lib/tools/grant-matcher.ts` (rename + reshape)
  - `apps/web/src/lib/grant-matcher.ts` (engine: add sources/keyword args)
  - `apps/web/src/lib/tools/registry.ts` (archetype arrays + addendums)
  - `apps/web/src/lib/hours-saved/estimates.ts` (event-key rename)

## Execution log

### Files modified
- `apps/web/src/lib/tools/grant-matcher.ts` — rewrote as `search_grants` meta-tool: renamed exports (`searchGrantsTools`, `executeSearchGrantsTool`, `SEARCH_GRANTS_TOOLS_ADDENDUM`), updated tool definition to PRD F1 schema (added `keyword`, `sources` enum array, renamed `deadline_within_days` → `due_within_days`), wired source-narrowing into matcher options. Removed the "use this BEFORE falling back to individual source tools" sentence in the addendum (those tools no longer ship).
- `apps/web/src/lib/grant-matcher.ts` — engine: added `GrantSourceSlug` exported union (PRD-mandated 9 slugs), extended `MatcherOptions` with `sources?` and `keyword?`, gated each of the 4 wired source fan-out branches on `isSourceAllowed(slug)`. Keyword now falls back through opts.keyword → org.focusArea → org.mission.
- `apps/web/src/lib/tools/registry.ts` — dropped 10 grant-family imports + re-exports, replaced with `searchGrantsTools` import only. Removed 7 dead family-name Sets + 7 dead `getToolFamilies` branches + 11 dead `buildSystemAddendums` branches (10 source families + grant_matcher; reduced to one `search_grants` branch). Updated Dev Director's `ARCHETYPE_TOOLS` to swap 11 grant-related family spreads for one `...searchGrantsTools`. Updated Programs Director similarly (replaced `grantsTools` with `searchGrantsTools` per PRD recommended extension). Updated `executeTool` dispatcher: removed 10 grant-family branches, added one `SEARCH_GRANTS_TOOL_NAMES.has(name)` branch.
- `apps/web/src/lib/hours-saved/estimates.ts` — renamed event key `tool:find_grants_for_org` → `tool:search_grants` (preserves 240-min estimate).

### Source-helper tool files preserved
Per PRD F3: `lib/tools/{grants,nonprofit,usaspending,ca-grants,charity-navigator,candid-demographics,foundation-grants,federal-register,inside-philanthropy}.ts` left intact — their `executeXxxTool` and family exports remain available for any external caller, just no longer registered on any archetype tool array. No imports of those files remain in `registry.ts`.

### Tool count delta
- **Helga (Dev Director) BEFORE:** 18 family spreads, ~43 distinct tool definitions
- **Helga (Dev Director) AFTER:** 9 family spreads, 29 distinct tool definitions (10 grant-related families collapsed to 1 `search_grants` tool)
- **Programs Director BEFORE:** 7 families, 14 tools (`grantsTools` × 2 tools)
- **Programs Director AFTER:** 7 families, 13 tools (`searchGrantsTools` × 1 tool)
- Net: Helga drops 14 tool definitions (32% reduction); Programs drops 1.

### Addendum-firing trace verified
- Dev Director's tool array now includes `searchGrantsTools` (one tool named `search_grants`).
- `getToolFamilies(tools)` returns a Set including `"search_grants"` via the pinned `SEARCH_GRANTS_TOOL_NAMES` Set (the `name.split("_")[0]` fallback would otherwise resolve to `"search"`, which collides with `search_stock_photo` from Unsplash).
- `buildSystemAddendums(tools)` then pushes `SEARCH_GRANTS_TOOLS_ADDENDUM` into the system prompt — addendum fires as expected. Manually traced through the registry.ts logic; unit-style verification not possible (no test harness).

### Verification
- `pnpm --filter web typecheck` — passes.
- `pnpm typecheck` (turbo, all 4 packages) — passes (3 cached, web cache-miss rebuild green).
- `/simplify` review pass: moved `validSources` Set from per-call construction to a module-level constant `VALID_SOURCE_SLUGS`. No further issues identified.

### Out-of-scope items deliberately not done
- Wiring the 5 currently-unwired sources (propublica, usaspending, charity_navigator, candid_demographics, inside_philanthropy) into `lib/grant-matcher.ts` aggregator. PRD F1 fixed the schema to 9 enum values, but the engine's fan-out only covers 4. The unwired slugs are accepted in the input array but silently no-op. Per PRD: "Behavior parity, not a rewrite" + "Adding new sources — that's a separate sprint when new free-data sources surface."
- Telemetry hook for source-coverage observability (PRD open question 4, deferred unless Citlali asks).
- Hard-deletion of the 10 source-helper files. PRD F3 explicitly keeps them for backward compat.

### Done

- Commit SHA: `bc4015f6dbd8dc3ce9abcf7440c315d4fc368779`
- PR URL: https://github.com/clm-studios/edify-os/pull/6
- Branch pushed to `origin/sprint-alpha-half-search-grants-2026-05-14`
- PR is OPEN — not auto-merged, awaiting human coordination per `feedback_no_auto_merge_when_shared`.


