import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { TagsManager } from "@/components/tags/tags-manager";
import { Container } from "@/components/ui/container";
import { Page } from "@/components/ui/page";
import { Sections } from "@/components/ui/sections";
import { isAuthBypassEnabled } from "@/lib/firebase/admin";
import {
  fetchFoodPlacesInitial,
  fetchTagsInitial,
  verifySessionCookie,
} from "@/lib/firebase/server";

export const metadata: Metadata = {
  description: "Evolve the shared tag vocabulary: values, synonyms, and pending ideas.",
  title: "Tag registry",
};

export default function TagsPage() {
  return (
    <Page className="pt-2.5 md:pt-10">
      <Container>
        <Sections className="gap-5">
          <div className="grid gap-2.5">
            <h1 className="text-3xl sm:text-4xl md:text-5xl">Tag registry</h1>
            <p className="text-sm md:text-base text-muted-foreground max-w-xl">
              New values and synonyms appear in the add-place form with no redeploy. Renames show
              their impact before anything changes.
            </p>
          </div>
          <Suspense
            fallback={
              <p className="text-sm text-muted-foreground" aria-live="polite">
                Loading tag registry…
              </p>
            }
          >
            <TagsGate />
          </Suspense>
        </Sections>
      </Container>
    </Page>
  );
}

async function TagsGate() {
  const bypass = isAuthBypassEnabled();
  const session = await verifySessionCookie();
  if (!session) redirect("/login");
  const [foods, tags] = await Promise.all([fetchFoodPlacesInitial(), fetchTagsInitial()]);
  return <TagsManager bypass={bypass} initialFoods={foods} initialTags={tags} />;
}
