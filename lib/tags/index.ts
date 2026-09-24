import type { FoodPlace, FoodTags } from "@/lib/foods/types";
import {
  HEALTH_STYLE_VOCAB,
  INGREDIENT_VOCAB,
  MENU_VOCAB,
  ORIGIN_VOCAB,
  PRICE_TIER_VOCAB,
  SERVING_VOCAB,
} from "@/lib/foods/types";

import { isKnownFacet, PENDING_FACET, type TagDoc } from "./types";

export const MAX_TAG_SYNONYMS = 20;

export const MAX_TAG_ID_LENGTH = 24;

const FACET_PATTERN = /^[a-z][A-Za-z0-9]{0,23}$/;

const VALUE_PATTERN = /^[a-z0-9][a-z0-9-]{0,23}$/;

const TAG_DOC_KEYS = new Set([
  "createdAt",
  "deprecated",
  "facet",
  "synonyms",
  "updatedAt",
  "updatedByUid",
  "value",
]);

export function isValidTagFacet(facet: string): boolean {
  return FACET_PATTERN.test(facet);
}

export function isValidTagValue(value: string): boolean {
  return VALUE_PATTERN.test(value);
}

const BUILT_IN_BY_FACET: Record<string, ReadonlySet<string>> = {
  menus: new Set<string>(MENU_VOCAB),
  servings: new Set<string>(SERVING_VOCAB),
  ingredients: new Set<string>(INGREDIENT_VOCAB),
  origins: new Set<string>(ORIGIN_VOCAB),
  priceTier: new Set<string>(PRICE_TIER_VOCAB),
  healthStyle: new Set<string>(HEALTH_STYLE_VOCAB),
};

// Cross-facet duplicate check: a value may only live in one facet so bare
// tokens keep resolving deterministically (porridge/mixed stay pinned).
export function findValueCollision(
  value: string,
  excludeFacet: string,
  registryValueToFacet?: ReadonlyMap<string, string>,
): string | null {
  const token = normalizeTagValue(value);
  if (token === "") return null;
  for (const [facet, vocab] of Object.entries(BUILT_IN_BY_FACET)) {
    if (facet !== excludeFacet && vocab.has(token)) return facet;
  }
  const holder = registryValueToFacet?.get(token);
  if (holder && holder !== excludeFacet) return holder;
  return null;
}

export function normalizeTagValue(value: string): string {
  return value.trim().toLowerCase();
}

// Human input → canonical registry value: "Rice Bowl" becomes "rice-bowl".
// Spaces and underscores fold to hyphens, the rest is lowercased and stripped
// to [a-z0-9-]. Returns "" when nothing valid remains; length is left for
// isValidTagValue so over-long input errors instead of silently truncating.
export function parseTagValue(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Human input → canonical facet: "Taste" becomes "taste", "Price Tier"
// becomes "priceTier". Separators camelCase the next word; existing camelCase
// passes through untouched. Returns "" when nothing valid remains.
export function parseTagFacet(raw: string): string {
  const parts = raw
    .trim()
    .split(/[\s\-_]+/)
    .map((part) => part.replace(/[^A-Za-z0-9]/g, ""))
    .filter((part) => part !== "");
  if (parts.length === 0) return "";
  const [first, ...rest] = parts as [string, ...string[]];
  const head = first.charAt(0).toLowerCase() + first.slice(1);
  const tail = rest.map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join("");
  return head + tail;
}

function toMillis(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.getTime();
  if (typeof value === "object" && value !== null) {
    const candidate = value as { toMillis?: unknown; seconds?: unknown };
    if (typeof candidate.toMillis === "function") {
      const millis = (candidate.toMillis as () => unknown)();
      if (typeof millis === "number" && Number.isFinite(millis)) return millis;
    }
    if (typeof candidate.seconds === "number" && Number.isFinite(candidate.seconds)) {
      return candidate.seconds * 1000;
    }
  }
  return null;
}

function normalizeSynonyms(values: unknown): string[] | null {
  if (values === undefined) return [];
  if (!Array.isArray(values) || values.length > MAX_TAG_SYNONYMS) return null;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    if (typeof raw !== "string") return null;
    const synonym = normalizeTagValue(raw);
    if (synonym === "" || synonym.length > MAX_TAG_ID_LENGTH || seen.has(synonym)) return null;
    seen.add(synonym);
    out.push(synonym);
  }
  return out;
}

