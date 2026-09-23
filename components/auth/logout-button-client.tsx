"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { signOutUser } from "@/lib/firebase/client";

export function LogoutButtonClient({ bypass = false }: { bypass?: boolean }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  if (bypass) {
    return (
      <Button disabled size="sm" title="Sign out is disabled in test mode" variant="outline">
        Test mode
      </Button>
    );
  }

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
