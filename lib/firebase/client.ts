"use client";

import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import {
  connectAuthEmulator,
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  type User,
} from "firebase/auth";
import {
  collection,
  connectFirestoreEmulator,
  deleteDoc,
  deleteField,
  doc,
  getFirestore,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
  type Firestore,
} from "firebase/firestore";

import {
  normalizeFoodAreas,
  normalizeFoodFacets,
  normalizeFoodName,
  normalizeFoodUrl,
  slugFoodId,
  type FoodInput,
} from "@/lib/foods";
import type { FoodPlace } from "@/lib/foods/types";

import { TEST_BYPASS_EMAIL, TEST_BYPASS_PASSWORD } from "./index";

const FOOD_PLACES_COLLECTION = "food_places";

function isPlaceholder(value: string | undefined): boolean {
  if (!value) return true;
  return value.startsWith("paste-") || value.startsWith("your-");
}

export function isFirebaseConfigured(): boolean {
  return (
    !isPlaceholder(process.env.NEXT_PUBLIC_FIREBASE_API_KEY) &&
    !isPlaceholder(process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID) &&
    !isPlaceholder(process.env.NEXT_PUBLIC_FIREBASE_APP_ID)
  );
}

let app: FirebaseApp | null = null;
let authInstance: ReturnType<typeof getAuth> | null = null;
let dbInstance: Firestore | null = null;
let authEmulatorConnected = false;
let firestoreEmulatorConnected = false;

function firestoreEmulatorHost(): string | undefined {
  const value = process.env.NEXT_PUBLIC_FIRESTORE_EMULATOR_HOST;
  return value && value.trim() !== "" ? value.trim() : undefined;
}

function authEmulatorHost(): string | undefined {
  const value = process.env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST;
  return value && value.trim() !== "" ? value.trim() : undefined;
}

function isEmulatorEnabled(): boolean {
  return firestoreEmulatorHost() !== undefined || authEmulatorHost() !== undefined;
}

function parseHostPort(value: string, defaultPort: number): { host: string; port: number } {
  const trimmed = value.trim();
  const lastColon = trimmed.lastIndexOf(":");
  if (lastColon === -1) return { host: trimmed, port: defaultPort };
  const port = Number.parseInt(trimmed.slice(lastColon + 1), 10);
  if (Number.isNaN(port)) return { host: trimmed, port: defaultPort };
  return { host: trimmed.slice(0, lastColon) || "127.0.0.1", port };
}

function authEmulatorUrl(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) return trimmed;
  return `http://${trimmed}`;
}

function getFirebaseApp(): FirebaseApp | null {
  if (!isFirebaseConfigured() && !isEmulatorEnabled()) return null;
  if (app) return app;
  app =
    getApps().length > 0
      ? getApp()
      : initializeApp({
          apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "fake-api-key",
          appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "fake-app-id",
          authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
          messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
          projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "what-2-eat-dev",
          storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
        });
  return app;
}

function getFirebaseAuth() {
  const firebaseApp = getFirebaseApp();
  if (!firebaseApp) return null;
  if (!authInstance) {
    authInstance = getAuth(firebaseApp);
    const host = authEmulatorHost();
    if (host && !authEmulatorConnected) {
      connectAuthEmulator(authInstance, authEmulatorUrl(host), { disableWarnings: true });
      authEmulatorConnected = true;
    }
  }
  return authInstance;
}

function getFirebaseDb(): Firestore | null {
  const firebaseApp = getFirebaseApp();
  if (!firebaseApp) return null;
  if (!dbInstance) {
    dbInstance = getFirestore(firebaseApp);
    const host = firestoreEmulatorHost();
    if (host && !firestoreEmulatorConnected) {
      const { host: hostname, port } = parseHostPort(host, 8080);
      connectFirestoreEmulator(dbInstance, hostname, port);
      firestoreEmulatorConnected = true;
    }
  }
  return dbInstance;
}

export function subscribeAuthUser(
  next: (user: User | null) => void,
  options?: { bypass?: boolean },
): () => void {
  if (options?.bypass) {
    const auth = getFirebaseAuth();
    if (!auth) {
      next(null);
      return () => {};
    }
    const unsubscribe = onAuthStateChanged(auth, next);
    signInWithEmailAndPassword(auth, TEST_BYPASS_EMAIL, TEST_BYPASS_PASSWORD).catch(() => {});
    return unsubscribe;
  }
  const auth = getFirebaseAuth();
  if (!auth) {
    next(null);
    return () => {};
  }
  return onAuthStateChanged(auth, next);
}

