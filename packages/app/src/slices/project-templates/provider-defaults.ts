import type { PlayDraftDocument } from "../play-drafts/schema.js";

// The writer and image service this computer picks for a setup nobody chose them in: what the
// first launch found (`settings/first-run.ts`, readProviderDefaults). Browser-safe.
export interface ProviderChoices {
  readonly llm?: { readonly provider: string; readonly model: string } | undefined;
  readonly images?: { readonly provider: string; readonly model: string } | undefined;
}

// A template nobody picked a writer or an image service in runs on this computer's defaults,
// by the same rule Create applies to a new draft (web `play/draft-state.ts`
// withProviderDefaults): only when both are empty, so a half-chosen setup is never changed
// behind the person's back. Every place a template runs or is checked reads it through here (a
// draft made from it, a schedule's run, a sample, Edit template's checks), so none of them
// can disagree about whether it can start.
export function withProviderDefaults(
  document: PlayDraftDocument,
  defaults: ProviderChoices,
): PlayDraftDocument {
  const { form } = document;
  if (form.llm.provider !== "" || form.images.provider !== "") return document;
  if (defaults.llm === undefined && defaults.images === undefined) return document;
  return {
    ...document,
    form: {
      ...form,
      ...(defaults.llm === undefined ? {} : { llm: { ...defaults.llm } }),
      ...(defaults.images === undefined ? {} : { images: { ...defaults.images } }),
    },
  };
}
