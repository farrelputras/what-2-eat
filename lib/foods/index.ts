import { z } from "zod";

import type { FoodPlace } from "./types";

export interface FoodFilters {
  area: string;
  search: string;
  tags: string[];
}

export interface FoodInput {
  area: string;
  instagramUrl?: string;
  name: string;
  tags: string[];
  tiktokUrl?: string;
}

export interface FoodInputErrors {
  area?: string;
  instagramUrl?: string;
  name?: string;
  tags?: string;
  tiktokUrl?: string;
}

export const EMPTY_FOOD_FILTERS: FoodFilters = {
  area: "all",
  search: "",
  tags: [],
};

export const MAX_TAGS_PER_PLACE = 8;

export const MAX_FOOD_URL_LENGTH = 300;

export const FOOD_AREAS = ["batam", "malang", "surabaya"] as const;

const foodInputSchema = z.object({
  area: z.enum(FOOD_AREAS),
  instagramUrl: z.string().max(MAX_FOOD_URL_LENGTH).optional(),
  name: z.string().min(1).max(80),
  tags: z.string().min(1).max(24).array().min(1).max(8),
  tiktokUrl: z.string().max(MAX_FOOD_URL_LENGTH).optional(),
});

export function normalizeSearch(value: string): string {
  return value.trim().toLowerCase();
}

export function normalizeFoodName(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export function normalizeFoodArea(value: string): string {
  return value.trim().toLowerCase();
}

export function normalizeFoodTags(values: string[]): string[] {
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const raw of values) {
    const tag = raw.trim().replace(/\s+/g, " ");
    if (tag === "" || seen.has(tag.toLowerCase())) continue;
    seen.add(tag.toLowerCase());
    tags.push(tag);
    if (tags.length >= MAX_TAGS_PER_PLACE) break;
  }
  return tags;
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
  const normalized: FoodInput = {
    area: normalizeFoodArea(input.area),
    instagramUrl: normalizeFoodUrl(input.instagramUrl),
    name: normalizeFoodName(input.name),
    tags: normalizeFoodTags(input.tags),
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
      } else if (field === "area" && !errors.area) {
        errors.area = "Select an area";
      } else if (field === "tags" && !errors.tags) {
        errors.tags =
          issue.code === "too_big"
            ? issue.path.length > 1
              ? "Each tag must be at most 24 characters"
              : "Maximum 8 tags"
            : "Add at least 1 tag";
      } else if (field === "instagramUrl" && !errors.instagramUrl) {
        errors.instagramUrl = `Link must be at most ${MAX_FOOD_URL_LENGTH} characters`;
      } else if (field === "tiktokUrl" && !errors.tiktokUrl) {
        errors.tiktokUrl = `Link must be at most ${MAX_FOOD_URL_LENGTH} characters`;
      }
    }
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
  const selectedTags = new Set(filters.tags);
  const area = filters.area.trim().toLowerCase();

  return foods.filter((place) => {
    if (area !== "" && area !== "all" && place.area.toLowerCase() !== area) return false;
    if (selectedTags.size > 0 && !place.tags.some((tag) => selectedTags.has(tag))) return false;
    if (query !== "" && !place.name.toLowerCase().includes(query)) return false;
    return true;
  });
}

export function deriveTagCatalog(foods: FoodPlace[]): string[] {
  return [...new Set(foods.flatMap((place) => place.tags))].sort((a, b) => a.localeCompare(b));
}

export function deriveAreaCatalog(foods: FoodPlace[]): string[] {
  return [...new Set(foods.map((place) => place.area))].sort((a, b) => a.localeCompare(b));
}

export function pickRandomFood(foods: FoodPlace[]): FoodPlace | undefined {
  if (foods.length === 0) return undefined;
  return foods[Math.floor(Math.random() * foods.length)];
}
