import { cookies } from "next/headers";

import type { FoodPlace } from "@/lib/foods/types";

import { getAdminAuth, getAdminDb, isAuthBypassEnabled, SESSION_COOKIE_NAME } from "./admin";
import { TEST_BYPASS_EMAIL, TEST_BYPASS_NAME, TEST_BYPASS_UID } from "./index";

export interface SessionUser {
  email: string | null;
  name: string | null;
  photoUrl: string | null;
  uid: string;
}

let bypassLogged = false;

function logBypassOnce(): void {
  if (bypassLogged) return;
  bypassLogged = true;
  console.info("auth bypass active (test-user, emulator)");
}

function toOptionalUrl(data: Record<string, unknown>, key: string): string | undefined {
  const value = data[key];
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

function toFoodPlace(id: string, data: Record<string, unknown>): FoodPlace | null {
  if (typeof data["name"] !== "string") return null;
  if (typeof data["area"] !== "string") return null;
  if (!Array.isArray(data["tags"])) return null;
  const tags = data["tags"].filter((tag): tag is string => typeof tag === "string");
  const instagramUrl = toOptionalUrl(data, "instagramUrl");
  const tiktokUrl = toOptionalUrl(data, "tiktokUrl");
  return {
    area: data["area"],
    id,
    ...(instagramUrl ? { instagramUrl } : {}),
    name: data["name"],
    tags,
    ...(tiktokUrl ? { tiktokUrl } : {}),
  };
}

export async function verifySessionCookie(): Promise<SessionUser | null> {
  if (isAuthBypassEnabled()) {
    logBypassOnce();
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
