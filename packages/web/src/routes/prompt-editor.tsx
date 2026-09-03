import type { PromptDraft, PromptKind } from "@app/slices/library/model.js";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ChevronLeftIcon } from "lucide-react";
import { useId, useState } from "react";
import type { FieldError } from "@/api";
import { removePrompt, savePrompt } from "@/api";
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
import { kindOptions } from "@/lib/prompt-kinds";
import { promptsQuery } from "@/queries";

// One prompt: a name, a kind and a body whose `{{slots}}` are shown as they are typed. Every
// rule the Save obeys is the shared lint of `@/lib/draft-lint`, so the editor refuses exactly
// what the server would and says the same sentence about it.
export function PromptEditorRoute({
  promptId,
  kind,
  from,
  onLeave,
}: {
  readonly promptId: string | undefined;
  readonly kind: PromptKind;
  // The prompt this one is a copy of, when Duplicate opened the editor.
  readonly from: string | undefined;
  readonly onLeave: (kind: PromptKind) => void;
}) {
  const { api } = useApp();
  const queryClient = useQueryClient();
  const prompts = useQuery(promptsQuery(api));
  const nameId = useId();
  const nameErrorId = useId();
  const bodyId = useId();
  const lintId = useId();
  const hintId = useId();

  const [edited, setEdited] = useState<PromptDraft | undefined>(undefined);
  const [refused, setRefused] = useState<readonly FieldError[]>([]);
  const [saved, setSaved] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const rows = prompts.data?.prompts;
  const wanted = promptId ?? from;
  const found = wanted === undefined ? undefined : rows?.find((prompt) => prompt.id === wanted);
  const base: PromptDraft =
    found === undefined
      ? { kind, name: "", body: "" }
      : promptId === undefined
        ? { kind: found.kind, name: `${found.name} copy`, body: found.body }
        : { kind: found.kind, name: found.name, body: found.body };
  const draft = edited ?? base;

  const save = useMutation({
    mutationFn: (next: PromptDraft) => savePrompt(api, next, promptId),
    onSuccess: async (result) => {
      if (!result.ok) {
        setRefused(result.fields);
        return;
      }
      setSaved(true);
      await queryClient.invalidateQueries({ queryKey: promptsQuery(api).queryKey });
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => removePrompt(api, id),
    onSuccess: async () => {
      setDeleting(false);
      await queryClient.invalidateQueries({ queryKey: promptsQuery(api).queryKey });
      onLeave(draft.kind);
    },
  });

  useLeaveWhenSaved(saved, () => {
    onLeave(draft.kind);
  });

  // A refusal names its field and stands until that field is edited, which is how a
  // collision keeps Save held while the taken name is still on the form.
  const edit = (next: PromptDraft, field: string): void => {
    setEdited(next);
    setRefused((current) => current.filter((problem) => problem.field !== field));
  };

  const problems = draftProblems(draft, refused);
  const blocked = firstProblem(problems);
  const slots = slotNames(draft.body);
  // An untouched body is not an error on the page: its "A body is required." is the sentence
  // beside Save, not a red mark on a field nobody has typed in yet. ceiling: a body past
  // `bodyMax` lands in this list too, under a heading that counts slot errors. It takes 100 000
  // characters to see; the upgrade is a second list.
  const lint = draft.body.trim() === "" ? [] : bodyProblems(problems);
  const named = draft.name.trim() === "" ? [] : nameProblems(problems);

  if (prompts.error !== null) {
    return <Notice kind={draft.kind}>{prompts.error.message}</Notice>;
  }
  if (wanted !== undefined && rows === undefined) {
    return <EditorSkeleton />;
  }
  if (wanted !== undefined && found === undefined) {
    return (
      <Notice kind={kind}>That prompt is gone. It may have been deleted in another tab.</Notice>
    );
  }

  return (
    <div className="mx-auto max-w-[1440px]">
      <Link
        to="/prompts"
        search={{ kind: draft.kind }}
        className="mb-[10px] inline-flex items-center gap-1 text-small text-ink2 hover:text-ink"
      >
        <ChevronLeftIcon aria-hidden="true" className="size-[14px]" />
        Prompts
      </Link>
      <h1 className="mb-4 text-title font-bold tracking-[-0.01em]">
        {promptId === undefined ? "New prompt" : "Edit prompt"}
      </h1>

      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className={`${sheet} flex min-w-0 flex-col gap-[14px]`}>
          <div className="flex items-end gap-[14px]">
            <div className="flex-1">
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
            {/* The kind may change after creation, and a name is only taken
                within its own kind, so a collision under the old one is moot. */}
            <LabelledSwitch
              label="Kind"
              value={draft.kind}
              options={kindOptions}
              onPick={(next) => {
                edit({ ...draft, kind: next }, "name");
              }}
            />
          </div>

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
              promptId === undefined
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
                <Link to="/prompts" search={{ kind: draft.kind }}>
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
          <DetectedSlots slots={slots} body={draft.body} lint={lint} lintId={lintId} />
        </div>
      </div>

      <ConfirmDialog
        open={deleting}
        title={`Delete "${draft.name}"?`}
        consequence="Projects that used it keep their text."
        verb="Delete"
        pending={remove.isPending}
        onConfirm={() => {
          if (promptId !== undefined) {
            remove.mutate(promptId);
          }
        }}
        onCancel={() => {
          setDeleting(false);
        }}
      />
    </div>
  );
}

function Notice({ kind, children }: { readonly kind: PromptKind; readonly children: string }) {
  return (
    <EditorNotice
      back={
        <Link to="/prompts" search={{ kind }} className={backLink}>
          Back to Prompts
        </Link>
      }
    >
      {children}
    </EditorNotice>
  );
}
