import type { EntryCategory, EntryDraft } from "@app/slices/library/model.js";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ChevronLeftIcon } from "lucide-react";
import { useId, useState } from "react";
import type { FieldError } from "@/api";
import { removeEntry, saveEntry } from "@/api";
import { useApp } from "@/app-context";
import { ConfirmDialog } from "@/components/confirm";
import { DetectedSlots } from "@/components/detected-slots";
import { EditorActions } from "@/components/editor-actions";
import { backLink, EditorNotice, EditorSkeleton, sheet } from "@/components/editor-states";
import { LabelledSwitch } from "@/components/labelled-switch";
import { useLeaveWhenSaved } from "@/components/saved-tick";
import { SlotBody } from "@/components/slot-body";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  bodyProblems,
  draftProblems,
  firstProblem,
  nameProblems,
  slotNames,
} from "@/lib/draft-lint";
import { categoryOptions, modeHint, modeOptions, noSlotsHint } from "@/lib/entry-options";
import { entriesQuery } from "@/queries";

// One intro or outro: a name, a category, a mode and a body whose `{{slots}}` are shown as they
// are typed. Every rule the Save obeys is the shared lint of `@/lib/draft-lint`, which is the
// server's own `lintEntry`, so the editor refuses exactly what the server would and says the
// same sentence about it.
export function EntryEditorRoute({
  entryId,
  category,
  from,
  onLeave,
}: {
  readonly entryId: string | undefined;
  readonly category: EntryCategory;
  // The entry this one is a copy of, when Duplicate opened the editor.
  readonly from: string | undefined;
  readonly onLeave: (category: EntryCategory) => void;
}) {
  const { api } = useApp();
  const queryClient = useQueryClient();
  const entries = useQuery(entriesQuery(api));
  const nameId = useId();
  const nameErrorId = useId();
  const modeHintId = useId();
  const bodyId = useId();
  const lintId = useId();
  const hintId = useId();

  const [edited, setEdited] = useState<EntryDraft | undefined>(undefined);
  const [refused, setRefused] = useState<readonly FieldError[]>([]);
  const [saved, setSaved] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const rows = entries.data?.entries;
  const wanted = entryId ?? from;
  const found = wanted === undefined ? undefined : rows?.find((entry) => entry.id === wanted);
  const base: EntryDraft =
    found === undefined
      ? { category, mode: "text", name: "", body: "" }
      : {
          category: found.category,
          mode: found.mode,
          name: entryId === undefined ? `${found.name} copy` : found.name,
          body: found.body,
        };
  const draft = edited ?? base;

  const save = useMutation({
    mutationFn: (next: EntryDraft) => saveEntry(api, next, entryId),
    onSuccess: async (result) => {
      if (!result.ok) {
        setRefused(result.fields);
        return;
      }
      setSaved(true);
      await queryClient.invalidateQueries({ queryKey: entriesQuery(api).queryKey });
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => removeEntry(api, id),
    onSuccess: async () => {
      setDeleting(false);
      await queryClient.invalidateQueries({ queryKey: entriesQuery(api).queryKey });
      onLeave(draft.category);
    },
  });

  useLeaveWhenSaved(saved, () => {
    onLeave(draft.category);
  });

  // A refusal names its field and stands until that field is edited, which is how a
  // collision keeps Save held while the taken name is still on the form.
  const edit = (next: EntryDraft, field: string): void => {
    setEdited(next);
    setRefused((current) => current.filter((problem) => problem.field !== field));
  };

  const problems = draftProblems(draft, refused);
  const blocked = firstProblem(problems);
  const slots = slotNames(draft.body);
  // An untouched body is not an error on the page: its "A body is required." is the
  // sentence beside Save, not a red mark on a field nobody has typed in yet.
  const lint = draft.body.trim() === "" ? [] : bodyProblems(problems);
  const named = draft.name.trim() === "" ? [] : nameProblems(problems);

  if (entries.error !== null) {
    return <Notice category={draft.category}>{entries.error.message}</Notice>;
  }
  if (wanted !== undefined && rows === undefined) {
    return <EditorSkeleton />;
  }
  if (wanted !== undefined && found === undefined) {
    return (
      <Notice category={category}>
        That entry is gone. It may have been deleted in another tab.
      </Notice>
    );
  }

  return (
    <div className="mx-auto max-w-[1440px]">
      <Link
        to="/entries"
        search={{ category: draft.category }}
        className="mb-[10px] inline-flex items-center gap-1 text-small text-ink2 hover:text-ink"
      >
        <ChevronLeftIcon aria-hidden="true" className="size-[14px]" />
        Intros &amp; Outros
      </Link>
      <h1 className="mb-4 text-title font-bold tracking-[-0.01em]">
        {entryId === undefined ? "New entry" : "Edit entry"}
      </h1>

      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className={`${sheet} flex min-w-0 flex-col gap-[14px]`}>
          <div className="flex flex-wrap items-end gap-[14px]">
            <div className="min-w-[200px] flex-1">
              <Label htmlFor={nameId} className="mb-[5px]">
                Name
              </Label>
              <Input
                id={nameId}
                value={draft.name}
                aria-invalid={named.length > 0}
                aria-describedby={named.length === 0 ? undefined : nameErrorId}
                onChange={(event) => {
                  edit({ ...draft, name: event.target.value }, "name");
                }}
              />
              {named.length === 0 ? null : (
                <p id={nameErrorId} className="mt-1 text-label text-red">
                  {named.map((problem) => problem.message).join(" ")}
                </p>
              )}
            </div>
            {/* The category may change after creation, and a name is only taken
                within its own category, so a collision under the old one is moot. */}
            <LabelledSwitch
              label="Category"
              value={draft.category}
              options={categoryOptions}
              onPick={(next) => {
                edit({ ...draft, category: next }, "name");
              }}
            />
            <LabelledSwitch
              label="Mode"
              value={draft.mode}
              options={modeOptions}
              describedBy={modeHintId}
              onPick={(next) => {
                edit({ ...draft, mode: next }, "mode");
              }}
            />
          </div>
          {/* The hint belongs under the Mode switch, which sits at the right end of the
              row, so the sentence is set flush right rather than under the Name field it
              says nothing about. */}
          <p id={modeHintId} className="-mt-[6px] text-right text-small text-ink2">
            {modeHint(draft.mode)}
          </p>

          <div>
            <Label htmlFor={bodyId} className="mb-[5px]">
              Body
            </Label>
            <SlotBody
              id={bodyId}
              value={draft.body}
              invalid={lint.length > 0}
              describedBy={lint.length === 0 ? undefined : lintId}
              onChange={(next) => {
                edit({ ...draft, body: next }, "body");
              }}
            />
          </div>

          <EditorActions
            onDelete={
              entryId === undefined
                ? undefined
                : () => {
                    setDeleting(true);
                  }
            }
            blocked={blocked}
            blockedId={hintId}
            pending={save.isPending}
            saved={saved}
            cancel={
              <Button asChild>
                <Link to="/entries" search={{ category: draft.category }}>
                  Cancel
                </Link>
              </Button>
            }
            errors={[save.error, remove.error].flatMap((error) =>
              error === null ? [] : [error.message],
            )}
            onSave={() => {
              save.mutate(draft);
            }}
          />
        </div>

        <div className={`${sheet} flex flex-col gap-3 lg:sticky lg:top-6`}>
          <DetectedSlots
            slots={slots}
            body={draft.body}
            lint={lint}
            lintId={lintId}
            noSlots={noSlotsHint(draft.mode)}
          />
        </div>
      </div>

      <ConfirmDialog
        open={deleting}
        title={`Delete "${draft.name}"?`}
        consequence="Projects that used it keep their text."
        verb="Delete"
        pending={remove.isPending}
        onConfirm={() => {
          if (entryId !== undefined) {
            remove.mutate(entryId);
          }
        }}
        onCancel={() => {
          setDeleting(false);
        }}
      />
    </div>
  );
}

function Notice({
  category,
  children,
}: {
  readonly category: EntryCategory;
  readonly children: string;
}) {
  return (
    <EditorNotice
      back={
        <Link to="/entries" search={{ category }} className={backLink}>
          Back to Intros &amp; Outros
        </Link>
      }
    >
      {children}
    </EditorNotice>
  );
}
