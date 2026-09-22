export interface FoodPlace {
  area: string;
  id: string;
  name: string;
  tags: string[];
}

export interface FoodOverridesV1 {
  deletedSeedIds: string[];
  upserts: Record<string, FoodPlace>;
  version: 1;
}

export const FOOD_OVERRIDES_STORAGE_KEY = "what2eat.foods.v1";
