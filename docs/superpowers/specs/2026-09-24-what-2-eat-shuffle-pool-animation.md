# What-2-Eat — Selected-pool Shuffle + Reel Reveal

- Date: 2026-09-24
- Status: Implemented 2026-09-24 (commits `8b6867e`, `c5acea7`, `d0d39a8`, `3869058`).
- Language: English.
- Supplements: `2026-09-22-what-2-eat-design.md` (shuffle-from-filtered semantics), `2026-09-22-what-2-eat-crud.md` (shuffle panel + `aria-live` behavior), `2026-09-24-what-2-eat-nested-tags.md` (pool/count operate on the filtered set).
- Locked decisions (from planning session 2026-09-24, as amended during build): selection is a toggle button per card (not whole-card click, not a literal checkbox look) / default is opt-out — all filtered places start in the pool / animation is a reel-slider (~1.7s) that streams pool names past a center marker, overshoots, and settles on the winner, landing in the existing winner panel / selection is session in-memory only, no persistence / post-win "remove winner from pool" is deferred to v1.1 / single-candidate pool resolves instantly with no theater spin.
- Session scope: PRD + implementation. Follow-ups during build: unselected cards use a dashed border (selected keeps the normal border); a `Result` heading sits between the winner panel and the results grid; Select-all/Clear-pool are scoped to the visible filter.

## 1. Goal

Make the random chooser feel like a decision ritual instead of an instant swap: the visitor curates a pool by tapping cards in or out, then hits shuffle and watches a short reel-slider draw slow down onto one winner in the existing result panel.

Success criteria:

- A visitor deselects two cards and 5 shuffles always land inside the remaining pool, never on a deselected place.
- A visitor with an empty pool sees shuffle disabled with a "select at least 1 place" hint, not a silent no-op.
- A shuffle plays a ~1.7s reel that streams pool names past a center marker, coasts past the winner, settles back onto it, then lands on the winner panel (name, badges, areas, social links) with a Shuffle-again button, exactly today's panel content. The centered name at settle always equals the landed winner.
- With `prefers-reduced-motion: reduce`, shuffle resolves instantly with no reel and no toggle pulse.
- `pnpm lint`, `pnpm format --check`, and `pnpm typecheck` pass; filters, CRUD, counts, and toasts behave as today.

## 2. Non-goals

- No spin wheel, no card-deck cascade, no confetti, no sound. A reel-slider was chosen over both a spin wheel (breaks past ~12 slices, cramped on mobile) and random name cycling (last shown name had no relation to the landed winner, defeating the anticipation).
- No selection persistence (no localStorage, no Firestore field). Pool is transient session state; reload resets to all-filtered-included.
- No "remove winner from pool" button (deferred to v1.1 as the natural post-win action).
- No fairness/RNG upgrade: the outcome stays one `pickRandomFood(pool)` call drawn upfront; the reel is theater that animates toward it, not a draw.
- No filter, catalog, schema, rules, or seed changes. No new dependencies — Tailwind + `tw-animate-css` (already installed) is enough.
- No `t()` runtime or next-intl; copy stays inline and server-first per repo rules.

## 3. Current-state facts (verified in tree)

- Shuffle draws from the **filtered** list, instantly: `handleShuffle()` → `pickRandomFood(filtered)?.id` (`components/foods/foods-catalog-client.tsx:290-292`); `pickRandomFood` is one uniform draw (`lib/foods/index.ts:570-573`).
- There is **no selection concept**: no `selectedIds`/`excludedIds` state, no toggle UI, no pool count. The only count is `filtered.length of foods.length` (`foods-catalog-client.tsx:435-437`).
- Any filter/search/area change clears the winner (`setPickedId(null)` in `toggleIn`, `toggleOpenFacet`, `handleSearch`, `handleArea`, `handleReset` — `foods-catalog-client.tsx:262-305`).
- Winner panel is an `aria-live="polite"` card with name, `FoodBadges`, area badges, `FoodSocialLinks`, and a Shuffle-again button (`foods-catalog-client.tsx:459-482`). Edit/delete of the winning row clears or updates the panel (`foods-catalog-client.tsx:350`).
- Cards already contain nested interactives (Edit/Delete icon buttons, IG/TikTok links — `foods-catalog-client.tsx:494-548`), which rules out whole-card click targets.
- Stack: client component `"use client"` with `useState`/`useMemo` (`foods-catalog-client.tsx:1-158`); `sonner` for toasts; `lucide-react` icons; no animation library beyond Tailwind.

