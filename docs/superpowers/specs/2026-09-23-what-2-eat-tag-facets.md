# What-2-Eat — Tag Facets v1 (PRD)

- Date: 2026-09-23
- Status: implemented (branch `feat/tag-facets`, commit `3806242`). As-built notes in §§5–9 supersede the draft where they differ.
- Session scope: PRD only. No implementation.
- Language: English.
- Supplements: `2026-09-22-what-2-eat-firebase.md` (storage/rules), `2026-09-23-what-2-eat-multi-location.md` (areas). This doc replaces the free-text `tags: string[]` model those docs assume.
- Locked decisions (from review session): structured facets (flat fields, hard cutover, no dual-write) / neutral price labels (no numbers in IDs) / `healthStyle: comfort | everyday | fresh` (`comfort` replaces `indulgent`/`fast food`) / `menu` is general serving-forms only (specific dishes map to a parent) with multi max 3 / filter UI groups primary (Menu + Price + Serving) above More filters / **all facets optional — zero filled is valid (free filter)**.
- Post-review adjustments (as built): 6 facets, not 7 — staple + protein merged into one `ingredients` facet / `servings` is multi (`meal`, `snack`, max 2; a both-place stores both, a both-filter ticks both) / pills show the value name only (`Japanese`, not `origin:japanese`) with `aria-label` still naming the facet / display labels use normal casing (`formatFacetValue`: `fried-chicken` → `Fried Chicken`) while stored IDs stay lowercase.

## 1. Goal

Replace the single free-text `tags` array — which currently mixes ingredients, origin, style, dish, taste, and venue in one list — with 6 controlled facets so users can answer distinct questions independently: "what form" (menu), "what ingredient" (ingredients), "what budget" (price), "snack or meal" (serving), "what tradition" (origin), "what positioning" (health style).

Success criteria:

- A contributor adds a place with zero facets and it saves, lists, and shuffles fine.
- A visitor filters `menus:[burger] + priceTiers:[budget]` and gets the intersection, not the union.
- A place with no `menus` values disappears only when a menu filter is active — never from the unfiltered list.
- Firestore rejects any facet value outside the vocabularies below.
- Facet pills show the value name only (never color-only) with an `aria-label` naming the facet (e.g. pill `Japanese`, `aria-label="Origin: Japanese"`).
- `pnpm lint`, `pnpm format --check`, and `pnpm typecheck` pass.

## 2. Non-goals

- No dish-specific taxonomy (soto, bakso, rawon stay mapped to `menu:soup`; specific cravings are served by name search, not facets).
- No `taste` facet (spicy/sweet), no `venue` facet (food court/cafe/street), no halal/veg flags — backlog (§9).
- No per-city price thresholds, no currency conversion, no price numbers in IDs.
- No dual-write period with legacy `tags[]`; catalog is small enough for a single cutover with a reviewed backfill.
- No URL-synced filters, no detail pages, no ratings/photos.

## 3. Current-state facts (verified in tree)

- Entity: `FoodPlace { areas, id, name, tags: string[], ...social }` (`lib/foods/types.ts:1-8`).
- Validation: `tags: z.string().min(1).max(24).array().min(1).max(8)` (`lib/foods/index.ts:43`); `normalizeFoodTags` only trims + case-insensitive dedups (`lib/foods/index.ts:66-77`).
- Filter: flat OR — `place.tags.some((tag) => selectedTags.has(tag))` (`lib/foods/index.ts:170`). Catalog is a flat sorted list (`deriveTagCatalog`, `lib/foods/index.ts:176-178`).
- Rules: `firestore.rules:17-18,41-42` check only `tags.size() 1..8`, no value checks.
- UI: one chip row for all tags (`foods-catalog-client.tsx:176-194`), all badges `variant="secondary"` (`foods-catalog-client.tsx:304-308`); form is a free-text combobox (`food-form-client.tsx:52-66`).
- Seed: 17 rows in `lib/foods/data/foods.json` mixing 7 dimensions (e.g. `Greenly = Healthy + Salad + Western`; `Soto Cak Har = Chicken + Indonesian + Soup + Soto` with `Soup`/`Soto` duplicated; `Spicy`, `Food Court`, `Coffee` present). (The draft said 18; the file holds 17.)

