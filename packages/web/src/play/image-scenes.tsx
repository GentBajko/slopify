import type { Prompt } from "@app/slices/library/model.js";
import type { PlayDraftDocument } from "@app/slices/play-drafts/model.js";
import type { ReactElement } from "react";
import { Switch } from "@/components/kit/switch";
import { SceneKeywordRows, sceneKeywordUses } from "@/components/scene-keyword-rows";

// Images → Scenes from the article, on Play: the project's AI model reads the article once and
// writes each image its own scene, so the images show different moments instead of the same
// text drawn again (`images/scenes.ts`). Off, a picked picture prompt using a scene keyword
// Slopify fills still gets its scene, and says so under the switch.
export function ImageScenesControl({
  document,
  prompts,
  onEdit,
}: {
  readonly document: PlayDraftDocument;
  readonly prompts: readonly Prompt[];
  readonly onEdit: (next: PlayDraftDocument) => void;
}): ReactElement {
  const { form } = document;
  const bodyOf = (kind: Prompt["kind"], name: string) =>
    prompts.find((prompt) => prompt.kind === kind && prompt.name === name)?.body;
  const thumbnail =
    form.sources.thumbnail === "from_prompt" || form.sources.thumbnail === "prompt_by_llm";
  const uses =
    form.imageScenes === true
      ? []
      : sceneKeywordUses([
          ...(form.sources.images === "generate"
            ? form.imagePrompts.map((picked) => ({
                label: `"${picked.name}"`,
                body: bodyOf("image", picked.name),
              }))
            : []),
          ...(thumbnail
            ? [{ label: "the thumbnail", body: bodyOf("thumbnail", form.thumbnailPrompt) }]
            : []),
        ]);
  return (
    <div className="flex basis-full flex-col items-start gap-2">
      <Switch
        checked={form.imageScenes === true}
        label="Scenes from the article"
        tip="play.image-scenes"
        onChange={(on) => {
          const { imageScenes: _dropped, ...rest } = form;
          onEdit({ ...document, form: { ...rest, ...(on ? { imageScenes: true } : {}) } });
        }}
      />
      <SceneKeywordRows uses={uses} />
    </div>
  );
}
