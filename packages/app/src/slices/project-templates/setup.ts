import type { LibrarySnapshot } from "../library/snapshot.js";
import { snapshotEntry, snapshotPrompt } from "../library/snapshot.js";
import type { PlayDraftDocument } from "../play-drafts/model.js";
import type { TemplateDeps, TemplateResult } from "./model.js";

export function templateSetup(
  deps: TemplateDeps,
  input: PlayDraftDocument,
): TemplateResult<PlayDraftDocument> {
  const prompts: LibrarySnapshot["prompts"][number][] = [];
  const entries: LibrarySnapshot["entries"][number][] = [];
  const choices = [
    { kind: "article" as const, name: input.form.articlePrompt },
    { kind: "narration" as const, name: input.form.narrationPrompt ?? "" },
    ...input.form.imagePrompts.map((row) => ({ kind: "image" as const, name: row.name })),
    { kind: "thumbnail" as const, name: input.form.thumbnailPrompt },
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
  const { templateSource: _source, ...document } = input;
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
    variants: document.variants.map((variant) => ({ ...variant, id: deps.uuid() })),
    form: {
      ...document.form,
      provided: {
        ...provided,
        audio: provided.audio === null ? null : fresh(provided.audio),
        thumbnail: provided.thumbnail === null ? null : fresh(provided.thumbnail),
        images: provided.images.map(fresh),
      },
    },
  };
}
