import { cookies } from "next/headers";

import type { FoodPlace } from "@/lib/foods/types";

import { getAdminAuth, getAdminDb, SESSION_COOKIE_NAME } from "./admin";

export interface SessionUser {
  email: string | null;
  name: string | null;
  photoUrl: string | null;
  uid: string;
}

function toFoodPlace(id: string, data: Record<string, unknown>): FoodPlace | null {
  if (typeof data["name"] !== "string") return null;
  if (typeof data["area"] !== "string") return null;
  if (!Array.isArray(data["tags"])) return null;
  const tags = data["tags"].filter((tag): tag is string => typeof tag === "string");
  return { area: data["area"], id, name: data["name"], tags };
}

export async function verifySessionCookie(): Promise<SessionUser | null> {
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
  if (!db) return [];
  const snapshot = await db.collection("food_places").get();
  const places: FoodPlace[] = [];
  for (const doc of snapshot.docs) {
    const place = toFoodPlace(doc.id, doc.data());
    if (place) places.push(place);
  }
  places.sort((a, b) => a.name.localeCompare(b.name));
  return places;
}
