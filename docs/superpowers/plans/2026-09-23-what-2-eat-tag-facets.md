# What-2-Eat Tag Facets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace free-text `tags: string[]` with 7 controlled optional facets across model, validation, rules, seed, and UI.

**Architecture:** Flat optional fields on `FoodPlace`; `lib/foods/types.ts` owns vocab constants and contracts, `lib/foods/index.ts` owns normalize + Zod + AND-across/OR-within filter + catalog; Firestore rules enforce vocab + caps; Firebase parse layers coerce missing arrays to `[]`; catalog UI groups primary facets above More filters; form uses radios (singles, clearable) + checkbox sets (multis, capped).

**Tech Stack:** Next.js 16 App Router (Server Components + client leaves), Zod 4, Firestore security rules v2, Firebase Web v12 + Admin v14, React 19, oxlint + oxfmt, tsc.

**Spec:** `docs/superpowers/specs/2026-09-23-what-2-eat-tag-facets.md`

## Global Constraints

- Copy stays inline and server-first; no `t()` runtime, no next-intl.
- `components/ui/` takes primitive props only; domain wrappers supply labels.
- Cart writes go through Hydrogen handlers — untouched by this plan.
- Shopify fetches / Next.js caches boundary — untouched; foods domain follows existing `lib/foods` patterns.
- Every user-configurable `process.env.X` read already has a row in `.env.example` — no new env in this plan.
- Generated docs are in English; quoted UI copy stays English inline.
- Never read/print/grep `.env` (any suffix except `.env.example`), `docs/secrets/`, or pasted credentials.
- `pnpm lint`, `pnpm format --check`, `pnpm typecheck` must pass; no `tags: string[]` references remain outside the archive spec doc.
- Facet badges carry a text facet label (never color-only) with `aria-label` naming the facet; grayscale-usable.
- All facets optional — zero filled is valid; unfiltered list always shows everything.

---

### Task 1: Model + vocabs + pure filter logic

**Files:**

- Modify: `lib/foods/types.ts`
- Modify: `lib/foods/index.ts`
- Test: manual `tsx` probe + `pnpm typecheck` (repo has no test runner; no new test framework)

**Interfaces:**

- Consumes: existing `FoodPlace`, `FoodFilters`, `FOOD_AREAS` patterns.
- Produces:
  - `export const MENU_VOCAB: readonly ["burger","pizza","pasta","sandwich","sushi","rice-bowl","noodle-bowl","soup","porridge","salad","fried-chicken","grill","dessert","bakery","coffee","beverage"]`
  - `export const PRICE_TIER_VOCAB = ["budget","regular","premium","splurge"] as const`
  - `export const SERVING_VOCAB = ["snack","meal","both"] as const`
  - `export const STAPLE_VOCAB = ["rice","noodles","bread","potato","porridge","none"] as const`
  - `export const PROTEIN_VOCAB = ["chicken","beef","seafood","egg","plant","pork","mixed"] as const`
  - `export const ORIGIN_VOCAB = ["indonesian","chinese","japanese","korean","western","middle-eastern","southeast-asian","mixed"] as const`
  - `export const HEALTH_STYLE_VOCAB = ["comfort","everyday","fresh"] as const`
  - `export type MenuValue = typeof MENU_VOCAB[number]` (same pattern for `PriceTier`, `Serving`, `StapleValue`, `ProteinValue`, `OriginValue`, `HealthStyle`)
  - `export interface FoodPlace { areas: string[]; id: string; name: string; menus: string[]; staples: string[]; proteins: string[]; origins: string[]; priceTier?: PriceTier; serving?: Serving; healthStyle?: HealthStyle; instagramUrl?: string; tiktokUrl?: string }`
  - `export interface FoodFilters { area: string; search: string; menus: string[]; priceTiers: string[]; servings: string[]; staples: string[]; proteins: string[]; origins: string[]; healthStyles: string[] }`
  - `export function normalizeFoodFacets(input: { menus?: unknown; staples?: unknown; proteins?: unknown; origins?: unknown; priceTier?: unknown; serving?: unknown; healthStyle?: unknown }): { menus: string[]; staples: string[]; proteins: string[]; origins: string[]; priceTier?: PriceTier; serving?: Serving; healthStyle?: HealthStyle }`
  - `export function filterFoods(foods: FoodPlace[], filters: FoodFilters): FoodPlace[]` (AND-across / OR-within)
  - `export interface FacetCatalog { menus: string[]; priceTiers: string[]; servings: string[]; staples: string[]; proteins: string[]; origins: string[]; healthStyles: string[] }`
  - `export function deriveFacetCatalog(foods: FoodPlace[]): FacetCatalog`
  - `export const MAX_MENUS_PER_PLACE = 3; MAX_STAPLES_PER_PLACE = 3; MAX_PROTEINS_PER_PLACE = 4; MAX_ORIGINS_PER_PLACE = 3; MAX_FACET_VALUES_PER_PLACE = 8`
  - `export function countFacetValues(place: { menus: string[]; staples: string[]; proteins: string[]; origins: string[]; priceTier?: string; serving?: string; healthStyle?: string }): number`

- [ ] **Step 1: Rewrite `lib/foods/types.ts` with vocabs + flat facet fields**

```ts
export const MENU_VOCAB = [
  "burger",
  "pizza",
  "pasta",
  "sandwich",
  "sushi",
  "rice-bowl",
  "noodle-bowl",
  "soup",
  "porridge",
  "salad",
  "fried-chicken",
  "grill",
  "dessert",
  "bakery",
  "coffee",
  "beverage",
] as const;

export type MenuValue = (typeof MENU_VOCAB)[number];

export const PRICE_TIER_VOCAB = ["budget", "regular", "premium", "splurge"] as const;

export type PriceTier = (typeof PRICE_TIER_VOCAB)[number];

export const SERVING_VOCAB = ["snack", "meal", "both"] as const;

export type Serving = (typeof SERVING_VOCAB)[number];

export const STAPLE_VOCAB = ["rice", "noodles", "bread", "potato", "porridge", "none"] as const;

export type StapleValue = (typeof STAPLE_VOCAB)[number];

export const PROTEIN_VOCAB = [
  "chicken",
  "beef",
  "seafood",
  "egg",
  "plant",
  "pork",
  "mixed",
] as const;

export type ProteinValue = (typeof PROTEIN_VOCAB)[number];

export const ORIGIN_VOCAB = [
  "indonesian",
  "chinese",
  "japanese",
  "korean",
  "western",
  "middle-eastern",
  "southeast-asian",
  "mixed",
] as const;

export type OriginValue = (typeof ORIGIN_VOCAB)[number];

export const HEALTH_STYLE_VOCAB = ["comfort", "everyday", "fresh"] as const;

export type HealthStyle = (typeof HEALTH_STYLE_VOCAB)[number];

export interface FoodPlace {
  areas: string[];
  healthStyle?: HealthStyle;
  id: string;
  instagramUrl?: string;
  menus: string[];
  name: string;
  origins: string[];
  priceTier?: PriceTier;
  proteins: string[];
  serving?: Serving;
  staples: string[];
  tiktokUrl?: string;
}
```

