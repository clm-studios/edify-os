# Session Log — Sprint A.5 Proof Library Substrate (2026-05-24)

**Agent:** Sonnet coding agent (spawned by Lopmon)
**Branch:** `lopmon/sprint-a5-proof-library-substrate`
**Date:** 2026-05-24
**PR:** https://github.com/clm-studios/edify-os/pull/14 (DRAFT)

## Summary

Built the proof library substrate (Sprint A.5): typed document storage pipeline, dual-trigger extraction, query layer, and get_org_memory tool.

## Files changed

| File | Change |
|---|---|
| supabase/migrations/00038_proof_library_substrate.sql | New — memory categories + JSONB column + retry columns + bucket |
| supabase/migrations/00039_proof_library_demo_seed.sql | New — demo org seed data |
| apps/web/src/app/api/briefing/upload/route.ts | Modified — Phase 2 Storage wiring |
| apps/web/src/lib/proof-library/extract.ts | New — core extractor module |
| apps/web/src/app/api/proof-library/extract-pending/route.ts | New — cron sweeper |
| apps/web/src/app/api/onboarding/complete/route.ts | Modified — sync extraction trigger |
| apps/web/src/lib/memory/get-by-category.ts | New — query helper |
| apps/web/src/lib/tools/org-memory.ts | New — get_org_memory tool |
| apps/web/src/lib/tools/registry.ts | Modified — register org-memory tool |
| apps/web/vercel.json | Modified — 3h cron for extract-pending |

## Status: DRAFT PR open, awaiting Minervamon review + smoke test

---

# Session Log — flyer-wow-2026-04-29

## 2026-04-28 — Flyer Skill Wow-Factor Overhaul

**Agent:** Sonnet coding agent (spawned by Lopmon)
**Branch:** `lopmon/flyer-wow-2026-04-29`
**PRD source:** Lopmon spawn prompt

### Task
Ship a 5-element wow-factor overhaul of `apps/web/plugins/design/flyer/` — hero imagery, custom bullet icons, date-as-design-element, texture + depth, geometric accent stack — all in one integrated pass.

### Files Changed

| File | Change |
|---|---|
| `apps/web/plugins/design/flyer/render.py` | Full rewrite — 317 → 491 lines. All 5 wow elements integrated. |
| `apps/web/plugins/design/flyer/SKILL.md` | Documented `hero_image_url`, `bullet_icons`, icon keyword table, hero photo workflow, updated visual upgrade notes. |
| `apps/web/plugins/design/flyer/icons/` | NEW — 20 procedural PNG icons (64×64 RGBA) generated via Pillow shape primitives. |
| `apps/web/plugins/design/flyer/icons/README.md` | Icon attribution and regeneration instructions. |
| `apps/web/plugins/design/flyer/assets/noise.png` | NEW — 512×512 paper-grain noise texture at 4-6% opacity. |

### Design Decisions

**Hero imagery layout:** Chose a split-panel approach — text lives in the left 58% of the hero band, photo fills the right ~42% with a soft gradient-blend transition at the seam. Brand-color tint at 45% opacity keeps photo from competing with headline text. Alternative considered: full-bleed photo behind all text — rejected because it risks headline legibility on low-contrast photos. Side panel gives predictable results across any photo.

**Icon generation:** Used procedural Pillow shape primitives rather than sourcing external icon PNGs. This gives brand-consistent geometry at any scale, avoids attribution complexity, and keeps the bundle small. All 20 icons are RGBA with transparent background and recolored to `accent_dark` at render time.

**Date callout composition:** Date block floats right of the logistics info box (split layout), creating visual tension between the two info elements. Big day number (200pt YoungSerif) is the second focal point after the headline. Sun-ray starburst (16 rays) behind the number adds energy without clutter. Weekday label above month uses tight letter-spacing for editorial feel.

**Texture:** Noise applied to body region only (not over the orange hero band, which would clash). Generated a sparse grain (30% pixel density) at low alpha (4-18 per pixel) then GaussianBlur-softened — subtle enough to read as "printed on paper" rather than "noisy image."

**Geometric accent choices:** Arc (lower-left body), vertical accent line (right column margin), halftone dots (upper-right corner fadeout), ribbon under headline (hero band), sun rays behind date. Arc and dots add breadth without weight. Vertical line gives the layout a structural spine on the right edge. All at low opacity — composition reads as designed-by-human, not shape-dumped.

