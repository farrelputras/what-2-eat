"use client";

import { useState, type FormEvent } from "react";

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
  MAX_TAGS_PER_PLACE,
  validateFoodInput,
  type FoodInput,
  type FoodInputErrors,
} from "@/lib/foods";
import type { FoodPlace } from "@/lib/foods/types";

interface FoodFormDialogProps {
  areas: string[];
  existing: FoodPlace[];
  onClose: () => void;
  onSubmit: (input: FoodInput) => void;
  open: boolean;
  place: FoodPlace | null;
}

export function FoodFormDialog({
  areas,
  existing,
  onClose,
  onSubmit,
  open,
  place,
}: FoodFormDialogProps) {
  const [name, setName] = useState(place?.name ?? "");
  const [area, setArea] = useState(place?.area ?? "");
  const [tags, setTags] = useState<string[]>(place?.tags ?? []);
  const [tagDraft, setTagDraft] = useState("");
  const [errors, setErrors] = useState<FoodInputErrors>({});

  function addDraftTags(value: string): void {
    const fresh = value
      .split(",")
      .map((tag) => tag.trim())
      .filter(
        (tag) => tag !== "" && !tags.some((item) => item.toLowerCase() === tag.toLowerCase()),
      );
    if (fresh.length === 0) {
      setTagDraft("");
      return;
    }
    setTags((prev) => [...prev, ...fresh].slice(0, MAX_TAGS_PER_PLACE));
    setTagDraft("");
  }

  function removeTag(tag: string): void {
    setTags((prev) => prev.filter((item) => item !== tag));
  }

  function handleSubmit(event: FormEvent): void {
    event.preventDefault();
    const input: FoodInput = { area, name, tags: [...tags, ...splitDraft(tagDraft)] };
    const next = validateFoodInput(input, existing, place?.id);
    setErrors(next);
    if (next.area ?? next.name ?? next.tags) return;
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
          <DialogTitle>{place ? "Ubah tempat" : "Tambah tempat"}</DialogTitle>
          <DialogDescription>Tersimpan di perangkat ini.</DialogDescription>
        </DialogHeader>
        <form className="grid gap-5" onSubmit={handleSubmit}>
          <div className="grid gap-2.5">
            <Label htmlFor="food-form-name">Nama tempat</Label>
            <Input
              aria-invalid={errors.name ? true : undefined}
              autoFocus
              id="food-form-name"
              onChange={(event) => setName(event.target.value)}
              placeholder="Mis. Soto Cak Har"
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
            <Input
              aria-invalid={errors.area ? true : undefined}
              id="food-form-area"
              list="food-form-area-suggestions"
              onChange={(event) => setArea(event.target.value)}
              placeholder="Mis. surabaya"
              value={area}
            />
            <datalist id="food-form-area-suggestions">
              {areas.map((item) => (
                <option key={item} value={item} />
              ))}
            </datalist>
            {errors.area && (
              <p className="text-sm text-destructive" role="alert">
                {errors.area}
              </p>
            )}
          </div>

          <div className="grid gap-2.5">
            <Label htmlFor="food-form-tags">
              Tag ({tags.length}/{MAX_TAGS_PER_PLACE})
            </Label>
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-2.5">
                {tags.map((tag) => (
                  <Badge key={tag} variant="secondary">
                    {tag}
                    <button
                      aria-label={`Hapus tag ${tag}`}
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
            <Input
              aria-invalid={errors.tags ? true : undefined}
              id="food-form-tags"
              onChange={(event) => setTagDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === ",") {
                  event.preventDefault();
                  addDraftTags(tagDraft);
                } else if (event.key === "Backspace" && tagDraft === "" && tags.length > 0) {
                  removeTag(tags[tags.length - 1] as string);
                }
              }}
              placeholder="Ketik tag lalu Enter atau koma"
              value={tagDraft}
            />
            {errors.tags && (
              <p className="text-sm text-destructive" role="alert">
                {errors.tags}
              </p>
            )}
          </div>

          <div className="flex justify-end gap-2.5">
            <Button onClick={onClose} type="button" variant="outline">
              Batal
            </Button>
            <Button type="submit">{place ? "Simpan" : "Tambah"}</Button>
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