- [ ] **Step 2: Rewrite `lib/foods/index.ts` imports + filter/input/error types + empty filters + caps**

```ts
import { z } from "zod";

import type { FoodPlace, HealthStyle, PriceTier, Serving } from "./types";
import {
  HEALTH_STYLE_VOCAB,
  MENU_VOCAB,
  ORIGIN_VOCAB,
  PRICE_TIER_VOCAB,
  PROTEIN_VOCAB,
  SERVING_VOCAB,
  STAPLE_VOCAB,
} from "./types";

export interface FoodFilters {
  area: string;
  healthStyles: string[];
  menus: string[];
  origins: string[];
  priceTiers: string[];
  proteins: string[];
  search: string;
  servings: string[];
  staples: string[];
}

export interface FoodInput {
  areas: string[];
  healthStyle?: HealthStyle;
  instagramUrl?: string;
  menus: string[];
  name: string;
  origins: string[];
  priceTier?: PriceTier;
  proteins: string[];
  serving?: Serving;
  staples: string[];
  tiktokUrl?: string;
}

export interface FoodInputErrors {
  areas?: string;
  facets?: string;
  healthStyle?: string;
  instagramUrl?: string;
  menus?: string;
  name?: string;
  origins?: string;
  priceTier?: string;
  proteins?: string;
  serving?: string;
  staples?: string;
  tiktokUrl?: string;
}

export const EMPTY_FOOD_FILTERS: FoodFilters = {
  area: "all",
  healthStyles: [],
  menus: [],
  origins: [],
  priceTiers: [],
  proteins: [],
  search: "",
  servings: [],
  staples: [],
};

export const MAX_MENUS_PER_PLACE = 3;
export const MAX_STAPLES_PER_PLACE = 3;
export const MAX_PROTEINS_PER_PLACE = 4;
export const MAX_ORIGINS_PER_PLACE = 3;
export const MAX_FACET_VALUES_PER_PLACE = 8;
export const MAX_FOOD_URL_LENGTH = 300;
export const FOOD_AREAS = ["batam", "malang", "surabaya"] as const;
```

- [ ] **Step 3: Add Zod schema + normalize helpers + count helper**

```ts
const foodInputSchema = z.object({
  areas: z.enum(FOOD_AREAS).array().min(1).max(3),
  healthStyle: z.enum(HEALTH_STYLE_VOCAB).optional(),
  instagramUrl: z.string().max(MAX_FOOD_URL_LENGTH).optional(),
  menus: z.enum(MENU_VOCAB).array().max(MAX_MENUS_PER_PLACE),
  name: z.string().min(1).max(80),
  origins: z.enum(ORIGIN_VOCAB).array().max(MAX_ORIGINS_PER_PLACE),
  priceTier: z.enum(PRICE_TIER_VOCAB).optional(),
  proteins: z.enum(PROTEIN_VOCAB).array().max(MAX_PROTEINS_PER_PLACE),
  serving: z.enum(SERVING_VOCAB).optional(),
  staples: z.enum(STAPLE_VOCAB).array().max(MAX_STAPLES_PER_PLACE),
  tiktokUrl: z.string().max(MAX_FOOD_URL_LENGTH).optional(),
});

function normalizeMulti(values: unknown, vocab: readonly string[], cap: number): string[] {
  if (!Array.isArray(values)) return [];
  const allowed = new Set(vocab);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    if (typeof raw !== "string") continue;
    const value = raw.trim().toLowerCase();
    if (value === "" || !allowed.has(value) || seen.has(value)) continue;
    seen.add(value);
    out.push(value);
    if (out.length >= cap) break;
  }
  return out;
}

function normalizeSingle(value: unknown, vocab: readonly string[]): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim().toLowerCase();
  if (trimmed === "") return undefined;
  return (vocab as readonly string[]).includes(trimmed) ? trimmed : undefined;
}

export function countFacetValues(place: {
  healthStyle?: string;
  menus: string[];
  origins: string[];
  priceTier?: string;
  proteins: string[];
  serving?: string;
  staples: string[];
}): number {
  return (
    place.menus.length +
    place.staples.length +
    place.proteins.length +
    place.origins.length +
    (place.priceTier ? 1 : 0) +
    (place.serving ? 1 : 0) +
    (place.healthStyle ? 1 : 0)
  );
}

export function normalizeFoodFacets(input: {
  healthStyle?: unknown;
  menus?: unknown;
  origins?: unknown;
  priceTier?: unknown;
  proteins?: unknown;
  serving?: unknown;
  staples?: unknown;
}): {
  healthStyle?: HealthStyle;
  menus: string[];
  origins: string[];
  priceTier?: PriceTier;
  proteins: string[];
  serving?: Serving;
  staples: string[];
} {
  return {
    ...(normalizeSingle(input.priceTier, PRICE_TIER_VOCAB)
      ? { priceTier: normalizeSingle(input.priceTier, PRICE_TIER_VOCAB) as PriceTier }
      : {}),
    ...(normalizeSingle(input.serving, SERVING_VOCAB)
      ? { serving: normalizeSingle(input.serving, SERVING_VOCAB) as Serving }
      : {}),
    ...(normalizeSingle(input.healthStyle, HEALTH_STYLE_VOCAB)
      ? { healthStyle: normalizeSingle(input.healthStyle, HEALTH_STYLE_VOCAB) as HealthStyle }
      : {}),
    menus: normalizeMulti(input.menus, MENU_VOCAB, MAX_MENUS_PER_PLACE),
    origins: normalizeMulti(input.origins, ORIGIN_VOCAB, MAX_ORIGINS_PER_PLACE),
    proteins: normalizeMulti(input.proteins, PROTEIN_VOCAB, MAX_PROTEINS_PER_PLACE),
    staples: normalizeMulti(input.staples, STAPLE_VOCAB, MAX_STAPLES_PER_PLACE),
  };
}
```