// Corrupt doc → null so transports skip it and never null the list.
export function normalizeTagDoc(id: string, data: unknown): TagDoc | null {
  if (typeof data !== "object" || data === null) return null;
  const record = data as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (!TAG_DOC_KEYS.has(key)) return null;
  }
  const facet = record["facet"];
  const value = record["value"];
  if (typeof facet !== "string" || !isValidTagFacet(facet)) return null;
  if (typeof value !== "string" || !isValidTagValue(value)) return null;
  const synonyms = normalizeSynonyms(record["synonyms"]);
  if (synonyms === null) return null;
  const deprecatedRaw = record["deprecated"];
  if (deprecatedRaw !== undefined && typeof deprecatedRaw !== "boolean") return null;
  const updatedByRaw = record["updatedByUid"];
  if (updatedByRaw !== undefined && typeof updatedByRaw !== "string") return null;
  return {
    deprecated: deprecatedRaw ?? false,
    facet,
    id,
    synonyms,
    updatedAtMs: toMillis(record["updatedAt"]) ?? toMillis(record["createdAt"]),
    updatedByUid: typeof updatedByRaw === "string" ? updatedByRaw : "",
    value,
  };
}

export interface RegistrySynonymTarget {
  facet: string;
  value: string;
}

export interface RegistryMaps {
  deprecatedIds: ReadonlySet<string>;
  openFacets: string[];
  suggestionsByFacet: ReadonlyMap<string, string[]>;
  synonymToTag: ReadonlyMap<string, RegistrySynonymTarget>;
  valueToFacet: ReadonlyMap<string, string>;
}

function sortedValues(values: Set<string>): string[] {
  return [...values].sort((a, b) => a.localeCompare(b));
}

export function buildRegistryMaps(tags: TagDoc[]): RegistryMaps {
  const deprecatedIds = new Set<string>();
  const suggestions = new Map<string, Set<string>>();
  const synonymToTag = new Map<string, RegistrySynonymTarget>();
  const valueToFacet = new Map<string, string>();

  const ordered = [...tags].sort((a, b) => a.id.localeCompare(b.id));
  for (const tag of ordered) {
    if (tag.deprecated) deprecatedIds.add(tag.id);
    if (!valueToFacet.has(tag.value)) valueToFacet.set(tag.value, tag.facet);
    if (tag.facet === PENDING_FACET) continue;
    if (!tag.deprecated) {
      const group = suggestions.get(tag.facet) ?? new Set<string>();
      group.add(tag.value);
      suggestions.set(tag.facet, group);
    }
    for (const synonym of tag.synonyms) {
      if (!synonymToTag.has(synonym))
        synonymToTag.set(synonym, { facet: tag.facet, value: tag.value });
    }
  }
  // Pin the two legacy cross-vocab collisions to the same facet as
  // mapFreeTextToTags so suggestions and contribution mapping agree.
  if (valueToFacet.get("porridge") !== "menus" && suggestions.get("menus")?.has("porridge")) {
    valueToFacet.set("porridge", "menus");
  }
  if (valueToFacet.get("mixed") !== "ingredients" && suggestions.get("ingredients")?.has("mixed")) {
    valueToFacet.set("mixed", "ingredients");
  }

  const suggestionsByFacet = new Map<string, string[]>();
  for (const [facet, values] of suggestions) suggestionsByFacet.set(facet, sortedValues(values));
  const openFacets = [...suggestions.keys()]
    .filter((facet) => !isKnownFacet(facet))
    .sort((a, b) => a.localeCompare(b));
  return { deprecatedIds, openFacets, suggestionsByFacet, synonymToTag, valueToFacet };
}

export interface TagUsage {
  count: number;
  examples: string[];
}

const MAX_USAGE_EXAMPLES = 3;

