import { cert, getApps, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

const ALLOWED_AREAS = ["batam", "malang", "surabaya"] as const;

function fail(message: string): never {
  console.error(`migrate-food-areas: ${message}`);
  process.exit(1);
}

function isPlaceholder(value: string | undefined): boolean {
  if (!value) return true;
  return value.startsWith("paste-") || value.startsWith("your-") || value.includes("replace-with");
}

function normalizeArea(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const area = value.trim().toLowerCase();
  return (ALLOWED_AREAS as readonly string[]).includes(area) ? area : null;
}

function normalizeAreas(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  if (value.length < 1 || value.length > 3) return null;
  const areas: string[] = [];
  for (const entry of value) {
    const area = normalizeArea(entry);
    if (!area) return null;
    if (!areas.includes(area)) areas.push(area);
  }
  return ALLOWED_AREAS.filter((area) => areas.includes(area));
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
      `migrate-food-areas: targeting Firestore emulator at ${process.env.FIRESTORE_EMULATOR_HOST}.`,
    );
  }
  const db = getFirestore(app);

  const snapshot = await db.collection("food_places").get();
  let migrated = 0;
  let skipped = 0;
  let needsAttention = 0;
  for (const doc of snapshot.docs) {
    const data = doc.data();
    const hasArea = typeof data["area"] === "string";
    const area = hasArea ? normalizeArea(data["area"]) : null;
    const areas = normalizeAreas(data["areas"]);
    if (areas && hasArea) {
      await doc.ref.update({ area: FieldValue.delete() });
      migrated += 1;
    } else if (areas && !hasArea) {
      skipped += 1;
    } else if (!areas && area) {
      await doc.ref.update({ areas: [area], area: FieldValue.delete() });
      migrated += 1;
    } else {
      console.error(
        `migrate-food-areas: needs attention: ${doc.id} (area=${JSON.stringify(data["area"])} areas=${JSON.stringify(data["areas"])})`,
      );
      needsAttention += 1;
    }
  }
  console.log(
    `migrate-food-areas: migrated ${migrated}, skipped ${skipped}, needs-attention ${needsAttention}.`,
  );
  if (needsAttention > 0) process.exit(1);
}

main().catch((error: unknown) => {
  console.error(`migrate-food-areas: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
