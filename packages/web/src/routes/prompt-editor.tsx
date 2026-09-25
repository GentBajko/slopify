import type { PromptDraft, PromptKind } from "@app/slices/library/model.js";
import { defaultDescriptionPrompt } from "@app/slices/youtube/model.js";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useId, useState } from "react";
import type { FieldError } from "@/api";
import { removePrompt, savePrompt } from "@/api";
import { useApp } from "@/app-context";
import { ConfirmDialog } from "@/components/confirm";
import { DetectedSlots } from "@/components/detected-slots";
import { EditorActions } from "@/components/editor-actions";
import { backLink, EditorNotice, EditorSkeleton, sheet } from "@/components/editor-states";
import { PageBar } from "@/components/kit/page-bar";
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
import { usePromptDraft } from "@/lib/form-drafts";
import { narrationStarter } from "@/lib/narration-starter";
import { kindOptions } from "@/lib/prompt-kinds";
import { promptsQuery } from "@/queries";
import { useTutorialEvent, useTutorialProgress } from "@/tutorial/context";

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
  const tutorialEvent = useTutorialEvent();
  const prompts = useQuery(promptsQuery(api));
  const nameId = useId();
  const nameErrorId = useId();
  const bodyId = useId();
  const lintId = useId();
  const hintId = useId();

  const draftKey = JSON.stringify(
    promptId === undefined ? ["new", kind, from ?? null] : ["prompt", promptId],
  );
  const [edited, setEdited] = usePromptDraft(draftKey);
  const [refused, setRefused] = useState<readonly FieldError[]>([]);
  const [savedDraft, setSavedDraft] = useState<PromptDraft | undefined>(undefined);
  const saved = savedDraft !== undefined;
  const [deleting, setDeleting] = useState(false);
  const [replacingBody, setReplacingBody] = useState(false);

  const rows = prompts.data?.prompts;
  const wanted = promptId ?? from;
  const found = wanted === undefined ? undefined : rows?.find((prompt) => prompt.id === wanted);
  const base: PromptDraft =
    found === undefined
      ? { kind, name: "", body: "" }
      : promptId === undefined
        ? { kind: found.kind, name: `${found.name} copy`, body: found.body }
        : { kind: found.kind, name: found.name, body: found.body };
  const draft = edited ?? savedDraft ?? base;

  const save = useMutation({
    mutationFn: (next: PromptDraft) => savePrompt(api, next, promptId),
    onSuccess: async (result, submitted) => {
      if (!result.ok) {
        setRefused(result.fields);
        return;
      }
      setSavedDraft(result.value);
      // A successful save clears its reusable draft without discarding edits made
      // after the request began. Keep the saved snapshot visible during its tick.
      setEdited((current) => (current === submitted ? undefined : current));
      tutorialEvent({ type: "prompt-saved", id: result.value.id, kind: result.value.kind });
      await queryClient.invalidateQueries({ queryKey: promptsQuery(api).queryKey });
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => removePrompt(api, id),
    onSuccess: async () => {
      setDeleting(false);
      setEdited(undefined);
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
  useTutorialProgress({
    promptNamed: draft.name.trim() !== "" && named.length === 0,
    promptBodyReady: draft.body.trim() !== "" && lint.length === 0,
    promptHasKeywords: slots.length > 0 && lint.length === 0,
    promptSaveReady: blocked === undefined && !save.isPending && !saved,
    promptSaving: save.isPending || saved,
    promptIsArticle: draft.kind === "article",
    promptIsImage: draft.kind === "image",
  });

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
    <div>
      <PageBar
        back={{ to: "/prompts", label: "Prompts", search: { kind: draft.kind } }}
        title={promptId === undefined ? "New prompt" : "Edit prompt"}
      />

      <div
        data-tour="prompt-editor"
        className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]"
      >
        <div className={`${sheet} flex min-w-0 flex-col gap-[14px]`}>
          <div className="flex flex-wrap items-end gap-[14px]">
            <div data-tour="prompt-name" className="flex-1">
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

          <div data-tour="prompt-body">
            {/* The starter sits on the label's own row, so switching Kind never moves the
                body up or down. */}
            <div className="mb-[5px] flex min-h-8 items-end justify-between gap-3">
              <Label htmlFor={bodyId}>Body</Label>
              {starterOf(draft.kind) ? (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    const starter = starterOf(draft.kind);
                    if (starter === undefined) return;
                    if (draft.body.trim() !== "") setReplacingBody(true);
                    else edit({ ...draft, body: starter.body }, "body");
                  }}
                >
                  {starterOf(draft.kind)?.label}
                </Button>
              ) : null}
            </div>
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

          <div data-tour="prompt-save">
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
                  <Link
                    to="/prompts"
                    search={{ kind: draft.kind }}
                    onClick={() => {
                      setEdited(undefined);
                    }}
                  >
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
        </div>

        <div
          data-tour="prompt-slots"
          className={`${sheet} flex flex-col gap-3 lg:sticky lg:top-16`}
        >
          <DetectedSlots slots={slots} body={draft.body} lint={lint} lintId={lintId} />
        </div>
      </div>

      <ConfirmDialog
        open={replacingBody}
        title="Replace this prompt body?"
        consequence="The starter replaces the text in this editor. Nothing is saved until you choose Save."
        verb="Use starter"
        pending={false}
        onConfirm={() => {
          const starter = starterOf(draft.kind);
          if (starter !== undefined) edit({ ...draft, body: starter.body }, "body");
          setReplacingBody(false);
        }}
        onCancel={() => setReplacingBody(false)}
      />
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

// The two kinds with a starting text: the documentary delivery cues, and the wording the
// YouTube description uses when a project picks no prompt.
function starterOf(
  kind: PromptKind,
): { readonly label: string; readonly body: string } | undefined {
  if (kind === "narration") return { label: "Use Documentary Starter", body: narrationStarter };
  if (kind === "description")
    return { label: "Use Built-in Starter", body: defaultDescriptionPrompt };
  return undefined;
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
