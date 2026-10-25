import {
  nameMax,
  type Prompt,
  type PromptDraft,
  type PromptKind,
} from "@app/slices/library/model.js";
import { defaultShortsPrompt } from "@app/slices/shorts/model.js";
import { defaultPostPrompt } from "@app/slices/social/post-prompt.js";
import { defaultDescriptionPrompt } from "@app/slices/youtube/model.js";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ChevronDownIcon } from "lucide-react";
import { useId, useRef, useState } from "react";
import type { FieldError } from "@/api";
import { removePrompt, savePrompt, setPromptPhotorealistic } from "@/api";
import { useApp } from "@/app-context";
import { DetectedSlots } from "@/components/detected-slots";
import { EditorActions } from "@/components/editor-actions";
import { EditorSkeleton } from "@/components/editor-states";
import { KeywordInsertBar } from "@/components/keyword-insert-bar";
import { Button } from "@/components/kit/button";
import { ConfirmDialog } from "@/components/kit/dialog";
import { Field, HelpLine, Input } from "@/components/kit/field";
import { helpScope, InfoTip } from "@/components/kit/info-tip";
import { PageHeader } from "@/components/kit/layout";
import { ButtonLink } from "@/components/kit/link";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "@/components/kit/menu";
import { Switch } from "@/components/kit/switch";
import { LabelledSwitch } from "@/components/labelled-switch";
import { useLeaveWhenSaved } from "@/components/saved-tick";
import { SlotBody } from "@/components/slot-body";
import type { HelpId } from "@/help/catalog";
import {
  bodyProblems,
  draftProblems,
  draftWarnings,
  firstProblem,
  nameProblems,
  slotNames,
} from "@/lib/draft-lint";
import { usePromptDraft } from "@/lib/form-drafts";
import { narrationStarter } from "@/lib/narration-starter";
import {
  kindAbout,
  kindLabel,
  kindNameExample,
  kindNoun,
  kindOptions,
  kindPlaceholder,
  kindSentence,
} from "@/lib/prompt-kinds";
import {
  EditorCrumb,
  EditorProblem,
  editorAside,
  editorChoice,
  editorSurface,
} from "@/library/editor-frame";
import { promptsQuery } from "@/queries";
import { useTutorialEvent, useTutorialProgress } from "@/tutorial/context";

// A text the body can start from: a saved prompt of the same kind, or the built-in wording.
interface Example {
  readonly key: string;
  readonly name: string;
  readonly body: string;
}