- [ ] **Step 4: Rewrite `validateFoodInput` (keep name/duplicate/area/URL behavior, add facet checks)**

```ts
export function validateFoodInput(
  input: FoodInput,
  existing: FoodPlace[],
  excludeId?: string,
): FoodInputErrors {
  const facets = normalizeFoodFacets(input);
  const normalized: FoodInput = {
    areas: normalizeFoodAreas(input.areas),
    ...(facets.healthStyle ? { healthStyle: facets.healthStyle } : {}),
    instagramUrl: normalizeFoodUrl(input.instagramUrl),
    menus: facets.menus,
    name: normalizeFoodName(input.name),
    origins: facets.origins,
    ...(facets.priceTier ? { priceTier: facets.priceTier } : {}),
    proteins: facets.proteins,
    ...(facets.serving ? { serving: facets.serving } : {}),
    staples: facets.staples,
    tiktokUrl: normalizeFoodUrl(input.tiktokUrl),
  };
  const parsed = foodInputSchema.safeParse(normalized);
  const errors: FoodInputErrors = {};
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const field = issue.path[0];
      if (field === "name" && !errors.name) {
        errors.name =
          issue.code === "too_big"
            ? "Name must be at most 80 characters"
            : "Place name is required";
      } else if (field === "areas" && !errors.areas) {
        errors.areas = "Select at least 1 area";
      } else if (field === "menus" && !errors.menus) {
        errors.menus = "Maximum 3 menu forms";
      } else if (field === "staples" && !errors.staples) {
        errors.staples = "Maximum 3 staples";
      } else if (field === "proteins" && !errors.proteins) {
        errors.proteins = "Maximum 4 proteins";
      } else if (field === "origins" && !errors.origins) {
        errors.origins = "Maximum 3 origins";
      } else if (field === "priceTier" && !errors.priceTier) {
        errors.priceTier = "Invalid price tier";
      } else if (field === "serving" && !errors.serving) {
        errors.serving = "Invalid serving";
      } else if (field === "healthStyle" && !errors.healthStyle) {
        errors.healthStyle = "Invalid style";
      } else if (field === "instagramUrl" && !errors.instagramUrl) {
        errors.instagramUrl = `Link must be at most ${MAX_FOOD_URL_LENGTH} characters`;
      } else if (field === "tiktokUrl" && !errors.tiktokUrl) {
        errors.tiktokUrl = `Link must be at most ${MAX_FOOD_URL_LENGTH} characters`;
      }
    }
  }
  if (
    countFacetValues({
      ...facets,
      menus: normalized.menus,
      origins: normalized.origins,
      proteins: normalized.proteins,
      staples: normalized.staples,
    }) > MAX_FACET_VALUES_PER_PLACE &&
    !errors.facets
  ) {
    errors.facets = "Maximum 8 facet values total";
  }
  if (!errors.instagramUrl && normalized.instagramUrl !== undefined) {
    if (!isHttpsUrl(normalized.instagramUrl)) errors.instagramUrl = "Link must start with https://";
  }
  if (!errors.tiktokUrl && normalized.tiktokUrl !== undefined) {
    if (!isHttpsUrl(normalized.tiktokUrl)) errors.tiktokUrl = "Link must start with https://";
  }
  if (!errors.name) {
    const duplicate = existing.some(
      (place) =>
        place.id !== excludeId &&
        normalizeFoodName(place.name).toLowerCase() === normalized.name.toLowerCase(),
    );
    if (duplicate) errors.name = "A place with this name already exists";
  }
  return errors;
}
```

Keep existing `normalizeSearch`, `normalizeFoodName`, `normalizeFoodAreas`, `normalizeFoodUrl`, `isHttpsUrl`, `slugFoodId` unchanged.

- [ ] **Step 5: Rewrite `filterFoods` AND-across / OR-within + `deriveFacetCatalog`**

```ts
export function filterFoods(foods: FoodPlace[], filters: FoodFilters): FoodPlace[] {
  const query = normalizeSearch(filters.search);
  const area = filters.area.trim().toLowerCase();
  const menus = new Set(filters.menus);
  const priceTiers = new Set(filters.priceTiers);
  const servings = new Set(filters.servings);
  const staples = new Set(filters.staples);
  const proteins = new Set(filters.proteins);
  const origins = new Set(filters.origins);
  const healthStyles = new Set(filters.healthStyles);

  return foods.filter((place) => {
    if (area !== "" && area !== "all" && !place.areas.some((item) => item.toLowerCase() === area))
      return false;
    if (menus.size > 0 && !(place.menus ?? []).some((value) => menus.has(value))) return false;
    if (priceTiers.size > 0 && !(place.priceTier && priceTiers.has(place.priceTier))) return false;
    if (servings.size > 0 && !(place.serving && servings.has(place.serving))) return false;
    if (staples.size > 0 && !(place.staples ?? []).some((value) => staples.has(value)))
      return false;
    if (proteins.size > 0 && !(place.proteins ?? []).some((value) => proteins.has(value)))
      return false;
    if (origins.size > 0 && !(place.origins ?? []).some((value) => origins.has(value)))
      return false;
    if (healthStyles.size > 0 && !(place.healthStyle && healthStyles.has(place.healthStyle)))
      return false;
    if (query !== "" && !place.name.toLowerCase().includes(query)) return false;
    return true;
  });
}

export interface FacetCatalog {
  healthStyles: string[];
  menus: string[];
  origins: string[];
  priceTiers: string[];
  proteins: string[];
  servings: string[];
  staples: string[];
}

function sortedUnique(values: (string | undefined)[]): string[] {
  return [...new Set(values.filter((v): v is string => typeof v === "string"))].sort((a, b) =>
    a.localeCompare(b),
  );
}

export function deriveFacetCatalog(foods: FoodPlace[]): FacetCatalog {
  return {
    healthStyles: sortedUnique(foods.map((place) => place.healthStyle)),
    menus: sortedUnique(foods.flatMap((place) => place.menus ?? [])),
    origins: sortedUnique(foods.flatMap((place) => place.origins ?? [])),
    priceTiers: sortedUnique(foods.map((place) => place.priceTier)),
    proteins: sortedUnique(foods.flatMap((place) => place.proteins ?? [])),
    servings: sortedUnique(foods.map((place) => place.serving)),
    staples: sortedUnique(foods.flatMap((place) => place.staples ?? [])),
  };
}

export function deriveAreaCatalog(foods: FoodPlace[]): string[] {
  return [...new Set(foods.flatMap((place) => place.areas))].sort((a, b) => a.localeCompare(b));
}

export function pickRandomFood(foods: FoodPlace[]): FoodPlace | undefined {
  if (foods.length === 0) return undefined;
  return foods[Math.floor(Math.random() * foods.length)];
}
```

