"use client";

import { Pencil, Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import {
  createPlace as createPlaceRemote,
  removePlace as removePlaceRemote,
  subscribeAuthUser,
  subscribeFoodPlaces,
  updatePlace as updatePlaceRemote,
} from "@/lib/firebase/client";
import {
  deriveAreaCatalog,
  deriveFacetCatalog,
  filterFoods,
  formatFacetValue,
  pickRandomFood,
  type FoodInput,
} from "@/lib/foods";
import type { FoodPlace } from "@/lib/foods/types";

import { FoodFormDialog } from "./food-form-client";
import { FoodSocialLinks } from "./food-social-links";

interface FoodsCatalogClientProps {
  bypass?: boolean;
  initialFoods: FoodPlace[];
}

const FACET_META = [
  { dot: "bg-rose-500", key: "menus", label: "Menu", prefix: "Menu" },
  { dot: "bg-emerald-500", key: "priceTiers", label: "Price", prefix: "Price" },
  { dot: "bg-violet-500", key: "servings", label: "Serving", prefix: "Serving" },
  { dot: "bg-amber-500", key: "ingredients", label: "Ingredients", prefix: "Ingredient" },
  { dot: "bg-sky-500", key: "origins", label: "Origin", prefix: "Origin" },
  { dot: "bg-lime-500", key: "healthStyles", label: "Style", prefix: "Style" },
] as const;

type FacetKey = (typeof FACET_META)[number]["key"];

function formatArea(area: string): string {
  if (area === "all") return "All areas";
  return area.charAt(0).toUpperCase() + area.slice(1);
}

function FoodBadges({ place }: { place: FoodPlace }) {
  const tags = place.tags;
  const badges: { ariaLabel: string; dot: string; key: string; text: string }[] = [
    ...tags.menus.map((value) => ({
      ariaLabel: `Menu: ${formatFacetValue(value)}`,
      dot: "bg-rose-500",
      key: `menu-${value}`,
      text: formatFacetValue(value),
    })),
    ...(tags.priceTier
      ? [
          {
            ariaLabel: `Price: ${formatFacetValue(tags.priceTier)}`,
            dot: "bg-emerald-500",
            key: "price",
            text: formatFacetValue(tags.priceTier),
          },
        ]
      : []),
    ...tags.servings.map((value) => ({
      ariaLabel: `Serving: ${formatFacetValue(value)}`,
      dot: "bg-violet-500",
      key: `serving-${value}`,
      text: formatFacetValue(value),
    })),
    ...tags.ingredients.map((value) => ({
      ariaLabel: `Ingredient: ${formatFacetValue(value)}`,
      dot: "bg-amber-500",
      key: `ingredient-${value}`,
      text: formatFacetValue(value),
    })),
    ...tags.origins.map((value) => ({
      ariaLabel: `Origin: ${formatFacetValue(value)}`,
      dot: "bg-sky-500",
      key: `origin-${value}`,
      text: formatFacetValue(value),
    })),
    ...(tags.healthStyle
      ? [
          {
            ariaLabel: `Style: ${formatFacetValue(tags.healthStyle)}`,
            dot: "bg-lime-500",
            key: "health",
            text: formatFacetValue(tags.healthStyle),
          },
        ]
      : []),
  ];
  const pending = tags.pending.map((token) => ({
    ariaLabel: `Pending: ${token}`,
    key: `pending-${token}`,
    text: token,
  }));
  if (badges.length === 0 && pending.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2.5">
      {badges.map((badge) => (
        <Badge aria-label={badge.ariaLabel} key={badge.key} variant="secondary">
          <span aria-hidden="true" className={`size-1.5 rounded-full ${badge.dot}`} />
          {badge.text}
        </Badge>
      ))}
      {pending.map((badge) => (
        <Badge aria-label={badge.ariaLabel} key={badge.key} variant="outline">
          {badge.text}
        </Badge>
      ))}
    </div>
  );
}

export function FoodsCatalogClient({ bypass = false, initialFoods }: FoodsCatalogClientProps) {
  const [foods, setFoods] = useState<FoodPlace[]>(initialFoods);
  const [uid, setUid] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selectedMenus, setSelectedMenus] = useState<string[]>([]);
  const [selectedPriceTiers, setSelectedPriceTiers] = useState<string[]>([]);
  const [selectedServings, setSelectedServings] = useState<string[]>([]);
  const [selectedIngredients, setSelectedIngredients] = useState<string[]>([]);
  const [selectedOrigins, setSelectedOrigins] = useState<string[]>([]);
  const [selectedHealthStyles, setSelectedHealthStyles] = useState<string[]>([]);
  const [area, setArea] = useState("all");
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [form, setForm] = useState<{ place: FoodPlace | null } | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const triggerRef = useRef<HTMLElement | null>(null);

  useEffect(() => subscribeAuthUser((user) => setUid(user?.uid ?? null), { bypass }), [bypass]);

  useEffect(
    () =>
      subscribeFoodPlaces(setFoods, (error) => {
        toast.error(error.message);
      }),
    [],
  );

  const catalog = useMemo(() => deriveFacetCatalog(foods), [foods]);
  const catalogAreas = useMemo(() => deriveAreaCatalog(foods), [foods]);
  // One flat Tags list for discovery. Group order pins colliding values to the
  // same facet as contribution mapping (porridge→menus, mixed→ingredients).
  const allTags = useMemo(() => {
    const seen = new Set<string>();
    const tags: { facet: FacetKey; value: string }[] = [];
    const groups: { facet: FacetKey; values: string[] }[] = [
      { facet: "menus", values: catalog.menus },
      { facet: "priceTiers", values: catalog.priceTiers },
      { facet: "servings", values: catalog.servings },
      { facet: "ingredients", values: catalog.ingredients },
      { facet: "origins", values: catalog.origins },
      { facet: "healthStyles", values: catalog.healthStyles },
    ];
    for (const group of groups) {
      for (const value of group.values) {
        if (seen.has(value)) continue;
        seen.add(value);
        tags.push({ facet: group.facet, value });
      }
    }
    return tags.sort((a, b) => formatFacetValue(a.value).localeCompare(formatFacetValue(b.value)));
  }, [catalog]);

  const selectedByFacet: Record<FacetKey, string[]> = {
    healthStyles: selectedHealthStyles,
    ingredients: selectedIngredients,
    menus: selectedMenus,
    origins: selectedOrigins,
    priceTiers: selectedPriceTiers,
    servings: selectedServings,
  };
  const visibleByFacet: Record<FacetKey, string[]> = {
    healthStyles: selectedHealthStyles.filter((value) => catalog.healthStyles.includes(value)),
    ingredients: selectedIngredients.filter((value) => catalog.ingredients.includes(value)),
    menus: selectedMenus.filter((value) => catalog.menus.includes(value)),
    origins: selectedOrigins.filter((value) => catalog.origins.includes(value)),
    priceTiers: selectedPriceTiers.filter((value) => catalog.priceTiers.includes(value)),
    servings: selectedServings.filter((value) => catalog.servings.includes(value)),
  };
  const effectiveArea = area === "all" || catalogAreas.includes(area) ? area : "all";

  const visibleKey = JSON.stringify(visibleByFacet);
  const filtered = useMemo(() => {
    const visible: Record<FacetKey, string[]> = JSON.parse(visibleKey);
    return filterFoods(foods, {
      area: effectiveArea,
      healthStyles: visible.healthStyles,
      ingredients: visible.ingredients,
      menus: visible.menus,
      origins: visible.origins,
      priceTiers: visible.priceTiers,
      search,
      servings: visible.servings,
    });
  }, [foods, effectiveArea, search, visibleKey]);
  const picked = pickedId ? (foods.find((place) => place.id === pickedId) ?? null) : null;

  function toggleIn(setter: (update: (prev: string[]) => string[]) => void, value: string): void {
    setter((prev) =>
      prev.includes(value) ? prev.filter((item) => item !== value) : [...prev, value],
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
    setSelectedMenus([]);
    setSelectedPriceTiers([]);
    setSelectedServings([]);
    setSelectedIngredients([]);
    setSelectedOrigins([]);
    setSelectedHealthStyles([]);
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

  async function handleFormSubmit(input: FoodInput): Promise<void> {
    if (saving) return;
    if (!uid) {
      toast.error("Please sign in again, then retry.");
      return;
    }
    setSaving(true);
    try {
      if (form?.place) {
        await updatePlaceRemote(form.place.id, input);
        toast.success("Changes saved.");
      } else {
        await createPlaceRemote(input, uid);
        toast.success("Place added.");
      }
      closeForm();
    } catch {
      toast.error("Could not save. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteClick(place: FoodPlace): Promise<void> {
    if (confirmId === place.id) {
      try {
        await removePlaceRemote(place.id);
        if (pickedId === place.id) setPickedId(null);
        setConfirmId(null);
        toast.success("Place removed.");
      } catch {
        toast.error("Could not delete. Please try again.");
      }
    } else {
      setConfirmId(place.id);
    }
  }

  const setters: Record<FacetKey, (update: (prev: string[]) => string[]) => void> = {
    healthStyles: setSelectedHealthStyles,
    ingredients: setSelectedIngredients,
    menus: setSelectedMenus,
    origins: setSelectedOrigins,
    priceTiers: setSelectedPriceTiers,
    servings: setSelectedServings,
  };

  const isFiltered =
    search.trim() !== "" ||
    area !== "all" ||
    Object.values(selectedByFacet).some((selected) => selected.length > 0);

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

        {allTags.length > 0 && (
          <div className="grid gap-2.5">
            <p className="text-sm font-medium">Tags</p>
            <div className="flex flex-wrap gap-2.5">
              {allTags.map(({ facet, value }) => {
                const active = visibleByFacet[facet].includes(value);
                return (
                  <Button
                    aria-pressed={active}
                    key={value}
                    onClick={() => toggleIn(setters[facet], value)}
                    size="sm"
                    variant={active ? "default" : "outline"}
                  >
                    {formatFacetValue(value)}
                  </Button>
                );
              })}
            </div>
          </div>
        )}

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
            {filtered.length} of {foods.length} places
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
          Shared catalog — changes appear for everyone instantly.
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
            <FoodBadges place={picked} />
            <div className="flex flex-wrap gap-2.5">
              {picked.areas.map((item) => (
                <Badge key={item} variant="outline">
                  {formatArea(item)}
                </Badge>
              ))}
            </div>
            <FoodSocialLinks
              instagramUrl={picked.instagramUrl}
              placeName={picked.name}
              tiktokUrl={picked.tiktokUrl}
            />
            <div>
              <Button onClick={handleShuffle} size="sm" variant="outline">
                Shuffle again
              </Button>
            </div>
          </div>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        Badges show the value; color groups them by facet.
      </p>
      {filtered.length === 0 ? (
        <div className="grid gap-2.5 rounded-lg border border-dashed p-10 text-center justify-items-center">
          <p className="text-lg font-medium">No matches — remove filters or reset filters</p>
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
              <FoodBadges place={place} />
              <div className="flex flex-wrap gap-2.5">
                {place.areas.map((item) => (
                  <Badge key={item} variant="outline">
                    {formatArea(item)}
                  </Badge>
                ))}
              </div>
              <FoodSocialLinks
                instagramUrl={place.instagramUrl}
                placeName={place.name}
                tiktokUrl={place.tiktokUrl}
              />
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
          existing={foods}
          key={form.place?.id ?? "new"}
          onClose={closeForm}
          onSubmit={handleFormSubmit}
          open
          place={form.place}
        />
      )}
    </div>
  );
}
