"use client";

import { Pencil, Plus, Trash2 } from "lucide-react";
import { useMemo, useRef, useState, type MouseEvent } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import {
  deriveAreaCatalog,
  deriveTagCatalog,
  filterFoods,
  pickRandomFood,
  type FoodInput,
} from "@/lib/foods";
import { useFoods } from "@/lib/foods/client";
import type { FoodPlace } from "@/lib/foods/types";

import { FoodFormDialog } from "./food-form-client";

interface FoodsCatalogClientProps {
  areas: string[];
  foods: FoodPlace[];
  tags: string[];
}

function formatArea(area: string): string {
  if (area === "all") return "All areas";
  return area.charAt(0).toUpperCase() + area.slice(1);
}

export function FoodsCatalogClient({ areas, foods, tags }: FoodsCatalogClientProps) {
  const {
    createPlace,
    foods: mergedFoods,
    mounted,
    persistent,
    removePlace,
    updatePlace,
  } = useFoods(foods);
  const catalogFoods = mounted ? mergedFoods : foods;
  const catalogTags = mounted ? deriveTagCatalog(mergedFoods) : tags;
  const catalogAreas = mounted ? deriveAreaCatalog(mergedFoods) : areas;

  const [search, setSearch] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [area, setArea] = useState("all");
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [form, setForm] = useState<{ place: FoodPlace | null } | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const triggerRef = useRef<HTMLElement | null>(null);

  const visibleTags = useMemo(
    () => selectedTags.filter((tag) => catalogTags.includes(tag)),
    [catalogTags, selectedTags],
  );
  const effectiveArea = area === "all" || catalogAreas.includes(area) ? area : "all";

  const filtered = useMemo(
    () => filterFoods(catalogFoods, { area: effectiveArea, search, tags: visibleTags }),
    [catalogFoods, effectiveArea, search, visibleTags],
  );
  const picked = pickedId ? (catalogFoods.find((place) => place.id === pickedId) ?? null) : null;

  function toggleTag(tag: string): void {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    );
    setPickedId(null);
  }

  function handleSearch(value: string): void {
    setSearch(value);
    setPickedId(null);
  }

  function handleArea(value: string): void {
    setArea(value);
    setPickedId(null);
  }

  function handleShuffle(): void {
    setPickedId(pickRandomFood(filtered)?.id ?? null);
  }

  function handleReset(): void {
    setArea("all");
    setPickedId(null);
    setSearch("");
    setSelectedTags([]);
  }

  function openCreate(event: MouseEvent<HTMLButtonElement>): void {
    triggerRef.current = event.currentTarget;
    setForm({ place: null });
  }

  function openEdit(event: MouseEvent<HTMLButtonElement>, place: FoodPlace): void {
    triggerRef.current = event.currentTarget;
    setConfirmId(null);
    setForm({ place });
  }

  function closeForm(): void {
    setForm(null);
    triggerRef.current?.focus();
  }

  function handleFormSubmit(input: FoodInput): void {
    if (form?.place) {
      updatePlace(form.place.id, input);
      toast.success("Changes saved.");
    } else {
      createPlace(input);
      toast.success("Place added.");
    }
    closeForm();
  }

  function handleDeleteClick(place: FoodPlace): void {
    if (confirmId === place.id) {
      removePlace(place.id);
      if (pickedId === place.id) setPickedId(null);
      setConfirmId(null);
      toast.success("Place removed.");
    } else {
      setConfirmId(place.id);
    }
  }

  const isFiltered = search.trim() !== "" || selectedTags.length > 0 || area !== "all";

  return (
    <div className="grid gap-10">
      <div className="grid gap-5">
        <div className="grid gap-2.5">
          <label htmlFor="foods-search" className="text-sm font-medium">
            Search places by name
          </label>
          <Input
            id="foods-search"
            placeholder="E.g. gacoan, soto, sushi…"
            value={search}
            onChange={(event) => handleSearch(event.target.value)}
          />
        </div>

        <div className="grid gap-2.5">
          <p className="text-sm font-medium">Tags (select one or more)</p>
          <div className="flex flex-wrap gap-2.5">
            {catalogTags.map((tag) => {
              const active = visibleTags.includes(tag);
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
          <Select value={effectiveArea} onValueChange={(value) => handleArea(value ?? "all")}>
            <SelectTrigger className="w-52">
              <span>{formatArea(effectiveArea)}</span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All areas</SelectItem>
              {catalogAreas.map((item) => (
                <SelectItem key={item} value={item}>
                  {formatArea(item)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <p className="text-sm text-muted-foreground" aria-live="polite">
            {filtered.length} of {catalogFoods.length} places
          </p>
          {isFiltered && (
            <Button onClick={handleReset} size="sm" variant="ghost">
              Reset filters
            </Button>
          )}
          <Button onClick={openCreate} size="sm" variant="outline">
            <Plus />
            Add place
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          {persistent
            ? "Your additions are saved on this device."
            : "Storage is full — changes apply to this session only."}
        </p>
      </div>

      <div className="grid gap-2.5">
        <Button
          disabled={filtered.length === 0}
          onClick={handleShuffle}
          variant="secondary"
          className="w-fit"
        >
          Pick randomly from these results
        </Button>
        {picked && (
          <div className="rounded-lg border bg-card p-5 grid gap-2.5" aria-live="polite">
            <p className="text-sm text-muted-foreground">Your random pick:</p>
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
                Shuffle again
              </Button>
            </div>
          </div>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="grid gap-2.5 rounded-lg border border-dashed p-10 text-center justify-items-center">
          <p className="text-lg font-medium">No matches — remove tags or reset filters</p>
          <Button onClick={handleReset} variant="outline">
            Reset filters
          </Button>
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((place) => (
            <li key={place.id} className="rounded-lg border bg-card p-5 grid gap-2.5 content-start">
              <div className="flex items-start justify-between gap-2.5">
                <p className="font-medium">{place.name}</p>
                <div className="flex shrink-0 gap-1">
                  <Button
                    aria-label={`Edit ${place.name}`}
                    onClick={(event) => openEdit(event, place)}
                    size="icon-sm"
                    variant="ghost"
                  >
                    <Pencil />
                  </Button>
                  <Button
                    aria-label={`Delete ${place.name}`}
                    onClick={() => handleDeleteClick(place)}
                    size="icon-sm"
                    variant="ghost"
                  >
                    <Trash2 />
                  </Button>
                </div>
              </div>
              <div className="flex flex-wrap gap-2.5">
                {place.tags.map((tag) => (
                  <Badge key={tag} variant="secondary">
                    {tag}
                  </Badge>
                ))}
              </div>
              <p className="text-sm text-muted-foreground">{formatArea(place.area)}</p>
              {confirmId === place.id && (
                <div className="grid gap-2.5 rounded-md border border-destructive/50 p-2.5">
                  <p className="text-sm">Delete {place.name}?</p>
                  <div className="flex gap-2.5">
                    <Button onClick={() => setConfirmId(null)} size="sm" variant="outline">
                      Cancel
                    </Button>
                    <Button
                      onClick={() => handleDeleteClick(place)}
                      size="sm"
                      variant="destructive"
                    >
                      Yes, delete
                    </Button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {form && (
        <FoodFormDialog
          existing={catalogFoods}
          key={form.place?.id ?? "new"}
          onClose={closeForm}
          onSubmit={handleFormSubmit}
          open
          place={form.place}
          tagSuggestions={catalogTags}
        />
      )}
    </div>
  );
}
