import type { PlayDraftDocument } from "../play-drafts/schema.js";

// The writer and image service this computer picks for a setup nobody chose them in: what the
// first launch found (`settings/first-run.ts`, readProviderDefaults). Browser-safe.
export interface ProviderChoices {
  readonly llm?: { readonly provider: string; readonly model: string } | undefined;
  readonly images?: { readonly provider: string; readonly model: string } | undefined;
}

// A template nobody picked a writer or an image service in runs on this computer's defaults,
// kind by kind, by the same rule Create applies to a draft (web `play/draft-state.ts`
// withProviderDefaults): a writer nobody picked takes the default writer even where the images
// were picked, and the other way round; a choice someone made is never changed. Every place a
// template runs or is checked reads it through here (a draft made from it, a schedule's run, a
// sample, Edit template's checks and editors), so none of them can disagree about whether it
// can start.
export function withProviderDefaults(
  document: PlayDraftDocument,
  defaults: ProviderChoices,
): PlayDraftDocument {
  const { form } = document;
  const llm = form.llm.provider === "" ? defaults.llm : undefined;
  const images = form.images.provider === "" ? defaults.images : undefined;
  if (llm === undefined && images === undefined) return document;
  return {
    ...document,
    form: {
      ...form,
      ...(llm === undefined ? {} : { llm: { ...llm } }),
      ...(images === undefined ? {} : { images: { ...images } }),
    },
  };
}
