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
      toast.error(error instanceof Error ? error.message : "Sign-in failed. Please try again.");
      setPending(false);
    }
  }

  return (
    <Button disabled={pending} onClick={handleSignIn}>
      {pending ? "Signing in…" : "Sign in with Google"}
    </Button>
  );
}
