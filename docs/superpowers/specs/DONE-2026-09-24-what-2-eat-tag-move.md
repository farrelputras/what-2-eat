# What-2-Eat — Move Tag Across Facets (PRD)

- Date: 2026-09-24
- Status: implemented, UNVERIFIED. MoveDialog (Move… button + drag-drop trigger), previewMoveCaps/validateMoveTarget pre-flight, chunked applyTagMoveToPlaces + moveTagSynonyms; `pnpm lint`, `pnpm format --check`, and `tsc --noEmit` pass. Pending: owner-verified browser smoke per §9 (multi-place move, collision, over-cap, single-value overwrite, keyboard-only, mobile).
- Language: English.
- Supplements: `DONE-2026-09-24-what-2-eat-tag-registry.md` (registry + promote, implemented) and `DONE-2026-09-24-what-2-eat-tag-rename-merge.md` (same-facet rename, implemented). This doc adds cross-facet relocation of an existing tag; it does not change the `FoodPlace.tags` shape from PRD-1.
- Locked decisions (from planning session 2026-09-24): move relocates the value unchanged (no rename-in-the-same-gesture) / drag-drop is a trigger, never an apply — every drop opens a preview + confirm dialog / synonyms move with the tag (emptied from the source doc) / `pending` is never a drop target / moves into single-value facets (`priceTier`, `healthStyle`) are allowed with an explicit overwrite warning / all logged-in users may move (no admin allowlist; preview + confirmation is the compensating guardrail).
- Session scope: PRD only. No implementation.

## 1. Goal

Let a tag itself change facets — e.g. `menus:porridge` → `ingredients:porridge`, or `menus:brunch` → `taste:brunch` — because today the only relocation path is promoting out of `pending`, and miscategorized resolved tags have no way home.

Success criteria:

- Dragging a tag card onto another facet's table (or using the per-card Move action) opens a confirm dialog with an affected-place preview; nothing writes before explicit confirmation.
- Confirming rewrites every holding place, creates the target registry doc if absent, moves synonyms, and deprecates the source doc — the catalog, filters, suggestions, and badges agree afterwards.
- Invalid targets (collision, over-cap, `pending`) are refused before any write, with the reason shown.
- A keyboard-only and mobile user can perform the same move without drag-drop.
- `pnpm lint`, `pnpm format --check`, and `tsc --noEmit` pass.

## 2. Non-goals

- No rename-with-move: the value is byte-identical before and after. Rename stays the same-facet `RenameBox` flow.
- No reorder-within-facet (pure visual sorting) — out of scope unless the implementation gets it for free from the DnD library.
- No physical delete of the source doc (rules forbid it; deprecate instead).
- No change to the `FoodTags` shape (owned by PRD-1), no admin roles, no version history / revert UI, no saved-filter migration (filters are ephemeral UI state).

## 3. Current-state facts (verified in tree)

- The only relocation today is promote `pending` → facet, registry-doc-only, no place rewrite (`components/tags/tags-manager-client.tsx:508-526`).
- Same-facet rename carries the impact-preview + confirm-checkbox pattern this PRD reuses (`RenameBox`, `components/tags/tags-manager-client.tsx:158-286`): `previewMerge` for affected/overlapping places, `createTagDoc` for the target, `applyTagMergeToPlaces` batch, `setTagDeprecated` on the source.
- Cross-facet logic already exists but is UI-unreachable: `previewMerge` and `replaceTagValueInPlace` both branch on `targetFacet` (`lib/tags/index.ts:284-386`), including the single-value overwrite path (`holder.priceTier = target`, `lib/tags/index.ts:381-382`) and the dedup-vs-overwrite copy (`tags-manager-client.tsx:267-270`).
- Doc IDs are `facet:value` (`lib/tags/types.ts:24-26`), so a move is create-target + deprecate-source + rewrite-N-places, never an in-place update.
- Guards already exist: `findValueCollision` forbids one value in two facets (`lib/tags/index.ts:50-63`, with the `porridge`/`mixed` pins in `buildRegistryMaps`, `lib/tags/index.ts:198-203`); caps live in `firestore.rules:29-48` and Zod (`lib/foods/index.ts:64-90`); batch apply is one unchunked client-side `writeBatch` (`lib/firebase/client.ts:387-420`).
- Manager layout this PRD builds on: `FacetSection` per facet + `PendingRow` queue (`components/tags/tags-manager-client.tsx:620-655,657-696`); `useFacetRows` merges registry docs with live usage (`components/tags/tags-manager-client.tsx:82-104`).