function recordUsage(
  target: Map<string, Map<string, { count: number; examples: string[] }>>,
  facet: string,
  value: string,
  placeName: string,
): void {
  let group = target.get(facet);
  if (!group) {
    group = new Map();
    target.set(facet, group);
  }
  const entry = group.get(value) ?? { count: 0, examples: [] };
  entry.count += 1;
  if (entry.examples.length < MAX_USAGE_EXAMPLES && !entry.examples.includes(placeName)) {
    entry.examples.push(placeName);
  }
  group.set(value, entry);
}

// Live-computed from food_places: no stored counters, no writer fanout.
export function describeTagUsage(places: FoodPlace[]): {
  byFacet: ReadonlyMap<string, ReadonlyMap<string, TagUsage>>;
  pending: ReadonlyMap<string, TagUsage>;
} {
  const raw = new Map<string, Map<string, { count: number; examples: string[] }>>();
  const pending = new Map<string, { count: number; examples: string[] }>();
  for (const place of places) {
    const tags = place.tags;
    for (const value of tags.menus) recordUsage(raw, "menus", value, place.name);
    for (const value of tags.servings) recordUsage(raw, "servings", value, place.name);
    for (const value of tags.ingredients) recordUsage(raw, "ingredients", value, place.name);
    for (const value of tags.origins) recordUsage(raw, "origins", value, place.name);
    if (tags.priceTier) recordUsage(raw, "priceTier", tags.priceTier, place.name);
    if (tags.healthStyle) recordUsage(raw, "healthStyle", tags.healthStyle, place.name);
    for (const token of tags.pending) {
      const entry = pending.get(token) ?? { count: 0, examples: [] };
      entry.count += 1;
      if (entry.examples.length < MAX_USAGE_EXAMPLES && !entry.examples.includes(place.name)) {
        entry.examples.push(place.name);
      }
      pending.set(token, entry);
    }
  }
  return { byFacet: raw, pending };
}

function storedValuesFor(place: FoodPlace, facet: string): string[] {
  const tags = place.tags;
  if (facet === "menus") return tags.menus;
  if (facet === "servings") return tags.servings;
  if (facet === "ingredients") return tags.ingredients;
  if (facet === "origins") return tags.origins;
  if (facet === "priceTier") return tags.priceTier ? [tags.priceTier] : [];
  if (facet === "healthStyle") return tags.healthStyle ? [tags.healthStyle] : [];
  // Open facets have no first-class storage yet; pending tokens are the bridge.
  return tags.pending;
}

export interface MergePreview {
  affected: { id: string; name: string }[];
  alreadyTarget: { id: string; name: string }[];
  count: number;
}

export function previewMerge(args: {
  places: FoodPlace[];
  sourceFacet: string;
  sourceValue: string;
  targetFacet: string;
  targetValue: string;
}): MergePreview {
  const source = normalizeTagValue(args.sourceValue);
  const target = normalizeTagValue(args.targetValue);
  const affected: { id: string; name: string }[] = [];
  const alreadyTarget: { id: string; name: string }[] = [];
  for (const place of args.places) {
    const hasSource = storedValuesFor(place, args.sourceFacet).some(
      (value) => normalizeTagValue(value) === source,
    );
    if (hasSource) affected.push({ id: place.id, name: place.name });
    const hasTarget = storedValuesFor(place, args.targetFacet).some(
      (value) => normalizeTagValue(value) === target,
    );
    if (hasTarget) alreadyTarget.push({ id: place.id, name: place.name });
  }
  return { affected, alreadyTarget, count: affected.length };
}

// Open-facet selections match pending tokens until the facet ships first-class
// storage; OR-within the facet, AND-across facets.
export function placeMatchesOpenFacets(
  place: FoodPlace,
  selectedOpen: Record<string, string[]>,
): boolean {
  for (const values of Object.values(selectedOpen)) {
    if (values.length === 0) continue;
    const wanted = new Set(values.map((value) => normalizeTagValue(value)));
    const held = new Set(place.tags.pending.map((token) => normalizeTagValue(token)));
    if (![...wanted].some((value) => held.has(value))) return false;
  }
  return true;
}

