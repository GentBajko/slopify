import { templateChannelId } from "../channels/repo.js";
import type { LibrarySnapshot } from "../library/snapshot.js";
import { snapshotEntry, snapshotPrompt } from "../library/snapshot.js";
import type { PlayDraftDocument } from "../play-drafts/model.js";
import type { TemplateDeps, TemplateResult } from "./model.js";
import { templateDocument } from "./one-off.js";

export function templateSetup(
  deps: TemplateDeps,
  input: PlayDraftDocument,
): TemplateResult<PlayDraftDocument> {
  const prompts: LibrarySnapshot["prompts"][number][] = [];
  const entries: LibrarySnapshot["entries"][number][] = [];
  const choices = [
    { kind: "article" as const, name: input.form.articlePrompt },
    { kind: "narration" as const, name: input.form.narrationPrompt ?? "" },
    { kind: "description" as const, name: input.form.descriptionPrompt ?? "" },
    ...input.form.imagePrompts.map((row) => ({ kind: "image" as const, name: row.name })),
    { kind: "thumbnail" as const, name: input.form.thumbnailPrompt },
    { kind: "shorts" as const, name: input.form.shorts?.prompt ?? "" },
    { kind: "image" as const, name: input.form.shorts?.imagePrompt ?? "" },
    ...Object.values(input.form.reviews?.stages ?? {}).map((stage) => ({
      kind: "review" as const,
      name: stage.mode === "off" ? "" : stage.prompt,
    })),
    {
      kind: "image" as const,
      name: input.form.reference?.source === "prompt" ? input.form.reference.prompt : "",
    },
  ];
  for (const choice of choices) {
    if (choice.name === "") continue;
    const row = snapshotPrompt(deps.db, input.librarySnapshot, choice.kind, choice.name);
    if (!row) return { ok: false, reason: "missing-prompt" };
    if (!prompts.some((saved) => saved.kind === row.kind && saved.name === row.name))
      prompts.push(row);
  }
  for (const category of ["intro", "outro"] as const) {
    if (input.form[category] === "") continue;
    const row = snapshotEntry(deps.db, input.librarySnapshot, category, input.form[category]);
    if (!row) return { ok: false, reason: "missing-prompt" };
    entries.push(row);
  }
  // Only the settings are kept: the topic typed for one video is left empty (`one-off.ts`).
  const { templateSource: _source, channelId: _channel, ...document } = templateDocument(input);
  return {
    ok: true,
    value: { ...document, fontUpload: null, librarySnapshot: { prompts, entries } },
  };
}

export function freshTemplateDraft(
  deps: TemplateDeps,
  document: PlayDraftDocument,
  source: { readonly id: string; readonly version: number },
): PlayDraftDocument {
  const provided = document.form.provided;
  const fresh = (file: { readonly attachmentId: string; readonly name: string }) => ({
    attachmentId: deps.uuid(),
    name: file.name,
  });
  return {
    ...document,
    section: "content",
    fontUpload: null,
    templateSource: source,
    channelId: templateChannelId(deps.db, source.id),
    variants: document.variants.map((variant) => ({ ...variant, id: deps.uuid() })),
    form: {
      ...document.form,
      provided: {
        ...provided,
        audio: provided.audio === null ? null : fresh(provided.audio),
        thumbnail: provided.thumbnail === null ? null : fresh(provided.thumbnail),
        images: provided.images.map(fresh),
        ...(provided.reference === undefined
          ? {}
          : { reference: provided.reference === null ? null : fresh(provided.reference) }),
        // Like the images: the name is kept and the file is attached again on Play.
        ...(provided.shortsMusic === undefined
          ? {}
          : { shortsMusic: provided.shortsMusic === null ? null : fresh(provided.shortsMusic) }),
      },
    },
  };
}
