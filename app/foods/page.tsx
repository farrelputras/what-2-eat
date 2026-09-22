import type { Metadata } from "next";

import { FoodsCatalog } from "@/components/foods/foods-catalog";
import { Container } from "@/components/ui/container";
import { Page } from "@/components/ui/page";
import { Sections } from "@/components/ui/sections";
import { getAllFoods, getAreaCatalog, getTagCatalog } from "@/lib/foods/server";

export const metadata: Metadata = {
  description: "Filter tag dan area atau acak dari hasil yang sedang tampil.",
  title: "Mau makan apa?",
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
            <h1 className="text-3xl sm:text-4xl md:text-5xl">Mau makan apa?</h1>
            <p className="text-sm md:text-base text-muted-foreground max-w-xl">
              Filter berdasarkan tag dan area, atau biarkan acak yang memilih dari hasil yang sedang
              tampil.
            </p>
          </div>
          <FoodsCatalog areas={areas} foods={foods} tags={tags} />
        </Sections>
      </Container>
    </Page>
  );
}
