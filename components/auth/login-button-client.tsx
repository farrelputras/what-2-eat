"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { signInWithGoogle } from "@/lib/firebase/client";

export function LoginButtonClient() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function handleSignIn(): Promise<void> {
    setPending(true);
    try {
      await signInWithGoogle();
      router.push("/foods");
      router.refresh();
    } catch (error) {
      const code =
        typeof (error as { code?: unknown }).code === "string"
          ? (error as { code: string }).code
          : null;
      if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") {
        setPending(false);
        return;
      }
      toast.error(friendlyAuthError(code));
      setPending(false);
    }
  }

  return (
    <Button disabled={pending} onClick={handleSignIn}>
      {pending ? "Signing in…" : "Sign in with Google"}
    </Button>
  );
}

function friendlyAuthError(code: string | null): string {
  switch (code) {
    case "auth/configuration-not-found":
      return "Sign-in isn't set up for this project yet. Enable Authentication in the Firebase console, then try again.";
    case "auth/operation-not-allowed":
      return "Google sign-in isn't enabled. Turn on the Google provider in the Firebase console.";
    case "auth/unauthorized-domain":
      return "This domain isn't authorized. Add it under Authentication → Settings → Authorized domains.";
    case "auth/popup-blocked":
      return "The sign-in pop-up was blocked. Allow pop-ups, then try again.";
    default:
      return "Sign-in failed. Please try again.";
  }
}
