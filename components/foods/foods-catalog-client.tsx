"use client";

import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { filterFoods, pickRandomFood } from "@/lib/foods";
import type { FoodPlace } from "@/lib/foods/types";

interface FoodsCatalogClientProps {
  areas: string[];
  foods: FoodPlace[];
  tags: string[];
}

function formatArea(area: string): string {
  if (area === "all") return "Semua area";
  return area.charAt(0).toUpperCase() + area.slice(1);
}

export function FoodsCatalogClient({ areas, foods, tags }: FoodsCatalogClientProps) {
  const [search, setSearch] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [area, setArea] = useState("all");
  const [picked, setPicked] = useState<FoodPlace | null>(null);

  const filtered = useMemo(
    () => filterFoods(foods, { area, search, tags: selectedTags }),
    [area, foods, search, selectedTags],
  );

  function toggleTag(tag: string): void {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    );
    setPicked(null);
  }

  function handleSearch(value: string): void {
    setSearch(value);
    setPicked(null);
  }

  function handleArea(value: string): void {
    setArea(value);
    setPicked(null);
  }

  function handleShuffle(): void {
    setPicked(pickRandomFood(filtered) ?? null);
  }

  function handleReset(): void {
    setArea("all");
    setPicked(null);
    setSearch("");
    setSelectedTags([]);
  }

  const isFiltered = search.trim() !== "" || selectedTags.length > 0 || area !== "all";

  return (
    <div className="grid gap-10">
      <div className="grid gap-5">
        <div className="grid gap-2.5">
          <label htmlFor="foods-search" className="text-sm font-medium">
            Cari nama tempat
          </label>
          <Input
            id="foods-search"
            placeholder="Mis. gacoan, soto, sushi…"
            value={search}
            onChange={(event) => handleSearch(event.target.value)}
          />
        </div>

        <div className="grid gap-2.5">
          <p className="text-sm font-medium">Tag (pilih satu atau lebih)</p>
          <div className="flex flex-wrap gap-2.5">
            {tags.map((tag) => {
              const active = selectedTags.includes(tag);
              return (
                <Button
                  key={tag}
                  aria-pressed={active}
                  onClick={() => toggleTag(tag)}
                  size="sm"
                  variant={active ? "default" : "outline"}
                >
                  {tag}
                </Button>
              );
            })}
          </div>
        </div>

        <div className="grid gap-2.5">
          <p className="text-sm font-medium">Area</p>
          <Select value={area} onValueChange={(value) => handleArea(value ?? "all")}>
            <SelectTrigger className="w-52">
              <span>{formatArea(area)}</span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua area</SelectItem>
              {areas.map((item) => (
                <SelectItem key={item} value={item}>
                  {formatArea(item)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <p className="text-sm text-muted-foreground" aria-live="polite">
            {filtered.length} dari {foods.length} tempat
          </p>
          {isFiltered && (
            <Button onClick={handleReset} size="sm" variant="ghost">
              Reset filter
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-2.5">
        <Button
          disabled={filtered.length === 0}
          onClick={handleShuffle}
          variant="secondary"
          className="w-fit"
        >
          Pilih acak dari hasil ini
        </Button>
        {picked && (
          <div className="rounded-lg border bg-card p-5 grid gap-2.5" aria-live="polite">
            <p className="text-sm text-muted-foreground">Hasil acak untukmu:</p>
            <p className="text-2xl font-semibold">{picked.name}</p>
            <div className="flex flex-wrap gap-2.5">
              {picked.tags.map((tag) => (
                <Badge key={tag} variant="secondary">
                  {tag}
                </Badge>
              ))}
              <Badge variant="outline">{formatArea(picked.area)}</Badge>
            </div>
            <div>
              <Button onClick={handleShuffle} size="sm" variant="outline">
                Acak lagi
              </Button>
            </div>
          </div>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="grid gap-2.5 rounded-lg border border-dashed p-10 text-center justify-items-center">
          <p className="text-lg font-medium">Tidak ada yang cocok — kurangi tag / reset filter</p>
          <Button onClick={handleReset} variant="outline">
            Reset filter
          </Button>
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((place) => (
            <li key={place.id} className="rounded-lg border bg-card p-5 grid gap-2.5 content-start">
              <p className="font-medium">{place.name}</p>
              <div className="flex flex-wrap gap-2.5">
                {place.tags.map((tag) => (
                  <Badge key={tag} variant="secondary">
                    {tag}
                  </Badge>
                ))}
              </div>
              <p className="text-sm text-muted-foreground">{formatArea(place.area)}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
