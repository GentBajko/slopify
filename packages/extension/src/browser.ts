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
          sender: { readonly tab?: { readonly id?: number; readonly windowId?: number } },
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
  // and, for posting, one alarm per post due on a site without a scheduler (`when`).
  readonly alarms?: {
    create(
      name: string,
      info: {
        readonly periodInMinutes?: number;
        readonly delayInMinutes?: number;
        readonly when?: number;
      },
    ): void;
    clear?(name: string): Promise<boolean>;
    readonly onAlarm: { addListener(listener: (alarm: { readonly name: string }) => void): void };
  };
  // Opens a video's Details page for its A/B test, and closes it when done.
  readonly tabs?: {
    create(options: {
      readonly url: string;
      readonly active: boolean;
    }): Promise<{ readonly id?: number }>;
    remove(tabId: number): Promise<void>;
    // Brings a filled post's tab to the front when its notification is clicked.
    update?(
      tabId: number,
      options: { readonly active: boolean },
    ): Promise<{ readonly windowId?: number } | undefined>;
  };
  readonly windows?: {
    update(windowId: number, options: { readonly focused: boolean }): Promise<unknown>;
  };
  // Posting: the sites' optional host permissions ("Allow posting on <site>" in the options),
  // their content scripts registered at run time, and the optional notifications.
  readonly permissions?: {
    request(permissions: SitePermissions): Promise<boolean>;
    contains(permissions: SitePermissions): Promise<boolean>;
    remove(permissions: SitePermissions): Promise<boolean>;
  };
  readonly scripting?: {
    registerContentScripts(scripts: readonly RegisteredScript[]): Promise<void>;
    getRegisteredContentScripts(filter?: {
      readonly ids?: readonly string[];
    }): Promise<readonly { readonly id: string }[]>;
    unregisterContentScripts(filter?: { readonly ids?: readonly string[] }): Promise<void>;
  };
  readonly notifications?: {
    create(
      id: string,
      options: {
        readonly type: "basic";
        readonly iconUrl: string;
        readonly title: string;
        readonly message: string;
      },
    ): Promise<string> | undefined;
    readonly onClicked: { addListener(listener: (id: string) => void): void };
    clear?(id: string): Promise<boolean>;
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

export interface SitePermissions {
  readonly origins?: readonly string[];
  readonly permissions?: readonly string[];
}

export interface RegisteredScript {
  readonly id: string;
  readonly matches: readonly string[];
  readonly js: readonly string[];
  readonly runAt: "document_idle";
  readonly persistAcrossSessions: boolean;
}

export function browserApi(): ExtensionApi {
  const api = (globalThis as { chrome?: ExtensionApi }).chrome;
  if (api === undefined)
    throw new Error("The Slopify Studio extension is running outside a browser extension.");
  return api;
}
