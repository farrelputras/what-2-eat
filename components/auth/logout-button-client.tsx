"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { signOutUser } from "@/lib/firebase/client";

export function LogoutButtonClient() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function handleSignOut(): Promise<void> {
    setPending(true);
    try {
      await signOutUser();
    } catch {
      toast.error("Could not sign out. Please try again.");
      setPending(false);
      return;
    }
    router.push("/login");
    router.refresh();
  }

  return (
    <Button disabled={pending} onClick={handleSignOut} size="sm" variant="outline">
      {pending ? "Signing out…" : "Sign out"}
    </Button>
  );
}
