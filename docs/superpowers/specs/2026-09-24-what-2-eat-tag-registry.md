# What-2-Eat — Tag Registry + `/foods/tags` (PRD)

- Date: 2026-09-24
- Status: implemented, UNVERIFIED. Unit probes (43), seed validation + catalog/registry agreement, typecheck, lint, format, and client-side rule probes pass. Pending: emulator restart (loads new `tags` rules) + interactive browser smoke per §9.
- Language: English.
- Supplements: `2026-09-24-what-2-eat-nested-tags.md` (v2 nested `tags` map, implemented) and `2026-09-23-what-2-eat-tag-facets.md` (v1 flat facets, implemented). This doc does not change the `FoodPlace.tags` shape from v2; it adds a `tags` registry collection beside it.
- Locked decisions (from planning session 2026-09-24): hybrid registry (denormalized strings stay in `food_places`, `tags` collection holds vocab + metadata + synonyms, never a strict FK) / tag management open to all logged-in users (no admin allowlist) / no production data, so backfill tooling is local/emulator-only for testing / facet is an open enum so new facets (taste, venue, …) can arrive without a schema change.
- Session scope: PRD only. No implementation.

## 1. Goal

Let vocab evolve from the UI without a code + rules redeploy, while keeping the current read path (one `food_places` read, in-memory filter, zero joins) untouched.

Success criteria:

- An admin adds `menus:brunch` from `/foods/tags` and a contributor can use it in the add-place form with no redeploy.
- Promoting `pending:spicy` to a new facet stores `taste:spicy` in the registry (open enum, not a silent drop, not a rejection).
- Renaming a tag with `usageCount > 0` shows an impact preview and refuses to apply without confirmation.
- Registry empty or unreachable: the form falls back to the built-in vocabs and the catalog works exactly as today.
- `pnpm lint`, `pnpm format --check`, and `tsc --noEmit` pass.

## 2. Non-goals

- No strict foreign keys: `food_places.tags` keeps plain strings; the registry never gates reads and never replaces `firestore.rules` hardcodes.
- No new built-in facets: only the open-enum capability plus one promoted example (`taste:spicy`). `taste`/`venue`/halal-veg taxonomies remain backlog.
- No granular admin roles, no version history, no forced delete of in-use values (deprecate instead), no revert UI.
- No production migration or dual-write: no production data exists. Backfill is an emulator-only test aid.
- No URL-synced filters, no detail pages, no `t()` runtime or next-intl; copy stays inline and server-first per repo rules.

## 3. Current-state facts (verified in tree)

- Entity: `FoodPlace { areas, id, name, tags: FoodTags, ...social }` (`lib/foods/types.ts:65-82`); `FoodTags` is an embedded map (menus, servings, ingredients, origins, priceTier?, healthStyle?, pending).
- Vocab is hardcoded in 4 places: `lib/foods/types.ts:1-63` (source), `firestore.rules:30-35` (literal duplicate), Zod in `lib/foods/index.ts:64-72` (imports from types), `scripts/seed-foods.ts:45-73` (validation).
- Synonyms live in `DISH_TO_MENU` (`lib/foods/index.ts:167-171`): `soto/bakso/rawon → soup`. Collision rule: bare `porridge → menus`, bare `mixed → ingredients`, `facet:value` prefix overrides (`lib/foods/index.ts:259-266`).
- Filter is client-side in-memory AND-across / OR-within (`filterFoods`, `lib/foods/index.ts:413-443`); catalog derived per facet (`deriveFacetCatalog`, `lib/foods/index.ts:460-469`).
- Transport: `toFoodPlace` + `fetchFoodPlacesInitial` in `lib/firebase/server.ts:71-140`, `toFoodPlace` + `subscribeFoodPlaces` + `createPlace` + `updatePlace` in `lib/firebase/client.ts:188-296`.
- Routes: single `/foods` page with a login gate (`app/foods/page.tsx:45-50`); shell/client split in `components/foods/foods-catalog.tsx` + `foods-catalog-client.tsx`; form in `components/foods/food-form-client.tsx`.
- Rules: any logged-in user may create/update any `food_places` doc (`firestore.rules:60-73`); tag management inherits this posture per the locked decision.