## 4. Critique — why DnD-as-trigger, and where the bodies are

1. **A one-second gesture fires an N-document migration.** Drag-drop reads as cosmetic; the cost is a catalog-wide rewrite. Gating apply behind the existing preview + checkbox pattern converts an invisible cost into an explicit choice. This is the core safety property of the PRD.
2. **Accidental drops are the dominant failure mode.** Facet tables sit adjacent in one scrolling page; a mis-release without a confirm step is an un-undoable mass edit (no revert UI, delete forbidden). The dialog is the undo.
3. **DnD alone excludes users.** Keyboard-only, screen-reader, and touch users cannot reliably drag cards in a `sm:grid-cols-2 lg:grid-cols-3` grid. The per-card "Move…" action opening the same dialog with a facet dropdown is not a nice-to-have — it is the accessible path, and acceptance requires the full flow to work through it.
4. **Validation must happen at drag-over, not after drop.** Collision (`findValueCollision`) and cap overflow are deterministic from `{sourceFacet, sourceValue, targetFacet}` plus live usage. Highlighting valid/invalid targets mid-drag with the reason (e.g. `"porridge" already lives in Menus`) prevents doomed drops instead of apologizing for them.
5. **Single-value targets destroy data.** Moving into `priceTier`/`healthStyle` overwrites the occupant on every affected place. Allowed per the locked decision, but the dialog must name the overwrite explicitly (reuse the "they'll be overwritten" copy) and the preview must list places that already hold a value there.
6. **Synonym relocation can split suggestion traffic.** Moving synonyms to the target while emptying the source keeps bare-token resolution (`synonymToTag` in `buildRegistryMaps`) pointing at exactly one home. Leaving copies behind would fork `soto`-style shortcuts across two facets.
7. **`pending` as a target is a rollback in disguise.** Post-PRD-1, `pending` is the unreviewed queue; dropping a resolved tag there demotes catalog data back into the queue and re-triggers the promote path. Refused by rule: the locked decision is encoded as a product invariant, not just a disabled drop zone.

## 5. Data model (no shape change from PRD-1)

A move is a coordinated triple, all-or-nothing from the user's perspective:

1. **Target registry doc** `targetFacet:value` created if absent (same validation as add-value: patterns, cross-facet collision check, existing-id check — `validateFacetValue`, `components/tags/tags-manager-client.tsx:56-73`). Synonyms copied from the source doc, then cleared on the source.
2. **Place rewrite** of every holder: remove `value` from the source facet's storage, add it to the target facet's storage (multi facets dedupe; single facets overwrite with warning). Reuses `replaceTagValueInPlace` semantics extended to `tags.open` groups per PRD-1.
3. **Source registry doc** `sourceFacet:value` set `deprecated: true` (never deleted, per `firestore.rules:126`).

Deliberately absent: value changes, synonym edits mid-move, batch resume tokens (chunked batches with a per-chunk report instead).

## 6. Filter + display semantics (unchanged, restated for move)

- OR-within / AND-across across known and open facets; inactive facet = no constraint; `pending` never filters, stays name-searchable. A move changes which group a value filters under — the preview must say so in plain words ("stops matching Menu filters, starts matching Ingredient filters").
- `deprecated` source values vanish from suggestions and filter groups; holding places that somehow retain them (failed chunks, concurrent edits) keep parsing and keep badges.

## 7. UX changes