export async function signInWithGoogle(): Promise<void> {
  const auth = getFirebaseAuth();
  if (!auth) throw new Error("Firebase is not configured. Fill in your .env.local values.");
  const provider = new GoogleAuthProvider();
  const credential = await signInWithPopup(auth, provider);
  const idToken = await credential.user.getIdToken();
  const response = await fetch("/api/auth/session", {
    body: JSON.stringify({ idToken }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  if (!response.ok) {
    await signOut(auth).catch(() => {});
    throw new Error("Could not create your session. Please try again.");
  }
}

export async function signOutUser(): Promise<void> {
  const auth = getFirebaseAuth();
  if (auth) await signOut(auth).catch(() => {});
  await fetch("/api/auth/session", { method: "DELETE" }).catch(() => {});
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

export function subscribeFoodPlaces(
  next: (foods: FoodPlace[]) => void,
  onError: (error: Error) => void,
): () => void {
  const db = getFirebaseDb();
  if (!db) {
    onError(new Error("Firebase is not configured. Fill in your .env.local values."));
    return () => {};
  }
  return onSnapshot(
    collection(db, FOOD_PLACES_COLLECTION),
    (snapshot) => {
      const places: FoodPlace[] = [];
      for (const docSnapshot of snapshot.docs) {
        const place = toFoodPlace(docSnapshot.id, docSnapshot.data());
        if (place) places.push(place);
      }
      places.sort((a, b) => a.name.localeCompare(b.name));
      next(places);
    },
    (error) => onError(error),
  );
}

export async function createPlace(input: FoodInput, uid: string): Promise<FoodPlace> {
  const db = getFirebaseDb();
  if (!db) throw new Error("Firebase is not configured. Fill in your .env.local values.");
  const facets = normalizeFoodFacets(input);
  const instagramUrl = normalizeFoodUrl(input.instagramUrl);
  const tiktokUrl = normalizeFoodUrl(input.tiktokUrl);
  const place: FoodPlace = {
    areas: normalizeFoodAreas(input.areas),
    ...(facets.healthStyle ? { healthStyle: facets.healthStyle } : {}),
    id: slugFoodId(normalizeFoodName(input.name)),
    ingredients: facets.ingredients,
    ...(instagramUrl ? { instagramUrl } : {}),
    menus: facets.menus,
    name: normalizeFoodName(input.name),
    origins: facets.origins,
    ...(facets.priceTier ? { priceTier: facets.priceTier } : {}),
    servings: facets.servings,
    ...(tiktokUrl ? { tiktokUrl } : {}),
  };
  await setDoc(doc(db, FOOD_PLACES_COLLECTION, place.id), {
    areas: place.areas,
    ...(place.healthStyle ? { healthStyle: place.healthStyle } : {}),
    ingredients: place.ingredients,
    ...(instagramUrl ? { instagramUrl } : {}),
    createdAt: serverTimestamp(),
    createdByUid: uid,
    menus: place.menus,
    name: place.name,
    origins: place.origins,
    ...(place.priceTier ? { priceTier: place.priceTier } : {}),
    servings: place.servings,
    ...(tiktokUrl ? { tiktokUrl } : {}),
    updatedAt: serverTimestamp(),
  });
  return place;
}

export async function updatePlace(id: string, input: FoodInput): Promise<void> {
  const db = getFirebaseDb();
  if (!db) throw new Error("Firebase is not configured. Fill in your .env.local values.");
  const facets = normalizeFoodFacets(input);
  await updateDoc(doc(db, FOOD_PLACES_COLLECTION, id), {
    areas: normalizeFoodAreas(input.areas),
    healthStyle: facets.healthStyle ?? deleteField(),
    ingredients: facets.ingredients,
    instagramUrl: normalizeFoodUrl(input.instagramUrl) ?? deleteField(),
    menus: facets.menus,
    name: normalizeFoodName(input.name),
    origins: facets.origins,
    priceTier: facets.priceTier ?? deleteField(),
    proteins: deleteField(),
    servings: facets.servings,
    serving: deleteField(),
    staples: deleteField(),
    tags: deleteField(),
    tiktokUrl: normalizeFoodUrl(input.tiktokUrl) ?? deleteField(),
    updatedAt: serverTimestamp(),
  });
}

export async function removePlace(id: string): Promise<void> {
  const db = getFirebaseDb();
  if (!db) throw new Error("Firebase is not configured. Fill in your .env.local values.");
  await deleteDoc(doc(db, FOOD_PLACES_COLLECTION, id));
}