## 4. Critique — why a registry, why hybrid, and what full normalization would cost

1. **The real bottleneck is vocab evolution, not document size.** 46 values across 6 facets fit comfortably in embedded strings. The pain is that every new value edits `types.ts` + `firestore.rules` + redeploy. A registry fixes exactly that and nothing more.
2. **Firestore has no JOIN, so full normalization taxes every read.** Storing refs-only would add a second read + client join to the catalog, a second loading state, and N+1 `get()` pressure in rules (capped at ~10 per request). The current one-read + in-memory filter is the correct pattern for this scale; the registry must not break it.
3. **Rules cannot enforce dynamic vocab.** Cross-collection `get()` per facet is costly and fragile, so `firestore.rules` keeps hardcoded vocabs as the strong validator while the registry serves UI convenience + synonyms. Registry outage must degrade to built-in vocabs, never to a broken catalog.
4. **Rename/delete without backfill creates drift.** A registry-only rename leaves old `food_places` showing stale IDs. Since all users can manage tags, rename/merge must carry an impact preview and an explicit local apply (batch update of affected docs), with deprecate-as-delete so old docs keep parsing.
5. **`usageCount` must be derived, not stored.** Live-computing from `food_places` (via `deriveFacetCatalog` + a `pending` scan) avoids writer fanout on every place write and stays exact at this scale.

## 5. Data model

New collection `tags`, doc id `<facet>:<value>` (e.g. `menus:soup`):

```ts
interface TagDoc {
  facet: string; // open enum: "menus" | "taste" | ... (lowercase, 1-24 chars)
  value: string; // lowercase id, 1-24 chars
  synonyms: string[]; // e.g. ["soto", "bakso", "rawon"] on menus:soup; max 20
  deprecated: boolean; // hidden from the form, still valid in stored places
  updatedByUid: string;
  updatedAt: Timestamp;
}
```

Deliberately absent: display-label override (existing `formatFacetValue()` stays the renderer), stored `usageCount` (derived live), physical delete (use `deprecated: true`).

`KNOWN_FACETS = ["menus", "servings", "ingredients", "origins", "priceTier", "healthStyle"]` seeds the UI groups; any other facet string found in the registry renders as its own group (alpha-sorted), which is how `taste` arrives. `FoodPlace.tags` shape is unchanged; the six v2 arrays keep their caps (3/2/5/3, resolved total ≤ 8, pending ≤ 8) regardless of facet openness.

`lib/tags/types.ts` owns `TagDoc`, `KNOWN_FACETS`, `tagDocId(facet, value)`, and `isKnownFacet`. `lib/tags/index.ts` (universal) owns `normalizeTagDoc()`, `buildRegistryMaps()` (suggestion + synonym lookup), and `previewMerge()` (affected-place computation). No barrel re-exports, per repo rules.

## 6. Filter + display semantics (unchanged, plus two additions)

- Existing v2 semantics carry over verbatim: OR-within / AND-across, inactive facet = no constraint, facet-less places match only when the facet is inactive, `pending` never filters but is name-searchable, badges keep name-only pills with facet `aria-label`s.
- New-facet values (e.g. `taste:spicy`) filter exactly like the six built-in facets once promoted: OR-within the new facet, AND-across against the rest. The catalog filter UI renders one group per facet present in the union of registry + stored data.
- `deprecated` values never appear in form suggestions or filter groups, but places storing them keep matching when no filter on that facet is active and keep their badges.

## 7. UX changes

