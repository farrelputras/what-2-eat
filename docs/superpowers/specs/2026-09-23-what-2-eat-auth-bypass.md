# What-2-Eat — Auth Bypass for Testing (PRD)

- Date: 2026-09-23
- Status: implemented 2026-09-23 (commit `72a7d9a`); see §10.
- Session scope: PRD only (2026-09-23 session). Implemented 2026-09-23; see §10.
- Language: English (matches sibling specs; UI copy stays inline English per repo rule).
- Supplements: `2026-09-22-what-2-eat-firebase.md` (auth + Firestore baseline). This doc does not change the production auth model; it adds a dev-only test path.
- Locked decisions (from review): full fake user, Firebase emulators for data, hard-fail build guard in production/preview.

## 1. Background

The `/foods` page is login-gated. The production path is:

`Google popup (lib/firebase/client.ts:94 signInWithPopup)` → `POST /api/auth/session (app/api/auth/session/route.ts:25)` → `__session` HttpOnly cookie → `verifySessionCookie (lib/firebase/server.ts:38)` → `FoodsGate (app/foods/page.tsx:42)` → Admin SDK initial read + client `onSnapshot (lib/firebase/client.ts:141)` gated by `firestore.rules (request.auth != null)`.

Testing catalog UI (filters, shuffle, add/edit/delete) currently requires real Google sign-in and touches the shared production catalog. There is no fast local loop.

A naive `AUTH_BYPASS=true` that only skips the Next.js redirect does not work: Firestore rules still require `request.auth != null`, the client `uid` in `foods-catalog-client.tsx:41` stays null so writes are blocked, and `createdByUid == request.auth.uid` on create cannot be satisfied. Server and client auth are two separate layers and both must be addressed.

The repo is halfway toward the canonical Firebase answer: `lib/firebase/admin.ts:34` already honors `FIRESTORE_EMULATOR_HOST`, but `lib/firebase/client.ts` has no `connect*Emulator` calls and `firebase.json` has no `emulators` block.

## 2. Goals and non-goals

Goals:

- G1: With bypass on + emulators running, a developer opens `/foods` with zero login steps and gets a working catalog (read + create + edit + delete) as a stable fake user.
- G2: Bypass is impossible to ship: `next build` fails when the flag is set in production or preview.
- G3: Bypass is always visible (UI banner + server log) so no screenshot or bug report is mistaken for real auth.
- G4: Zero change to production auth behavior when the flag is off, and zero change to `firestore.rules` and Shopify auth (`lib/auth/`, `proxy.ts`, `shopConfig.auth`).

Non-goals (v1):

- No bypass for Shopify Customer Account.
- No `NEXT_PUBLIC_*` bypass flag, no per-request header/cookie toggle, no magic login link.
- No test UID against production Firestore; no relaxation of `firestore.rules`.
- No bypass of food input validation (`lib/foods/index.ts` zod + normalize stays enforced).
- No change to session cookie lifetime, Firestore indexes, or offline queue.

## 3. Users and scenarios

- Primary user: local developer on `pnpm dev`.
- Scenario A (happy path): set env, start emulators, open `/login` → auto-lands on `/foods` with `Test mode` banner → adds/edits/deletes a place → data round-trips through the emulator.
- Scenario B (emulator down): bypass on but emulator unreachable → explicit error state, never a silent empty catalog mistaken for "no data".
- Scenario C (flag off): anonymous `/foods` → `redirect("/login")` exactly as today (baseline preserved).

## 4. Functional requirements

### FR-1: Flag parsing (server-only)

- FR-1.1: New helper `isAuthBypassEnabled()` (location: `lib/firebase/admin.ts` or new `lib/auth/bypass.ts`; must never be imported by a `"use client"` module).
- FR-1.2: Strict parse: enabled iff `process.env.AUTH_BYPASS === "true"` (exact lowercase). `"1"`, `"True"`, `"yes"`, and empty do not enable.
- FR-1.3: Force-disabled when `NODE_ENV === "production"` at runtime semantics; the build guard (FR-2) is the hard enforcement.
- FR-1.4: Documented in `.env.example` with a `dev-only, never set in preview/prod` comment (repo rule: every `process.env.X` read has a row).

