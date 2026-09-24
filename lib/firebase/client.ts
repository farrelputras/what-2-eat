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
  arrayUnion,
  collection,
  connectFirestoreEmulator,
  deleteDoc,
  deleteField,
  doc,
  getDocs,
  getFirestore,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
  type Firestore,
} from "firebase/firestore";

import {
  normalizeFoodAreas,
  normalizeFoodName,
  normalizeFoodTags,
  normalizeFoodUrl,
  slugFoodId,
  type FoodInput,
} from "@/lib/foods";
import type { FoodPlace } from "@/lib/foods/types";
import { normalizeTagDoc, parseTagFacet, parseTagValue, replaceTagValueInPlace } from "@/lib/tags";
import { tagDocId } from "@/lib/tags/types";
import type { TagDoc } from "@/lib/tags/types";

import { TEST_BYPASS_EMAIL, TEST_BYPASS_PASSWORD } from "./index";

const FOOD_PLACES_COLLECTION = "food_places";
const TAGS_COLLECTION = "tags";

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
  const facets = normalizeFoodTags(data["tags"]);
  const instagramUrl = toOptionalUrl(data, "instagramUrl");
  const tiktokUrl = toOptionalUrl(data, "tiktokUrl");
  return {
    areas,
    id,
    ...(instagramUrl ? { instagramUrl } : {}),
    name: data["name"],
    tags: facets,
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
  const tags = normalizeFoodTags(input.tags);
  const instagramUrl = normalizeFoodUrl(input.instagramUrl);
  const tiktokUrl = normalizeFoodUrl(input.tiktokUrl);
  const place: FoodPlace = {
    areas: normalizeFoodAreas(input.areas),
    id: slugFoodId(normalizeFoodName(input.name)),
    ...(instagramUrl ? { instagramUrl } : {}),
    name: normalizeFoodName(input.name),
    tags,
    ...(tiktokUrl ? { tiktokUrl } : {}),
  };
  await setDoc(doc(db, FOOD_PLACES_COLLECTION, place.id), {
    areas: place.areas,
    createdAt: serverTimestamp(),
    createdByUid: uid,
    ...(instagramUrl ? { instagramUrl } : {}),
    name: place.name,
    tags: {
      ...(tags.healthStyle ? { healthStyle: tags.healthStyle } : {}),
      ingredients: tags.ingredients,
      menus: tags.menus,
      origins: tags.origins,
      pending: tags.pending,
      ...(tags.priceTier ? { priceTier: tags.priceTier } : {}),
      servings: tags.servings,
    },
    ...(tiktokUrl ? { tiktokUrl } : {}),
    updatedAt: serverTimestamp(),
  });
  return place;
}

export async function updatePlace(id: string, input: FoodInput): Promise<void> {
  const db = getFirebaseDb();
  if (!db) throw new Error("Firebase is not configured. Fill in your .env.local values.");
  const tags = normalizeFoodTags(input.tags);
  await updateDoc(doc(db, FOOD_PLACES_COLLECTION, id), {
    areas: normalizeFoodAreas(input.areas),
    healthStyle: deleteField(),
    ingredients: deleteField(),
    instagramUrl: normalizeFoodUrl(input.instagramUrl) ?? deleteField(),
    menus: deleteField(),
    name: normalizeFoodName(input.name),
    origins: deleteField(),
    priceTier: deleteField(),
    proteins: deleteField(),
    serving: deleteField(),
    servings: deleteField(),
    staples: deleteField(),
    tags: {
      ...(tags.healthStyle ? { healthStyle: tags.healthStyle } : {}),
      ingredients: tags.ingredients,
      menus: tags.menus,
      origins: tags.origins,
      pending: tags.pending,
      ...(tags.priceTier ? { priceTier: tags.priceTier } : {}),
      servings: tags.servings,
    },
    tiktokUrl: normalizeFoodUrl(input.tiktokUrl) ?? deleteField(),
    updatedAt: serverTimestamp(),
  });
}

