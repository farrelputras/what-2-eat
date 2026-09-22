# What-2-Eat v1 — Food Catalog (Design / PRD)

- Date: 2026-09-22
- Status: draft, pending Farrel's review
- Session scope: PRD only. No implementation.
- Language: English (translated from the original Indonesian).
- Note: the CRUD deferral in §§2 and 10 is superseded by `2026-09-22-what-2-eat-crud.md` (localStorage-backed CRUD, public, single entity).

## 1. Goal

In <30 seconds Farrel can answer "what to eat?" via tag + area filters or a shuffle button.

Success criteria:

- Tag filter (OR) + name search + area filter work and stay consistent with shuffle.
- Shuffle only draws from the currently filtered results.
- Clear empty state + working reset button.
- `pnpm build` passes without Shopify env.

## 2. Non-goals v1

- CRUD UI (add/edit/delete by editing `foods.json` + commit).
- Database, auth, photos, prices, ratings, Maps links, opening hours.
- Shopify cart/checkout, Eve agent, i18n/Markets.

## 3. Template context (architecture decisions)

This project is the Vercel Shop e-commerce template (Next.js 16 + Shopify Hydrogen SDK + cart/checkout + Eve agent). Overkill for a personal catalog, but decided: **use what exists, disable what is unneeded, delete nothing.**

Meaning for v1:

- `shopConfig.auth.isEnabled = false`, `agent.isEnabled = false`.
- New routes do not call Shopify operations.
- Navigation points at the catalog. No Shopify/cart/Eve files deleted in v1 (consequence: bundle/lint still carry those leftovers).

## 4. Data model

```ts
type FoodPlace = {
  id: string; // slug, e.g. "soto-cak-har"
  name: string;
  tags: string[]; // 2-5 per place
  area: string; // v1 always "surabaya" (city-level)
};
```

- `TAG_CATALOG` = union of all `tags` in the seed, sorted. The initial canonical list derives from the 17 seeds; new entries may bring new tag strings (hybrid: canonical but extensible).
- Tag rules: single word, Title Case, no meaning duplicates (use `Noodles`, not `Noodle`/`Mie` interchangeably).
- Tag = aggregate of every dish at one place. Filter `Rice` + `Beef` (OR) = "places selling either one", not "one dish containing both".

## 5. Seed data (17 places, all `area: "surabaya"`)

| id | name | tags |
|---|---|---|
| yoshinoya | Yoshinoya | Rice, Beef, Chicken, Japanese |
| dikichi | Dikichi | Chicken, Japanese, Rice |
| selamat-sukses | Selamat Sukses (Kecombrang) | Rice, Indonesian |
| subway | Subway | Sandwich, Chicken, Beef, Western |
| greenly | Greenly | Salad, Healthy, Western |
| dominos-pizza | Domino's Pizza | Pizza, Western |
| pizza-hut | Pizza Hut | Pizza, Pasta, Western |
| warkam | Warkam | Rice, Noodles, Indonesian |
| j-one | J-One | Japanese |
| soto-cak-har | Soto Cak Har | Soto, Soup, Chicken, Indonesian |
| mie-gacoan | Mie Gacoan | Noodles, Spicy, Indonesian |
| uncle-w | Uncle W | Rice, Chinese |
| mcdonalds | McDonald's | Burger, Chicken, Fast Food, Western |
| kfc | KFC | Chicken, Burger, Fast Food |
| sushi-go | Sushi Go! | Sushi, Japanese, Rice |
| aeon | AEON | Food Court, Japanese |
| taria | Taria | Coffee |

Note: some tags above are initial guesses and unverified (Dikichi, Warkam, J-One, Uncle W, AEON, Taria). Farrel will correct them himself after rollout.

## 6. UX v1 (single `/foods` page)

1. Name search (contains, case-insensitive) + multi-select tags (OR) + single-select area (v1 holds only Surabaya; kept as foundation for Malang) + result count.
2. **Static** grid cards — clicks go nowhere, no detail page in v1. Card = name + tag chips + area.
3. A "Pilih acak dari hasil ini" ("Pick random from these results") button shows 1 result prominently + a re-shuffle button. Shuffle draws from the currently filtered array, not the whole dataset.
4. Empty state: "Tidak ada yang cocok — kurangi tag / reset filter" ("No matches — drop some tags / reset filters") + reset button.

## 7. Routing

- The catalog page lives at `/foods`.
- The old `app/page.tsx` is **kept but unused**: it redirects to `/foods` so first open lands straight in the catalog.

## 8. File plan (used at build time, not this session)

- `lib/foods/types.ts` — `FoodPlace`, `TAG_CATALOG`.
- `lib/foods/index.ts` — pure helpers: OR filter, search, shuffle, tag-catalog derivation. Safe to import from server and client alike.
- `lib/foods/server.ts` — reads the JSON seed (static import or light `"use cache"`; decided at build).
- `lib/foods/data/foods.json` — the 17 seeds above.
- `app/foods/page.tsx` — Server Component, catalog shell composition.
- Catalog components under `components/foods/`, following template conventions (`components/ui/` takes primitive props only).

## 9. Acceptance v1

- [ ] All 17 seeds render; `Rice` filter shows Yoshinoya; `Rice` + `Pizza` (OR) shows the union, not the intersection.
- [ ] Search "gacoan" shows only Mie Gacoan.
- [ ] 5 shuffles from a 3-item filtered result always yield one of those 3, never an outsider.
- [ ] 0 results show the empty state + reset works.
- [ ] `pnpm build` passes without `.env` Shopify.

## 10. Risks / deferred items

- Shopify/cart/Eve leftovers stay in the repo (not deleted) — deliberate v1 tech debt.
- CRUD UI deferred: without a database, a CRUD UI will not persist on Vercel/Netlify. Backend architecture (DB vs. git-based) to be decided in a later phase once the frontend is visible. (Superseded: see `2026-09-22-what-2-eat-crud.md` — localStorage-backed CRUD.)
- Single-value area filter in v1 — deliberate as foundation, not as a useful feature today.