## 4. Critique — the three load-bearing choices and what they cost

1. **Exclusion set, not selection set.** "All filtered selected by default" is cheapest as `excludedIds: Set<string>` with `pool = filtered.filter(p => !excluded.has(p.id))`: newcomers from filter changes are auto-included with zero sync effects. An explicit `selectedIds` set would need an effect backfilling on every foods/filter change — the classic stale-sync bug source. Cost: "pool size" is derived, so copy must be written carefully (`N of M in pool`); and Select-all/Clear-pool must be scoped to the visible filter (remove/add only filtered ids) or they silently rewrite exclusions outside it.
2. **Dedicated toggle button, not card click, not bare highlight.** Whole-card toggle breaks nested-interactive HTML (Edit/Delete/links already live in cards) and causes mobile mis-taps. Color-only highlight fails non-color-indicator and screen-reader requirements. So: a real toggle button (`aria-pressed`, check/plus icon, dimmed + dashed deselected card) rather than a form checkbox. In-pool cards keep the normal border; out-of-pool cards get `border-dashed` + dimming. The aesthetic wish is kept; the accessibility contract is non-negotiable.
3. **Reel-slider with cancel-on-change (replaces name cycling).** Name cycling was cut because each tick was an independent draw uncorrelated with the landing — the last shown name never predicted the winner. The reel draws the winner once upfront, then streams a fixed-length strip (~28 pool-cycled names + 4 trailing entries) past a center marker with an overshoot easing (`cubic-bezier(0.34, 1.25, 0.64, 1)`, ~1.7s), coasting past the winner and settling back onto it. Fixed item widths make the landing math exact and scale 2→200 pools. The invariant that makes it shippable: **any filter/search/area/select/reset action unmounts the reel and clears the pending result**, so an impossible winner (outside the new pool) can never land. The transition's `transitionend` lands the winner with a fallback timeout; both clean up on unmount. Single-candidate pools skip the theater — spinning to a predetermined outcome feels dishonest.

## 5. Feature 1 — selected-only pool

State (in `FoodsCatalogClient`):

```ts
const [excludedIds, setExcludedIds] = useState<Set<string>>(new Set());
const pool = useMemo(
  () => filtered.filter((place) => !excludedIds.has(place.id)),
  [filtered, excludedIds],
);
```