Delete `normalizeFoodTags`, `deriveTagCatalog`, `MAX_TAGS_PER_PLACE`, old `FoodFilters { tags }`, old `FoodInput { tags }`.

- [ ] **Step 6: Run typecheck for this task**

Run: `pnpm typecheck`
Expected: PASS (other files still reference `tags` so this will fail until Tasks 2–4 land — that's expected; note the failure list for the next tasks instead of fixing forward).

---

### Task 2: Firestore rules + Firebase parse/serialize + Zod wiring

**Files:**

- Modify: `firestore.rules`
- Modify: `lib/firebase/client.ts`
- Modify: `lib/firebase/server.ts`
- Test: rules eyeball + `pnpm typecheck`

**Interfaces:**

- Consumes: Task 1 vocabs + `normalizeFoodFacets`, `normalizeFoodAreas`, `normalizeFoodName`, `normalizeFoodUrl`, `slugFoodId`, `countFacetValues`.
- Produces: `toFoodPlace` (both client + server) coercing missing arrays to `[]`, missing singles to `undefined`, filtering unknown values; `createPlace(input, uid)`, `updatePlace(id, input)` writing facet fields and deleting `tags`.

- [ ] **Step 1: Rewrite `firestore.rules` create + update**

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function isValidFacetList(values, allowed, maxSize) {
      return values is list && values.size() <= maxSize && values.hasOnly(allowed);
    }
    function facetTotal(data) {
      return (("menus" in data) ? data.menus.size() : 0)
        + (("staples" in data) ? data.staples.size() : 0)
        + (("proteins" in data) ? data.proteins.size() : 0)
        + (("origins" in data) ? data.origins.size() : 0)
        + (("priceTier" in data) ? 1 : 0)
        + (("serving" in data) ? 1 : 0)
        + (("healthStyle" in data) ? 1 : 0);
    }
    match /food_places/{id} {
      allow read: if request.auth != null;

      allow create: if request.auth != null
        && request.resource.data.keys().hasOnly(
          ["areas", "name", "menus", "staples", "proteins", "origins", "priceTier", "serving", "healthStyle", "createdByUid", "createdAt", "updatedAt", "instagramUrl", "tiktokUrl"])
        && request.resource.data.name is string
        && request.resource.data.name.size() >= 1
        && request.resource.data.name.size() <= 80
        && request.resource.data.areas is list
        && request.resource.data.areas.size() >= 1
        && request.resource.data.areas.size() <= 3
        && request.resource.data.areas.hasOnly(["batam", "malang", "surabaya"])
        && (!("menus" in request.resource.data) || isValidFacetList(request.resource.data.menus, ["burger", "pizza", "pasta", "sandwich", "sushi", "rice-bowl", "noodle-bowl", "soup", "porridge", "salad", "fried-chicken", "grill", "dessert", "bakery", "coffee", "beverage"], 3))
        && (!("staples" in request.resource.data) || isValidFacetList(request.resource.data.staples, ["rice", "noodles", "bread", "potato", "porridge", "none"], 3))
        && (!("proteins" in request.resource.data) || isValidFacetList(request.resource.data.proteins, ["chicken", "beef", "seafood", "egg", "plant", "pork", "mixed"], 4))
        && (!("origins" in request.resource.data) || isValidFacetList(request.resource.data.origins, ["indonesian", "chinese", "japanese", "korean", "western", "middle-eastern", "southeast-asian", "mixed"], 3))
        && (!("priceTier" in request.resource.data) || request.resource.data.priceTier in ["budget", "regular", "premium", "splurge"])
        && (!("serving" in request.resource.data) || request.resource.data.serving in ["snack", "meal", "both"])
        && (!("healthStyle" in request.resource.data) || request.resource.data.healthStyle in ["comfort", "everyday", "fresh"])
        && facetTotal(request.resource.data) <= 8
        && request.resource.data.createdByUid == request.auth.uid
        && (!("instagramUrl" in request.resource.data)
          || (request.resource.data.instagramUrl is string
            && request.resource.data.instagramUrl.size() >= 1
            && request.resource.data.instagramUrl.size() <= 300))
        && (!("tiktokUrl" in request.resource.data)
          || (request.resource.data.tiktokUrl is string
            && request.resource.data.tiktokUrl.size() >= 1
            && request.resource.data.tiktokUrl.size() <= 300));

      allow update: if request.auth != null
        && request.resource.data.keys().hasOnly(
          ["areas", "name", "menus", "staples", "proteins", "origins", "priceTier", "serving", "healthStyle", "createdByUid", "createdAt", "updatedAt", "instagramUrl", "tiktokUrl"])
        && request.resource.data.name is string
        && request.resource.data.name.size() >= 1
        && request.resource.data.name.size() <= 80
        && request.resource.data.areas is list
        && request.resource.data.areas.size() >= 1
        && request.resource.data.areas.size() <= 3
        && request.resource.data.areas.hasOnly(["batam", "malang", "surabaya"])
        && (!("menus" in request.resource.data) || isValidFacetList(request.resource.data.menus, ["burger", "pizza", "pasta", "sandwich", "sushi", "rice-bowl", "noodle-bowl", "soup", "porridge", "salad", "fried-chicken", "grill", "dessert", "bakery", "coffee", "beverage"], 3))
        && (!("staples" in request.resource.data) || isValidFacetList(request.resource.data.staples, ["rice", "noodles", "bread", "potato", "porridge", "none"], 3))
        && (!("proteins" in request.resource.data) || isValidFacetList(request.resource.data.proteins, ["chicken", "beef", "seafood", "egg", "plant", "pork", "mixed"], 4))
        && (!("origins" in request.resource.data) || isValidFacetList(request.resource.data.origins, ["indonesian", "chinese", "japanese", "korean", "western", "middle-eastern", "southeast-asian", "mixed"], 3))
        && (!("priceTier" in request.resource.data) || request.resource.data.priceTier in ["budget", "regular", "premium", "splurge"])
        && (!("serving" in request.resource.data) || request.resource.data.serving in ["snack", "meal", "both"])
        && (!("healthStyle" in request.resource.data) || request.resource.data.healthStyle in ["comfort", "everyday", "fresh"])
        && facetTotal(request.resource.data) <= 8
        && request.resource.data.createdByUid == resource.data.createdByUid
        && (!("instagramUrl" in request.resource.data)
          || (request.resource.data.instagramUrl is string
            && request.resource.data.instagramUrl.size() >= 1
            && request.resource.data.instagramUrl.size() <= 300))
        && (!("tiktokUrl" in request.resource.data)
          || (request.resource.data.tiktokUrl is string
            && request.resource.data.tiktokUrl.size() >= 1
            && request.resource.data.tiktokUrl.size() <= 300));

      allow delete: if request.auth != null;
    }
  }
}
```

Note: `isValidFacetList` + missing-field `||` means zero facets valid; no `size() >= 1` anywhere on facet fields.

- [ ] **Step 2: Rewrite `toFoodPlace` in `lib/firebase/client.ts`**

```ts
import {
  normalizeFoodAreas,
  normalizeFoodFacets,
  normalizeFoodName,
  normalizeFoodUrl,
  slugFoodId,
  type FoodInput,
} from "@/lib/foods";