## 4. Critique — why facets, and what they cost

1. **One array cannot hold six questions.** `Beef`/`Chicken`/`Rice` (ingredient) vs `Japanese` (origin) vs `Fast Food` (style) vs `Soto` (dish) vs `Spicy` (taste) vs `Food Court` (venue) collide in one filter row, so every new tag makes every old filter noisier. Facets separate the questions; the filter becomes AND-across, OR-within.
2. **Staple + protein merged back into `ingredients`.** The draft split them (`staple[]` + `protein[]`) so `rice + chicken` stays distinguishable from `rice + beef`. As built they are one 13-value facet (`ingredients`, max 5): values stay distinct IDs, so no information is lost, and one chip set is less UI than two. The tradeoff (a combined "rice + chicken" filter also matching a place with rice-only plus another with chicken-only is impossible — matching is per-place, so precision is preserved) was accepted in review.
3. **Price numbers rot; health words judge.** `<20k` in an ID breaks on inflation and differs between Batam/Malang/Surabaya, so IDs are neutral (`budget | regular | premium | splurge`) with ranges as form/docs guidance only. `Fast Food vs Real Food` mixes speed, processing, and nutrition axes, and `junk` judges the user — `comfort | everyday | fresh` names positioning without moralizing, and `comfort` is understood across languages where `indulgent` is not.
4. **`menu` must be general-only or it explodes.** Allowing `soto` forces `bakso`, `rawon`, `gudeg` tomorrow. Specific dishes map to a parent (`soto → soup`); exact-dish cravings stay on name search. The vocab is capped at ~20 for this reason.
5. **Facets are independent, not hierarchical.** `menus:[burger]` does not auto-imply `ingredients:[bread]` in the DB — implied-value inference creates validation debt and false precision. The UI may hint, never auto-write.
6. **Zero-facet places are the accepted price of free filters.** With nothing required, lazy contributions stay filter-invisible when that facet is active. The spec keeps this non-blocking by design (a completeness nudge is nice-to-have only, §8.5) and states the semantics explicitly so "my place disappeared" is understood as filtering, not data loss.

## 5. Taxonomy v1 (6 facets, all optional)

Stored IDs are lowercase; display labels use normal casing via `formatFacetValue()` (`rice-bowl` → `Rice Bowl`, `japanese` → `Japanese`, `middle-eastern` → `Middle Eastern`).

| Facet       | Field         | Cardinality  | Values (lowercase IDs)                                                                                                                          |
| ----------- | ------------- | ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| menu        | `menus`       | multi, max 3 | `burger, pizza, pasta, sandwich, sushi, rice-bowl, noodle-bowl, soup, porridge, salad, fried-chicken, grill, dessert, bakery, coffee, beverage` |
| priceTier   | `priceTier`   | single       | `budget, regular, premium, splurge` (guidance: `~<20k, ~20-50k, ~50-100k, ~>100k`; guidance lives in docs + form hint, never in the ID)         |
| serving     | `servings`    | multi, max 2 | `meal, snack` (no `both` value — a both-place stores both, a both-filter ticks both)                                                            |
| ingredients | `ingredients` | multi, max 5 | `rice, noodles, bread, potato, porridge, none, chicken, beef, seafood, egg, plant, pork, mixed`                                                 |
| origin      | `origins`     | multi, max 3 | `indonesian, chinese, japanese, korean, western, middle-eastern, southeast-asian, mixed`                                                        |
| healthStyle | `healthStyle` | single       | `comfort, everyday, fresh`                                                                                                                      |

Rules:

- Min 0 facets per place (free filter). Max 8 values total across all facets (keeps the old card-density cap).
- `menu` semantics: serving form, not a specific dish. Mapping rule: specific → parent (`soto/bakso/rawon → soup`). `menu` answers "what form", `healthStyle` answers "what positioning" — `menus:[salad]` + `healthStyle:fresh` (Greenly) vs `menus:[burger,salad]` + `healthStyle:comfort` (McD-style) is valid and non-redundant.
- No `both` serving value: KFC/McD-style places store `servings:[meal,snack]`; visitors wanting both tick both chips (OR-within returns the union).
- `ingredient:none` covers salad/coffee/dessert-only places so "no carb" is explicit rather than missing.

