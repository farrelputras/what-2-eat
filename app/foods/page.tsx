import type { Metadata } from "next";

import { FoodsCatalog } from "@/components/foods/foods-catalog";
import { Container } from "@/components/ui/container";
import { Page } from "@/components/ui/page";
import { Sections } from "@/components/ui/sections";
import { getAllFoods, getAreaCatalog, getTagCatalog } from "@/lib/foods/server";

export const metadata: Metadata = {
  description: "Filter by tags and area, or pick randomly from the current results.",
  title: "What to eat?",
};

export default function FoodsPage() {
  const foods = getAllFoods();
  const tags = getTagCatalog();
  const areas = getAreaCatalog();

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
          <FoodsCatalog areas={areas} foods={foods} tags={tags} />
        </Sections>
      </Container>
    </Page>
  );
}