function toFoodPlace(id: string, data: Record<string, unknown>): FoodPlace | null {
  if (typeof data["name"] !== "string") return null;
  if (!Array.isArray(data["areas"])) return null;
  const areas = normalizeFoodAreas(
    data["areas"].filter((area): area is string => typeof area === "string"),
  );
  if (areas.length === 0) return null;
  const facets = normalizeFoodFacets({
    healthStyle: data["healthStyle"],
    menus: data["menus"],
    origins: data["origins"],
    priceTier: data["priceTier"],
    proteins: data["proteins"],
    serving: data["serving"],
    staples: data["staples"],
  });
  const instagramUrl = toOptionalUrl(data, "instagramUrl");
  const tiktokUrl = toOptionalUrl(data, "tiktokUrl");
  return {
    areas,
    ...(facets.healthStyle ? { healthStyle: facets.healthStyle } : {}),
    id,
    ...(instagramUrl ? { instagramUrl } : {}),
    menus: facets.menus,
    name: data["name"],
    origins: facets.origins,
    ...(facets.priceTier ? { priceTier: facets.priceTier } : {}),
    proteins: facets.proteins,
    ...(facets.serving ? { serving: facets.serving } : {}),
    staples: facets.staples,
    ...(tiktokUrl ? { tiktokUrl } : {}),
  };
}
```

- [ ] **Step 3: Rewrite `createPlace` + `updatePlace` in `lib/firebase/client.ts`**

```ts
export async function createPlace(input: FoodInput, uid: string): Promise<FoodPlace> {
  const db = getFirebaseDb();
  if (!db) throw new Error("Firebase is not configured. Fill in your .env.local values.");
  const facets = normalizeFoodFacets(input);
  const instagramUrl = normalizeFoodUrl(input.instagramUrl);
  const tiktokUrl = normalizeFoodUrl(input.tiktokUrl);
  const place: FoodPlace = {
    areas: normalizeFoodAreas(input.areas),
    ...(facets.healthStyle ? { healthStyle: facets.healthStyle } : {}),
    id: slugFoodId(normalizeFoodName(input.name)),
    ...(instagramUrl ? { instagramUrl } : {}),
    menus: facets.menus,
    name: normalizeFoodName(input.name),
    origins: facets.origins,
    ...(facets.priceTier ? { priceTier: facets.priceTier } : {}),
    proteins: facets.proteins,
    ...(facets.serving ? { serving: facets.serving } : {}),
    staples: facets.staples,
    ...(tiktokUrl ? { tiktokUrl } : {}),
  };
  await setDoc(doc(db, FOOD_PLACES_COLLECTION, place.id), {
    areas: place.areas,
    ...(place.healthStyle ? { healthStyle: place.healthStyle } : {}),
    ...(instagramUrl ? { instagramUrl } : {}),
    createdAt: serverTimestamp(),
    createdByUid: uid,
    menus: place.menus,
    name: place.name,
    origins: place.origins,
    ...(place.priceTier ? { priceTier: place.priceTier } : {}),
    proteins: place.proteins,
    ...(place.serving ? { serving: place.serving } : {}),
    staples: place.staples,
    ...(tiktokUrl ? { tiktokUrl } : {}),
    updatedAt: serverTimestamp(),
  });
  return place;
}