// Local batch helper for hard delete: drop the value from its storage.
// Returns null when the place does not hold the value.
export function removeTagValueFromPlace(
  tags: FoodTags,
  facet: string,
  value: string,
): FoodTags | null {
  const target = normalizeTagValue(value);
  if (target === "") return null;
  let touched = false;

  function removeFromList(list: string[]): string[] {
    if (!list.some((item) => normalizeTagValue(item) === target)) return list;
    touched = true;
    return list.filter((item) => normalizeTagValue(item) !== target);
  }

  function removeSingle(single: string | undefined): string | undefined {
    if (single === undefined || normalizeTagValue(single) !== target) return single;
    touched = true;
    return undefined;
  }

  const holder: FoodTags = {
    ingredients: tags.ingredients,
    menus: tags.menus,
    origins: tags.origins,
    pending: tags.pending,
    servings: tags.servings,
  };
  if (tags.healthStyle !== undefined) holder.healthStyle = tags.healthStyle;
  if (tags.priceTier !== undefined) holder.priceTier = tags.priceTier;

  if (facet === "menus") holder.menus = removeFromList(tags.menus);
  else if (facet === "servings") holder.servings = removeFromList(tags.servings);
  else if (facet === "ingredients") holder.ingredients = removeFromList(tags.ingredients);
  else if (facet === "origins") holder.origins = removeFromList(tags.origins);
  else if (facet === "priceTier")
    holder.priceTier = removeSingle(tags.priceTier) as FoodTags["priceTier"];
  else if (facet === "healthStyle")
    holder.healthStyle = removeSingle(tags.healthStyle) as FoodTags["healthStyle"];
  else holder.pending = removeFromList(tags.pending);

  if (!touched) return null;
  return holder;
}

// Local batch helper for rename/merge: drop the source value from its storage
// and add the target value to its facet's storage. Returns null when the place
// does not hold the source value.
export function replaceTagValueInPlace(
  tags: FoodTags,
  sourceFacet: string,
  sourceValue: string,
  targetFacet: string,
  targetValue: string,
): FoodTags | null {
  const source = normalizeTagValue(sourceValue);
  const target = normalizeTagValue(targetValue);
  if (source === "" || target === "") return null;
  let touched = false;

  function removeFromList(list: string[]): string[] {
    if (!list.some((value) => normalizeTagValue(value) === source)) return list;
    touched = true;
    return list.filter((value) => normalizeTagValue(value) !== source);
  }

  function removeSingle(value: string | undefined): string | undefined {
    if (value === undefined || normalizeTagValue(value) !== source) return value;
    touched = true;
    return undefined;
  }

  function addToList(list: string[]): string[] {
    if (list.some((value) => normalizeTagValue(value) === target)) return list;
    return [...list, target];
  }

  const holder: FoodTags = {
    ingredients: tags.ingredients,
    menus: tags.menus,
    origins: tags.origins,
    pending: tags.pending,
    servings: tags.servings,
  };
  if (tags.healthStyle !== undefined) holder.healthStyle = tags.healthStyle;
  if (tags.priceTier !== undefined) holder.priceTier = tags.priceTier;

  if (sourceFacet === "menus") holder.menus = removeFromList(tags.menus);
  else if (sourceFacet === "servings") holder.servings = removeFromList(tags.servings);
  else if (sourceFacet === "ingredients") holder.ingredients = removeFromList(tags.ingredients);
  else if (sourceFacet === "origins") holder.origins = removeFromList(tags.origins);
  else if (sourceFacet === "priceTier")
    holder.priceTier = removeSingle(tags.priceTier) as FoodTags["priceTier"];
  else if (sourceFacet === "healthStyle")
    holder.healthStyle = removeSingle(tags.healthStyle) as FoodTags["healthStyle"];
  else holder.pending = removeFromList(tags.pending);

  if (!touched) return null;

  if (targetFacet === "menus") holder.menus = addToList(holder.menus);
  else if (targetFacet === "servings") holder.servings = addToList(holder.servings);
  else if (targetFacet === "ingredients") holder.ingredients = addToList(holder.ingredients);
  else if (targetFacet === "origins") holder.origins = addToList(holder.origins);
  else if (targetFacet === "priceTier") holder.priceTier = target as FoodTags["priceTier"];
  else if (targetFacet === "healthStyle") holder.healthStyle = target as FoodTags["healthStyle"];
  else holder.pending = addToList(holder.pending);

  return holder;
}
