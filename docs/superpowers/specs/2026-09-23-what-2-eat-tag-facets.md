# What-2-Eat — Tag Facets v1 (PRD)

- Date: 2026-09-23
- Status: draft (PRD only. No implementation.)
- Session scope: PRD only. No implementation.
- Language: English.
- Supplements: `2026-09-22-what-2-eat-firebase.md` (storage/rules), `2026-09-23-what-2-eat-multi-location.md` (areas). This doc replaces the free-text `tags: string[]` model those docs assume.
- Locked decisions (from review session): structured facets (flat fields, hard cutover, no dual-write) / neutral price labels (no numbers in IDs) / `healthStyle: comfort | everyday | fresh` (`comfort` replaces `indulgent`/`fast food`) / `serving` is 3-valued (`snack | meal | both`) / `menu` is general serving-forms only (specific dishes map to a parent) with multi max 3 / filter UI groups primary (Menu + Price + Serving) above More filters / **all facets optional — zero filled is valid (free filter)**.

## 1. Goal

Replace the single free-text `tags` array — which currently mixes ingredients, origin, style, dish, taste, and venue in one list — with 7 controlled facets so users can answer distinct questions independently: "what form" (menu), "what ingredient" (staple/protein), "what budget" (price), "snack or meal" (serving), "what tradition" (origin), "what positioning" (health style).

Success criteria:

- A contributor adds a place with zero facets and it saves, lists, and shuffles fine.
- A visitor filters `menu:burger + priceTier:budget` and gets the intersection, not the union.
- A place with no `menu` values disappears only when a menu filter is active — never from the unfiltered list.
- Firestore rejects any facet value outside the vocabularies below.
- Facet badges carry a text facet label (never color-only) with an `aria-label` naming the facet.
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
- Seed: 18 rows in `lib/foods/data/foods.json` mixing 7 dimensions (e.g. `Greenly = Healthy + Salad + Western`; `Soto Cak Har = Chicken + Indonesian + Soup + Soto` with `Soup`/`Soto` duplicated; `Spicy`, `Food Court`, `Coffee` present).

## 4. Critique — why facets, and what they cost

1. **One array cannot hold seven questions.** `Beef` (protein) vs `Rice` (staple) vs `Japanese` (origin) vs `Fast Food` (style) vs `Soto` (dish) vs `Spicy` (taste) vs `Food Court` (venue) collide in one filter row, so every new tag makes every old filter noisier. Facets separate the questions; the filter becomes AND-across, OR-within.
2. **`ingredients` as proposed was two facets.** Rice/noodles (staple) and beef/chicken (protein) answer different cravings ("want rice, not noodles" vs "want chicken, not beef"). Kept as one, `rice + chicken` is indistinguishable from `rice + beef`. Hence the split into `staple[]` + `protein[]`.
3. **Price numbers rot; health words judge.** `<20k` in an ID breaks on inflation and differs between Batam/Malang/Surabaya, so IDs are neutral (`budget | regular | premium | splurge`) with ranges as form/docs guidance only. `Fast Food vs Real Food` mixes speed, processing, and nutrition axes, and `junk` judges the user — `comfort | everyday | fresh` names positioning without moralizing, and `comfort` is understood across languages where `indulgent` is not.
4. **`menu` must be general-only or it explodes.** Allowing `soto` forces `bakso`, `rawon`, `gudeg` tomorrow. Specific dishes map to a parent (`soto → soup`); exact-dish cravings stay on name search. The vocab is capped at ~20 for this reason.
5. **Facets are independent, not hierarchical.** `menu:burger` does not auto-imply `staple:bread` in the DB — implied-value inference creates validation debt and false precision. The UI may hint, never auto-write.
6. **Zero-facet places are the accepted price of free filters.** With nothing required, lazy contributions stay filter-invisible when that facet is active. The spec keeps this non-blocking by design (a completeness nudge is nice-to-have only, §8.5) and states the semantics explicitly so "my place disappeared" is understood as filtering, not data loss.

## 5. Taxonomy v1 (7 facets, all optional)