### FR-2: Production hard-fail guard

- FR-2.1: If `AUTH_BYPASS=true` and (`NODE_ENV === "production"` or `VERCEL_ENV === "production"` or `VERCEL_ENV === "preview"`), `next build` throws before compiling: `AUTH_BYPASS must not be enabled in production/preview`.
- FR-2.2: Enforcement point: `instrumentation.ts` or `next.config.ts` load path so it fails fast in CI and on Vercel.
- FR-2.3: No silent-ignore fallback. Fail-closed is the chosen behavior.

### FR-3: Server session stub

- FR-3.1: `verifySessionCookie()` returns stub `SessionUser { uid: "test-user", email: "test@local.dev", name: "Test User", photoUrl: null }` when bypass is enabled, without calling `getAdminAuth()`.
- FR-3.2: Fake UID is a single constant (`TEST_BYPASS_UID = "test-user"`) shared by server and client paths so `createdByUid` is consistent.
- FR-3.3: `fetchFoodPlacesInitial()` keeps using `getAdminDb()` (which already routes to `FIRESTORE_EMULATOR_HOST`); bypass must not mask a `null` db. Emulator down → caller surfaces the error.

### FR-4: Route gates

- FR-4.1: `FoodsGate (app/foods/page.tsx)` skips `redirect("/login")` when bypass is on and passes a `bypass: true` signal to the catalog shell for the banner.
- FR-4.2: `LoginGate (app/(auth)/login/page.tsx)` redirects to `/foods` when bypass is on and renders a `Test mode — signed in as test-user (auth bypass)` note instead of the Firebase-missing note path.
- FR-4.3: `POST /api/auth/session` and `DELETE /api/auth/session` short-circuit under bypass to `{ ok: true, bypass: true }` with no real cookie, so client code never calls `createSessionCookie`.

### FR-5: Client emulator + fake user

- FR-5.1: `lib/firebase/client.ts` connects to the Auth and Firestore emulators when `NEXT_PUBLIC_FIRESTORE_EMULATOR_HOST` / `FIREBASE_AUTH_EMULATOR_HOST` (exact var names TBD in implementation; must be documented in `.env.example`) are set, via `connectFirestoreEmulator` / `connectAuthEmulator`.
- FR-5.2: `subscribeAuthUser` emits a fake `User`-shaped object with `uid: "test-user"` under bypass so `FoodsCatalogClient` `uid` checks pass and `createPlace(input, uid)` writes satisfy `createdByUid == request.auth.uid` against the emulator.
- FR-5.3: `LoginButtonClient` / `LogoutButtonClient` are inert under bypass (no popup, no session fetch). `AuthStateClient` renders the fake identity with no photo path.
- FR-5.4: No `NEXT_PUBLIC_AUTH_BYPASS` variable. The client learns bypass state via a server-passed prop or a dedicated read-only status affordance, never by reading the server-only flag directly.

### FR-6: Visible test mode

- FR-6.1: `/foods` renders a persistent, non-dismissible banner: `Test mode — auth bypass active, using emulator data`.
- FR-6.2: Server logs one line on boot/first stub use: `auth bypass active (test-user, emulator)`.
- FR-6.3: Banner copy is inline English beside the consuming component (repo copy rule); no string catalog, no i18n runtime.

### FR-7: Emulator config + seed

- FR-7.1: `firebase.json` gains an `emulators` block (auth + firestore ports; exact ports TBD in implementation).
- FR-7.2: `scripts/seed-foods.ts` targets the emulator when the emulator host is set, so a fresh clone can seed emulator data without touching production.
- FR-7.3: Developer loop documented: set env → `firebase emulators:start` → `pnpm dev` → seed → test. Chain uses existing `pnpm dev` / `pnpm seed:foods` commands.

## 5. Technical touchpoints

