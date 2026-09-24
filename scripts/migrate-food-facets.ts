import { cert, getApps, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

interface Facets {
  healthStyle?: string;
  ingredients: string[];
  menus: string[];
  origins: string[];
  priceTier?: string;
  servings: string[];
}

const TAG_TO_FACET: Record<string, { field: keyof Facets; value: string }> = {
  beef: { field: "ingredients", value: "beef" },
  burger: { field: "menus", value: "burger" },
  chicken: { field: "ingredients", value: "chicken" },
  chinese: { field: "origins", value: "chinese" },
  coffee: { field: "menus", value: "coffee" },
  indonesian: { field: "origins", value: "indonesian" },
  japanese: { field: "origins", value: "japanese" },
  noodles: { field: "ingredients", value: "noodles" },
  pasta: { field: "menus", value: "pasta" },
  pizza: { field: "menus", value: "pizza" },
  rice: { field: "ingredients", value: "rice" },
  salad: { field: "menus", value: "salad" },
  sandwich: { field: "menus", value: "sandwich" },
  soup: { field: "menus", value: "soup" },
  sushi: { field: "menus", value: "sushi" },
  western: { field: "origins", value: "western" },
};

// Tags with no facet equivalent. Dropped deliberately: dish-specific (soto),
// taste (spicy), venue (food court), and style judgments (fast food, healthy)
// are backlog per the tag-facets spec, served by name search or later facets.
const DROP_TAGS = new Set(["soto", "spicy", "food court", "fast food", "healthy"]);

// Reviewed mapping for the known catalog. Specific → parent (soto → soup is
// covered by menus:[soup]); dropped tags are listed above, not here.
// serving:both from the old model becomes servings:[meal,snack].
const REVIEWED: Record<string, Facets> = {
  aeon: { ingredients: [], menus: [], origins: ["japanese"], servings: [] },
  dikichi: {
    healthStyle: "everyday",
    ingredients: ["rice", "chicken"],
    menus: ["rice-bowl"],
    origins: ["japanese"],
    servings: ["meal"],
  },
  "dominos-pizza": {
    healthStyle: "comfort",
    ingredients: [],
    menus: ["pizza"],
    origins: ["western"],
    servings: [],
  },
  greenly: {
    healthStyle: "fresh",
    ingredients: ["none"],
    menus: ["salad"],
    origins: ["western"],
    servings: [],
  },
  "j-one": { ingredients: [], menus: [], origins: ["japanese"], servings: [] },
  kfc: {
    healthStyle: "comfort",
    ingredients: ["chicken"],
    menus: ["burger", "fried-chicken"],
    origins: [],
    servings: ["meal", "snack"],
  },
  mcdonalds: {
    healthStyle: "comfort",
    ingredients: ["chicken"],
    menus: ["burger", "fried-chicken"],
    origins: ["western"],
    servings: ["meal", "snack"],
  },
  "mie-gacoan": {
    healthStyle: "everyday",
    ingredients: ["noodles"],
    menus: ["noodle-bowl"],
    origins: ["indonesian"],
    servings: ["meal"],
  },
  "pizza-hut": {
    healthStyle: "comfort",
    ingredients: [],
    menus: ["pizza", "pasta"],
    origins: ["western"],
    servings: [],
  },
  "selamat-sukses": {
    healthStyle: "everyday",
    ingredients: ["rice"],
    menus: ["rice-bowl"],
    origins: ["indonesian"],
    servings: ["meal"],
  },
  "soto-cak-har": {
    healthStyle: "everyday",
    ingredients: ["chicken"],
    menus: ["soup"],
    origins: ["indonesian"],
    servings: ["meal"],
  },
  subway: {
    ingredients: ["beef", "chicken"],
    menus: ["sandwich"],
    origins: ["western"],
    servings: [],
  },
  "sushi-go": {
    healthStyle: "everyday",
    ingredients: ["rice"],
    menus: ["sushi"],
    origins: ["japanese"],
    servings: [],
  },
  taria: { ingredients: [], menus: ["coffee", "beverage"], origins: [], servings: ["snack"] },
  "uncle-w": {
    healthStyle: "everyday",
    ingredients: ["rice"],
    menus: ["rice-bowl"],
    origins: ["chinese"],
    servings: ["meal"],
  },
  warkam: {
    healthStyle: "everyday",
    ingredients: ["rice", "noodles"],
    menus: ["noodle-bowl", "rice-bowl"],
    origins: ["indonesian"],
    servings: ["meal"],
  },
  yoshinoya: {
    healthStyle: "everyday",
    ingredients: ["rice", "beef", "chicken"],
    menus: ["rice-bowl"],
    origins: ["japanese"],
    priceTier: "regular",
    servings: ["meal"],
  },
};

export { DROP_TAGS, REVIEWED, genericMap, overCap };

function fail(message: string): never {
  console.error(`migrate-food-facets: ${message}`);
  process.exit(1);
}

function isPlaceholder(value: string | undefined): boolean {
  if (!value) return true;
  return value.startsWith("paste-") || value.startsWith("your-") || value.includes("replace-with");
}

function pushUnique(list: string[], value: string): void {
  if (!list.includes(value)) list.push(value);
}

function genericMap(tags: string[]): { facets: Facets; unmapped: string[] } {
  const facets: Facets = { ingredients: [], menus: [], origins: [], servings: [] };
  const unmapped: string[] = [];
  for (const raw of tags) {
    const tag = raw.trim().toLowerCase();
    if (tag === "" || DROP_TAGS.has(tag)) continue;
    const mapped = TAG_TO_FACET[tag];
    if (!mapped) {
      unmapped.push(raw);
      continue;
    }
    pushUnique(facets[mapped.field] as string[], mapped.value);
  }
  return { facets, unmapped };
}

function overCap(facets: Facets): string | null {
  if (facets.menus.length > 3) return "menus>3";
  if (facets.servings.length > 2) return "servings>2";
  if (facets.ingredients.length > 5) return "ingredients>5";
  if (facets.origins.length > 3) return "origins>3";
  const total =
    facets.menus.length +
    facets.servings.length +
    facets.ingredients.length +
    facets.origins.length +
    (facets.priceTier ? 1 : 0) +
    (facets.healthStyle ? 1 : 0);
  if (total > 8) return "total>8";
  return null;
}

const LEGACY_KEYS = ["tags", "staples", "proteins", "serving"];

async function main(): Promise<void> {
  const dryRun = process.argv.includes("--dry-run");
  const useEmulator = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
  if (!useEmulator) {
    if (
      isPlaceholder(process.env.FIREBASE_PROJECT_ID) ||
      isPlaceholder(process.env.FIREBASE_CLIENT_EMAIL) ||
      isPlaceholder(process.env.FIREBASE_PRIVATE_KEY)
    ) {
      fail("Admin env is placeholders. Fill in .env.local first (see .env.example).");
    }
    if (!dryRun) {
      fail(
        "refusing to write outside the emulator. Run with --dry-run or set FIRESTORE_EMULATOR_HOST.",
      );
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
  const db = getFirestore(app);

  const snapshot = await db.collection("food_places").get();
  let mapped = 0;
  let skipped = 0;
  let needsAttention = 0;
  for (const doc of snapshot.docs) {
    const data = doc.data();
    const hasLegacy = LEGACY_KEYS.some((key) => key in data);
    if (!hasLegacy && !Array.isArray(data["tags"])) {
      skipped += 1;
      continue;
    }
    const reviewed = REVIEWED[doc.id];
    let facets: Facets;
    let unmapped: string[] = [];
    if (reviewed) {
      facets = reviewed;
    } else if (Array.isArray(data["tags"])) {
      const tags = data["tags"].filter((tag): tag is string => typeof tag === "string");
      const result = genericMap(tags);
      facets = result.facets;
      unmapped = result.unmapped;
    } else {
      facets = {
        ingredients: [],
        menus: [],
        origins: [],
        servings: [],
      };
    }
    const cap = overCap(facets);
    if (unmapped.length > 0 || cap) {
      console.error(
        `migrate-food-facets: needs attention: ${doc.id} (unmapped=${JSON.stringify(unmapped)} cap=${cap})`,
      );
      needsAttention += 1;
      continue;
    }
    console.log(`migrate-food-facets: ${doc.id} → ${JSON.stringify(facets)}`);
    if (!dryRun) {
      await doc.ref.update({
        ...(facets.healthStyle ? { healthStyle: facets.healthStyle } : {}),
        ingredients: facets.ingredients,
        menus: facets.menus,
        origins: facets.origins,
        ...(facets.priceTier ? { priceTier: facets.priceTier } : {}),
        servings: facets.servings,
        proteins: FieldValue.delete(),
        serving: FieldValue.delete(),
        staples: FieldValue.delete(),
        tags: FieldValue.delete(),
      });
    }
    mapped += 1;
  }
  console.log(
    `migrate-food-facets: ${dryRun ? "dry-run " : ""}mapped ${mapped}, skipped ${skipped}, needs-attention ${needsAttention}.`,
  );
  if (needsAttention > 0) process.exit(1);
}

const isMain = process.argv[1]?.endsWith("migrate-food-facets.ts") ?? false;
if (isMain) {
  main().catch((error: unknown) => {
    console.error(`migrate-food-facets: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}
