"use client";

import { cn } from "cn";
import { XIcon } from "lucide-react";
import { useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react";

import { Badge } from "@/components/ui/badge";
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
  foodTagsToTokens,
  formatFacetValue,
  mapFreeTextToTags,
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
  type FoodPlace,
  type FoodTags,
} from "@/lib/foods/types";

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

const SUGGESTION_GROUPS = [
  { facet: "Menu", prefix: "menu", values: MENU_VOCAB },
  { facet: "Price", prefix: "price", values: PRICE_TIER_VOCAB },
  { facet: "Serving", prefix: "serving", values: SERVING_VOCAB },
  { facet: "Ingredient", prefix: "ingredient", values: INGREDIENT_VOCAB },
  { facet: "Origin", prefix: "origin", values: ORIGIN_VOCAB },
  { facet: "Style", prefix: "style", values: HEALTH_STYLE_VOCAB },
] as const;

const DISH_SUGGESTIONS = [
  { facet: "Menu", label: "Soto (menu)", token: "soto" },
  { facet: "Menu", label: "Bakso (menu)", token: "bakso" },
  { facet: "Menu", label: "Rawon (menu)", token: "rawon" },
];

interface TagSuggestion {
  facet: string;
  label: string;
  token: string;
}

function buildTagSuggestions(): TagSuggestion[] {
  const counts = new Map<string, number>();
  for (const group of SUGGESTION_GROUPS) {
    for (const value of group.values) counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  const out: TagSuggestion[] = [...DISH_SUGGESTIONS];
  for (const group of SUGGESTION_GROUPS) {
    for (const value of group.values) {
      out.push({
        facet: group.facet,
        label: `${formatFacetValue(value)} (${group.facet})`,
        token: (counts.get(value) ?? 0) > 1 ? `${group.prefix}:${value}` : value,
      });
    }
  }
  return out;
}

const TAG_SUGGESTIONS = buildTagSuggestions();
const MAX_VISIBLE_SUGGESTIONS = 8;

function chipLabel(token: string): string {
  return TAG_SUGGESTIONS.find((suggestion) => suggestion.token === token)?.label ?? token;
}

interface PickerRow {
  custom: boolean;
  label: string;
  token: string;
}

interface TagsPickerProps {
  invalid?: boolean;
  onTokensChange: (tokens: string[]) => void;
  tokens: string[];
}

function TagsPicker({ invalid, onTokensChange, tokens }: TagsPickerProps) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const query = search.trim().toLowerCase();
  const matches = useMemo(
    () =>
      TAG_SUGGESTIONS.filter(
        (suggestion) =>
          !tokens.includes(suggestion.token) &&
          (suggestion.token.includes(query) || suggestion.label.toLowerCase().includes(query)),
      ).slice(0, MAX_VISIBLE_SUGGESTIONS),
    [query, tokens],
  );
  const canAddCustom =
    query !== "" &&
    !tokens.some((token) => token.toLowerCase() === query) &&
    !TAG_SUGGESTIONS.some((suggestion) => suggestion.token === query);
  const rows: PickerRow[] = [
    ...matches.map((match) => ({ custom: false, label: match.label, token: match.token })),
    ...(canAddCustom ? [{ custom: true, label: query, token: query }] : []),
  ];
  const activeIndex = Math.min(active, rows.length - 1);
  const activeRow = rows[activeIndex];

  function pushToken(token: string): void {
    const value = token.trim().toLowerCase();
    if (value === "") return;
    onTokensChange(
      tokens.some((existing) => existing.toLowerCase() === value) ? tokens : [...tokens, value],
    );
  }

  function commitRow(row: PickerRow): void {
    pushToken(row.token);
    setSearch("");
    setActive(0);
    setOpen(true);
    inputRef.current?.focus();
  }

  function removeToken(token: string): void {
    onTokensChange(tokens.filter((existing) => existing !== token));
    inputRef.current?.focus();
  }

  function handleChange(value: string): void {
    if (value.includes(",")) {
      const parts = value.split(",");
      const rest = parts.pop() ?? "";
      for (const part of parts) pushToken(part);
      setSearch(rest.replace(/^\s+/, ""));
    } else {
      setSearch(value);
    }
    setActive(0);
    setOpen(true);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setActive((index) => Math.min(index + 1, rows.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((index) => Math.max(index - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (activeRow) commitRow(activeRow);
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div
      className="grid gap-2.5"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      {tokens.length > 0 && (
        <div className="flex flex-wrap gap-2.5">
          {tokens.map((token) => (
            <Badge key={token} variant="secondary">
              {chipLabel(token)}
              <button
                aria-label={`Remove ${chipLabel(token)}`}
                className="cursor-pointer"
                onClick={() => removeToken(token)}
                type="button"
              >
                <XIcon />
              </button>
            </Badge>
          ))}
        </div>
      )}
      <div className="relative">
        <Input
          aria-activedescendant={activeRow ? `food-form-tags-option-${activeIndex}` : undefined}
          aria-controls="food-form-tags-listbox"
          aria-expanded={open && rows.length > 0}
          aria-invalid={invalid ? true : undefined}
          id="food-form-tags"
          onChange={(event) => handleChange(event.target.value)}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder="Search tags or type your own…"
          ref={inputRef}
          role="combobox"
          value={search}
        />
        {open && rows.length > 0 && (
          <ul
            aria-label="Tag suggestions"
            className="bg-popover absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-md border p-1 shadow-md"
            id="food-form-tags-listbox"
            role="listbox"
          >
            {rows.map((row, index) => (
              <li
                aria-selected={index === activeIndex}
                id={`food-form-tags-option-${index}`}
                key={row.custom ? `custom-${row.token}` : row.token}
                role="option"
              >
                <button
                  className={cn(
                    "flex w-full cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none",
                    index === activeIndex && "bg-accent text-accent-foreground",
                  )}
                  onClick={() => commitRow(row)}
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseEnter={() => setActive(index)}
                  type="button"
                >
                  {row.custom ? (
                    <>
                      Add &ldquo;{row.label}&rdquo;
                      <span className="text-muted-foreground text-xs">(review queue)</span>
                    </>
                  ) : (
                    row.label
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function TagsPreview({ tags }: { tags: FoodTags }) {
  const groups: { key: string; label: string; values: string[] }[] = [
    { key: "menus", label: "Menu", values: tags.menus },
    ...(tags.priceTier ? [{ key: "priceTier", label: "Price", values: [tags.priceTier] }] : []),
    { key: "servings", label: "Serving", values: tags.servings },
    { key: "ingredients", label: "Ingredients", values: tags.ingredients },
    { key: "origins", label: "Origin", values: tags.origins },
    ...(tags.healthStyle
      ? [{ key: "healthStyle", label: "Style", values: [tags.healthStyle] }]
      : []),
  ].filter((group) => group.values.length > 0);
  if (groups.length === 0 && tags.pending.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">No tags yet — search above or type your own.</p>
    );
  }
  return (
    <div className="grid gap-2.5" aria-live="polite">
      {groups.map((group) => (
        <div key={group.key} className="flex flex-wrap items-center gap-2.5">
          <span className="text-xs text-muted-foreground">{group.label}:</span>
          {group.values.map((value) => (
            <Badge key={`${group.key}-${value}`} variant="secondary">
              {formatFacetValue(value)}
            </Badge>
          ))}
        </div>
      ))}
      {tags.pending.length > 0 && (
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="text-xs text-muted-foreground">Pending:</span>
          {tags.pending.map((token) => (
            <Badge aria-label={`Pending: ${token}`} key={`pending-${token}`} variant="outline">
              {token}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

export function FoodFormDialog({ existing, onClose, onSubmit, open, place }: FoodFormDialogProps) {
  const [name, setName] = useState(place?.name ?? "");
  const [areas, setAreas] = useState<string[]>(place?.areas ?? []);
  const [instagramUrl, setInstagramUrl] = useState(place?.instagramUrl ?? "");
  const [tiktokUrl, setTiktokUrl] = useState(place?.tiktokUrl ?? "");
  const [tokens, setTokens] = useState<string[]>(() => (place ? foodTagsToTokens(place.tags) : []));
  const [errors, setErrors] = useState<FoodInputErrors>({});

  const preview = useMemo(() => mapFreeTextToTags(tokens).tags, [tokens]);

  function toggleArea(area: string): void {
    setAreas((prev) =>
      prev.includes(area) ? prev.filter((item) => item !== area) : [...prev, area],
    );
  }

  function handleSubmit(event: FormEvent): void {
    event.preventDefault();
    const input: FoodInput = {
      areas,
      instagramUrl,
      name,
      tags: mapFreeTextToTags(tokens).tags,
      tiktokUrl,
    };
    const next = validateFoodInput(input, existing, place?.id);
    setErrors(next);
    if (next.areas ?? next.facets ?? next.instagramUrl ?? next.name ?? next.tags ?? next.tiktokUrl)
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

          <div className="grid gap-2.5">
            <Label htmlFor="food-form-tags">Tags</Label>
            <TagsPicker
              invalid={(errors.tags ?? errors.facets) ? true : undefined}
              onTokensChange={setTokens}
              tokens={tokens}
            />
            <TagsPreview tags={preview} />
            {errors.tags && (
              <p className="text-sm text-destructive" role="alert">
                {errors.tags}
              </p>
            )}
            {errors.facets && (
              <p className="text-sm text-destructive" role="alert">
                {errors.facets}
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              Unknown tags go to a review queue — they stay searchable.
            </p>
          </div>

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
