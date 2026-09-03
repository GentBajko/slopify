import type { ImagePort } from "./image.js";
import type { LlmPort } from "./llm.js";
import type { ProviderFamily, Readiness } from "./model.js";
import type { TtsPort } from "./tts.js";

export interface ProviderListing {
  readonly family: ProviderFamily;
  readonly id: string;
  readonly name: string;
  readonly readiness: Readiness;
}

// Built in `main.ts` from the settings slice and handed to the stage wiring; no slice
// ever holds one, so no slice can reach an adapter around the attempt wrapper. A lookup
// for an id the catalogue does not carry is a bug in admission, not a user error, so it
// throws rather than answering undefined.
export interface Registry {
  readonly llm: (id: string) => LlmPort;
  readonly tts: (id: string) => TtsPort;
  readonly image: (id: string) => ImagePort;
  // Async because a CLI provider's readiness is a spawn (`logic/02` §Q135).
  readonly list: () => Promise<readonly ProviderListing[]>;
}
