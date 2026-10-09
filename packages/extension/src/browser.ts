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
          sender: { readonly tab?: { readonly id?: number } },
          respond: (answer: unknown) => void,
        ) => boolean | undefined,
      ): void;
    };
    openOptionsPage(): Promise<void>;
    // The address of one of the extension's own files, for the page that fetches the video.
    getURL(path: string): string;
    readonly onStartup: { addListener(listener: () => void): void };
    readonly onInstalled: { addListener(listener: () => void): void };
    // The manifest it is running, and reloading from disk (`self-update.ts`).
    getManifest(): { readonly version: string };
    reload(): void;
  };
  // How it was installed: "development" when loaded unpacked from a folder.
  readonly management?: {
    getSelf(): Promise<{ readonly installType?: string }>;
  };
  // The check for public videos with an A/B test waiting, every 15 minutes.
  readonly alarms?: {
    create(
      name: string,
      info: { readonly periodInMinutes: number; readonly delayInMinutes?: number },
    ): void;
    readonly onAlarm: { addListener(listener: (alarm: { readonly name: string }) => void): void };
  };
  // Opens a video's Details page for its A/B test, and closes it when done.
  readonly tabs?: {
    create(options: {
      readonly url: string;
      readonly active: boolean;
    }): Promise<{ readonly id?: number }>;
    remove(tabId: number): Promise<void>;
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
