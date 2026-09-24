import type { Prompt } from "@app/slices/library/model.js";
import type { RevisionEdit, RevisionView } from "@app/slices/revisions/model.js";
import { type ReactElement, useRef } from "react";
import { NarrationPreparation } from "@/play/narration-preparation";
import { setPrompt } from "./revision-form-state";

export function RevisionNarration({
  edit,
  view,
  prompts,
  error,
  onChange,
}: {
  readonly edit: RevisionEdit;
  readonly view: RevisionView;
  readonly prompts: readonly Prompt[];
  readonly error?: string | undefined;
  readonly onChange: (edit: RevisionEdit) => void;
}): ReactElement | null {
  const disabledName = useRef(edit.config.narrationPrompt);
  if (edit.config.sources.audio !== "generate") return null;
  const savedName = view.revision.config.narrationPrompt;
  const savedBody =
    view.revision.content.promptTemplates.narration ?? view.revision.config.rendered.narration;
  const choices: readonly Prompt[] =
    savedName &&
    savedBody !== undefined &&
    !prompts.some((prompt) => prompt.kind === "narration" && prompt.name === savedName)
      ? [
          ...prompts,
          {
            id: "saved-narration",
            kind: "narration",
            name: savedName,
            body: savedBody,
            slots: [],
            updatedAt: view.revision.createdAt,
          },
        ]
      : prompts;
  return (
    <NarrationPreparation
      value={edit.config.narrationPrompt ?? ""}
      prompts={choices}
      libraryLinks={false}
      supported={
        edit.config.audio?.provider === "inworld" && edit.config.audio.model === "inworld-tts-2"
      }
      error={error}
      onChange={(value) => {
        const currentName = edit.config.narrationPrompt || disabledName.current;
        if (value === "") disabledName.current = edit.config.narrationPrompt;
        const picked = choices.find(
          (prompt) => prompt.kind === "narration" && prompt.name === value,
        );
        const next =
          picked === undefined || value === currentName
            ? edit
            : setPrompt(edit, "narration", picked.body);
        onChange({ ...next, config: { ...next.config, narrationPrompt: value } });
      }}
    />
  );
}
