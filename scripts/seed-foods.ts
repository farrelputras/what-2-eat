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

interface SeedRow {
  areas: string[];
  healthStyle?: string;
  id: string;
  ingredients?: string[];
  instagramUrl?: string;
  menus?: string[];
  name: string;
  origins?: string[];
  priceTier?: string;
  servings?: string[];
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
    const menus = checkMulti(row.name, "menus", row.menus, MENU_VOCAB, 3);
    const servings = checkMulti(row.name, "servings", row.servings, SERVING_VOCAB, 2);
    const ingredients = checkMulti(row.name, "ingredients", row.ingredients, INGREDIENT_VOCAB, 5);
    const origins = checkMulti(row.name, "origins", row.origins, ORIGIN_VOCAB, 3);
    const priceTier = checkSingle(row.name, "priceTier", row.priceTier, PRICE_TIER_VOCAB);
    const healthStyle = checkSingle(row.name, "healthStyle", row.healthStyle, HEALTH_STYLE_VOCAB);
    const total =
      menus.length +
      servings.length +
      ingredients.length +
      origins.length +
      (priceTier ? 1 : 0) +
      (healthStyle ? 1 : 0);
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
        ...(row.healthStyle ? { healthStyle: row.healthStyle } : {}),
        ingredients: row.ingredients ?? [],
        ...(row.instagramUrl ? { instagramUrl: row.instagramUrl } : {}),
        createdAt: new Date(),
        createdByUid: "seed",
        menus: row.menus ?? [],
        name: row.name,
        origins: row.origins ?? [],
        ...(row.priceTier ? { priceTier: row.priceTier } : {}),
        servings: row.servings ?? [],
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
