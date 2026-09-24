# What-2-Eat — Tag Rename / Merge, Title-Rename UX (PRD)

- Date: 2026-09-24
- Status: PRD only, not implemented.
- Supplements: `2026-09-24-what-2-eat-tag-registry.md` (registry + MergeBox with facet + value inputs + emulator-only apply). This doc simplifies that to same-facet rename and enables apply everywhere.
- Locked decisions (from planning session 2026-09-24): same-facet only / rename-onto-existing = merge / apply enabled in production / all logged-in users may rename (inherits registry posture, no admin allowlist).
- Session scope: PRD only. No implementation.

## 1. Goal

Renaming a tag feels like renaming a title: click Rename on a tag row, edit the value inline, save. Typing an existing value merges.

Success criteria:

- Click Rename on `menus:soup` → input prefilled `soup` → type `soto` → save rewrites affected places, creates `menus:soto` if missing, deprecates `menus:soup`.
- Typing an existing value (e.g. `rawon` where `menus:rawon` exists) merges: affected places end with one `rawon`, no duplicates.
- `usageCount > 0` shows "N places use X" + affected names + required confirm checkbox; refuses to apply unconfirmed.
- Works in production (no emulator gate). Preview is the safety check.
- `pnpm lint`, `pnpm format --check`, and `tsc --noEmit` pass.

## 2. Non-goals

- No cross-facet move (pending → facet stays in Promote; facet → facet is rejected with "use Promote").
- No separate merge picker, no bulk multi-source merge, no undo/revert UI (deprecate + restore covers it).
- No rules change, no schema change, no stored counters (`describeTagUsage` stays live-derived).
- No rename for the `pending` queue rows (promote-only); rename applies to facet tables (known six + open facets).

## 3. Current-state facts (verified in tree)

- Registry: `tags` collection, doc id `<facet>:<value>`, `TagDoc` (`lib/tags/types.ts:1-9`).
- Manager UI: `MergeBox` in `components/tags/tags-manager-client.tsx:160-288` — target facet + value inputs, `previewMerge()` live preview, confirm checkbox when `count > 0`, Apply button.
- Apply gated: `canApplyMerge = NEXT_PUBLIC_FIRESTORE_EMULATOR_HOST !== ""` (`tags-manager-client.tsx:40`). Without the env var the UI shows "Apply runs in the emulator only" — merge is not live in production.
- Apply path (works, emulator-only): `createTagDocRemote` if target missing → `applyTagMergeToPlaces()` (full `getDocs` + `replaceTagValueInPlace` + `batch.commit`) → `setTagDeprecatedRemote(source, true)` (`tags-manager-client.tsx:206-216`, `lib/firebase/client.ts:382-420`, `lib/tags/index.ts:326-386`).
- Rules already permit production apply: any logged-in user may update any `food_places` doc and create/update any `tags` doc; delete denied (`firestore.rules:70-127`). No rules change needed to ungate.
- Pure helpers reusable as-is: `parseTagValue`, `isValidTagValue`, `findValueCollision`, `previewMerge`, `replaceTagValueInPlace` (`lib/tags/index.ts`).

## 4. UX change (only change)

Replace `MergeBox` (facet + value inputs, "Rename / merge" button) with a same-facet `RenameBox`:

- Row shows value + `Rename` ghost button (replaces "Rename / merge").
- Click → single `Input` prefilled with current value (aria-label `Rename {value} in {facet}`), `Save` + `Cancel`.
- Live preview via existing `previewMerge({ places, sourceFacet, sourceValue, targetFacet: sourceFacet, targetValue })`:
  - `count === 0`: "No places use X — renaming only retires the entry."
  - `count > 0`: "N places use X: name1, name2 +K more" plus `alreadyTarget` note: "M already have Y — they'll be deduped."
- `needsConfirm = count > 0` → required checkbox "Yes, rewrite N places."
- Apply (`Save`/`Rename`) always rendered; disabled when target empty, invalid, or same-as-source. Delete the `canApplyMerge` branch and the emulator-only note.
- Validation on save (same helpers): `parseTagValue` → `isValidTagValue`, else "Value must be 1–24 characters: letters, digits, spaces, hyphens." → same-value → "Pick a different name." → `findValueCollision(target, sourceFacet, maps.valueToFacet)` → `"Y" already lives in {facet}.` (blocks cross-facet collision).
- Save sequence (unchanged order): `createTagDocRemote` if target id missing → `applyTagMergeToPlaces` (same facet both sides) → `setTagDeprecatedRemote(sourceId, true)` → toast `Renamed in N places; X retired.` / `Merged N places into Y; X retired.` Close + reset.
- Errors: toast "Could not apply the rename. Please try again." No silent fail.
- Copy stays inline and server-first; no `t()` runtime.

## 5. Data, validation, rules, transports

- No `TagDoc` / rules / seed change. `food_places.tags` shape unchanged.
- Same-facet `replaceTagValueInPlace` dedupes via `addToList` (no cap overflow); single-value facets (`priceTier`/`healthStyle`) overwrite target — call out in confirm text.
- `firestore.rules`: untouched (`tags` create/update + `food_places` update already allow this).
- Transports: `applyTagMergeToPlaces`, `createTagDoc`, `setTagDeprecated` unchanged. Only deletion: `NEXT_PUBLIC_FIRESTORE_EMULATOR_HOST` gate + `targetFacet` input state in client.
- Seed: unchanged. Verification of agreement (`deriveFacetCatalog ∩ registry`) unchanged.

## 6. Acceptance checklist

- [ ] Rename `menus:soup → menus:soto` (new value): `menus:soto` doc created, affected places rewritten, `menus:soup` deprecated, suggestions/filter update, old places still parse.
- [ ] Merge `menus:soup → menus:rawon` (existing): affected places hold single `rawon`, none hold `soup`; count toast correct.
- [ ] `usageCount > 0` blocks unconfirmed apply; `count === 0` needs no checkbox.
- [ ] Same value / empty / invalid / cross-facet-collision each rejected with toast, no write.
- [ ] Works with emulator env unset (production path); no "emulator only" copy remains.
- [ ] Pending rows have no Rename affordance.
- [ ] `pnpm lint`, `pnpm format --check`, and `tsc --noEmit` pass.
- [ ] Emulator smoke (owner-verified, manual): reseed → rename new value + merge onto existing → confirm docs rewritten, source deprecated, no dupes.

## 7. Implementation order (suggested, not mandated)

1. `components/tags/tags-manager-client.tsx`: replace `MergeBox` with same-facet `RenameBox` (single input, drop `targetFacet` state + `canApplyMerge`).
2. Keep `previewMerge` / `applyTagMergeToPlaces` / `replaceTagValueInPlace` as-is; call with `targetFacet = sourceFacet`.
3. Leftover grep for `canApplyMerge` / "emulator only" / "Rename / merge" copy + lint, format check, typecheck. Emulator smoke is owner-verified manually.
