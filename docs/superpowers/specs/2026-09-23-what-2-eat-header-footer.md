# What-2-Eat — Header & Footer Adjustment (PRD)

- Date: 2026-09-23
- Status: approved, ready for implementation
- Session scope: PRD only. No implementation.
- Language: English (matches sibling specs).
- Supplements: `2026-09-22-what-2-eat-design.md` (v1 catalog). This doc adjusts the template header/footer chrome for the single-catalog phase; it changes no catalog, CRUD, or commerce semantics.

## 1. Goal

Simplify the storefront chrome: the header shows only the `W2E` brand (+ existing login button), and the footer shows `Made with Love for Farrel & Vania ❤️`. Search, cart, and the `Katalog` nav are hidden but fully restorable; no functionality is deleted.

Success criteria:

- A visitor sees a minimal header: `W2E` brand + login button only — no search button, no cart button, no `Katalog` link (desktop), no hamburger (mobile).
- Pressing `Cmd/Ctrl+K` does nothing (shortcut code preserved, unmounted with the search UI).
- The footer reads exactly `Made with Love for Farrel & Vania ❤️`.
- The browser tab title and metadata use the `W2E` brand.
- Restoring any hidden surface later is uncomment-only (plus one array entry for the nav).
- `pnpm lint` and `pnpm build` pass.

## 2. Non-goals

- No deletion of search, cart, or nav components, routes, handlers, or state (`search-modal.tsx`, `cart.tsx`, `cart-client.tsx`, `CartProviderWrapper`, `/api/cart` all stay).
- No changes to template/docs references to "Vercel Shop" (`README.md`, `docs/`, `app/md/route.ts`).
- No new env vars (no `.env.example` change).
- No i18n or string catalog; copy stays inline.
- No visual redesign beyond the specified changes.

## 3. Locked decisions (from review session)

| Decision | Choice | Why |
|---|---|---|
| Footer | Replace the copyright line entirely | The love line *is* the footer for this phase; keeping `© ... All rights reserved.` beside it dilutes the intent. |
| `Cmd/Ctrl+K` shortcut | Disabled via comment (unmounted with `SearchModal`) | A hidden button with a live shortcut is undiscoverable behavior. Code stays in tree, so re-enable is free. |
| Brand scope | Central `shopConfig.site.name` change, tab + metadata follow | One source of truth; hardcoding `W2E` in the nav would fork the brand and drift. |
| Mobile hamburger | Hidden while nav is empty | An empty hamburger opening an empty sheet is worse than no hamburger. Guarded render restores it automatically when an item returns. |

## 4. Current-state facts (verified in tree)

- Brand: `components/nav/index.tsx:28-30` renders `{shopConfig.site.name}`; value is `"Vercel Shop"` in `lib/config/index.ts:66`. The same value feeds tab title/metadata (`app/layout.tsx:70-84`) and footer copyright (`components/footer/index.tsx:26-28`).
- Nav items: `components/nav/index.tsx:17-19` holds a single entry (`Katalog` → `/foods`), consumed by `QuickLinks` (desktop, `quick-links.tsx:31`) and `MobileMenu` (hamburger, `mobile-menu.tsx:44`).
- Search block: `components/nav/index.tsx:35-43` (`shopConfig.search.isEnabled` + `PredictiveSearchProvider` + `SearchModal`). Shortcut lives inside `SearchModal` (`search-modal.tsx:26-35`).
- Cart block: `components/nav/index.tsx:50-52` (`Suspense` + `CartIcon` → `cart.tsx` → `cart-client.tsx`; state via `CartProviderWrapper` in `app/layout.tsx:50`).
- Footer: `components/footer/index.tsx:26-28` renders `` © {site.name}. All rights reserved. ``; `socialLinks` and `items` are empty arrays, so only the copyright line + `policies` links render.
- Repo rules that constrain the build: `components/ui/` takes primitive props only; copy inline and server-first; `Page` + `Sections` + `Container` spacing contract; terse one-line guardrail comments only.

## 5. Critique — why this shape, and what it costs

1. **Comment-out beats delete for search/cart.** Deletion is cleaner but irreversible without history spelunking; commenting keeps the working JSX, provider wiring, and imports in place. The cost (a few dead lines + a lint suppression for unused imports) is bounded and explicitly marked for future removal or restoration.
2. **Empty-array + guard beats deleting nav components.** `QuickLinks` and `MobileMenu` are generic over `items`; feeding `[]` with a length guard hides both desktop and mobile chrome in one expression. Re-adding one entry restores both breakpoints at once.
3. **Central brand rename is a deliberate broadcast.** `site.name` feeds header, footer, metadata, and schema. Changing it once is the smallest diff; the accepted side effect (tab title becomes `W2E`) is the desired outcome, not leakage.

