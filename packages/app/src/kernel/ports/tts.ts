export interface TtsCapabilities {
  readonly streams: boolean;
}

export interface TtsRequest {
  readonly voiceId: string;
  readonly text: string;
  readonly signal: AbortSignal;
}

// mp3 is the one container the renderer's plan assumes (`logic/08`, `logic/11`); an
// adapter whose provider speaks anything else converts before it answers.
export interface TtsAudio {
  readonly audio: ReadableStream<Uint8Array>;
  readonly container: "mp3";
}

export interface TtsPort {
  readonly id: string;
  readonly capabilities: TtsCapabilities;
  readonly synthesize: (req: TtsRequest) => Promise<TtsAudio>;
}
