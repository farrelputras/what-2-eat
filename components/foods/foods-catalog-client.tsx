"use client";

import { Check, Pencil, Plus, Trash2 } from "lucide-react";
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
  subscribeTags,
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
import { buildRegistryMaps, placeMatchesOpenFacets } from "@/lib/tags";
import { tagDocId } from "@/lib/tags/types";
import type { TagDoc } from "@/lib/tags/types";

import { FoodFormDialog } from "./food-form-client";
import { FoodSocialLinks } from "./food-social-links";

interface FoodsCatalogClientProps {
  bypass?: boolean;
  initialFoods: FoodPlace[];
  initialTags: TagDoc[];
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

const STORAGE_FACET_BY_KEY: Record<FacetKey, string> = {
  healthStyles: "healthStyle",
  ingredients: "ingredients",
  menus: "menus",
  origins: "origins",
  priceTiers: "priceTier",
  servings: "servings",
};

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

export function FoodsCatalogClient({
  bypass = false,
  initialFoods,
  initialTags,
}: FoodsCatalogClientProps) {
  const [foods, setFoods] = useState<FoodPlace[]>(initialFoods);
  const [tags, setTags] = useState<TagDoc[]>(initialTags);
  const [uid, setUid] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selectedMenus, setSelectedMenus] = useState<string[]>([]);
  const [selectedPriceTiers, setSelectedPriceTiers] = useState<string[]>([]);
  const [selectedServings, setSelectedServings] = useState<string[]>([]);
  const [selectedIngredients, setSelectedIngredients] = useState<string[]>([]);
  const [selectedOrigins, setSelectedOrigins] = useState<string[]>([]);
  const [selectedHealthStyles, setSelectedHealthStyles] = useState<string[]>([]);
  const [selectedOpen, setSelectedOpen] = useState<Record<string, string[]>>({});
  const [area, setArea] = useState("all");
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [form, setForm] = useState<{ place: FoodPlace | null } | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [excludedIds, setExcludedIds] = useState<Set<string>>(new Set());
  const [spinning, setSpinning] = useState(false);
  const [cyclingName, setCyclingName] = useState<string | null>(null);
  const [pulseId, setPulseId] = useState<string | null>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const spinTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pulseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function prefersReducedMotion(): boolean {
    return (
      typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
    );
  }

  function cancelSpin(): void {
    if (spinTimeoutRef.current) {
      clearTimeout(spinTimeoutRef.current);
      spinTimeoutRef.current = null;
    }
    setSpinning(false);
    setCyclingName(null);
  }

  useEffect(
    () => () => {
      if (spinTimeoutRef.current) clearTimeout(spinTimeoutRef.current);
      if (pulseTimeoutRef.current) clearTimeout(pulseTimeoutRef.current);
    },
    [],
  );

  useEffect(() => subscribeAuthUser((user) => setUid(user?.uid ?? null), { bypass }), [bypass]);

  useEffect(
    () =>
      subscribeFoodPlaces(setFoods, (error) => {
        toast.error(error.message);
      }),
    [],
  );

  // Registry is advisory: empty or unreachable falls back to built-in behavior.
  useEffect(() => subscribeTags(setTags, () => {}), []);

  const maps = useMemo(() => (tags.length > 0 ? buildRegistryMaps(tags) : null), [tags]);
  const catalog = useMemo(() => deriveFacetCatalog(foods), [foods]);
  const catalogAreas = useMemo(() => deriveAreaCatalog(foods), [foods]);
  // One flat Tags list for discovery. Group order pins colliding values to the
  // same facet as contribution mapping (porridge→menus, mixed→ingredients).
  // Registry-only values join the union; deprecated values never get a chip.
  const allTags = useMemo(() => {
    const seen = new Set<string>();
    const chips: { facet: string; key: FacetKey | null; value: string }[] = [];
    const groups: { facet: FacetKey; storage: string; values: string[] }[] = [
      { facet: "menus", storage: "menus", values: catalog.menus },
      { facet: "priceTiers", storage: "priceTier", values: catalog.priceTiers },
      { facet: "servings", storage: "servings", values: catalog.servings },
      { facet: "ingredients", storage: "ingredients", values: catalog.ingredients },
      { facet: "origins", storage: "origins", values: catalog.origins },
      { facet: "healthStyles", storage: "healthStyle", values: catalog.healthStyles },
    ];
    for (const group of groups) {
      for (const value of group.values) {
        if (seen.has(value)) continue;
        if (maps?.deprecatedIds.has(tagDocId(group.storage, value))) continue;
        seen.add(value);
        chips.push({ facet: group.storage, key: group.facet, value });
      }
    }
    if (maps) {
      const keyByStorage = new Map<string, FacetKey>(
        (Object.keys(STORAGE_FACET_BY_KEY) as FacetKey[]).map((key) => [
          STORAGE_FACET_BY_KEY[key],
          key,
        ]),
      );
      maps.suggestionsByFacet.forEach((values, storage) => {
        const key = keyByStorage.get(storage);
        for (const value of values) {
          if (seen.has(value)) continue;
          seen.add(value);
          chips.push({ facet: storage, key: key ?? null, value });
        }
      });
    }
    return chips.sort((a, b) => formatFacetValue(a.value).localeCompare(formatFacetValue(b.value)));
  }, [catalog, maps]);

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
  const visibleOpen: Record<string, string[]> = useMemo(() => {
    const out: Record<string, string[]> = {};
    for (const [facet, values] of Object.entries(selectedOpen)) {
      const current = new Set(maps?.suggestionsByFacet.get(facet) ?? []);
      out[facet] = values.filter((value) => current.has(value));
    }
    return out;
  }, [maps, selectedOpen]);
  const effectiveArea = area === "all" || catalogAreas.includes(area) ? area : "all";

