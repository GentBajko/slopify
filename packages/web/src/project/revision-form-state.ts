import type { StageKind } from "@app/kernel/pipeline.js";
import type { StageSource } from "@app/slices/admission/model.js";
import { render } from "@app/slices/admission/substitute.js";
import type { RevisionEdit, RevisionView } from "@app/slices/revisions/model.js";
import { subtitlesFor } from "@/subtitles/config";
export function formOfRevision(view: RevisionView): RevisionEdit {
  return {
    config: structuredClone(view.revision.config),
    content: structuredClone(view.revision.content),
  };
}
export function editOfForm(edit: RevisionEdit): RevisionEdit {
  const imageDefinitions = Object.fromEntries(
    Object.entries(edit.content.imageDefinitions).map(([key, image]) => {
      const raw =
        image.templateKey === null || image.templateKey === undefined
          ? null
          : (edit.content.promptTemplates[image.templateKey] ?? null);
      return [
        key,
        raw === null || image.source !== "generate"
          ? image
          : { ...image, prompt: render(raw, edit.config.values) },
      ];
    }),
  );
  return {
    ...edit,
    content: { ...edit.content, imageDefinitions },
    config: {
      ...edit.config,
      rendered: {
        ...edit.config.rendered,
        ...Object.fromEntries(
          Object.entries(edit.content.promptTemplates).map(([key, raw]) => [
            key,
            raw === null ? (edit.config.rendered[key] ?? "") : render(raw, edit.config.values),
          ]),
        ),
      },
    },
  };
}
export function changeSource(
  edit: RevisionEdit,
  kind: StageKind,
  source: StageSource,
): RevisionEdit {
  const sources = {
    ...edit.config.sources,
    [kind]: source,
    ...(kind === "images" && source === "off" ? { video: "off" as const } : {}),
  };
  return {
    ...edit,
    config: {
      ...edit.config,
      sources,
      subtitles: subtitlesFor(edit.config.subtitles, sources),
    },
  };
}
export function setPrompt(edit: RevisionEdit, key: string, raw: string): RevisionEdit {
  return editOfForm({
    ...edit,
    content: { ...edit.content, promptTemplates: { ...edit.content.promptTemplates, [key]: raw } },
  });
}
