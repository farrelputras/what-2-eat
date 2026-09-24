import { z } from "zod";

import type { FoodPlace, FoodTags, HealthStyle, PriceTier } from "./types";
import {
  HEALTH_STYLE_VOCAB,
  INGREDIENT_VOCAB,
  MENU_VOCAB,
  ORIGIN_VOCAB,
  PRICE_TIER_VOCAB,
  SERVING_VOCAB,
} from "./types";

export interface FoodFilters {
  area: string;
  healthStyles: string[];
  ingredients: string[];
  menus: string[];
  origins: string[];
  priceTiers: string[];
  search: string;
  servings: string[];
}

export interface FoodInput {
  areas: string[];
  instagramUrl?: string;
  name: string;
  tags: FoodTags;
  tiktokUrl?: string;
}

export interface FoodInputErrors {
  areas?: string;
  facets?: string;
  instagramUrl?: string;
  name?: string;
  tags?: string;
  tiktokUrl?: string;
}

export const EMPTY_FOOD_FILTERS: FoodFilters = {
  area: "all",
  healthStyles: [],
  ingredients: [],
  menus: [],
  origins: [],
  priceTiers: [],
  search: "",
  servings: [],
};

export const MAX_MENUS_PER_PLACE = 3;
export const MAX_SERVINGS_PER_PLACE = 2;
export const MAX_INGREDIENTS_PER_PLACE = 5;
export const MAX_ORIGINS_PER_PLACE = 3;
export const MAX_FACET_VALUES_PER_PLACE = 8;
export const MAX_PENDING_PER_PLACE = 8;
export const MAX_PENDING_TAG_LENGTH = 24;

export const MAX_FOOD_URL_LENGTH = 300;

export const FOOD_AREAS = ["batam", "malang", "surabaya"] as const;

const foodTagsSchema = z.object({
  healthStyle: z.enum(HEALTH_STYLE_VOCAB).optional(),
  ingredients: z.enum(INGREDIENT_VOCAB).array().max(MAX_INGREDIENTS_PER_PLACE),
  menus: z.enum(MENU_VOCAB).array().max(MAX_MENUS_PER_PLACE),
  origins: z.enum(ORIGIN_VOCAB).array().max(MAX_ORIGINS_PER_PLACE),
  pending: z.string().min(1).max(MAX_PENDING_TAG_LENGTH).array().max(MAX_PENDING_PER_PLACE),
  priceTier: z.enum(PRICE_TIER_VOCAB).optional(),
  servings: z.enum(SERVING_VOCAB).array().max(MAX_SERVINGS_PER_PLACE),
});

const foodInputSchema = z
  .object({
    areas: z.enum(FOOD_AREAS).array().min(1).max(3),
    instagramUrl: z.string().max(MAX_FOOD_URL_LENGTH).optional(),
    name: z.string().min(1).max(80),
    tags: foodTagsSchema,
    tiktokUrl: z.string().max(MAX_FOOD_URL_LENGTH).optional(),
  })
  .refine((value) => countFacetValues(value.tags) <= MAX_FACET_VALUES_PER_PLACE, {
    message: "Maximum 8 facet values total",
    path: ["tags"],
  });

export function normalizeSearch(value: string): string {
  return value.trim().toLowerCase();
}