| Facet       | Field         | Cardinality  | Values (lowercase IDs)                                                                                                                          |
| ----------- | ------------- | ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| menu        | `menus`       | multi, max 3 | `burger, pizza, pasta, sandwich, sushi, rice-bowl, noodle-bowl, soup, porridge, salad, fried-chicken, grill, dessert, bakery, coffee, beverage` |
| priceTier   | `priceTier`   | single       | `budget, regular, premium, splurge` (guidance: `~<20k, ~20-50k, ~50-100k, ~>100k`; guidance lives in docs + form hint, never in the ID)         |
| serving     | `serving`     | single       | `snack, meal, both`                                                                                                                             |
| staple      | `staples`     | multi, max 3 | `rice, noodles, bread, potato, porridge, none`                                                                                                  |
| protein     | `proteins`    | multi, max 4 | `chicken, beef, seafood, egg, plant, pork, mixed`                                                                                               |
| origin      | `origins`     | multi, max 3 | `indonesian, chinese, japanese, korean, western, middle-eastern, southeast-asian, mixed`                                                        |
| healthStyle | `healthStyle` | single       | `comfort, everyday, fresh`                                                                                                                      |

Rules:

- Min 0 facets per place (free filter). Max 8 values total across all facets (keeps the old card-density cap).
- `menu` semantics: serving form, not a specific dish. Mapping rule: specific → parent (`soto/bakso/rawon → soup`). `menu` answers "what form", `healthStyle` answers "what positioning" — `menu:[salad]` + `healthStyle:fresh` (Greenly) vs `menu:[burger,salad]` + `healthStyle:comfort` (McD-style) is valid and non-redundant.
- `serving:both` means the place genuinely serves both (KFC/McD-style); contributors do not set `snack + meal` as two values.
- `staple:none` covers salad/coffee/dessert-only places so "no carb" is explicit rather than missing.

Seed mapping examples (full backfill table is implementation work, these pin the semantics):

- Yoshinoya → `serving:meal, priceTier:regular, menus:[rice-bowl], staples:[rice], proteins:[beef,chicken], origins:[japanese], healthStyle:everyday`.
- Soto Cak Har (`Chicken + Indonesian + Soup + Soto`) → `menus:[soup], proteins:[chicken], origins:[indonesian]`; `Soto` value dropped (covered by name search).
- Mie Gacoan (`Indonesian + Noodles + Spicy`) → `menus:[noodle-bowl], staples:[noodles], origins:[indonesian]`; `Spicy` dropped to backlog taste.
- Subway → `menus:[sandwich], proteins:[beef,chicken], origins:[western]`.
- Greenly (`Healthy + Salad + Western`) → `menus:[salad], staples:[none], origins:[western], healthStyle:fresh`.
- Taria (`Coffee`) → `menus:[coffee,beverage], serving:snack`.
- AEON (`Food Court + Japanese`) → `origins:[japanese]`; `Food Court` dropped to backlog venue.

## 6. Data model

Flat fields on `FoodPlace` (flat beats a nested `tags:{…}` object for simple Firestore `in`-checks and Zod schemas). `tags: string[]` is removed at cutover:

```ts
type PriceTier = "budget" | "regular" | "premium" | "splurge";
type Serving = "snack" | "meal" | "both";
type HealthStyle = "comfort" | "everyday" | "fresh";

interface FoodPlace {
  areas: string[];
  id: string;
  name: string;
  menus: string[]; // max 3, Menu vocab
  staples: string[]; // max 3, Staple vocab
  proteins: string[]; // max 4, Protein vocab
  origins: string[]; // max 3, Origin vocab
  priceTier?: PriceTier;
  serving?: Serving;
  healthStyle?: HealthStyle;
  instagramUrl?: string;
  tiktokUrl?: string;
}
```

`lib/foods/types.ts` owns the contracts and vocab constants (`MENU_VOCAB`, etc.). `lib/foods/index.ts` (universal) owns `normalizeFoodFacets()`, facet-aware `FoodFilters`, `filterFoods` (AND-across / OR-within, §7), and `deriveFacetCatalog()`. No new `lib/<domain>/` file roles; consumers import types with `import type` from `types.ts` per repo rules.

## 7. Filter + display semantics (load-bearing)

