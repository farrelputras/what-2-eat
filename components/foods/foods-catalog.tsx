import type { FoodPlace } from "@/lib/foods/types";

import { FoodsCatalogClient } from "./foods-catalog-client";

interface FoodsCatalogProps {
  areas: string[];
  foods: FoodPlace[];
  tags: string[];
}

export function FoodsCatalog({ areas, foods, tags }: FoodsCatalogProps) {
  return <FoodsCatalogClient areas={areas} foods={foods} tags={tags} />;
}
