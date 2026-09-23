import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { FoodsCatalog } from "@/components/foods/foods-catalog";
import { Container } from "@/components/ui/container";
import { Page } from "@/components/ui/page";
import { Sections } from "@/components/ui/sections";
import { isAuthBypassEnabled } from "@/lib/firebase/admin";
import { fetchFoodPlacesInitial, verifySessionCookie } from "@/lib/firebase/server";

export const metadata: Metadata = {
  description: "Filter by tags and area, or pick randomly from the current results.",
  title: "What to eat?",
};

export default function FoodsPage() {
  return (
    <Page className="pt-2.5 md:pt-10">
      <Container>
        <Sections className="gap-5">
          <div className="grid gap-2.5">
            <h1 className="text-3xl sm:text-4xl md:text-5xl">What to eat?</h1>
            <p className="text-sm md:text-base text-muted-foreground max-w-xl">
              Filter by tags and area, or let shuffle pick from the current results.
            </p>
          </div>
          <Suspense
            fallback={
              <p className="text-sm text-muted-foreground" aria-live="polite">
                Loading shared catalog…
              </p>
            }
          >
            <FoodsGate />
          </Suspense>
        </Sections>
      </Container>
    </Page>
  );
}

async function FoodsGate() {
  const bypass = isAuthBypassEnabled();
  const session = await verifySessionCookie();
  if (!session) redirect("/login");
  const foods = await fetchFoodPlacesInitial();
  return <FoodsCatalog bypass={bypass} initialFoods={foods} />;
}
