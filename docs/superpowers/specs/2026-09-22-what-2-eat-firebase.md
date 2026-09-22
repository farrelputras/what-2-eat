# What-2-Eat — Firebase Auth + Firestore (PRD)

- Date: 2026-09-22
- Status: draft locked (ready for implementation)
- Session scope: PRD only. No implementation.
- Language: English (matches sibling specs; UI copy stays inline English per repo rule).
- Supplements: `2026-09-22-what-2-eat-design.md` (v1 catalog) and `2026-09-22-what-2-eat-crud.md` (device-local CRUD). This doc supersedes the CRUD spec's storage decision (localStorage → Firestore) and its public/no-login access model (→ login-required, global shared). Firebase env and init are done together in the coding session.

## 1. Background

The `/foods` page today reads `lib/foods/data/foods.json` (17 rows) and stores user
changes in `localStorage` (`what2eat.foods.v1`, `FoodOverridesV1` model).
Data diverges per device, never syncs, cannot be shared.

Requirement: 2 simultaneous users viewing and editing the same catalog in realtime.
Solution: Firebase Authentication (Google-only) + Cloud Firestore.
Recorded justification: multi-user sync makes Firebase necessary, not overkill.

Locked decisions:

1. Catalog is **global shared** — every logged-in user can read/write/delete.
2. **Login required to read** — anonymous visitors cannot see `/foods`.
3. `createdBy` lives in the database only, never rendered on cards.
4. `localStorage` removed entirely (no import, no fallback).
5. **Google-only** login.
6. Firebase env and init are done together in the coding session (that part is TBD in this PRD).

## 2. Goals and non-goals

Goals:

- G1: Google login, session survives refresh.
- G2: Global catalog CRUD persisted in Firestore.
- G3: 2 logged-in users see each other's changes in < 2 seconds without refresh.
- G4: Remove the entire `localStorage` path (code, types, key).
- G5: Catalog UX unchanged (search, tag/area filter, shuffle, add/edit dialog, two-click delete confirm, English toasts).

Non-goals (v1):

- Admin / owner-only / moderation roles.
- Server full-text search, cursor pagination, composite indexes.
- Offline-write queue, multi-language, areas outside the `batam|malang|surabaya` enum.
- Legacy `localStorage` data migration (discarded, fresh start from Firestore seed).
- Shopify Customer Account (`lib/auth/`, `proxy.ts`, `app/account/` untouched).

## 3. Users and scenarios

- Users A and B, each logged in with Google on a different device/browser.
- Main scenario: A adds a place → B sees it appear without refresh. B deletes a place →
  A sees it disappear without refresh. A edits → B sees the new name/tags/area.
- Gate scenario: anonymous opens `/` → redirects to `/foods` (existing) → redirects to `/login`.
  After login → back to `/foods`.

## 4. Functional requirements

### FR-1: Auth

- FR-1.1: `/login` contains a single "Sign in with Google" button.
- FR-1.2: Successful login creates an HttpOnly session cookie (`__session`), not just
  in-memory state, so refresh does not log out.
- FR-1.3: Logout clears the session cookie; accessing `/foods` after logout redirects to `/login`.
- FR-1.4: Failed login shows an English error toast, no half-way redirect.
- FR-1.5: Nav shows login state (name/avatar + sign-out button when logged in).

### FR-2: Read gate

- FR-2.1: `GET /foods` without a valid session → `redirect("/login")` on the server.
- FR-2.2: `GET /foods` with a valid session → first paint from a server fetch (Admin SDK),
  then the client subscribes realtime.
- FR-2.3: Firestore Rules reject anonymous `read` (second layer behind the server gate).
- FR-2.4: The `/foods` page is dynamic (excluded from public Next cache).

### FR-3: CRUD + sync

- FR-3.1: Add/edit/delete are only reachable when logged in (the gate guarantees this,
  so buttons need no anonymous state).
- FR-3.2: Client validation reuses existing functions: `validateFoodInput`, `normalize*`,
  existing English error messages ("Place name is required", "Maximum 8 tags", etc.)
  plus the duplicate-name check.
- FR-3.3: Writes go through the Firebase Client SDK directly to `food_places` (not Server Actions),
  so `onSnapshot` propagates changes to both users without refresh.
