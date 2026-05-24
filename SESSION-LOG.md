# SESSION-LOG — Sprint α Sweet cheap-win (HR / Volunteer Coordinator)

**Identity:** Sprint α Sweet cheap-win agent (Sonnet, spawned by Lopmon)
**Branch:** `sprint-alpha-sweet-cheap-win-2026-05-14`
**Worktree:** `C:\Users\Araly\edify-os-sprint-alpha`
**Base:** `origin/main` @ `d5e1d22`
**Date:** 2026-05-14
**Task:** Sprint α from `archetype-tools-extension-proposal-2026-05-13.md` §Sprint α (lines 331-337). Take Sweet from near-zero domain tools to ~14 useful tools via three targeted edits (no new vendor work).

---

## Plan

1. Create worktree (done).
2. Read PRD §Sprint α + verify file shapes (done).
3. Three targeted edits:
   - Add `hr_volunteer_coordinator` to Slack MCP's `archetypes` scope
   - Add `gmailTools` + `calendarTools` to Sweet's tool list in `ARCHETYPE_TOOLS`
   - Add `hr_volunteer_coordinator` to Zapier MCP's `archetypes` scope
4. Verify Sweet's prompt-addenda pipeline (read-only).
5. Typecheck + lint.
6. `/simplify` review.
7. Commit, push, open PR (do NOT merge).

---

## Code reconnaissance (file shapes)

PRD line numbers were approximate. Actual locations (file paths + lines verified):

- **Slack MCP entry** — `apps/web/src/lib/mcp/server-catalog.ts`, `SLACK_ENTRY` declared at line 176-184. `archetypes` array is line 183: `archetypes: ["marketing_director"]`. PRD path `lib/server-catalog.ts` was outdated; actual file under `lib/mcp/`.
- **Sweet's tool list** — `apps/web/src/lib/tools/registry.ts`, `ARCHETYPE_TOOLS` declared at line 301. Sweet's entry is line 321:
  `hr_volunteer_coordinator: [...driveTools, ...memoryTools, ...reportEventTools, ...impactDataReadTools, ...consultTeammateTools]`.
  PRD path `lib/registry.ts` was outdated; actual file under `lib/tools/`. `gmailTools` and `calendarTools` are already imported at the top of this file (lines 11 and 23).
- **Zapier MCP entry** — same `apps/web/src/lib/mcp/server-catalog.ts`, `ZAPIER_ENTRY` declared at line 386-407. `archetypes` array starts line 400 with 5 entries (marketing_director, programs_director, development_director, executive_assistant, events_director). Per the existing comment at lines 395-399, HR was *intentionally* omitted earlier because there was no clear HR-specific Zap use case. Sprint α reverses that decision — Sweet now joins the Zapier meta-connector scope.

---

## Prompt-addenda pipeline verification

Sweet's prompt-addenda pipeline is correct and fires automatically when she gains Gmail/Calendar tools. Trace:

1. **Archetype base prompt** — `apps/web/src/lib/archetype-prompts.ts:554`:
   `hr_volunteer_coordinator: HR_VOLUNTEER_COORDINATOR_PROMPT + MEMORY_POSTFIX + IMPACT_DATA_POSTFIX`