1. **New route `/foods/tags` (`app/foods/tags/page.tsx`):** Server Component reusing the `FoodsGate` pattern (`verifySessionCookie`, redirect `/login`, parallel `fetchFoodPlacesInitial()` + `fetchTagsInitial()`, Suspense fallback "Loading tag registry…"). Client leaf `components/tags/tags-manager-client.tsx` (`"use client"`) holds all interaction: per-facet tables (known six + any open-enum facet found, alpha-sorted) plus a `pending` table with live usage counts and example places.
2. **Actions (all logged-in users):** add value to a facet (lowercase, 1–24 chars, cross-facet duplicate check to prevent new `porridge`/`mixed` collisions), add synonym, promote pending → facet (free facet choice, enabling `taste:spicy`), deprecate (never delete), rename/merge with impact preview ("3 places use X") and an explicit emulator-only "apply to places" batch. Physical delete is refused by rules.
3. **Form integration (`food-form-client.tsx`):** suggestions prefer the registry when present, fall back to `*_VOCAB` + `DISH_TO_MENU` when the registry is empty or fails. `deprecated` values are hidden from suggestions. `mapFreeTextToTags`/`foodTagsToTokens` accept optional registry synonym overrides with legacy behavior as default, so collision and specific→parent rules survive unchanged.
4. **Copy stays inline and server-first**; no `t()` runtime.

## 8. Validation, rules, seed, cutover

- **Zod/client:** registry-backed suggestions are advisory; submit-time validation still normalizes via `normalizeFoodTags` and enforces v2 caps. Unknown open-facet values roast through the same path once promoted (facet string + value checks, not a closed enum).
- **`firestore.rules` (new `match /tags/{id}`, `food_places` untouched):** `isValidTagDoc()` checks `facet`/`value` strings 1–24 chars lowercase, `synonyms` list of strings ≤ 20, `deprecated` boolean, key allowlist; read/create/update require `request.auth != null`; delete is always false. `food_places` rules keep hardcoded vocabs as the strong validator.
- **Transports:** `fetchTagsInitial()` in `lib/firebase/server.ts` (corrupt doc → skip, never null the list) and `subscribeTags()` in `lib/firebase/client.ts` (same observer pattern as `subscribeFoodPlaces`). `toFoodPlace` in both files is unchanged.
- **Seed (`scripts/seed-tags.ts`, new):** writes the 46 `*_VOCAB` values plus `menus:soup.synonyms = [soto, bakso, rawon]`; idempotent (skip existing ids); emulator/local only; `package.json` entry alongside `seed-foods`. No `food_places` backfill: shape is unchanged, so `seed-foods.ts` needs no rewrite; verification is `deriveFacetCatalog ∩ registry = 100%`.
- **Local backfill aid:** rename/merge preview reuses `previewMerge()`; the "apply" path is a local batch over affected docs only, for testing the drift fix — not a production migration job.
- **Backlog:** version history/revert, forced delete of in-use values, stored counters, admin roles, `taste`/`venue` taxonomies beyond the first promoted example.

## 9. Acceptance checklist

- [ ] Adding `menus:brunch` from `/foods/tags` surfaces it in the add-place form with no redeploy; submit saves and reads back identically.
- [ ] Promoting `pending:spicy` offers a free facet choice and stores `taste:spicy`; the catalog shows a new `taste` filter group with correct OR-within / AND-across behavior.
- [ ] Renaming a value with `usageCount > 0` shows the affected-place preview and refuses to apply without confirmation; deprecated values disappear from suggestions but old places still save and render.
- [ ] Registry empty/unreachable: the form behaves exactly as v2 (built-in vocabs + `DISH_TO_MENU`), and the catalog is unaffected.
- [ ] Rules reject empty/uppercase facet/value, over-long synonyms, unknown keys, and any delete on `tags`; `food_places` rules are byte-identical except where this doc says otherwise.
- [ ] Seed is idempotent: wipe emulator → `seed-tags` → 46 docs → `seed-foods` validates clean → catalog/registry agreement is total.
- [ ] `pnpm lint`, `pnpm format --check`, and `tsc --noEmit` pass.

## 10. Implementation order (suggested, not mandated)

1. `lib/tags/` pure domain + unit probe (synonym `soto→soup`, id stability, open-facet grouping).
2. `fetchTagsInitial` + `subscribeTags` (read-only) + corrupt-doc tolerance.
3. `firestore.rules` for `tags` + emulator restart + rule probes.
4. `scripts/seed-tags.ts` + wipe/reseed agreement check.
5. `/foods/tags` route + manager client (list, add, synonym, promote, deprecate, rename/merge preview + local apply).
6. Form registry integration with fallback + deprecated hiding.
7. Leftover grep + gates + browser smoke per §9.
