# What-2-Eat — Instagram & TikTok Links per Place (PRD)

- Date: 2026-09-22
- Status: draft, pending Farrel's review
- Session scope: PRD only. No implementation.
- Language: English (matches sibling specs).
- Supplements: `2026-09-22-what-2-eat-design.md` (v1 catalog) and `2026-09-22-what-2-eat-crud.md` (device-local CRUD). This doc adds optional social links on top of both; it changes no catalog or CRUD semantics.

## 1. Goal

Each food place can carry an optional Instagram link and/or TikTok link. Cards show icon-only links (no text labels); a place with no links shows no icons and no empty reserved space. Both links are editable through the existing CRUD form.

Success criteria:

- A visitor opens a place's links (Instagram and/or TikTok) in a new tab by clicking the icon on its card.
- Places without links render exactly like v1 cards — no icons, no gap, no layout shift versus linked cards beyond the icon row itself.
- A visitor adds, edits, and clears both links via the CRUD form with the same validation and persistence behavior as the other fields.
- `pnpm lint`, `pnpm format --check`, and `pnpm typecheck` pass.

## 2. Non-goals

- No additional platforms (no X, YouTube, WhatsApp, Maps links). Exactly Instagram + TikTok.
- No handle-to-URL resolution, no embeds, no follower counts, no link previews.
- No per-platform analytics or click tracking.
- No changes to filtering, shuffle selection, tag/area catalogs, or storage mechanics beyond carrying two extra optional fields.

## 3. Locked decisions (from review session)

| Decision | Choice | Why |
|---|---|---|
| Validation strictness | Loose: any valid `https://` URL | Fastest iteration; avoids maintaining a domain allowlist. A mistyped domain still opens in a new tab where the failure is obvious. Can tighten to `instagram.com` / `tiktok.com` later without a data migration. |
| Shuffle panel | Same icons as cards | The shuffle result is a second presentation of the same place; hiding its links there would be inconsistent. |
| Seed backfill | 1–2 seeds carry real example URLs | Proves the render path on first load without depending on the visitor having created rows. Farrel supplies the real URLs at implementation time; no fabricated URLs are committed. |

## 4. Current-state facts (verified in tree)

