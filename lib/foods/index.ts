import type { FoodPlace } from "./types";

export interface FoodFilters {
  area: string;
  search: string;
  tags: string[];
}

export const EMPTY_FOOD_FILTERS: FoodFilters = {
  area: "all",
  search: "",
  tags: [],
};

export function normalizeSearch(value: string): string {
  return value.trim().toLowerCase();
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
