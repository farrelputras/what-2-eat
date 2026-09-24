import { z } from "zod";

import type { FoodPlace, HealthStyle, PriceTier } from "./types";
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
  healthStyle?: HealthStyle;
  ingredients: string[];
  instagramUrl?: string;
  menus: string[];
  name: string;
  origins: string[];
  priceTier?: PriceTier;
  servings: string[];
  tiktokUrl?: string;
}

export interface FoodInputErrors {
  areas?: string;
  facets?: string;
  healthStyle?: string;
  ingredients?: string;
  instagramUrl?: string;
  menus?: string;
  name?: string;
  origins?: string;
  priceTier?: string;
  servings?: string;
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

export const MAX_FOOD_URL_LENGTH = 300;

export const FOOD_AREAS = ["batam", "malang", "surabaya"] as const;

const foodInputSchema = z.object({
  areas: z.enum(FOOD_AREAS).array().min(1).max(3),
  healthStyle: z.enum(HEALTH_STYLE_VOCAB).optional(),
  ingredients: z.enum(INGREDIENT_VOCAB).array().max(MAX_INGREDIENTS_PER_PLACE),
  instagramUrl: z.string().max(MAX_FOOD_URL_LENGTH).optional(),
  menus: z.enum(MENU_VOCAB).array().max(MAX_MENUS_PER_PLACE),
  name: z.string().min(1).max(80),
  origins: z.enum(ORIGIN_VOCAB).array().max(MAX_ORIGINS_PER_PLACE),
  priceTier: z.enum(PRICE_TIER_VOCAB).optional(),
  servings: z.enum(SERVING_VOCAB).array().max(MAX_SERVINGS_PER_PLACE),
  tiktokUrl: z.string().max(MAX_FOOD_URL_LENGTH).optional(),
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

export function normalizeFoodFacets(input: {
  healthStyle?: unknown;
  ingredients?: unknown;
  menus?: unknown;
  origins?: unknown;
  priceTier?: unknown;
  servings?: unknown;
}): {
  healthStyle?: HealthStyle;
  ingredients: string[];
  menus: string[];
  origins: string[];
  priceTier?: PriceTier;
  servings: string[];
} {
  const priceTier = normalizeSingle(input.priceTier, PRICE_TIER_VOCAB);
  const healthStyle = normalizeSingle(input.healthStyle, HEALTH_STYLE_VOCAB);
  return {
    ...(healthStyle ? { healthStyle: healthStyle as HealthStyle } : {}),
    ingredients: normalizeMulti(input.ingredients, INGREDIENT_VOCAB, MAX_INGREDIENTS_PER_PLACE),
    menus: normalizeMulti(input.menus, MENU_VOCAB, MAX_MENUS_PER_PLACE),
    origins: normalizeMulti(input.origins, ORIGIN_VOCAB, MAX_ORIGINS_PER_PLACE),
    ...(priceTier ? { priceTier: priceTier as PriceTier } : {}),
    servings: normalizeMulti(input.servings, SERVING_VOCAB, MAX_SERVINGS_PER_PLACE),
  };
}

export function countFacetValues(place: {
  healthStyle?: string;
  ingredients: string[];
  menus: string[];
  origins: string[];
  priceTier?: string;
  servings: string[];
}): number {
  return (
    place.menus.length +
    place.servings.length +
    place.ingredients.length +
    place.origins.length +
    (place.priceTier ? 1 : 0) +
    (place.healthStyle ? 1 : 0)
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
  const facets = normalizeFoodFacets(input);
  const normalized: FoodInput = {
    areas: normalizeFoodAreas(input.areas),
    ...(facets.healthStyle ? { healthStyle: facets.healthStyle } : {}),
    ingredients: facets.ingredients,
    instagramUrl: normalizeFoodUrl(input.instagramUrl),
    menus: facets.menus,
    name: normalizeFoodName(input.name),
    origins: facets.origins,
    ...(facets.priceTier ? { priceTier: facets.priceTier } : {}),
    servings: facets.servings,
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
      } else if (field === "servings" && !errors.servings) {
        errors.servings = "Maximum 2 servings";
      } else if (field === "ingredients" && !errors.ingredients) {
        errors.ingredients = "Maximum 5 ingredients";
      } else if (field === "origins" && !errors.origins) {
        errors.origins = "Maximum 3 origins";
      } else if (field === "priceTier" && !errors.priceTier) {
        errors.priceTier = "Invalid price tier";
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
      healthStyle: normalized.healthStyle,
      ingredients: normalized.ingredients,
      menus: normalized.menus,
      origins: normalized.origins,
      priceTier: normalized.priceTier,
      servings: normalized.servings,
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
    if (area !== "" && area !== "all" && !place.areas.some((item) => item.toLowerCase() === area))
      return false;
    if (menus.size > 0 && !(place.menus ?? []).some((value) => menus.has(value))) return false;
    if (priceTiers.size > 0 && !(place.priceTier && priceTiers.has(place.priceTier))) return false;
    if (servings.size > 0 && !(place.servings ?? []).some((value) => servings.has(value)))
      return false;
    if (ingredients.size > 0 && !(place.ingredients ?? []).some((value) => ingredients.has(value)))
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
    healthStyles: sortedUnique(foods.map((place) => place.healthStyle)),
    ingredients: sortedUnique(foods.flatMap((place) => place.ingredients ?? [])),
    menus: sortedUnique(foods.flatMap((place) => place.menus ?? [])),
    origins: sortedUnique(foods.flatMap((place) => place.origins ?? [])),
    priceTiers: sortedUnique(foods.map((place) => place.priceTier)),
    servings: sortedUnique(foods.flatMap((place) => place.servings ?? [])),
  };
}

export function deriveAreaCatalog(foods: FoodPlace[]): string[] {
  return [...new Set(foods.flatMap((place) => place.areas))].sort((a, b) => a.localeCompare(b));
}

export function pickRandomFood(foods: FoodPlace[]): FoodPlace | undefined {
  if (foods.length === 0) return undefined;
  return foods[Math.floor(Math.random() * foods.length)];
}
