import type { PlayDraftDocument } from "@app/slices/play-drafts/model.js";
import type { ReactElement } from "react";
import { Switch } from "@/components/kit/switch";

// Images → Scenes from the article, on Play: the project's AI model reads the article once and
// writes each image its own scene, so the images show different moments instead of the same
// text drawn again (`images/scenes.ts`).
export function ImageScenesControl({
  document,
  onEdit,
}: {
  readonly document: PlayDraftDocument;
  readonly onEdit: (next: PlayDraftDocument) => void;
}): ReactElement {
  const { form } = document;
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
    </div>
  );
}
