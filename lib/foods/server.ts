import foods from "./data/foods.json";
import { deriveAreaCatalog, deriveFacetCatalog, type FacetCatalog } from "./index";
import type { FoodPlace } from "./types";

const ALL_FOODS = foods as FoodPlace[];

export function getAllFoods(): FoodPlace[] {
  return ALL_FOODS;
}

export function getFacetCatalog(): FacetCatalog {
  return deriveFacetCatalog(ALL_FOODS);
}

export function getAreaCatalog(): string[] {
  return deriveAreaCatalog(ALL_FOODS);
}
