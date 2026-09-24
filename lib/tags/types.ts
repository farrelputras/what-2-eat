export interface TagDoc {
  deprecated: boolean;
  facet: string;
  id: string;
  synonyms: string[];
  updatedAtMs: number | null;
  updatedByUid: string;
  value: string;
}

export const KNOWN_FACETS = [
  "menus",
  "servings",
  "ingredients",
  "origins",
  "priceTier",
  "healthStyle",
] as const;

export type KnownFacet = (typeof KNOWN_FACETS)[number];

export const PENDING_FACET = "pending";

export function tagDocId(facet: string, value: string): string {
  return `${facet}:${value}`;
}

export function isKnownFacet(facet: string): facet is KnownFacet {
  return (KNOWN_FACETS as readonly string[]).includes(facet);
}