1. **Drag source:** each `TagRow` card gains a drag handle (visible affordance + tooltip + keyboard-focusable). The whole card is not draggable — only the handle — so text selection and button clicks keep working.
2. **Drop targets:** `FacetSection` containers (known + PRD-1 open facets) accept drops; `pending` section never does (no affordance, drops refused with the invariant message). During drag-over, targets show valid/invalid state with the reason; invalid drops are rejected without opening the dialog.
3. **Confirm dialog (the actual apply gate):** on valid drop — or via the per-card "Move…" button with a facet dropdown — a dialog opens reusing `RenameBox` structure: target summary, `previewMerge`-powered impact line ("N places use X: A, B, C +M more"), overlap line ("K already have X there — they'll be deduped/overwritten", with the single-value overwrite variant), mandatory checkbox when N > 0, Save/Cancel. Save runs create-target → chunked place rewrite → move synonyms → deprecate source, with per-chunk progress and a final Chen ("Moved N places; `source` retired" / partial-failure variant listing failed docs).
4. **Fallback path:** the "Move…" button flow is identical minus the drag: pick target facet from a dropdown (excluding `pending` and the source facet, flagging collision/over-cap options with reasons), then the same dialog. Touch, keyboard, and screen-reader acceptance runs go through this path.
5. Copy stays inline and server-first; no `t()` runtime.

## 8. Validation, rules, seed, cutover

- **Client/domain:** pre-flight reuses `findValueCollision` (refuse cross-facet duplicates), `previewMerge` (affected + already-target sets), and cap checks against the target facet (per-facet cap, resolved total ≤ 8 per PRD-1) computed over live `foods` state before the dialog enables Save. Stale-state re-check immediately before commit (re-pull affected docs) guards against concurrent edits.
- **Batch:** chunked writes (≤ 500 per batch, sequential commits, per-chunk count) replacing the single-`writeBatch` pattern for moves; failures reported per doc with retry/skip guidance, never silent. Pre-flight predicts cap refusals so partial application is the exception, not the norm.
- **Registry writes:** `createTagDoc(target)` if absent → synonym move (add to target, clear source) → `setTagDeprecated(source, true)`. Order matters: places first or registry first must be fixed in implementation (recommended: target doc → places → synonyms → deprecate, so suggestions never point at a missing doc mid-flight).
- **Rules/seed:** no `firestore.rules` shape change from PRD-1; no seed changes (move operates on live data, not fixtures). No production migration script — each move is its own scoped migration with its own preview.
- **Backlog:** batch resume after client crash, move audit log, revert-move, admin-only gate if abuse appears.

## 9. Acceptance checklist

- [ ] Dragging a used tag onto a valid facet opens the confirm dialog with the exact affected-place preview; cancelling writes nothing (registry + places byte-identical).
- [ ] Confirming a multi-facet move (e.g. `menus:porridge` → `ingredients:porridge`) rewrites all holders, creates the target doc, moves synonyms, deprecates the source; catalog filters, suggestions, and badges agree.
- [ ] Collision target (value lives in a third facet) is refused at drag-over and in the dropdown, naming the holding facet.
- [ ] Over-cap move (target group or resolved total would exceed caps on any place) names the offending places pre-commit and refuses or partially applies only with an explicit per-doc failure report.
- [ ] Single-value target with occupants warns "overwritten" and lists affected places; confirming overwrites exactly those docs.
- [ ] `pending` accepts no drops and offers no Move target; attempting it explains the invariant.
- [ ] Full flow completes keyboard-only and on a narrow mobile viewport via "Move…", including preview, checkbox, and success toast.
- [ ] Zero-usage move (registry-only relocation + deprecate) works and reports "no places use X".
- [ ] `pnpm lint`, `pnpm format --check`, and `tsc --noEmit` pass.

## 10. Implementation order (suggested, not mandated; starts after PRD-1)

1. Domain: extend `previewMerge` / `replaceTagValueInPlace` / usage helpers to `tags.open` groups + unit probe (cross-facet preview counts, dedupe vs overwrite, open-group relocation).
2. Chunked batch writer in `lib/firebase/client.ts` beside `applyTagMergeToPlaces` (or its successor) + stale-state re-check.
3. "Move…" dialog per card (dropdown target, preview, checkbox, Save/Cancel) — the accessible path first, fully acceptance-tested before DnD.
4. Drag handle + drop targets + drag-over validation reusing the dialog's pre-flight.
5. Synonym relocation order (target → places → synonyms → deprecate) + partial-failure reporting.
6. Leftover grep + gates + browser smoke per §9 (multi-place move, collision, over-cap, single-value overwrite, keyboard-only, mobile).
