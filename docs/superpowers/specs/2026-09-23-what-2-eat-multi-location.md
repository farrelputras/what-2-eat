# What-2-Eat — Multi-Location Places (`areas: string[]`) (PRD)

- Date: 2026-09-23
- Status: implemented (commit `dad31eb`). As-built notes in this line supersede the draft where they differ.
- Session scope: PRD only. No implementation in this session; implemented separately.
- As-built: per spec — `areas: string[]` on `FoodPlace`, checkbox group in the form, badge-per-area on cards + shuffle panel, single-select OR-match filter, strict readers, rules + seed + one-shot backfill `scripts/migrate-food-areas.ts` (`seed:migrate-areas`). No deviations: singular `filters.area` (selected filter value) and per-item `formatArea()` retained by design; no legacy `area` doc key remains.
- Language: English (matches sibling specs; UI copy stays inline English per repo rule).
- Supplements: `2026-09-22-what-2-eat-design.md` (v1 catalog), `2026-09-22-what-2-eat-crud.md` (CRUD, device-local iteration), `2026-09-22-what-2-eat-firebase.md` (Firestore + login-required, current architecture), `2026-09-22-what-2-eat-social-links.md` (Instagram/TikTok links). This doc changes the area semantics on top of all of them; it changes no auth, tag, shuffle, or social-link semantics.

## 1. Goal

A food place can exist in more than one location. One brand is one Firestore doc carrying `areas: string[]` (e.g. one Yoshinoya doc with `areas: ["batam", "surabaya"]`), replacing the current single `area: string`.

Success criteria:

- A visitor creates or edits a place with 1–3 areas and every selected area renders as its own badge on the card and in the shuffle-result panel.
- Filtering by one area matches every place whose `areas` contains it (OR-match); `All areas` is unchanged.
- All pre-existing docs with singular `area` are backfilled to `areas: [area]` with the old field removed; no doc with the legacy `area` field remains.
- `pnpm lint`, `pnpm typecheck`, and `pnpm build` pass.

## 2. Non-goals

- No one-doc-per-branch model. Names stay globally unique (one doc per brand); same name in a different area is still a duplicate, not a second doc.
- No new areas outside the `batam | malang | surabaya` enum.
- No branch-level details (street address, hours, phone, Maps links, per-branch menus or photos).
- No per-area tags, social links, or ownership. Tags and links stay place-level.
- No multi-select area filter. The filter stays single-select (`All areas` + one area).
- No localStorage work (already removed by the Firebase spec).

## 3. Locked decisions (from review session)

| Decision | Choice | Why |
|---|---|---|
| Data shape | One doc per brand, `areas: string[]` | A chain is one place the visitor picks from; per-branch docs would fork the global duplicate-name guard and double every card for the same brand. |
| Migration | Automatic backfill (`area` → `areas: [area]`, old field deleted) | Small dataset (17 seeds + live docs); a one-shot script converges the data instead of carrying a dual-shape reader forever. |
| Filter | Single-select, OR-match (`selected ∈ place.areas`) | Keeps the existing dropdown and `filterFoods` call sites; multi-select filter adds combinatorial UI for no requested use case. |
| Form | Multi-checkbox (Batam / Malang / Surabaya), min 1 | Checkboxes show all 3 options at once with zero dropdown plumbing; matches the 3-value fixed enum. |
| Display | N separate area badges, one per area | Confirmed 2026-09-23. Reuses the existing `Badge variant="outline"` pattern; a joined `"Batam, Surabaya"` string would invent a new text style. |
| Release order | Backfill first, then deploy code | Confirmed 2026-09-23. Readers require `areas` only, so data must converge before code lands; no tolerant dual-reader is carried forward. |

## 4. Current-state facts (verified in tree)