## 6. Functional requirements

### 6.1 Header — hide search & cart

- Comment out the search block (`nav/index.tsx:35-43`) and the cart block (`nav/index.tsx:50-52`) with a one-line guardrail comment each stating the hide is intentional and how to restore.
- Keep all imports (`SearchModal`, `CartIcon`, `CartIconFallback`, `PredictiveSearchProvider`, etc.). Suppress the resulting unused-import lint with a targeted disable, not by deleting imports.
- Do not touch `search-modal.tsx`, `cart.tsx`, `cart-client.tsx`, `layout.tsx`, or cart handlers.

### 6.2 Brand — `Vercel Shop` → `W2E`

- One-line change in `lib/config/index.ts:66`: `name: "W2E"`.
- `nav/index.tsx` keeps reading `shopConfig.site.name` (no hardcode).

### 6.3 Nav — hide `Katalog`

- Set `items` in `nav/index.tsx:17-19` to an empty array with a one-line comment (`Katalog` hidden for the single-nav phase; restore by re-adding the entry).
- Guard both consumers: `{items.length > 0 && <QuickLinks ... />}` and `{items.length > 0 && <MobileMenu ... />}` so the mobile hamburger disappears with the empty nav.

### 6.4 Footer

- Replace the `<p>` copyright content (`footer/index.tsx:26-28`) with exactly `Made with Love for Farrel & Vania ❤️`.
- Keep `policies.map` and `SocialLinks` logic untouched.
- Copy is inline in the component; no string catalog, no `t()` runtime.

## 7. UX specification

- **Placement:** existing header/footer geometry only. No `Page`/`Sections`/`Container` changes; footer `flex justify-between` structure stays.
- **Copy:** inline English beside consuming components.
- **A11y:** skip-link, landmarks, and heading structure unchanged. Hiding interactive elements removes them from the tab order entirely (no focus traps on hidden controls).
- **Layout:** header keeps `h-16` row; footer keeps current padding (`pt-20 pb-10`). No new spacing values.

## 8. Edge cases (acceptance-relevant)

1. Desktop ≥ `md`: no `Katalog` text, no search icon, no cart icon.
2. Mobile: no hamburger button; opening via swipe/keyboard is impossible (component unmounted, not CSS-hidden).
3. `Cmd/Ctrl+K` and `Ctrl+K` do nothing on any page while search is hidden.
4. Direct routes still resolve (`/foods`, `/search`, `/cart`) — hidden chrome does not block URLs.
5. Cart state provider still mounts (no crash from unmounted `CartIcon`); `CartUI` drawer unaffected.
6. Footer renders the love line once, on desktop and mobile, with policies links if/when configured.
7. Tab title reads `W2E` (default) / `%s | W2E` (subpages).

## 9. Acceptance checklist

- [ ] Header shows `W2E` + login button only (desktop + mobile widths).
- [ ] No search button, no cart button visible at any breakpoint.
- [ ] `Cmd/Ctrl+K` is inert.
- [ ] No `Katalog` link (desktop) and no hamburger (mobile).
- [ ] Footer reads exactly `Made with Love for Farrel & Vania ❤️`.
- [ ] Search/cart/nav code still present in tree (commented, not deleted) — verified by grep.
- [ ] No regression: login flow, `/foods` catalog, direct `/search` + `/cart` routes load.
- [ ] `pnpm lint` and `pnpm build` green.

## 10. Build sketch (for the implementation session, not this one)

- `lib/config/index.ts` — `name: "W2E"` (one line).
- `components/nav/index.tsx` — comment out search + cart blocks with restore comments; `items = []`; length guards on `QuickLinks` + `MobileMenu`; targeted lint suppression for kept imports.
- `components/footer/index.tsx` — replace `<p>` content with the love line.
- Nothing else.

## 11. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Unused imports fail `oxlint` | Targeted disable comment next to the kept imports; re-enable path documented in the restore comment. |
| Guard forgotten → empty hamburger sheet | Length-guard requirement (FR §6.3) + mobile acceptance item. |
| `site.name` broadcast surprises (metadata/schema) | Accepted by stakeholder (locked decision); verified via tab-title acceptance item. |
| Hidden-but-live routes confuse QA (`/search` still works) | Declared in edge cases (§8.4); hiding chrome is not route removal. |

## 12. Step → verification (implementation session)

1. Config rename → `pnpm build`, confirm tab title + header brand read `W2E`.
2. Nav edits (comment-outs + empty items + guards) → `pnpm lint`, real-browser desktop + mobile check, `Cmd+K` inert check, grep confirms code preserved.
3. Footer copy swap → visual check desktop + mobile, no layout shift.
4. Full `pnpm lint` + `pnpm build` → green before close. Rollback is revert of the 3 files.