- Entity: `FoodPlace { id: string; name: string; tags: string[]; area: string }` (`lib/foods/types.ts`). Overrides shape `FoodOverridesV1` with `FOOD_OVERRIDES_STORAGE_KEY = "what2eat.foods.v1"` lives in the same file.
- CRUD is implemented and committed on top of the CRUD PRD: `lib/foods/client.ts` (`useFoods` hook — the only `localStorage` touchpoint), `components/foods/food-form-client.tsx` (`FoodFormDialog` using the existing `Dialog` primitive), wired through `components/foods/foods-catalog-client.tsx`.
- Pure logic in `lib/foods/index.ts`: `FoodInput` / `FoodInputErrors`, `normalizeFoodName` / `normalizeFoodArea` / `normalizeFoodTags`, `validateFoodInput` (zod), `mergeFoods`, `slugFoodId`. Area is a fixed enum `FOOD_AREAS = ["batam", "malang", "surabaya"]` rendered as a `Select` (implementation diverged from the CRUD PRD's free-text datalist — this PRD follows the implementation).
- `client.ts` constructs places field-by-field in `createPlace` / `updatePlace`, and `isFoodPlace` accepts any object with the four required fields (extra fields pass through; missing-link rows stay valid).
- `components/footer/social-links.tsx` already ships inline Instagram and TikTok SVG paths (Simple Icons style, `fill="currentColor"`, `size-5`). `lucide-react` has no TikTok brand icon, so these SVGs are the correct icon source — reuse them, do not add a dependency.
- Repo rules that constrain the build: `lib/<domain>/` file roles (`index.ts` universal pure, `server.ts` server-only, `client.ts` client boundary, `types.ts` contracts); `components/ui/` takes primitive props only; copy inline and server-first; `Page` + `Sections` + `Container` spacing contract.

## 5. Critique — why this shape, and what it costs

1. **Two explicit optional fields beat a generic `links[]` array.** There are exactly two platforms and no plan for more. Two fields keep the form (two inputs), validation (one rule each), and rendering (two conditional icons) trivial. A generic array would add platform discriminators, ordering, and per-item validation for zero payoff at this scale.
2. **Loose validation is a deliberate, reversible trade.** Domain-locking catches paste errors early but needs an allowlist and its own error copy; loose `https` validation ships the feature with one shared rule. The cost (a wrong-domain link opens a wrong page) is visible and self-correcting by the place owner. Tightening later touches only `validateFoodInput` + `normalize`, never stored data.
3. **No storage version bump.** `FoodOverridesV1` stores whole `FoodPlace` rows; optional fields absent from old rows simply read as `undefined`. `isFoodPlace` already tolerates both shapes, so pre-feature localStorage keeps working untouched.
4. **Icon-only display makes `aria-label` load-bearing.** With no visible text, the accessible name is the only signal for screen readers — it must include the place name (`Instagram {name}`), not just the platform.

## 6. Data model

`FoodPlace` gains two optional fields, owned by `lib/foods/types.ts`:

```ts
export interface FoodPlace {
  area: string;
  id: string;
  instagramUrl?: string;
  name: string;
  tags: string[];
  tiktokUrl?: string;
}
```

- Absent or empty-after-trim means "no link" — there is no separate boolean.
- Effective dataset, tombstones, upsert overlay, and seed-immutability are unchanged from the CRUD spec; link fields ride along inside the existing row objects.
- Storage key stays `what2eat.foods.v1` (no migration; see §5.3).

## 7. Normalization and validation rules (load-bearing)

Enforced in the existing pure helpers (`lib/foods/index.ts`) so any future server path shares them:

| Field | Rule |
|---|---|
| Both URLs | `trim`. Empty after trim → `undefined` (valid, means "no link"). |
| Both URLs | If non-empty, must parse as an `https://` URL (zod `.url()`-style check plus protocol check). Max ~300 chars to bound storage. No domain restriction (locked decision). |
| Both URLs | Displayed as typed (no canonicalization beyond trim); opened verbatim in a new tab. |

`FoodInput` / `FoodInputErrors` each gain `instagramUrl?` / `tiktokUrl?`. `validateFoodInput` applies the same rule to both fields with inline Indonesian messages (e.g. `"Tautan harus diawali https://"`).

## 8. Functional requirements

### 8.1 Display (cards + shuffle panel)

- New client leaf, e.g. `components/foods/food-social-links.tsx`, receiving primitive props only (`instagramUrl?`, `tiktokUrl?`, `placeName`) to respect the `components/ui/` boundary (it is a foods-domain leaf, not a `ui` primitive).
- Renders Instagram/TikTok icons by reusing the SVG paths from `components/footer/social-links.tsx` (extract to one shared spot so the paths exist exactly once).
- Each icon renders only if its URL is present; if both are absent the component returns `null` — no wrapper, no reserved space.
- Each link: icon-only (`size-4` or `size-5` to match footer density), `target="_blank" rel="noopener noreferrer"`, `aria-label="Instagram {name}"` / `"TikTok {name}"`, `text-muted-foreground hover:text-foreground` to match existing card chrome.
- Used in both places in `foods-catalog-client.tsx`: each grid card (small row under the area line) and the shuffle-result panel (same component, same rules).

### 8.2 CRUD form (`FoodFormDialog`)

- Two optional `Input` fields with `Label`: `Instagram (opsional)` and `TikTok (opsional)`, placeholder `https://…`.
- Prefilled on edit from the stored values; clearing a field removes the link (`undefined` after normalize).
- Submitted through the same `FoodInput` → `validateFoodInput(input, existing, place?.id)` path; per-field inline errors under each input (`role="alert"`), following the existing name/area/tags pattern.
- Create and edit share the rule; duplicate-name and tag/area behavior unchanged.
- Copy stays inline Indonesian; the existing `"Tersimpan di perangkat ini."` line remains the only persistence claim.

### 8.3 Persistence behavior

- No new storage code path: links persist as part of the upserted `FoodPlace` rows through the existing `useFoods` commit flow (in-memory + `localStorage`, corrupt → seed fallback, quota failure → session-only toast).
- `createPlace` / `updatePlace` in `client.ts` must carry the normalized link fields onto the constructed row (they currently build the object field-by-field, so this is an explicit two-line addition per function — easy to miss).
- Old stored rows (no link fields) and old seed rows merge unchanged.

### 8.4 Seed

- 1–2 rows in `lib/foods/data/foods.json` gain real `instagramUrl` / `tiktokUrl` values supplied by Farrel at implementation time. No placeholder or guessed URLs.

## 9. UX specification

- **Placement:** same `/foods` surface, no new route. Icon row lives inside the existing card geometry (under the area line); no card-grid or `Page`/`Sections`/`Container` changes.
- **Form container:** the existing `FoodFormDialog` (`Dialog` primitive) — two extra rows in the current `grid gap-5` form, no new dialog or dependency.
- **Copy:** inline Indonesian beside consuming components; no string catalog, no `t()` runtime.
- **A11y:** icon links carry `aria-label` with the place name; count line and shuffle `aria-live="polite"` regions preserved; dialog focus behavior unchanged.
- **Layout:** card-grid geometry unchanged; a linkless card is pixel-identical to v1.

## 10. Edge cases (acceptance-relevant)

1. Both links empty → no icons, no wrapper element, card identical to v1.
2. Only one link → exactly one icon.
3. Whitespace-only input → treated as empty → valid, link removed.
4. `http://` or non-URL text → blocked with inline message; valid `https://` non-IG/TikTok domain → allowed (locked loose decision).
5. Clearing a link on edit removes the icon immediately and persists the removal across reload.
6. Old `localStorage` rows without link fields → render without icons, editable, no crash.
7. Edited row is the active shuffle result → panel icons update with the row, announced via the existing `aria-live` region.
8. Overlong URL (> ~300 chars) → blocked with inline message.

## 11. Acceptance checklist

- [ ] Card with 0 / 1 / 2 links renders 0 / 1 / 2 icons; each icon opens the exact stored URL in a new tab (`noopener`).
- [ ] Linkless cards are visually identical to v1 (no gap or placeholder).
- [ ] Shuffle-result panel shows the same icons as the place's card.
- [ ] Add place with links → icons appear, survive reload (same browser).
- [ ] Edit links → icons update; clear field → icon disappears and stays gone after reload.
- [ ] Non-`https` input blocked with an inline message; empty fields always valid.
- [ ] Pre-feature stored rows (no link fields) load, render, and edit without errors.
- [ ] Screen reader announces `"Instagram {name}"` / `"TikTok {name}"` for each icon link.
- [ ] No regression: search, tag OR-filter, area select, shuffle-from-filtered, reset, empty state, device-local persistence toasts.
- [ ] `pnpm lint`, `pnpm format --check`, `pnpm typecheck` green; no domain types leaking into `components/ui/`; no SVG path duplicated between footer and foods leaf.

## 12. Build sketch (for the implementation session, not this one)

- `lib/foods/types.ts` — add `instagramUrl?` + `tiktokUrl?` to `FoodPlace` (alphabetized per repo style: `area`, `id`, `instagramUrl`, `name`, `tags`, `tiktokUrl`).
- `lib/foods/index.ts` — pure additions only: `normalizeFoodUrl`, extend `FoodInput` / `FoodInputErrors` / zod schema / `validateFoodInput`. No browser APIs.
- `lib/foods/client.ts` — carry both fields in `createPlace` / `updatePlace`. No storage-shape change.
- `components/foods/food-social-links.tsx` — new client leaf; single home for the reused Instagram/TikTok SVGs shared with the footer.
- `components/foods/foods-catalog-client.tsx` — render the leaf in cards + shuffle panel; form wiring otherwise untouched.
- `components/foods/food-form-client.tsx` — two optional inputs + inline errors.
- `lib/foods/data/foods.json` — 1–2 real URLs from Farrel.
- Tightening path (not built now): domain-lock in `normalizeFoodUrl`/`validateFoodInput` only; no migration needed. Note once, tersely, in code.

## 13. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Wrong-domain links (loose validation) | Failure is visible on click and self-correctable by the owner; domain-lock is a one-function tightening later. |
| `createPlace`/`updatePlace` drop the fields (field-by-field construction) | Explicit checklist item + acceptance test (§10.5, §11); consider deriving the row from a single normalize helper. |
| SVG drift between footer and foods leaf | Single source for both path definitions; acceptance item forbids duplication. |
| Icon row shifts card rhythm | No wrapper when linkless; icon row uses existing gap scale (`gap-2.5`) only when present. |

## 14. Step → verification (implementation session)

1. Types + pure normalize/validate + unit checks over empty/whitespace/`http`/https/overlong cases → helper tests pass.
2. Icon leaf + card/shuffle wiring (seed examples from Farrel) → 0/1/2-link visual check in a real browser, new-tab + `aria-label` check.
3. Form fields + `client.ts` carry-through → full §11 checklist end-to-end on `/foods`, including reload persistence and pre-feature storage compatibility.
4. `pnpm lint` + `pnpm format --check` + `pnpm typecheck` → green before close.
