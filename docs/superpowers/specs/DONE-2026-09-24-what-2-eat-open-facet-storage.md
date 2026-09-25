# What-2-Eat — Open-Facet First-Class Storage (PRD)

- Date: 2026-09-24
- Status: implemented, UNVERIFIED. `tags.open` shape + caps + totals (Zod, `normalizeFoodTags`, `countFacetValues`), `storedValuesFor`/`describeTagUsage`/`placeMatchesOpenFacets`/`movePendingToOpen` off `tags.open`, rules allowlist + `open is map ≤ 8 keys`, transports + seed + `migrate-open-facets.ts` dry-run/write runbook, form/catalog/manager reads; `pnpm lint`, `pnpm format --check` (touched files), and `tsc --noEmit` pass. Presentation note: the catalog renders open values as chips in the existing flat Tags list (same as the six known facets) rather than one visual group per facet; OR-within / AND-across semantics hold. Pending: owner-verified browser + emulator smoke per §9.
- Language: English.
- Supplements: `DONE-2026-09-24-what-2-eat-tag-registry.md` (registry + open-enum facet names, implemented) and `DONE-2026-09-24-what-2-eat-nested-tags.md` (v2 nested `tags` map, implemented). This doc changes the `FoodPlace.tags` shape; it does not add move UI.
- Locked decisions (from planning session 2026-09-24): open facets get first-class storage before any move feature / model A — `tags.open: Record<string, string[]>`, every open facet is multi-value / per-open-facet cap 5, at most 8 open facets per place, total resolved values (known + open) stays ≤ 8, `pending` cap stays 8 / `pending` returns to being a pure review queue / tag management stays open to all logged-in users (no admin allowlist) / production data exists, so this PRD ships a production migration, not an emulator-only aid.
- Session scope: PRD only. No implementation.
- Verified production snapshot (`pnpm audit:tags`, 2026-09-24): 32 `tags` docs (6 known facets + 1 open facet `texture` with 3 active values; 1 deprecated `menus` value), 34 `food_places` docs, **0 pending tokens**. Migration dry-run on current data is therefore a no-op: zero relocations, zero leftovers, zero cap refusals. The `texture` registry values exist but no place holds them yet (nothing to store them in — the gap this PRD closes).

## 1. Goal

Give registry open facets (taste, venue, and whatever production already holds) a real home inside `food_places` so values promoted out of `pending` are stored, filtered, and counted — not silently parked back in `pending`.

Success criteria:

- Promoting `pending:spicy` to `taste:spicy` stores the value under `tags.open.taste`, and the place reads back identically.
- The catalog shows one filter group per open facet present, with OR-within / AND-across semantics identical to the six known facets.
- `pending` holds only unreviewed free text; zero promoted values remain there after migration.
- Usage counts, suggestions, and form mapping resolve open-facet values from `tags.open`, never from `pending`.
- `pnpm lint`, `pnpm format --check`, and `tsc --noEmit` pass.

## 2. Non-goals

- No move UI (drag-drop, Move dialog). That is PRD-2 and must wait for this PRD.
- No rename-across-facets, no delete, no version history, no revert UI.
- No single-value open facets: every open facet is multi-value. A single-value semantic (e.g. spice level) is a future PRD if proven needed.
- No per-place facet allowlist and no admin roles; the open enum stays open.
- No change to areas, social links, auth, or the answer-engine surface.

## 3. Current-state facts (verified in tree)

- `FoodTags` has first-class columns for exactly six facets plus `pending` (`lib/foods/types.ts:65-75`); `firestore.rules:37-48` locks the same key set with per-facet caps (menus 3, servings 2, ingredients 5, origins 3, singles 1, resolved total ≤ 8, pending ≤ 8).
- Open facets have no storage. `storedValuesFor` falls back to `tags.pending` for any unknown facet (`lib/tags/index.ts:274-276`); the manager reads open-facet usage through `usage.pending` (`components/tags/tags-manager-client.tsx:93-96`); open-facet filtering matches against pending tokens (`placeMatchesOpenFacets`, `lib/tags/index.ts:310-321`).
- The promote path only creates a registry doc; it never rewrites the holding places (`components/tags/tags-manager-client.tsx:508-526`). Post-promote, the value still lives in `pending` on every affected place.
- Writes flow through `createPlace` / `updatePlace` (`lib/firebase/client.ts:239-303`) and `toFoodPlace` in both client (`lib/firebase/client.ts:195-213`) and server (`lib/firebase/server.ts:73-91`); validation in Zod (`lib/foods/index.ts:64-90`) plus `normalizeFoodTags` (`lib/foods/index.ts:154-168`); seed validation in `scripts/seed-foods.ts:45-84,110-135` with rows in `lib/foods/data/foods.json`.
- Reads: `filterFoods` + `deriveFacetCatalog` (`lib/foods/index.ts:511-567`); badges + flat tag chips + `selectedOpen` state in `components/foods/foods-catalog-client.tsx:87-156,228-309`; suggestions + preview in `components/foods/food-form-client.tsx:74-116,295-320`; registry maps in `lib/tags/index.ts:175-211`.