- FR-3.4: Filter/search/shuffle keep using the existing `filterFoods` and `pickRandomFood`
  over live data (no complex server queries in v1).
- FR-3.5: Delete-by-anyone is a conscious accepted risk: any user may delete any doc.
  The existing two-click delete confirm is kept.
- FR-3.6: `createdByUid` is written on create, never rendered on cards.

### FR-4: Remove localStorage

- FR-4.1: Delete `lib/foods/client.ts` (`useFoods`), `FOOD_OVERRIDES_STORAGE_KEY`,
  the `FoodOverridesV1` type, and the `mergeFoods`-overrides path.
- FR-4.2: `grep FOOD_OVERRIDES_STORAGE_KEY` returns zero hits when done.
- FR-4.3: Kept functions: `validateFoodInput`, `normalize*`, `filterFoods`,
  `deriveTagCatalog`, `deriveAreaCatalog`, `pickRandomFood`, `slugFoodId`, `FOOD_AREAS`.

## 5. Data model

Collection: `food_places`. Doc ID = `slugFoodId(name)` (existing function, `slug-rand4` format).

| Field          | Type         | Notes                                                               |
| -------------- | ------------ | ------------------------------------------------------------------- |
| `name`         | string 1..80 | trimmed, whitespace collapsed (`normalizeFoodName`)                 |
| `area`         | enum         | `batam` \| `malang` \| `surabaya` (lowercase)                       |
| `tags`         | string[1..8] | each tag 1..24 chars, case-insensitive unique (`normalizeFoodTags`) |
| `createdByUid` | string       | `request.auth.uid` at create; internal, never rendered              |
| `createdAt`    | Timestamp    | `serverTimestamp()`                                                 |
| `updatedAt`    | Timestamp    | `serverTimestamp()`, bumped on every edit                           |

No `id` field inside the doc (ID = doc ID). No `createdByName` (decision: minimize PII).
Initial seed: 17 rows from `lib/foods/data/foods.json` + `createdByUid: "seed"`, duplicate-name
check before writing.

## 6. Architecture

```
Client Google login → getIdToken → POST /api/auth/session
  → Admin SDK verifyIdToken + createSessionCookie → Set-Cookie __session (HttpOnly)
/foods (server): verifySessionCookie → no session redirects to /login
  → fetch initial list via Admin SDK (first paint)
/foods (client): onSnapshot(food_places) → live list for both users
  → writes via Client SDK (addDoc/setDoc/deleteDoc + serverTimestamp)
  → zod validation on client + Rules on server
```

Server role narrowed: issue/verify session cookie, gate + first paint, one-off seed.
No write Server Actions in v1 (reason: two-way realtime without revalidate plumbing).
`proxy.ts`, `lib/auth/` (Shopify), `app/account/` untouched — Firebase identity lives
in `lib/firebase/` on its own.

File split follows repo convention (`lib/<domain>/{index,server,client,action}.ts`,
no barrel files, primitive props in `components/ui/`):

Add:

- `lib/firebase/client.ts` (`"use client"`): app/auth init, `signInWithGoogle`, `signOutUser`,
  `subscribeFoodPlaces`, `create/update/removePlace`.
- `lib/firebase/server.ts`: read `__session` cookie, `verifySessionCookie`,
  `fetchFoodPlacesInitial`.
- `lib/firebase/admin.ts`: lazy Admin SDK init (emulator vs prod guard).
- `app/(auth)/login/page.tsx`: login page.
- `app/api/auth/session/route.ts`: POST (create cookie), DELETE (clear cookie).
- `components/auth/login-button-client.tsx`, `components/auth/logout-button-client.tsx`.
- `scripts/seed-foods.ts`: one-off 17-row seed.

Change:

- `app/foods/page.tsx`: async, session gate, initial fetch, pass down to catalog.
- `components/foods/foods-catalog-client.tsx`: accept `initialFoods`, subscribe live,
  drop `useFoods`.
- `.env.example`: new env rows + comments (repo rule: every `process.env.X` needs one).
- `next.config.ts`: add remotePatterns only if Google profile photos render in Nav.

Delete: `lib/foods/client.ts` and all overrides symbols (§FR-4).

