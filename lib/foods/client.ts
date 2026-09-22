"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import {
  type FoodInput,
  mergeFoods,
  normalizeFoodArea,
  normalizeFoodName,
  normalizeFoodTags,
  slugFoodId,
} from "./index";
import { FOOD_OVERRIDES_STORAGE_KEY, type FoodOverridesV1, type FoodPlace } from "./types";

export const EMPTY_FOOD_OVERRIDES: FoodOverridesV1 = {
  deletedSeedIds: [],
  upserts: {},
  version: 1,
};

function isFoodPlace(value: unknown): value is FoodPlace {
  if (typeof value !== "object" || value === null) return false;
  const place = value as Record<string, unknown>;
  return (
    typeof place["id"] === "string" &&
    typeof place["name"] === "string" &&
    typeof place["area"] === "string" &&
    Array.isArray(place["tags"]) &&
    place["tags"].every((tag) => typeof tag === "string")
  );
}

export function parseFoodOverrides(raw: unknown): FoodOverridesV1 {
  if (typeof raw !== "object" || raw === null) return EMPTY_FOOD_OVERRIDES;
  const value = raw as Record<string, unknown>;
  if (value["version"] !== 1) return EMPTY_FOOD_OVERRIDES;
  const upserts: Record<string, FoodPlace> = {};
  if (typeof value["upserts"] === "object" && value["upserts"] !== null) {
    for (const [id, place] of Object.entries(value["upserts"] as Record<string, unknown>)) {
      if (typeof id === "string" && isFoodPlace(place)) upserts[id] = place;
    }
  }
  const deletedSeedIds = Array.isArray(value["deletedSeedIds"])
    ? value["deletedSeedIds"].filter((id): id is string => typeof id === "string")
    : [];
  return { deletedSeedIds, upserts, version: 1 };
}

function loadFoodOverrides(): { corrupted: boolean; overrides: FoodOverridesV1 } {
  try {
    const stored = window.localStorage.getItem(FOOD_OVERRIDES_STORAGE_KEY);
    if (stored === null) return { corrupted: false, overrides: EMPTY_FOOD_OVERRIDES };
    return { corrupted: false, overrides: parseFoodOverrides(JSON.parse(stored)) };
  } catch {
    return { corrupted: true, overrides: EMPTY_FOOD_OVERRIDES };
  }
}

function saveFoodOverrides(overrides: FoodOverridesV1): boolean {
  try {
    window.localStorage.setItem(FOOD_OVERRIDES_STORAGE_KEY, JSON.stringify(overrides));
    return true;
  } catch {
    return false;
  }
}

export interface UseFoodsResult {
  createPlace: (input: FoodInput) => FoodPlace;
  foods: FoodPlace[];
  mounted: boolean;
  persistent: boolean;
  removePlace: (id: string) => void;
  updatePlace: (id: string, input: FoodInput) => void;
}

export function useFoods(seedFoods: FoodPlace[]): UseFoodsResult {
  const [overrides, setOverrides] = useState<FoodOverridesV1>(EMPTY_FOOD_OVERRIDES);
  const [mounted, setMounted] = useState(false);
  const [persistent, setPersistent] = useState(true);

  useEffect(() => {
    const { corrupted, overrides: stored } = loadFoodOverrides();
    if (corrupted) toast.warning("Saved data is corrupted — showing the built-in catalog.");
    setOverrides(stored);
    setMounted(true);
  }, []);

  const seedIds = useMemo(() => new Set(seedFoods.map((place) => place.id)), [seedFoods]);
  const foods = useMemo(() => mergeFoods(seedFoods, overrides), [overrides, seedFoods]);

  const commit = useCallback((next: FoodOverridesV1) => {
    setOverrides(next);
    if (!saveFoodOverrides(next)) {
      setPersistent(false);
      toast.error("Failed to save — changes apply to this session only.");
    }
  }, []);

  const createPlace = useCallback(
    (input: FoodInput): FoodPlace => {
      const place: FoodPlace = {
        area: normalizeFoodArea(input.area),
        id: slugFoodId(input.name),
        name: normalizeFoodName(input.name),
        tags: normalizeFoodTags(input.tags),
      };
      commit({ ...overrides, upserts: { ...overrides.upserts, [place.id]: place } });
      return place;
    },
    [commit, overrides],
  );

  const updatePlace = useCallback(
    (id: string, input: FoodInput): void => {
      const current = foods.find((place) => place.id === id);
      if (!current) return;
      const place: FoodPlace = {
        area: normalizeFoodArea(input.area),
        id,
        name: normalizeFoodName(input.name),
        tags: normalizeFoodTags(input.tags),
      };
      commit({ ...overrides, upserts: { ...overrides.upserts, [id]: place } });
    },
    [commit, foods, overrides],
  );

  const removePlace = useCallback(
    (id: string): void => {
      const upserts = { ...overrides.upserts };
      delete upserts[id];
      const deletedSeedIds = seedIds.has(id)
        ? [...overrides.deletedSeedIds, id]
        : overrides.deletedSeedIds;
      commit({ deletedSeedIds, upserts, version: 1 });
    },
    [commit, overrides, seedIds],
  );

  return { createPlace, foods, mounted, persistent, removePlace, updatePlace };
}
