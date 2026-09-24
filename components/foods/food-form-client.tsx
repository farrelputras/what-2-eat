"use client";

import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  FOOD_AREAS,
  MAX_INGREDIENTS_PER_PLACE,
  MAX_MENUS_PER_PLACE,
  MAX_ORIGINS_PER_PLACE,
  MAX_SERVINGS_PER_PLACE,
  formatFacetValue,
  validateFoodInput,
  type FoodInput,
  type FoodInputErrors,
} from "@/lib/foods";
import {
  HEALTH_STYLE_VOCAB,
  INGREDIENT_VOCAB,
  MENU_VOCAB,
  ORIGIN_VOCAB,
  PRICE_TIER_VOCAB,
  SERVING_VOCAB,
  type HealthStyle,
  type PriceTier,
} from "@/lib/foods/types";
import type { FoodPlace } from "@/lib/foods/types";

interface FoodFormDialogProps {
  existing: FoodPlace[];
  onClose: () => void;
  onSubmit: (input: FoodInput) => void;
  open: boolean;
  place: FoodPlace | null;
}

function formatArea(area: string): string {
  return area.charAt(0).toUpperCase() + area.slice(1);
}

function toggleCapped(values: string[], value: string, cap: number): string[] {
  if (values.includes(value)) return values.filter((item) => item !== value);
  if (values.length >= cap) return values;
  return [...values, value];
}

interface MultiFacetProps {
  cap: number;
  error?: string;
  idPrefix: string;
  onToggle: (value: string) => void;
  title: string;
  values: readonly string[];
  selected: string[];
}

function MultiFacet({ cap, error, idPrefix, onToggle, selected, title, values }: MultiFacetProps) {
  return (
    <fieldset className="grid gap-2.5" aria-invalid={error ? true : undefined}>
      <legend className="text-sm font-medium">
        {title} ({selected.length}/{cap})
      </legend>
      <div className="flex flex-wrap gap-2.5">
        {values.map((value) => (
          <Label key={value} htmlFor={`${idPrefix}-${value}`}>
            <input
              checked={selected.includes(value)}
              className="cursor-pointer"
              id={`${idPrefix}-${value}`}
              onChange={() => onToggle(value)}
              type="checkbox"
              value={value}
            />
            {formatFacetValue(value)}
          </Label>
        ))}
      </div>
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
    </fieldset>
  );
}

interface SingleFacetProps {
  error?: string;
  hint?: string;
  idPrefix: string;
  onChange: (value: string) => void;
  title: string;
  values: readonly string[];
  selected: string;
}

function SingleFacet({
  error,
  hint,
  idPrefix,
  onChange,
  selected,
  title,
  values,
}: SingleFacetProps) {
  return (
    <fieldset className="grid gap-2.5" aria-invalid={error ? true : undefined}>
      <legend className="text-sm font-medium">{title}</legend>
      <div className="flex flex-wrap gap-2.5">
        <Label htmlFor={`${idPrefix}-unset`}>
          <input
            checked={selected === ""}
            className="cursor-pointer"
            id={`${idPrefix}-unset`}
            name={idPrefix}
            onChange={() => onChange("")}
            type="radio"
            value=""
          />
          Not set
        </Label>
        {values.map((value) => (
          <Label key={value} htmlFor={`${idPrefix}-${value}`}>
            <input
              checked={selected === value}
              className="cursor-pointer"
              id={`${idPrefix}-${value}`}
              name={idPrefix}
              onChange={() => onChange(value)}
              type="radio"
              value={value}
            />
            {formatFacetValue(value)}
          </Label>
        ))}
      </div>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
    </fieldset>
  );
}