- Entity: `FoodPlace { area: string; id: string; instagramUrl?; name: string; tags: string[]; tiktokUrl? }` (`lib/foods/types.ts`).
- Input: `FoodInput { area: string; ... }`, `FoodInputErrors { area?: string; ... }`, `FOOD_AREAS = ["batam", "malang", "surabaya"]`, `normalizeFoodArea` (trim + lowercase), zod `area: z.enum(FOOD_AREAS)` (`lib/foods/index.ts`).
- Filter: `filterFoods` compares `place.area.toLowerCase() !== area`; `deriveAreaCatalog` maps `place.area` (`lib/foods/index.ts`).
- Readers: `toFoodPlace` in `lib/firebase/client.ts` and `lib/firebase/server.ts` both require `area` as string and carry no `areas` concept.
- Writers: `createPlace` / `updatePlace` in `lib/firebase/client.ts` normalize and write singular `area`.
- Form: `FoodFormDialog` uses a single `Select` bound to `area` with `errors.area` inline (`components/foods/food-form-client.tsx`).
- Catalog: single-select `Select` (`All areas` + derived options), `formatArea` singular, one `<Badge variant="outline">{formatArea(picked.area)}</Badge>` in the shuffle panel and one area `<p>` per card (`components/foods/foods-catalog-client.tsx`).
- Rules: `firestore.rules` allows `read` for any logged-in user, `create`/`update` with `keys().hasOnly(["area", "name", "tags", "createdByUid", "createdAt", "updatedAt", "instagramUrl", "tiktokUrl"])` plus `area in ["batam", "malang", "surabaya"]`, `delete` for any logged-in user.
- Seed: `lib/foods/data/foods.json` — 17 rows, all `"area": "surabaya"`; `scripts/seed-foods.ts` validates `row.area` against the enum and writes singular `area`.
- Static `lib/foods/server.ts` (`getAllFoods` / `getTagCatalog` / `getAreaCatalog`) reads the same JSON; it is archive/seed, not the runtime read source (runtime is Firestore via `subscribeFoodPlaces` + `fetchFoodPlacesInitial`).

## 5. Critique — why this shape, and what it costs

1. **One doc per brand keeps identity simple.** The duplicate-name guard (`validateFoodInput`, case-insensitive over the merged list) already treats a name as global identity. Per-branch docs would require either allowing duplicate names (breaking the guard) or inventing composite keys (`name + area`), plus dedup UI. The cost: per-branch differences (different tags or links per city) cannot be expressed — accepted, since no such requirement exists.
2. **Backfill-once beats dual-shape readers.** Supporting both `area` and `areas` in `toFoodPlace` forever doubles every test matrix (old-only, new-only, both, neither). The dataset is tiny, so a scripted convergence plus strict readers is cheaper. The cost is release ordering: the backfill must land before the code, or strict readers drop unmigrated rows as `null`.
3. **Single-select OR filter is the smallest correct filter.** Multi-select area filtering would need AND-vs-OR semantics of its own; single-select with `selected ∈ areas` answers the only asked question ("show me what is in Surabaya") with the existing dropdown untouched.
4. **Checkboxes fit a 3-value enum; they do not scale.** If the area list ever grows past ~5, checkboxes become a chip multi-select like tags. That migration touches only the form leaf, never stored data.

## 6. Data model

`FoodPlace` replaces `area` with `areas`, owned by `lib/foods/types.ts`:

```ts
export interface FoodPlace {
  areas: string[];
  id: string;
  instagramUrl?: string;
  name: string;
  tags: string[];
  tiktokUrl?: string;
}
```

- `areas`: 1–3 entries, each lowercase, each in `FOOD_AREAS`. Canonical order follows `FOOD_AREAS` (not insertion order) so badges render deterministically.
- No `area` field anywhere after migration: not in the type, not in Firestore docs, not in seed JSON. The backfill deletes it.
- Everything else rides along unchanged: doc ID = `slugFoodId(name)`, `createdByUid` internal, `createdAt`/`updatedAt` server timestamps, optional social links, tags 1–8.

## 7. Normalization and validation rules (load-bearing)

Enforced in the existing pure helpers (`lib/foods/index.ts`) so client validation and any future server path share them:

| Field | Rule |
|---|---|
| `areas` | Each entry: `trim` + lowercase; empties dropped; unknown values dropped before validation so the error is the single `"Select at least 1 area"` message. |
| `areas` | Deduped case-insensitively; output sorted in `FOOD_AREAS` order; cap 3 ( = enum size). |
| `areas` | zod: `z.enum(FOOD_AREAS).array().min(1).max(3)`. At least 1 required; more than 3 impossible via UI but rejected defensively. |
| `name`, `tags`, URLs | Unchanged (`normalizeFoodName`, `normalizeFoodTags`, `normalizeFoodUrl`, max 80/24/300, `https://` check, global duplicate-name guard). |

`FoodInput` / `FoodInputErrors` replace `area: string` / `area?: string` with `areas: string[]` / `areas?: string`. `normalizeFoodArea` is removed; the new helper is `normalizeFoodAreas(values: string[]): string[]`.

## 8. Functional requirements

### 8.1 Filtering and catalogs

- `filterFoods`: `area === "all"` (or empty) matches everything; otherwise a place matches iff `place.areas` contains the selected area (case-insensitive compare, same as today). Tag-OR, name-contains, and `pickRandomFood`-from-filtered semantics unchanged.
- `deriveAreaCatalog`: `flatMap(place.areas)`, deduped, sorted — the filter dropdown options derive from live data as today.
- The existing guard (`effectiveArea` resets to `"all"` when the selected area leaves the catalog) is unchanged.

