import type { Entry, EntryCategory, EntryMode } from "@app/slices/library/model.js";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { EllipsisIcon, PlusIcon } from "lucide-react";
import { useState } from "react";
import { removeEntry } from "@/api";
import { useApp } from "@/app-context";
import { ConfirmDialog } from "@/components/confirm";
import { RailGroup } from "@/components/rail";
import { SlotChip } from "@/components/slot-chip";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { categoryOptions, modeLabel } from "@/lib/entry-options";
import { entriesQuery, keys } from "@/queries";

// One row of the rundown, and the same shape for a skeleton. Mode sits in its own 70 px
// column beside the name; the Slots column collapses under both below 768 px.
const row =
  "grid grid-cols-[minmax(0,1fr)_auto_auto_32px] items-center gap-x-[14px] gap-y-[6px] border-b border-line px-4 py-[14px] last:border-b-0 md:grid-cols-[260px_70px_minmax(0,1fr)_auto_32px]";
const slotsCell =
  "col-span-4 col-start-1 row-start-2 flex flex-wrap gap-[6px] md:col-span-1 md:col-start-3 md:row-start-1";

// Every saved entry of one category, sorted by name by the list endpoint. The tab switch has to
// rewrite the URL it is already on, so it is handed up to router.tsx rather than reaching for a
// router here - the same division 04 Prompts makes.
export function EntriesRoute({
  category,
  onCategory,
}: {
  readonly category: EntryCategory;
  readonly onCategory: (next: EntryCategory) => void;
}) {
  const { api } = useApp();
  const queryClient = useQueryClient();
  const entries = useQuery(entriesQuery(api));
  const [deleting, setDeleting] = useState<Entry | undefined>(undefined);

  const remove = useMutation({
    mutationFn: (id: string) => removeEntry(api, id),
    onSettled: async () => {
      setDeleting(undefined);
      await queryClient.invalidateQueries({ queryKey: keys.entries });
    },
  });

  const listed = entries.data?.entries.filter((entry) => entry.category === category);

  return (
    <div className="mx-auto max-w-[1440px]">
      <h1 className="mb-4 text-title font-bold tracking-[-0.01em]">Intros &amp; Outros</h1>

      <div className="mb-4 flex items-center gap-4">
        <ToggleGroup
          type="single"
          value={category}
          aria-label="Entry category"
          onValueChange={(next) => {
            const picked = categoryOptions.find((option) => option.value === next);
            if (picked !== undefined) {
              onCategory(picked.value);
            }
          }}
        >
          {categoryOptions.map((option) => (
            <ToggleGroupItem key={option.value} value={option.value}>
              {option.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <span className="flex-1" />
        <Button asChild>
          <Link to="/entries/new" search={{ category }}>
            <PlusIcon aria-hidden="true" className="size-[14px]" />
            New entry
          </Link>
        </Button>
      </div>

      {entries.error === null ? null : (
        <RailGroup>
          <p className="px-4 py-[14px] text-body text-red">{entries.error.message}</p>
        </RailGroup>
      )}

      {listed === undefined ? (
        entries.error === null ? (
          <SkeletonRows />
        ) : null
      ) : listed.length === 0 ? (
        <EmptyCategory category={category} />
      ) : (
        <RailGroup>
          {listed.map((entry) => (
            <div key={entry.id} className={row}>
              <span className="col-start-1 row-start-1 font-semibold">{entry.name}</span>
              <ModeChip mode={entry.mode} />
              <span className={slotsCell}>
                {entry.slots.map((slot) => (
                  <SlotChip key={slot} name={slot} />
                ))}
              </span>
              <Button className="col-start-3 row-start-1 md:col-start-4" asChild>
                <Link to="/entries/$entryId" params={{ entryId: entry.id }}>
                  Edit
                </Link>
              </Button>
              <RowOverflow
                entry={entry}
                onDelete={() => {
                  setDeleting(entry);
                }}
              />
            </div>
          ))}
        </RailGroup>
      )}

      {remove.error === null ? null : (
        <p className="mt-[10px] text-label text-red">{remove.error.message}</p>
      )}

      <ConfirmDialog
        open={deleting !== undefined}
        title={deleting === undefined ? "" : `Delete "${deleting.name}"?`}
        // A project holds its own rendered text, so nothing it made is
        // touched. It goes on showing the name it was run with, marked "(deleted)".
        consequence="Projects that used it keep their text."
        verb="Delete"
        pending={remove.isPending}
        onConfirm={() => {
          if (deleting !== undefined) {
            remove.mutate(deleting.id);
          }
        }}
        onCancel={() => {
          setDeleting(undefined);
        }}
      />
    </div>
  );
}

// TEXT or LLM, engraved, in the darker fill of the reference sheet. It is not a
// `SlotChip`: a slot chip names a `{{name}}` the body holds and fades in as it is typed,
// while this names what the row does with its body and is as still as the name beside it.
function ModeChip({ mode }: { readonly mode: EntryMode }) {
  return (
    <span
      data-entry-mode={mode}
      className="engraved col-start-2 row-start-1 justify-self-start rounded-control border border-line2 bg-panel2 px-[7px] py-[2px] font-bold text-ink"
    >
      {modeLabel(mode)}
    </span>
  );
}

// An empty category teaches what the thing is and where it lands in the run.
function EmptyCategory({ category }: { readonly category: EntryCategory }) {
  const where = category === "intro" ? "before" : "after";
  return (
    <RailGroup>
      <p className="max-w-[75ch] px-4 py-7 text-ink2">
        {`No ${category}s yet. An ${category} is narrated ${where} the body in the run's voice.`}
      </p>
    </RailGroup>
  );
}

function RowOverflow({
  entry,
  onDelete,
}: {
  readonly entry: Entry;
  readonly onDelete: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          aria-label={`More for ${entry.name}`}
          className="col-start-4 row-start-1 size-8 p-0 md:col-start-5"
        >
          <EllipsisIcon aria-hidden="true" className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        {/* The copy is named "<name> copy" and opened for editing, so a name that
            is already taken is renamed before it is ever saved. */}
        <DropdownMenuItem asChild>
          <Link to="/entries/new" search={{ category: entry.category, from: entry.id }}>
            Duplicate
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onDelete}>Delete</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function SkeletonRows() {
  return (
    <RailGroup>
      {[0, 1, 2].map((index) => (
        <div key={index} className={row}>
          <span className="col-start-1 row-start-1 h-3 w-40 rounded-control bg-panel2" />
          <span className="col-start-2 row-start-1 h-[18px] w-10 rounded-control bg-panel2" />
          <span className={slotsCell}>
            <span className="h-[18px] w-14 rounded-control bg-panel2" />
          </span>
          <span className="col-start-3 row-start-1 h-7 w-12 rounded-control bg-panel2 md:col-start-4" />
        </div>
      ))}
    </RailGroup>
  );
}
