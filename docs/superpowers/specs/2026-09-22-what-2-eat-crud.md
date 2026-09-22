# What-2-Eat — Food Place CRUD (PRD)

- Date: 2026-09-22
- Status: draft, pending Farrel's review
- Session scope: PRD only. No implementation.
- Language: English (per request).
- Supplements: `2026-09-22-what-2-eat-design.md` (v1 catalog spec, Indonesian). That doc deferred CRUD UI; this doc specifies it.

## 1. Goal

Any visitor can Create, Update, and Delete food places — each with a **name**, **tags**, and **area** — directly from the `/foods` surface, with changes persisting per-browser via localStorage. Existing v1 behavior (search + tag/area filter, result count, shuffle-from-filtered, reset, empty state) must keep working unchanged in semantics.

Success criteria:

- A visitor adds a place (name + ≥1 tag + area) and it survives reload on the same browser, appears in the list, filters, derived catalogs, and the shuffle pool.
- A visitor edits and deletes places with immediate, consistent UI updates (list, count, catalogs, shuffle panel).
- Invalid input (empty name/area, zero tags, duplicate name) is blocked with a clear inline message.
- Corrupt or unavailable localStorage never crashes the page; the seed catalog remains usable.
- `pnpm lint`, `pnpm format --check`, and `pnpm typecheck` pass.

## 2. Non-goals

- No shared or cross-device persistence (no database, no API, no sync).
- No login, roles, ownership, or audit trail.
- No separate tag-catalog or area-catalog management screens (no master-data CRUD).
- No import/export, no URL-synced filters, no detail pages, no photos/prices/ratings/Maps links.
- No changes to Shopify/cart/Eve remnants, no i18n/Markets work.

## 3. Locked decisions (from review session)

| Decision | Choice | Why |
|---|---|---|
| Storage | localStorage first | Zero backend, fastest iteration; accepted trade-off is per-device persistence. |
| Access | Public, no login | Acceptable because damage is confined to the visitor's own browser. Must be revisited the moment storage moves server-side. |
| Scope | Single `FoodPlace` entity (tags/area are fields on the place form) | No separate masters; tags/areas stay free-form fields with the filter catalog *derived* from the merged dataset, as today. |

## 4. Current-state facts (verified in tree)

- Entity: `FoodPlace { id: string; name: string; tags: string[]; area: string }` (`lib/foods/types.ts`).
- Source: static `lib/foods/data/foods.json` — 17 seed rows, all `area: "surabaya"` (`lib/foods/server.ts`).
- Pure logic in `lib/foods/index.ts`: `filterFoods` (tag OR, name contains case-insensitive, area case-insensitive), `deriveTagCatalog`, `deriveAreaCatalog`, `pickRandomFood`, `normalizeSearch`, `EMPTY_FOOD_FILTERS`.
- UI: `app/foods/page.tsx` (Server Component, passes seed `foods`/`tags`/`areas`) → `FoodsCatalog` → `FoodsCatalogClient` (`"use client"`, `useState`/`useMemo` for search, tags, area, shuffle, reset).
- Available primitives: `zod@4.6.5`, `components/ui` (`Button`, `Badge`, `Input`, `Select`), `sonner` toasts. No DB, no auth, no foods Server Action.
- Repo rules that constrain the build: `lib/<domain>/` file roles (`index.ts` universal pure, `server.ts` server-only, `client.ts` client boundary, `action.ts` server actions, `types.ts` contracts); `components/ui/` takes primitive props only; copy inline and server-first (no `t()` runtime); `Page` + `Sections` + `Container` spacing contract; Server Components by default with `"use client"` pushed to leaves.

## 5. Critique — why this shape, and what it costs

1. **localStorage means "my list", not "the list".** Two browsers (or phone vs. laptop) diverge immediately. The spec therefore frames CRUD as *personal overrides layered on seed data*, never as edits to shared truth. UI copy must say so honestly ("saved on this device"), or "my place disappeared" reports are guaranteed on device switches, cleared site data, and redeploys.
2. **Public + no-auth is safe only because storage is local.** There is no vandalism vector beyond the vandal's own browser. This decision expires the day a server store is introduced — the DB migration must add an access model at the same time, not later.
3. **No master-data CRUD is the right call at this scale.** With 17 rows and one area, tag/area masters would add rename-propagation and orphan-cleanup burden for no payoff. Free-form fields + derived catalogs cover "new tag" and "new area" with zero extra screens.
4. **Normalization debt already exists and CRUD multiplies it.** Seed tags are Title Case (`"Japanese"`, `"Fast Food"`), areas are lowercase (`"surabaya"`); `filterFoods` compares tags case-sensitively but areas case-insensitively. Without enforced rules the form will fork `Soto` / `soto` / `SOTO` into three filter identities. Section 7 makes the rules load-bearing.
5. **Server renders seed-only; user rows exist only in the browser.** Every hydration, count-line, and tombstone decision in this PRD follows from that split. There is no way to SSR user rows without a server store — so the spec designs around a post-mount merge instead of fighting it.

