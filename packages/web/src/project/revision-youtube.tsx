import type { Prompt } from "@app/slices/library/model.js";
import type { RevisionEdit, RevisionView } from "@app/slices/revisions/model.js";
import type { ReactElement } from "react";
import { Button } from "@/components/ui/button";
import { YoutubeDescription } from "@/play/youtube-description";
import { editOfForm, setPrompt } from "./revision-form-state";

// Edit project → Prompts: the Video stage's YouTube description switch and its prompt, beside
// the article's. A library prompt is frozen into the project like the others; Built-in drops
// the frozen copy, so the step uses the wording that ships with Slopify.
export function RevisionYoutube({
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
  const savedName = view.revision.config.descriptionPrompt;
  const savedBody =
    view.revision.content.promptTemplates.description ?? view.revision.config.rendered.description;
  const choices: readonly Prompt[] =
    savedName &&
    savedBody !== undefined &&
    !prompts.some((prompt) => prompt.kind === "description" && prompt.name === savedName)
      ? [
          ...prompts,
          {
            id: "saved-description",
            kind: "description",
            name: savedName,
            body: savedBody,
            slots: [],
            updatedAt: view.revision.createdAt,
          },
        ]
      : prompts;
  const written = view.outputs.some(
    (row) => row.selected && row.workKey === descriptionKey && row.state === "ready",
  );
  const again = edit.regenerate?.includes(descriptionKey) === true;
  return (
    <div className="space-y-2">
      <YoutubeDescription
        enabled={edit.config.youtubeDescription === true}
        prompt={edit.config.descriptionPrompt ?? ""}
        prompts={choices}
        narrated={edit.config.sources.audio !== "off"}
        problem={problem}
        onChange={({ youtubeDescription, descriptionPrompt }) => {
          const picked = choices.find(
            (prompt) => prompt.kind === "description" && prompt.name === descriptionPrompt,
          );
          const next =
            descriptionPrompt === (edit.config.descriptionPrompt ?? "")
              ? edit
              : picked === undefined
                ? withoutPrompt(edit)
                : setPrompt(edit, "description", picked.body);
          const { descriptionPrompt: _previous, ...config } = next.config;
          onChange({
            ...next,
            config: {
              ...config,
              youtubeDescription,
              ...(descriptionPrompt === "" ? {} : { descriptionPrompt }),
            },
          });
        }}
      />
      {written && edit.config.youtubeDescription === true ? (
        again ? (
          <p className="flex flex-wrap items-center gap-2 text-small text-done">
            The YouTube description will be written again when you save and Resume.
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                onChange({
                  ...edit,
                  regenerate: (edit.regenerate ?? []).filter((one) => one !== descriptionKey),
                });
              }}
            >
              Keep the current description
            </Button>
          </p>
        ) : (
          <Button
            type="button"
            onClick={() => {
              onChange({
                ...edit,
                regenerate: [...new Set([...(edit.regenerate ?? []), descriptionKey])],
              });
            }}
          >
            Write the description again after review
          </Button>
        )
      ) : null}
    </div>
  );
}

const descriptionKey = "youtube:description";

function withoutPrompt(edit: RevisionEdit): RevisionEdit {
  const { description: _template, ...promptTemplates } = edit.content.promptTemplates;
  const { description: _rendered, ...rendered } = edit.config.rendered;
  return editOfForm({
    config: { ...edit.config, rendered },
    content: { ...edit.content, promptTemplates },
  });
}
