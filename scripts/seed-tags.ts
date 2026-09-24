import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

import {
  HEALTH_STYLE_VOCAB,
  INGREDIENT_VOCAB,
  MENU_VOCAB,
  ORIGIN_VOCAB,
  PRICE_TIER_VOCAB,
  SERVING_VOCAB,
} from "../lib/foods/types";
import { tagDocId } from "../lib/tags/types";

const FACET_GROUPS: { facet: string; values: readonly string[] }[] = [
  { facet: "healthStyle", values: HEALTH_STYLE_VOCAB },
  { facet: "ingredients", values: INGREDIENT_VOCAB },
  { facet: "menus", values: MENU_VOCAB },
  { facet: "origins", values: ORIGIN_VOCAB },
  { facet: "priceTier", values: PRICE_TIER_VOCAB },
  { facet: "servings", values: SERVING_VOCAB },
];

const SOUP_SYNONYMS = ["soto", "bakso", "rawon"];

function fail(message: string): never {
  console.error(`seed-tags: ${message}`);
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
      `seed-tags: targeting Firestore emulator at ${process.env.FIRESTORE_EMULATOR_HOST}.`,
    );
  }
  const db = getFirestore(app);

  const existingDocs = await db.collection("tags").get();
  const existingIds = new Set(existingDocs.docs.map((doc) => doc.id));

  let written = 0;
  let skipped = 0;
  for (const group of FACET_GROUPS) {
    for (const value of group.values) {
      const id = tagDocId(group.facet, value);
      if (existingIds.has(id)) {
        skipped += 1;
        continue;
      }
      await db
        .collection("tags")
        .doc(id)
        .set({
          createdAt: new Date(),
          deprecated: false,
          facet: group.facet,
          synonyms: id === "menus:soup" ? SOUP_SYNONYMS : [],
          updatedAt: new Date(),
          updatedByUid: "seed",
          value,
        });
      written += 1;
    }
  }
  console.log(`seed-tags: wrote ${written}, skipped ${skipped} (already present).`);
}

main().catch((error: unknown) => {
  console.error(`seed-tags: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