  const visibleKey = JSON.stringify({ known: visibleByFacet, open: visibleOpen });
  const filtered = useMemo(() => {
    const visible = JSON.parse(visibleKey) as {
      known: Record<FacetKey, string[]>;
      open: Record<string, string[]>;
    };
    return filterFoods(foods, {
      area: effectiveArea,
      healthStyles: visible.known.healthStyles,
      ingredients: visible.known.ingredients,
      menus: visible.known.menus,
      origins: visible.known.origins,
      priceTiers: visible.known.priceTiers,
      search,
      servings: visible.known.servings,
    }).filter((place) => placeMatchesOpenFacets(place, visible.open));
  }, [foods, effectiveArea, search, visibleKey]);
  const pool = useMemo(
    () => filtered.filter((place) => !excludedIds.has(place.id)),
    [filtered, excludedIds],
  );
  const picked = pickedId ? (foods.find((place) => place.id === pickedId) ?? null) : null;

  function toggleIn(setter: (update: (prev: string[]) => string[]) => void, value: string): void {
    setter((prev) =>
      prev.includes(value) ? prev.filter((item) => item !== value) : [...prev, value],
    );
    cancelSpin();
    setPickedId(null);
  }

  function toggleOpenFacet(facet: string, value: string): void {
    setSelectedOpen((prev) => {
      const current = prev[facet] ?? [];
      const next = current.includes(value)
        ? current.filter((item) => item !== value)
        : [...current, value];
      return { ...prev, [facet]: next };
    });
    cancelSpin();
    setPickedId(null);
  }

  function handleSearch(value: string): void {
    setSearch(value);
    cancelSpin();
    setPickedId(null);
  }

  function handleArea(value: string): void {
    setArea(value);
    cancelSpin();
    setPickedId(null);
  }

  function handleShuffle(): void {
    if (spinning || pool.length === 0) return;
    if (pool.length === 1 || prefersReducedMotion()) {
      setPickedId(pickRandomFood(pool)?.id ?? null);
      return;
    }
    const snapshot = [...pool];
    cancelSpin();
    setPickedId(null);
    setSpinning(true);
    const totalTicks = 12;
    let tick = 0;
    function scheduleNext(): void {
      const delay = Math.min(55 * Math.pow(1.18, tick), 230);
      spinTimeoutRef.current = setTimeout(() => {
        tick += 1;
        if (tick >= totalTicks) {
          spinTimeoutRef.current = null;
          setCyclingName(null);
          setSpinning(false);
          setPickedId(pickRandomFood(snapshot)?.id ?? null);
          return;
        }
        setCyclingName(pickRandomFood(snapshot)?.name ?? null);
        scheduleNext();
      }, delay);
    }
    setCyclingName(pickRandomFood(snapshot)?.name ?? null);
    scheduleNext();
  }

  function toggleExclude(id: string): void {
    cancelSpin();
    if (pickedId === id) setPickedId(null);
    setExcludedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    if (prefersReducedMotion()) return;
    if (pulseTimeoutRef.current) clearTimeout(pulseTimeoutRef.current);
    setPulseId(id);
    pulseTimeoutRef.current = setTimeout(() => setPulseId(null), 150);
  }

  function handleSelectAll(): void {
    cancelSpin();
    setExcludedIds(new Set());
  }

  function handleClearPool(): void {
    cancelSpin();
    setPickedId(null);
    setExcludedIds(new Set(filtered.map((place) => place.id)));
  }

