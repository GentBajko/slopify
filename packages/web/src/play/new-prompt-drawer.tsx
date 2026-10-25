import {
  nameMax,
  type Prompt,
  type PromptDraft,
  type PromptKind,
} from "@app/slices/library/model.js";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type ReactElement, useId, useRef, useState } from "react";
import type { FieldError } from "@/api";
import { savePrompt } from "@/api";
import { useApp } from "@/app-context";
import { DetectedSlots } from "@/components/detected-slots";
import { KeywordInsertBar } from "@/components/keyword-insert-bar";
import { StatusSlot } from "@/components/kit/action-bar";
import { Button } from "@/components/kit/button";
import { Drawer } from "@/components/kit/drawer";
import { Field, HelpLine, Input } from "@/components/kit/field";
import { helpScope } from "@/components/kit/info-tip";
import { SlotBody } from "@/components/slot-body";
import { StartFromExample } from "@/components/start-from-example";
import {
  bodyProblems,
  draftProblems,
  draftWarnings,
  firstProblem,
  nameProblems,
  slotNames,
} from "@/lib/draft-lint";
import { usePromptDraft } from "@/lib/form-drafts";
import { exampleGroups } from "@/lib/prompt-examples";
import { kindAbout, kindNameExample, kindNoun, kindPlaceholder } from "@/lib/prompt-kinds";
import { promptsQuery } from "@/queries";
import { nameFromText } from "@/routes/prompt-editor";

// New prompt from Create (and Edit template, which draws the same rows): the prompt editor's
// name and text in a drawer beside the setup, so nothing is left behind. Save keeps the prompt
// on Prompts and hands it back to be picked. What is typed is kept in this browser under the
// key Prompts' own New prompt uses, so closing the drawer loses nothing. Changing the kind,
// replacing a text with an example, and an image prompt's photorealistic switch stay in the
// full editor on Prompts. The same lint as there (`@/lib/draft-lint`) holds Save.
export function NewPromptDrawer({
  kind,
  open,
  onClose,
  onSaved,
}: {
  readonly kind: PromptKind;
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onSaved: (prompt: Prompt) => void;
}): ReactElement {
  const { api } = useApp();
  const client = useQueryClient();
  const prompts = useQuery({ ...promptsQuery(api), enabled: open });
  const bodyId = useId();
  const lintId = useId();
  const statusId = useId();
  const nameBox = useRef<HTMLInputElement>(null);
  const [edited, setEdited] = usePromptDraft(JSON.stringify(["new", kind, null]));
  const [refused, setRefused] = useState<readonly FieldError[]>([]);
  // A missing name or text is said only once it matters: after the name was left empty, or
  // after a press of Save.
  const [nameLeft, setNameLeft] = useState(false);
  const [tried, setTried] = useState(false);
  const draft: PromptDraft = edited ?? { kind, name: "", body: "" };

  const save = useMutation({
    mutationFn: (next: PromptDraft) => savePrompt(api, next, undefined),
    onSuccess: async (result) => {
      if (!result.ok) {
        setRefused(result.fields);
        return;
      }
      setEdited(undefined);
      setTried(false);
      setNameLeft(false);
      await client.invalidateQueries({ queryKey: promptsQuery(api).queryKey });
      onSaved(result.value);
    },
  });

  // A refusal stands until its field is edited.
  const edit = (next: PromptDraft, field: string): void => {
    setEdited(next);
    setRefused((current) => current.filter((problem) => problem.field !== field));
  };
  // The name follows the text's first words until a name of one's own is typed.
  const editBody = (body: string): void => {
    if (draft.name.trim() !== "" && draft.name !== nameFromText(draft.body)) {
      edit({ ...draft, body }, "body");
      return;
    }
    setEdited({ ...draft, body, name: nameFromText(body) });
    setRefused((current) =>
      current.filter((problem) => problem.field !== "body" && problem.field !== "name"),
    );
  };

  const problems = draftProblems(draft, refused);
  const nameEmpty = draft.name.trim() === "";
  const bodyEmpty = draft.body.trim() === "";
  const said = problems.filter(
    (problem) =>
      tried ||
      !(
        (problem.field === "name" && nameEmpty && !nameLeft) ||
        (problem.field === "body" && bodyEmpty)
      ),
  );
  const blocked = firstProblem(said);
  const lint = bodyEmpty ? [] : bodyProblems(problems);
  const named = nameProblems(said);
  const held = blocked !== undefined || save.isPending;
  const failure = save.error?.message;

  // An example fills an empty text; replacing a typed one is the full editor's. Every kind has
  // built-in ones (lib/prompt-examples.ts), then your saved prompts of it.
  const examples = exampleGroups(
    kind,
    (prompts.data?.prompts ?? [])
      .filter((prompt) => prompt.kind === kind)
      .map((prompt) => ({ key: prompt.id, name: prompt.name, body: prompt.body })),
  );

  const attempt = (): void => {
    if (problems.length > 0) {
      setTried(true);
      if (nameProblems(problems).length > 0) nameBox.current?.focus();
      return;
    }
    save.mutate(draft);
  };

  return (
    <Drawer
      open={open}
      title={`New ${kindNoun(kind)} prompt`}
      onClose={onClose}
      footer={
        <>
          <StatusSlot tone={failure === undefined ? "info" : "error"} id={statusId} wrap>
            {failure ?? blocked}
          </StatusSlot>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            aria-disabled={held}
            aria-describedby={blocked === undefined ? undefined : statusId}
            onClick={() => {
              if (!held) attempt();
            }}
          >
            Save
          </Button>
        </>
      }
    >
      <div className="flex min-w-0 flex-col gap-4">
        <Field
          label="Name"
          help="Saved on Prompts under this name, and picked here."
          {...(named.length === 0
            ? {}
            : { error: named.map((problem) => problem.message).join(" ") })}
        >
          <Input
            ref={nameBox}
            value={draft.name}
            maxLength={nameMax}
            placeholder={kindNameExample(kind)}
            onChange={(event) => edit({ ...draft, name: event.target.value }, "name")}
            onBlur={() => {
              if (nameEmpty) setNameLeft(true);
            }}
          />
        </Field>
        <div className="flex min-w-0 flex-col gap-1" {...helpScope}>
          <div className="flex min-h-8 flex-wrap items-end justify-between gap-3">
            <label htmlFor={bodyId} className="sl-field__label">
              Instructions
            </label>
            {bodyEmpty ? (
              <StartFromExample groups={examples} onPick={(example) => editBody(example.body)} />
            ) : null}
          </div>
          <HelpLine className="mb-1">{kindAbout(kind)}</HelpLine>
          <KeywordInsertBar place={kind} targetId={bodyId} value={draft.body} onChange={editBody} />
          <SlotBody
            id={bodyId}
            value={draft.body}
            place={kind}
            placeholder={kindPlaceholder(kind)}
            invalid={lint.length > 0}
            describedBy={lint.length === 0 ? undefined : lintId}
            onChange={editBody}
          />
        </div>
        <div className="flex min-w-0 flex-col gap-2">
          <DetectedSlots
            slots={slotNames(draft.body)}
            body={draft.body}
            lint={lint}
            lintId={lintId}
            warnings={bodyEmpty ? [] : draftWarnings(draft)}
            place={kind}
            bodyId={bodyId}
            onChange={editBody}
          />
        </div>
      </div>
    </Drawer>
  );
}
