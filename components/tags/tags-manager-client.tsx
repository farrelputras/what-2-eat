"use client";

import { Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  addTagSynonym as addTagSynonymRemote,
  applyTagMergeToPlaces,
  createTagDoc as createTagDocRemote,
  deleteTagDoc as deleteTagDocRemote,
  promotePendingToOpenPlaces as promotePendingToOpenPlacesRemote,
  setTagDeprecated as setTagDeprecatedRemote,
  stripTagFromPlaces as stripTagFromPlacesRemote,
  subscribeAuthUser,
  subscribeFoodPlaces,
  subscribeTags,
} from "@/lib/firebase/client";
import { formatFacetValue } from "@/lib/foods";
import type { FoodPlace } from "@/lib/foods/types";
import {
  buildRegistryMaps,
  describeTagUsage,
  findValueCollision,
  isValidTagFacet,
  isValidTagValue,
  parseTagFacet,
  parseTagValue,
  previewMerge,
  type RegistryMaps,
} from "@/lib/tags";
import { isKnownFacet, KNOWN_FACETS, tagDocId } from "@/lib/tags/types";
import type { TagDoc } from "@/lib/tags/types";

interface TagsManagerClientProps {
  bypass?: boolean;
  initialFoods: FoodPlace[];
  initialTags: TagDoc[];
}

function facetLabel(facet: string): string {
  if (facet === "menus") return "Menu";
  if (facet === "servings") return "Serving";
  if (facet === "ingredients") return "Ingredient";
  if (facet === "origins") return "Origin";
  if (facet === "priceTier") return "Price";
  if (facet === "healthStyle") return "Style";
  if (facet === "pending") return "Pending";
  return formatFacetValue(facet);
}

function requireUid(uid: string | null): uid is string {
  if (!uid) toast.error("Please sign in again, then retry.");
  return !!uid;
}

function validateFacetValue(
  facetRaw: string,
  valueRaw: string,
  maps: RegistryMaps,
  existingIds: ReadonlySet<string>,
): { facet: string; value: string } | string {
  const facet = parseTagFacet(facetRaw);
  const value = parseTagValue(valueRaw);
  if (facet === "") return "Pick a facet.";
  if (!isValidTagFacet(facet)) return "Facet must be 1–24 characters, starting with a letter.";
  if (!isValidTagValue(value))
    return "Value must be 1–24 characters: letters, digits, spaces, hyphens (Rice Bowl → rice-bowl).";
  const collision = findValueCollision(value, facet, maps.valueToFacet);
  if (collision) return `"${value}" already lives in ${facetLabel(collision)}.`;
  if (existingIds.has(tagDocId(facet, value)))
    return `"${value}" is already in ${facetLabel(facet)}.`;
  return { facet, value };
}

interface FacetRow {
  count: number;
  doc?: TagDoc;
  examples: string[];
  value: string;
}

function useFacetRows(
  facet: string,
  tags: TagDoc[],
  usage: ReturnType<typeof describeTagUsage>,
): FacetRow[] {
  return useMemo(() => {
    const rows = new Map<string, FacetRow>();
    for (const tag of tags) {
      if (tag.facet === facet)
        rows.set(tag.value, { count: 0, doc: tag, examples: [], value: tag.value });
    }
    const stored = usage.byFacet.get(facet);
    stored?.forEach((entry, value) => {
      const row = rows.get(value) ?? { count: 0, examples: [], value };
      row.count = entry.count;
      row.examples = entry.examples;
      rows.set(value, row);
    });
    return [...rows.values()].sort((a, b) => a.value.localeCompare(b.value));
  }, [facet, tags, usage]);
}