- Within one facet: OR (`menus: [burger, pizza]` matches places with either).
- Across facets: AND (a place must satisfy every active facet).
- Inactive facet = no constraint. A place missing that facet field matches only when the facet is inactive; when the facet is active, facet-less places are excluded. Unfiltered list always shows everything.
- Count line, shuffle pool, and empty state all operate on the filtered set, unchanged in mechanics.
- Badges: one badge per value, each carrying a text facet cue (e.g. `menu:burger`) plus a per-facet dot color, with `aria-label="<Facet>: <value>"` (e.g. `aria-label="Price: budget"`). Color is accent only — the text label is the signal. Suggested accents (verify contrast in both themes): price = emerald, serving = violet, menu = rose, staple = amber, protein = orange, origin = sky, health = lime. A small legend sits above the catalog.
- Cards with zero facets hide the badge row entirely (no "no tags" placeholder).

## 8. UX changes

1. **Catalog (`foods-catalog-client.tsx`):** replace the single tag chip row with grouped sections. Primary (always visible): Menu, Price, Serving. More filters (collapsible `details`/accordion): Staple, Protein, Origin, HealthStyle. Each section is its own chip set; reset clears all facets + search + area.
2. **Form (`food-form-client.tsx`):** delete the free-text tag combobox. Replace with per-facet pickers: radios for `priceTier`/`serving`/`healthStyle` (with a clearable "unset" state since all are optional), checkbox sets for `menus`/`staples`/`proteins`/`origins` capped at their maxes. Price radio hints show the `~` ranges as help text, not values.
3. **Badges on cards + shuffle panel:** facet-labeled badges per §7.
4. **Copy stays inline and server-first** per repo rules; no `t()` runtime.
5. **Nice-to-have (non-blocking, not acceptance):** a passive completeness hint in the form ("adding price + serving helps others find this place") that never blocks submit.

## 9. Validation, rules, migration

- **Zod (`lib/foods/index.ts`):** enum checks per facet, array caps per §5, total-values cap 8, everything optional. `validateFoodInput` keeps name/duplicate/area/URL behavior unchanged.
- **`firestore.rules` (create + update):** `keys().hasOnly([...areas, name, menus, staples, proteins, origins, priceTier, serving, healthStyle, createdByUid, createdAt, updatedAt, instagramUrl, tiktokUrl])`, per-field `in`-vocab checks, array size caps, total cap, and optional-single enums guarded by `!("priceTier" in data) || ...`. No `size() >= 1` on any facet field.
- **`lib/firebase/client.ts` + `server.ts`:** parse/serialize the new fields (missing arrays → `[]`, missing singles → `undefined`); reject unknown values at the boundary the same way `tags` is filtered today.
- **Seed (`lib/foods/data/foods.json` + `scripts/seed-foods.ts`):** rewrite the 18 rows to facets per the §5 mapping table; seed validation checks vocab membership instead of tag length.
- **Production migration:** one-off script with dry-run counts (docs per id → mapped facets → unmapped leftovers for manual review), then cutover write. No dual-write: legacy `tags` field is removed in the same release (rules + code + seed updated atomically).
- **Backlog (explicitly out):** `taste` (spicy), `venue` (food court/cafe), `dish-specific` values (soto/bakso), halal/veg flags, per-city price bands.

## 10. Acceptance checklist

- [ ] Place with zero facets saves (form + rules + Zod) and appears in the unfiltered list, count, and shuffle pool with no badge row.
- [ ] Active facet excludes facet-less places for that facet; clearing the facet restores them.
- [ ] `menu:burger + priceTier:budget` returns the intersection; two values in one facet return the union.
- [ ] Rules emulator rejects out-of-vocab values, over-cap arrays, and unknown keys on create and update.
- [ ] Badges expose facet text + `aria-label`; UI remains usable with color removed (grayscale check).
- [ ] Seed backfill validates clean; migration dry-run reports zero unmapped docs before write.
- [ ] `pnpm lint`, `pnpm format --check`, `pnpm typecheck` pass; no `tags: string[]` references remain outside this archive doc.

## 11. Implementation order (suggested, not mandated)

1. Model + vocabs + pure logic + unit coverage for AND-across/OR-within and facet-less semantics.
2. Rules + firebase parse + Zod.
3. Seed rewrite + migration script (dry-run first, reviewed mapping table).
4. Catalog filter groups + badges + form pickers.
5. Delete legacy `tags` code paths; verify with `grep` that only this doc mentions them.
