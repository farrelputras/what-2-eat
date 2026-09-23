"use client";

import { useState, type FormEvent, type KeyboardEvent } from "react";

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
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import {
  FOOD_AREAS,
  MAX_TAGS_PER_PLACE,
  validateFoodInput,
  type FoodInput,
  type FoodInputErrors,
} from "@/lib/foods";
import type { FoodPlace } from "@/lib/foods/types";

interface FoodFormDialogProps {
  existing: FoodPlace[];
  onClose: () => void;
  onSubmit: (input: FoodInput) => void;
  open: boolean;
  place: FoodPlace | null;
  tagSuggestions: string[];
}

function formatArea(area: string): string {
  return area.charAt(0).toUpperCase() + area.slice(1);
}

const TAG_LIST_ID = "food-form-tag-list";

export function FoodFormDialog({
  existing,
  onClose,
  onSubmit,
  open,
  place,
  tagSuggestions,
}: FoodFormDialogProps) {
  const [name, setName] = useState(place?.name ?? "");
  const [area, setArea] = useState(place?.area ?? "");
  const [instagramUrl, setInstagramUrl] = useState(place?.instagramUrl ?? "");
  const [tiktokUrl, setTiktokUrl] = useState(place?.tiktokUrl ?? "");
  const [tags, setTags] = useState<string[]>(place?.tags ?? []);
  const [tagDraft, setTagDraft] = useState("");
  const [tagOpen, setTagOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [errors, setErrors] = useState<FoodInputErrors>({});

  const matches =
    tags.length >= MAX_TAGS_PER_PLACE
      ? []
      : tagSuggestions
          .filter(
            (suggestion) => !tags.some((item) => item.toLowerCase() === suggestion.toLowerCase()),
          )
          .filter((suggestion) => suggestion.toLowerCase().includes(tagDraft.trim().toLowerCase()))
          .slice(0, 6);
  const listOpen = tagOpen && matches.length > 0;

  function addTags(values: string[]): void {
    const fresh = values
      .map((tag) => tag.trim())
      .filter(
        (tag) => tag !== "" && !tags.some((item) => item.toLowerCase() === tag.toLowerCase()),
      );
    if (fresh.length > 0) setTags((prev) => [...prev, ...fresh].slice(0, MAX_TAGS_PER_PLACE));
    setTagDraft("");
    setTagOpen(false);
    setActiveIndex(-1);
  }

  function removeTag(tag: string): void {
    setTags((prev) => prev.filter((item) => item !== tag));
  }

  function handleTagKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === "ArrowDown" && matches.length > 0) {
      event.preventDefault();
      setTagOpen(true);
      setActiveIndex((prev) => (prev + 1) % matches.length);
    } else if (event.key === "ArrowUp" && matches.length > 0) {
      event.preventDefault();
      setActiveIndex((prev) => (prev - 1 + matches.length) % matches.length);
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (listOpen && activeIndex >= 0 && matches[activeIndex]) {
        addTags([matches[activeIndex] as string]);
      } else {
        addTags(splitDraft(tagDraft));
      }
    } else if (event.key === ",") {
      event.preventDefault();
      addTags(splitDraft(tagDraft));
    } else if (event.key === "Escape") {
      setTagOpen(false);
      setActiveIndex(-1);
    } else if (event.key === "Backspace" && tagDraft === "" && tags.length > 0) {
      removeTag(tags[tags.length - 1] as string);
    }
  }

  function handleSubmit(event: FormEvent): void {
    event.preventDefault();
    const input: FoodInput = {
      area,
      instagramUrl,
      name,
      tags: [...tags, ...splitDraft(tagDraft)],
      tiktokUrl,
    };
    const next = validateFoodInput(input, existing, place?.id);
    setErrors(next);
    if (next.area ?? next.instagramUrl ?? next.name ?? next.tags ?? next.tiktokUrl) return;
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

          <div className="grid gap-2.5">
            <Label htmlFor="food-form-area">Area</Label>
            <Select onValueChange={(value) => setArea(value ?? "")} value={area}>
              <SelectTrigger className="w-full" id="food-form-area">
                <span className={area === "" ? "text-muted-foreground" : undefined}>
                  {area === "" ? "Select area" : formatArea(area)}
                </span>
              </SelectTrigger>
              <SelectContent>
                {FOOD_AREAS.map((item) => (
                  <SelectItem key={item} value={item}>
                    {formatArea(item)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.area && (
              <p className="text-sm text-destructive" role="alert">
                {errors.area}
              </p>
            )}
          </div>

          <div className="grid gap-2.5">
            <Label htmlFor="food-form-tags">
              Tags ({tags.length}/{MAX_TAGS_PER_PLACE})
            </Label>
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-2.5">
                {tags.map((tag) => (
                  <Badge key={tag} variant="secondary">
                    {tag}
                    <button
                      aria-label={`Remove tag ${tag}`}
                      className="cursor-pointer"
                      onClick={() => removeTag(tag)}
                      type="button"
                    >
                      ×
                    </button>
                  </Badge>
                ))}
              </div>
            )}
            <div className="relative">
              <Input
                aria-activedescendant={
                  listOpen && activeIndex >= 0 ? `food-form-tag-option-${activeIndex}` : undefined
                }
                aria-controls={TAG_LIST_ID}
                aria-expanded={listOpen}
                aria-invalid={errors.tags ? true : undefined}
                id="food-form-tags"
                onBlur={() => setTagOpen(false)}
                onChange={(event) => {
                  setTagDraft(event.target.value);
                  setTagOpen(true);
                  setActiveIndex(-1);
                }}
                onFocus={() => setTagOpen(true)}
                onKeyDown={handleTagKeyDown}
                placeholder="Type to search tags, press Enter to add"
                role="combobox"
                value={tagDraft}
              />
              {listOpen && (
                <div
                  className="bg-popover absolute z-10 mt-1 w-full rounded-md border p-1 shadow-md"
                  id={TAG_LIST_ID}
                  role="listbox"
                >
                  {matches.map((suggestion, index) => (
                    <button
                      aria-selected={index === activeIndex}
                      className={`flex w-full cursor-pointer items-center rounded-sm px-2 py-1.5 text-sm outline-hidden select-none ${index === activeIndex ? "bg-accent text-accent-foreground" : ""}`}
                      id={`food-form-tag-option-${index}`}
                      key={suggestion}
                      onClick={() => addTags([suggestion])}
                      onMouseDown={(event) => event.preventDefault()}
                      role="option"
                      type="button"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {errors.tags && (
              <p className="text-sm text-destructive" role="alert">
                {errors.tags}
              </p>
            )}
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

function splitDraft(draft: string): string[] {
  return draft
    .split(",")
    .map((tag) => tag.trim())
    .filter((tag) => tag !== "");
}
