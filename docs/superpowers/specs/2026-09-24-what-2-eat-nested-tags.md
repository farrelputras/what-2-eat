# What-2-Eat — Nested Tags Map + Single Tags Input (PRD)

- Date: 2026-09-24
- Status: draft. No implementation.
- Language: English.
- Supplements: `2026-09-23-what-2-eat-tag-facets.md` (v1 flat facets, implemented). This doc proposes v2 and supersedes v1 §6 (data model) and §8.2 (form) if accepted; taxonomy, vocabs, caps, and filter semantics from v1 carry over unless stated here.
- Locked decisions (from planning session 2026-09-24): all 6 facets move inside one `tags` map / Add-place form collapses 6 facet sections into a single tags input / unknown free text is accepted into a `tags.pending` review queue (not rejected) / emulator-only, hard cutover, no prod migration script, no dual-write.
- Session scope: PRD only. No implementation.

## 1. Goal

Group the 6 v1 flat facet fields under one Firestore map (`tags`) so the console and the domain model read as one unit, and simplify contribution so a user types tags — not 6 facet sections — while the system keeps the precision of controlled facets underneath.

Success criteria:

- A contributor types `rice, soto, spicy` and the preview shows `ingredients:[rice], menus:[soup], pending:[spicy]` before submit (specific→parent applied, unknown queued, nothing silently dropped).
- A place with `tags.pending` only (zero resolved facets) saves, lists, and shuffles fine, same as today's zero-facet place.
- A visitor filters `menus:[soup] + ingredients:[chicken]` and gets the intersection; `pending` values never affect facet filtering.
- Firestore rejects any resolved facet value outside the v1 vocabularies, but accepts any non-empty string in `tags.pending` (cap 8, each 1–24 chars).
- `pnpm lint`, `pnpm format --check`, and `pnpm typecheck` pass; no flat facet code paths remain outside this doc and the archived v1 spec/migration script.

## 2. Non-goals

- No vocab changes: MENU (16), PRICE_TIER (4), SERVING (`meal`, `snack`), INGREDIENT (13), ORIGIN (8), HEALTH_STYLE (3) stay as v1. No `taste`/`venue`/dish-specific/halal flags — `pending` is the intake for those, promotion to a facet is later work.
- No per-city price bands, no currency, no numbers in IDs.
- No prod data migration: emulator-only. Seed is rewritten; emulator data is wiped or cleaned by `updatePlace` deletes.
- No URL-synced filters, no detail pages, no ratings/photos, no review-queue UI beyond muted badges (triage UI is backlog).
- No `t()` runtime or next-intl; copy stays inline and server-first per repo rules.

## 3. Current-state facts (verified in tree)

- Entity: `FoodPlace { areas, id, name, menus[], servings[], ingredients[], origins[], priceTier?, healthStyle?, ...social }` (`lib/foods/types.ts:65-77`). All facets optional — zero filled is valid; there is no `min(1)` in Zod (`lib/foods/index.ts:72-83`) or `firestore.rules:28-33`.
- Filter: AND-across / OR-within over flat fields (`lib/foods/index.ts:286-312`); catalog derived per flat field (`deriveFacetCatalog`, `lib/foods/index.ts:329-338`).
- Rules: flat `keys().hasOnly([...])` + per-field `isValidFacetList` + `facetTotal <= 8` (`firestore.rules:4-14,18-43`).
- Parse: `toFoodPlace` coerces missing arrays to `[]`, missing singles to `undefined` in both `lib/firebase/client.ts:188-218` and `lib/firebase/server.ts:71-101`.
- UI: catalog has 6 filter groups (`components/foods/foods-catalog-client.tsx:36-43,324-365`); form has 6 picker sections — `MultiFacet` checkbox sets + `SingleFacet` radios with `Not set` (`components/foods/food-form-client.tsx:66-166`).
- Seed: 17 rows, flat shape (`lib/foods/data/foods.json`), validated per-field in `scripts/seed-foods.ts:40-68`.
- Known collisions for a single input: `porridge` ∈ MENU + INGREDIENT; `mixed` ∈ ORIGIN + INGREDIENT (`lib/foods/types.ts:1-63`). V1 spec §5 pins `soto/bakso/rawon → soup` with dish served by name search.

## 4. Critique — why nest, why a single input, and what they cost