2. **Tool resolution** — `apps/web/src/lib/chat/run-archetype-turn.ts:157`:
   `resolveArchetypeTools({ archetype, ... })` reads `ARCHETYPE_TOOLS[archetype]` (i.e. Sweet's array, which now includes `gmailTools` + `calendarTools`).
3. **Tool-family addenda composition** — `run-archetype-turn.ts:162`:
   `toolAddendums = buildSystemAddendums(tools)`.
   `buildSystemAddendums` (`lib/tools/registry.ts:263-294`) walks the tools array, detects families, and concatenates `GMAIL_TOOLS_ADDENDUM` (line 278) + `CALENDAR_TOOLS_ADDENDUM` (line 266) into the addenda string.
4. **Final system prompt** — `run-archetype-turn.ts:188`:
   `cachedSystemText = systemPrompt + orgContext + toolAddendums + skillsAddendum + frontendDesignAddendum`.

**Conclusion:** no code change needed. Adding `gmailTools` + `calendarTools` to Sweet's `ARCHETYPE_TOOLS` array is sufficient — the addenda will fire automatically.

---

## Code changes

- `apps/web/src/lib/mcp/server-catalog.ts` — `SLACK_ENTRY.archetypes` gains `hr_volunteer_coordinator` (with provenance comment); `ZAPIER_ENTRY.archetypes` gains `hr_volunteer_coordinator` (existing "HR intentionally omitted" comment trimmed + updated to reflect Sprint α reversal).
- `apps/web/src/lib/tools/registry.ts` — Sweet's entry in `ARCHETYPE_TOOLS` (`hr_volunteer_coordinator: [...]`) gains `...calendarTools` and `...gmailTools` prefixed onto the existing tool array. Imports for both already present at the top of the file.
- `SESSION-LOG.md` — this log.

## /simplify pass

Tightened the Zapier-entry provenance comment in `server-catalog.ts` from 9 lines to 7 lines — kept the historical "HR was intentionally omitted" context plus the Sprint α reversal note, dropped redundant phrasing. No other changes needed; the diff was already minimal.

## Verification

- `pnpm --filter web typecheck` — passes (4/4 packages green) on the final committed state.
- Prompt-addenda pipeline verified read-only (see above) — `gmailTools` + `calendarTools` trigger `GMAIL_TOOLS_ADDENDUM` + `CALENDAR_TOOLS_ADDENDUM` injection into Sweet's system prompt automatically via `buildSystemAddendums`. No prompt changes needed.

## Commit

`74948d68b9fabdcc671de696cc2f0d2bd3f66081` — initial Sprint α commit on `sprint-alpha-sweet-cheap-win-2026-05-14`. Follow-up commit fills these fields in this log.

## PR

https://github.com/clm-studios/edify-os/pull/5 — open, targeting `main`. Co-skim queued for Minervamon. Do not auto-merge — humans coordinate (per `feedback_no_auto_merge_when_shared`).

## Rebase log (2026-05-14, post-PR-#6/#7/#8 merges)

**Trigger:** PR #5 went to CONFLICTING/DIRTY after PR #6 (search_grants consolidation) merged 2026-05-14T22:23Z. PRs #7 (knowledge redirect) and #8 (Bug 6 EA token validate) also merged in the same window. Branch needed to rebase onto current `origin/main` (`d2e6a64`).

**Rebase agent:** Sonnet, spawned by Lopmon, working in worktree `C:\Users\Araly\edify-os-sprint-alpha`.

**Conflict files:** 1 — `apps/web/src/lib/tools/registry.ts`.

**Resolution:** The conflict was in the `ARCHETYPE_TOOLS` block. Main (post-PR-#6) had `programs_director` switched from `grantsTools` → `searchGrantsTools` and the surrounding imports/family-Sets restructured. PR #5 carried the obsolete `grantsTools` reference (because it branched from pre-PR-#6 main) plus the actual intended change: adding `...calendarTools, ...gmailTools` to Sweet's (`hr_volunteer_coordinator`) array. Resolved by keeping main's `programs_director: [...searchGrantsTools, ...]` line verbatim and applying PR #5's edit to Sweet's line:

```
hr_volunteer_coordinator: [...calendarTools, ...gmailTools, ...driveTools, ...memoryTools, ...reportEventTools, ...impactDataReadTools, ...consultTeammateTools]
```

Sweet's array on main did NOT contain `searchGrantsTools` (PR #6 only touched Dev Director + Programs Director's arrays, not Sweet's), so nothing else from main needed to be preserved inside Sweet's bracket. `server-catalog.ts` and `SESSION-LOG.md` auto-merged cleanly (PR #6 didn't touch either file).

**Auto-merge note:** `SESSION-LOG.md` had auto-merged via the rebase against PRs #7 and #8's appended sections — they sit below PR #5's section in this file, no manual conflict.

**Post-rebase HEAD SHA:** `dd68267c0606c58ae57fe33ff58a5de7d8d62142` (was `9487781`).
- Commit 1 (Sprint α core): `59f498f` (was `74948d6`)
- Commit 2 (SESSION-LOG follow-up): `dd68267` (was `9487781`)

**Typecheck:** `pnpm --filter web typecheck` — exit 0 (clean).

**Force-push:** `git push --force-with-lease origin sprint-alpha-sweet-cheap-win-2026-05-14` — pending below.

**GitHub mergeStateStatus after force-push:** pending below.

---

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

---

# SESSION-LOG — Bug 3 alias `/dashboard/knowledge` → `/dashboard/memory`

**Identity:** Sonnet coding agent (spawned by Lopmon)
**Branch:** `bug-3-knowledge-memory-redirect-2026-05-14`
**Worktree:** `C:/Users/Araly/edify-os-bug-3-alias`
**Date:** 2026-05-14
**Task:** Bug 3 from the routing cleanup backlog. Prior agent (2026-05-11
Routing + Copy Cleanup) correctly paused: the sidebar already links
"Knowledge Base" → `/dashboard/memory` (the working surface), so removing
the sidebar entry would have been user-hostile. Minervamon's 2026-05-14
call: add a server-side redirect page so stale `/dashboard/knowledge` URLs
(typed guesses, old bookmarks) land cleanly on `/dashboard/memory` instead
of 404'ing.

## What shipped

**`apps/web/src/app/dashboard/knowledge/page.tsx`** (new, 6 lines) — mirrors
the existing redirect pattern at
`apps/web/src/app/dashboard/settings/integrations/page.tsx`. Server-side
`redirect("/dashboard/memory")` so there's no client flash and no 404.

## Boundaries respected

- Did NOT touch `apps/web/src/components/sidebar.tsx` (already correct — line
  41 links `/dashboard/memory` with label "Knowledge Base").
- Did NOT touch the `/dashboard/memory` route or page.
- No middleware. No `next.config` edits.

## Verification

- `pnpm --filter web typecheck` — clean.
- /simplify — no opportunities (file is 6 lines, mirrors an existing pattern).

## Done

- Commit SHA: `483238e`
- PR URL: https://github.com/clm-studios/edify-os/pull/7
- Branch pushed to `origin/bug-3-knowledge-memory-redirect-2026-05-14`
- PR is OPEN — not auto-merged, awaiting human coordination per
  `feedback_no_auto_merge_when_shared`.

---

# SESSION-LOG — Bug 6 Option A (Integrations-page token-freshness validation)

**Identity:** Sonnet coding agent spawned by Lopmon
**Branch:** `bug-6-option-a-integrations-token-validate-2026-05-14`
**Worktree:** `C:\Users\Araly\edify-os-bug-6-option-a`
**Start UTC:** 2026-05-14 (early UTC)
**Base SHA:** `29ab28b5e77c6f037f5628b3e72caa5a7cf91865`
**Diagnostic:** `~/life/projects/edify-os/bug-6-gmail-ea-scope-mismatch-diagnostic-2026-05-13.md`

## Plan (from diagnostic §Option A)

1. Extract a pure token-validation helper from `lib/google.ts` returning a discriminated union (no NextResponse). `getValidGoogleAccessToken` keeps its current EA-tool contract by delegating internally.
2. Modify `apps/web/src/app/api/integrations/google/route.ts` GET to call the new helper. Return `{ connected: false, authError: true }` when token exists but is expired AND cannot be silently refreshed.
3. Update `apps/web/src/app/dashboard/integrations/page.tsx` to consume `authError` and render an actionable "Google token expired. Please reconnect." state on Google cards. Pattern mirrors the existing `/api/integrations/google/today-events` route's `connected + authError` contract.

## Survey notes

- `route.ts` GET handler (current): selects `status='active'` only — no token-freshness check (matches diagnostic claim).
- `getValidGoogleAccessToken` lives at `lib/google.ts:189-285` and returns either `{ accessToken }` or `{ error: NextResponse }`.
- Diagnostic's reference to `lib/google.ts:366` for the `GOOGLE_NOT_CONNECTED` constant is stale — the constant actually lives at `lib/tools/registry.ts:287`. Doesn't change the fix; the EA error path is what we're mirroring on the Integrations page side.
- Precedent for the response shape: `/api/integrations/google/today-events/route.ts` already returns `{ connected, authError, events }` — same pattern fits here.

## Files changed

- `apps/web/src/lib/google.ts` — added `inspectGoogleToken(serviceClient, orgId, type)` exported helper returning a `GoogleTokenInspection` discriminated union (`{ ok: true, accessToken } | { ok: false, reason: ... }`). Existing `getValidGoogleAccessToken` now delegates to it and maps the union onto the same NextResponse error contract EA tools already rely on (zero behavioral change for EA path).
- `apps/web/src/app/api/integrations/google/route.ts` — GET handler now calls `inspectGoogleToken` on the active integration row. Returns `{ connected: false, email, authError: true }` when the row exists but the stored token is expired / refresh dead / decrypt failed. Added an exported `GoogleIntegrationStatusResponse` type for the new contract.
- `apps/web/src/app/dashboard/integrations/page.tsx` — added `googleAuthError` state; the Google-status fetch sets it when `authError: true` arrives. Card footer renders a fourth branch ("Google token expired. Please reconnect." + Reconnect CTA) on Gmail/Calendar/Drive cards when the flag is set. The reconnect button uses the existing `handleConnectClick` to trigger the OAuth flow. State is cleared on successful reconnect (?google=connected) and on disconnect.

## /simplify findings + fixes

- **Naming collision:** initial implementation exported `resolveGoogleToken` from `lib/google.ts`, which collided with an existing local helper of the same name in `lib/tools/registry.ts:291`. Renamed the new export to `inspectGoogleToken` + `GoogleTokenInspection` to make the difference between "give me a usable token (registry helper)" and "what's the token state (new helper)" legible. No other reuse / quality / efficiency issues required action.

## Verification

- `pnpm --filter web typecheck` — green
- `pnpm typecheck` (turbo, 4 packages) — 4/4 green (web cache-miss rebuild)
- Manual reasoning: EA tools call `getValidGoogleAccessToken`, which now delegates to `inspectGoogleToken`. Integrations page calls `inspectGoogleToken` directly. Same DB read, same decrypt, same refresh path, same 60s buffer — so the page's "connected" determination is now exactly aligned with what EA tools will see on the very next call.

## Progress
- [x] Worktree created
- [x] Diagnostic read
- [x] Source files surveyed
- [x] Implementation
- [x] Typecheck
- [x] /simplify
- [x] Commit
- [x] Push
- [x] PR opened
- [x] PR URL captured

## Done

- Commit SHA: `3c66dff862b2c333a451fab977e35924b31228bf`
- PR URL: https://github.com/clm-studios/edify-os/pull/8
- Branch pushed to `origin/bug-6-option-a-integrations-token-validate-2026-05-14`
- PR is OPEN — not auto-merged, awaiting human coordination per `feedback_no_auto_merge_when_shared`.

---

# SESSION-LOG — Sprint A: Org Creation Onboarding Flow

**Date:** 2026-05-23
**Agent:** Sonnet coding agent spawned by Lopmon
**Task:** Implement F1/F2/F3/F5 from `PRD-org-creation-onboarding-2026-05-15-revised.md` (Minervamon, v3). Close the org-creation gap outstanding since 2026-04-17.
**Worktree:** `C:\Users\Araly\edify-os-sprint-a-onboarding`
**Branch:** `lopmon/sprint-a-org-creation-onboarding`
**Base:** `origin/main` @ `e5154f6`
**PR:** https://github.com/clm-studios/edify-os/pull/9 (DRAFT — do not auto-merge)
**Commit:** `3ee343bca1bce0f736154f1fb089715864adf3a5`
**Status:** COMPLETE — all 4 in-scope features shipped, typecheck clean, /simplify run.

---

## Feature summary

### What each feature does (confirmed before coding)

**F1 — Middleware briefing gate:** Authenticated users hitting any `/dashboard/*` path (except `/dashboard/briefing` itself) without the `edify_briefing_done` cookie are redirected to `/dashboard/briefing`. Cookie is written client-side after successful briefing submission. No DB hit in Edge runtime — cookie is the perf mitigation the PRD called for.

**F2 — Transactional org + memory write:** New `POST /api/onboarding/complete` route. Validates auth + org membership. Idempotency guard via `onboarding_completed_at`. Updates `orgs` with all briefing-form fields. Inserts `org_profile` preamble + per-program + goals memory entries. Returns `{ orgId, redirectTo: "/dashboard" }`. Client calls this from `handleFinish`, then sets localStorage (second-layer durability) and the cookie, then `router.replace('/dashboard')`.

**F3 — Org profile preamble seeding:** `buildOrgPreamble()` in the API route assembles the structured org context string matching the PRD v3 template (no EIN, no signatory). Written to `memory_entries` as `category: org_profile`, `auto_generated: true`.

**F5 — Silent backfill (Option B):** Same middleware gate and same API write path handle existing localStorage-only users. On first post-deploy login, they're redirected to `/dashboard/briefing`, see their draft pre-populated from localStorage, submit once, cookie is set. No special UI. Identical code path to new users — no branching.

**F4 — Skipped per product decision.**
**Documents DB persistence — Deferred to Sprint A.5 per product decision.**

---

## Architecture decisions made (with reasoning)

**Cookie vs. DB in middleware:** `getAuthContext()` uses `next/headers` `cookies()` which is not Edge-compatible and adds a DB round-trip per request. Cookie-based fast path is the correct solution. Documented in middleware comment.

**`/onboarding` legacy comment cleanup:** Confirmed `/onboarding` IS a live route (creates org + Anthropic key for brand-new users). The "historical intent" comment was stale in the sense that the route IS the working implementation. Comment was trimmed to remove the false "historical intent" framing. Route remains in `PROTECTED_PREFIXES` — correct.

**No Supabase RPC for atomicity:** Supabase JS client doesn't expose raw BEGIN/COMMIT in Edge routes. Used sequential inserts with the existing service-role-client pattern (same as `/api/org/create`). Memory insert failure is non-fatal (org was already updated; memory can be re-created from settings). This matches the PRD's acceptable partial-success note.

**`isComplete` state removed:** With `router.replace('/dashboard')` on success, the `BriefingComplete` component branch was unreachable. Removed to avoid dead state. `BriefingComplete` component itself left in place (used by settings/other flows if any).

---

## Schema verification findings

- `orgs` table: missing `annual_budget`, `full_time_staff`, `regular_volunteers`, `org_type`, `primary_service_area`, `founded_year`. Migration 00037 adds them.
- `members` table: `role` enum includes `'admin'` (confirmed in 00001_core_tenancy.sql). No change needed.
- `memory_entries`: `org_profile` category not in constraint. Migration 00037 adds it.
- `getAuthContext()`: confirmed in `apps/web/src/lib/supabase/server.ts`. Returns `{ user, orgId, memberId }`. `orgId: null` when no member row. Edge-incompatible — confirmed reason for cookie approach.
- `/onboarding` route: LIVE at `apps/web/src/app/(auth)/onboarding/page.tsx`. Not dead code.

---

## Files changed

- `apps/web/src/middleware.ts` — F1 briefing gate (~25 LOC added)
- `apps/web/src/app/dashboard/briefing/page.tsx` — F2 client: API call, cookie set, router.replace, error state, localStorage-no-longer-gates-form-render
- `apps/web/src/app/api/onboarding/complete/route.ts` — F2/F3 server: new route (~180 LOC)
- `supabase/migrations/00037_briefing_org_fields.sql` — schema: 6 new orgs columns + org_profile category
- `SESSION-LOG.md` — this log

Total: 4 source files changed, 1 new file, 1 migration.

---

## /simplify pass findings and fixes

1. **Redundant `/onboarding` in `BRIEFING_EXEMPT_PREFIXES`** — removed. `/onboarding` paths never match `pathname.startsWith("/dashboard")` so the exemption was a no-op.
2. **Redundant `!isDemoMode` in F1 gate** — removed. Demo mode with a `/dashboard/*` path already returns early at the `if (isDemoMode && isProtected)` block above; the second check was unreachable.
3. **Middleware comment over-explained** — trimmed the F1 block comment from ~15 lines to 8. Retained the non-obvious WHY (Edge runtime, cookie rationale, F5 backfill intent).
4. **No new code reuse issues found** — `buildGoalsContent` in the new route is similar to logic in `/api/briefing/route.ts`, but both are simple enough that extraction into a shared helper adds indirection without benefit.

---

## Blockers / follow-ups for Lopmon

- **Migration 00037 must be applied manually before deploy.** Run `supabase/migrations/00037_briefing_org_fields.sql` in Supabase SQL Editor. Same workflow as 00033/00036.
- **Sprint A.5 — Documents DB persistence.** The briefing form accepts file uploads (calls `/api/briefing/upload`) but files are not persisted to Supabase Storage. Scoped out per product decision.
- **Cookie expiry handling.** `edify_briefing_done` TTL is 7 days. After expiry, user is re-gated to briefing and sees 409 (already complete) from the API — treated as success and cookie is reset. Smooth, but worth a manual smoke test post-deploy.
- **Existing `POST /api/briefing` route** at `apps/web/src/app/api/briefing/route.ts` still exists and is separate from the new `/api/onboarding/complete`. The old route updates org name/mission + writes program/goal memories but does NOT set `onboarding_completed_at` or write the `org_profile` preamble. It may be called from Settings (briefing re-run). This is NOT a conflict — the routes serve different purposes. Lopmon may want to audit for redundancy in a future sprint.

---

## Notes

- PR target confirmed: `clm-studios/edify-os` `main` (not `whitmorelabs`).
- PR is DRAFT. Citlali / Minervamon to eyes-on before merge.
- `pnpm --filter web typecheck` passes (clean, no errors).


---

# SESSION-LOG — Sprint A: PR #9 Review Fixes (Minervamon feedback)

**Date:** 2026-05-23
**Agent:** Sonnet coding agent (spawned by Lopmon)
**Task:** Address Minervamon's three review findings on PR #9 before merge.
**Worktree:** `C:\Users\Araly\edify-os-sprint-a-onboarding`
**Branch:** `lopmon/sprint-a-org-creation-onboarding`
**PR:** https://github.com/clm-studios/edify-os/pull/9 (DRAFT — do not auto-merge)
**Commits:** `54b9f98` (fixes), `6dd0b38` (/simplify)
**Status:** COMPLETE — all three findings addressed, typecheck clean, /simplify run, pushed.

---

## (1) Schema verification — onboarding_completed_at

Independent grep confirmed: `onboarding_completed_at timestamptz` exists at
`supabase/migrations/00001_core_tenancy.sql:15`. No migration needed.
Lopmon's pre-spawn report was correct. Item pre-resolved.

---

## (2) F5 scope fix — Option β chosen

**Finding:** Users with no org/member row (authenticated but never visited
`/onboarding`) would be routed to `/dashboard/briefing` by middleware, fill the
4-step form, submit, and hit a 403 from `/api/onboarding/complete`.

**Fix — Option β (briefing-page mount check):**

`apps/web/src/app/dashboard/briefing/page.tsx` gains a `useEffect` on mount
that uses the Supabase browser client to `auth.getUser()` then query `members`
for the user's row. If no member row → `router.replace('/onboarding')`. The
form is hidden behind a `checkingOrg` loading state (Loader2 spinner) until the
check resolves. No form flash for no-org users.

On Supabase absent (dev/mock) or any check error → falls through to form render
(safe; the API's 403 is the last line of defense).

**Why Option β over α and γ:**

- Option α (middleware DB hit): adds a DB round-trip on every request.
  The cookie approach was chosen to avoid this.
- Option γ (API redirect): user fills all 4 steps before discovering they can't
  submit — worst UX.
- Option β: one members query on briefing page load only, zero middleware impact,
  form never shown to no-org users.

---

## (3) Docstring inaccuracy — fixed

`apps/web/src/app/api/onboarding/complete/route.ts` docstring now accurately
describes sequential write with PRD-accepted partial-success semantics. Removed
false "transactional write with manual rollback" claim. Also updated inline
comment at the write step (step 4).

---

## (4) Dead code — removed

Removed `const COMPLETE_KEY = 'edify_briefing_completed'` and its only
`localStorage.setItem(COMPLETE_KEY, 'true')` call from `briefing/page.tsx`.
`BriefingComplete` import was already absent (previous agent removed it).

---

## /simplify findings and fixes

1. Spinner reuse — replaced hand-rolled CSS spinner with `Loader2` from
   lucide-react (already used in Step4Documents.tsx in same subtree).
2. Trimmed `checkingOrg` state comment to WHY only.
3. No other issues found.

---

## Files changed

- `apps/web/src/app/api/onboarding/complete/route.ts` — docstring + inline comment
- `apps/web/src/app/dashboard/briefing/page.tsx` — F5 Option β + dead code + spinner reuse

---

## Notes

- PR is DRAFT. No auto-merge. Awaiting Minervamon/Citlali eyes-on + migration 00037 apply.
- No new migrations in this fix-pass.

---

# SESSION-LOG — fix(dashboard): F1 org-guard + onboarding autofill fixes

**Identity:** Sonnet coding agent (spawned by Lopmon)
**Branch:** `lopmon/fix-dashboard-org-guard-plus-autofill`
**Worktree:** `C:\Users\Araly\edify-os-dashboard-org-guard`
**Base:** `origin/main` @ `a3d8010` (Sprint A merged 2026-05-23)
**Date:** 2026-05-23
**Task:** Fix three issues from Minervamon's Sprint A smoke test on fresh +test1 no-org account

---

## What I built

### Item 1 — Layout-level org-guard

Converted `apps/web/src/app/dashboard/layout.tsx` from a `'use client'` component to a Server Component. Extracted client-side UI (Sidebar, providers, widgets) into new `apps/web/src/app/dashboard/dashboard-shell.tsx` client component.

Guard logic (evaluated server-side on every `/dashboard/*` route):
1. Demo mode bypass (`NEXT_PUBLIC_DEMO_MODE=true` + `edify_demo` cookie) → render shell without DB call
2. Supabase not configured → render shell (dev/mock pass-through)
3. `!user` → `redirect('/login')`
4. `user && !orgId` → `redirect('/onboarding')`

Closes two bugs: F1 org-guard gap on `/dashboard` itself, and logged-out shell render via Edge session misfires.

### Item 2 — Onboarding autofill fixes

`apps/web/src/app/(auth)/onboarding/page.tsx`:
- Organization Name input: `autocomplete="off"` (stops Chrome email autofill)
- Anthropic API key input: `autocomplete="new-password"` (defeats Chrome password autofill; keeps `type="password"` native masking)

### Item 3 — Client-side org check

Kept existing `useEffect` in `/dashboard/briefing/page.tsx`. Belt-and-suspenders. Documented decision in PR body and commit message.

---

## /simplify findings

1. Dead code: unreachable `!user` guard after combined-null block → removed by restructuring to hoist `supabaseConfigured` check before `getAuthContext()` call
2. Narration comments in `layout.tsx` → stripped; non-obvious WHY kept in JSDoc
3. `dashboard-shell.tsx` JSDoc change-narration → replaced with present-state description

---

## Files changed

| File | Change |
|------|--------|
| `apps/web/src/app/dashboard/layout.tsx` | Server Component with auth/org guard |
| `apps/web/src/app/dashboard/dashboard-shell.tsx` | New — client-side shell |
| `apps/web/src/app/(auth)/onboarding/page.tsx` | autocomplete attrs |

---

## Notes

- TypeScript passes clean on both commits.
- PR #10 is DRAFT: https://github.com/clm-studios/edify-os/pull/10
- No auto-merge. Minervamon reviews before merge.
- Performance note: every dashboard page request now hits two Supabase calls (auth.getUser + members query) server-side. New latency vs correctness tradeoff. Worth monitoring in Vercel logs post-merge.
- No migrations needed.

---

# SESSION-LOG — fix(cache): Cache-Control: no-store on auth-gated routes

**Identity:** Sonnet coding agent (spawned by Lopmon)
**Branch:** `lopmon/fix-auth-routes-no-store`
**Worktree:** `C:\Users\Araly\edify-os-no-store-cache`
**Base:** `origin/main` @ `2fdf65d` (PR #10 merged 2026-05-23)
**Date:** 2026-05-24
**Task:** Add `Cache-Control: no-store` to auth-gated routes (`/dashboard/*` and `/onboarding`) to prevent browser and Vercel CDN from serving stale authorized snapshots.
**PR:** https://github.com/clm-studios/edify-os/pull/11 (DRAFT — do not auto-merge)
**Commit:** `8507b2b`
**Status:** COMPLETE — 2 files changed, typecheck clean, /simplify run.

---

## Bug context

Minervamon's smoke test of PR #10 found two caching issues:

1. **`/dashboard` browser-cached.** Same-URL navigation served a stale authorized HTML snapshot (`transferSize: 0`, `navType: 'navigate'`) — the server-side guard in `dashboard/layout.tsx` never ran. Only novel URLs (`/dashboard?x=1`) or no-store requests reached the server.
2. **`/onboarding` browser-cached.** A pre-PR-#10 version of the page was served (missing `autocomplete` attrs added in PR #10). Hard-refresh confirmed the deployed code was correct — the browser had served stale HTML.
3. **Vercel CDN compounds it.** `X-Vercel-Cache: HIT` observed on responses. Next.js's default `Cache-Control: public, max-age=0, must-revalidate` is permissive enough for Vercel edge caching + browser disk cache reuse.

---

## Option chosen: A (force-dynamic + revalidate = 0)

Added to `dashboard/layout.tsx` (subtree enforcement for all `/dashboard/*`) and `(auth)/onboarding/layout.tsx`:

```ts
export const dynamic = 'force-dynamic';
export const revalidate = 0;
```

**Why Option A over B/C:**
- Option A is the canonical Next.js App Router declarative approach. Already used in this codebase at `apps/web/src/app/api/team/[slug]/chat/route.ts`.
- Option B (explicit `next/headers` header writes) — more verbose, same effect, more surface area.
- Option C (middleware) — couples cache policy to auth gating, harder to trace.

`force-dynamic` causes Next.js to emit `Cache-Control: no-store` on all responses in the subtree. `revalidate = 0` is belt-and-suspenders for ISR-adjacent paths (documented in the comment as intentional, not redundant).

---

## Files changed

| File | Change |
|------|--------|
| `apps/web/src/app/dashboard/layout.tsx` | +`dynamic`/`revalidate` exports + security comment |
| `apps/web/src/app/(auth)/onboarding/layout.tsx` | +`dynamic`/`revalidate` exports + security comment |

2 files, 31 insertions (all comments + 2 export lines per file).

---

## /simplify findings

Three review passes (reuse, quality, efficiency) — no issues found.

- **Reuse:** Pattern matches existing `export const dynamic = "force-dynamic"` in `api/team/[slug]/chat/route.ts`. No new abstractions needed.
- **Quality:** `revalidate = 0` is technically redundant when `force-dynamic` is set, but it is documented as intentional belt-and-suspenders. Not removed.
- **Efficiency:** API routes (`/api/*`) don't need this — they return JSON and are not CDN-cached by default. Only the two page-level auth-gated layouts needed the fix. Scope is correct.

---

## Boundaries respected

- Landing page, `/login`, `/signup`, and all other unauthenticated routes untouched.
- No blanket root-layout caching disable.
- No unrelated code touched.

---

## Notes

- PR #11 is DRAFT. Minervamon reviews + smokes before merge.
- No migrations needed.
- No environment variable changes needed.

---

## 2026-05-24 — fix(pwa): exclude /dashboard + /onboarding from SW cache; bump to v3 (PR #12)

- **Agent:** Sonnet coding agent (spawned by Lopmon)
- **Branch:** `lopmon/fix-sw-exclude-auth-routes`
- **Worktree:** `C:\Users\Araly\edify-os-sw-auth-exclude`
- **Base:** `origin/main` @ `e3f8788` (PR #11 merged 2026-05-24)
- **PR:** https://github.com/clm-studios/edify-os/pull/12 (DRAFT — Minervamon to smoke test before merge)
- **Commits:** `1015d2c` (fix), `1f05508` (simplify)
- **Status:** COMPLETE

### Bug

Minervamon's post-PR-#11 smoke test identified a third cache layer that `Cache-Control: no-store` cannot reach: the PWA Service Worker. The existing SW (`edify-pwa-v2`) applied a `stale-while-revalidate` strategy to ALL HTML navigation requests, which caused authenticated snapshots of `/dashboard/inbox`, `/dashboard/tasks`, `/dashboard/team/marketing_director`, RSC payloads, and other auth-gated routes to be stored in Cache Storage (196 entries total, 134 non-static). On a same-URL revisit the SW intercepted and served the stale cached response — bypassing the server-side session guards from PRs #9–#11. Live symptom: `transferSize: 0` on `/dashboard` nav.

### PWA Config Flavor

**Custom hand-written service worker** — `apps/web/public/sw.js`, registered via `RegisterServiceWorker.tsx`. No `next-pwa`, no `serwist`, no Workbox. Pure vanilla SW API.

### Fix (Option A — full exclusion)

Added `AUTH_GATED_PREFIXES = ["/dashboard", "/onboarding"]` constant and an early-return guard in the `fetch` event handler before any other routing logic. When a request's pathname starts with an auth-gated prefix, the handler returns without calling `event.respondWith()` — the browser handles the request natively with zero SW cache involvement (no read, no write).

Also removed `/dashboard` from the `APP_SHELL` pre-cache list (it was the only auth-gated entry in the install-time list).

### Cache version bump

`edify-pwa-v2` → `edify-pwa-v3`. The activate event purges all buckets that don't match `CACHE_VERSION`, which evicts every stale authenticated Cache Storage entry on users' next visit. Without this bump, existing installs keep the stale v2 cache.

### Files changed

- `apps/web/public/sw.js` — 1 file, 25 insertions, 2 deletions (main fix) + 1 simplify cleanup

### /simplify findings

One quality issue found and fixed: redundant inline comment `// Let the browser handle the request natively (no event.respondWith)` on the `return` statement — the block comment above already explained the WHY. Removed. No reuse or efficiency issues found.

### Boundaries respected

- Static assets (JS chunks, CSS, fonts, images, `/` landing) continue to use cache-first/SWR — no PWA perf regression.
- Auth-gated route exclusion covers both navigation AND sub-resource requests (the `.some()` check runs before the `navigate` mode check, so RSC payloads fetched under auth-gated paths are also excluded).
- No other files touched.

### Notes

- PR #12 is DRAFT. Minervamon reviews + smokes before merge.
- No migrations needed.
- No environment variable changes needed.
- If new auth-gated route groups are added in future, append to `AUTH_GATED_PREFIXES` and bump `CACHE_VERSION`.
- The fix is deploy-safe: `force-dynamic` degrades gracefully in dev (no caching there anyway).
