import type { RevisionEdit, RevisionView } from "@app/slices/revisions/model.js";
import { useId, useRef, useState } from "react";
import { useApp } from "@/app-context";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { revisionFileUrl } from "./revision-api.js";
import { setPrompt } from "./revision-form-state.js";
import { RevisionUpload } from "./revision-upload.js";
export function moveImage(
  ids: readonly string[],
  index: number,
  direction: -1 | 1,
): readonly string[] {
  const next = index + direction;
  const selected = ids[index];
  const adjacent = ids[next];
  if (selected === undefined || adjacent === undefined) return ids;
  const result = [...ids];
  result[index] = adjacent;
  result[next] = selected;
  return result;
}
export function ImageEditor({
  edit,
  onChange,
  onPending,
  view,
  getEdit,
}: {
  readonly getEdit?: () => RevisionEdit;
  readonly view?: RevisionView;
  readonly edit: RevisionEdit;
  readonly onChange: (edit: RevisionEdit) => void;
  readonly onPending: (key: string, pending: boolean) => void;
}): import("react").ReactElement {
  const editorId = useId();
  const [promptEdits, setPromptEdits] = useState<Readonly<Record<string, number>>>({});
  const { content } = edit;
  const { api } = useApp();
  const latest = useRef(edit);
  latest.current = edit;
  function emit(next: RevisionEdit): void {
    const definitions = next.content.imageOrder.flatMap((key) => {
      const definition = next.content.imageDefinitions[key];
      return definition === undefined ? [] : [definition];
    });
    const images =
      next.content.imageOrder.length === 0 || next.config.sources.images === "off"
        ? "off"
        : definitions.some((definition) => definition.source === "generate")
          ? "generate"
          : "provide";
    const normalized: RevisionEdit = {
      ...next,
      config: {
        ...next.config,
        sources: {
          ...next.config.sources,
          images,
          ...(images === "off" ? { video: "off" as const } : {}),
        },
      },
    };
    latest.current = normalized;
    onChange(normalized);
  }
  function changePrompt(key: string, raw: string): void {
    const current = getEdit?.() ?? latest.current;
    const image = current.content.imageDefinitions[key];
    if (image === undefined) return;
    const templateKey = image.templateKey ?? `image:${key}`;
    setPromptEdits((versions) => ({ ...versions, [key]: (versions[key] ?? 0) + 1 }));
    emit(
      setPrompt(
        {
          ...current,
          ...(current.uploads === undefined
            ? {}
            : {
                uploads: current.uploads.filter(
                  (one) => one.destination.kind !== "image" || one.destination.imageKey !== key,
                ),
              }),
          content: {
            ...current.content,
            imageDefinitions: {
              ...current.content.imageDefinitions,
              [key]: { ...image, templateKey },
            },
          },
        },
        templateKey,
        raw,
      ),
    );
  }
  return (
    <section aria-label="Edit images" className="space-y-3">
      <h3>Images</h3>
      {content.imageOrder.map((key, index) => {
        const image = content.imageDefinitions[key];
        if (image === undefined)
          return (
            <p role="alert" key={key}>
              Image definition missing: {key}
            </p>
          );
        const retained = view?.outputs.find(
          (row) => row.available && row.assetId === image.assetId,
        );
        return (
          <fieldset key={key} className="space-y-2 rounded-control border border-line2 p-3">
            <legend>Image {index + 1}</legend>
            {retained === undefined || view === undefined ? null : (
              <img
                className="max-h-32 rounded-control object-contain"
                alt={`Retained scene ${index + 1}`}
                src={revisionFileUrl(
                  api,
                  view.revision.projectId,
                  view.revision.id,
                  retained.recordId,
                )}
              />
            )}
            <p>{image.assetId === null ? "No completed image yet" : "Current image retained"}</p>
            {image.source !== "generate" ? null : (
              <label htmlFor={`${editorId}-${key}-prompt`}>
                Prompt for image {index + 1}
                <Textarea
                  id={`${editorId}-${key}-prompt`}
                  value={
                    image.templateKey === undefined || image.templateKey === null
                      ? (image.prompt ?? "")
                      : (content.promptTemplates[image.templateKey] ?? image.prompt ?? "")
                  }
                  onChange={(event) => changePrompt(key, event.target.value)}
                />
              </label>
            )}
            {image.source === "generate" && image.templateKey == null ? (
              <Button type="button" onClick={() => changePrompt(key, image.prompt ?? "")}>
                Use saved wording as template for image {index + 1}
              </Button>
            ) : null}
            <RevisionUpload
              key={`${key}:${promptEdits[key] ?? 0}:${edit.config.sources.images === "off"}`}
              label={`Replace image ${index + 1}`}
              kind="images"
              onPending={(pending) => onPending(`image:${key}`, pending)}
              onReady={(file) => {
                const edit = getEdit?.() ?? latest.current;
                const content = edit.content;
                const current = content.imageDefinitions[key];
                if (current === undefined || !content.imageOrder.includes(key)) return;
                emit({
                  ...edit,
                  regenerate: (edit.regenerate ?? []).filter((one) => one !== `image:${key}`),
                  uploads: [
                    ...(edit.uploads ?? []).filter(
                      (one) => one.destination.kind !== "image" || one.destination.imageKey !== key,
                    ),
                    { stagedFileId: file.id, destination: { kind: "image", imageKey: key } },
                  ],
                  content: {
                    ...content,
                    imageDefinitions: {
                      ...content.imageDefinitions,
                      [key]: { ...current, source: "provide", prompt: null, templateKey: null },
                    },
                  },
                });
              }}
            />
            <Button
              type="button"
              disabled={index === 0}
              onClick={() =>
                emit({
                  ...edit,
                  content: {
                    ...content,
                    imageOrder: moveImage(content.imageOrder, index, -1),
                  },
                })
              }
            >
              Move image {index + 1} earlier
            </Button>
            <Button
              type="button"
              disabled={index === content.imageOrder.length - 1}
              onClick={() =>
                emit({
                  ...edit,
                  content: {
                    ...content,
                    imageOrder: moveImage(content.imageOrder, index, 1),
                  },
                })
              }
            >
              Move image {index + 1} later
            </Button>
            <Button
              type="button"
              onClick={() => {
                const order = content.imageOrder.filter((one) => one !== key);
                emit({
                  ...edit,
                  config:
                    order.length === 0
                      ? {
                          ...edit.config,
                          sources: { ...edit.config.sources, images: "off", video: "off" },
                        }
                      : edit.config,
                  content: {
                    ...content,
                    imageOrder: order,
                    imageDefinitions: Object.fromEntries(
                      Object.entries(content.imageDefinitions).filter(([one]) => one !== key),
                    ),
                  },
                  regenerate: (edit.regenerate ?? []).filter((one) => one !== `image:${key}`),
                  uploads: (edit.uploads ?? []).filter(
                    (one) => one.destination.kind !== "image" || one.destination.imageKey !== key,
                  ),
                });
              }}
            >
              Delete image {index + 1}
              {content.imageOrder.length === 1 ? " and turn Images and Video Off" : ""}
            </Button>
            {image.source === "generate" ? (
              <Button
                type="button"
                onClick={() =>
                  emit({
                    ...edit,
                    regenerate: [...new Set([...(edit.regenerate ?? []), `image:${key}`])],
                  })
                }
              >
                Regenerate image {index + 1} after review
              </Button>
            ) : null}
          </fieldset>
        );
      })}
      <Button
        type="button"
        disabled={content.imageOrder.length >= 60}
        onClick={() => {
          if (content.imageOrder.length >= 60) return;
          const key = crypto.randomUUID();
          emit({
            ...edit,
            config: { ...edit.config, sources: { ...edit.config.sources, images: "generate" } },
            content: {
              ...content,
              imageOrder: [...content.imageOrder, key],
              promptTemplates: { ...content.promptTemplates, [`image:${key}`]: "" },
              imageDefinitions: {
                ...content.imageDefinitions,
                [key]: {
                  source: "generate",
                  assetId: null,
                  prompt: "",
                  templateKey: `image:${key}`,
                },
              },
            },
          });
        }}
      >
        Add generated image
      </Button>
      {content.imageOrder.length >= 60 ? (
        <p>At most 60 images can be included.</p>
      ) : (
        <RevisionUpload
          key={`new-image:${edit.config.sources.images === "off"}`}
          label="Add provided image"
          kind="images"
          onPending={(pending) => onPending("image:new", pending)}
          onReady={(file) => {
            const edit = getEdit?.() ?? latest.current;
            const content = edit.content;
            const key = crypto.randomUUID();
            emit({
              ...edit,
              config: {
                ...edit.config,
                sources: {
                  ...edit.config.sources,
                  images:
                    edit.config.sources.images === "off" ? "provide" : edit.config.sources.images,
                },
              },
              content: {
                ...content,
                imageOrder: [...content.imageOrder, key],
                imageDefinitions: {
                  ...content.imageDefinitions,
                  [key]: { source: "provide", assetId: null, prompt: null },
                },
              },
              uploads: [
                ...(edit.uploads ?? []),
                { stagedFileId: file.id, destination: { kind: "image", imageKey: key } },
              ],
            });
          }}
        />
      )}
    </section>
  );
}
