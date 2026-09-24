import { cookies } from "next/headers";
import { connection } from "next/server";

import { normalizeFoodAreas, normalizeFoodFacets } from "@/lib/foods";
import type { FoodPlace } from "@/lib/foods/types";

import { getAdminAuth, getAdminDb, isAuthBypassEnabled, SESSION_COOKIE_NAME } from "./admin";
import {
  TEST_BYPASS_EMAIL,
  TEST_BYPASS_NAME,
  TEST_BYPASS_PASSWORD,
  TEST_BYPASS_UID,
} from "./index";

export interface SessionUser {
  email: string | null;
  name: string | null;
  photoUrl: string | null;
  uid: string;
}

let bypassLogged = false;
let bypassUserEnsured: Promise<void> | null = null;

function logBypassOnce(): void {
  if (bypassLogged) return;
  bypassLogged = true;
  console.info("auth bypass active (test-user, emulator)");
}

function ensureBypassUser(): Promise<void> {
  if (!bypassUserEnsured) {
    bypassUserEnsured = (async () => {
      const auth = getAdminAuth();
      if (!auth) {
        throw new Error(
          "Auth bypass is on but the Auth emulator is unreachable. Start it with `firebase emulators:start`, then retry.",
        );
      }
      try {
        await auth.createUser({
          displayName: TEST_BYPASS_NAME,
          email: TEST_BYPASS_EMAIL,
          password: TEST_BYPASS_PASSWORD,
          uid: TEST_BYPASS_UID,
        });
      } catch (error) {
        const code =
          typeof (error as { code?: unknown }).code === "string"
            ? (error as { code: string }).code
            : null;
        if (code !== "auth/uid-already-exists" && code !== "auth/email-already-exists") {
          throw error;
        }
      }
    })();
    bypassUserEnsured.catch(() => {
      bypassUserEnsured = null;
    });
  }
  return bypassUserEnsured;
}

function toOptionalUrl(data: Record<string, unknown>, key: string): string | undefined {
  const value = data[key];
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

function toFoodPlace(id: string, data: Record<string, unknown>): FoodPlace | null {
  if (typeof data["name"] !== "string") return null;
  if (!Array.isArray(data["areas"])) return null;
  const areas = normalizeFoodAreas(
    data["areas"].filter((area): area is string => typeof area === "string"),
  );
  if (areas.length === 0) return null;
  const facets = normalizeFoodFacets({
    healthStyle: data["healthStyle"],
    ingredients: data["ingredients"],
    menus: data["menus"],
    origins: data["origins"],
    priceTier: data["priceTier"],
    servings: data["servings"],
  });
  const instagramUrl = toOptionalUrl(data, "instagramUrl");
  const tiktokUrl = toOptionalUrl(data, "tiktokUrl");
  return {
    areas,
    ...(facets.healthStyle ? { healthStyle: facets.healthStyle } : {}),
    id,
    ingredients: facets.ingredients,
    ...(instagramUrl ? { instagramUrl } : {}),
    menus: facets.menus,
    name: data["name"],
    origins: facets.origins,
    ...(facets.priceTier ? { priceTier: facets.priceTier } : {}),
    servings: facets.servings,
    ...(tiktokUrl ? { tiktokUrl } : {}),
  };
}

export async function verifySessionCookie(): Promise<SessionUser | null> {
  if (isAuthBypassEnabled()) {
    logBypassOnce();
    await connection();
    await ensureBypassUser();
    return {
      email: TEST_BYPASS_EMAIL,
      name: TEST_BYPASS_NAME,
      photoUrl: null,
      uid: TEST_BYPASS_UID,
    };
  }
  const store = await cookies();
  const session = store.get(SESSION_COOKIE_NAME)?.value;
  if (!session) return null;
  const auth = getAdminAuth();
  if (!auth) return null;
  try {
    const decoded = await auth.verifySessionCookie(session, true);
    return {
      email: typeof decoded.email === "string" ? decoded.email : null,
      name: typeof decoded.name === "string" ? decoded.name : null,
      photoUrl: typeof decoded.picture === "string" ? decoded.picture : null,
      uid: decoded.uid,
    };
  } catch {
    return null;
  }
}

export async function fetchFoodPlacesInitial(): Promise<FoodPlace[]> {
  await connection();
  const db = getAdminDb();
  if (!db) {
    if (isAuthBypassEnabled()) {
      throw new Error(
        "Auth bypass is on but the Firestore emulator is unreachable. Start it with `firebase emulators:start`, then retry.",
      );
    }
    return [];
  }
  const snapshot = await db.collection("food_places").get();
  const places: FoodPlace[] = [];
  for (const doc of snapshot.docs) {
    const place = toFoodPlace(doc.id, doc.data());
    if (place) places.push(place);
  }
  places.sort((a, b) => a.name.localeCompare(b.name));
  return places;
}