## 6. Data model

`FoodPlace` is unchanged. Two additions, both owned by `lib/foods/types.ts`:

```ts
type FoodOverridesV1 = {
  version: 1;
  upserts: Record<string, FoodPlace>; // user-created + user-edited rows, keyed by id
  deletedSeedIds: string[];           // tombstones hiding seed rows
};
```

- Storage key: `what2eat.foods.v1` (versioned; a version bump is the migration point).
- `id`: stable, URL-safe, generated client-side at create — `slug(name) + "-" + shortRandom` (e.g. `soto-cak-har-7f3a`). Never user-editable, never reused after delete.
- Effective dataset = `merge(seedFoods, overrides)`: seed rows minus tombstones, with `upserts` overlaid by id, plus purely user-created rows. Seed JSON is never mutated at runtime.
- Deleting a seed row records a tombstone; deleting a user row removes its upsert. Re-adding the same name after delete issues a fresh id (no resurrection).

## 7. Normalization rules (load-bearing)

Enforced in one pure helper (`lib/foods/index.ts`) so UI and any future server path share them:

| Field | Rule |
|---|---|
| `name` | `trim` + collapse `\s+` to single space. Compared case-insensitively everywhere; displayed as typed. Length 1–80 after trim. |
| `area` | Stored lowercased + trimmed (`surabaya`); displayed Title-cased via existing `formatArea`. Comparison stays lowercase (matches current `filterFoods`). Length 1–40 after trim. |
| `tags` | Each trimmed, empties dropped, deduped case-insensitively, cap 8 per place, first-seen casing preserved for display. Each 1–24 chars. At least 1 required. |

## 8. Functional requirements

### 8.1 Create

- Entry: `Tambah tempat` button in the catalog toolbar zone (next to shuffle/reset, not hidden behind filters).
- Fields: **Name** (required), **Area** (required, free text with `datalist` suggestions from the derived area catalog), **Tags** (chip input — `Enter`/`,` commits, `Backspace` on empty input removes last chip, × removes; `n/8` counter).
- Validation (zod, shared helper):
  - Reject empty/whitespace-only; collapse internal multi-space.
  - Duplicate-name guard: case-insensitive match against the merged dataset blocks with `"Sudah ada tempat dengan nama ini"` and points at the existing row.
- Success: `sonner` toast, dialog/panel closes, new card appears, derived tag/area catalogs re-derive (new values show up immediately), focus returns to the trigger.

### 8.2 Read (no semantic change)

List, search, tag multi-select (OR), area select, count line (`X dari Y tempat`, where `Y` is now merged length), empty state, shuffle-from-filtered, reset — all keep v1 semantics.

### 8.3 Update

- Per-card `Edit` affordance (small icon button to keep cards scannable).
- Same form as Create, prefilled. Same validation except the row being edited is excluded from the duplicate-name check.
- Renaming that introduces a new tag/area updates derived catalogs; removing the last usage of a tag/area drops it from chips/select (derived, never stored).
- If the edited row is the active shuffle result, the result panel updates or clears with an `aria-live` announcement.

### 8.4 Delete

- Per-card `Hapus` with two-step confirm (inline confirm, or `AlertDialog` only if that primitive already exists in `components/ui` — verify before use, do not invent one).
- Seed rows → tombstone; user rows → upsert removed. Filtered view, count, catalogs, and shuffle panel update immediately.
- No undo in v1 (explicitly out of scope). UI copy must not promise one.

### 8.5 Persistence behavior

- All `localStorage` access lives behind a client-only store (`lib/foods/client.ts`, `"use client"`). Server Components never touch it.
- Corrupt/unparseable value → discard to the empty `v1` shape, one-line warning toast, continue with seed data. Never crash.
- Quota/private-mode write failure → error toast, keep in-memory state for the session, do not claim persistence.
- First run with an older/unversioned key (if any prototype wrote one) → ignore or migrate to `v1`, never crash.

## 9. UX specification