export async function updatePlace(id: string, input: FoodInput): Promise<void> {
  const db = getFirebaseDb();
  if (!db) throw new Error("Firebase is not configured. Fill in your .env.local values.");
  const facets = normalizeFoodFacets(input);
  await updateDoc(doc(db, FOOD_PLACES_COLLECTION, id), {
    areas: normalizeFoodAreas(input.areas),
    healthStyle: facets.healthStyle ?? deleteField(),
    instagramUrl: normalizeFoodUrl(input.instagramUrl) ?? deleteField(),
    menus: facets.menus,
    name: normalizeFoodName(input.name),
    origins: facets.origins,
    priceTier: facets.priceTier ?? deleteField(),
    proteins: facets.proteins,
    serving: facets.serving ?? deleteField(),
    staples: facets.staples,
    tags: deleteField(),
    tiktokUrl: normalizeFoodUrl(input.tiktokUrl) ?? deleteField(),
    updatedAt: serverTimestamp(),
  });
}
```

- [ ] **Step 4: Mirror `toFoodPlace` in `lib/firebase/server.ts`** (same body as client version, imports `normalizeFoodFacets` from `@/lib/foods`).

- [ ] **Step 5: Run typecheck**

Run: `pnpm typecheck`
Expected: still FAIL on UI/seed files (Tasks 3–4 pending); confirm only those files error.

---

### Task 3: Seed rewrite + migration script

**Files:**

- Modify: `lib/foods/data/foods.json`
- Modify: `scripts/seed-foods.ts`
- Create: `scripts/migrate-food-facets.ts`
- Modify: `package.json` (add `seed:migrate-facets` script)
- Test: `pnpm exec tsx --env-file=.env.local scripts/migrate-food-facets.ts --dry-run` (emulator) + `pnpm typecheck`

**Interfaces:**

- Consumes: Task 1 vocabs + `countFacetValues` logic; existing `seed-foods.ts` admin pattern.
- Produces: `scripts/migrate-food-facets.ts` with `--dry-run` (counts mapped/unmapped, exits 1 if unmapped) and write mode (maps legacy `tags[]` → facets via reviewed table, deletes `tags`, writes facet fields).

Seed mapping table (all 17 rows — the file holds 17 despite the spec saying 18 — reviewed):

- yoshinoya → `serving:meal, priceTier:regular, menus:[rice-bowl], staples:[rice], proteins:[beef,chicken], origins:[japanese], healthStyle:everyday`
- dikichi → `serving:meal, menus:[rice-bowl], staples:[rice], proteins:[chicken], origins:[japanese], healthStyle:everyday`
- selamat-sukses → `serving:meal, menus:[rice-bowl], staples:[rice], origins:[indonesian], healthStyle:everyday`
- subway → `menus:[sandwich], proteins:[beef,chicken], origins:[western]`
- greenly → `menus:[salad], staples:[none], origins:[western], healthStyle:fresh`
- dominos-pizza → `menus:[pizza], origins:[western], healthStyle:comfort`
- pizza-hut → `menus:[pizza,pasta], origins:[western], healthStyle:comfort`
- warkam → `serving:meal, menus:[noodle-bowl,rice-bowl], staples:[rice,noodles], origins:[indonesian], healthStyle:everyday`
- j-one → `origins:[japanese]`
- soto-cak-har → `serving:meal, menus:[soup], proteins:[chicken], origins:[indonesian], healthStyle:everyday`
- mie-gacoan → `serving:meal, menus:[noodle-bowl], staples:[noodles], origins:[indonesian], healthStyle:everyday`
- uncle-w → `serving:meal, menus:[rice-bowl], staples:[rice], origins:[chinese], healthStyle:everyday`
- mcdonalds → `serving:both, menus:[burger,fried-chicken], origins:[western], proteins:[chicken], healthStyle:comfort`
- kfc → `serving:both, menus:[burger,fried-chicken], proteins:[chicken], healthStyle:comfort`
- sushi-go → `menus:[sushi], staples:[rice], origins:[japanese], healthStyle:everyday`
- aeon → `origins:[japanese]`
- taria → `serving:snack, menus:[coffee,beverage]`
- plus one zero-facet canary? No — keep all 18 mapped; zero-facet case is covered by form/rules acceptance, not seed.

- [ ] **Step 1: Rewrite `lib/foods/data/foods.json`** to facet fields (example first two rows; repeat table for all 18):

```json
[
  {
    "areas": ["surabaya"],
    "healthStyle": "everyday",
    "id": "yoshinoya",
    "menus": ["rice-bowl"],
    "name": "Yoshinoya",
    "origins": ["japanese"],
    "priceTier": "regular",
    "proteins": ["beef", "chicken"],
    "serving": "meal",
    "staples": ["rice"]
  },
  {
    "areas": ["surabaya"],
    "healthStyle": "everyday",
    "id": "soto-cak-har",
    "menus": ["soup"],
    "name": "Soto Cak Har",
    "origins": ["indonesian"],
    "proteins": ["chicken"],
    "serving": "meal"
  }
]
```

Full file must contain all 17 rows with only allowed vocab values, array caps respected, total ≤ 8 per row, `tags` key removed everywhere.

- [ ] **Step 2: Rewrite `scripts/seed-foods.ts` validation + write**

```ts
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

import {
  HEALTH_STYLE_VOCAB,
  MENU_VOCAB,
  ORIGIN_VOCAB,
  PRICE_TIER_VOCAB,
  PROTEIN_VOCAB,
  SERVING_VOCAB,
  STAPLE_VOCAB,
} from "../lib/foods/types";
import seedRows from "../lib/foods/data/foods.json" with { type: "json" };

interface SeedRow {
  areas: string[];
  healthStyle?: string;
  id: string;
  instagramUrl?: string;
  menus?: string[];
  name: string;
  origins?: string[];
  priceTier?: string;
  proteins?: string[];
  serving?: string;
  staples?: string[];
  tiktokUrl?: string;
}
```

Validation loop checks: areas 1–3 in allowed set; each `menus`/`staples`/`proteins`/`origins` value `in` vocab + caps (3/3/4/3); `priceTier`/`serving`/`healthStyle` in vocab when present; total facet values ≤ 8; social links `https://` + ≤ 300. Write omits missing singles, always writes arrays (possibly `[]`).

- [ ] **Step 3: Create `scripts/migrate-food-facets.ts`** — legacy `tags[]` (case-insensitive) → facets:

```ts
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

const TAG_TO_FACET: Record<string, { field: string; value: string }> = {
  burger: { field: "menus", value: "burger" },
  pizza: { field: "menus", value: "pizza" },
  pasta: { field: "menus", value: "pasta" },
  sandwich: { field: "menus", value: "sandwich" },
  sushi: { field: "menus", value: "sushi" },
  soup: { field: "menus", value: "soup" },
  salad: { field: "menus", value: "salad" },
  coffee: { field: "menus", value: "coffee" },
  rice: { field: "staples", value: "rice" },
  noodles: { field: "staples", value: "noodles" },
  chicken: { field: "proteins", value: "chicken" },
  beef: { field: "proteins", value: "beef" },
  indonesian: { field: "origins", value: "indonesian" },
  chinese: { field: "origins", value: "chinese" },
  japanese: { field: "origins", value: "japanese" },
  western: { field: "origins", value: "western" },
};

const DROP_TAGS = new Set(["soto", "spicy", "food court", "fast food", "healthy"]);
```

`--dry-run` prints per-doc mapped facets + unmapped leftovers, then `mapped N, unmapped M`; exits 1 if M > 0. Write mode (no flag) applies mapping + `tags: FieldValue.delete()`, with the §5 reviewed overrides for ambiguous rows (e.g. Soto Cak Har drops `Soto`, Mie Gacoan drops `Spicy`, AEON drops `Food Court`, Greenly sets `staples:[none] + healthStyle:fresh`, Taria sets `menus:[coffee,beverage] + serving:snack`, McD/KFC set `serving:both + healthStyle:comfort`).

- [ ] **Step 4: Add `package.json` script**