// One prompt: a name, its kind on one line (changed on request), and its instructions, whose
// `{{keywords}}` are listed beside them as they are typed. Every rule the Save obeys is the
// shared lint of `@/lib/draft-lint`, so the editor refuses exactly what the server would and
// says the same sentence about it; a missing name or text is said once the person left the name
// empty or pressed Save, not on arrival.
export function PromptEditorRoute({
  promptId,
  kind,
  from,
  onLeave,
  onMakeVideo,
}: {
  readonly promptId: string | undefined;
  readonly kind: PromptKind;
  // The prompt this one is a copy of, when Duplicate opened the editor.
  readonly from: string | undefined;
  readonly onLeave: (kind: PromptKind) => void;
  // Opens Create with the saved prompt picked: Save and make a video.
  readonly onMakeVideo?: ((prompt: Prompt) => void) | undefined;
}) {
  const { api } = useApp();
  const queryClient = useQueryClient();
  const tutorialEvent = useTutorialEvent();
  const prompts = useQuery(promptsQuery(api));
  const bodyId = useId();
  const lintId = useId();
  const hintId = useId();
  const nameBox = useRef<HTMLInputElement>(null);

  const draftKey = JSON.stringify(
    promptId === undefined ? ["new", kind, from ?? null] : ["prompt", promptId],
  );
  const [edited, setEdited] = usePromptDraft(draftKey);
  const [refused, setRefused] = useState<readonly FieldError[]>([]);
  const [savedPrompt, setSavedPrompt] = useState<Prompt | undefined>(undefined);
  const saved = savedPrompt !== undefined;
  // Where a successful save goes: back to the list, or on to Create with the prompt picked.
  const [then, setThen] = useState<"leave" | "make">("leave");
  const [deleting, setDeleting] = useState(false);
  const [replacing, setReplacing] = useState<Example | undefined>(undefined);
  const [kindOpen, setKindOpen] = useState(false);
  // A missing name or text is said only once it matters: after the name was left empty, or
  // after a press of Save.
  const [nameLeft, setNameLeft] = useState(false);
  const [tried, setTried] = useState(false);

  const rows = prompts.data?.prompts;
  const wanted = promptId ?? from;
  const found = wanted === undefined ? undefined : rows?.find((prompt) => prompt.id === wanted);
  const base: PromptDraft =
    found === undefined
      ? { kind, name: "", body: "" }
      : promptId === undefined
        ? { kind: found.kind, name: `${found.name} copy`, body: found.body }
        : { kind: found.kind, name: found.name, body: found.body };
  const savedDraft: PromptDraft | undefined =
    savedPrompt === undefined
      ? undefined
      : { kind: savedPrompt.kind, name: savedPrompt.name, body: savedPrompt.body };
  const draft = edited ?? savedDraft ?? base;

  const save = useMutation({
    mutationFn: (next: PromptDraft) => savePrompt(api, next, promptId),
    onSuccess: async (result, submitted) => {
      if (!result.ok) {
        setRefused(result.fields);
        return;
      }
      setSavedPrompt(result.value);
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

  // Applies at once, apart from Save: whether Copy for YouTube Studio counts this Image
  // prompt's pictures as realistic-looking (YouTube's third AI use case).
  const photorealistic = useMutation({
    mutationFn: ({ id, on }: { id: string; on: boolean }) => setPromptPhotorealistic(api, id, on),
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: promptsQuery(api).queryKey });
    },
  });

  useLeaveWhenSaved(saved, () => {
    if (then === "make" && savedPrompt !== undefined && onMakeVideo !== undefined)
      onMakeVideo(savedPrompt);
    else onLeave(draft.kind);
  });

  // A refusal names its field and stands until that field is edited, which is how a
  // collision keeps Save held while the taken name is still on the form.
  const edit = (next: PromptDraft, field: string): void => {
    setEdited(next);
    setRefused((current) => current.filter((problem) => problem.field !== field));
  };
  // A new prompt's name follows the first words of its text until a name of one's own is
  // typed, so a prompt can be saved without thinking one up. A copy keeps "<name> copy".
  const editBody = (body: string): void => {
    const follows =
      promptId === undefined &&
      from === undefined &&
      (draft.name.trim() === "" || draft.name === nameFromText(draft.body));
    if (!follows) {
      edit({ ...draft, body }, "body");
      return;
    }
    setEdited({ ...draft, body, name: nameFromText(body) });
    setRefused((current) =>
      current.filter((problem) => problem.field !== "body" && problem.field !== "name"),
    );
  };

  // The stored prompt's own keyword names, which its save lets through, as the server does.
  const grandfathered = promptId !== undefined && found !== undefined ? found.slots : [];
  const problems = draftProblems(draft, refused, grandfathered);
  const nameEmpty = draft.name.trim() === "";
  const bodyEmpty = draft.body.trim() === "";
  // What is said now: an empty name once it was left empty, an empty text once Save was
  // pressed, and every other problem as soon as it is typed.
  const said = problems.filter(
    (problem) =>
      tried ||
      !(
        (problem.field === "name" && nameEmpty && !nameLeft) ||
        (problem.field === "body" && bodyEmpty)
      ),
  );
  const blocked = firstProblem(said);
  const slots = slotNames(draft.body);
  // An untouched text is not an error in the box: its "Enter the text." is the sentence beside
  // Save, not a red mark on a field nobody has typed in yet.
  const lint = bodyEmpty ? [] : bodyProblems(problems);
  const named = nameProblems(said);
  const warnings = bodyEmpty ? [] : draftWarnings(draft);
  useTutorialProgress({
    promptNamed: !nameEmpty && nameProblems(problems).length === 0,
    promptBodyReady: !bodyEmpty && lint.length === 0,
    promptHasKeywords: slots.length > 0 && lint.length === 0,
    promptSaveReady: firstProblem(problems) === undefined && !save.isPending && !saved,
    promptSaving: save.isPending || saved,
    promptIsArticle: draft.kind === "article",
    promptIsImage: draft.kind === "image",
  });

  // Save, or say what stops it: the first problem goes beside Save and a missing name is
  // marked on its field, which gets the cursor.
  const attempt = (next: "leave" | "make"): void => {
    if (problems.length > 0) {
      setTried(true);
      if (nameProblems(problems).length > 0) nameBox.current?.focus();
      return;
    }
    setThen(next);
    save.mutate(draft);
  };

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

  const starter = starterOf(draft.kind);
  const examples: readonly Example[] = [
    ...(starter === undefined ? [] : [{ key: "starter", name: starter.label, body: starter.body }]),
    ...(rows ?? [])
      .filter((prompt) => prompt.kind === draft.kind && prompt.id !== promptId)
      .map((prompt) => ({ key: prompt.id, name: prompt.name, body: prompt.body })),
  ];
  const pickExample = (example: Example): void => {
    if (draft.body.trim() !== "" && draft.body !== example.body) setReplacing(example);
    else editBody(example.body);
  };

  return (
    <div>
      <PageHeader
        crumb={
          <EditorCrumb>
            <Link to="/prompts" search={{ kind: draft.kind }}>
              Prompts
            </Link>
          </EditorCrumb>
        }
        title={`${promptId === undefined ? "New" : "Edit"} ${kindNoun(draft.kind)} prompt`}
      />

      <div
        data-tour="prompt-editor"
        className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]"
      >
        <div className={`${editorSurface} flex min-w-0 flex-col gap-4`}>
          <div className="flex max-w-[80ch] flex-wrap items-start gap-4">
            <div data-tour="prompt-name" className="min-w-[min(100%,240px)] flex-1">
              <Field
                label="Name"
                {...(named.length === 0
                  ? {}
                  : { error: named.map((problem) => problem.message).join(" ") })}
              >
                <Input
                  ref={nameBox}
                  value={draft.name}
                  placeholder={kindNameExample(draft.kind)}
                  onChange={(event) => {
                    edit({ ...draft, name: event.target.value }, "name");
                  }}
                  onBlur={() => {
                    if (nameEmpty) setNameLeft(true);
                  }}
                />
              </Field>
            </div>
            {kindOpen ? null : (
              <div className="flex flex-col gap-1">
                <span className="sl-field__label">Kind</span>
                <span className="flex min-h-[38px] items-center gap-2 text-body text-ink">
                  {`${kindLabel(draft.kind)} prompt`}
                  <Button variant="quiet" size="small" onClick={() => setKindOpen(true)}>
                    Change kind
                  </Button>
                </span>
              </div>
            )}
          </div>
          {/* The kind may change after creation, and a name is only taken within its own
              kind, so a collision under the old one is moot. */}
          {kindOpen ? (
            <div className={editorChoice}>
              <LabelledSwitch
                label="Kind"
                value={draft.kind}
                options={kindOptions}
                help={
                  promptId === undefined
                    ? kindSentence(draft.kind)
                    : `${kindSentence(draft.kind)} Saving moves it to the ${kindNoun(draft.kind)} list.`
                }
                onPick={(next) => {
                  edit({ ...draft, kind: next }, "name");
                }}
              />
            </div>
          ) : null}

          <div data-tour="prompt-body" className="flex flex-col gap-1" {...helpScope}>
            {/* The examples sit on the label's own row, so opening them never moves the text
                up or down. */}
            <div className="flex min-h-8 max-w-[80ch] flex-wrap items-end justify-between gap-3">
              <span className="flex items-center gap-1">
                <label htmlFor={bodyId} className="sl-field__label">
                  Instructions
                </label>
                <InfoTip
                  id={bodyTips[draft.kind]}
                  label={`${kindLabel(draft.kind)} prompt instructions`}
                  className="-my-1"
                />
              </span>
              {examples.length === 0 ? null : (
                <Menu>
                  <MenuTrigger asChild>
                    <Button variant="quiet" size="small">
                      Start from an example
                      <ChevronDownIcon aria-hidden="true" />
                    </Button>
                  </MenuTrigger>
                  <MenuContent align="end">
                    {examples.map((example) => (
                      <MenuItem key={example.key} onSelect={() => pickExample(example)}>
                        {example.name}
                      </MenuItem>
                    ))}
                  </MenuContent>
                </Menu>
              )}
            </div>
            {/* The open kind choice says the same under it. */}
            {kindOpen ? null : <HelpLine className="mb-1">{kindAbout(draft.kind)}</HelpLine>}
            <KeywordInsertBar
              place={draft.kind}
              targetId={bodyId}
              value={draft.body}
              onChange={editBody}
            />
            <SlotBody
              id={bodyId}
              value={draft.body}
              place={draft.kind}
              grandfathered={grandfathered}
              placeholder={kindPlaceholder(draft.kind)}
              invalid={lint.length > 0}
              describedBy={lint.length === 0 ? undefined : lintId}
              onChange={editBody}
            />
          </div>

          {draft.kind === "image" ? (
            <div className="flex flex-col gap-1">
              {promptId !== undefined && found?.kind === "image" ? (
                <Switch
                  checked={
                    photorealistic.isPending
                      ? photorealistic.variables.on
                      : found.photorealistic === true
                  }
                  disabled={photorealistic.isPending}
                  onChange={(on) => photorealistic.mutate({ id: promptId, on })}
                  label="Draws photorealistic pictures"
                  tip="library.prompt.photorealistic"
                />
              ) : (
                <span className="flex items-center gap-1 text-small text-ink-2">
                  Save this Image prompt first, then choose whether it draws photorealistic
                  pictures.
                  <InfoTip id="library.prompt.photorealistic" />
                </span>
              )}
              {photorealistic.error === null ? null : (
                <span role="alert" className="text-small text-danger">
                  {`Couldn't change Draws photorealistic pictures: ${photorealistic.error.message} Press the switch again.`}
                </span>
              )}
            </div>
          ) : null}

          <EditorActions
            data-tour="prompt-save"
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
              <ButtonLink
                to="/prompts"
                search={{ kind: draft.kind }}
                onClick={() => {
                  setEdited(undefined);
                }}
                variant="secondary"
              >
                Cancel
              </ButtonLink>
            }
            also={
              onMakeVideo === undefined
                ? undefined
                : { label: "Save and make a video", run: () => attempt("make") }
            }
            errors={[save.error, remove.error].flatMap((error) =>
              error === null ? [] : [error.message],
            )}
            onSave={() => attempt("leave")}
          />
        </div>

        <div data-tour="prompt-slots" className={editorAside}>
          <DetectedSlots
            slots={slots}
            body={draft.body}
            lint={lint}
            lintId={lintId}
            warnings={warnings}
            place={draft.kind}
            bodyId={bodyId}
            onChange={editBody}
          />
        </div>
      </div>

      <ConfirmDialog
        open={replacing !== undefined}
        title={`Replace the text with “${replacing?.name ?? ""}”?`}
        consequence="The example replaces the text in this editor. Nothing is saved until you press Save."
        confirmLabel="Replace the text"
        tone="primary"
        onConfirm={() => {
          if (replacing !== undefined) editBody(replacing.body);
          setReplacing(undefined);
        }}
        onCancel={() => setReplacing(undefined)}
      />
      <ConfirmDialog
        open={deleting}
        title={`Delete "${draft.name}"?`}
        consequence="Moves it to the trash for 30 days (Settings → Trash). Projects that used it keep their text."
        confirmLabel="Delete prompt"
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