### Smoke Test Results
- With `hero_image_url` (Unsplash career fair photo): 2550×3300 PNG — PASS
- Without `hero_image_url` (fallback): 2550×3300 PNG — PASS
- Visual inspection: headline readable, hero photo composited with tint, date "22" prominent, icons visible beside bullets, arc accent in body, vertical line visible, footer correct

### Upload Status
- `ANTHROPIC_API_KEY` not found in worktree (`.env.local` lives in main checkout, not copied to worktree — expected behavior)
- Upload SKIPPED — Citlali needs to run upload script manually from main checkout after merge
- Command: `cd C:\Users\Araly\edify-os && export ANTHROPIC_API_KEY=$(grep -E '^ANTHROPIC_API_KEY=' apps/web/.env.local | cut -d= -f2- | tr -d '"' | tr -d "'") && pnpm dlx tsx scripts/upload-plugin-skills.ts`

### Typecheck / Lint
- Ran `pnpm --filter web typecheck` and `pnpm --filter web lint` — see PR notes for status

---

## 2026-04-29 — Flyer Skill 4-Bug Field-Test Cleanup

**Agent:** Sonnet coding agent (spawned by Lopmon)
**Branch:** `lopmon/flyer-fix-2026-04-29`
**Source:** Citlali field-tested PR #51 wow-factor output and reported 4 bugs

### Bug 1 — Hero photo never appears (unsplash gated off)
**Root cause:** `resolveArchetypeTools` in `registry.ts` filtered out `unsplashTools` for Marketing Director when Canva is connected, preventing `search_stock_photo` from being available.
**Fix:** Removed `&& !UNSPLASH_TOOL_NAMES.has(t.name)` from the Canva-connected filter. Canva gate now only strips render_design tools; unsplash stays available. Updated JSDoc to explain the rationale (Canva creates blank canvases, not photo search).

### Bug 2 — Duplicate date callouts
**Root cause:** `render.py` rendered BOTH the new date-hero block (big "22" + starburst) AND the old left tinted info-box with `date.upper()` + venue. They competed visually.
**Fix:** Removed the old left info-box entirely. Venue is now rendered as a plain text line below the date hero block (left-aligned to MARGIN). Only one date treatment renders.

### Bug 3 — Vertical accent line / arc crosses body text
**Root cause:** Two issues: (a) vertical accent at `W * 0.91` was at the exact right edge of the text column; (b) the arc accent (radius 55% W, sweeping 340°→60°) passed through the body text at approximately x=1350, y=1200-1800. Citlali saw the arc cutting through "Meet" and "toward".
**Fix:** (a) Moved vertical accent to `W * 0.955` (solidly in right margin). (b) Reduced arc radius to 22% W, moved center to canvas bottom-left corner (cx=0, cy=H), tightened sweep to 270°→360° so arc stays in the bottom ~10% of canvas only.

### Bug 4 — "Lunch" icon doesn't read as fork & knife
**Root cause:** Original procedural icon produced two thin rectangles — ambiguous at 64×64 (looked like two forks or musical notes).
**Fix:** Regenerated `icons/lunch.png` with explicit fork (3 prongs + handle) and knife (blade with pointed tip + bevel) geometry using Pillow shape primitives. Icon now unambiguously reads as fork & knife.

### Simplify Pass
- Removed dead `font_logistics_label` variable (only used in the removed old info-box)
- Fixed stale docstring angle range "(300°→360°)" → "(270°→360°)"

### Files Changed
| File | Change |
|---|---|
| `apps/web/src/lib/tools/registry.ts` | Remove unsplash filter from Canva-connected branch; update JSDoc |
| `apps/web/plugins/design/flyer/render.py` | Remove duplicate date info-box; fix arc + vertical accent positions; remove dead font variable |
| `apps/web/plugins/design/flyer/icons/lunch.png` | Replaced with clear fork+knife silhouette |

### Smoke Test
Ran full render with Citlali's exact prompt (with Unsplash hero photo URL). All 4 checkpoints passed:
- Hero photo visible (orange-tinted career fair photo in right panel of hero band)
- Single date callout (THURSDAY / MAY / 22 / 10:00 AM - 2:00 PM, no duplicate box)
- Body text clean — no arc or line crossing letters
- Lunch icon reads as fork & knife

### Typecheck
- `pnpm --filter web typecheck` — PASS (no errors)
- No lint script exists in web package