| Area         | File(s)                                                                                       | Change                                                             |
| ------------ | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Flag + guard | `lib/firebase/admin.ts` or new `lib/auth/bypass.ts`, `instrumentation.ts` or `next.config.ts` | `isAuthBypassEnabled()`, `assertBypassAllowed()`, build-time throw |
| Server auth  | `lib/firebase/server.ts:38`                                                                   | Early-return stub user on bypass                                   |
| Gates        | `app/foods/page.tsx:42`, `app/(auth)/login/page.tsx:52`                                       | Skip redirects, pass banner signal                                 |
| Session API  | `app/api/auth/session/route.ts:25,61`                                                         | Short-circuit POST/DELETE under bypass                             |
| Client       | `lib/firebase/client.ts:71,85,141,165,191,204`                                                | Emulator connect, fake-user emission, emulator-backed CRUD         |
| UI           | `components/auth/*`, `components/foods/foods-catalog*.tsx`                                    | Banner, inert login/logout, fake identity                          |
| Config       | `firebase.json`, `scripts/seed-foods.ts`, `.env.example`                                      | Emulator ports, seed-to-emulator, new env rows                     |
| Untouched    | `firestore.rules`, `proxy.ts`, `lib/auth/server.ts`, `lib/foods/index.ts`                     | No changes                                                         |

## 6. Security considerations

- Server-only read of `AUTH_BYPASS`; never `NEXT_PUBLIC_` prefixed.
- Strict `"true"` parse; default off (fail-closed).
- Build-time throw on production/preview; no silent ignore.
- No reads of `.env*` (other than `.env.example`), `docs/secrets/`, or pasted credentials during implementation or verification (repo secret rule).
- Firestore rules unchanged; production catalog never sees the fake UID because bypass requires the emulator path.

## 7. Verification (acceptance)

- V1 (baseline): flag unset → anonymous `/foods` redirects to `/login`; Google login flow unchanged.
- V2 (bypass happy path): flag on + emulators up → `/login` lands on `/foods` with banner; list loads; create/edit/delete round-trip in emulator with `createdByUid == "test-user"`; two emulator-backed clients see each other in realtime.
- V3 (emulator down): flag on, emulator stopped → explicit error state, not silent empty list.
- V4 (prod guard): `NODE_ENV=production` (or `VERCEL_ENV=production`/`preview`) + flag on → `pnpm build` fails with the guard message.
- V5 (hygiene): `pnpm lint`, `pnpm format`, `tsc --noEmit` clean; `.env.example` contains every new `process.env.X` with a when-to-set comment.

## 8. Rollout

Flag-gated, default off. No migration, no rules deploy, no Shopify impact. Docs + code ship together; developer enables locally only.

## 9. Open items for implementation

- Exact emulator ports and client emulator env var names.
- Whether `/login` auto-redirects or shows an explicit `Continue as test user` button (PRD recommends auto-redirect for speed; implementation may choose the button if auto-redirect is deemed too magical).
- Whether the client learns bypass state via prop drilling from the server gate or a small read-only status route (constraint: no `NEXT_PUBLIC_` flag).

## 10. Implementation record (2026-09-23)

- Commit `72a7d9a`. All §9 items resolved: emulator ports auth `9099` / firestore `8080` (`firebase.json`); client vars `NEXT_PUBLIC_FIRESTORE_EMULATOR_HOST` / `NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST`; `/login` auto-redirects to `/foods`; client learns bypass via `bypass` prop drilled from server gates.
- Prod guard enforced twice: build-time throw in `next.config.ts` plus runtime `assertBypassAllowed()` in `instrumentation.ts:register()`.
- Emulator-down state is explicit: `fetchFoodPlacesInitial` throws a start-the-emulator message; client `subscribeFoodPlaces` surfaces errors via toast, never a silent empty list.
- Minor tail: `LoginButtonClient` accepts `bypass` but `LoginGate` redirects before rendering it, so the prop is currently unreachable — harmless, kept for symmetry with `LogoutButtonClient`.
- Verified at implementation time per §7 V1–V5; re-verify V2–V4 in a real browser with emulators up before relying on this loop.