  function handleReset(): void {
    cancelSpin();
    setArea("all");
    setPickedId(null);
    setSearch("");
    setSelectedMenus([]);
    setSelectedPriceTiers([]);
    setSelectedServings([]);
    setSelectedIngredients([]);
    setSelectedOrigins([]);
    setSelectedHealthStyles([]);
    setSelectedOpen({});
    setExcludedIds(new Set());
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
        setExcludedIds((prev) => {
          if (!prev.has(place.id)) return prev;
          const next = new Set(prev);
          next.delete(place.id);
          return next;
        });
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
    Object.values(selectedByFacet).some((selected) => selected.length > 0) ||
    Object.values(selectedOpen).some((selected) => selected.length > 0);

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
              {allTags.map(({ facet, key, value }) => {
                const active = key
                  ? visibleByFacet[key].includes(value)
                  : ((visibleOpen[facet] ?? []).includes(value) as boolean);
                return (
                  <Button
                    aria-pressed={active}
                    key={value}
                    onClick={() =>
                      key ? toggleIn(setters[key], value) : toggleOpenFacet(facet, value)
                    }
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
            {filtered.length} of {foods.length} places · {pool.length} in shuffle pool
          </p>
          {isFiltered && (
            <Button onClick={handleReset} size="sm" variant="ghost">
              Reset filters
            </Button>
          )}
          {filtered.length > 0 && (
            <>
              <Button
                disabled={excludedIds.size === 0}
                onClick={handleSelectAll}
                size="sm"
                variant="ghost"
              >
                Select all
              </Button>
              <Button
                disabled={pool.length === 0}
                onClick={handleClearPool}
                size="sm"
                variant="ghost"
              >
                Clear pool
              </Button>
            </>
          )}
          <Button onClick={openCreate} size="sm" variant="outline">
            <Plus />
            Add place
          </Button>
        </div>
      </div>

      <div className="grid gap-2.5">
        <Button
          disabled={pool.length === 0 || spinning}
          onClick={handleShuffle}
          variant="secondary"
          className="w-fit"
        >
          {spinning ? "Shuffling…" : "Pick randomly from these results"}
        </Button>
        {pool.length === 0 && filtered.length > 0 && (
          <p className="text-sm text-muted-foreground">Select at least 1 place to shuffle</p>
        )}
        {spinning && (
          <div
            className="rounded-lg border bg-card p-5 grid gap-2.5 min-h-44"
            role="status"
            aria-label="Shuffling places"
          >
            <p className="text-sm text-muted-foreground">Shuffling…</p>
            <p className="text-2xl font-semibold" aria-hidden="true">
              {cyclingName ?? "…"}
            </p>
          </div>
        )}
        {!spinning && picked && (
          <div
            key={picked.id}
            className="rounded-lg border bg-card p-5 grid gap-2.5 animate-in fade-in slide-in-from-bottom-2 duration-300 motion-reduce:animate-none"
            aria-live="polite"
          >
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
              <Button
                disabled={pool.length === 0 || spinning}
                onClick={handleShuffle}
                size="sm"
                variant="outline"
              >
                Shuffle again
              </Button>
            </div>
          </div>
        )}
      </div>

      <div className="grid gap-5">
        {filtered.length > 0 && <h2 className="text-lg font-semibold">Result</h2>}
        {filtered.length === 0 ? (
          <div className="grid gap-2.5 rounded-lg border border-dashed p-10 text-center justify-items-center">
            <p className="text-lg font-medium">No matches — remove filters or reset filters</p>
            <Button onClick={handleReset} variant="outline">
              Reset filters
            </Button>
          </div>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((place) => {
              const inPool = !excludedIds.has(place.id);
              const pulsing = pulseId === place.id;
              return (
                <li
                  key={place.id}
                  className={`rounded-lg border bg-card p-5 grid gap-2.5 content-start transition-all ${inPool ? "" : "border-dashed opacity-60 saturate-50"}`}
                >
                  <div className="flex items-start justify-between gap-2.5">
                    <p className="font-medium">{place.name}</p>
                    <div className="flex shrink-0 gap-1">
                      <Button
                        aria-label={
                          inPool
                            ? `Remove ${place.name} from shuffle pool`
                            : `Add ${place.name} to shuffle pool`
                        }
                        aria-pressed={inPool}
                        onClick={() => toggleExclude(place.id)}
                        size="icon-sm"
                        variant={inPool ? "secondary" : "outline"}
                        className={`transition-transform motion-reduce:transition-none ${pulsing ? "scale-110 motion-reduce:scale-100" : ""} ${inPool ? "" : "border-dashed"}`}
                      >
                        {inPool ? <Check /> : <Plus />}
                      </Button>
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
              );
            })}
          </ul>
        )}
      </div>

      {form && (
        <FoodFormDialog
          existing={foods}
          key={form.place?.id ?? "new"}
          onClose={closeForm}
          onSubmit={handleFormSubmit}
          open
          place={form.place}
          registryTags={tags}
        />
      )}
    </div>
  );
}
