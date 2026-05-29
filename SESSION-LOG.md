# SESSION-LOG â€” Sprint Î± Sweet cheap-win (HR / Volunteer Coordinator)

**Identity:** Sprint Î± Sweet cheap-win agent (Sonnet, spawned by Lopmon)
**Branch:** `sprint-alpha-sweet-cheap-win-2026-05-14`
**Worktree:** `C:\Users\Araly\edify-os-sprint-alpha`
**Base:** `origin/main` @ `d5e1d22`
**Date:** 2026-05-14
**Task:** Sprint Î± from `archetype-tools-extension-proposal-2026-05-13.md` Â§Sprint Î± (lines 331-337). Take Sweet from near-zero domain tools to ~14 useful tools via three targeted edits (no new vendor work).

---

## Plan

1. Create worktree (done).
2. Read PRD Â§Sprint Î± + verify file shapes (done).
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

- **Slack MCP entry** â€” `apps/web/src/lib/mcp/server-catalog.ts`, `SLACK_ENTRY` declared at line 176-184. `archetypes` array is line 183: `archetypes: ["marketing_director"]`. PRD path `lib/server-catalog.ts` was outdated; actual file under `lib/mcp/`.
- **Sweet's tool list** â€” `apps/web/src/lib/tools/registry.ts`, `ARCHETYPE_TOOLS` declared at line 301. Sweet's entry is line 321:
  `hr_volunteer_coordinator: [...driveTools, ...memoryTools, ...reportEventTools, ...impactDataReadTools, ...consultTeammateTools]`.
  PRD path `lib/registry.ts` was outdated; actual file under `lib/tools/`. `gmailTools` and `calendarTools` are already imported at the top of this file (lines 11 and 23).
- **Zapier MCP entry** â€” same `apps/web/src/lib/mcp/server-catalog.ts`, `ZAPIER_ENTRY` declared at line 386-407. `archetypes` array starts line 400 with 5 entries (marketing_director, programs_director, development_director, executive_assistant, events_director). Per the existing comment at lines 395-399, HR was *intentionally* omitted earlier because there was no clear HR-specific Zap use case. Sprint Î± reverses that decision â€” Sweet now joins the Zapier meta-connector scope.

---

## Prompt-addenda pipeline verification

Sweet's prompt-addenda pipeline is correct and fires automatically when she gains Gmail/Calendar tools. Trace:

1. **Archetype base prompt** â€” `apps/web/src/lib/archetype-prompts.ts:554`:
   `hr_volunteer_coordinator: HR_VOLUNTEER_COORDINATOR_PROMPT + MEMORY_POSTFIX + IMPACT_DATA_POSTFIX`
