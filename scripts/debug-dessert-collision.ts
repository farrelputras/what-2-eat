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
import { findValueCollision, normalizeTagValue, parseTagValue } from "../lib/tags";

// Read-only debug for: '"dessert" already lives in Menu.' when adding
// Dessert to Servings. Zero writes — only collection .get() calls + the same
// findValueCollision() guard the Tags Manager UI uses.
//
// Run: pnpm exec tsx --env-file=.env.local scripts/debug-dessert-collision.ts
//   or: pnpm exec tsx --env-file=.env.local scripts/debug-dessert-collision.ts snack
const TOKEN = (process.argv[2] ?? "dessert").trim().toLowerCase();
const TARGET_FACET = "servings";

function fail(message: string): never {
  console.error(`debug-dessert-collision: ${message}`);
  process.exit(1);
}

function isPlaceholder(value: string | undefined): boolean {
  if (!value) return true;
  return value.startsWith("paste-") || value.startsWith("your-") || value.includes("replace-with");
}

async function main(): Promise<void> {
  const canonical = parseTagValue(TOKEN);
  console.log(`input=${JSON.stringify(TOKEN)} canonical=${JSON.stringify(canonical)}`);

  // 1. Built-in vocab check — this runs before any DB read in the UI.
  const builtIns: Record<string, readonly string[]> = {
    menus: MENU_VOCAB,
    servings: SERVING_VOCAB,
    ingredients: INGREDIENT_VOCAB,
    origins: ORIGIN_VOCAB,
    priceTier: PRICE_TIER_VOCAB,
    healthStyle: HEALTH_STYLE_VOCAB,
  };
  console.log("\n== built-in vocabs ==");
  for (const [facet, vocab] of Object.entries(builtIns)) {
    if ((vocab as readonly string[]).includes(canonical)) {
      console.log(`- ${facet} CONTAINS ${JSON.stringify(canonical)}`);
    }
  }
  const builtinHolder = findValueCollision(canonical, TARGET_FACET);
  console.log(
    `findValueCollision(${JSON.stringify(canonical)}, ${JSON.stringify(TARGET_FACET)}) built-ins only → ${JSON.stringify(builtinHolder)}`,
  );

  // 2. Production registry + usage. Needs Admin SDK env (see .env.example).
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
        ? initializeApp({ projectId: process.env.FIREBASE_PROJECT_ID ?? "what-2-eat-dev" })
        : initializeApp({
            credential: cert({
              clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
              privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
              projectId: process.env.FIREBASE_PROJECT_ID,
            }),
          });
  if (!app) fail("could not init Admin SDK");
  const db = getFirestore(app);
  console.log(
    useEmulator
      ? `\nreading from emulator at ${process.env.FIRESTORE_EMULATOR_HOST}.`
      : "\nreading from production. No writes will be performed.",
  );

  const tagsSnap = await db.collection("tags").get();
  const valueToFacet = new Map<string, string>();
  const dessertDocs: string[] = [];
  for (const doc of tagsSnap.docs) {
    const data = doc.data();
    if (typeof data["facet"] !== "string" || typeof data["value"] !== "string") continue;
    const facet: string = data["facet"];
    const value: string = data["value"];
    if (!valueToFacet.has(value)) valueToFacet.set(value, facet);
    if (normalizeTagValue(value) === canonical) {
      dessertDocs.push(
        `- ${doc.id} facet=${facet} value=${value} deprecated=${data["deprecated"] === true} synonyms=${JSON.stringify(data["synonyms"] ?? [])}`,
      );
    }
  }
  console.log(`\n== tags collection: ${tagsSnap.size} docs ==`);
  console.log(
    `registry valueToFacet(${JSON.stringify(canonical)}) → ${JSON.stringify(valueToFacet.get(canonical) ?? null)}`,
  );
  console.log(
    `findValueCollision with registry → ${JSON.stringify(findValueCollision(canonical, TARGET_FACET, valueToFacet))}`,
  );
  if (dessertDocs.length === 0)
    console.log("(no registry doc holds this value — holder is built-in MENU_VOCAB)");
  else console.log(dessertDocs.join("\n"));

  const placesSnap = await db.collection("food_places").get();
  const holders: { menus: string[]; servings: string[]; open: string[]; pending: string[] } = {
    menus: [],
    servings: [],
    open: [],
    pending: [],
  };
  for (const doc of placesSnap.docs) {
    const data = doc.data();
    const name = typeof data["name"] === "string" ? data["name"] : doc.id;
    const tags = (data["tags"] ?? {}) as Record<string, unknown>;
    const asList = (v: unknown): string[] =>
      Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
    if (asList(tags["menus"]).some((v) => normalizeTagValue(v) === canonical))
      holders.menus.push(name);
    if (asList(tags["servings"]).some((v) => normalizeTagValue(v) === canonical))
      holders.servings.push(name);
    if (asList(tags["pending"]).some((v) => normalizeTagValue(v) === canonical))
      holders.pending.push(name);
    const open = tags["open"];
    if (typeof open === "object" && open !== null) {
      for (const [facet, list] of Object.entries(open as Record<string, unknown>)) {
        if (asList(list).some((v) => normalizeTagValue(v) === canonical))
          holders.open.push(`${name} (open.${facet})`);
      }
    }
  }
  console.log(`\n== food_places: ${placesSnap.size} docs ==`);
  console.log(
    `- menus holds ${JSON.stringify(canonical)}: ${holders.menus.length}x ${holders.menus.slice(0, 10).join(", ")}`,
  );
  console.log(
    `- servings holds ${JSON.stringify(canonical)}: ${holders.servings.length}x ${holders.servings.slice(0, 10).join(", ")}`,
  );
  console.log(
    `- open holds ${JSON.stringify(canonical)}: ${holders.open.length}x ${holders.open.slice(0, 10).join(", ")}`,
  );
  console.log(
    `- pending holds ${JSON.stringify(canonical)}: ${holders.pending.length}x ${holders.pending.slice(0, 10).join(", ")}`,
  );

  console.log("\n== conclusion ==");
  if (builtinHolder) {
    console.log(
      `UI in empty-registry mode blocks Add to Servings because ${JSON.stringify(canonical)} is hard-coded in MENU_VOCAB (lib/foods/types.ts). ` +
        `With a non-empty registry (prod) the guard is registry-only, so the block fires only if the registry itself holds ${JSON.stringify(canonical)} in another facet. ` +
        `Decide product-wise: keep dessert as Menu only, or move it to Servings via the Move dialog (deletes the old holder).`,
    );
  } else {
    console.log("No built-in collision — holder (if any) comes from the registry rows above.");
  }
  console.log("debug-dessert-collision: done. No writes performed.");
}

main().catch((error: unknown) => {
  console.error(
    `debug-dessert-collision: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exit(1);
});