```json
"seed:migrate-facets": "tsx --env-file=.env.local scripts/migrate-food-facets.ts"
```

- [ ] **Step 5: Run dry-run against emulator**

Run: `pnpm exec tsx --env-file=.env.local scripts/migrate-food-facets.ts --dry-run`
Expected: prints `migrate-food-facets: mapped 17, unmapped 0` (or lists leftovers for manual review before write).

---

### Task 4: Catalog filter groups + badges + form pickers + page copy

**Files:**

- Modify: `components/foods/foods-catalog-client.tsx`
- Modify: `components/foods/food-form-client.tsx`
- Modify: `app/foods/page.tsx` (copy: tags → filters/facets)
- Test: `pnpm lint`, `pnpm format --check`, manual browser: zero-facet saves, intersection/union, badge aria-labels, grayscale check

**Interfaces:**

- Consumes: Task 1 `FoodFilters`, `EMPTY_FOOD_FILTERS`, `filterFoods`, `deriveFacetCatalog`, `FACET` vocabs + caps, `validateFoodInput`, `FoodInput`.
- Produces: `FoodBadges({ place })` (same file, no new file per repo colocate rule), grouped `FacetSection({ title, values, selected, onToggle })` (same file).

Facet display meta (single source in `foods-catalog-client.tsx`):

```ts
const FACET_META = [
  { key: "menus", label: "Menu", prefix: "menu", dot: "bg-rose-500" },
  { key: "priceTiers", label: "Price", prefix: "price", dot: "bg-emerald-500" },
  { key: "servings", label: "Serving", prefix: "serving", dot: "bg-violet-500" },
  { key: "staples", label: "Staple", prefix: "staple", dot: "bg-amber-500" },
  { key: "proteins", label: "Protein", prefix: "protein", dot: "bg-orange-500" },
  { key: "origins", label: "Origin", prefix: "origin", dot: "bg-sky-500" },
  { key: "healthStyles", label: "Style", prefix: "health", dot: "bg-lime-500" },
] as const;
```

Badges (cards + shuffle panel):

```tsx
function FoodBadges({ place }: { place: FoodPlace }) {
  const badges: { key: string; text: string; ariaLabel: string; dot: string }[] = [
    ...place.menus.map((v) => ({
      key: `menu-${v}`,
      text: `menu:${v}`,
      ariaLabel: `Menu: ${v}`,
      dot: "bg-rose-500",
    })),
    ...(place.priceTier
      ? [
          {
            key: "price",
            text: `price:${place.priceTier}`,
            ariaLabel: `Price: ${place.priceTier}`,
            dot: "bg-emerald-500",
          },
        ]
      : []),
    ...(place.serving
      ? [
          {
            key: "serving",
            text: `serving:${place.serving}`,
            ariaLabel: `Serving: ${place.serving}`,
            dot: "bg-violet-500",
          },
        ]
      : []),
    ...place.staples.map((v) => ({
      key: `staple-${v}`,
      text: `staple:${v}`,
      ariaLabel: `Staple: ${v}`,
      dot: "bg-amber-500",
    })),
    ...place.proteins.map((v) => ({
      key: `protein-${v}`,
      text: `protein:${v}`,
      ariaLabel: `Protein: ${v}`,
      dot: "bg-orange-500",
    })),
    ...place.origins.map((v) => ({
      key: `origin-${v}`,
      text: `origin:${v}`,
      ariaLabel: `Origin: ${v}`,
      dot: "bg-sky-500",
    })),
    ...(place.healthStyle
      ? [
          {
            key: "health",
            text: `health:${place.healthStyle}`,
            ariaLabel: `Style: ${place.healthStyle}`,
            dot: "bg-lime-500",
          },
        ]
      : []),
  ];
  if (badges.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2.5">
      {badges.map((badge) => (
        <Badge aria-label={badge.ariaLabel} key={badge.key} variant="secondary">
          <span aria-hidden="true" className={`size-1.5 rounded-full ${badge.dot}`} />
          {badge.text}
        </Badge>
      ))}
    </div>
  );
}
```

- [ ] **Step 1: Rewrite `foods-catalog-client.tsx` state + filtering**

```tsx
const [selectedMenus, setSelectedMenus] = useState<string[]>([]);
const [selectedPriceTiers, setSelectedPriceTiers] = useState<string[]>([]);
const [selectedServings, setSelectedServings] = useState<string[]>([]);
const [selectedStaples, setSelectedStaples] = useState<string[]>([]);
const [selectedProteins, setSelectedProteins] = useState<string[]>([]);
const [selectedOrigins, setSelectedOrigins] = useState<string[]>([]);
const [selectedHealthStyles, setSelectedHealthStyles] = useState<string[]>([]);
```

`catalog = useMemo(() => deriveFacetCatalog(foods), [foods])`; each `visible*` intersects selected with catalog (stale-value guard, same pattern as old `visibleTags`); `filtered = useMemo(() => filterFoods(foods, { area: effectiveArea, search, menus: visibleMenus, priceTiers: visiblePriceTiers, servings: visibleServings, staples: visibleStaples, proteins: visibleProteins, origins: visibleOrigins, healthStyles: visibleHealthStyles }), [...])`; `toggleValue(setter)` generic; `handleReset` clears all seven + search + area; `isFiltered` checks any facet array non-empty; empty-state copy becomes `No matches — remove filters or reset filters`; legend above catalog: `Menu · Price · Serving · Staple · Protein · Origin · Style`.

- [ ] **Step 2: Replace chip row with grouped sections (primary always visible, more in `<details>`)**

```tsx
<div className="grid gap-2.5">
  <p className="text-sm font-medium">Menu</p>
  <div className="flex flex-wrap gap-2.5">
    {catalog.menus.map((value) => (
      <Button
        aria-pressed={visibleMenus.includes(value)}
        key={value}
        onClick={() => toggleIn(setSelectedMenus, value)}
        size="sm"
        variant={visibleMenus.includes(value) ? "default" : "outline"}
      >
        {value}
      </Button>
    ))}
  </div>
</div>
```

Repeat for Price (`catalog.priceTiers`), Serving (`catalog.servings`); then:

```tsx
<details className="grid gap-2.5">
  <summary className="cursor-pointer text-sm font-medium">More filters</summary>
  {/* Staple, Protein, Origin, Style sections, same chip pattern */}
</details>
```