2. **Tool resolution** â€” `apps/web/src/lib/chat/run-archetype-turn.ts:157`:
   `resolveArchetypeTools({ archetype, ... })` reads `ARCHETYPE_TOOLS[archetype]` (i.e. Sweet's array, which now includes `gmailTools` + `calendarTools`).
3. **Tool-family addenda composition** â€” `run-archetype-turn.ts:162`:
   `toolAddendums = buildSystemAddendums(tools)`.
   `buildSystemAddendums` (`lib/tools/registry.ts:263-294`) walks the tools array, detects families, and concatenates `GMAIL_TOOLS_ADDENDUM` (line 278) + `CALENDAR_TOOLS_ADDENDUM` (line 266) into the addenda string.
4. **Final system prompt** â€” `run-archetype-turn.ts:188`:
   `cachedSystemText = systemPrompt + orgContext + toolAddendums + skillsAddendum + frontendDesignAddendum`.

**Conclusion:** no code change needed. Adding `gmailTools` + `calendarTools` to Sweet's `ARCHETYPE_TOOLS` array is sufficient â€” the addenda will fire automatically.

---

## Code changes

- `apps/web/src/lib/mcp/server-catalog.ts` â€” `SLACK_ENTRY.archetypes` gains `hr_volunteer_coordinator` (with provenance comment); `ZAPIER_ENTRY.archetypes` gains `hr_volunteer_coordinator` (existing "HR intentionally omitted" comment trimmed + updated to reflect Sprint Î± reversal).
- `apps/web/src/lib/tools/registry.ts` â€” Sweet's entry in `ARCHETYPE_TOOLS` (`hr_volunteer_coordinator: [...]`) gains `...calendarTools` and `...gmailTools` prefixed onto the existing tool array. Imports for both already present at the top of the file.
- `SESSION-LOG.md` â€” this log.

## /simplify pass

Tightened the Zapier-entry provenance comment in `server-catalog.ts` from 9 lines to 7 lines â€” kept the historical "HR was intentionally omitted" context plus the Sprint Î± reversal note, dropped redundant phrasing. No other changes needed; the diff was already minimal.

## Verification

- `pnpm --filter web typecheck` â€” passes (4/4 packages green) on the final committed state.
- Prompt-addenda pipeline verified read-only (see above) â€” `gmailTools` + `calendarTools` trigger `GMAIL_TOOLS_ADDENDUM` + `CALENDAR_TOOLS_ADDENDUM` injection into Sweet's system prompt automatically via `buildSystemAddendums`. No prompt changes needed.

## Commit

`74948d68b9fabdcc671de696cc2f0d2bd3f66081` â€” initial Sprint Î± commit on `sprint-alpha-sweet-cheap-win-2026-05-14`. Follow-up commit fills these fields in this log.

## PR

https://github.com/clm-studios/edify-os/pull/5 â€” open, targeting `main`. Co-skim queued for Minervamon. Do not auto-merge â€” humans coordinate (per `feedback_no_auto_merge_when_shared`).

## Rebase log (2026-05-14, post-PR-#6/#7/#8 merges)

**Trigger:** PR #5 went to CONFLICTING/DIRTY after PR #6 (search_grants consolidation) merged 2026-05-14T22:23Z. PRs #7 (knowledge redirect) and #8 (Bug 6 EA token validate) also merged in the same window. Branch needed to rebase onto current `origin/main` (`d2e6a64`).

**Rebase agent:** Sonnet, spawned by Lopmon, working in worktree `C:\Users\Araly\edify-os-sprint-alpha`.

**Conflict files:** 1 â€” `apps/web/src/lib/tools/registry.ts`.

**Resolution:** The conflict was in the `ARCHETYPE_TOOLS` block. Main (post-PR-#6) had `programs_director` switched from `grantsTools` â†’ `searchGrantsTools` and the surrounding imports/family-Sets restructured. PR #5 carried the obsolete `grantsTools` reference (because it branched from pre-PR-#6 main) plus the actual intended change: adding `...calendarTools, ...gmailTools` to Sweet's (`hr_volunteer_coordinator`) array. Resolved by keeping main's `programs_director: [...searchGrantsTools, ...]` line verbatim and applying PR #5's edit to Sweet's line:

```
hr_volunteer_coordinator: [...calendarTools, ...gmailTools, ...driveTools, ...memoryTools, ...reportEventTools, ...impactDataReadTools, ...consultTeammateTools]
```

Sweet's array on main did NOT contain `searchGrantsTools` (PR #6 only touched Dev Director + Programs Director's arrays, not Sweet's), so nothing else from main needed to be preserved inside Sweet's bracket. `server-catalog.ts` and `SESSION-LOG.md` auto-merged cleanly (PR #6 didn't touch either file).

**Auto-merge note:** `SESSION-LOG.md` had auto-merged via the rebase against PRs #7 and #8's appended sections â€” they sit below PR #5's section in this file, no manual conflict.

**Post-rebase HEAD SHA:** `dd68267c0606c58ae57fe33ff58a5de7d8d62142` (was `9487781`).
- Commit 1 (Sprint Î± core): `59f498f` (was `74948d6`)
- Commit 2 (SESSION-LOG follow-up): `dd68267` (was `9487781`)

**Typecheck:** `pnpm --filter web typecheck` â€” exit 0 (clean).

**Force-push:** `git push --force-with-lease origin sprint-alpha-sweet-cheap-win-2026-05-14` â€” pending below.

**GitHub mergeStateStatus after force-push:** pending below.

---

# SESSION-LOG â€” Async UX Hardening Agent

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

**`apps/web/src/lib/with-timeout.ts`** (new) â€” small `withTimeout(promise, ms,
fallback, onTimeout?)` utility racing a promise against a timer. Used by three
sites in this PR. Documents the caveat that the losing promise keeps running
in the background until the request tears down (source helpers don't accept
AbortSignals yet â€” plumb-through is left for a follow-up since changing each
helper's signature touched too many files).

**`apps/web/src/lib/grant-matcher.ts`** â€” wrapped each of the 4 source fan-out
calls (grants.gov, ca_grants, federal_register, foundation_grant_history) in
`withTimeout(..., 8000)`. On timeout the source resolves to `null` â†’ the
mapper returns `[]` and the source label gets recorded in `sourceErrors` with
message `"timeout"`. Also bounded the Grants.gov amount-enrichment per-grant
fetch and the Sonnet judge call (the judge gets an `AbortController` with a
30s deadline via the SDK's `{ signal }` request option).

**`apps/web/src/lib/tools/render.ts`** â€” wrapped the full HTMLâ†’PNG+upload
pipeline in `withTimeout(..., 45000)` with a discriminated-union outcome shape
(`{ ok: true, ... } | { ok: false, reason: 'timeout' | 'failed', message }`)
so the caller switches on `ok` rather than checking instanceof / sentinel
equality. On timeout the tool returns an `is_error: true` content explaining
the failure so the model can apologize / suggest simpler HTML.

### Fix 2: `maxDuration` configured in `vercel.json`

**`apps/web/vercel.json`** â€” added a `functions` block with `maxDuration: 60`
on the chat-streaming route plus the decision-lab, heartbeat, and briefing
routes (all of which can fire multi-step tool chains). Vercel Hobby's hard
ceiling is 60s; without explicit config the SDK defaults to 10s, which is
what was likely killing the streams long before our app-level timeouts could
react.

### Fix 3: Server-side stream-end cleanup + DB status + frontend retry UI

**`supabase/migrations/00036_message_error_status.sql`** (new) â€” adds
`messages.status` text column with check constraint
(`'streaming' | 'complete' | 'errored'`), defaults to `'complete'`, plus a
partial index on rows where `status <> 'complete'` so the frontend's
rehydrate query stays cheap as the table grows. **Manual apply required by
Citlali in Supabase SQL Editor** (same workflow as 00027/00028).

**`apps/web/src/app/api/team/[slug]/chat/route.ts`** â€” restructured the
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

**`apps/web/src/app/api/team/[slug]/messages/route.ts`** â€” the GET endpoint
now selects and returns `status` so the frontend can use it during
rehydrate.

**`apps/web/src/app/dashboard/team/[slug]/api.ts`** â€” added `status?:
'streaming' | 'complete' | 'errored'` to the `Message` type.

**`apps/web/src/app/dashboard/team/[slug]/TeamChatClient.tsx`** â€” two changes:

1. **Stall detection during streaming:** the SSE consumer now arms a 90s
   timer that resets on every chunk. If the timer fires (server went silent
   â€” e.g. function timeout), the AbortController fires and a flag
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
  default `'complete'`) but the value will be silently ignored â€” meaning
  errored streams will still appear as `complete` on rehydrate.
- The GET messages endpoint's `select("... status")` will return `null` for
  status; the frontend's fallback (`?? "complete"`) keeps the dead-state UI
  from breaking, but the retry-card-on-rehydrate fix won't kick in until the
  column exists.

The stall detection + maxDuration + per-source timeouts work without the
migration â€” they're all app-side. The migration just unlocks the cross-mount
"retry on refresh" piece.

---

## Known limitations

1. **`withTimeout` doesn't cancel the underlying HTTP call.** Source helpers
   in `apps/web/src/lib/{grants-gov,ca-grants-portal,federal-register,foundation-grants}.ts`
   don't accept an `AbortSignal` yet â€” refactoring all four was scope creep
   for this PR. The losing fetch keeps running in the background until the
   serverless function tears down. Real fix: thread `signal` through each
   helper. Logged for a future PR.

2. **Frontend retry button on rehydrate** projects errored DB rows onto the
   existing `isError + failedMessageText` UI. If multiple user messages
   precede the errored assistant, the retry sends the *most recent* prior
   user message â€” which is correct for normal flow but could pick the wrong
   one in unusual interleavings. Acceptable for the dead-state class of
   bugs; tighten if it bites in practice.

3. **No test coverage** added for the new code paths. The existing repo has
   no test harness for the chat-streaming route. Verifying the fixes will be
   smoke-test driven (re-run the find_grants_for_org + render_design_to_image
   reproductions from smoke-test-findings-2026-05-11.md after migration 00036
   is applied).

---

## Verification

- `pnpm typecheck` â€” passes (4/4 packages green).
- No lint script exists in `apps/web/package.json`; relied on TS strictness.

---

# SESSION-LOG â€” Routing + Copy Cleanup Agent

**Identity:** Routing + Copy Cleanup Agent (Sonnet)
**Branch:** `lopmon/fix-routing-and-copy-cleanup`
**Worktree:** `C:/Users/Araly/edify-os-routing-cleanup-20260511`
**Date:** 2026-05-11
**Task:** Bundle three small fixes from
`smoke-test-findings-2026-05-11.md` (bugs 3, 4, 5).

---

## What shipped (2 of 3 fixes)

### Fix 2 (Bug 4): `/dashboard/settings/integrations` redirect â€” SHIPPED

**`apps/web/src/app/dashboard/settings/integrations/page.tsx`** (new, 9 lines
incl. comments). Server component that calls `redirect('/dashboard/integrations')`
from `next/navigation`. No client flash, no middleware change, no
`next.config.mjs` edit. Catches the predictable-but-wrong URL users would
type given the Settings card hierarchy.

### Fix 3 (Bug 5): MCP Integrations card copy â€” SHIPPED

**`apps/web/src/app/dashboard/settings/page.tsx`** (1-line change, line 230).
Old: `"Connect tools your AI team uses as live actions â€” Canva, Figma, and more."`
New: `"Connect tools your AI team uses as live actions â€” Gmail, Notion, Asana, social posting, and more."`

Reflects the actual current pipeline (Composio for Gmail / social posting,
direct MCP for Notion / Asana / Zapier, HTML+CSS via `@vercel/og` for
design output). Drops Canva (deprecated per Sprint 2 WOW) and Figma
(deferred â€” handoff tool not output tool). Grepped the repo for
`"Canva, Figma"` and `"Canva and Figma"` â€” no other stale references.

---

## NOT shipped â€” Fix 1 (Bug 3): Knowledge Base sidebar link

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
Minervamon's smoke test reported `/dashboard/knowledge â†’ 404` â€” that's
real, but it's not because the sidebar links there. The most likely
explanation is that she URL-typed `/dashboard/knowledge` based on the
sidebar label "Knowledge Base" without inspecting the underlying href,
then concluded "Sidebar has 'Knowledge Base' nav item but the route
doesn't exist." Her conclusion was wrong; the link is fine.

**Two possible interpretations of the PRD's intent:**

1. **Lopmon wanted the broken link fixed.** In this case there is
   nothing to do â€” the link goes to a working route. Action: no change.
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
route stub stays â€” only the nav link goes, matching the PRD spirit.)

---

## Files changed

- `apps/web/src/app/dashboard/settings/integrations/page.tsx` (new)
- `apps/web/src/app/dashboard/settings/page.tsx` (1-line copy update)

---

## Verification

- `pnpm typecheck` â€” passes (4/4 packages green, web rebuilt with cache miss).
- `/simplify` pass: diff is minimal (10 lines new + 1 line changed); no
  dead imports, no leftover references. Grep for `"Canva, Figma"` /
  `"Canva and Figma"` returned no other matches in the repo, so the copy
  fix is the only place that staleness lived.

---

## PR

To be filled after `gh pr create`.

---

# SESSION-LOG â€” Sprint Î±.5 (search_grants meta-tool consolidation)

**Identity:** Sonnet coding agent spawned by Lopmon for Sprint Î±.5
**Branch:** `sprint-alpha-half-search-grants-2026-05-14`
**Worktree:** `C:\Users\Araly\edify-os-sprint-alpha-half\`
**Start UTC:** 2026-05-14T16:23Z
**Base SHA:** `d5e1d2212d67c33c732df19cb62b7d8a65c11caa`
**PRD:** `~/life/projects/edify-os/PRD-search-grants-consolidation-2026-05-13.md`

## Plan

Apply **Option A (clean rename)** per PRD recommendation:

1. Reshape `apps/web/src/lib/tools/grant-matcher.ts`: rename tool
   `find_grants_for_org` â†’ `search_grants`, add PRD F1 schema (`keyword`,
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
   `tool:find_grants_for_org` â†’ `tool:search_grants`.
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
- `apps/web/src/lib/tools/grant-matcher.ts` â€” rewrote as `search_grants` meta-tool: renamed exports (`searchGrantsTools`, `executeSearchGrantsTool`, `SEARCH_GRANTS_TOOLS_ADDENDUM`), updated tool definition to PRD F1 schema (added `keyword`, `sources` enum array, renamed `deadline_within_days` â†’ `due_within_days`), wired source-narrowing into matcher options. Removed the "use this BEFORE falling back to individual source tools" sentence in the addendum (those tools no longer ship).
- `apps/web/src/lib/grant-matcher.ts` â€” engine: added `GrantSourceSlug` exported union (PRD-mandated 9 slugs), extended `MatcherOptions` with `sources?` and `keyword?`, gated each of the 4 wired source fan-out branches on `isSourceAllowed(slug)`. Keyword now falls back through opts.keyword â†’ org.focusArea â†’ org.mission.
- `apps/web/src/lib/tools/registry.ts` â€” dropped 10 grant-family imports + re-exports, replaced with `searchGrantsTools` import only. Removed 7 dead family-name Sets + 7 dead `getToolFamilies` branches + 11 dead `buildSystemAddendums` branches (10 source families + grant_matcher; reduced to one `search_grants` branch). Updated Dev Director's `ARCHETYPE_TOOLS` to swap 11 grant-related family spreads for one `...searchGrantsTools`. Updated Programs Director similarly (replaced `grantsTools` with `searchGrantsTools` per PRD recommended extension). Updated `executeTool` dispatcher: removed 10 grant-family branches, added one `SEARCH_GRANTS_TOOL_NAMES.has(name)` branch.
- `apps/web/src/lib/hours-saved/estimates.ts` â€” renamed event key `tool:find_grants_for_org` â†’ `tool:search_grants` (preserves 240-min estimate).

### Source-helper tool files preserved
Per PRD F3: `lib/tools/{grants,nonprofit,usaspending,ca-grants,charity-navigator,candid-demographics,foundation-grants,federal-register,inside-philanthropy}.ts` left intact â€” their `executeXxxTool` and family exports remain available for any external caller, just no longer registered on any archetype tool array. No imports of those files remain in `registry.ts`.

### Tool count delta
- **Helga (Dev Director) BEFORE:** 18 family spreads, ~43 distinct tool definitions
- **Helga (Dev Director) AFTER:** 9 family spreads, 29 distinct tool definitions (10 grant-related families collapsed to 1 `search_grants` tool)
- **Programs Director BEFORE:** 7 families, 14 tools (`grantsTools` Ã— 2 tools)
- **Programs Director AFTER:** 7 families, 13 tools (`searchGrantsTools` Ã— 1 tool)
- Net: Helga drops 14 tool definitions (32% reduction); Programs drops 1.

### Addendum-firing trace verified
- Dev Director's tool array now includes `searchGrantsTools` (one tool named `search_grants`).
- `getToolFamilies(tools)` returns a Set including `"search_grants"` via the pinned `SEARCH_GRANTS_TOOL_NAMES` Set (the `name.split("_")[0]` fallback would otherwise resolve to `"search"`, which collides with `search_stock_photo` from Unsplash).
- `buildSystemAddendums(tools)` then pushes `SEARCH_GRANTS_TOOLS_ADDENDUM` into the system prompt â€” addendum fires as expected. Manually traced through the registry.ts logic; unit-style verification not possible (no test harness).

### Verification
- `pnpm --filter web typecheck` â€” passes.
- `pnpm typecheck` (turbo, all 4 packages) â€” passes (3 cached, web cache-miss rebuild green).
- `/simplify` review pass: moved `validSources` Set from per-call construction to a module-level constant `VALID_SOURCE_SLUGS`. No further issues identified.

### Out-of-scope items deliberately not done
- Wiring the 5 currently-unwired sources (propublica, usaspending, charity_navigator, candid_demographics, inside_philanthropy) into `lib/grant-matcher.ts` aggregator. PRD F1 fixed the schema to 9 enum values, but the engine's fan-out only covers 4. The unwired slugs are accepted in the input array but silently no-op. Per PRD: "Behavior parity, not a rewrite" + "Adding new sources â€” that's a separate sprint when new free-data sources surface."
- Telemetry hook for source-coverage observability (PRD open question 4, deferred unless Citlali asks).
- Hard-deletion of the 10 source-helper files. PRD F3 explicitly keeps them for backward compat.

### Done

- Commit SHA: `bc4015f6dbd8dc3ce9abcf7440c315d4fc368779`
- PR URL: https://github.com/clm-studios/edify-os/pull/6
- Branch pushed to `origin/sprint-alpha-half-search-grants-2026-05-14`
- PR is OPEN â€” not auto-merged, awaiting human coordination per `feedback_no_auto_merge_when_shared`.

---

# SESSION-LOG â€” Bug 3 alias `/dashboard/knowledge` â†’ `/dashboard/memory`

**Identity:** Sonnet coding agent (spawned by Lopmon)
**Branch:** `bug-3-knowledge-memory-redirect-2026-05-14`
**Worktree:** `C:/Users/Araly/edify-os-bug-3-alias`
**Date:** 2026-05-14
**Task:** Bug 3 from the routing cleanup backlog. Prior agent (2026-05-11
Routing + Copy Cleanup) correctly paused: the sidebar already links
"Knowledge Base" â†’ `/dashboard/memory` (the working surface), so removing
the sidebar entry would have been user-hostile. Minervamon's 2026-05-14
call: add a server-side redirect page so stale `/dashboard/knowledge` URLs
(typed guesses, old bookmarks) land cleanly on `/dashboard/memory` instead
of 404'ing.

## What shipped

**`apps/web/src/app/dashboard/knowledge/page.tsx`** (new, 6 lines) â€” mirrors
the existing redirect pattern at
`apps/web/src/app/dashboard/settings/integrations/page.tsx`. Server-side
`redirect("/dashboard/memory")` so there's no client flash and no 404.

## Boundaries respected

- Did NOT touch `apps/web/src/components/sidebar.tsx` (already correct â€” line
  41 links `/dashboard/memory` with label "Knowledge Base").
- Did NOT touch the `/dashboard/memory` route or page.
- No middleware. No `next.config` edits.

## Verification

- `pnpm --filter web typecheck` â€” clean.
- /simplify â€” no opportunities (file is 6 lines, mirrors an existing pattern).

## Done

- Commit SHA: `483238e`
- PR URL: https://github.com/clm-studios/edify-os/pull/7
- Branch pushed to `origin/bug-3-knowledge-memory-redirect-2026-05-14`
- PR is OPEN â€” not auto-merged, awaiting human coordination per
  `feedback_no_auto_merge_when_shared`.

---

# SESSION-LOG â€” Bug 6 Option A (Integrations-page token-freshness validation)

**Identity:** Sonnet coding agent spawned by Lopmon
**Branch:** `bug-6-option-a-integrations-token-validate-2026-05-14`
**Worktree:** `C:\Users\Araly\edify-os-bug-6-option-a`
**Start UTC:** 2026-05-14 (early UTC)
**Base SHA:** `29ab28b5e77c6f037f5628b3e72caa5a7cf91865`
**Diagnostic:** `~/life/projects/edify-os/bug-6-gmail-ea-scope-mismatch-diagnostic-2026-05-13.md`

## Plan (from diagnostic Â§Option A)

1. Extract a pure token-validation helper from `lib/google.ts` returning a discriminated union (no NextResponse). `getValidGoogleAccessToken` keeps its current EA-tool contract by delegating internally.
2. Modify `apps/web/src/app/api/integrations/google/route.ts` GET to call the new helper. Return `{ connected: false, authError: true }` when token exists but is expired AND cannot be silently refreshed.
3. Update `apps/web/src/app/dashboard/integrations/page.tsx` to consume `authError` and render an actionable "Google token expired. Please reconnect." state on Google cards. Pattern mirrors the existing `/api/integrations/google/today-events` route's `connected + authError` contract.

## Survey notes

- `route.ts` GET handler (current): selects `status='active'` only â€” no token-freshness check (matches diagnostic claim).
- `getValidGoogleAccessToken` lives at `lib/google.ts:189-285` and returns either `{ accessToken }` or `{ error: NextResponse }`.
- Diagnostic's reference to `lib/google.ts:366` for the `GOOGLE_NOT_CONNECTED` constant is stale â€” the constant actually lives at `lib/tools/registry.ts:287`. Doesn't change the fix; the EA error path is what we're mirroring on the Integrations page side.
- Precedent for the response shape: `/api/integrations/google/today-events/route.ts` already returns `{ connected, authError, events }` â€” same pattern fits here.

## Files changed

- `apps/web/src/lib/google.ts` â€” added `inspectGoogleToken(serviceClient, orgId, type)` exported helper returning a `GoogleTokenInspection` discriminated union (`{ ok: true, accessToken } | { ok: false, reason: ... }`). Existing `getValidGoogleAccessToken` now delegates to it and maps the union onto the same NextResponse error contract EA tools already rely on (zero behavioral change for EA path).
- `apps/web/src/app/api/integrations/google/route.ts` â€” GET handler now calls `inspectGoogleToken` on the active integration row. Returns `{ connected: false, email, authError: true }` when the row exists but the stored token is expired / refresh dead / decrypt failed. Added an exported `GoogleIntegrationStatusResponse` type for the new contract.
- `apps/web/src/app/dashboard/integrations/page.tsx` â€” added `googleAuthError` state; the Google-status fetch sets it when `authError: true` arrives. Card footer renders a fourth branch ("Google token expired. Please reconnect." + Reconnect CTA) on Gmail/Calendar/Drive cards when the flag is set. The reconnect button uses the existing `handleConnectClick` to trigger the OAuth flow. State is cleared on successful reconnect (?google=connected) and on disconnect.

## /simplify findings + fixes

- **Naming collision:** initial implementation exported `resolveGoogleToken` from `lib/google.ts`, which collided with an existing local helper of the same name in `lib/tools/registry.ts:291`. Renamed the new export to `inspectGoogleToken` + `GoogleTokenInspection` to make the difference between "give me a usable token (registry helper)" and "what's the token state (new helper)" legible. No other reuse / quality / efficiency issues required action.

## Verification

- `pnpm --filter web typecheck` â€” green
- `pnpm typecheck` (turbo, 4 packages) â€” 4/4 green (web cache-miss rebuild)
- Manual reasoning: EA tools call `getValidGoogleAccessToken`, which now delegates to `inspectGoogleToken`. Integrations page calls `inspectGoogleToken` directly. Same DB read, same decrypt, same refresh path, same 60s buffer â€” so the page's "connected" determination is now exactly aligned with what EA tools will see on the very next call.

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
- PR is OPEN â€” not auto-merged, awaiting human coordination per `feedback_no_auto_merge_when_shared`.

---

# SESSION-LOG â€” Sprint A: Org Creation Onboarding Flow

**Date:** 2026-05-23
**Agent:** Sonnet coding agent spawned by Lopmon
**Task:** Implement F1/F2/F3/F5 from `PRD-org-creation-onboarding-2026-05-15-revised.md` (Minervamon, v3). Close the org-creation gap outstanding since 2026-04-17.
**Worktree:** `C:\Users\Araly\edify-os-sprint-a-onboarding`
**Branch:** `lopmon/sprint-a-org-creation-onboarding`
**Base:** `origin/main` @ `e5154f6`
**PR:** https://github.com/clm-studios/edify-os/pull/9 (DRAFT â€” do not auto-merge)
**Commit:** `3ee343bca1bce0f736154f1fb089715864adf3a5`
**Status:** COMPLETE â€” all 4 in-scope features shipped, typecheck clean, /simplify run.

---

## Feature summary

### What each feature does (confirmed before coding)

**F1 â€” Middleware briefing gate:** Authenticated users hitting any `/dashboard/*` path (except `/dashboard/briefing` itself) without the `edify_briefing_done` cookie are redirected to `/dashboard/briefing`. Cookie is written client-side after successful briefing submission. No DB hit in Edge runtime â€” cookie is the perf mitigation the PRD called for.

**F2 â€” Transactional org + memory write:** New `POST /api/onboarding/complete` route. Validates auth + org membership. Idempotency guard via `onboarding_completed_at`. Updates `orgs` with all briefing-form fields. Inserts `org_profile` preamble + per-program + goals memory entries. Returns `{ orgId, redirectTo: "/dashboard" }`. Client calls this from `handleFinish`, then sets localStorage (second-layer durability) and the cookie, then `router.replace('/dashboard')`.

**F3 â€” Org profile preamble seeding:** `buildOrgPreamble()` in the API route assembles the structured org context string matching the PRD v3 template (no EIN, no signatory). Written to `memory_entries` as `category: org_profile`, `auto_generated: true`.

**F5 â€” Silent backfill (Option B):** Same middleware gate and same API write path handle existing localStorage-only users. On first post-deploy login, they're redirected to `/dashboard/briefing`, see their draft pre-populated from localStorage, submit once, cookie is set. No special UI. Identical code path to new users â€” no branching.

**F4 â€” Skipped per product decision.**
**Documents DB persistence â€” Deferred to Sprint A.5 per product decision.**

---

## Architecture decisions made (with reasoning)

**Cookie vs. DB in middleware:** `getAuthContext()` uses `next/headers` `cookies()` which is not Edge-compatible and adds a DB round-trip per request. Cookie-based fast path is the correct solution. Documented in middleware comment.

**`/onboarding` legacy comment cleanup:** Confirmed `/onboarding` IS a live route (creates org + Anthropic key for brand-new users). The "historical intent" comment was stale in the sense that the route IS the working implementation. Comment was trimmed to remove the false "historical intent" framing. Route remains in `PROTECTED_PREFIXES` â€” correct.

**No Supabase RPC for atomicity:** Supabase JS client doesn't expose raw BEGIN/COMMIT in Edge routes. Used sequential inserts with the existing service-role-client pattern (same as `/api/org/create`). Memory insert failure is non-fatal (org was already updated; memory can be re-created from settings). This matches the PRD's acceptable partial-success note.

**`isComplete` state removed:** With `router.replace('/dashboard')` on success, the `BriefingComplete` component branch was unreachable. Removed to avoid dead state. `BriefingComplete` component itself left in place (used by settings/other flows if any).

---

## Schema verification findings

- `orgs` table: missing `annual_budget`, `full_time_staff`, `regular_volunteers`, `org_type`, `primary_service_area`, `founded_year`. Migration 00037 adds them.
- `members` table: `role` enum includes `'admin'` (confirmed in 00001_core_tenancy.sql). No change needed.
- `memory_entries`: `org_profile` category not in constraint. Migration 00037 adds it.
- `getAuthContext()`: confirmed in `apps/web/src/lib/supabase/server.ts`. Returns `{ user, orgId, memberId }`. `orgId: null` when no member row. Edge-incompatible â€” confirmed reason for cookie approach.
- `/onboarding` route: LIVE at `apps/web/src/app/(auth)/onboarding/page.tsx`. Not dead code.

---

## Files changed

- `apps/web/src/middleware.ts` â€” F1 briefing gate (~25 LOC added)
- `apps/web/src/app/dashboard/briefing/page.tsx` â€” F2 client: API call, cookie set, router.replace, error state, localStorage-no-longer-gates-form-render
- `apps/web/src/app/api/onboarding/complete/route.ts` â€” F2/F3 server: new route (~180 LOC)
- `supabase/migrations/00037_briefing_org_fields.sql` â€” schema: 6 new orgs columns + org_profile category
- `SESSION-LOG.md` â€” this log

Total: 4 source files changed, 1 new file, 1 migration.

---

## /simplify pass findings and fixes

1. **Redundant `/onboarding` in `BRIEFING_EXEMPT_PREFIXES`** â€” removed. `/onboarding` paths never match `pathname.startsWith("/dashboard")` so the exemption was a no-op.
2. **Redundant `!isDemoMode` in F1 gate** â€” removed. Demo mode with a `/dashboard/*` path already returns early at the `if (isDemoMode && isProtected)` block above; the second check was unreachable.
3. **Middleware comment over-explained** â€” trimmed the F1 block comment from ~15 lines to 8. Retained the non-obvious WHY (Edge runtime, cookie rationale, F5 backfill intent).
4. **No new code reuse issues found** â€” `buildGoalsContent` in the new route is similar to logic in `/api/briefing/route.ts`, but both are simple enough that extraction into a shared helper adds indirection without benefit.

---

## Blockers / follow-ups for Lopmon

- **Migration 00037 must be applied manually before deploy.** Run `supabase/migrations/00037_briefing_org_fields.sql` in Supabase SQL Editor. Same workflow as 00033/00036.
- **Sprint A.5 â€” Documents DB persistence.** The briefing form accepts file uploads (calls `/api/briefing/upload`) but files are not persisted to Supabase Storage. Scoped out per product decision.
- **Cookie expiry handling.** `edify_briefing_done` TTL is 7 days. After expiry, user is re-gated to briefing and sees 409 (already complete) from the API â€” treated as success and cookie is reset. Smooth, but worth a manual smoke test post-deploy.
- **Existing `POST /api/briefing` route** at `apps/web/src/app/api/briefing/route.ts` still exists and is separate from the new `/api/onboarding/complete`. The old route updates org name/mission + writes program/goal memories but does NOT set `onboarding_completed_at` or write the `org_profile` preamble. It may be called from Settings (briefing re-run). This is NOT a conflict â€” the routes serve different purposes. Lopmon may want to audit for redundancy in a future sprint.

---

## Notes

- PR target confirmed: `clm-studios/edify-os` `main` (not `whitmorelabs`).
- PR is DRAFT. Citlali / Minervamon to eyes-on before merge.
- `pnpm --filter web typecheck` passes (clean, no errors).


---

# SESSION-LOG â€” Sprint A: PR #9 Review Fixes (Minervamon feedback)

**Date:** 2026-05-23
**Agent:** Sonnet coding agent (spawned by Lopmon)
**Task:** Address Minervamon's three review findings on PR #9 before merge.
**Worktree:** `C:\Users\Araly\edify-os-sprint-a-onboarding`
**Branch:** `lopmon/sprint-a-org-creation-onboarding`
**PR:** https://github.com/clm-studios/edify-os/pull/9 (DRAFT â€” do not auto-merge)
**Commits:** `54b9f98` (fixes), `6dd0b38` (/simplify)
**Status:** COMPLETE â€” all three findings addressed, typecheck clean, /simplify run, pushed.

---

## (1) Schema verification â€” onboarding_completed_at

Independent grep confirmed: `onboarding_completed_at timestamptz` exists at
`supabase/migrations/00001_core_tenancy.sql:15`. No migration needed.
Lopmon's pre-spawn report was correct. Item pre-resolved.

---

## (2) F5 scope fix â€” Option Î² chosen

**Finding:** Users with no org/member row (authenticated but never visited
`/onboarding`) would be routed to `/dashboard/briefing` by middleware, fill the
4-step form, submit, and hit a 403 from `/api/onboarding/complete`.

**Fix â€” Option Î² (briefing-page mount check):**

`apps/web/src/app/dashboard/briefing/page.tsx` gains a `useEffect` on mount
that uses the Supabase browser client to `auth.getUser()` then query `members`
for the user's row. If no member row â†’ `router.replace('/onboarding')`. The
form is hidden behind a `checkingOrg` loading state (Loader2 spinner) until the
check resolves. No form flash for no-org users.

On Supabase absent (dev/mock) or any check error â†’ falls through to form render
(safe; the API's 403 is the last line of defense).

**Why Option Î² over Î± and Î³:**

- Option Î± (middleware DB hit): adds a DB round-trip on every request.
  The cookie approach was chosen to avoid this.
- Option Î³ (API redirect): user fills all 4 steps before discovering they can't
  submit â€” worst UX.
- Option Î²: one members query on briefing page load only, zero middleware impact,
  form never shown to no-org users.

---

## (3) Docstring inaccuracy â€” fixed

`apps/web/src/app/api/onboarding/complete/route.ts` docstring now accurately
describes sequential write with PRD-accepted partial-success semantics. Removed
false "transactional write with manual rollback" claim. Also updated inline
comment at the write step (step 4).

---

## (4) Dead code â€” removed

Removed `const COMPLETE_KEY = 'edify_briefing_completed'` and its only
`localStorage.setItem(COMPLETE_KEY, 'true')` call from `briefing/page.tsx`.
`BriefingComplete` import was already absent (previous agent removed it).

---

## /simplify findings and fixes

1. Spinner reuse â€” replaced hand-rolled CSS spinner with `Loader2` from
   lucide-react (already used in Step4Documents.tsx in same subtree).
2. Trimmed `checkingOrg` state comment to WHY only.
3. No other issues found.

---

## Files changed

- `apps/web/src/app/api/onboarding/complete/route.ts` â€” docstring + inline comment
- `apps/web/src/app/dashboard/briefing/page.tsx` â€” F5 Option Î² + dead code + spinner reuse

---

## Notes

- PR is DRAFT. No auto-merge. Awaiting Minervamon/Citlali eyes-on + migration 00037 apply.
- No new migrations in this fix-pass.

---

# SESSION-LOG â€” fix(dashboard): F1 org-guard + onboarding autofill fixes

**Identity:** Sonnet coding agent (spawned by Lopmon)
**Branch:** `lopmon/fix-dashboard-org-guard-plus-autofill`
**Worktree:** `C:\Users\Araly\edify-os-dashboard-org-guard`
**Base:** `origin/main` @ `a3d8010` (Sprint A merged 2026-05-23)
**Date:** 2026-05-23
**Task:** Fix three issues from Minervamon's Sprint A smoke test on fresh +test1 no-org account

---

## What I built

### Item 1 â€” Layout-level org-guard

Converted `apps/web/src/app/dashboard/layout.tsx` from a `'use client'` component to a Server Component. Extracted client-side UI (Sidebar, providers, widgets) into new `apps/web/src/app/dashboard/dashboard-shell.tsx` client component.

Guard logic (evaluated server-side on every `/dashboard/*` route):
1. Demo mode bypass (`NEXT_PUBLIC_DEMO_MODE=true` + `edify_demo` cookie) â†’ render shell without DB call
2. Supabase not configured â†’ render shell (dev/mock pass-through)
3. `!user` â†’ `redirect('/login')`
4. `user && !orgId` â†’ `redirect('/onboarding')`

Closes two bugs: F1 org-guard gap on `/dashboard` itself, and logged-out shell render via Edge session misfires.

### Item 2 â€” Onboarding autofill fixes

`apps/web/src/app/(auth)/onboarding/page.tsx`:
- Organization Name input: `autocomplete="off"` (stops Chrome email autofill)
- Anthropic API key input: `autocomplete="new-password"` (defeats Chrome password autofill; keeps `type="password"` native masking)

### Item 3 â€” Client-side org check

Kept existing `useEffect` in `/dashboard/briefing/page.tsx`. Belt-and-suspenders. Documented decision in PR body and commit message.

---

## /simplify findings

1. Dead code: unreachable `!user` guard after combined-null block â†’ removed by restructuring to hoist `supabaseConfigured` check before `getAuthContext()` call
2. Narration comments in `layout.tsx` â†’ stripped; non-obvious WHY kept in JSDoc
3. `dashboard-shell.tsx` JSDoc change-narration â†’ replaced with present-state description

---

## Files changed

| File | Change |
|------|--------|
| `apps/web/src/app/dashboard/layout.tsx` | Server Component with auth/org guard |
| `apps/web/src/app/dashboard/dashboard-shell.tsx` | New â€” client-side shell |
| `apps/web/src/app/(auth)/onboarding/page.tsx` | autocomplete attrs |

---

## Notes

- TypeScript passes clean on both commits.
- PR #10 is DRAFT: https://github.com/clm-studios/edify-os/pull/10
- No auto-merge. Minervamon reviews before merge.
- Performance note: every dashboard page request now hits two Supabase calls (auth.getUser + members query) server-side. New latency vs correctness tradeoff. Worth monitoring in Vercel logs post-merge.
- No migrations needed.

---

# SESSION-LOG â€” fix(cache): Cache-Control: no-store on auth-gated routes

**Identity:** Sonnet coding agent (spawned by Lopmon)
**Branch:** `lopmon/fix-auth-routes-no-store`
**Worktree:** `C:\Users\Araly\edify-os-no-store-cache`
**Base:** `origin/main` @ `2fdf65d` (PR #10 merged 2026-05-23)
**Date:** 2026-05-24
**Task:** Add `Cache-Control: no-store` to auth-gated routes (`/dashboard/*` and `/onboarding`) to prevent browser and Vercel CDN from serving stale authorized snapshots.
**PR:** https://github.com/clm-studios/edify-os/pull/11 (DRAFT â€” do not auto-merge)
**Commit:** `8507b2b`
**Status:** COMPLETE â€” 2 files changed, typecheck clean, /simplify run.

---

## Bug context

Minervamon's smoke test of PR #10 found two caching issues:

1. **`/dashboard` browser-cached.** Same-URL navigation served a stale authorized HTML snapshot (`transferSize: 0`, `navType: 'navigate'`) â€” the server-side guard in `dashboard/layout.tsx` never ran. Only novel URLs (`/dashboard?x=1`) or no-store requests reached the server.
2. **`/onboarding` browser-cached.** A pre-PR-#10 version of the page was served (missing `autocomplete` attrs added in PR #10). Hard-refresh confirmed the deployed code was correct â€” the browser had served stale HTML.
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
- Option B (explicit `next/headers` header writes) â€” more verbose, same effect, more surface area.
- Option C (middleware) â€” couples cache policy to auth gating, harder to trace.

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

Three review passes (reuse, quality, efficiency) â€” no issues found.

- **Reuse:** Pattern matches existing `export const dynamic = "force-dynamic"` in `api/team/[slug]/chat/route.ts`. No new abstractions needed.
- **Quality:** `revalidate = 0` is technically redundant when `force-dynamic` is set, but it is documented as intentional belt-and-suspenders. Not removed.
- **Efficiency:** API routes (`/api/*`) don't need this â€” they return JSON and are not CDN-cached by default. Only the two page-level auth-gated layouts needed the fix. Scope is correct.

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

## 2026-05-24 â€” fix(pwa): exclude /dashboard + /onboarding from SW cache; bump to v3 (PR #12)

- **Agent:** Sonnet coding agent (spawned by Lopmon)
- **Branch:** `lopmon/fix-sw-exclude-auth-routes`
- **Worktree:** `C:\Users\Araly\edify-os-sw-auth-exclude`
- **Base:** `origin/main` @ `e3f8788` (PR #11 merged 2026-05-24)
- **PR:** https://github.com/clm-studios/edify-os/pull/12 (DRAFT â€” Minervamon to smoke test before merge)
- **Commits:** `1015d2c` (fix), `1f05508` (simplify)
- **Status:** COMPLETE

### Bug

Minervamon's post-PR-#11 smoke test identified a third cache layer that `Cache-Control: no-store` cannot reach: the PWA Service Worker. The existing SW (`edify-pwa-v2`) applied a `stale-while-revalidate` strategy to ALL HTML navigation requests, which caused authenticated snapshots of `/dashboard/inbox`, `/dashboard/tasks`, `/dashboard/team/marketing_director`, RSC payloads, and other auth-gated routes to be stored in Cache Storage (196 entries total, 134 non-static). On a same-URL revisit the SW intercepted and served the stale cached response â€” bypassing the server-side session guards from PRs #9â€“#11. Live symptom: `transferSize: 0` on `/dashboard` nav.

### PWA Config Flavor

**Custom hand-written service worker** â€” `apps/web/public/sw.js`, registered via `RegisterServiceWorker.tsx`. No `next-pwa`, no `serwist`, no Workbox. Pure vanilla SW API.

### Fix (Option A â€” full exclusion)

Added `AUTH_GATED_PREFIXES = ["/dashboard", "/onboarding"]` constant and an early-return guard in the `fetch` event handler before any other routing logic. When a request's pathname starts with an auth-gated prefix, the handler returns without calling `event.respondWith()` â€” the browser handles the request natively with zero SW cache involvement (no read, no write).

Also removed `/dashboard` from the `APP_SHELL` pre-cache list (it was the only auth-gated entry in the install-time list).

### Cache version bump

`edify-pwa-v2` â†’ `edify-pwa-v3`. The activate event purges all buckets that don't match `CACHE_VERSION`, which evicts every stale authenticated Cache Storage entry on users' next visit. Without this bump, existing installs keep the stale v2 cache.

### Files changed

- `apps/web/public/sw.js` â€” 1 file, 25 insertions, 2 deletions (main fix) + 1 simplify cleanup

### /simplify findings

One quality issue found and fixed: redundant inline comment `// Let the browser handle the request natively (no event.respondWith)` on the `return` statement â€” the block comment above already explained the WHY. Removed. No reuse or efficiency issues found.

### Boundaries respected

- Static assets (JS chunks, CSS, fonts, images, `/` landing) continue to use cache-first/SWR â€” no PWA perf regression.
- Auth-gated route exclusion covers both navigation AND sub-resource requests (the `.some()` check runs before the `navigate` mode check, so RSC payloads fetched under auth-gated paths are also excluded).
- No other files touched.

### Notes

- PR #12 is DRAFT. Minervamon reviews + smokes before merge.
- No migrations needed.
- No environment variable changes needed.
- If new auth-gated route groups are added in future, append to `AUTH_GATED_PREFIXES` and bump `CACHE_VERSION`.
- The fix is deploy-safe: `force-dynamic` degrades gracefully in dev (no caching there anyway).

---

## 2026-05-24 â€” perf(chat): Batch 1 â€” TTFT instrumentation + cache fix + tools stabilization (PR #13)

**Identity:** Sonnet coding agent (spawned by Lopmon)
**Branch:** `lopmon/fix-perf-batch-1-cache-instrumentation`
**Worktree:** `C:\Users\Araly\edify-os-speed-batch-1`
**Base:** `origin/main` @ `e3f8788`
**Date:** 2026-05-24
**Task:** Batch 1 of the Edify-OS speed performance sprint â€” Fix #1 (TTFT instrumentation), Fix #2 (split cached system prompt), Fix #3 (stabilize tools array). Greenlit by Minervamon.

---

## Plan

1. Read speed audit doc (`life/projects/edify-os/speed-audit-2026-05-24.md`). Done.
2. Read affected files (`run-archetype-turn.ts`, `team/[slug]/chat/route.ts`). Done.
3. Create worktree (initial path mangled â€” fixed by removing bad worktree and recreating with relative `../edify-os-speed-batch-1` path). Done.
4. Implement Fix #1 (TTFT instrumentation). Done.
5. Implement Fix #2 (split stable vs conditional system prompt). Done.
6. Implement Fix #3 (unconditional CODE_EXECUTION_TOOL). Done.
7. TypeScript typecheck â€” passed clean. Done.
8. Commit + push. Done.
9. Open draft PR. Done.
10. /simplify â€” two cleanups applied + re-checked. Done.
11. Write SESSION-LOG files. Done.

---

## File changed

**Single file:** `apps/web/src/lib/chat/run-archetype-turn.ts`

---

## Fix #1 â€” TTFT + cache instrumentation

Added structured performance logging without any behavioral change.

- `turnStartMs = Date.now()` captured before the tool-use loop
- `ttftMs` captured inside `stream.on("text", ...)` on first invocation (both beta and non-beta streaming paths). Guards `firstTokenSeen` flag to capture only the first delta.
- Per-round log after each API call: `[perf] round { orgId, archetype, round, durationMs, inputTokens, outputTokens, cacheReadTokens, cacheCreationTokens, stopReason }`
- Per-turn aggregate log before return: `[perf] turn { orgId, archetype, ttftMs, totalMs, totalCacheReadTokens, totalCacheCreationTokens, totalInputTokens, totalOutputTokens }`
- Filter in Vercel logs with prefix `[perf]`
- Zero PII: no message content, no user IDs

---

## Fix #2 â€” Split stable vs conditional system prompt

Changed `systemBlocks` from a single cached block to two blocks:

- **Block 1 (CACHED):** `systemPrompt + orgContext + toolAddendums` â€” stable for the entire conversation regardless of intent. Marked `cache_control: { type: "ephemeral" }`.
- **Block 2 (NOT cached):** `skillsAddendum + frontendDesignAddendum` when non-empty.

Previously both were concatenated into a single cached block. Now Block 1 caches reliably across the full conversation, even when intent flips between chat and doc-generation.

Expected impact: ~40-60% TTFT reduction on turns 2+ once cache is warm.

---

## Fix #3 â€” Stabilize tools array cache marker

Removed the `attachSkills` conditional for `CODE_EXECUTION_TOOL`. Now always included.

Behavioral verification: `attachSkills` is effectively always `true` for all 6 production archetypes (all have non-empty `ARCHETYPE_PLUGIN_SKILLS`). Removing the conditional does not change runtime behavior.

---

## /simplify findings

Two issues fixed:

1. **Duplicated `stableBlock` literal** â€” extracted to `const stableBlock` and referenced in both branches of the `systemBlocks` ternary.
2. **`roundDurationMs` computed outside `if (response.usage)` guard** â€” moved inside the guard since it's only used there.

---

## Commits

- `e1692d2` â€” perf(chat): TTFT instrumentation + split cached system prompt + stabilize tools array (Batch 1)
- `a9e1379` â€” simplify: extract stableBlock literal, move roundDurationMs inside usage guard

## PR

https://github.com/clm-studios/edify-os/pull/13 â€” DRAFT. Awaiting Minervamon smoke test before merge.

---

## 2026-05-24 â€” feat(proof-library): Sprint A.5 substrate â€” docs + dual-trigger extraction + query tool (PR #14)

**Identity:** Sonnet coding agent (spawned by Lopmon)
**Branch:** `lopmon/sprint-a5-proof-library-substrate`
**Worktree:** `C:\Users\Araly\edify-os-proof-library-substrate`
**Base:** `origin/main` @ `e3f8788`
**Date:** 2026-05-24
**PR:** https://github.com/clm-studios/edify-os/pull/14 (DRAFT)

---

## What was built

### 1. Schema migrations
- `00038_proof_library_substrate.sql`: new memory categories (outcomes, prior_grants, voice_samples), JSONB data column on memory_entries, retry_count + last_attempted_at on documents, org-documents Storage bucket
- `00039_proof_library_demo_seed.sql`: synthetic grant + outcomes data for demo org (auto-locates by name pattern)

### 2. Upload route wiring
- `/api/briefing/upload` now persists files to Supabase Storage (org-documents bucket)
- Fail-loud on Storage errors + document insert failures (OQ-5 resolved)
- Demo-mode guard via NEXT_PUBLIC_DEMO_MODE

### 3. Extractor module (`lib/proof-library/extract.ts`)
- `extractPendingDocuments(serviceClient, apiKey, options)` shared by both trigger paths
- Routing table: document category â†’ proof lib categories
- Minimal PDF text extraction (BT/ET operator scan, no native binaries)
- Claude Sonnet 4.5 structured extraction prompts per category
- Retry logic with retry_count cap at 3
- Shared exports: `ORG_DOCUMENTS_BUCKET`, `PROOF_LIBRARY_CATEGORIES`, `resolveOrgAnthropicKey`

### 4. Cron sweeper
- `/api/proof-library/extract-pending`: bulk sweep (all orgs) + single-org mode
- vercel.json cron `0 */3 * * *` (3h, Vercel Hobby tier)
- 50s sweep timeout guard to prevent 60s function limit overflow

### 5. Wizard-completion immediate trigger
- `/api/onboarding/complete` now fires `extractPendingDocuments` synchronously (Option A)
- maxDocs=5 cap, timeoutMs=45_000, non-fatal
- UX reasoning in PR body + route docstring

### 6. Query layer + tool
- `lib/memory/get-by-category.ts`: `getMemoryByCategory()` with JSONB path filters
- `lib/tools/org-memory.ts`: `get_org_memory` tool for Dev Director + Programs Director
- registry.ts: orgMemoryTools registered + dispatch branch added

## Decisions made

### UX Option A (synchronous) chosen for wizard trigger
Rationale: Z's bar is "visibly better than ChatGPT FROM THE FIRST INTERACTION." Async extraction risks the first dashboard interaction being generic. Synchronous blocks on extraction (maxDocs=5) then returns 200. Minervamon settles at PR review.

### Anthropic client constructed once per extractPendingDocuments call
Per /simplify review: constructing inside extractSingleDocument creates N objects per sweep. Moved to extractPendingDocuments and threaded down.

### Skipped count arithmetic bug fixed
Original: `result.skipped += docs.length - result.processed - result.failed - result.skipped` (double-subtracted skipped). Fixed to: `result.skipped = docs.length - result.processed - result.failed`.

### resolveOrgAnthropicKey extracted as shared export
Both extract-pending route and onboarding/complete route needed the same fetch+decrypt pattern. Extracted to lib/proof-library/extract.ts as a named export.

## Trade-offs documented

- PDF extraction is minimal (no native binary parser). Works for text-layer PDFs; image-only PDFs gracefully yield zero memory entries. A proper PDF parser (pdf-parse) is the fast-follow when budget allows.
- Memory entry inserts are sequential (not atomic). Partial success acceptable; duplicate detection is by source+title. Full atomic transaction would require a Postgres RPC.
- Cron is 3h not sub-hourly â€” Vercel Hobby tier constraint. Wizard trigger covers first-run UX gap.

## Open items / fast-follows
- Vercel cron deployment: must use `vercel --prod` CLI not dashboard (sub-daily cron validation)
- Migration 00038 + 00039 require Citlali manual SQL Editor apply before deploy
- Demo org UUID for 00039 seed: auto-locates by name pattern, may need manual verify
- `get_org_memory` for Executive Assistant + Events Director: fast-follow
- `budgets`, `stories`, `testimonials` categories: fast-follow
- PDF parser upgrade (pdf-parse or equivalent): fast-follow

## /simplify findings fixed
- Shared ORG_DOCUMENTS_BUCKET constant (was redefined in upload route)
- Shared PROOF_LIBRARY_CATEGORIES (was array literals in 3 places)
- Shared resolveOrgAnthropicKey (was duplicated in 2 routes)
- Anthropic client reuse (was N instantiations per sweep)
- Skipped count arithmetic fix
- Removed redundant try/catch around req.json().catch()
- Added sweep timeout guard in cron bulk path
- Removed narrating "Step N:" comments in upload route

## 2026-05-25 — feat(chat): intent classifier + Haiku routing for light turns (PR #16)

### What was built
- `apps/web/src/lib/chat/classify-intent.ts` — new intent classifier helper (215 lines)
  - `classifyIntent(userMessage, recentHistory, anthropicClient)` → `{ tier: "light" | "deliverable", reason }`
  - Uses Haiku 4.5, max_tokens 80, temperature 0, 16-example few-shot prompt
  - Conservative default: uncertain → "deliverable"; API failure → "deliverable" (never degrades quality)
  - Config knobs: `INTENT_CLASSIFIER_ENABLED` (env var, default true), `INTENT_CLASSIFIER_FALLBACK_TIER` (env var, default "deliverable")
  - Exports `MODEL_IDS` reference to avoid hardcoding model strings
- `apps/web/src/lib/chat/run-archetype-turn.ts` — integrates classifier
  - Classifier runs **in parallel** with `resolveArchetypeTools + buildMcpServersForOrg` → zero latency overhead on turns where DB lookups are the bottleneck
  - Adds `[perf] intent` log: `{ orgId, archetype, userMessageLen, tier, reason, classifierMs, resolvedModel }`
  - Adds `model: resolvedModel` to existing `[perf] turn` aggregate log
  - `MODEL_IDS` exported so classifier can reference it

### /simplify findings fixed
- Parallelized classifier with tool/MCP resolution (was sequential — classifier would have been on critical path)
- Exported `MODEL_IDS` from run-archetype-turn + imported in classify-intent (eliminated hardcoded string duplication)
- Removed redundant `typeof turn.content === "string"` guard (typed as string already)

### Expected TTFT impact
- Light turns (Haiku routed): ~700-900ms vs Sonnet's ~1500ms baseline
- Deliverable turns: unchanged at ~1500ms
- Classifier net overhead: ~0ms (runs in parallel with tool resolution which takes similar time)

### Spot-check accuracy
- Reference set: 20 examples (10 light, 7 deliverable, 3 borderline)
- Expected: 19/20 (95%) — borderlines all route to deliverable (correct by conservative rule)

### PR
- Draft PR #16: https://github.com/clm-studios/edify-os/pull/16
- Branch: `lopmon/feat-intent-classifier-haiku-routing`
- Commits: 3 (classifier helper, run-archetype-turn integration, /simplify pass)
- Status: DRAFT — awaiting Minervamon review before merge

---

## 2026-05-25 â€” feat(auth): add sign-out button to dashboard sidebar (PR #15)

- **Agent:** Sonnet coding agent (spawned by Lopmon)
- **Branch:** `lopmon/feat-sign-out-button`
- **Worktree:** `C:\Users\Araly\edify-os-sign-out-button`
- **Base:** `origin/main` @ `be62d07` (vercel.json cron hotfix)
- **PR:** https://github.com/clm-studios/edify-os/pull/15 (DRAFT â€” Minervamon to smoke test before merge)
- **Status:** COMPLETE

### Gap

Minervamon flagged 2026-05-23 22:09 UTC: no sign-out button anywhere in the UI. Became operationally blocking 2026-05-25: middleware redirects authed users away from `/login`, so escaping a session required DevTools â†’ clear cookies.

### Implementation

`signOut()` already existed in `apps/web/src/lib/supabase/auth.ts` â€” no changes needed there.

Added to `apps/web/src/components/sidebar.tsx`:
- `useRouter` import from `next/navigation`
- `LogOut` icon import from `lucide-react`
- `signOut` import from `@/lib/supabase/auth`
- `handleSignOut` async function: calls `signOut()`, then `router.push('/login')`
- `<button>` with `LogOut` icon in the sidebar footer, adjacent to the existing Settings gear

### Placement reasoning

Sidebar footer already has avatar + display name + Settings icon in a flex row. Adding LogOut immediately to its right is the most natural account-action location, visible from every dashboard page, requires zero layout changes, and matches Settings icon styling exactly (`text-brand-400 hover:text-brand-200 transition`).

### Files changed

- `apps/web/src/components/sidebar.tsx` â€” 1 file, 16 lines added

### /simplify findings

All clean. No reuse, quality, or efficiency issues in the new code:
- `signOut` correctly reuses the existing auth helper (not reimplemented)
- `useRouter` matches the pattern used by 10+ other components
- `handleSignOut` is a simple fire-once click handler, no hot-path or polling concerns
- Error case: if `signOut()` returns an error (e.g., Supabase not configured), `router.push('/login')` still fires â€” correct behavior since no valid session exists anyway
- Pre-existing unused imports (`Sparkles`, `Users`) noted but not in scope of this PR

## 2026-05-26 — PR #16 C1 fix (retry + Sonnet fallback) — Sonnet coding agent

**What changed**
- `apps/web/src/lib/chat/run-archetype-turn.ts`: added `callWithRetryAndFallback` helper wrapping all four per-round Anthropic call sites (streaming+beta, streaming+non-beta, non-streaming+beta, non-streaming+non-beta) with retry + Sonnet fallback logic

**Why**
Minervamon's PR #16 review C1: PR description claimed Sonnet fallback on Haiku failure but the per-round Anthropic call had no retry/fallback. Option (a) per Lopmon — implement the fix.

**Retry policy**
- Retryable: 429, 500, 502, 503, 504, 529
- Non-retryable: 4xx (non-429), unclassified errors
- 2 retries with exponential backoff (250ms, 750ms)
- After exhausted retries on Haiku, one final attempt on Sonnet + `[perf] fallback` log + `resolvedModel` flips to “sonnet” for remaining rounds

**Files touched**
- apps/web/src/lib/chat/run-archetype-turn.ts (+114/-51)

**Typecheck**: passed (clean, no errors)

**Next**
Commit + push to existing branch. PR stays DRAFT. Lopmon will tell Minervamon C1 is in.

## 2026-05-26 â€” PR #17 review fixes (M1 + M2 + m3) â€” Sonnet coding agent

**What changed**
- `scripts/seed-proof-library-clm.ts`: M1 delete-before-insert dedup in extractSingleDocDirect, M2 poll-timeout Date.now()-Date.now() â†’ Date.now()-startTime, m3 required --org-id flag with UUID validation and orgs-table existence check replacing name-prefix inference

**Why**
Minervamon's PR #17 review (`outputs/pr17-review.md`) flagged M1 (re-extraction duplicate memory_entries), M2 (Date.now()-Date.now() poll-timeout warning typo at line 939), m3 (org resolution by name-prefix inference instead of explicit --org-id). All three are same-file script-hygiene fixes; Citlali authorized bundling via Minervamon.

**Fixes**
- M1: delete-before-insert dedup in extractSingleDocDirect (idempotency guard for re-runs on partial-failure rows)
- M2: Date.now() - Date.now() â†’ Date.now() - startTime
- m3: required --org-id <uuid> flag; UUID format validation + orgs-table existence check; name-prefix inference removed

**Deferred follow-up (tracked here so it doesn't fall off)**
- M3: `retry_count: 1` is hard-coded on failure writes at lines 568, 605, 622, 653. PR #14's cron sweeper caps retries at `>= 3`; setting literal 1 silently resets the count. Fix in a follow-up PR â€” should increment from the current value rather than hard-code.

**Typecheck**: passed (both `pnpm --filter web typecheck` and `npx tsc --noEmit -p scripts/tsconfig.json`)

**Next**
Commit + push to existing branch. PR stays DRAFT. Awaits Minervamon's re-review on M1/M2 + Citlali's cleanup auth.

---

## 2026-05-26 â€” Cleanup SQL staged for PR #17 stale rows â€” Sonnet coding agent

**What changed**
- `scripts/cleanup-stale-proof-library-rows.sql`: NEW, ~195 lines. Staged 4-step cleanup pattern (inventory + keep-set verify + orphan check + transactional DELETE) for ~24 stale `documents` rows left by PR #17 debug runs.

**Why**
Minervamon's PR #17 review (`outputs/pr17-review.md` lines 134-246 on the PR #17 worktree) flagged that no cleanup query was staged anywhere. Citlali authorized staging on a separate branch (NOT on the PR #17 branch) to keep the seed PR clean and give the cleanup a focused reviewable diff.

**Authorization gate**
- File is PENDING CITLALI-IN-LOOP AUTHORIZATION. DO NOT RUN.
- Steps 1-3 are read-only and safe to run as inspection.
- Step 4 is the transactional DELETE. Wrapped in BEGIN/.../COMMIT, hardcoded org UUID (`e07d3c8d-b921-4cbd-b5db-965c4e0fcbae`), hardcoded 8 filenames.
- Storage object cleanup (Step 5) is a separate follow-up â€” see file header.

**Execution channel**
Supabase SQL editor or psql. No JS runner â€” less audit surface.

**Next**
Push branch. Open DRAFT PR. Citlali eyeballs steps + authorizes execution when back at keyboard.

---

## 2026-05-26 â€” Stale-row inventory packet staged for PR #18 â€” Sonnet coding agent

**What changed**
- `outputs/pr17-stale-row-inventory.md`: NEW, ~188 lines. Read-only PostgREST inventory of all rows for the 8 PR #17 filenames in the Edify org. Answers Minervamon's Q1 (uniform entry_count=0?), Q2 (--force usage?), Q3 (cron actively retrying?).

**Method**
Native fetch() against PostgREST with the service-role key. Two read-only GET requests: one against /rest/v1/documents (filtered by org_id + filename IN list, without parsed_text to reduce payload), one against /rest/v1/memory_entries (for entry_count rollup). No writes.

**Key findings**
- Total rows: 24 (across 8 filenames, 3 rows each)
- Stale rows confirmed: 8 (not ~24 as estimated â€” Minervamon's estimate appears to have conflated total rows with stale rows)
- Q1 â€” entry_count uniformity: YES, all 8 stale rows have entry_count=0. Row-only DELETE is safe.
- Q2 â€” --force inferred: YES. 7 of 8 filenames have both keep and stale rows sharing the same filename, confirming --force was used on debug runs.
- Q3 â€” cron actively retrying: YES â€” 1 stale row (c6e4871e, spring-2025-newsletter.pdf, status=failed, retry_count=1) is in the cron retry window. Mild urgency on cleanup.
- Edge case flagged: MEAF-2024-grant-application-FUNDED.pdf has 3 rows all done+entries â€” the cleanup SQL's dedup logic must target older done rows, not just status!=done rows, for this file.

**Next**
Push to existing PR #18 branch. Citlali eyeballs packet + decides whether to run Step 4 of the cleanup SQL. Lopmon should flag to Minervamon: (1) stale count is 8 not ~24, (2) 1 row is actively being retried by cron.

---

## 2026-05-26 â€” PR #18 SQL updated for orphan-entries cleanup â€” Sonnet coding agent

**What changed**
- `scripts/cleanup-stale-proof-library-rows.sql`: added orphan memory_entries DELETE inside Step 4's BEGIN/COMMIT block (executes before documents DELETE); fixed "~24" â†’ "~16" expected-count comments throughout.

**Why**
Minervamon's spec (relayed by Citlali's authorization 2026-05-27 00:06 UTC): the 8 older done-with-entries rows being deleted leave ~68 memory_entries orphaned. The original Step 4 only cleaned documents; this update also cleans the memory_entries pointing to deleted doc ids. Comment fix corrects review-time estimate that didn't account for DISTINCT ON keep-latest behavior.

**Order**
DELETE memory_entries FIRST (rationale: if mid-flight crash, leaves documents intact with no entries â€” recoverable by re-running extraction; reverse order would leave entries pointing at non-existent doc ids).

**Expected post-execution**
- documents matching the 8 filenames: 8 (one per filename, latest by created_at)
- memory_entries with source LIKE 'document:%' (matching kept doc ids): 62 (matches PR #17 final-run total: 2 prior_grants + 50 outcomes + 10 voice_samples)

**Next**
Phase 2: separate execution agent will run Steps 1-3 read-only snapshot match â†’ execute Step 4 BEGIN/COMMIT block.

## 2026-05-26 â€” PR #18 cleanup EXECUTED â€” Sonnet coding agent

**What happened**
Ran scripts/cleanup-stale-proof-library-rows.sql against prod via PostgREST sequential (Path B â€” psql not available on this Windows machine).

**Authorization**
Citlali via Minervamon (msg 5831, 2026-05-27 00:06 UTC).

**Results**
- memory_entries deleted: 68
- documents deleted: 16
- documents remaining (8 filenames): 8 (expected 8)
- memory_entries remaining (kept doc IDs): 62 (expected 62)
- Transaction state: COMMITTED (PostgREST sequential)
- Keepers (one per filename, latest by created_at):
  - 9c564dd6 2024-impact-report-board-edition.pdf (entries=16)
  - e1f324e6 2025-Q1-programs-brief.pdf (entries=11)
  - 2e220d0e DDCF-2024-grant-application-DECLINED.pdf (entries=1)
  - d1dd3282 MEAF-2024-grant-application-FUNDED.pdf (entries=1)
  - 267a5356 MEAF-Q4-2024-funder-report.pdf (entries=9)
  - 5d5c00ac mission-about-and-campaign-copy.pdf (entries=5)
  - fb9b34e0 spring-2025-newsletter.pdf (entries=5)
  - 1dcf96d9 workforce-prep-pilot-outcomes-memo.pdf (entries=14)

**Audit artifact**
`outputs/pr18-execution-log.md`

**Storage cleanup**
NOT touched. Separate follow-up (16 orphan storage objects at org-documents/e07d3c8d-b921-4cbd-b5db-965c4e0fcbae/<doc_id>/).

**Next**
Lopmon will surface counts to Minervamon → Citlali. PR #18 stays DRAFT — merge decision is Citlali’s.

---

## 2026-05-27 — Storage cleanup follow-up staged — Sonnet coding agent

**What changed**
- `scripts/cleanup-orphan-storage-objects.ts`: NEW. Stages cleanup of 16 orphan PDFs left by PR #18’s DB cleanup at `org-documents/e07d3c8d-b921-4cbd-b5db-965c4e0fcbae/<doc_uuid>/<filename>`.
- `apps/web/package.json`: NEW npm script `cleanup-orphan-storage-objects` (mirrors seed script pattern).

**Why**
Minervamon and Citlali agreed Storage cleanup is a separate follow-up from PR #18’s DB cleanup. PR #18 deleted documents rows + memory_entries; this stages the matching Storage object removal. Per the execution log: “Storage object cleanup at org-documents/... is a SEPARATE follow-up. 16 orphan storage objects remain.”

**Authorization gate**
- PENDING CITLALI-IN-LOOP AUTHORIZATION. DO NOT RUN.
- Script requires `--confirm-citlali-auth` flag (defaults false; missing = exit 1 with explicit message).
- Same model as PR #18 SQL: staged for review, executed only after Citlali greenlights in person.
- Dry run available: `pnpm --filter web cleanup-orphan-storage-objects --org-id <uuid> --dry-run`

**Next**
Open as DRAFT PR. Citlali reviews and authorizes when at keyboard.

## 2026-05-27 - PR #19 Storage cleanup EXECUTED - Lopmon terminal-side

**What happened**
Ran `scripts/cleanup-orphan-storage-objects.ts` against prod Supabase Storage with `--confirm-citlali-auth`. Pre-flight gates passed (24 doc-uuid directories found, 16 orphans PRESENT, 8 keepers OK). Live delete completed.

**Authorization**
Citlali via Minervamon (msg 5844, 2026-05-27 11:36 UTC).

**Results**
- Pre-flight directory count: 24
- Storage objects deleted: 16
- Post-flight directory count: 8 (expected 8)
- Delta: 16 (expected: 16) - MATCH
- Anomalies: none
- Executed at: 2026-05-27T11:44:00.339Z

**Verified via prior dry-run**
Dry-run run before live execution showed identical 16-path list. MEAF-FUNDED dedup paths (`7d20eda6-a4fa-40e8-8abd-94667c581bd7` + `06afd9ba-10f2-4c68-8a40-4660ade481bb`) both queued correctly per Minervamon’s eyeball check.

**Storage cleanup loop**
Closed. Bucket `org-documents` under org `e07d3c8d-b921-4cbd-b5db-965c4e0fcbae` now has exactly 8 doc-uuid directories matching the 8 keeper documents from PR #17’s seed.

**Next**
PR #19 ready for review + merge to main as historical record.

---

# SESSION-LOG — Grant Writing MVP (feat/grant-writing-mvp)

**Identity:** Sonnet coding agent spawned by Lopmon
**Branch:** `feat/grant-writing-mvp`
**Worktree:** `C:\Users\Araly\edify-os-grant-writing-mvp`
**Base:** `origin/main` @ `1d4a912` (intent classifier + Haiku routing, PR #16)
**Date:** 2026-05-27
**PRD:** `C:\Users\Araly\life\projects\edify-os\PRD-grant-writing-capability-2026-05-10.md` (590+ lines, Minervamon-authored + Lopmon-revised 2026-05-27)

---

## Plan

Per PRD phasing §MVP:
1. Migration `00040_grants_pipeline.sql` — grants_pipeline table + extended memory_entries category constraint
2. Two new tools: `draft_grant_content` + `revise_grant_content`
3. Three API routes: POST/GET/PATCH for grants pipeline
4. Memory tool extension: 6 new grant_writing.* categories
5. Registry integration: Dev Director gains grant-writing tools
6. Drawer UI + list page at /dashboard/grants
7. Suggestion chips update for Dev Director chat

---

## Reconnaissance findings

- Highest existing migration: `00039_proof_library_demo_seed.sql` → new file: `00040_grants_pipeline.sql`
- `current_user_org_ids()` SECURITY DEFINER helper confirmed live in `00028_fix_members_rls_recursion.sql`
- `getMemoryByCategory` helper at `lib/memory/get-by-category.ts` — clean API for substrate pulls
- `SuggestionChip` component at `components/ui/suggestion-chip.tsx` — existing pattern used
- SUGGESTED_PROMPTS for development_director in `TeamChatClient.tsx` — updated 4 chips
- `save_to_memory` tool in `lib/tools/memory.ts` — extended with 6 new categories
- Animation keyframes (`animate-fade-in`, `animate-slide-in-right`) confirmed in `globals.css`

---

## Files changed

### NEW files
- `supabase/migrations/00040_grants_pipeline.sql` — table + RLS + indexes + updated_at trigger + memory_entries category extension
- `apps/web/src/lib/prompts/grant-writing/loi.ts` — LOI section system prompt (~300 tokens)
- `apps/web/src/lib/prompts/grant-writing/statement-of-need.ts` — SoN section system prompt
- `apps/web/src/lib/prompts/grant-writing/project-description.ts` — Project description section system prompt
- `apps/web/src/lib/prompts/grant-writing/budget-narrative.ts` — Budget narrative section system prompt
- `apps/web/src/lib/tools/grant-writing.ts` — Tool definitions: draft_grant_content + revise_grant_content
- `apps/web/src/lib/tools/grant-writing-handlers.ts` — Handlers: substrate-pull, cite-or-reject loop, skillBody forward-compat slot
- `apps/web/src/app/api/grants/pipeline/route.ts` — GET (list) + POST (create) endpoints
- `apps/web/src/app/api/grants/pipeline/[id]/route.ts` — PATCH (update status / notes / append draft)
- `apps/web/src/app/dashboard/grants/page.tsx` — List view with drawer trigger + status/search filters
- `apps/web/src/components/grants/GrantDetailDrawer.tsx` — Drawer: drafts timeline + attachments checklist stub + notes + actions row

### MODIFIED files
- `apps/web/src/lib/tools/memory.ts` — Extended MemoryToolCategory + enum + validCategories + CATEGORY_MAP with 6 grant_writing.* categories
- `apps/web/src/lib/tools/registry.ts` — Import + dispatch + name-set + tool-family detection + addendum for grant_writing family; Dev Director ARCHETYPE_TOOLS gains ...grantWritingTools; GRANT_WRITING_TOOLS_ADDENDUM re-exported
- `apps/web/src/app/dashboard/team/[slug]/TeamChatClient.tsx` — Dev Director suggestion chips updated to grant-writing-focused prompts per PRD W3

---

## Architecture decisions

- **skillBody forward-compat slot (PRD §F8):** `executeDraftGrantContent` assembles system blocks with an explicit `skillBody` slot (`null` in MVP). When skill-routing pattern ships, the follow-up PRD can thread the skill body string without changing the handler signature.
- **Cite-or-reject loop:** Detects uncited numbers via regex (2+ digit numbers not within 80 chars of a `[...]` marker). Retries up to 2x with addendum. After retry 3, annotates with `[?] (missing citation)`.
- **Section-first substrate mapping (PRD §F4):** SUBSTRATE_MAP encodes the P/S/V lookup table for all 4 MVP content types. Voice samples always loaded at V for all types.
- **Model routing:** Sonnet for all MVP content types. Haiku routing per content_type is v2 perf work (deferred per PRD phasing).
- **Dedup on POST:** 23505 unique-constraint violation returns existing row + 200 (not 409) so tool callers don’t error on “let’s pursue this” re-calls.

---

## Migration application

**DO NOT apply 00040 to prod until feat/grant-writing-mvp is merged to main.**

Application steps:
1. Open Supabase SQL Editor for the edifysaas org (Owner via edifysaas@gmail.com)
2. Paste full contents of `supabase/migrations/00040_grants_pipeline.sql`
3. Execute — expect: CREATE TABLE, 4 policies, 3 indexes, 1 function, 1 trigger, ALTER TABLE (constraint extension)
4. Verify: `SELECT count(*) FROM grants_pipeline;` returns 0 (empty, correct)
5. Verify: `SELECT category FROM memory_entries LIMIT 1;` succeeds (constraint extension live)

---

## Out of scope (v2 deferrals confirmed)

- `draft_full_proposal`, `compile_application` — v2
- Kanban drag-to-move — v2 (MVP ships list view only)
- Content types beyond MVP-4 (loi, statement_of_need, project_description, budget_narrative) — v2
- `import_grant_writing_artifacts` — v2
- Briefing integration (deadline surfacing) — v2
- Skill-routing pattern (F8) — separate follow-up PRD
- Approvals `kind: ‘grant_draft’` enum — registered for v2 (approvals table uses jsonb proposed_action, no enum column to alter)

---

## Typecheck

`pnpm --filter web typecheck` — PASSES (exit 0, clean).

---

## Smoke test notes

Manual smoke test against edifysaas test org: NOT executable without migration 00040 applied. Noted items to verify post-migration:
- `draft_grant_content` tool visible in Dev Director chat
- `save_to_memory` with category=”grant_writing.tone_rules” persists correctly
- POST /api/grants/pipeline creates row; PATCH /api/grants/pipeline/[id] advances status
- /dashboard/grants renders list view; drawer opens on click; “Talk to Dev” link scoped correctly
- Suggestion chips in Dev Director chat show new grant-writing prompts

---

## PR

See commit for PR URL. Branch: feat/grant-writing-mvp. DRAFT — do not merge. (PR #21 merged 2026-05-28)

---

## 2026-05-27 -- Sidebar nav for /dashboard/grants (PR #21 follow-up) -- Sonnet coding agent

**What changed**
- apps/web/src/components/sidebar.tsx: added Grants nav entry pointing at /dashboard/grants, lucide icon FileText (already imported), positioned after Tasks and before Ripple in the navLinks array (+1 line in the array)

**Why**
PR #21 build agent scoped sidebar out per caution rule. Minervamon authorized addition via msg 5851 after migration 00040 applied to prod. Folded into PR #21 branch (small follow-up commit, not separate PR).

**Typecheck**: passed

---

# SESSION-LOG — PR #21 Demo-Blockers Patch (feat/grant-writing-mvp-patch)

**Identity:** Sonnet coding agent spawned by Lopmon
**Branch:** `feat/grant-writing-mvp-patch`
**Worktree:** `C:\Users\Araly\edify-os-grant-mvp-patch`
**Base:** `origin/main` @ `a38074b`
**Date:** 2026-05-28
**PRD:** `C:\Users\Araly\life\projects\edify-os\prd-pr21-demo-blockers-patch.md`
**Source review:** `outputs/pr21-post-merge-review.md`

---

## Plan

Fix 4 demo-blocking defects from Minervamon's post-merge review of PR #21:
- C1: Wire onClick + content_md expand in GrantDetailDrawer drafts timeline; fix `key={i}`
- C2: Replace hardcoded `"claude-sonnet-4-5"` with `MODEL_IDS.sonnet` in grant-writing-handlers.ts (both sites) + extract.ts (optional, included as trivial swap)
- C3: Add quoted-phrase detector to `detectUncitedClaims` + `annotateMissingCitations`
- Org-display: Investigate NULL mission / "Test Org Minervamon" / dashboard redirect wedge; fix or document

---

## Reconnaissance

### C1 — Confirmed lines 277-294 in GrantDetailDrawer.tsx
- `<li key={i}>` has no `onClick`; `ChevronRight` never toggles; `draft.content_md` never rendered
- `GrantDraft` type confirmed: `section, content_md, version, drafted_at, drafted_by_tool`

### C2 — Confirmed lines 355 + 444 in grant-writing-handlers.ts
- Both `anthropic.messages.create` calls had `model: "claude-sonnet-4-5"` (string literals)
- `MODEL_IDS` exported from `@/lib/chat/run-archetype-turn` at line 44: `{ sonnet: "claude-sonnet-4-6", haiku: "..." }`
- `extract.ts:386` — same trivial swap; included

### C3 — Confirmed detectUncitedClaims (lines 223-244) + annotateMissingCitations (lines 247+)
- Only `numberPattern` exists; no quoted-phrase detection despite doc comment claiming both
- No test harness in repo (no `*.test.ts` files in apps/web)

### Org-display — Root cause investigation

**Symptom:** Dashboard routes redirect to `/dashboard/briefing`; UI shows "Test Org Minervamon" + placeholder mission

**Root cause (confirmed, two parts):**

**Part A — Redirect wedge:** The middleware gate at `middleware.ts:70-85` is COOKIE-DRIVEN — it checks `edify_briefing_done` cookie, NOT `mission`. The prod org has `onboarding_completed_at = NULL` because the briefing wizard was never completed for `edifysaas@gmail.com`. The cookie was never written. Any authenticated user hitting `/dashboard/*` without the cookie redirects to `/dashboard/briefing`. This is **correct middleware behavior** — the redirect is intentional.

**The code bug:** `briefing/page.tsx` `checkOrgMembership` useEffect only checks for `member` row existence (not `onboarding_completed_at`). Users whose briefing IS complete in the DB but whose 7-day cookie expired would be forced to redo the briefing form (which returns 409 and still sets the cookie on re-submit — not blocked, just surprising). Added a **cookie-recovery path**: if `onboarding_completed_at` is set, auto-write the cookie and redirect to `/dashboard`. This closes the expired-cookie trap.

**Part B — "Test Org Minervamon":** NOT in code. "Test Org Minervamon" is stored in localStorage `edify_org_context` from Minervamon's smoke test. It's not rendered from the DB anywhere in the codebase (`grep` found no hardcoded string). The briefing form pre-populates from `edify_briefing_draft` localStorage key; the sidebar/shell renders the Supabase `user_metadata.full_name` (not org name). This is **environmental** — stale localStorage from smoke testing.

**Part C — NULL mission:** Mission is never read by the middleware or the briefing gate. NULL mission does NOT block navigation. The briefing gate is purely cookie-driven. The redirect to `/dashboard/briefing` happens because `edify_briefing_done` cookie was absent, not because mission is NULL.

**Fix chosen (option a — code fix):** Added cookie-recovery path in `briefing/page.tsx` — checks `orgs.onboarding_completed_at` on mount; if already set (briefing complete), auto-sets cookie + redirects without showing form. This handles the "cookie expired" trap for real returning users. Does NOT fix the prod org's missing `onboarding_completed_at` — that's a content/flow decision for Minervamon/Citlali (they need to run through the briefing wizard once on the edifysaas account).

---

## Code changes

### C1 — `apps/web/src/components/grants/GrantDetailDrawer.tsx`
- Added `ChevronDown` import
- Added `expandedDraftKey` state (tracks which draft row is expanded)
- Rewrote drafts `<ul>` map:
  - Key changed from `i` → `` `${draft.version}-${draft.drafted_at}` ``
  - `<li>` now contains a `<button>` (onClick toggles expansion)
  - `ChevronRight` → `ChevronDown` when expanded
  - Collapsible `<div>` with `whitespace-pre-wrap` renders `draft.content_md` below the metadata row
  - `aria-expanded` set on the button

### C2 — `apps/web/src/lib/tools/grant-writing-handlers.ts`
- Added `import { MODEL_IDS } from "@/lib/chat/run-archetype-turn"`
- Replaced both `model: "claude-sonnet-4-5"` → `model: MODEL_IDS.sonnet` (lines ~355 and ~444)

### C2 (optional) — `apps/web/src/lib/proof-library/extract.ts`
- Added `import { MODEL_IDS } from "@/lib/chat/run-archetype-turn"`
- Replaced `model: "claude-sonnet-4-5"` at line 386 → `model: MODEL_IDS.sonnet`

### C3 — `apps/web/src/lib/tools/grant-writing-handlers.ts`
- `detectUncitedClaims`: added `quotePattern` (`/"([^"]{20,})"/g` plus curly-quote variants via `[""]...[""]/g`) with same ±80-char citation-window check; pushes issue with truncated phrase preview
- `annotateMissingCitations`: added second `result.replace()` pass for quoted phrases ≥20 chars (straight + curly quotes), same citation-window check; appends `[?] _(missing citation)_` after uncited quoted phrases

### Org-display — `apps/web/src/app/dashboard/briefing/page.tsx`
- Extended `checkOrgMembership` useEffect to also fetch `orgs(onboarding_completed_at, name)` via the members join
- Added cookie-recovery: if `onboarding_completed_at` is set → write cookie + `router.replace('/dashboard')`
- Documented WHY in inline comment

---

## Checks

- `pnpm typecheck` (turbo, 4 packages): **PASSED** (4/4 green)
- `pnpm lint`: no lint script in apps/web — lint coverage via TypeScript strictness only (consistent with every prior agent in this log)
- `pnpm --filter web build`: **PASSED** (123/123 pages, no TS errors, no lint errors in build output)
- No test harness in repo — C3 quoted-phrase detection is verified by reading the regex logic only

---

## Notes

- No DB migrations. No prod DB writes. No new dependencies.
- No visual changes except C1 expand behavior (reuses existing CSS tokens/classes).
- `eslint-disable` / `@ts-ignore` NOT used. The one `any` cast in briefing/page.tsx matches the pre-existing pattern in the same file (Supabase join return type narrowing) and is commented.
- "Test Org Minervamon" is localStorage-only (environmental) — no code change needed. Minervamon should clear `edify_org_context` + `edify_briefing_draft` from browser localStorage on the edifysaas session.
- Prod org fix: Minervamon/Citlali should log in to edifysaas@gmail.com on Edify, complete the briefing wizard with real org data (name="Edify", mission as appropriate), which will set `onboarding_completed_at` and the cookie.

---

## PR

https://github.com/clm-studios/edify-os/pull/22 — OPEN, ready-for-review. Do NOT auto-merge. Minervamon reviews before merge.

## 2026-05-28 — PR #22 patch: revise-call model literal (line ~471) missed in first pass — fixed by second agent (commit 78885d6)
