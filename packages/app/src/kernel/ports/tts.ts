import type { ModelInfo } from "./model.js";

export interface TtsCapabilities {
  readonly streams: boolean;
  // Takes several voices in one request (`TtsRequest.dialogue`).
  readonly dialogue?: boolean | undefined;
}

// One line of a multi-speaker request: the words and the voice that speaks them.
export interface DialogueLine {
  readonly voiceId: string;
  readonly text: string;
}

export interface TtsRequest {
  readonly model?: string | undefined;
  readonly voiceId: string;
  readonly text: string;
  // Present only for a provider whose capabilities say `dialogue`: every line in its own
  // voice, spoken as one conversation. `voiceId` and `text` then describe the whole request.
  readonly dialogue?: readonly DialogueLine[] | undefined;
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