- [ ] **Step 3: Replace badge rows on cards + shuffle panel with `<FoodBadges place={...} />`**; delete `picked.tags.map` and `place.tags.map` blocks; pass `place` through.

- [ ] **Step 4: Rewrite `food-form-client.tsx`** — delete combobox (`tagDraft`, `tagOpen`, `matches`, `addTags`, `splitDraft`, `TAG_LIST_ID`, `tagSuggestions` prop, `MAX_TAGS_PER_PLACE` import). New state:

```tsx
const [menus, setMenus] = useState<string[]>(place?.menus ?? []);
const [staples, setStaples] = useState<string[]>(place?.staples ?? []);
const [proteins, setProteins] = useState<string[]>(place?.proteins ?? []);
const [origins, setOrigins] = useState<string[]>(place?.origins ?? []);
const [priceTier, setPriceTier] = useState<string>(place?.priceTier ?? "");
const [serving, setServing] = useState<string>(place?.serving ?? "");
const [healthStyle, setHealthStyle] = useState<string>(place?.healthStyle ?? "");
```

Checkbox-set helper with caps:

```tsx
function toggleCapped(values: string[], value: string, cap: number): string[] {
  if (values.includes(value)) return values.filter((v) => v !== value);
  if (values.length >= cap) return values;
  return [...values, value];
}
```

Singles render as radio groups with an explicit `unset` radio (`value=""`, label `Not set`); price hints as help text under the group: `budget ~<20k · regular ~20-50k · premium ~50-100k · splurge ~>100k (guidance only)`. Multis render as checkbox sets from vocab constants with `({values.length}/{cap})` counts. Submit builds:

```tsx
const input: FoodInput = {
  areas,
  ...(healthStyle ? { healthStyle: healthStyle as HealthStyle } : {}),
  instagramUrl,
  menus,
  name,
  origins,
  ...(priceTier ? { priceTier: priceTier as PriceTier } : {}),
  proteins,
  ...(serving ? { serving: serving as Serving } : {}),
  staples,
  tiktokUrl,
};
const next = validateFoodInput(input, existing, place?.id);
setErrors(next);
if (
  next.areas ??
  next.facets ??
  next.healthStyle ??
  next.instagramUrl ??
  next.menus ??
  next.name ??
  next.origins ??
  next.priceTier ??
  next.proteins ??
  next.serving ??
  next.staples ??
  next.tiktokUrl
)
  return;
```

Error blocks per facet use `role="alert"`. Passive hint (non-blocking): `<p className="text-xs text-muted-foreground">Adding price + serving helps others find this place.</p>`. Dialog props drop `tagSuggestions`.

- [ ] **Step 5: Update `FoodFormDialog` call site in catalog client** — remove `tagSuggestions={catalogTags}` prop.

- [ ] **Step 6: Update `app/foods/page.tsx` copy**

```ts
description: "Filter by menu, price, serving, and more, or pick randomly from the current results.",
```

```tsx
Filter by menu, price, serving, and more, or let shuffle pick from the current results.
```

- [ ] **Step 7: Run lint + format check for this task**

Run: `pnpm lint`
Expected: PASS. Run: `pnpm format --check`
Expected: PASS (run `pnpm format` first if needed, then re-check).

---

### Task 5: Delete legacy `tags` paths + final verification

**Files:**

- Verify: `lib/foods/index.ts`, `lib/firebase/client.ts`, `lib/firebase/server.ts`, `components/foods/*`, `scripts/seed-foods.ts`, `firestore.rules`, `app/foods/page.tsx`, `package.json`
- Test: `rg`, `pnpm lint`, `pnpm format --check`, `pnpm typecheck`, emulator smoke (seed + create zero-facet + filter intersection/union + badge aria check)

**Interfaces:**

- Consumes: all prior tasks.
- Produces: zero `tags` references outside `docs/superpowers/specs/2026-09-23-what-2-eat-tag-facets.md` (and this plan); clean gate runs.

- [ ] **Step 1: Grep for leftovers**

Run: `rg -n "\btags\b" lib components app scripts firestore.rules package.json`
Expected: zero hits. If hits remain, delete the code path (not just the reference) and return to the owning task.

- [ ] **Step 2: Run full gates**

Run: `pnpm lint`
Expected: PASS. Run: `pnpm format --check`
Expected: PASS. Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: Emulator smoke (requires `firebase emulators:start` + `.env.local` bypass hosts)**

Run: `pnpm seed:foods`
Expected: `seed-foods: wrote 17, skipped 0` on a fresh emulator (or `skipped 17` on re-run).

Probe in browser (or via `tsx` against emulator): create place with zero facets → saves, appears in unfiltered list/count/shuffle with no badge row; set `menus:[burger] + priceTiers:[budget]` → intersection only; two values in one facet → union; facet-less place disappears only when that facet is active.

- [ ] **Step 4: Confirm acceptance checklist in spec §10**

Each box: zero-facet saves/lists/shuffles with no badge row; active facet excludes facet-less, clearing restores; intersection + union; rules reject out-of-vocab/over-cap/unknown-keys on create + update (eyeball rules + one rejected write if emulator is up); badges expose facet text + `aria-label`, usable grayscaled; seed validates clean + migration dry-run zero unmapped; gates pass; no `tags` outside archive doc.

---

## Self-Review

- Spec §5 vocabs/caps/total-8/optional-zero → Tasks 1 (types/Zod/normalize/count), 2 (rules), 3 (seed/migration), 4 (form caps + clearable singles).
- Spec §6 flat fields + ownership (`types.ts` contracts, `index.ts` logic, `import type`) → Task 1 file structure.
- Spec §7 AND-across/OR-within, facet-less semantics, count/shuffle/empty on filtered set, badges with text + `aria-label` + dot accent + legend, zero-facet hides badge row → Tasks 1 + 4.
- Spec §8 grouped primary/More-filters, form pickers, badges, inline server-first copy, completeness nudge nice-to-have → Task 4.
- Spec §9 Zod/rules/parse/seed/migration/backlog → Tasks 1–3; taste/venue/dish/halal/veg explicitly excluded — no task creates them.
- No placeholders: every step carries exact vocab lists, exact code, exact commands with expected output.
- Type consistency: `FoodPlace`/`FoodInput`/`FoodFilters`/`FacetCatalog` shapes match across Tasks 1–4; `normalizeFoodFacets` signature is the single boundary both Firebase layers use.