### 8.2 Display (cards + shuffle panel)

- Each place renders one `<Badge variant="outline">` per area (canonical `FOOD_AREAS` order), in both the grid card and the shuffle-result panel. `formatArea(area: string)` becomes a per-item formatter reused in a loop (or a `formatAreas` returning the label list); no joined-comma string style.
- A place with one area renders exactly like today's card (one badge, same geometry).

### 8.3 CRUD form (`FoodFormDialog`)

- The `Select` is replaced by a checkbox group: three checkboxes (Batam / Malang / Surabaya) in a `fieldset` with a `legend`, bound to `areas: string[]`.
- Prefilled on edit from the stored `areas`. Unchecking all boxes and submitting is blocked with the inline `areas` error (`role="alert"`), following the existing name/tags pattern.
- Submitted through the same `validateFoodInput(input, existing, place?.id)` path. Duplicate-name behavior unchanged (global, self excluded on edit).

### 8.4 Readers and writers

- `toFoodPlace` (both `lib/firebase/client.ts` and `lib/firebase/server.ts`): require `areas` as an array of strings; docs without a valid non-empty `areas` return `null` (filtered out, same treatment as docs missing `name`/`tags` today).
- `createPlace` / `updatePlace`: write `areas: normalizeFoodAreas(input.areas)`; never write `area`.
- `updatePlace` needs no `deleteField()` for the area change because `areas` always has a value; social-link `deleteField()` behavior is untouched.

### 8.5 Rules (`firestore.rules`)

- `create` and `update` share the same shape: `keys().hasOnly(["areas", "name", "tags", "createdByUid", "createdAt", "updatedAt", "instagramUrl", "tiktokUrl"])` (note: `area` removed, `areas` added).
- `areas` constraints: `request.resource.data.areas is list`, `size() >= 1 && <= 3`, and every element `in ["batam", "malang", "surabaya"]`.
- `name` (1–80), `tags` (1–8), `createdByUid == request.auth.uid` on create / immutable on update, URL length rules: unchanged.
- `read` (login-required) and `delete` (any logged-in user): unchanged.

### 8.6 Seed and migration

- `lib/foods/data/foods.json`: all 17 rows change `"area": "surabaya"` → `"areas": ["surabaya"]`.
- `scripts/seed-foods.ts`: `SeedRow` gains `areas: string[]`; validates each entry against the enum (1–3 entries); writes `areas` instead of `area`.
- New one-shot `scripts/migrate-food-areas.ts` (emulator-aware, same Admin init pattern as `seed-foods.ts`):
  1. Read all `food_places` docs.
  2. Doc with only `area` (string, valid enum) → `update({ areas: [area] })` then remove `area`.
  3. Doc with both `area` and valid `areas` → keep `areas`, remove `area`.
  4. Doc already `areas`-only → skip.
  5. Anything else (missing both, invalid values) → log `docId` + shape, write nothing.
  6. Print `migrated / skipped / needs-attention` counts; exit non-zero if `needs-attention > 0`.
- Release order (locked): enable Firestore backup/PITR → run backfill against prod → verify counts (§10.8) → deploy the code change. Never deploy the strict reader before the backfill.

## 9. UX specification

- **Placement:** same `/foods` surface, no new route. Filter dropdown unchanged (single-select). Card grid and `Page` / `Sections` / `Container` geometry unchanged.
- **Form container:** the existing `FoodFormDialog` (`Dialog` primitive) — the area `Select` block is swapped for the checkbox `fieldset`; no new dialog or dependency.
- **Copy:** inline English beside consuming components; no string catalog, no `t()` runtime. Checkbox legend: `Areas`. Error: `Select at least 1 area`.
- **A11y:** checkbox group uses `fieldset` + `legend`; each box has an associated label; `aria-invalid` + `role="alert"` on the group error mirror the existing fields; count line and shuffle `aria-live="polite"` regions preserved.
- **Layout:** badges use the existing `flex flex-wrap gap-2.5` row and `gap-2.5` scale only; single-area cards are pixel-identical to today.

## 10. Edge cases (acceptance-relevant)

1. Zero areas submitted → blocked with `Select at least 1 area`; nothing written.
2. All-unchecked on edit → blocked; stored `areas` untouched.
3. Duplicate area selections / mixed casing (`Batam`, `batam `) → normalized to one canonical entry, no error.
4. Unknown area string (hand-crafted write bypassing UI) → client validation blocks; Rules reject; `toFoodPlace` drops it on read if it ever lands.
5. `areas` with > 3 entries (hand-crafted) → rejected by zod + Rules.
6. Filter on an area no place has → empty state, same as today.
7. Edit while filtered out (place loses the filtered area) → allowed; row leaves the filtered view, count updates, no phantom row.
8. Backfill misses a doc (logged under `needs-attention`) → strict reader filters it out; the pre/post count check (§12.4) catches the shrinkage before deploy.
9. Shuffle result edited to drop an area → panel badges update with the row, announced via the existing `aria-live` region.

