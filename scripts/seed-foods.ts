import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

import seedRows from "../lib/foods/data/foods.json" with { type: "json" };
import {
  HEALTH_STYLE_VOCAB,
  INGREDIENT_VOCAB,
  MENU_VOCAB,
  ORIGIN_VOCAB,
  PRICE_TIER_VOCAB,
  SERVING_VOCAB,
} from "../lib/foods/types";

interface SeedTags {
  healthStyle?: string;
  ingredients?: string[];
  menus?: string[];
  open?: Record<string, string[]>;
  origins?: string[];
  pending?: string[];
  priceTier?: string;
  servings?: string[];
}

interface SeedRow {
  areas: string[];
  id: string;
  instagramUrl?: string;
  name: string;
  tags: SeedTags;
  tiktokUrl?: string;
}

const ALLOWED_AREAS = new Set(["batam", "malang", "surabaya"]);

function fail(message: string): never {
  console.error(`seed-foods: ${message}`);
  process.exit(1);
}

function isPlaceholder(value: string | undefined): boolean {
  if (!value) return true;
  return value.startsWith("paste-") || value.startsWith("your-") || value.includes("replace-with");
}

function checkMulti(
  rowName: string,
  field: string,
  values: string[] | undefined,
  vocab: readonly string[],
  cap: number,
): string[] {
  const list = values ?? [];
  if (list.length > cap) fail(`too many ${field} in seed data: ${rowName}`);
  for (const value of list) {
    if (!(vocab as readonly string[]).includes(value)) {
      fail(`bad ${field} in seed data: ${rowName} → ${value}`);
    }
  }
  return list;
}

function checkSingle(
  rowName: string,
  field: string,
  value: string | undefined,
  vocab: readonly string[],
): string | undefined {
  if (value === undefined) return undefined;
  if (!(vocab as readonly string[]).includes(value)) {
    fail(`bad ${field} in seed data: ${rowName} → ${value}`);
  }
  return value;
}

function checkPending(rowName: string, values: string[] | undefined): string[] {
  const list = values ?? [];
  if (list.length > 8) fail(`too many pending tags in seed data: ${rowName}`);
  for (const value of list) {
    if (value.length < 1 || value.length > 24) {
      fail(`bad pending tag in seed data: ${rowName} → ${value}`);
    }
  }
  return list;
}

const SEED_FACET_PATTERN = /^[a-z][A-Za-z0-9]{0,23}$/;
const SEED_VALUE_PATTERN = /^[a-z0-9][a-z0-9-]{0,23}$/;
const SEED_KNOWN_RESERVED = new Set([
  "menus",
  "servings",
  "ingredients",
  "origins",
  "priceTier",
  "healthStyle",
  "pending",
]);

function checkOpen(
  rowName: string,
  open: Record<string, string[]> | undefined,
): Record<string, string[]> {
  if (open === undefined) return {};
  const facets = Object.keys(open);
  if (facets.length > 8) fail(`too many open facets in seed data: ${rowName}`);
  for (const [facet, values] of Object.entries(open)) {
    if (!SEED_FACET_PATTERN.test(facet) || SEED_KNOWN_RESERVED.has(facet)) {
      fail(`bad open facet in seed data: ${rowName} → ${facet}`);
    }
    if (!Array.isArray(values) || values.length > 5) {
      fail(`bad open values in seed data: ${rowName} → ${facet}`);
    }
    for (const value of values) {
      if (!SEED_VALUE_PATTERN.test(value))
        fail(`bad open value in seed data: ${rowName} → ${facet}:${value}`);
    }
  }
  return open;
}

