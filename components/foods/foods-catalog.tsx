import type { FoodPlace } from "@/lib/foods/types";

import { FoodsCatalogClient } from "./foods-catalog-client";

interface FoodsCatalogProps {
  bypass?: boolean;
  initialFoods: FoodPlace[];
}

export function FoodsCatalog({ bypass = false, initialFoods }: FoodsCatalogProps) {
  return (
    <div className="grid gap-5">
      {bypass && (
        <p
          className="rounded-lg border border-dashed p-5 text-sm text-muted-foreground"
          role="status"
        >
          Test mode — auth bypass active, using emulator data.
        </p>
      )}
      <FoodsCatalogClient bypass={bypass} initialFoods={initialFoods} />
    </div>
  );
}