// What each kind's instructions cost and how they are used: the info button beside them.
const bodyTips = {
  article: "library.prompt.body.article",
  image: "library.prompt.body.image",
  thumbnail: "library.prompt.body.thumbnail",
  narration: "library.prompt.body.narration",
  description: "library.prompt.body.description",
  shorts: "library.prompt.body.shorts",
  review: "library.prompt.body.review",
  script: "library.prompt.body.script",
  post: "library.prompt.body.post",
} as const satisfies Record<PromptKind, HelpId>;

// A new prompt's name until one is typed: the first six words of its text, without the
// braces of its keywords or the end of a sentence. Create's New prompt drawer names the same way.
export function nameFromText(body: string): string {
  const words = body
    .replace(/\{\{|\}\}/g, "")
    .split(/\s+/)
    .filter((word) => word !== "")
    .slice(0, 6);
  return words
    .join(" ")
    .replace(/[\s.,:;!?…–—-]+$/u, "")
    .slice(0, nameMax);
}

// The kinds with a built-in text to start from: the documentary delivery cues, and the wording
// the YouTube description, the shorts and the posts use when a project picks no prompt.
export function starterOf(
  kind: PromptKind,
): { readonly label: string; readonly body: string } | undefined {
  if (kind === "narration")
    return { label: "Documentary delivery (built in)", body: narrationStarter };
  if (kind === "description") return { label: "Built-in wording", body: defaultDescriptionPrompt };
  if (kind === "shorts") return { label: "Built-in wording", body: defaultShortsPrompt };
  if (kind === "post") return { label: "Built-in wording", body: defaultPostPrompt };
  return undefined;
}

function Notice({ kind, children }: { readonly kind: PromptKind; readonly children: string }) {
  return (
    <EditorProblem
      back={
        <Link to="/prompts" search={{ kind }}>
          Back to Prompts
        </Link>
      }
    >
      {children}
    </EditorProblem>
  );
}
