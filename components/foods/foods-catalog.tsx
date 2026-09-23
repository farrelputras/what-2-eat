import type { FoodPlace } from "@/lib/foods/types";

import { FoodsCatalogClient } from "./foods-catalog-client";

interface FoodsCatalogProps {
  initialFoods: FoodPlace[];
}

export function FoodsCatalog({ initialFoods }: FoodsCatalogProps) {
  return <FoodsCatalogClient initialFoods={initialFoods} />;
}