export function FoodFormDialog({ existing, onClose, onSubmit, open, place }: FoodFormDialogProps) {
  const [name, setName] = useState(place?.name ?? "");
  const [areas, setAreas] = useState<string[]>(place?.areas ?? []);
  const [instagramUrl, setInstagramUrl] = useState(place?.instagramUrl ?? "");
  const [tiktokUrl, setTiktokUrl] = useState(place?.tiktokUrl ?? "");
  const [menus, setMenus] = useState<string[]>(place?.menus ?? []);
  const [servings, setServings] = useState<string[]>(place?.servings ?? []);
  const [ingredients, setIngredients] = useState<string[]>(place?.ingredients ?? []);
  const [origins, setOrigins] = useState<string[]>(place?.origins ?? []);
  const [priceTier, setPriceTier] = useState<string>(place?.priceTier ?? "");
  const [healthStyle, setHealthStyle] = useState<string>(place?.healthStyle ?? "");
  const [errors, setErrors] = useState<FoodInputErrors>({});

  function toggleArea(area: string): void {
    setAreas((prev) =>
      prev.includes(area) ? prev.filter((item) => item !== area) : [...prev, area],
    );
  }

  function handleSubmit(event: FormEvent): void {
    event.preventDefault();
    const input: FoodInput = {
      areas,
      ...(healthStyle ? { healthStyle: healthStyle as HealthStyle } : {}),
      ingredients,
      instagramUrl,
      menus,
      name,
      origins,
      ...(priceTier ? { priceTier: priceTier as PriceTier } : {}),
      servings,
      tiktokUrl,
    };
    const next = validateFoodInput(input, existing, place?.id);
    setErrors(next);
    if (
      next.areas ??
      next.facets ??
      next.healthStyle ??
      next.ingredients ??
      next.instagramUrl ??
      next.menus ??
      next.name ??
      next.origins ??
      next.priceTier ??
      next.servings ??
      next.tiktokUrl
    )
      return;
    onSubmit(input);
  }

  return (
    <Dialog
      onOpenChange={(isOpen) => {
        if (!isOpen) onClose();
      }}
      open={open}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{place ? "Edit place" : "Add place"}</DialogTitle>
          <DialogDescription>Shared with everyone instantly.</DialogDescription>
        </DialogHeader>
        <form className="grid gap-5" onSubmit={handleSubmit}>
          <div className="grid gap-2.5">
            <Label htmlFor="food-form-name">Place name</Label>
            <Input
              aria-invalid={errors.name ? true : undefined}
              autoFocus
              id="food-form-name"
              onChange={(event) => setName(event.target.value)}
              placeholder="E.g. Soto Cak Har"
              value={name}
            />
            {errors.name && (
              <p className="text-sm text-destructive" role="alert">
                {errors.name}
              </p>
            )}
          </div>

          <fieldset className="grid gap-2.5" aria-invalid={errors.areas ? true : undefined}>
            <legend className="text-sm font-medium">Areas</legend>
            <div className="flex flex-wrap gap-2.5">
              {FOOD_AREAS.map((item) => (
                <Label key={item} htmlFor={`food-form-area-${item}`}>
                  <input
                    checked={areas.includes(item)}
                    className="cursor-pointer"
                    id={`food-form-area-${item}`}
                    onChange={() => toggleArea(item)}
                    type="checkbox"
                    value={item}
                  />
                  {formatArea(item)}
                </Label>
              ))}
            </div>
            {errors.areas && (
              <p className="text-sm text-destructive" role="alert">
                {errors.areas}
              </p>
            )}
          </fieldset>

          <MultiFacet
            cap={MAX_MENUS_PER_PLACE}
            error={errors.menus}
            idPrefix="food-form-menu"
            onToggle={(value) => setMenus((prev) => toggleCapped(prev, value, MAX_MENUS_PER_PLACE))}
            selected={menus}
            title="Menu"
            values={MENU_VOCAB}
          />
          <SingleFacet
            error={errors.priceTier}
            hint="Budget ~<20k · regular ~20-50k · premium ~50-100k · splurge ~>100k (guidance only)"
            idPrefix="food-form-price"
            onChange={setPriceTier}
            selected={priceTier}
            title="Price"
            values={PRICE_TIER_VOCAB}
          />
          <MultiFacet
            cap={MAX_SERVINGS_PER_PLACE}
            error={errors.servings}
            idPrefix="food-form-serving"
            onToggle={(value) =>
              setServings((prev) => toggleCapped(prev, value, MAX_SERVINGS_PER_PLACE))
            }
            selected={servings}
            title="Serving"
            values={SERVING_VOCAB}
          />
          <MultiFacet
            cap={MAX_INGREDIENTS_PER_PLACE}
            error={errors.ingredients}
            idPrefix="food-form-ingredient"
            onToggle={(value) =>
              setIngredients((prev) => toggleCapped(prev, value, MAX_INGREDIENTS_PER_PLACE))
            }
            selected={ingredients}
            title="Ingredients"
            values={INGREDIENT_VOCAB}
          />
          <MultiFacet
            cap={MAX_ORIGINS_PER_PLACE}
            error={errors.origins}
            idPrefix="food-form-origin"
            onToggle={(value) =>
              setOrigins((prev) => toggleCapped(prev, value, MAX_ORIGINS_PER_PLACE))
            }
            selected={origins}
            title="Origin"
            values={ORIGIN_VOCAB}
          />
          <SingleFacet
            error={errors.healthStyle}
            idPrefix="food-form-style"
            onChange={setHealthStyle}
            selected={healthStyle}
            title="Style"
            values={HEALTH_STYLE_VOCAB}
          />
          {errors.facets && (
            <p className="text-sm text-destructive" role="alert">
              {errors.facets}
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            Adding price + serving helps others find this place.
          </p>

          <div className="grid gap-2.5">
            <Label htmlFor="food-form-instagram">Instagram (optional)</Label>
            <Input
              aria-invalid={errors.instagramUrl ? true : undefined}
              id="food-form-instagram"
              inputMode="url"
              onChange={(event) => setInstagramUrl(event.target.value)}
              placeholder="https://…"
              value={instagramUrl}
            />
            {errors.instagramUrl && (
              <p className="text-sm text-destructive" role="alert">
                {errors.instagramUrl}
              </p>
            )}
          </div>

          <div className="grid gap-2.5">
            <Label htmlFor="food-form-tiktok">TikTok (optional)</Label>
            <Input
              aria-invalid={errors.tiktokUrl ? true : undefined}
              id="food-form-tiktok"
              inputMode="url"
              onChange={(event) => setTiktokUrl(event.target.value)}
              placeholder="https://…"
              value={tiktokUrl}
            />
            {errors.tiktokUrl && (
              <p className="text-sm text-destructive" role="alert">
                {errors.tiktokUrl}
              </p>
            )}
          </div>

          <div className="flex justify-end gap-2.5">
            <Button onClick={onClose} type="button" variant="outline">
              Cancel
            </Button>
            <Button type="submit">{place ? "Save" : "Add"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
