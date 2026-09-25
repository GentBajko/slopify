import type { Prompt } from "@app/slices/library/model.js";
import type { RevisionEdit, RevisionView } from "@app/slices/revisions/model.js";
import type { ReactElement } from "react";
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
  return (
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
  );
}

function withoutPrompt(edit: RevisionEdit): RevisionEdit {
  const { description: _template, ...promptTemplates } = edit.content.promptTemplates;
  const { description: _rendered, ...rendered } = edit.config.rendered;
  return editOfForm({
    config: { ...edit.config, rendered },
    content: { ...edit.content, promptTemplates },
  });
}