## 7. Security

Rules (final draft, matching the delete-by-anyone + login-required-to-read decisions):

```text
match /food_places/{id} {
  allow read: if request.auth != null;
  allow create, update: if request.auth != null
    && request.resource.data.keys().hasOnly(
      ["area", "name", "tags", "createdByUid", "createdAt", "updatedAt"])
    && request.resource.data.name is string
    && request.resource.data.area in ["batam", "malang", "surabaya"]
    && request.resource.data.tags.size() >= 1
    && request.resource.data.tags.size() <= 8
    && request.resource.data.createdByUid == request.auth.uid;
  allow delete: if request.auth != null;
}
```

Conscious note: `delete` is loose for 2 mutually trusting users. Mitigation without changing
the decision: two-click confirm + Firestore backup/PITR enabled in console.
No display PII: `createdByUid` is console forensics only.

## 8. UX specification

- `/login`: title + one Google button + error toast. Copy inline in the component.
- `/foods` gated: anonymous never sees the catalog shell (server redirect).
- Authenticated: catalog layout identical to today; other-user updates appear
  automatically; `aria-live` on count and shuffle result kept.
- Nav: login/logout state; logging out from `/foods` → `/login`.
- Success/failure toasts stay English as today
  ("Place added.", "Changes saved.", "Place removed.").

## 9. Environment (filled together in the coding session)

Required keys (final names + values filled in-session):

```
NEXT_PUBLIC_FIREBASE_API_KEY / _AUTH_DOMAIN / _PROJECT_ID /
_STORAGE_BUCKET / _MESSAGING_SENDER_ID / _APP_ID
FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY
```

Rules: Admin keys are server-only (never imported into a client boundary),
every key gets a `.env.example` row + comment on when to set it. Emulator vs prod
distinguished in `lib/firebase/admin.ts`.

## 10. Migration and seed

1. Create Firebase project + enable Google provider + Firestore (region recorded in-session).
2. Run `scripts/seed-foods.ts` → 17 docs, verify count + no duplicate names.
3. Deploy §7 Rules to emulator first, then prod.
4. Delete the localStorage path (§FR-4). `foods.json` stays as archive/seed, not a runtime read source.

## 11. Acceptance checklist

- [ ] Incognito opens `/foods` → redirects to `/login`.
- [ ] Google login → lands on `/foods`, refresh stays logged in, HttpOnly `__session` cookie present.
- [ ] Logout → opening `/foods` redirects to `/login` again.
- [ ] 2 browsers (different accounts) add/edit/delete in turns → other side updates < 2 seconds without refresh, counts consistent.
- [ ] Duplicate name, empty name, > 8 tags rejected with the existing English messages.
- [ ] Anonymous direct Firestore reads/writes rejected by Rules.
- [ ] Cards never display `createdBy` in any form.
- [ ] `grep FOOD_OVERRIDES_STORAGE_KEY` returns zero hits.
- [ ] `pnpm lint`, `pnpm typecheck` (scope `lib/foods|lib/firebase|app/foods`), `pnpm build` green.

## 12. Step → verification (implementation session)

1. Emulator + Google provider → manual login/logout in emulator.
2. Rules in emulator → 3 reject cases: anonymous read, anonymous write, 9 tags.
3. Session + gate → redirect matrix (§11, first 3 rows).
4. Realtime 2 browsers → add on A appears on B, delete on B disappears on A.
5. Seed 17 → console count + existing filter/tag/area correctness.
6. Cleanup + lint/typecheck/build → §11 last row.
7. Mass-delete risk test (accepted risk) → actor traceable via `createdByUid`/`updatedAt` in console.

## 13. Risks and mitigations

| Risk                                                                                          | Mitigation                                                                                                      |
| --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Delete-by-anyone: one misclick wipes shared data, no app-level undo                           | Two-click confirm + Firestore PITR/backup.                                                                      |
| Login-required kills caching: `/foods` is dynamic, first paint depends on session + Firestore | Must never return to public cache. Optimize via initial server fetch + snapshot, not public cache.              |
| Validation duplication (zod + Rules) can drift                                                | Single source of limits (`FOOD_AREAS`, max 80/24/8) referenced on both sides; any limit change must touch both. |
