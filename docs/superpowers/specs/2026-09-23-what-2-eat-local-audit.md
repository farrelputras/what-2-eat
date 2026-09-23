# What-2-Eat — Local End-to-End Audit (2026-09-23)

- Date: 2026-09-23
- Status: executed, recorded. Re-running this audit is unnecessary unless the
  files listed under "Code under test" change.
- Scope: all six specs in `docs/superpowers/specs/` (design, crud, firebase,
  social-links, auth-bypass, header-footer), verified against local dev with
  `AUTH_BYPASS=true` + Firebase emulators.
- Method: real Chromium browser driven via Playwright (clicks, form fills,
  two-tab realtime, mobile viewport, `Ctrl/Cmd+K`), plus emulator REST probes
  and static checks (`oxlint`, `oxfmt --check`, `tsc --noEmit`, grep).
- Language: English (repo rule for generated docs under `docs/`).

## Environment (as tested)

- `pnpm dev` on `http://localhost:3000` (Next.js 16.3.5, `cacheComponents: true`).
- `firebase emulators:start --only auth,firestore` (auth `9099`, firestore `8080`).
- `pnpm seed:foods` → 17 docs in the app namespace. `seed:foods` now loads
  `.env.local` via `tsx --env-file` (`package.json`), so the seed namespace
  always matches the app namespace.
- Known environment quirk (no code change): the emulator runs in single-project
  mode for one project id while the app uses another, so `firestore.rules`
  hot-reload only reaches the configured namespace. After editing
  `firestore.rules`, either restart the emulator or push the file to the app
  namespace via `PUT /emulator/v1/projects/<id>:securityRules`. Restarting
  wipes emulator data (ephemeral) → reseed afterwards.

## Code under test