- **Placement:** CRUD stays on `/foods` — no new route. `Tambah tempat` beside shuffle/reset; `Edit`/`Hapus` as small icon buttons per card. Rationale: single-surface app, one entity, no admin role to justify `/foods/manage`. A separate route is the fallback only if card chrome gets cluttered on mobile.
- **Form container:** modal dialog on desktop / bottom sheet on mobile — but only if those primitives already exist in `components/ui`. Otherwise an anchored inline expanding panel above the grid. No new dialog dependency for this iteration.
- **Copy:** inline Indonesian beside consuming components (repo rule); no string catalog, no `t()` runtime. Must include one honest persistence line ("Tersimpan di perangkat ini") near the add button or empty state.
- **A11y:** dialog traps focus and returns it on close; destructive buttons use `aria-label="Hapus {name}"`; count line and shuffle result keep `aria-live="polite"` (already present — preserve).
- **Layout:** `Page` + `Sections` + `Container` contract unchanged; card-grid geometry unchanged; the form is the only new visual block. `components/ui/` boundary keeps primitive props only.

## 10. Edge cases (acceptance-relevant)

1. Duplicate name in any casing/whitespace variant → blocked on create; blocked on edit except self.
2. Zero tags → blocked (`minimal 1 tag`).
3. All-whitespace name/area/tag → treated as empty → blocked.
4. New area typed → appears in Area select at once; deleting its last place removes it.
5. Delete-then-re-add same name → allowed with a fresh id.
6. Edit while the row is filtered out → allowed; count updates; no phantom row.
7. Shuffle result deleted/edited → panel updates or clears, announced via `aria-live`.
8. Corrupt storage value → seed-only fallback + warning, page usable.
9. Hydration: server render is seed-only; user rows merge post-mount behind a mounted flag. Reserve the count row's height so `17` → `23` is not a layout shift; render user-dependent chrome only post-mount.
10. Storage write fails (quota/private mode) → session-only state + error toast, no false persistence claim.

## 11. Acceptance checklist

- [ ] Add place → survives reload (same browser); visible in list, filters, shuffle pool, derived catalogs.
- [ ] Edit place → same validation as create (minus self in dup-check); catalogs + shuffle panel consistent.
- [ ] Delete seed place → stays hidden across reload (tombstone); delete user place → gone across reload.
- [ ] Duplicate name (any casing) blocked on create and edit (except self).
- [ ] Empty name / empty area / zero tags blocked with inline messages.
- [ ] Corrupt `what2eat.foods.v1` → seed data renders + warning toast, no crash.
- [ ] No regression: search, tag OR-filter, area filter, shuffle-from-filtered, reset, empty state, `aria-live` regions.
- [ ] `pnpm lint`, `pnpm format --check`, `pnpm typecheck` green; no Server-Component `localStorage` access; no domain types leaking into `components/ui/`.

## 12. Build sketch (for the implementation session, not this one)

- `lib/foods/types.ts` — add `FoodOverridesV1` + storage-key constant (types only).
- `lib/foods/index.ts` — pure additions only: `normalizeFoodInput`, `validateFoodInput` (zod), `mergeFoods(seed, overrides)`, `slugId`. No browser APIs.
- `lib/foods/client.ts` — new `"use client"` store: load/save overrides + `useFoods(seed)` hook (merged list + create/update/remove). The only file touching `localStorage`.
- `components/foods/food-form-client.tsx` — new client leaf (name/area/tags inputs + inline errors).
- `components/foods/foods-catalog-client.tsx` — toolbar button + per-card Edit/Delete wiring; filter/shuffle logic otherwise untouched.
- `app/foods/page.tsx` — unchanged (still passes seed data; merge happens client-side).
- DB migration path (not built now): `client.ts` gets replaced by Server Actions (`action.ts`) reusing the same zod schema; `index.ts` helpers survive untouched. Note once, tersely, in code.

## 13. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Users expect shared truth ("I added it, my friend can't see it") | Honest device-local copy in the UI; DB migration is the documented next step. |
| Hydration flash on count/grid | Post-mount merge + reserved geometry; user rows never server-rendered. |
| Tag/area explosion via typos | Datalist suggestions + dup-guard + 8-tag cap; masters deferred deliberately. |
| Missing dialog/sheet primitive | Inline panel fallback; no new dependency in v1. |
| Public CRUD abuse | Harmless by construction (local-only damage); access model arrives with any server store. |

## 14. Step → verification (implementation session)

1. Pure helpers (`normalize` / `validate` / `merge`) + unit checks over dup/case/whitespace cases → helper tests pass.
2. `client.ts` store (merge, tombstones, corrupt-input fallback) → reload-persistence check in a real browser.
3. Form leaf + catalog wiring → full §11 checklist end-to-end on `/foods`.
4. `pnpm lint` + `pnpm format --check` + `pnpm typecheck` → green before close.
