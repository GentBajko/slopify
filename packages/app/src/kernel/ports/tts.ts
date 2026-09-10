import type { ModelInfo } from "./model.js";

export interface TtsCapabilities {
  readonly streams: boolean;
}

export interface TtsRequest {
  readonly model?: string | undefined;
  readonly voiceId: string;
  readonly text: string;
  readonly signal: AbortSignal;
}

// mp3 is the one container the renderer's plan assumes; an
// adapter whose provider speaks anything else converts before it answers.
export interface TtsAudio {
  readonly audio: ReadableStream<Uint8Array>;
  readonly container: "mp3";
}

export interface TtsPort {
  readonly id: string;
  readonly capabilities: TtsCapabilities;
  readonly models: () => Promise<readonly ModelInfo[]>;
  readonly synthesize: (req: TtsRequest) => Promise<TtsAudio>;
}
