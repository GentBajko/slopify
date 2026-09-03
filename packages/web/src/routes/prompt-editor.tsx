import type { PromptDraft, PromptKind } from "@app/slices/library/model.js";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ChevronLeftIcon } from "lucide-react";
import { useEffect, useId, useState } from "react";
import type { FieldError } from "@/api";
import { removePrompt, savePrompt } from "@/api";
import { useApp } from "@/app-context";
import { ConfirmDialog } from "@/components/confirm";
import { DetectedSlots } from "@/components/detected-slots";
import { RailGroup } from "@/components/rail";
import { SavedTick, savedTickMs } from "@/components/saved-tick";
import { SlotBody } from "@/components/slot-body";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { kindOptions } from "@/lib/prompt-kinds";
import {
  bodyProblems,
  firstProblem,
  nameProblems,
  promptProblems,
  slotNames,
} from "@/lib/prompt-lint";
import { promptsQuery } from "@/queries";

const sheet = "rounded-panel border border-line bg-panel p-[18px]";

// One prompt: a name, a kind and a body whose `{{slots}}` are shown as they are typed
// (uiux/screens/05-prompt-editor.md). Every rule the Save obeys is the shared lint of
// `@/lib/prompt-lint`, so the editor refuses exactly what the server would and says the
// same sentence about it.
export function PromptEditorRoute({
  promptId,
  kind,
  from,
  onLeave,
}: {
  readonly promptId: string | undefined;
  readonly kind: PromptKind;
  // The prompt this one is a copy of (`logic/15` §Q124), when Duplicate opened the editor.
  readonly from: string | undefined;
  readonly onLeave: (kind: PromptKind) => void;
}) {
  const { api } = useApp();
  const queryClient = useQueryClient();
  const prompts = useQuery(promptsQuery(api));
  const nameId = useId();
  const nameErrorId = useId();
  const kindLabelId = useId();
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

  // The tick confirms the write, then the screen goes back to the list it came from
  // (uiux/screens/05-prompt-editor.md, Saved).
  useEffect(() => {
    if (!saved) {
      return;
    }
    const timer = setTimeout(() => {
      onLeave(draft.kind);
    }, savedTickMs);
    return () => {
      clearTimeout(timer);
    };
  }, [saved, onLeave, draft.kind]);

  // A refusal names its field and stands until that field is edited, which is how a
  // collision keeps Save held while the taken name is still on the form.
  const edit = (next: PromptDraft, field: string): void => {
    setEdited(next);
    setRefused((current) => current.filter((problem) => problem.field !== field));
  };

  const problems = promptProblems(draft, refused);
  const blocked = firstProblem(problems);
  const slots = slotNames(draft.body);
  // An untouched body is not an error on the page: its "A body is required." is the
  // sentence beside Save, not a red mark on a field nobody has typed in yet.
  // ceiling: a body past `bodyMax` lands in this list too, under a heading that counts
  // slot errors. It takes 100 000 characters to see; the upgrade is a second list.
  const lint = draft.body.trim() === "" ? [] : bodyProblems(problems);
  const named = draft.name.trim() === "" ? [] : nameProblems(problems);

  if (prompts.error !== null) {
    return <Notice kind={draft.kind}>{prompts.error.message}</Notice>;
  }
  if (wanted !== undefined && rows === undefined) {
    return <Skeleton />;
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
            <div>
              <Label id={kindLabelId} className="mb-[5px]">
                Kind
              </Label>
              <ToggleGroup
                type="single"
                value={draft.kind}
                aria-labelledby={kindLabelId}
                onValueChange={(next) => {
                  const picked = kindOptions.find((option) => option.value === next);
                  if (picked !== undefined) {
                    // §Q122: the kind may change after creation, and a name is only taken
                    // within its own kind, so a collision under the old one is moot.
                    edit({ ...draft, kind: picked.value }, "name");
                  }
                }}
              >
                {kindOptions.map((option) => (
                  <ToggleGroupItem key={option.value} value={option.value}>
                    {option.label}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>
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

          <div className="flex flex-wrap items-center gap-[10px] border-t border-line pt-[14px]">
            {promptId === undefined ? null : (
              <Button
                className="bg-transparent"
                onClick={() => {
                  setDeleting(true);
                }}
              >
                Delete
              </Button>
            )}
            <span className="flex-1" />
            {saved ? <SavedTick /> : null}
            {blocked === undefined ? null : (
              <span id={hintId} className="text-small text-ink2">
                {blocked}
              </span>
            )}
            <Button asChild>
              <Link to="/prompts" search={{ kind: draft.kind }}>
                Cancel
              </Link>
            </Button>
            <Button
              variant="primary"
              aria-disabled={blocked !== undefined || save.isPending || saved}
              aria-describedby={blocked === undefined ? undefined : hintId}
              onClick={() => {
                // `aria-disabled` rather than `disabled`: a button nobody can focus cannot
                // announce the reason it is refusing, so the reason stays reachable and
                // the guard lives here.
                if (blocked === undefined && !save.isPending && !saved) {
                  save.mutate(draft);
                }
              }}
            >
              Save
            </Button>
            {save.error === null ? null : (
              <p className="basis-full text-label text-red">{save.error.message}</p>
            )}
            {remove.error === null ? null : (
              <p className="basis-full text-label text-red">{remove.error.message}</p>
            )}
          </div>
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
    <div className="mx-auto max-w-[1440px]">
      <RailGroup>
        <p className="px-4 py-[14px] text-body text-red">{children}</p>
      </RailGroup>
      <Link
        to="/prompts"
        search={{ kind }}
        className="mt-[10px] inline-block text-small text-run-text underline"
      >
        Back to Prompts
      </Link>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="mx-auto grid max-w-[1440px] grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className={`${sheet} flex flex-col gap-[14px]`}>
        <span className="h-8 w-64 rounded-control bg-panel2" />
        <span className="h-[520px] rounded-control bg-panel2" />
      </div>
      <div className={`${sheet} flex flex-col gap-3`}>
        <span className="h-3 w-28 rounded-control bg-panel2" />
      </div>
    </div>
  );
}