- `lib/firebase/{index,admin,server,client}.ts` (incl. uncommitted bypass
  sign-in fix and `connection()` fix from this session's earlier turns)
- `lib/foods/index.ts`, `components/foods/*`, `components/auth/*`
- `components/nav/index.tsx`, `components/footer/index.tsx`
- `app/foods/page.tsx`, `app/(auth)/login/page.tsx`
- `firestore.rules` (fixed during this audit, see finding F-1)
- `package.json` (`seed:foods` one-line change)

## Results

### Auth bypass (spec §7 V2) — PASS

- `/login` auto-redirects to `/foods`; banner `Test mode — auth bypass active,
using emulator data.` renders with `role="status"`.
- List loads 17/17 from the emulator; no console errors or warnings.
- `createdByUid == "test-user"` confirmed on every doc written from the UI
  (checked via emulator REST).
- Server logs `auth bypass active (test-user, emulator)` on first stub use.

### Catalog v1 (design spec §9) — PASS

- All 17 seeds render; `Rice` → 6 of 17 including Yoshinoya; `Rice` + `Pizza`
  → 8 of 17 (OR union, not intersection); active filter has
  `aria-pressed="true"`.
- Search `gacoan` → only Mie Gacoan.
- `Pizza` + `Sushi` pool (3 items) → 5 shuffles all landed inside the pool.
- No-match search → empty state `No matches — remove tags or reset filters`
  - two `Reset filters` buttons; reset restores 17 of 17.
- `/` redirects to `/foods`. Count line keeps `aria-live="polite"`.

### CRUD + validation (crud + firebase specs) — PASS (after fixing F-1)

- Add → dialog closes, toast `Place added.`, card appears, count increments.
- Empty submit → inline `role="alert"` errors: `Place name is required`,
  `Select an area`, `Add at least 1 tag`.
- Area options exactly `Batam` / `Malang` / `Surabaya`.
- Duplicate `yoshinoya` (lowercase) blocked with
  `A place with this name already exists` (case-insensitive).
- `http://` URL blocked with `Link must start with https://`.
- Edit → toast `Changes saved.`; rename to `KFC` blocked as duplicate
  (self excluded by design, other-row duplicate blocked — verified).
- Delete → inline `Delete {name}?` confirm → `Yes, delete` → toast
  `Place removed.`, card gone, count decrements.
- Cancel closes the dialog and creates nothing.
- Area filter `Malang` shows only Malang rows (`5 of 23` at audit time).
- No `createdBy` rendered on any card (grep + visual).

### Social links (social-links spec §§8–11) — PASS (after fixing F-1)

- Card with 1 link renders 1 icon; TikTok absent renders nothing extra.
- Icon link: exact stored `href`, `target="_blank"`,
  `rel="noopener noreferrer"`, `aria-label="Instagram {name}"`.
- Edit prefills stored URLs; adding TikTok yields 2 icons; clearing TikTok
  removes its icon immediately (`deleteField()` path verified).
- Shuffle-result panel shows the same icon as the card.

### Realtime two clients (firebase G3) — PASS

- Tab 2 sees Tab 1's docs on load; doc added in Tab 2 appears in Tab 1
  without refresh (`23 of 23` both tabs); external REST delete propagates to
  the UI without refresh (back to `17 of 17`).

### Header/footer (header-footer spec §9) — PASS except F-2

- Header shows `W2E` brand + auth state only; nav contains exactly one button
  (disabled `Test mode`). No search, cart, `Katalog`, or hamburger at desktop
  (1440px) or mobile (390px) widths.
- `Ctrl+K` and `Cmd+K` open nothing. Tab titles read `W2E` / `%s | W2E`.
- Direct routes resolve: `/foods`, `/search` (`Search | W2E`),
  `/cart` (`Cart | W2E`).
- Footer love line renders on both widths (see F-2 for the exact-copy note).

### Static checks — PASS

- `FOOD_OVERRIDES_STORAGE_KEY` / `FoodOverridesV1`: zero hits in code
  (mentions remain only inside historical spec docs).
- No `localStorage` / `createdBy` in `components/foods`, `lib/foods`,
  `app/foods`.
- `oxlint` exit 0, `oxfmt --check` clean, `tsc --noEmit` clean for all
  touched scopes.
- Bypass prod guard (spec V4): `AUTH_BYPASS=true pnpm build` fails fast at
  config load with `AUTH_BYPASS must not be enabled in production/preview`.

## Findings

- F-1 (blocking, FIXED during audit): `firestore.rules` `hasOnly()` lists for
  `create`/`update` omitted `instagramUrl`/`tiktokUrl`, so every linked
  create/update was denied and the UI showed `Could not save. Please try
again.` — while linkless writes succeeded, which masked the bug. Fixed by
  adding both keys plus optional string/`1..300` guards on both rules; verified
  end-to-end (create/edit/clear-link). ACTION REQUIRED OUTSIDE THIS AUDIT:
  deploy the rules to production (`firebase deploy --only firestore:rules`)
  or linked writes fail identically against the live database.
- F-2 (cosmetic, CLOSED as intended): footer renders `© Made with Love for Farrel &
  Vania ❤️` (`components/footer/index.tsx:27`). Owner confirmed 2026-09-23 the `©`
  prefix is correct as-is; no change.

## Deliberately not covered (manual when needed)

- Bypass V1 (flag off → anonymous `/foods` redirects to `/login`) and V3
  (emulator down → explicit error): both require restarting processes and
  were specified, not executed, to avoid disrupting the running session.
- Real Google login (needs production Firebase + interactive popup).
- Seed URL backfill (spec §15: needs Farrel's real place→URL mapping).
- Area filter shows only areas present in data (`Malang`, `Surabaya` at audit
  time); `Batam` exists in the form enum and a Batam row created during the
  audit rendered correctly.

## Re-verify quickly (no full retest needed)

```bash
firebase emulators:start --only auth,firestore
pnpm dev
pnpm seed:foods   # loads .env.local, targets the emulator automatically
```

Open `http://localhost:3000/login` → expect auto-landing on `/foods` with the
test-mode banner and 17 places. Any regression in the flows above points at
the files under "Code under test".