export async function removePlace(id: string): Promise<void> {
  const db = getFirebaseDb();
  if (!db) throw new Error("Firebase is not configured. Fill in your .env.local values.");
  await deleteDoc(doc(db, FOOD_PLACES_COLLECTION, id));
}

export function subscribeTags(
  next: (tags: TagDoc[]) => void,
  onError: (error: Error) => void,
): () => void {
  const db = getFirebaseDb();
  if (!db) {
    onError(new Error("Firebase is not configured. Fill in your .env.local values."));
    return () => {};
  }
  return onSnapshot(
    collection(db, TAGS_COLLECTION),
    (snapshot) => {
      const tags: TagDoc[] = [];
      for (const docSnapshot of snapshot.docs) {
        const tag = normalizeTagDoc(docSnapshot.id, docSnapshot.data());
        if (tag) tags.push(tag);
      }
      tags.sort((a, b) => a.id.localeCompare(b.id));
      next(tags);
    },
    (error) => onError(error),
  );
}

export async function createTagDoc(
  input: { facet: string; value: string },
  uid: string,
): Promise<void> {
  const db = getFirebaseDb();
  if (!db) throw new Error("Firebase is not configured. Fill in your .env.local values.");
  const facet = parseTagFacet(input.facet);
  const value = parseTagValue(input.value);
  await setDoc(doc(db, TAGS_COLLECTION, tagDocId(facet, value)), {
    createdAt: serverTimestamp(),
    deprecated: false,
    facet,
    synonyms: [],
    updatedAt: serverTimestamp(),
    updatedByUid: uid,
    value,
  });
}

export async function addTagSynonym(id: string, synonym: string, uid: string): Promise<void> {
  const db = getFirebaseDb();
  if (!db) throw new Error("Firebase is not configured. Fill in your .env.local values.");
  const value = parseTagValue(synonym);
  if (value === "") throw new Error("Synonym must not be empty.");
  await updateDoc(doc(db, TAGS_COLLECTION, id), {
    synonyms: arrayUnion(value),
    updatedAt: serverTimestamp(),
    updatedByUid: uid,
  });
}

export async function setTagDeprecated(
  id: string,
  deprecated: boolean,
  uid: string,
): Promise<void> {
  const db = getFirebaseDb();
  if (!db) throw new Error("Firebase is not configured. Fill in your .env.local values.");
  await updateDoc(doc(db, TAGS_COLLECTION, id), {
    deprecated,
    updatedAt: serverTimestamp(),
    updatedByUid: uid,
  });
}

// Emulator-only test aid: rewrite affected food_places docs after a
// rename/merge preview. Not a production migration job.
export async function applyTagMergeToPlaces(input: {
  sourceFacet: string;
  sourceValue: string;
  targetFacet: string;
  targetValue: string;
}): Promise<number> {
  const db = getFirebaseDb();
  if (!db) throw new Error("Firebase is not configured. Fill in your .env.local values.");
  const snapshot = await getDocs(collection(db, FOOD_PLACES_COLLECTION));
  const batch = writeBatch(db);
  let count = 0;
  for (const docSnapshot of snapshot.docs) {
    const place = toFoodPlace(docSnapshot.id, docSnapshot.data());
    if (!place) continue;
    const next = replaceTagValueInPlace(
      place.tags,
      input.sourceFacet,
      input.sourceValue,
      input.targetFacet,
      input.targetValue,
    );
    if (!next) continue;
    batch.update(docSnapshot.ref, {
      tags: {
        ...(next.healthStyle ? { healthStyle: next.healthStyle } : {}),
        ingredients: next.ingredients,
        menus: next.menus,
        origins: next.origins,
        pending: next.pending,
        ...(next.priceTier ? { priceTier: next.priceTier } : {}),
        servings: next.servings,
      },
      updatedAt: serverTimestamp(),
    });
    count += 1;
  }
  if (count > 0) await batch.commit();
  return count;
}
