// The slice of the WebExtension API the extension uses, typed here rather than through
// @types/chrome. Chrome and Firefox both expose it as `chrome` with promise-returning calls
// (Manifest V3).

export interface ExtensionApi {
  readonly runtime: {
    sendMessage(message: unknown): Promise<unknown>;
    readonly onMessage: {
      addListener(
        listener: (
          message: unknown,
          sender: unknown,
          respond: (answer: unknown) => void,
        ) => boolean | undefined,
      ): void;
    };
    openOptionsPage(): Promise<void>;
  };
  readonly action?: {
    readonly onClicked: { addListener(listener: () => void): void };
  };
  readonly storage: {
    readonly local: {
      get(keys: readonly string[]): Promise<Record<string, unknown>>;
      set(items: Record<string, unknown>): Promise<void>;
    };
  };
}

export function browserApi(): ExtensionApi {
  const api = (globalThis as { chrome?: ExtensionApi }).chrome;
  if (api === undefined)
    throw new Error("The Slopify Studio extension is running outside a browser extension.");
  return api;
}