Seed mapping examples (full backfill table is implementation work, these pin the semantics):

- Yoshinoya → `servings:[meal], priceTier:regular, menus:[rice-bowl], ingredients:[rice,beef,chicken], origins:[japanese], healthStyle:everyday`.
- Soto Cak Har (`Chicken + Indonesian + Soup + Soto`) → `menus:[soup], ingredients:[chicken], origins:[indonesian]`; `Soto` value dropped (covered by name search).
- Mie Gacoan (`Indonesian + Noodles + Spicy`) → `menus:[noodle-bowl], ingredients:[noodles], origins:[indonesian]`; `Spicy` dropped to backlog taste.
- Subway → `menus:[sandwich], ingredients:[beef,chicken], origins:[western]`.
- Greenly (`Healthy + Salad + Western`) → `menus:[salad], ingredients:[none], origins:[western], healthStyle:fresh`.
- Taria (`Coffee`) → `menus:[coffee,beverage], servings:[snack]`.
- AEON (`Food Court + Japanese`) → `origins:[japanese]`; `Food Court` dropped to backlog venue.

## 6. Data model

Flat fields on `FoodPlace` (flat beats a nested `tags:{…}` object for simple Firestore `in`-checks and Zod schemas). `tags: string[]` is removed at cutover:

```ts
type PriceTier = "budget" | "regular" | "premium" | "splurge";
type Serving = "meal" | "snack";
type HealthStyle = "comfort" | "everyday" | "fresh";

interface FoodPlace {
  areas: string[];
  id: string;
  name: string;
  menus: string[]; // max 3, Menu vocab
  servings: string[]; // max 2, Serving vocab
  ingredients: string[]; // max 5, Ingredient vocab
  origins: string[]; // max 3, Origin vocab
  priceTier?: PriceTier;
  healthStyle?: HealthStyle;
  instagramUrl?: string;
  tiktokUrl?: string;
}
```

`lib/foods/types.ts` owns the contracts and vocab constants (`MENU_VOCAB`, etc.). `lib/foods/index.ts` (universal) owns `normalizeFoodFacets()`, facet-aware `FoodFilters`, `filterFoods` (AND-across / OR-within, §7), `deriveFacetCatalog()`, and the display helper `formatFacetValue()`. No new `lib/<domain>/` file roles; consumers import types with `import type` from `types.ts` per repo rules.

## 7. Filter + display semantics (load-bearing)

- Within one facet: OR (`menus: [burger, pizza]` matches places with either; `servings: [meal, snack]` matches places with either — this is how "both" is expressed).
- Across facets: AND (a place must satisfy every active facet).
- Inactive facet = no constraint. A place missing that facet field matches only when the facet is inactive; when the facet is active, facet-less places are excluded. Unfiltered list always shows everything.
- Count line, shuffle pool, and empty state all operate on the filtered set, unchanged in mechanics.
- Pills: one pill per value showing the value name only (e.g. `Japanese`, `Fried Chicken`) plus a per-facet dot color, with `aria-label="<Facet>: <Value>"` (e.g. `aria-label="Origin: Japanese"`). Color is accent only — the text label is the signal. Accents: menu = rose, price = emerald, serving = violet, ingredients = amber, origin = sky, health = lime. A small legend sits above the catalog.
- Cards with zero facets hide the pill row entirely (no "no tags" placeholder).

## 8. UX changes

