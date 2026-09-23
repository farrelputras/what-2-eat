import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { LoginButtonClient } from "@/components/auth/login-button-client";
import { Container } from "@/components/ui/container";
import { Page } from "@/components/ui/page";
import { Sections } from "@/components/ui/sections";
import { isAdminConfigured } from "@/lib/firebase/admin";
import { verifySessionCookie } from "@/lib/firebase/server";

export const metadata: Metadata = {
  description: "Sign in with Google to view and edit the shared food catalog.",
  title: "Sign in",
};

export default function LoginPage() {
  return (
    <Page>
      <Container>
        <Sections>
          <div className="grid gap-2.5">
            <h1 className="text-3xl sm:text-4xl">Sign in</h1>
            <p className="max-w-xl text-sm text-muted-foreground md:text-base">
              The food catalog is shared. Sign in with Google to view and edit it together.
            </p>
          </div>
          {!isAdminConfigured() && (
            <p
              className="rounded-lg border border-dashed p-5 text-sm text-muted-foreground"
              role="note"
            >
              Firebase is not configured yet. Fill in your `.env.local` values, then refresh this
              page.
            </p>
          )}
          <Suspense
            fallback={
              <p className="text-sm text-muted-foreground" aria-live="polite">
                Loading…
              </p>
            }
          >
            <LoginGate />
          </Suspense>
        </Sections>
      </Container>
    </Page>
  );
}

async function LoginGate() {
  const session = await verifySessionCookie();
  if (session) redirect("/foods");
  return <LoginButtonClient />;
}