function SynonymBox({ doc, uid }: { doc: TagDoc; uid: string | null }) {
  const [synonym, setSynonym] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleAdd(): Promise<void> {
    if (!requireUid(uid)) return;
    const value = parseTagValue(synonym);
    if (!isValidTagValue(value)) {
      toast.error("Synonym must be 1–24 characters: letters, digits, spaces, hyphens.");
      return;
    }
    if (doc.synonyms.includes(value)) {
      toast.error(`"${value}" is already a synonym of ${doc.value}.`);
      return;
    }
    setSaving(true);
    try {
      await addTagSynonymRemote(doc.id, value, uid);
      setSynonym("");
      toast.success(`"${value}" now suggests ${doc.value}.`);
    } catch {
      toast.error("Could not add the synonym. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2.5">
      <Input
        aria-label={`New synonym for ${doc.value}`}
        className="w-40"
        onChange={(event) => setSynonym(event.target.value)}
        placeholder="e.g. rica-rica"
        value={synonym}
      />
      <Button disabled={saving} onClick={handleAdd} size="sm" variant="outline">
        Add synonym
      </Button>
    </div>
  );
}

interface RenameBoxProps {
  foods: FoodPlace[];
  maps: RegistryMaps;
  sourceFacet: string;
  sourceValue: string;
  tags: TagDoc[];
  uid: string | null;
}

function RenameBox({ foods, maps, sourceFacet, sourceValue, tags, uid }: RenameBoxProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(sourceValue);
  const [confirmed, setConfirmed] = useState(false);
  const [applying, setApplying] = useState(false);

  const target = parseTagValue(draft);
  const targetId = target === "" ? "" : tagDocId(sourceFacet, target);
  const sourceId = tagDocId(sourceFacet, sourceValue);
  const preview = useMemo(() => {
    if (!open || target === "" || !isValidTagValue(target)) return null;
    return previewMerge({
      places: foods,
      sourceFacet,
      sourceValue,
      targetFacet: sourceFacet,
      targetValue: target,
    });
  }, [foods, open, sourceFacet, sourceValue, target]);
  const needsConfirm = (preview?.count ?? 0) > 0;
  const sameTarget = target !== "" && target === sourceValue;
  const alreadyTargetCount = preview?.alreadyTarget.length ?? 0;
  const isSingleValueFacet = sourceFacet === "priceTier" || sourceFacet === "healthStyle";

  async function handleSave(): Promise<void> {
    if (!requireUid(uid)) return;
    if (target === "" || !isValidTagValue(target)) {
      toast.error("Value must be 1–24 characters: letters, digits, spaces, hyphens.");
      return;
    }
    if (target === sourceValue) {
      toast.error("Pick a different name.");
      return;
    }
    const collision = findValueCollision(target, sourceFacet, maps.valueToFacet);
    if (collision) {
      toast.error(`"${target}" already lives in ${facetLabel(collision)}.`);
      return;
    }
    if (!preview) return;
    if (needsConfirm && !confirmed) {
      toast.error("Confirm the impact first — check the box above.");
      return;
    }
    setApplying(true);
    try {
      const isMerge = tags.some((tag) => tag.id === targetId);
      if (!isMerge) {
        await createTagDocRemote({ facet: sourceFacet, value: target }, uid);
      }
      const updated = await applyTagMergeToPlaces({
        sourceFacet,
        sourceValue,
        targetFacet: sourceFacet,
        targetValue: target,
      });
      await setTagDeprecatedRemote(sourceId, true, uid);
      toast.success(
        isMerge
          ? `Merged ${updated} place${updated === 1 ? "" : "s"} into ${target}; ${sourceValue} retired.`
          : `Renamed in ${updated} place${updated === 1 ? "" : "s"}; ${sourceValue} retired.`,
      );
      setOpen(false);
      setConfirmed(false);
    } catch {
      toast.error("Could not apply the rename. Please try again.");
    } finally {
      setApplying(false);
    }
  }

  if (!open) {
    return (
      <Button
        onClick={() => {
          setDraft(sourceValue);
          setConfirmed(false);
          setOpen(true);
        }}
        size="sm"
        variant="ghost"
      >
        Rename
      </Button>
    );
  }

  return (
    <div className="grid gap-2.5 rounded-md border p-2.5">
      <div className="flex flex-wrap gap-2.5">
        <Input
          aria-label={`Rename ${sourceValue} in ${sourceFacet}`}
          className="w-40"
          onChange={(event) => setDraft(event.target.value)}
          placeholder="New value"
          value={draft}
        />
        <Button onClick={() => setOpen(false)} size="sm" variant="outline">
          Cancel
        </Button>
      </div>
      {preview && (
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {preview.count === 0
            ? `No places use ${sourceValue} — renaming only retires the entry.`
            : `${preview.count} place${preview.count === 1 ? "" : "s"} use${preview.count === 1 ? "s" : ""} ${sourceValue}: ${preview.affected
                .slice(0, 3)
                .map((place) => place.name)
                .join(", ")}${preview.count > 3 ? ` +${preview.count - 3} more` : ""}`}
          {preview.count > 0 && alreadyTargetCount > 0
            ? ` ${alreadyTargetCount} already have ${target} — they'll be ${isSingleValueFacet ? "overwritten" : "deduped"}.`
            : ""}
        </p>
      )}
      {needsConfirm && (
        <ConfirmCheckbox
          checked={confirmed}
          onChange={setConfirmed}
          text={`Yes, rewrite ${preview?.count} place${(preview?.count ?? 0) === 1 ? "" : "s"}.`}
        />
      )}
      <div>
        <Button disabled={applying || !preview || sameTarget} onClick={handleSave} size="sm">
          Save
        </Button>
      </div>
    </div>
  );
}

interface DeleteBoxProps {
  count: number;
  examples: string[];
  sourceFacet: string;
  sourceValue: string;
  uid: string | null;
}

function DeleteBox({ count, examples, sourceFacet, sourceValue, uid }: DeleteBoxProps) {
  const [open, setOpen] = useState(false);
  const [applying, setApplying] = useState(false);

  const extra = Math.max(0, count - examples.length);
  const description =
    count === 0
      ? `Nothing uses ${sourceValue} — this removes the entry from the registry.`
      : `${count} place${count === 1 ? "" : "s"} use${count === 1 ? "s" : ""} ${sourceValue}: ${examples.join(", ")}${extra > 0 ? ` +${extra} more` : ""}. This removes it from those places and deletes the registry entry.`;

  async function handleDelete(): Promise<void> {
    if (!requireUid(uid)) return;
    setApplying(true);
    try {
      const removed = await stripTagFromPlacesRemote({ facet: sourceFacet, value: sourceValue });
      await deleteTagDocRemote(tagDocId(sourceFacet, sourceValue));
      toast.success(
        removed === 0
          ? `"${sourceValue}" deleted.`
          : `"${sourceValue}" deleted (removed from ${removed} place${removed === 1 ? "" : "s"}).`,
      );
      setOpen(false);
    } catch {
      toast.error("Could not delete the tag. Please try again.");
    } finally {
      setApplying(false);
    }
  }

  return (
    <>
      <Button
        aria-label={`Delete ${sourceValue}`}
        className="hover:text-destructive"
        onClick={() => setOpen(true)}
        size="icon-sm"
        variant="ghost"
      >
        <Trash2 aria-hidden="true" />
      </Button>
      <Dialog open={open} onOpenChange={(next) => !next && setOpen(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {sourceValue}?</DialogTitle>
            <DialogDescription>{description} This cannot be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button disabled={applying} onClick={() => setOpen(false)} variant="outline">
              Cancel
            </Button>
            <Button disabled={applying} onClick={handleDelete} variant="destructive">
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ConfirmCheckbox({
  checked,
  onChange,
  text,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  text: string;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2.5 text-sm">
      <input
        checked={checked}
        className="cursor-pointer"
        onChange={(event) => onChange(event.target.checked)}
        type="checkbox"
      />
      {text}
    </label>
  );
}

interface TagRowProps {
  foods: FoodPlace[];
  maps: RegistryMaps;
  row: FacetRow;
  sourceFacet: string;
  tags: TagDoc[];
  uid: string | null;
}

function TagRow({ foods, maps, row, sourceFacet, tags, uid }: TagRowProps) {
  const [toggling, setToggling] = useState(false);

  async function handleToggleDeprecate(): Promise<void> {
    if (!row.doc) return;
    if (!requireUid(uid)) return;
    setToggling(true);
    try {
      await setTagDeprecatedRemote(row.doc.id, !row.doc.deprecated, uid);
      toast.success(row.doc.deprecated ? `${row.value} restored.` : `${row.value} deprecated.`);
    } catch {
      toast.error("Could not update the tag. Please try again.");
    } finally {
      setToggling(false);
    }
  }

  return (
    <li className="grid gap-2.5 rounded-lg border p-5">
      <div className="flex flex-wrap items-center gap-2.5">
        <p className="font-medium">{formatFacetValue(row.value)}</p>
        {row.doc?.deprecated && <Badge variant="outline">Deprecated</Badge>}
        {!row.doc && <Badge variant="outline">Not in registry</Badge>}
        <span className="text-sm text-muted-foreground" aria-live="polite">
          {row.count} place{row.count === 1 ? "" : "s"}
          {row.examples.length > 0 ? `: ${row.examples.join(", ")}` : ""}
        </span>
      </div>
      {row.doc && row.doc.synonyms.length > 0 && (
        <div className="flex flex-wrap gap-2.5">
          {row.doc.synonyms.map((synonym) => (
            <Badge key={synonym} variant="secondary">
              {synonym}
            </Badge>
          ))}
        </div>
      )}
      {row.doc && (
        <div className="flex flex-wrap items-center gap-2.5">
          <SynonymBox doc={row.doc} uid={uid} />
          <Button disabled={toggling} onClick={handleToggleDeprecate} size="sm" variant="outline">
            {row.doc.deprecated ? "Restore" : "Deprecate"}
          </Button>
          <RenameBox
            foods={foods}
            maps={maps}
            sourceFacet={sourceFacet}
            sourceValue={row.value}
            tags={tags}
            uid={uid}
          />
          <DeleteBox
            count={row.count}
            examples={row.examples}
            sourceFacet={sourceFacet}
            sourceValue={row.value}
            uid={uid}
          />
        </div>
      )}
    </li>
  );
}

function AddValueBox({
  facet,
  maps,
  tags,
  uid,
}: {
  facet: string;
  maps: RegistryMaps;
  tags: TagDoc[];
  uid: string | null;
}) {
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleAdd(): Promise<void> {
    if (!requireUid(uid)) return;
    const existingIds = new Set(tags.map((tag) => tag.id));
    const parsed = validateFacetValue(facet, value, maps, existingIds);
    if (typeof parsed === "string") {
      toast.error(parsed);
      return;
    }
    setSaving(true);
    try {
      await createTagDocRemote(parsed, uid);
      setValue("");
      toast.success(`"${parsed.value}" added to ${facetLabel(parsed.facet)}.`);
    } catch {
      toast.error("Could not add the value. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-wrap gap-2.5">
      <Input
        aria-label={`New ${facetLabel(facet)} value`}
        className="w-48"
        onChange={(event) => setValue(event.target.value)}
        placeholder={`New value, e.g. ${facet === "menus" ? "Rice Bowl" : "…"}`}
        value={value}
      />
      <Button disabled={saving} onClick={handleAdd} size="sm" variant="outline">
        Add to {facetLabel(facet)}
      </Button>
    </div>
  );
}

function NewFacetBox({
  maps,
  tags,
  uid,
}: {
  maps: RegistryMaps;
  tags: TagDoc[];
  uid: string | null;
}) {
  const [facet, setFacet] = useState("");
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleAdd(): Promise<void> {
    if (!requireUid(uid)) return;
    const existingIds = new Set(tags.map((tag) => tag.id));
    const parsed = validateFacetValue(facet, value, maps, existingIds);
    if (typeof parsed === "string") {
      toast.error(parsed);
      return;
    }
    if (isKnownFacet(parsed.facet)) {
      toast.error("That facet already has a table above — add the value there.");
      return;
    }
    setSaving(true);
    try {
      await createTagDocRemote(parsed, uid);
      setFacet("");
      setValue("");
      toast.success(`New facet ${parsed.facet}:${parsed.value} created.`);
    } catch {
      toast.error("Could not add the value. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-2.5 rounded-lg border p-5">
      <p className="text-sm font-medium">New facet (open enum, e.g. taste)</p>
      <div className="flex flex-wrap gap-2.5">
        <Input
          aria-label="New facet name"
          className="w-40"
          onChange={(event) => setFacet(event.target.value)}
          placeholder="taste"
          value={facet}
        />
        <Input
          aria-label="New facet value"
          className="w-40"
          onChange={(event) => setValue(event.target.value)}
          placeholder="spicy"
          value={value}
        />
        <Button disabled={saving} onClick={handleAdd} size="sm" variant="outline">
          Add facet value
        </Button>
      </div>
    </div>
  );
}

function PendingRow({
  count,
  examples,
  maps,
  tags,
  token,
  uid,
}: {
  count: number;
  examples: string[];
  maps: RegistryMaps;
  tags: TagDoc[];
  token: string;
  uid: string | null;
}) {
  const [facet, setFacet] = useState("");
  const [saving, setSaving] = useState(false);

  async function handlePromote(): Promise<void> {
    if (!requireUid(uid)) return;
    const existingIds = new Set(tags.map((tag) => tag.id));
    const parsed = validateFacetValue(facet, token, maps, existingIds);
    if (typeof parsed === "string") {
      toast.error(parsed);
      return;
    }
    setSaving(true);
    try {
      await createTagDocRemote(parsed, uid);
      if (!isKnownFacet(parsed.facet)) {
        const { refused, updated } = await promotePendingToOpenPlacesRemote(parsed);
        setFacet("");
        toast.success(
          `"${token}" promoted to ${parsed.facet}:${parsed.value} (${updated} place${updated === 1 ? "" : "s"} updated${refused > 0 ? `, ${refused} refused on caps` : ""}).`,
        );
      } else {
        setFacet("");
        toast.success(`"${token}" promoted to ${parsed.facet}:${parsed.value}.`);
      }
    } catch {
      toast.error("Could not promote the tag. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <li className="grid gap-2.5 rounded-lg border p-5">
      <div className="flex flex-wrap items-center gap-2.5">
        <p className="font-medium">{token}</p>
        <span className="text-sm text-muted-foreground">
          {count} place{count === 1 ? "" : "s"}
          {examples.length > 0 ? `: e.g. ${examples.join(", ")}` : ""}
        </span>
      </div>
      <div className="flex flex-wrap gap-2.5">
        <Input
          aria-label={`Promote ${token} to facet`}
          className="w-40"
          onChange={(event) => setFacet(event.target.value)}
          placeholder="Facet, e.g. taste"
          value={facet}
        />
        <Button disabled={saving} onClick={handlePromote} size="sm" variant="outline">
          Promote
        </Button>
      </div>
    </li>
  );
}

export function TagsManagerClient({
  bypass = false,
  initialFoods,
  initialTags,
}: TagsManagerClientProps) {
  const [foods, setFoods] = useState<FoodPlace[]>(initialFoods);
  const [tags, setTags] = useState<TagDoc[]>(initialTags);
  const [uid, setUid] = useState<string | null>(null);
  const [registryError, setRegistryError] = useState<string | null>(null);

  useEffect(() => subscribeAuthUser((user) => setUid(user?.uid ?? null), { bypass }), [bypass]);

  useEffect(
    () =>
      subscribeFoodPlaces(setFoods, (error) => {
        toast.error(error.message);
      }),
    [],
  );

  useEffect(
    () =>
      subscribeTags(
        (next) => {
          setTags(next);
          setRegistryError(null);
        },
        (error) => {
          setRegistryError(error.message);
        },
      ),
    [],
  );

  const maps: RegistryMaps = useMemo(() => buildRegistryMaps(tags), [tags]);
  const usage = useMemo(() => describeTagUsage(foods), [foods]);
  const facets = useMemo(() => [...KNOWN_FACETS, ...maps.openFacets], [maps]);
  const pendingTokens = useMemo(
    () =>
      [...usage.pending.entries()]
        .map(([token, entry]) => ({ examples: entry.examples, token }))
        .sort((a, b) => a.token.localeCompare(b.token)),
    [usage],
  );

  return (
    <div className="grid gap-10">
      {registryError && (
        <p
          className="rounded-lg border border-dashed p-5 text-sm text-muted-foreground"
          role="status"
        >
          Registry unreachable ({registryError}) — the form falls back to built-in vocabs.
        </p>
      )}
      {tags.length === 0 && !registryError && (
        <p
          className="rounded-lg border border-dashed p-5 text-sm text-muted-foreground"
          role="status"
        >
          Registry is empty — run the seed to load the 46 built-in values.
        </p>
      )}
      <div className="grid gap-5">
        <NewFacetBox maps={maps} tags={tags} uid={uid} />
      </div>
      {facets.map((facet) => (
        <FacetSection
          facet={facet}
          foods={foods}
          key={facet}
          maps={maps}
          tags={tags}
          uid={uid}
          usage={usage}
        />
      ))}
      <section className="grid gap-2.5" aria-label="Pending review queue">
        <h2 className="text-xl font-semibold">Pending</h2>
        <p className="text-sm text-muted-foreground">
          Free-text ideas from contributors. Promote one to a facet to make it suggestible.
        </p>
        {pendingTokens.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing waiting — the queue is clear.</p>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {pendingTokens.map((row) => (
              <PendingRow
                count={usage.pending.get(row.token)?.count ?? 0}
                examples={row.examples}
                key={row.token}
                maps={maps}
                tags={tags}
                token={row.token}
                uid={uid}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function FacetSection({
  facet,
  foods,
  maps,
  tags,
  uid,
  usage,
}: {
  facet: string;
  foods: FoodPlace[];
  maps: RegistryMaps;
  tags: TagDoc[];
  uid: string | null;
  usage: ReturnType<typeof describeTagUsage>;
}) {
  const rows = useFacetRows(facet, tags, usage);
  return (
    <section className="grid gap-2.5" aria-label={`${facetLabel(facet)} tags`}>
      <h2 className="text-xl font-semibold">{facetLabel(facet)}</h2>
      <AddValueBox facet={facet} maps={maps} tags={tags} uid={uid} />
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No values yet.</p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((row) => (
            <TagRow
              foods={foods}
              key={row.value}
              maps={maps}
              row={row}
              sourceFacet={facet}
              tags={tags}
              uid={uid}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
