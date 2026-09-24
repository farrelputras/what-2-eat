# What-2-Eat — Tag Hard Delete, Trash-Icon UX (PRD)

- Date: 2026-09-24
- Status: implemented, UNVERIFIED. DeleteBox beside RenameBox (strip-then-delete, production apply, commit ba9e006); `oxlint` and `tsc --noEmit` pass, `oxfmt --check` passes on touched files (full-repo check has pre-existing drift in untouched files). Pending: owner-verified emulator smoke (reseed → delete unused tag + delete used tag).
- Supplements: `DONE-2026-09-24-what-2-eat-tag-rename-merge.md` (RenameBox with deprecate-as-retire) and `DONE-2026-09-24-what-2-eat-tag-registry.md` (registry posture, deprecate-instead-of-delete rule).
- Locked decisions (from planning session 2026-09-24): hard delete strips the value from affected places first, then deletes the registry doc / trash-icon button sits beside Rename, Deprecate stays as-is / simple confirm dialog with usage count / any logged-in user may delete (same posture as rename, rules open delete to authenticated users).
- Session scope: PRD only. No implementation.

## 1. Goal

Deleting a tag feels like deleting a file: click the trash icon on a tag row, confirm in a dialog, done. The registry entry is gone, not retired.

Success criteria:

- Click trash on `menus:soup` with zero usage → dialog confirms → `menus:soup` doc deleted, row disappears from the manager.
- Click trash on `menus:soup` used by N places → dialog shows "N places use soup: name1, name2 +K more" → Delete removes `soup` from all affected places, then deletes the `menus:soup` doc. No place still holds `soup`.
- Deprecate/Restore button is untouched and keeps working (soft-retire remains available next to Rename).
- `pnpm lint`, `pnpm format --check`, and `tsc --noEmit` pass.

## 2. Non-goals

- No change to Deprecate/Restore behavior, position, or copy.
- No delete affordance on `pending` queue rows (promote-only, same as rename).
- No bulk multi-tag delete, no undo/revert UI (deleted docs are gone; places keep their remaining tags).
- No schema change, no seed change, no stored counters (`describeTagUsage` stays live-derived).
- No admin allowlist (inherits registry posture: all logged-in users may delete).

## 3. Current-state facts (verified in tree)

- Registry: `tags` collection, doc id `<facet>:<value>`, `TagDoc` (`lib/tags/types.ts:1-9`, `tagDocId` at `:24-26`).
- Row actions: `TagRow` in `components/tags/tags-manager-client.tsx:356-371` — `SynonymBox` + Deprecate/Restore outline button (`:359-361`) + `RenameBox` ghost button (`:229-242`). No delete path exists.
- Rename retires via deprecate-after-merge: `createTagDocRemote` if target missing → `applyTagMergeToPlaces()` → `setTagDeprecatedRemote(sourceId, true)` (`tags-manager-client.tsx:204-214`).
- Delete is hard-blocked: `allow delete: if false` with comment "Deprecate instead of deleting so old places keep parsing" (`firestore.rules:116-127`). No `deleteTagDoc` transport exists in `lib/firebase/client.ts`.
- `food_places.tags` holds plain strings under open-vocabulary structural caps (`firestore.rules:37-48`); removing a registry doc never breaks parsing, it only drops the suggestion.
- In-repo precedents for the dialog: `Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogDescription`, `DialogFooter` in `components/ui/dialog.tsx:112-121`, composed into a delete confirm in `components/account/address-book.tsx:209-253` (`DeleteDialog`). Trash icon precedent: `Trash2` from `lucide-react` (`address-book.tsx:3,88`).
- Pure helpers reusable as-is: `parseTagValue`, `isValidTagValue`, `normalizeTagValue`, `describeTagUsage` (`lib/tags/index.ts`). `replaceTagValueInPlace` (`:326-386`) always moves source→target, so a remove-only variant is needed; `previewMerge` row data (`row.count`, `row.examples` in `TagRow`) already feeds the dialog copy with no new preview call.

## 4. UX change (only change)

Add a `DeleteBox` beside `RenameBox` in `TagRow`'s action row (after `RenameBox`, `tags-manager-client.tsx:362-369`):

