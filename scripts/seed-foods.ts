import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

import seedRows from "../lib/foods/data/foods.json" with { type: "json" };

interface SeedRow {
  area: string;
  id: string;
  instagramUrl?: string;
  name: string;
  tags: string[];
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
    if (!ALLOWED_AREAS.has(row.area)) fail(`bad area in seed data: ${row.name} → ${row.area}`);
    if (row.tags.length < 1 || row.tags.length > 8) fail(`bad tags in seed data: ${row.name}`);
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
        area: row.area,
        ...(row.instagramUrl ? { instagramUrl: row.instagramUrl } : {}),
        createdAt: new Date(),
        createdByUid: "seed",
        name: row.name,
        tags: row.tags,
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