## 11. Acceptance checklist

- [ ] Add place with 2 areas → card shows 2 area badges; reload keeps both; shuffle panel shows both.
- [ ] Edit areas (add one, remove one) → badges update; removing all is blocked inline.
- [ ] Filter `surabaya` shows a place with `areas: ["batam", "surabaya"]`; filter `malang` hides it.
- [ ] Single-area place renders exactly like today (one badge, no layout shift).
- [ ] Duplicate name in any casing blocked on create and edit (except self) — unchanged global rule.
- [ ] Empty name / zero tags / non-`https` links still blocked with existing messages — no regression.
- [ ] Rules reject: `areas: []`, `areas: ["jakarta"]`, `areas` with 4 entries, doc containing legacy `area` field.
- [ ] Post-backfill: zero docs contain `area`; every doc contains non-empty `areas`; Firestore console count equals pre-backfill count.
- [ ] `grep` for singular area usage (`\.area\b`, `"area"`, `normalizeFoodArea`, `formatArea(` singular) returns zero hits in `lib/` + `components/` + `scripts/` outside the migration log narrative.
- [ ] No regression: search, tag OR-filter, shuffle-from-filtered, reset, empty state, `aria-live` regions, social icons.
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm build` green; no domain types leaking into `components/ui/`.

## 12. Build sketch (for the implementation session, not this one)

- `lib/foods/types.ts` — `area: string` → `areas: string[]` (alphabetized per repo style: `areas` first).
- `lib/foods/index.ts` — pure changes only: remove `normalizeFoodArea`, add `normalizeFoodAreas`; `FoodInput` / `FoodInputErrors` / zod schema switch to `areas`; `filterFoods` OR-match; `deriveAreaCatalog` via `flatMap`. No browser APIs.
- `lib/firebase/client.ts` — `toFoodPlace` requires `areas`; `createPlace` / `updatePlace` write normalized `areas`, drop `area`.
- `lib/firebase/server.ts` — same `toFoodPlace` change (mirrors client).
- `firestore.rules` — `hasOnly` list + `areas` size/membership checks on create and update.
- `components/foods/food-form-client.tsx` — checkbox `fieldset` + `areas` state + inline error; `handleSubmit` sends `areas`.
- `components/foods/foods-catalog-client.tsx` — badge-per-area in cards + shuffle panel; filter logic otherwise untouched.
- `lib/foods/data/foods.json` — 17 rows to `areas: ["surabaya"]`.
- `scripts/seed-foods.ts` — validate + write `areas`.
- `scripts/migrate-food-areas.ts` — new one-shot backfill (§8.6); delete after convergence or keep as archive with a one-line tombstone comment.
- `package.json` — script entry for the migration (e.g. `seed:migrate-areas`), following the existing seed script convention.

## 13. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Strict reader deployed before backfill → unmigrated rows vanish from the catalog | Locked release order (§8.6): backfill → verify counts → deploy. |
| Backfill writes while a user edits → edit overwrites `areas` with stale singular `area` | Freeze writes during the backfill window (minutes, 2-user app) or re-run the script once after; second run is idempotent (already-`areas` docs skip). |
| `createPlace`/`updatePlace` drop `areas` (field-by-field construction, same trap as the social-links spec §13) | Explicit checklist item + acceptance test (§10.1, §11); single normalize helper is the only producer. |
| Checkbox group crowds the dialog on mobile | Three compact boxes in the existing `grid gap-5` form; no new dependency; geometry check in a real browser. |
| Future 4th city reopens multi-select-filter question | Out of scope; data shape already supports it (array), only the filter UI would change. |

## 14. Step → verification (implementation session)

1. Types + pure normalize/validate/filter/catalog + unit checks over zero/one/multi/dup-case/unknown-area cases → helper tests pass.
2. Rules in emulator → 4 reject cases: empty `areas`, unknown area, 4 entries, legacy `area` field present.
3. Backfill dry-run on emulator (seeded with legacy docs) → `migrated / skipped / needs-attention` counts correct; rerun is a no-op.
4. Form + card/shuffle wiring → full §11 checklist end-to-end on `/foods` in a real browser, including reload persistence and 2-browser realtime (< 2 s).
5. `pnpm lint` + `pnpm typecheck` + `pnpm build` → green before close.
