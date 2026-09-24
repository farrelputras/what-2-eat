import foods from "./data/foods.json";
import {
  deriveAreaCatalog,
  deriveFacetCatalog,
  normalizeFoodTags,
  type FacetCatalog,
} from "./index";
import type { FoodPlace } from "./types";

const ALL_FOODS: FoodPlace[] = (
  foods as { areas: string[]; id: string; name: string; tags: unknown }[]
).map((row) => ({
  ...row,
  tags: normalizeFoodTags(row.tags),
}));

export function getAllFoods(): FoodPlace[] {
  return ALL_FOODS;
}

export function getFacetCatalog(): FacetCatalog {
  return deriveFacetCatalog(ALL_FOODS);
}

export function getAreaCatalog(): string[] {
  return deriveAreaCatalog(ALL_FOODS);
}
