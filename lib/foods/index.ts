import { z } from "zod";

import type { FoodOverridesV1, FoodPlace } from "./types";

export interface FoodFilters {
  area: string;
  search: string;
  tags: string[];
}

export interface FoodInput {
  area: string;
  name: string;
  tags: string[];
}

export interface FoodInputErrors {
  area?: string;
  name?: string;
  tags?: string;
}

export const EMPTY_FOOD_FILTERS: FoodFilters = {
  area: "all",
  search: "",
  tags: [],
};

export const MAX_TAGS_PER_PLACE = 8;

export const FOOD_AREAS = ["batam", "malang", "surabaya"] as const;

const foodInputSchema = z.object({
  area: z.enum(FOOD_AREAS),
  name: z.string().min(1).max(80),
  tags: z.string().min(1).max(24).array().min(1).max(8),
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

export function validateFoodInput(
  input: FoodInput,
  existing: FoodPlace[],
  excludeId?: string,
): FoodInputErrors {
  const normalized: FoodInput = {
    area: normalizeFoodArea(input.area),
    name: normalizeFoodName(input.name),
    tags: normalizeFoodTags(input.tags),
  };
  const parsed = foodInputSchema.safeParse(normalized);
  const errors: FoodInputErrors = {};
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const field = issue.path[0];
      if (field === "name" && !errors.name) {
        errors.name =
          issue.code === "too_big" ? "Nama maksimal 80 karakter" : "Nama tempat wajib diisi";
      } else if (field === "area" && !errors.area) {
        errors.area = "Pilih area";
      } else if (field === "tags" && !errors.tags) {
        errors.tags =
          issue.code === "too_big"
            ? issue.path.length > 1
              ? "Tiap tag maksimal 24 karakter"
              : "Maksimal 8 tag"
            : "Tambahkan minimal 1 tag";
      }
    }
  }
  if (!errors.name) {
    const duplicate = existing.some(
      (place) =>
        place.id !== excludeId &&
        normalizeFoodName(place.name).toLowerCase() === normalized.name.toLowerCase(),
    );
    if (duplicate) errors.name = "Sudah ada tempat dengan nama ini";
  }
  return errors;
}

export function mergeFoods(seed: FoodPlace[], overrides: FoodOverridesV1): FoodPlace[] {
  const tombstones = new Set(overrides.deletedSeedIds);
  const merged = seed
    .filter((place) => !tombstones.has(place.id))
    .map((place) => overrides.upserts[place.id] ?? place);
  for (const [id, place] of Object.entries(overrides.upserts)) {
    if (tombstones.has(id)) continue;
    if (!seed.some((item) => item.id === id)) merged.push(place);
  }
  return merged;
}

export function slugFoodId(name: string): string {
  const slug =
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "tempat";
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
