import type { FoodPlace } from "@/lib/foods/types";
import type { TagDoc } from "@/lib/tags/types";

import { TagsManagerClient } from "./tags-manager-client";

interface TagsManagerProps {
  bypass?: boolean;
  initialFoods: FoodPlace[];
  initialTags: TagDoc[];
}

export function TagsManager({ bypass = false, initialFoods, initialTags }: TagsManagerProps) {
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
      <TagsManagerClient bypass={bypass} initialFoods={initialFoods} initialTags={initialTags} />
    </div>
  );
}
