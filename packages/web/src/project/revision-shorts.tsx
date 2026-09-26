import type { Prompt, PromptKind } from "@app/slices/library/model.js";
import type { RevisionEdit, RevisionView } from "@app/slices/revisions/model.js";
import { defaultShorts, type ShortsSettings } from "@app/slices/shorts/model.js";
import { type ReactElement, useState } from "react";
import { Button } from "@/components/ui/button";
import { Shorts } from "@/play/shorts";
import type { ShortsForm } from "@/play/state";
import { editOfForm, setPrompt } from "./revision-form-state";

// Edit project → Prompts: the Video stage's Shorts settings, below the YouTube description.
// A Library prompt is frozen into the project like the others; Built-in drops the frozen
// copy, so the step uses the wording that ships with Slopify.
export function RevisionShorts({
  edit,
  view,
  prompts,
  problem,
  onChange,
}: {
  readonly edit: RevisionEdit;
  readonly view: RevisionView;
  readonly prompts: readonly Prompt[];
  readonly problem: (field: string) => string | undefined;
  readonly onChange: (edit: RevisionEdit) => void;
}): ReactElement {
  const settings: ShortsSettings = edit.config.shorts ?? defaultShorts;
  // What was typed in the three numbers, so a half-typed one is not rewritten under the caret.
  const [typed, setTyped] = useState<Pick<ShortsForm, "count" | "minSeconds" | "maxSeconds">>({
    count: String(settings.count),
    minSeconds: String(settings.minSeconds),
    maxSeconds: String(settings.maxSeconds),
  });
  const choices = [
    ...prompts,
    ...saved(view, "shorts", "shorts", view.revision.config.shorts?.prompt, prompts),
    ...saved(view, "image", "shortsImage", view.revision.config.shorts?.imagePrompt, prompts),
  ];
  const value: ShortsForm = {
    enabled: settings.enabled,
    ...typed,
    prompt: settings.prompt ?? "",
    imagePrompt: settings.imagePrompt ?? "",
  };
  const made = view.outputs.some(
    (row) => row.selected && row.workKey === pickKey && row.state === "ready",
  );
  const again = edit.regenerate?.includes(pickKey) === true;
  return (
    <div className="space-y-2">
      <Shorts
        value={value}
        prompts={choices}
        narrated={edit.config.sources.audio !== "off"}
        problem={problem}
        onChange={(next) => {
          setTyped({ count: next.count, minSeconds: next.minSeconds, maxSeconds: next.maxSeconds });
          let changed = edit;
          for (const [key, kind, before, after] of [
            ["shorts", "shorts", value.prompt, next.prompt],
            ["shortsImage", "image", value.imagePrompt, next.imagePrompt],
          ] as const) {
            if (before === after) continue;
            const picked = choices.find((prompt) => prompt.kind === kind && prompt.name === after);
            changed =
              picked === undefined
                ? withoutPrompt(changed, key)
                : setPrompt(changed, key, picked.body);
          }
          const whole = (raw: string): number => {
            const number = Number(raw);
            return raw.trim() === "" || !Number.isFinite(number) ? 0 : number;
          };
          onChange({
            ...changed,
            config: {
              ...changed.config,
              shorts: {
                enabled: next.enabled,
                count: whole(next.count),
                minSeconds: whole(next.minSeconds),
                maxSeconds: whole(next.maxSeconds),
                ...(next.prompt === "" ? {} : { prompt: next.prompt }),
                ...(next.imagePrompt === "" ? {} : { imagePrompt: next.imagePrompt }),
              },
            },
          });
        }}
      />
      {made && settings.enabled ? (
        again ? (
          <p className="flex flex-wrap items-center gap-2 text-small text-done">
            The shorts will be picked, illustrated and rendered again when you save and Resume.
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                onChange({
                  ...edit,
                  regenerate: (edit.regenerate ?? []).filter((one) => one !== pickKey),
                });
              }}
            >
              Keep the current shorts
            </Button>
          </p>
        ) : (
          <Button
            type="button"
            onClick={() => {
              onChange({
                ...edit,
                regenerate: [...new Set([...(edit.regenerate ?? []), pickKey])],
              });
            }}
          >
            Make the shorts again after review
          </Button>
        )
      ) : null}
    </div>
  );
}

// The pick: every later step of the shorts carries its regeneration token, so asking for it
// again makes the whole chain again (`slices/rebuild/recipe-shorts.ts`).
const pickKey = "shorts:pick";

// The prompt the project saved, offered even when the Library no longer holds it.
function saved(
  view: RevisionView,
  kind: PromptKind,
  key: string,
  name: string | undefined,
  prompts: readonly Prompt[],
): readonly Prompt[] {
  const body = view.revision.content.promptTemplates[key] ?? view.revision.config.rendered[key];
  if (!name || body === undefined || body === null) return [];
  if (prompts.some((prompt) => prompt.kind === kind && prompt.name === name)) return [];
  return [{ id: `saved-${key}`, kind, name, body, slots: [], updatedAt: view.revision.createdAt }];
}

function withoutPrompt(edit: RevisionEdit, key: string): RevisionEdit {
  const { [key]: _template, ...promptTemplates } = edit.content.promptTemplates;
  const { [key]: _rendered, ...rendered } = edit.config.rendered;
  return editOfForm({
    ...edit,
    config: { ...edit.config, rendered },
    content: { ...edit.content, promptTemplates },
  });
}
