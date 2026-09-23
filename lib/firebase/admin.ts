import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

export const SESSION_COOKIE_NAME = "__session";

const SESSION_COOKIE_MAX_AGE_MS = 5 * 24 * 60 * 60 * 1000;

export function getSessionCookieMaxAgeSeconds(): number {
  return SESSION_COOKIE_MAX_AGE_MS / 1000;
}

function isPlaceholder(value: string | undefined): boolean {
  if (!value) return true;
  return value.startsWith("paste-") || value.startsWith("your-") || value.includes("replace-with");
}

export function isAdminConfigured(): boolean {
  return (
    !isPlaceholder(process.env.FIREBASE_PROJECT_ID) &&
    !isPlaceholder(process.env.FIREBASE_CLIENT_EMAIL) &&
    !isPlaceholder(process.env.FIREBASE_PRIVATE_KEY)
  );
}

function getEmulatorProjectId(): string {
  return process.env.FIREBASE_PROJECT_ID ?? "what-2-eat-dev";
}

function ensureAdminApp() {
  const existing = getApps();
  if (existing.length > 0) return existing[0] as NonNullable<(typeof existing)[number]>;
  if (process.env.FIRESTORE_EMULATOR_HOST || process.env.FIREBASE_AUTH_EMULATOR_HOST) {
    return initializeApp({ projectId: getEmulatorProjectId() });
  }
  return initializeApp({
    credential: cert({
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
      projectId: process.env.FIREBASE_PROJECT_ID,
    }),
  });
}

export function getAdminAuth() {
  if (!isAdminConfigured() && !process.env.FIRESTORE_EMULATOR_HOST) return null;
  try {
    return getAuth(ensureAdminApp());
  } catch {
    return null;
  }
}

export function getAdminDb() {
  if (!isAdminConfigured() && !process.env.FIRESTORE_EMULATOR_HOST) return null;
  try {
    return getFirestore(ensureAdminApp());
  } catch {
    return null;
  }
}