- Row shows a ghost icon button with `Trash2` (`aria-label="Delete {value}"`, destructive hover) next to the Rename ghost button. Deprecate/Restore outline button stays where it is.
- Click → `Dialog` (same primitives as `address-book.tsx:DeleteDialog`):
  - Title: `Delete {value}?`
  - Description: `count === 0` → `Nothing uses {value} — this removes the entry from the registry.` Otherwise → `{N} place{s} use {value}: {examples (up to 3)}{ +K more}. This removes it from those places and deletes the registry entry.`
  - Fixed line: `This cannot be undone.`
  - Footer: Cancel (outline, closes) + Delete (destructive, disabled while applying).
- Delete sequence: `stripTagFromPlaces({ facet, value })` → `deleteTagDoc(id)` → toast `"soup" deleted.` / `"soup" deleted (removed from N places).` Close + reset. Errors: toast "Could not delete the tag. Please try again." No silent fail.
- Auth gate: same `requireUid(uid)` guard as Rename/Deprecate; unauthenticated click toasts "Please sign in again, then retry."
- Copy stays inline and server-first; no `t()` runtime.

## 5. Data, validation, rules, transports

- No `TagDoc` / seed change. `food_places.tags` shape unchanged.
- `lib/tags/index.ts`: new pure `removeTagValueFromPlace(tags, facet, value): FoodTags | null` — the remove-half of `replaceTagValueInPlace` (list facets filter the value; single-value `priceTier`/`healthStyle` clear to `undefined`; open facets filter `pending`). Returns null when the place does not hold the value.
- `lib/firebase/client.ts`: new `stripTagFromPlaces({ facet, value })` mirroring `applyTagMergeToPlaces` (`:380-420`) batch shape (full `getDocs` + `removeTagValueFromPlace` + `batch.commit`, returns count) + new `deleteTagDoc(id)` (`deleteDoc`). Delete order: strip → commit → `deleteDoc`. No `updatedByUid` on delete (doc is gone).
- Stripping only shrinks facet lists, so structural caps (`firestore.rules:37-48`) stay satisfied; cleared single-value keys are omitted from the update payload (same conditional-spread shape as `applyTagMergeToPlaces`).
- `firestore.rules`: `match /tags/{tagId}` → `allow delete: if request.auth != null;` and update the stale "Deprecate instead of deleting" comment to describe both paths (deprecate = retire, delete = strip + remove).
- After strip + delete the row vanishes cleanly: no registry doc + zero usage = no row (`useFacetRows`, `tags-manager-client.tsx:82-104`).

## 6. Acceptance checklist

- [ ] Trash icon renders beside Rename on every registry row (known six + open facets); Deprecate/Restore unchanged in place and behavior.
- [ ] `count === 0` → dialog shows registry-only copy → Delete removes the doc, row disappears, toast correct.
- [ ] `count > 0` → dialog lists count + up to 3 names (+K more) → Delete strips all affected places (verified: none hold the value, no dupes, remaining tags intact) → doc deleted.
- [ ] Single-value facet (`priceTier`/`healthStyle`) strips to absent key, passes `isValidTags`.
- [ ] Unauthenticated delete rejected by rules; logged-in delete allowed (rules change verified).
- [ ] Pending rows show no Delete affordance.
- [ ] `pnpm lint`, `pnpm format --check`, and `tsc --noEmit` pass.
- [ ] Emulator smoke (owner-verified, manual): reseed → delete unused tag → delete used tag → confirm places rewritten, doc gone, suggestions/filters update.

## 7. Implementation order (suggested, not mandated)

1. `lib/tags/index.ts`: add `removeTagValueFromPlace` (pure, unit-shaped like `replaceTagValueInPlace`).
2. `lib/firebase/client.ts`: add `stripTagFromPlaces` + `deleteTagDoc`.
3. `firestore.rules`: open `tags` delete to authenticated users, refresh the deprecate comment.
4. `components/tags/tags-manager-client.tsx`: add `DeleteBox` (trash ghost button + `Dialog` per `address-book.tsx:DeleteDialog` pattern) after `RenameBox` in `TagRow`.
5. Leftover grep for `allow delete: if false` / stale "Deprecate instead of deleting" copy + lint, format check, typecheck. Emulator smoke is owner-verified manually.
