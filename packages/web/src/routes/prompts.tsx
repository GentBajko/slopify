import type { Prompt, PromptKind } from "@app/slices/library/model.js";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { EllipsisIcon, PlusIcon } from "lucide-react";
import { useState } from "react";
import { removePrompt } from "@/api";
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
import { kindOptions } from "@/lib/prompt-kinds";
import { cn } from "@/lib/utils";
import { keys, promptsQuery } from "@/queries";

// One row of the rundown, and the same shape for a skeleton. The Slots column collapses
// under the name below 768 px (uiux/screens/04-prompts.md, Narrow).
const row =
  "grid grid-cols-[minmax(0,1fr)_auto_32px] items-center gap-x-[14px] gap-y-[6px] border-b border-line px-4 py-[14px] last:border-b-0 md:grid-cols-[260px_minmax(0,1fr)_auto_32px]";
const slotsCell = "col-span-3 col-start-1 row-start-2 flex flex-wrap gap-[6px] md:col-span-1";
const slotsWide = "md:col-start-2 md:row-start-1";

// Every saved prompt of one kind, sorted by name by the list endpoint (`logic/15` step 5).
// Navigation that only follows a link is a `Link`; the tab switch has to rewrite the URL
// it is already on, so it is handed up to router.tsx instead of reaching for a router
// here.
export function PromptsRoute({
  kind,
  onKind,
}: {
  readonly kind: PromptKind;
  readonly onKind: (next: PromptKind) => void;
}) {
  const { api } = useApp();
  const queryClient = useQueryClient();
  const prompts = useQuery(promptsQuery(api));
  const [deleting, setDeleting] = useState<Prompt | undefined>(undefined);

  const remove = useMutation({
    mutationFn: (id: string) => removePrompt(api, id),
    onSettled: async () => {
      setDeleting(undefined);
      await queryClient.invalidateQueries({ queryKey: keys.prompts });
    },
  });

  const listed = prompts.data?.prompts.filter((prompt) => prompt.kind === kind);

  return (
    <div className="mx-auto max-w-[1440px]">
      <h1 className="mb-4 text-title font-bold tracking-[-0.01em]">Prompts</h1>

      <div className="mb-4 flex items-center gap-4">
        <ToggleGroup
          type="single"
          value={kind}
          aria-label="Prompt kind"
          onValueChange={(next) => {
            const picked = kindOptions.find((option) => option.value === next);
            if (picked !== undefined) {
              onKind(picked.value);
            }
          }}
        >
          {kindOptions.map((option) => (
            <ToggleGroupItem key={option.value} value={option.value}>
              {option.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <span className="flex-1" />
        <NewPromptButton kind={kind} />
      </div>

      {prompts.error === null ? null : (
        <RailGroup>
          <p className="px-4 py-[14px] text-body text-red">{prompts.error.message}</p>
        </RailGroup>
      )}

      {listed === undefined ? (
        prompts.error === null ? (
          <SkeletonRows />
        ) : null
      ) : listed.length === 0 ? (
        <EmptyKind kind={kind} />
      ) : (
        <RailGroup>
          {listed.map((prompt) => (
            <div key={prompt.id} className={row}>
              <span className="col-start-1 row-start-1 font-semibold">{prompt.name}</span>
              <span className={cn(slotsCell, slotsWide)}>
                {prompt.slots.map((slot) => (
                  <SlotChip key={slot} name={slot} />
                ))}
              </span>
              <Button className="col-start-2 row-start-1 md:col-start-3" asChild>
                <Link to="/prompts/$promptId" params={{ promptId: prompt.id }}>
                  Edit
                </Link>
              </Button>
              <RowOverflow
                prompt={prompt}
                onDelete={() => {
                  setDeleting(prompt);
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
        // `logic/15` §Q123: a project holds its own rendered text, so nothing it made is
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

function NewPromptButton({ kind }: { readonly kind: PromptKind }) {
  return (
    <Button asChild>
      <Link to="/prompts/new" search={{ kind }}>
        <PlusIcon aria-hidden="true" className="size-[14px]" />
        New prompt
      </Link>
    </Button>
  );
}

// An empty kind teaches what a prompt is and repeats the one action
// (uiux/screens/04-prompts.md, States).
function EmptyKind({ kind }: { readonly kind: PromptKind }) {
  return (
    <RailGroup>
      <div className="flex flex-wrap items-center gap-4 px-4 py-7 text-ink2">
        <span className="max-w-[75ch]">
          {`No ${kind} prompts yet. A prompt is text with {{keywords}}; each keyword becomes a field on Play.`}
        </span>
        <NewPromptButton kind={kind} />
      </div>
    </RailGroup>
  );
}

function RowOverflow({
  prompt,
  onDelete,
}: {
  readonly prompt: Prompt;
  readonly onDelete: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          aria-label={`More for ${prompt.name}`}
          className="col-start-3 row-start-1 size-8 p-0 md:col-start-4"
        >
          <EllipsisIcon aria-hidden="true" className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        {/* §Q124: the copy is named "<name> copy" and opened for editing, so a name that
            is already taken is renamed before it is ever saved. */}
        <DropdownMenuItem asChild>
          <Link to="/prompts/new" search={{ kind: prompt.kind, from: prompt.id }}>
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
          <span className={cn(slotsCell, slotsWide)}>
            <span className="h-[18px] w-14 rounded-control bg-panel2" />
            <span className="h-[18px] w-[72px] rounded-control bg-panel2" />
          </span>
          <span className="col-start-2 row-start-1 h-7 w-12 rounded-control bg-panel2 md:col-start-3" />
        </div>
      ))}
    </RailGroup>
  );
}