1. **Catalog (`foods-catalog-client.tsx`):** replace the single tag chip row with grouped sections. Primary (always visible): Menu, Price, Serving. More filters (collapsible `details`/accordion): Ingredients, Origin, Style (display titles; the health facet is titled Style). Each section is its own chip set showing normal-cased labels (`Burger`, `Rice Bowl`); reset clears all facets + search + area.
2. **Form (`food-form-client.tsx`):** delete the free-text tag combobox. Replace with per-facet pickers: radios for `priceTier`/`healthStyle` (with a clearable "unset" state since all are optional), checkbox sets for `menus`/`servings`/`ingredients`/`origins` capped at their maxes. Price radio hints show the `~` ranges as help text, not values.
3. **Pills on cards + shuffle panel:** name-only pills per §7.
4. **Copy stays inline and server-first** per repo rules; no `t()` runtime.
5. **Nice-to-have (non-blocking, not acceptance):** a passive completeness hint in the form ("adding price + serving helps others find this place") that never blocks submit.

## 9. Validation, rules, migration

- **Zod (`lib/foods/index.ts`):** enum checks per facet, array caps per §5, total-values cap 8, everything optional. `validateFoodInput` keeps name/duplicate/area/URL behavior unchanged.
- **`firestore.rules` (create + update):** `keys().hasOnly([...areas, name, menus, servings, ingredients, origins, priceTier, healthStyle, createdByUid, createdAt, updatedAt, instagramUrl, tiktokUrl])`, per-field `in`-vocab checks, array size caps, total cap, and optional-single enums guarded by `!("priceTier" in data) || ...`. No `size() >= 1` on any facet field.
- **`lib/firebase/client.ts` + `server.ts`:** parse/serialize the new fields (missing arrays → `[]`, missing singles → `undefined`); reject unknown values at the boundary the same way `tags` is filtered today. `updatePlace` also deletes retired keys (`tags`, `staples`, `proteins`, `serving`) so edits to pre-cutover docs pass the new `hasOnly` check.
- **Seed (`lib/foods/data/foods.json` + `scripts/seed-foods.ts`):** rewrite the 17 rows to facets per the §5 mapping table; seed validation checks vocab membership instead of tag length.
- **Production migration:** one-off script (`scripts/migrate-food-facets.ts`, `pnpm seed:migrate-facets`) with dry-run counts (docs per id → mapped facets → unmapped leftovers for manual review), then cutover write that also deletes retired keys. No dual-write: legacy `tags` field is removed in the same release (rules + code + seed updated atomically).
- **Backlog (explicitly out):** `taste` (spicy), `venue` (food court/cafe), `dish-specific` values (soto/bakso), halal/veg flags, per-city price bands.

## 10. Acceptance checklist

- [x] Place with zero facets saves (form + rules + Zod) and appears in the unfiltered list, count, and shuffle pool with no pill row (verified live: "Probe Warung", 18 of 18, then deleted).
- [x] Active facet excludes facet-less places for that facet; clearing the facet restores them (verified live: `regular` → 1 of 17, reset → 17).
- [x] `menus:[burger] + priceTiers:[regular]` returns the intersection (`0 of 17`); two values in one facet return the union (`servings:[meal,snack]` → the 10 servings-having places).
- [x] Rules emulator rejects out-of-vocab values, over-cap arrays, and unknown keys on create and update (live probe: out-of-vocab ingredient, retired `staples`/`serving` keys, over-cap servings, bad priceTier on update → all `permission-denied`; zero-facet create allowed).
- [x] Pills expose the value name + `aria-label` naming the facet; UI remains usable with color removed (text is the signal, dot is accent-only).
- [x] Seed backfill validates clean; migration dry-run reports zero unmapped docs before write.
- [x] `pnpm lint`, `pnpm format --check`, and `tsc --noEmit` pass on all touched files; no `tags` code paths remain outside this archive doc, the migration script, and one `deleteField` cleanup in `updatePlace`. (Repo-wide `pnpm format --check` still flags 8 pre-existing CRLF files; `next typegen` is blocked by the pre-existing AUTH_BYPASS env guard.)

## 11. Implementation order (suggested, not mandated)

1. Model + vocabs + pure logic + unit coverage for AND-across/OR-within and facet-less semantics.
2. Rules + firebase parse + Zod.
3. Seed rewrite + migration script (dry-run first, reviewed mapping table).
4. Catalog filter groups + badges + form pickers.
5. Delete legacy `tags` code paths; verify with `grep` that only this doc mentions them.
