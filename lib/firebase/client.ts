"use client";

import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User,
} from "firebase/auth";
import {
  collection,
  deleteDoc,
  doc,
  getFirestore,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
  type Firestore,
} from "firebase/firestore";

import {
  normalizeFoodArea,
  normalizeFoodName,
  normalizeFoodTags,
  slugFoodId,
  type FoodInput,
} from "@/lib/foods";
import type { FoodPlace } from "@/lib/foods/types";

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

function getFirebaseApp(): FirebaseApp | null {
  if (!isFirebaseConfigured()) return null;
  if (app) return app;
  app =
    getApps().length > 0
      ? getApp()
      : initializeApp({
          apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
          appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
          authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
          messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
          projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
          storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
        });
  return app;
}

function getFirebaseAuth() {
  const firebaseApp = getFirebaseApp();
  if (!firebaseApp) return null;
  if (!authInstance) authInstance = getAuth(firebaseApp);
  return authInstance;
}

function getFirebaseDb(): Firestore | null {
  const firebaseApp = getFirebaseApp();
  if (!firebaseApp) return null;
  if (!dbInstance) dbInstance = getFirestore(firebaseApp);
  return dbInstance;
}

export function subscribeAuthUser(next: (user: User | null) => void): () => void {
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

function toFoodPlace(id: string, data: Record<string, unknown>): FoodPlace | null {
  if (typeof data["name"] !== "string") return null;
  if (typeof data["area"] !== "string") return null;
  if (!Array.isArray(data["tags"])) return null;
  const tags = data["tags"].filter((tag): tag is string => typeof tag === "string");
  return { area: data["area"], id, name: data["name"], tags };
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
  const place: FoodPlace = {
    area: normalizeFoodArea(input.area),
    id: slugFoodId(normalizeFoodName(input.name)),
    name: normalizeFoodName(input.name),
    tags: normalizeFoodTags(input.tags),
  };
  await setDoc(doc(db, FOOD_PLACES_COLLECTION, place.id), {
    area: place.area,
    createdAt: serverTimestamp(),
    createdByUid: uid,
    name: place.name,
    tags: place.tags,
    updatedAt: serverTimestamp(),
  });
  return place;
}

export async function updatePlace(id: string, input: FoodInput): Promise<void> {
  const db = getFirebaseDb();
  if (!db) throw new Error("Firebase is not configured. Fill in your .env.local values.");
  await updateDoc(doc(db, FOOD_PLACES_COLLECTION, id), {
    area: normalizeFoodArea(input.area),
    name: normalizeFoodName(input.name),
    tags: normalizeFoodTags(input.tags),
    updatedAt: serverTimestamp(),
  });
}

export async function removePlace(id: string): Promise<void> {
  const db = getFirebaseDb();
  if (!db) throw new Error("Firebase is not configured. Fill in your .env.local values.");
  await deleteDoc(doc(db, FOOD_PLACES_COLLECTION, id));
}
