import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

import { isKnownFacet } from "../lib/tags/types";

// Production migration for PRD-1 (open-facet first-class storage).
//
// Runbook:
// 1. `pnpm audit:tags` — confirm relocatable pending tokens and zero refusals.
// 2. Dry-run: `pnpm seed:migrate-open -- --dry-run` (default). Prints per-doc
//    relocations plus unmapped leftovers; exits 1 if any relocation would
//    violate caps.
// 3. Write: `pnpm seed:migrate-open -- --write`. Applies relocation + trims
//    pending in the same write, chunked batches, per-doc validated.
// 4. Re-run dry-run to confirm idempotence (zero relocations, zero refusals).
// No dual-write: the relocated token is removed from pending in the same write.

const MAX_OPEN_VALUES_PER_FACET = 5;
const MAX_OPEN_FACETS_PER_PLACE = 8;
const MAX_RESOLVED_PER_PLACE = 8;

function fail(message: string): never {
  console.error(`migrate-open-facets: ${message}`);
  process.exit(1);
}

function isPlaceholder(value: string | undefined): boolean {
  if (!value) return true;
  return value.startsWith("paste-") || value.startsWith("your-") || value.includes("replace-with");
}

function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function asOpenMap(value: unknown): Record<string, string[]> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
  const out: Record<string, string[]> = {};
  for (const [facet, list] of Object.entries(value as Record<string, unknown>)) {
    out[facet] = asStringList(list);
  }
  return out;
}

interface Relocation {
  docId: string;
  name: string;
  moves: { facet: string; value: string }[];
  refused: { facet: string; value: string; reason: string }[];
}

async function main(): Promise<void> {
  const args = new Set(process.argv.slice(2));
  const write = args.has("--write");
  const dryRun = !write;

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

  const tagsSnap = await db.collection("tags").get();
  const valueToFacet = new Map<string, string>();
  for (const doc of tagsSnap.docs) {
    const data = doc.data();
    if (typeof data["facet"] !== "string" || typeof data["value"] !== "string") continue;
    if (!valueToFacet.has(data["value"])) valueToFacet.set(data["value"], data["facet"]);
  }

  const placesSnap = await db.collection("food_places").get();
  const relocations: Relocation[] = [];
  let leftoverTokens = 0;
  const leftoverFreq = new Map<string, number>();

  for (const doc of placesSnap.docs) {
    const data = doc.data();
    const tags = (data["tags"] ?? {}) as Record<string, unknown>;
    const pending = asStringList(tags["pending"]);
    const open = asOpenMap(tags["open"]);
    const knownCount =
      asStringList(tags["menus"]).length +
      asStringList(tags["servings"]).length +
      asStringList(tags["ingredients"]).length +
      asStringList(tags["origins"]).length +
      (typeof tags["priceTier"] === "string" ? 1 : 0) +
      (typeof tags["healthStyle"] === "string" ? 1 : 0);
    const working = new Map<string, string[]>(
      Object.entries(open).map(([facet, list]) => [facet, [...list]]),
    );
    const moves: Relocation["moves"] = [];
    const refused: Relocation["refused"] = [];
    for (const token of pending) {
      const facet = valueToFacet.get(token);
      if (!facet || isKnownFacet(facet)) {
        leftoverTokens += 1;
        leftoverFreq.set(token, (leftoverFreq.get(token) ?? 0) + 1);
        continue;
      }
      const group = working.get(facet) ?? [];
      const already = group.includes(token);
      const openValues = [...working.values()].reduce((sum, list) => sum + list.length, 0);
      if (!already) {
        if (group.length >= MAX_OPEN_VALUES_PER_FACET) {
          refused.push({ facet, reason: "open facet cap 5", value: token });
          leftoverFreq.set(token, (leftoverFreq.get(token) ?? 0) + 1);
          continue;
        }
        if (!working.has(facet) && working.size >= MAX_OPEN_FACETS_PER_PLACE) {
          refused.push({ facet, reason: "open facet count cap 8", value: token });
          leftoverFreq.set(token, (leftoverFreq.get(token) ?? 0) + 1);
          continue;
        }
        if (knownCount + openValues + 1 > MAX_RESOLVED_PER_PLACE) {
          refused.push({ facet, reason: "resolved total cap 8", value: token });
          leftoverFreq.set(token, (leftoverFreq.get(token) ?? 0) + 1);
          continue;
        }
        group.push(token);
        working.set(facet, group);
      }
      moves.push({ facet, value: token });
    }
    if (moves.length > 0 || refused.length > 0) {
      relocations.push({ docId: doc.id, moves, name: String(data["name"] ?? doc.id), refused });
    }
  }

  const totalMoves = relocations.reduce((sum, row) => sum + row.moves.length, 0);
  const totalRefused = relocations.reduce((sum, row) => sum + row.refused.length, 0);
  console.log(
    `migrate-open-facets: ${dryRun ? "dry-run" : "write"} — ${placesSnap.size} places, ${totalMoves} relocations, ${totalRefused} refusals, ${leftoverTokens} leftover tokens.`,
  );
  for (const row of relocations) {
    for (const move of row.moves) {
      console.log(`- ${row.name} (${row.docId}): pending:${move.value} → open.${move.facet}`);
    }
    for (const item of row.refused) {
      console.log(
        `- ${row.name} (${row.docId}): REFUSED pending:${item.value} → open.${item.facet} (${item.reason})`,
      );
    }
  }
  if (leftoverFreq.size > 0) {
    console.log("leftover pending tokens (stay in pending):");
    for (const [token, count] of [...leftoverFreq.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`- ${token}: ${count}x`);
    }
  }
  if (totalRefused > 0) {
    console.error(`migrate-open-facets: ${totalRefused} relocation(s) would violate caps.`);
    process.exit(1);
  }
  if (dryRun) {
    console.log("migrate-open-facets: dry-run done. No writes performed.");
    return;
  }

  let written = 0;
  let batch = db.batch();
  let batchSize = 0;
  for (const row of relocations) {
    if (row.moves.length === 0) continue;
    const ref = db.collection("food_places").doc(row.docId);
    const snapshot = await ref.get();
    const data = snapshot.data() ?? {};
    const tags = (data["tags"] ?? {}) as Record<string, unknown>;
    const pending = asStringList(tags["pending"]);
    const open = asOpenMap(tags["open"]);
    const nextOpen: Record<string, string[]> = Object.fromEntries(
      Object.entries(open).map(([facet, list]) => [facet, [...list]]),
    );
    for (const move of row.moves) {
      const group = nextOpen[move.facet] ?? [];
      if (!group.includes(move.value)) group.push(move.value);
      nextOpen[move.facet] = group;
    }
    const moved = new Set(row.moves.map((move) => move.value));
    batch.update(ref, {
      tags: {
        ...(tags as Record<string, unknown>),
        open: nextOpen,
        pending: pending.filter((token) => !moved.has(token)),
      },
      updatedAt: new Date(),
    });
    batchSize += 1;
    written += 1;
    if (batchSize >= 400) {
      await batch.commit();
      batch = db.batch();
      batchSize = 0;
    }
  }
  if (batchSize > 0) await batch.commit();
  console.log(
    `migrate-open-facets: wrote ${written} place(s). Re-run dry-run to confirm idempotence.`,
  );
}

main().catch((error: unknown) => {
  console.error(`migrate-open-facets: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