## 4. Critique — why storage first, and the rules trade-off

1. **Move without storage fakes success.** A "move to taste" that lands back in `pending` changes nothing queryable while telling the user something happened. Storage is the load-bearing half of the feature; the drag-drop is the cosmetic half.
2. **Model A (map) fits the codebase's per-facet mental model.** `Record<facet, string[]>` keeps filter grouping, usage grouping, badges, and `storedValuesFor` as direct key lookups. The considered alternative — `open: string[]` of `facet:value` composite tokens — is friendlier to Firestore rules (index-wise list checks like `pending`) but forces parse-then-group on every read path and duplicates the colon-prefix convention already used for disambiguation in `mapFreeTextToTags`. Map wins on read ergonomics, which is the hot path.
3. **The honest cost of the map: rules cannot loop over dynamic keys.** Firestore rules v2 has no iteration over map keys, so per-facet list contents inside `open` cannot be validated index-wise the way the six known facets are. Rules will enforce what they can — `open is map`, at most 8 keys, key allowlist extended with `"open"`, and the resolved total cap — while strong per-value validation (facet-name pattern, value pattern, per-facet cap 5) lives in Zod + `normalizeFoodTags` + the migration script. This mirrors the existing posture (rules keep hardcoded vocabs as the strong validator for known facets while the registry is advisory) and is recorded here as a known gap, not a silent one. Server-side re-validation (Cloud Function) is backlog.
4. **Total cap must cover open values or the "8" promise breaks.** Today `facetTotal` sums the six known facets (`firestore.rules:29-36`) and Zod mirrors it (`countFacetValues`, `lib/foods/index.ts:398-407`). If open values sit outside the total, a place can accumulate unbounded resolved tags. The total becomes known-sum + open-sum ≤ 8, enforced exactly in client/Zod/migration and structurally in rules to the extent the map allows.
5. **Production migration is the blast radius.** Unlike the v2 cutover (no prod data), this PRD rewrites production `food_places`: every pending token that belongs to a registry open facet moves to `tags.open`. Dry-run counts first, write second, per-doc validation third. No dual-write window, no silent drops — every relocated token is accounted for in the dry-run report.

## 5. Data model

```ts
interface FoodTags {
  healthStyle?: string;
  ingredients: string[];
  menus: string[];
  open: Record<string, string[]>; // NEW: open facets, always multi-value
  origins: string[];
  pending: string[]; // review queue only, never promoted values
  priceTier?: string;
  servings: string[];
}
```

- `open` keys match the registry facet pattern (`FACET_PATTERN`, `lib/tags/index.ts:17`); values match the tag value pattern (`VALUE_PATTERN`, `lib/tags/index.ts:19`). Neither `pending` nor any of the six known facet names may appear as an `open` key.
- Caps: each open facet ≤ 5 values; at most 8 open facets per place; resolved total (known sum + all open values) ≤ 8; `pending` ≤ 8 unchanged.
- Deliberately absent: single-value open facets, stored usage counters (still derived live), facet display-label overrides (`formatFacetValue` stays the renderer).

## 6. Filter + display semantics

- Each open facet present in the union of registry + stored data renders one filter group; OR-within the facet, AND-across against all other facets (known and open alike).
- Inactive facet = no constraint; facet-less places match only when that facet is inactive. `pending` never filters, stays name-searchable.
- Badges gain open-facet rows (same pill style, facet `aria-label`s); `deprecated` registry values stay hidden from suggestions and filter groups but keep parsing in stored places.
- `placeMatchesOpenFacets` matches against `tags.open` groups instead of `pending` tokens.

## 7. UX changes (storage-only; no move UI)