- **Toggle:** per-card button beside the Edit/Delete actions with a check/plus icon. `toggleExclude(id)` flips membership and cancels any running spin (per §6 rule 4). Selected card: normal border; deselected: dashed border + dimmed (`border-dashed opacity-60 saturate-50`) + toggle shows "add back" state (also `border-dashed`). Toggle plays a ~150ms scale pulse (skipped under reduced motion).
- **Accessible contract:** `aria-pressed={inPool}` + `aria-label="Remove {name} from shuffle pool"` / `"Add {name} to shuffle pool"`. Keyboard-focusable in card tab order; focus ring visible.
- **Toolbar:** keep the existing `M of total places` line; add `N in shuffle pool` + `Select all` (removes only visible filtered ids from the set) / `Clear pool` (unions visible filtered ids into the set) text buttons beside Reset. Select-all disables when the whole visible filter is already in the pool (`pool.length === filtered.length`). `Reset filters` also clears `excludedIds`.
- **Result heading:** an `h2` "Result" sits between the shuffle/winner section and the results grid (hidden when there are no matches).
- **Delete pruning:** when a place is deleted, remove its id from `excludedIds`; if it was the active winner, clear the winner (extends today's `pickedId` clearing).
- **Add place:** new places start included (nothing to do — exclusion set only holds explicit opt-outs).
- **Empty pool:** shuffle buttons disabled + inline hint "Select at least 1 place to shuffle". Single-item pool: shuffle enabled, resolves instantly (§6 rule 5).

## 6. Feature 2 — reel-slider reveal

State machine in the client + carved-out leaf (`ShuffleReel`, see §8): `idle → spinning → landed`.

- **Spinning:** one `pickRandomFood(pool)` draw decides the winner upfront; `buildReel(pool, winner)` builds a ~28-item strip (pool names cycled from a random offset, second-to-last ≠ winner, winner at index 27, 4 trailing entries after it). The leaf renders fixed-`w-40` cells in an `overflow-hidden` track with a center marker and edge fade masks, and animates `translateX` from 0 to winner-centered over ~1.7s with an overshoot easing (`cubic-bezier(0.34, 1.25, 0.64, 1)`), so the strip coasts ~2 entries past the winner and settles back onto it. Fixed-min-height container matches the winner panel geometry (no layout shift). Strip content is `aria-hidden="true"` inside a `role="status"` container — the live region must never announce intermediate names.
- **Landing:** `transitionend` (plus a `durationMs + 400` fallback timeout for hidden tabs) calls `onLand`, which sets `setPickedId(winner.id)` and renders today's panel unchanged (name, `FoodBadges`, areas, `FoodSocialLinks`, Shuffle again) plus a one-shot land emphasis (fade/slide-in once, no loop).
- **Rules:**
  1. Shuffle + Shuffle-again disabled while spinning.
  2. `prefers-reduced-motion: reduce` (via `matchMedia`) → skip the reel and pulse, resolve instantly.
  3. Single-candidate pool → resolve instantly, no theater.
  4. Filter/search/area/select/reset/unmount cancels the spin: unmount the reel (listener + fallback clean up), return to `idle`, clear the pending result. The winner never lands from a stale pool.
  5. Double-clicking shuffle cannot stack reels (guard on `spinning`; each spin remounts the leaf via a `spinId` key).
- **Fairness note:** the strip is display-only; the outcome is exactly one uniform draw over the pool at shuffle time. No seeded/RNG changes.

## 7. Copy (inline, server-first)

- Count line: keep `X of Y places`; add `N in shuffle pool` adjacent.
- Empty pool hint: `Select at least 1 place to shuffle`.
- Toggle labels per §5; spinning reel gets `role="status"` visual only with `aria-hidden` strip content, winner keeps the existing `aria-live="polite"` announcement (`Your random pick: {name}`).
- Added `Result` (`h2`) between the shuffle/winner section and the results grid; no copy changes on `/foods` heading or filter groups.

## 8. Files touched (as-built)

- `components/foods/foods-catalog-client.tsx` — `excludedIds` state, `pool` memo, toggle UI + pulse, pool count + filter-scoped Select-all/Clear buttons, `Result` heading, draw-upfront shuffle + `onLand` + cancellation wiring.
- `components/foods/shuffle-reveal-client.tsx` (new) — `ShuffleReel` leaf: strip layout, overshoot transition, `transitionend` + fallback landing, unmount cleanup. Client–client split keeps the `-client` suffix convention; no directive split needed.
- `lib/foods/index.ts` — unchanged (`pickRandomFood`, `filterFoods`, catalogs as-is).
- No route, Firestore rules, seed, or `app/foods/tags` changes. No new dependencies.

## 9. Acceptance checklist (probed 2026-09-24 in a real browser against emulator data)

- [x] Deselect 2 of 5 → spins land inside the remaining pool; deselected names never appear as winner.
- [x] Empty pool → both shuffle buttons disabled + hint visible; selecting 1 re-enables.
- [x] Single-item pool → instant result, no reel.
- [x] Shuffle plays a ~1.7s reel with overshoot settle; centered name at settle always equals the landed winner; today's panel content with working Shuffle-again.
- [x] Changing any filter/search/area/selection mid-spin cancels cleanly; no stale winner, no leaked fallback landing, no console errors.
- [x] `prefers-reduced-motion` (emulated) → instant resolve, no reel. Keyboard-only flow and screen-reader announcement of intermediate names not probed with AT — code review only (`aria-hidden` strip, `aria-pressed` toggles).
- [x] Delete prunes `excludedIds`; deleting the winner clears the panel; Reset clears exclusions; new places start included.
- [x] Select-all/Clear-pool scoped to the visible filter: outside-filter exclusions survive both actions (probed: exclude → filter → select-all/clear → unfilter).
- [x] No regression: search, facet filtering, area select, CRUD, toasts, counts. `oxlint` (0 errors), `oxfmt --check`, `tsc --noEmit` pass on touched files.

## 10. Implementation order (as executed)

1. Pool state + toggle UI + counts + empty/single-pool semantics (shuffle instant, drawn from `pool`); probed §9 rows 1–2, 7. (`8b6867e`)
2. Dashed unselected state + `Result` heading. (`c5acea7`)
3. Select-all/Clear-pool scoped to the visible filter. (`d0d39a8`)
4. Reel-slider reveal with overshoot settle + leaf carve-out; full §9 pass. (`3869058`)