### Upload Status
- `.env.local` not in worktree — upload skipped. Lopmon to run from main checkout post-merge.

---

## 2026-04-30 — Remove hero_image_url (sandbox has no network)

**Agent:** Sonnet coding agent (spawned by Lopmon)
**Branch:** `lopmon/flyer-no-photo-2026-04-30`
**PRD source:** Lopmon spawn prompt

### Why
PR #51 added `hero_image_url` which downloads a photo via `urllib.request.urlopen()` and composites it into the hero band. The Anthropic Skills API sandbox has no internet access — the download always fails. Kida (Marketing Director) reported "No external network in the sandbox" and gave up rather than producing a flyer.

This PR removes the hero photo feature entirely so the skill works again. All other wow-factor elements (date hero, custom icons, paper texture, geometric accents, custom typography) are sandbox-safe and remain untouched.

A future PR will add photo support using the Anthropic Files API.

### Files Changed

| File | Change |
|---|---|
| `apps/web/plugins/design/flyer/render.py` | Removed `hero_image_url` param, `_fetch_image`, `_smart_crop`, `_apply_hero_photo` functions; removed `io` and `urllib.request` imports; hero_text_w simplified to always use no-photo layout. |
| `apps/web/plugins/design/flyer/SKILL.md` | Removed "Recommended workflow: hero photo" section, `hero_image_url` input entry, photo-panel layout description, `hero_image_url` from both example invocations. Added removal note to Visual upgrade notes. Fixed stale "logistics info box" reference (removed in PR #52) → "venue line". |

### Smoke Test
Ran `render()` with Citlali's full Open Doors Career Day prompt (no hero_image_url). Output: 2550×3300 PNG. Visual check:
- Hero band renders cleanly with diagonal edge + headline — no broken photo panel
- Date callout: single THURSDAY / MAY / 22 / 10:00 AM - 2:00 PM block (no duplicate)
- Body text clean — no accent line crossings
- Lunch icon reads as fork & knife
- All four bullets visible

### Typecheck
- Ran from main checkout (node_modules not in worktree): `pnpm --filter web typecheck` — PASS

### Upload Status
- `.env.local` not in worktree — SKIPPED
- Lopmon to run upload from main checkout after merge: `export ANTHROPIC_API_KEY=$(grep -E '^ANTHROPIC_API_KEY=' apps/web/.env.local | cut -d= -f2- | tr -d '"' | tr -d "'") && pnpm dlx tsx scripts/upload-plugin-skills.ts`

---

# Session Log — feat/mailchimp-oauth-followup (2026-06-01)

**Agent:** Sonnet coding agent (spawned by Lopmon)
**Branch:** `feat/mailchimp-oauth-followup`
**Date:** 2026-06-01
**PR:** DRAFT against main (PR #23 fast-follow)

## Task

Fixed 3 minor reviewer findings from PR #23 (Mailchimp one-click OAuth). Finding #4 (relocate `getAppOrigin` out of `@/lib/google`) is DEFERRED as out-of-scope — cross-cutting ~13 import sites across 6 integrations.

## Changes

| Finding | File(s) | Change |
|---|---|---|
| #1 — DRY redirect URI | `connect/route.ts`, `callback/route.ts` | Adopted `getMailchimpRedirectUri()` helper in both routes instead of inlining the string. Removed unused `origin` var + `getAppOrigin` import from connect route. |
| #2 — Stale crypto label | `lib/crypto.ts`, `lib/tools/mailchimp.ts` | Renamed `CRYPTO_LABEL_MAILCHIMP_API_KEY` → `CRYPTO_LABEL_MAILCHIMP_TOKEN`; string value `"integrations.mailchimp_api_key"` → `"integrations.mailchimp_token"`. Log-only label; confirmed safe (not AES-GCM associated data). |
| #3 — State-mismatch UX | `callback/route.ts` | State-mismatch branch now calls `clearAndRedirect(...)` (cookie hygiene + redirect to integrations page) instead of returning raw JSON 400. |

## Status

`pnpm --filter web typecheck` — PASS
`pnpm --filter web build` — PASS (125 pages generated, no errors)

---

# Session Log — M1+M2 revise_grant_content completeness fixes (2026-06-10)

**Agent:** Sonnet coding agent (spawned by Lopmon)
**Branch:** `lopmon/m1-m2-revise-completeness`
**Worktree:** `C:\Users\Araly\edify-os\UsersAralyedify-worktreesm1-m2-revise`
**Base:** `origin/main` @ `02273a6`
**Date:** 2026-06-10
**Task:** Fix M1 (substrate not loaded in revise path) + M2 (draft_id declared in schema but not resolved in handler) per pr21-post-merge-review findings.

## Scope

Only files touched: `apps/web/src/lib/tools/grant-writing-handlers.ts`,
`apps/web/src/lib/tools/registry.ts`, and the new test file
`apps/web/src/lib/tools/__tests__/grant-writing-revise.test.ts`.
Pipeline routes, GrantDetailDrawer, and skills/ not touched.

## M1 — Substrate injection for revise path

**Problem:** `executeReviseGrantContent` destructured only `{ input, anthropic }` — `serviceClient`
was in the param type but unused. TONE_INSTRUCTIONS for `add_data` and `cite_examples`
told the model to "Add citations [entry_id] from the proof library" and "Draw from
voice_samples [entry_id]" but the handler never loaded those entries.

**Fix:** Added `orgId` and `serviceClient` to destructured params. Calls `buildSubstrate()`
with the content_type (falling back to `"loi"` mapping when content_type is absent or
non-MVP — loi covers prior_grants/P + outcomes/S + voice_samples). Injects substrate
into Block-2 (uncached — NO cache_control per PR #36 house rule). Graceful degradation
when proof library is empty: passes a "(No proof library entries found...)" note in the
substrate block so the model knows not to invent citations.

**Categories loaded:** same as `buildSubstrate()` for the given content_type:
- `loi` (default/fallback): prior_grants (P), outcomes (S), voice_samples (V), grant_writing.tone_rules
- `statement_of_need`: prior_grants (P), outcomes (P), voice_samples (V), grant_writing.tone_rules
- `project_description`: prior_grants (S), outcomes (P), voice_samples (V), grant_writing.tone_rules
- `budget_narrative`: prior_grants (S), voice_samples (V), grant_writing.tone_rules, grant_writing.indirect_rate_default

**Injection placement:** Block-2 (array index 1 of systemBlocks), after the revision persona
text (index 0). No cache_control on any block. User message unchanged structure.

## M2 — draft_id resolution

**Problem:** `revise_grant_content` schema (grant-writing.ts:144) declared `draft_id` as
"Accept a draft_id (from the pipeline)" but the handler only read `draft_text` and
returned `"draft_text is required"` whenever the model passed `draft_id` — wasting a turn.

**Contract chosen:** `draft_id` = grants_pipeline row UUID (the `id` column, used as
`.eq("id", draftId).eq("org_id", orgId)`). Handler loads the row, picks the
highest-`version` draft from the `drafts` jsonb array, uses its `content_md`.
Rationale: GrantDraft has no per-draft UUID — only `version` (integer) within a row —
so row-id → latest-version is the only unambiguous contract. Documented in inline
comment.

**Error paths:** all errors are instructive to the model:
- Row not found → tells model to use correct UUID or pass `draft_text` directly
- Row found but `drafts[]` empty → tells model to call `draft_grant_content` first
- Neither param provided → tells model both params and their semantics
- No feedback/tone_change → mentions both parameters by name

## Registry change

`registry.ts:547` — added `orgId` to the `executeReviseGrantContent` call (it was already
passed to `executeDraftGrantContent` on the line above).

## Tests

New file: `apps/web/src/lib/tools/__tests__/grant-writing-revise.test.ts`
16 tests covering:
- R-M1-A: substrate block appears when entries exist (voice_samples, outcomes)
- R-M1-B: no block has cache_control (PR #36 house rule)
- R-M1-C: graceful degradation when proof library empty
- R-M1-D: unknown content_type falls back to loi mapping
- R-M2-A: draft_id resolves to latest-version draft content_md
- R-M2-B: draft_text path unchanged
- R-M2-C: neither param → instructive error mentioning both
- R-M2-D: unknown draft_id → instructive error
- R-M2-E: empty drafts array → instructive error with recovery hint
- R-M2-F: no feedback/tone_change → instructive error

## Test results

`pnpm --filter web exec vitest run` — 4 files, 243 tests PASS (16 new + 34 existing funder-profile + 193 other)
`pnpm exec tsc --noEmit` — exit 0 (clean)

## PR

https://github.com/clm-studios/edify-os/pull/TBD — DO NOT MERGE (awaiting Minervamon review)