1. **Form (`food-form-client.tsx`):** `mapFreeTextToTags` resolves registry open-facet values (bare or `facet:value`-prefixed) into `tags.open`; unmatched text still lands in `pending` via `Add "<text>"`. `TagsPreview` renders open groups. Suggestion fallback when the registry is empty/unreachable is unchanged (built-ins only).
2. **Catalog (`foods-catalog-client.tsx`):** `deriveFacetCatalog` gains open groups; the flat Tags list and `selectedOpen` state read from stored open values + registry suggestions; `visibleOpen` filters against stored open values.
3. **Manager (`tags-manager-client.tsx`):** per-facet tables for open facets read usage from `tags.open` (replacing the `usage.pending` bridge); promote writes the value into the place's `tags.open` group via batch update of affected docs (this is a data relocation, not PRD-2's move — source is always `pending`).
4. Copy stays inline and server-first; no `t()` runtime.

## 8. Validation, rules, seed, migration

- **Zod/client (`lib/foods/index.ts`):** `foodTagsSchema` gains `open: z.record(facet, value-array max 5)` with key/value pattern checks and ≤ 8 keys; `countFacetValues` adds open values; `normalizeFoodTags` coerces `open` (drop unknown/invalid keys, trim/dedupe/lowercase values, enforce caps); `validateFoodInput` surfaces open-facet errors through the existing `tags` error slot.
- **`firestore.rules`:** `tags.keys().hasOnly` gains `"open"`; `open is map` with key-count cap; `facetTotal` adds open values to the ≤ 8 total to the extent rules can express it (document the exact expression in the implementation; the client remains the strong validator for per-facet contents). `pending` checks unchanged.
- **Transports:** `toFoodPlace` (client + server) and `createPlace` / `updatePlace` carry `open` through; corrupt `open` (non-map, bad keys) → skip the key, never null the list — same tolerance posture as `normalizeTagDoc`.
- **Domain (`lib/tags/index.ts`):** `storedValuesFor` reads `tags.open[facet]`; `describeTagUsage` counts open groups from `tags.open`; `buildRegistryMaps` unchanged (registry shape untouched); `mapFreeTextToTags` / `foodTagsToTokens` round-trip open values with `facet:value` prefixes where bare tokens would resolve elsewhere.
- **Seed:** `scripts/seed-foods.ts` + `foods.json` validate and write `open` (empty for current rows unless a row genuinely needs one); `scripts/seed-tags.ts` unchanged.
- **Production migration (new script, e.g. `scripts/migrate-open-facets.ts`, `pnpm seed:migrate-open`):** dry-run prints per-doc relocations (`pending` token → `open` group, per registry `valueToFacet`) plus unmapped leftovers, exits 1 if any relocation would violate caps; write mode applies relocation + trims `pending`, per-doc validated, chunked batches, summary counts. No dual-write: the relocated token is removed from `pending` in the same write.

## 9. Acceptance checklist

- [ ] Promoting `pending:spicy` with facet `taste` stores it under `tags.open.taste` on affected places and clears it from their `pending`; reads back identically.
- [ ] Catalog renders a `taste` filter group with correct OR-within / AND-across behavior against known facets.
- [ ] Places with only `open` values (zero known facets) save, list, filter, and shuffle fine.
- [ ] Over-cap relocation (target open group or resolved total would exceed caps) is refused per-doc with a clear error; dry-run predicts every refusal.
- [ ] Registry empty/unreachable: form and catalog behave as today (built-ins + pending bridge off — open groups simply absent, no crash).
- [ ] Rules reject unknown top-level `tags` keys and oversized `open` key sets; `food_places` known-facet checks byte-identical otherwise.
- [ ] Migration dry-run on production data accounts for every pending token (relocated vs leftover, zero silent drops); write mode is idempotent on re-run.
- [ ] `pnpm lint`, `pnpm format --check`, and `tsc --noEmit` pass.

## 10. Implementation order (suggested, not mandated)

1. `FoodTags.open` type + `normalizeFoodTags` + `countFacetValues` + unit probe (coercion, caps, totals).
2. Zod schema + `validateFoodInput` errors + `mapFreeTextToTags` / `foodTagsToTokens` round-trip.
3. `storedValuesFor` + `describeTagUsage` + `placeMatchesOpenFacets` off `tags.open`.
4. `firestore.rules` for `open` + emulator rule probes.
5. Transports (`toFoodPlace` × 2, `createPlace`, `updatePlace`) + corrupt-`open` tolerance.
6. Form preview + suggestions, catalog groups + chips, manager open-facet tables off stored values.
7. Seed validation + migration script dry-run/write + production runbook.
8. Leftover grep + gates + browser smoke per §9.