async function main(): Promise<void> {
  const useEmulator = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
  if (!useEmulator) {
    if (
      isPlaceholder(process.env.FIREBASE_PROJECT_ID) ||
      isPlaceholder(process.env.FIREBASE_CLIENT_EMAIL) ||
      isPlaceholder(process.env.FIREBASE_PRIVATE_KEY)
    ) {
      fail("Admin env is placeholders. Fill in .env.local first (see .env.example).");
    }
  }
  const rows = seedRows as SeedRow[];
  const seen = new Set<string>();
  for (const row of rows) {
    const key = row.name.trim().replace(/\s+/g, " ").toLowerCase();
    if (seen.has(key)) fail(`duplicate name in seed data: ${row.name}`);
    seen.add(key);
    if (row.areas.length < 1 || row.areas.length > 3) fail(`bad areas in seed data: ${row.name}`);
    for (const area of row.areas) {
      if (!ALLOWED_AREAS.has(area)) fail(`bad area in seed data: ${row.name} → ${area}`);
    }
    if (typeof row.tags !== "object" || row.tags === null) {
      fail(`missing tags map in seed data: ${row.name}`);
    }
    const menus = checkMulti(row.name, "tags.menus", row.tags.menus, MENU_VOCAB, 3);
    const servings = checkMulti(row.name, "tags.servings", row.tags.servings, SERVING_VOCAB, 2);
    const ingredients = checkMulti(
      row.name,
      "tags.ingredients",
      row.tags.ingredients,
      INGREDIENT_VOCAB,
      5,
    );
    const origins = checkMulti(row.name, "tags.origins", row.tags.origins, ORIGIN_VOCAB, 3);
    const priceTier = checkSingle(row.name, "tags.priceTier", row.tags.priceTier, PRICE_TIER_VOCAB);
    const healthStyle = checkSingle(
      row.name,
      "tags.healthStyle",
      row.tags.healthStyle,
      HEALTH_STYLE_VOCAB,
    );
    checkPending(row.name, row.tags.pending);
    const open = checkOpen(row.name, row.tags.open);
    const openTotal = Object.values(open).reduce((sum, list) => sum + list.length, 0);
    const total =
      menus.length +
      servings.length +
      ingredients.length +
      origins.length +
      (priceTier ? 1 : 0) +
      (healthStyle ? 1 : 0) +
      openTotal;
    if (total > 8) fail(`too many facet values in seed data: ${row.name}`);
    for (const url of [row.instagramUrl, row.tiktokUrl]) {
      if (url === undefined) continue;
      if (!url.startsWith("https://") || url.length > 300) {
        fail(`bad social link in seed data: ${row.name} → ${url}`);
      }
    }
  }

  const existing = getApps();
  const app =
    existing.length > 0
      ? existing[0]
      : useEmulator
        ? initializeApp({
            projectId: process.env.FIREBASE_PROJECT_ID ?? "what-2-eat-dev",
          })
        : initializeApp({
            credential: cert({
              clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
              privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
              projectId: process.env.FIREBASE_PROJECT_ID,
            }),
          });
  if (!app) fail("could not init Admin SDK");
  if (useEmulator) {
    console.log(
      `seed-foods: targeting Firestore emulator at ${process.env.FIRESTORE_EMULATOR_HOST}.`,
    );
  }
  const db = getFirestore(app);

  const existingDocs = await db.collection("food_places").get();
  const existingNames = new Set(
    existingDocs.docs.map((doc) => String(doc.data()["name"] ?? "").toLowerCase()),
  );

  let written = 0;
  let skipped = 0;
  for (const row of rows) {
    if (existingNames.has(row.name.toLowerCase())) {
      skipped += 1;
      continue;
    }
    await db
      .collection("food_places")
      .doc(row.id)
      .set({
        areas: row.areas,
        createdAt: new Date(),
        createdByUid: "seed",
        ...(row.instagramUrl ? { instagramUrl: row.instagramUrl } : {}),
        name: row.name,
        tags: {
          ...(row.tags.healthStyle ? { healthStyle: row.tags.healthStyle } : {}),
          ingredients: row.tags.ingredients ?? [],
          menus: row.tags.menus ?? [],
          ...(row.tags.open && Object.keys(row.tags.open).length > 0
            ? { open: row.tags.open }
            : {}),
          origins: row.tags.origins ?? [],
          pending: row.tags.pending ?? [],
          ...(row.tags.priceTier ? { priceTier: row.tags.priceTier } : {}),
          servings: row.tags.servings ?? [],
        },
        ...(row.tiktokUrl ? { tiktokUrl: row.tiktokUrl } : {}),
        updatedAt: new Date(),
      });
    written += 1;
  }
  console.log(`seed-foods: wrote ${written}, skipped ${skipped} (already present).`);
}

main().catch((error: unknown) => {
  console.error(`seed-foods: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
