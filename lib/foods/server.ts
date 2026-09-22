import foods from "./data/foods.json";
import { deriveAreaCatalog, deriveTagCatalog } from "./index";
import type { FoodPlace } from "./types";

const ALL_FOODS = foods as FoodPlace[];

export function getAllFoods(): FoodPlace[] {
  return ALL_FOODS;
}

export function getTagCatalog(): string[] {
  return deriveTagCatalog(ALL_FOODS);
}

export function getAreaCatalog(): string[] {
  return deriveAreaCatalog(ALL_FOODS);
}
