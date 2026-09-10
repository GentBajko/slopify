import type { ModelInfo } from "./model.js";

export interface TtsCapabilities {
  readonly streams: boolean;
}

export interface TtsRequest {
  readonly model?: string | undefined;
  readonly voiceId: string;
  readonly text: string;
  readonly signal: AbortSignal;
  // Successful status replies from a queued synthesis job also count as activity.
  readonly onActivity?: (() => void) | undefined;
  // Opaque provider continuation, scoped to this narration call and retained across
  // automatic attempts. A failed poll/download must not submit another paid job.
  readonly continuation?:
    | {
        readonly read: () => string | undefined;
        readonly write: (token: string) => void;
      }
    | undefined;
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