export function normalizeFoodName(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export function normalizeFoodAreas(values: string[]): string[] {
  const allowed = new Set<string>(FOOD_AREAS);
  const seen = new Set<string>();
  for (const raw of values) {
    const area = raw.trim().toLowerCase();
    if (area === "" || !allowed.has(area) || seen.has(area)) continue;
    seen.add(area);
  }
  return FOOD_AREAS.filter((area) => seen.has(area)).slice(0, FOOD_AREAS.length);
}

export function formatFacetValue(value: string): string {
  return value
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

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

function normalizePending(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    if (typeof raw !== "string") continue;
    const value = raw.trim().toLowerCase();
    if (value === "" || seen.has(value)) continue;
    seen.add(value);
    out.push(value);
    if (out.length >= MAX_PENDING_PER_PLACE) break;
  }
  return out;
}

export function normalizeFoodTags(input: unknown): FoodTags {
  const data =
    typeof input === "object" && input !== null ? (input as Record<string, unknown>) : {};
  const priceTier = normalizeSingle(data["priceTier"], PRICE_TIER_VOCAB);
  const healthStyle = normalizeSingle(data["healthStyle"], HEALTH_STYLE_VOCAB);
  return {
    ...(healthStyle ? { healthStyle: healthStyle as HealthStyle } : {}),
    ingredients: normalizeMulti(data["ingredients"], INGREDIENT_VOCAB, MAX_INGREDIENTS_PER_PLACE),
    menus: normalizeMulti(data["menus"], MENU_VOCAB, MAX_MENUS_PER_PLACE),
    origins: normalizeMulti(data["origins"], ORIGIN_VOCAB, MAX_ORIGINS_PER_PLACE),
    pending: normalizePending(data["pending"]),
    ...(priceTier ? { priceTier: priceTier as PriceTier } : {}),
    servings: normalizeMulti(data["servings"], SERVING_VOCAB, MAX_SERVINGS_PER_PLACE),
  };
}

const DISH_TO_MENU: Record<string, string> = {
  bakso: "soup",
  rawon: "soup",
  soto: "soup",
};

const FACET_PREFIXES: Record<string, keyof Omit<FoodTags, "pending">> = {
  health: "healthStyle",
  healthstyle: "healthStyle",
  ingredient: "ingredients",
  ingredients: "ingredients",
  menu: "menus",
  menus: "menus",
  origin: "origins",
  origins: "origins",
  price: "priceTier",
  pricetier: "priceTier",
  serving: "servings",
  servings: "servings",
  style: "healthStyle",
};

const VOCAB_BY_FACET: Record<keyof Omit<FoodTags, "pending">, ReadonlySet<string>> = {
  healthStyle: new Set<string>(HEALTH_STYLE_VOCAB),
  ingredients: new Set<string>(INGREDIENT_VOCAB),
  menus: new Set<string>(MENU_VOCAB),
  origins: new Set<string>(ORIGIN_VOCAB),
  priceTier: new Set<string>(PRICE_TIER_VOCAB),
  servings: new Set<string>(SERVING_VOCAB),
};

function facetForValue(value: string): keyof Omit<FoodTags, "pending"> | undefined {
  const facets: (keyof Omit<FoodTags, "pending">)[] = [
    "menus",
    "servings",
    "ingredients",
    "origins",
    "priceTier",
    "healthStyle",
  ];
  for (const facet of facets) {
    if (VOCAB_BY_FACET[facet].has(value)) return facet;
  }
  return undefined;
}

export function mapFreeTextToTags(tokens: string[]): { tags: FoodTags } {
  const menus: string[] = [];
  const servings: string[] = [];
  const ingredients: string[] = [];
  const origins: string[] = [];
  const pending: string[] = [];
  let priceTier: PriceTier | undefined;
  let healthStyle: HealthStyle | undefined;

  function addMulti(list: string[], value: string): void {
    if (!list.includes(value)) list.push(value);
  }

  function addPending(token: string): void {
    const value = token.trim().toLowerCase();
    if (value === "" || pending.includes(value)) return;
    pending.push(value);
  }

  function assignResolved(facet: keyof Omit<FoodTags, "pending">, value: string): void {
    if (facet === "menus") addMulti(menus, value);
    else if (facet === "servings") addMulti(servings, value);
    else if (facet === "ingredients") addMulti(ingredients, value);
    else if (facet === "origins") addMulti(origins, value);
    else if (facet === "priceTier") priceTier = value as PriceTier;
    else healthStyle = value as HealthStyle;
  }

  for (const raw of tokens) {
    const token = raw.trim().toLowerCase();
    if (token === "") continue;
    const colon = token.indexOf(":");
    if (colon !== -1) {
      const facet = FACET_PREFIXES[token.slice(0, colon).replace(/[^a-z]/g, "")];
      const value = token.slice(colon + 1).trim();
      if (facet && VOCAB_BY_FACET[facet].has(value)) assignResolved(facet, value);
      else addPending(token);
      continue;
    }
    const dishParent = DISH_TO_MENU[token];
    if (dishParent) {
      addMulti(menus, dishParent);
      continue;
    }
    // Bare porridge/mixed collide across vocabs; pin each to one facet so the
    // mapping stays deterministic. facet:value prefixes select explicitly.
    if (token === "porridge") {
      addMulti(menus, token);
      continue;
    }
    if (token === "mixed") {
      addMulti(ingredients, token);
      continue;
    }
    const facet = facetForValue(token);
    if (facet) assignResolved(facet, token);
    else addPending(token);
  }

  return {
    tags: {
      ...(healthStyle ? { healthStyle } : {}),
      ingredients,
      menus,
      origins,
      pending,
      ...(priceTier ? { priceTier } : {}),
      servings,
    },
  };
}

// Serialize tags back to tokens for the edit form. Values that would re-map to
// a different facet bare (ingredients porridge, origins mixed) keep a prefix.
export function foodTagsToTokens(tags: FoodTags): string[] {
  const tokens: string[] = [];
  for (const value of tags.menus) tokens.push(value);
  if (tags.priceTier) tokens.push(tags.priceTier);
  for (const value of tags.servings) tokens.push(value);
  for (const value of tags.ingredients)
    tokens.push(value === "porridge" ? "ingredient:porridge" : value);
  for (const value of tags.origins) tokens.push(value === "mixed" ? "origin:mixed" : value);
  if (tags.healthStyle) tokens.push(tags.healthStyle);
  for (const value of tags.pending) tokens.push(value);
  return tokens;
}

export function countFacetValues(tags: FoodTags): number {
  return (
    tags.menus.length +
    tags.servings.length +
    tags.ingredients.length +
    tags.origins.length +
    (tags.priceTier ? 1 : 0) +
    (tags.healthStyle ? 1 : 0)
  );
}

// Trim only; empty after trim means "no link". Domain-locking can tighten here later.
export function normalizeFoodUrl(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

export function validateFoodInput(
  input: FoodInput,
  existing: FoodPlace[],
  excludeId?: string,
): FoodInputErrors {
  const tags = normalizeFoodTags(input.tags);
  const normalized: FoodInput = {
    areas: normalizeFoodAreas(input.areas),
    instagramUrl: normalizeFoodUrl(input.instagramUrl),
    name: normalizeFoodName(input.name),
    tags,
    tiktokUrl: normalizeFoodUrl(input.tiktokUrl),
  };
  const parsed = foodInputSchema.safeParse(normalized);
  const errors: FoodInputErrors = {};
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      if (issue.code === "custom") {
        if (!errors.facets) errors.facets = "Maximum 8 facet values total";
        continue;
      }
      const field = issue.path[0];
      if (field === "name" && !errors.name) {
        errors.name =
          issue.code === "too_big"
            ? "Name must be at most 80 characters"
            : "Place name is required";
      } else if (field === "areas" && !errors.areas) {
        errors.areas = "Select at least 1 area";
      } else if (field === "tags" && !errors.tags) {
        const sub = issue.path[1];
        if (sub === "menus") errors.tags = "Maximum 3 menu forms";
        else if (sub === "servings") errors.tags = "Maximum 2 servings";
        else if (sub === "ingredients") errors.tags = "Maximum 5 ingredients";
        else if (sub === "origins") errors.tags = "Maximum 3 origins";
        else if (sub === "pending") errors.tags = "Each tag must be 1-24 characters (max 8)";
        else if (sub === "priceTier") errors.tags = "Invalid price tier";
        else if (sub === "healthStyle") errors.tags = "Invalid style";
      } else if (field === "instagramUrl" && !errors.instagramUrl) {
        errors.instagramUrl = `Link must be at most ${MAX_FOOD_URL_LENGTH} characters`;
      } else if (field === "tiktokUrl" && !errors.tiktokUrl) {
        errors.tiktokUrl = `Link must be at most ${MAX_FOOD_URL_LENGTH} characters`;
      }
    }
  }
  if (!errors.tags) {
    const raw = input.tags;
    if (raw.menus.length > MAX_MENUS_PER_PLACE) errors.tags = "Maximum 3 menu forms";
    else if (raw.servings.length > MAX_SERVINGS_PER_PLACE) errors.tags = "Maximum 2 servings";
    else if (raw.ingredients.length > MAX_INGREDIENTS_PER_PLACE)
      errors.tags = "Maximum 5 ingredients";
    else if (raw.origins.length > MAX_ORIGINS_PER_PLACE) errors.tags = "Maximum 3 origins";
    else if (raw.pending.length > MAX_PENDING_PER_PLACE) errors.tags = "Maximum 8 pending tags";
  }
  if (countFacetValues(tags) > MAX_FACET_VALUES_PER_PLACE && !errors.facets) {
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

export function slugFoodId(name: string): string {
  const slug =
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "place";
  const rand = Math.floor(Math.random() * 0x10000)
    .toString(16)
    .padStart(4, "0");
  return `${slug}-${rand}`;
}

export function filterFoods(foods: FoodPlace[], filters: FoodFilters): FoodPlace[] {
  const query = normalizeSearch(filters.search);
  const area = filters.area.trim().toLowerCase();
  const menus = new Set(filters.menus);
  const priceTiers = new Set(filters.priceTiers);
  const servings = new Set(filters.servings);
  const ingredients = new Set(filters.ingredients);
  const origins = new Set(filters.origins);
  const healthStyles = new Set(filters.healthStyles);

  return foods.filter((place) => {
    const tags = place.tags;
    if (area !== "" && area !== "all" && !place.areas.some((item) => item.toLowerCase() === area))
      return false;
    if (menus.size > 0 && !tags.menus.some((value) => menus.has(value))) return false;
    if (priceTiers.size > 0 && !(tags.priceTier && priceTiers.has(tags.priceTier))) return false;
    if (servings.size > 0 && !tags.servings.some((value) => servings.has(value))) return false;
    if (ingredients.size > 0 && !tags.ingredients.some((value) => ingredients.has(value)))
      return false;
    if (origins.size > 0 && !tags.origins.some((value) => origins.has(value))) return false;
    if (healthStyles.size > 0 && !(tags.healthStyle && healthStyles.has(tags.healthStyle)))
      return false;
    if (
      query !== "" &&
      !place.name.toLowerCase().includes(query) &&
      !tags.pending.some((token) => token.toLowerCase().includes(query))
    )
      return false;
    return true;
  });
}

export interface FacetCatalog {
  healthStyles: string[];
  ingredients: string[];
  menus: string[];
  origins: string[];
  priceTiers: string[];
  servings: string[];
}

function sortedUnique(values: (string | undefined)[]): string[] {
  return [...new Set(values.filter((value): value is string => typeof value === "string"))].sort(
    (a, b) => a.localeCompare(b),
  );
}

export function deriveFacetCatalog(foods: FoodPlace[]): FacetCatalog {
  return {
    healthStyles: sortedUnique(foods.map((place) => place.tags.healthStyle)),
    ingredients: sortedUnique(foods.flatMap((place) => place.tags.ingredients)),
    menus: sortedUnique(foods.flatMap((place) => place.tags.menus)),
    origins: sortedUnique(foods.flatMap((place) => place.tags.origins)),
    priceTiers: sortedUnique(foods.map((place) => place.tags.priceTier)),
    servings: sortedUnique(foods.flatMap((place) => place.tags.servings)),
  };
}

export function deriveAreaCatalog(foods: FoodPlace[]): string[] {
  return [...new Set(foods.flatMap((place) => place.areas))].sort((a, b) => a.localeCompare(b));
}

export function pickRandomFood(foods: FoodPlace[]): FoodPlace | undefined {
  if (foods.length === 0) return undefined;
  return foods[Math.floor(Math.random() * foods.length)];
}