1. **Nesting buys grouping, nothing else.** Filtering is client-side in-memory, so `tags.menus` vs `menus` changes no query, index, or result. The win is one `tags` map in the console and one `FoodTags` object in code. The price is touch-every-layer churn plus more verbose rules (map + nested `keys().hasOnly`). V1 §6 chose flat to avoid exactly this; v2 accepts the churn for readability.
2. **One input must not silently re-mix the six questions.** V1 was built because free-text `tags[]` mixed ingredient/origin/style/dish/taste/venue. A bare single input without a mapping layer would regress to that. The mapping layer (`mapFreeTextToTags`, §6) plus the live preview preserves facet precision while the contributor only types tags.
3. **Queue, don't drop or reject.** V1 dropped `soto/spicy/food court` at migration (`scripts/migrate-food-facets.ts:35`). For live contribution that loses user intent. `tags.pending` keeps every keystroke visible (muted badge, name-searchable) and gives a future promotion source for taste/venue/dish facets.
4. **Collisions need a deterministic rule, not a prompt.** Bare `porridge` and `mixed` match two vocabs. Rule (§6): bare `porridge → menus`, bare `mixed → ingredients`; facet-prefixed input (`ingredient:porridge`, `origin:mixed`) overrides. Documented in one comment; the preview lets the contributor delete and re-add with a prefix.

## 5. Taxonomy v2 (unchanged values, new home)

Stored IDs stay lowercase; display via existing `formatFacetValue()`. Caps unchanged: menus max 3, servings max 2, ingredients max 5, origins max 3, total resolved ≤ 8. `pending` max 8, excluded from the resolved total.

| Facet | `tags.*` key | Cardinality | Values |
| --- | --- | --- | --- |
| menu | `menus` | multi, max 3 | `burger, pizza, pasta, sandwich, sushi, rice-bowl, noodle-bowl, soup, porridge, salad, fried-chicken, grill, dessert, bakery, coffee, beverage` |
| serving | `servings` | multi, max 2 | `meal, snack` |
| ingredients | `ingredients` | multi, max 5 | `rice, noodles, bread, potato, porridge, none, chicken, beef, seafood, egg, plant, pork, mixed` |
| origin | `origins` | multi, max 3 | `indonesian, chinese, japanese, korean, western, middle-eastern, southeast-asian, mixed` |
| priceTier | `priceTier` | single, optional | `budget, regular, premium, splurge` (ranges stay form/docs guidance only) |
| healthStyle | `healthStyle` | single, optional | `comfort, everyday, fresh` |
| review queue | `pending` | multi, max 8, free text 1–24 chars | anything not mapped; never filtered as a facet |

Mapping table (extends v1 `TAG_TO_FACET` to full vocabs; case-insensitive, trim):

- Every vocab value maps to its facet; singles (`budget`, `meal` is multi, `fresh`, …) map likewise.
- Specific→parent: `soto, bakso, rawon → menus:soup`. Other dish names queue to `pending` (future facet source, not silent drop).
- Dropped-from-v1 taste/venue words (`spicy`, `food court`, `fast food`, `healthy`, …) now queue to `pending` instead of being dropped.
- Collisions: bare `porridge → menus:porridge`; bare `mixed → ingredients:mixed`; `facet:value` prefix (`menu:porridge`, `ingredient:porridge`, `origin:mixed`) selects explicitly; unknown prefix or unknown value queues whole token to `pending`.

## 6. Data model

```ts
interface FoodTags {
  ingredients: string[]; // max 5
  menus: string[]; // max 3
  origins: string[]; // max 3
  servings: string[]; // max 2
  priceTier?: PriceTier;
  healthStyle?: HealthStyle;
  pending: string[]; // max 8, free text
}

interface FoodPlace {
  areas: string[];
  id: string;
  name: string;
  tags: FoodTags;
  instagramUrl?: string;
  tiktokUrl?: string;
}
```

`lib/foods/types.ts` owns `FoodTags` + unchanged vocabs. `lib/foods/index.ts` (universal) owns `mapFreeTextToTags(tokens: string[]): { tags: FoodTags; }`, `normalizeFoodTags()` (coerce missing arrays to `[]`, singles to `undefined`, filter resolved against vocabs, trim/dedupe `pending`), `FoodFilters` (unchanged shape — still per-facet arrays), `filterFoods` (reads `place.tags.*`), `deriveFacetCatalog` (reads `place.tags.*`), `countFacetValues(tags)` (resolved only, ≤ 8). Flat `normalizeFoodFacets` is replaced, not kept beside.

## 7. Filter + display semantics (load-bearing, unchanged except housing + pending)

- Within one facet: OR. Across facets: AND. Inactive facet = no constraint. Facet-less (for that facet) places match only when the facet is inactive. Unfiltered list always shows everything.
- `pending` never participates in facet filtering. `pending` tokens ARE matched by name search (substring, same as `place.name`) so queued words stay findable.
- Count line, shuffle pool, empty state operate on the filtered set, unchanged.
- Badges: resolved values render as today (name-only pill + per-facet dot + `aria-label="<Facet>: <Value>"`); `pending` renders as muted `variant="outline"` badges with `aria-label="Pending: <token>"`. Zero-resolved places with empty `pending` hide the pill row entirely.

## 8. UX changes

1. **Form (`food-form-client.tsx`):** delete the 6 `MultiFacet`/`SingleFacet` sections. One tags combobox: free-text entry (comma/Enter split) + suggestions from all vocabs rendered as `<value> (<facet>)`, colliding values shown twice with facet hints. Live preview below the input: resolved facet chips grouped by facet + pending chips muted. Submit builds `FoodInput { areas, name, urls, tags }` via `mapFreeTextToTags`. Keep name/area/URL behavior and the passive hint, retargeted ("Unknown tags go to a review queue — they stay searchable.").
2. **Catalog (`foods-catalog-client.tsx`):** filter groups stay 6 (Menu, Price, Serving + More filters) — contribution is simplified, discovery is not. Accessors switch to `place.tags.*`. `FoodBadges` gains the `pending` row.
3. **Copy stays inline and server-first**; no `t()` runtime.

## 9. Validation, rules, seed, cutover

- **Zod (`lib/foods/index.ts`):** `z.object({ tags: z.object({ menus: z.enum(MENU_VOCAB).array().max(3), servings: ....max(2), ingredients: ....max(5), origins: ....max(3), priceTier: z.enum(...).optional(), healthStyle: z.enum(...).optional(), pending: z.string().min(1).max(24).array().max(8) }) })` + resolved-total `refine <= 8`. `validateFoodInput` keeps name/duplicate/area/URL behavior.
- **`firestore.rules` (create + update):** top-level `keys().hasOnly([areas, name, tags, createdByUid, createdAt, updatedAt, instagramUrl, tiktokUrl])`; `tags is map && tags.keys().hasOnly([menus, servings, ingredients, origins, priceTier, healthStyle, pending])`; per-key vocab/cap checks as today but addressed at `request.resource.data.tags.<key>`; `pending` free-text check; `facetTotal(tags) <= 8` over resolved keys only.
- **`lib/firebase/client.ts` + `server.ts`:** `toFoodPlace` requires `data["tags"]` map (non-map → empty-tags place, not null, so console grouping never breaks reads); `createPlace` always writes the `tags` map; `updatePlace` writes `tags` + `deleteField()` on all retired flat keys (`menus, servings, ingredients, origins, priceTier, healthStyle, tags-string legacy, staples, proteins, serving`).
- **Seed (`lib/foods/data/foods.json` + `scripts/seed-foods.ts`):** rewrite the 17 rows to the §6 shape with `pending: []`; seed validation checks nested vocabs + caps. No new migration script (emulator-only hard cutover); `scripts/migrate-food-facets.ts` stays archived as the v1 record.
- **Backlog:** `pending` triage UI, promotion of queued tokens to real facets, per-city price bands.

## 10. Acceptance checklist

- [ ] Typing `rice, soto, spicy` previews `ingredients:[rice], menus:[soup], pending:[spicy]`; submit saves and the doc reads back identically.
- [ ] Pending-only place saves, appears unfiltered/in count/in shuffle with muted pending badges; disappears from no facet-filtered view except via name search.
- [ ] `menus:[soup] + ingredients:[chicken]` returns the intersection; two values in one facet return the union.
- [ ] Rules reject out-of-vocab resolved values, over-cap arrays, and unknown keys (top-level or inside `tags`) on create and update; zero-resolved + empty-pending create allowed.
- [ ] Badges expose resolved value + facet `aria-label`; pending badges expose `Pending: <token>`; UI usable grayscaled.
- [ ] Seed rewrites validate clean; `rg` shows no flat facet access (`place.menus`, `place.ingredients`, `staples`, `proteins`) outside this doc, the v1 spec, and the archived migration script.
- [ ] `pnpm lint`, `pnpm format --check`, and `tsc --noEmit` pass.

## 11. Implementation order (suggested, not mandated)

1. Model + `mapFreeTextToTags` + normalize + filter/catalog on nested shape + unit probe for collisions, specific→parent, and pending semantics.
2. Rules + firebase parse/serialize + Zod.
3. Seed rewrite + emulator wipe/reseed.
4. Single-input form with live preview, then catalog accessor + badge update.
5. Leftover grep + gates + browser smoke per §10.
