// Every response the app writes carries `X-Slopify-Version` (edge/http/app.ts). The
// first version a tab observes is the one that served this bundle, because the bundle
// and the header come out of the same process. `npx slopify@latest` can replace that
// process while the tab stays open, and from then on the tab is running older JavaScript
// than the API it is talking to, so it asks to be reloaded rather than misbehaving
// quietly.

export interface VersionWatch {
  readonly observe: (version: string) => void;
  // The version now being served, once it differs from the one this tab loaded from.
  // A string, not an object, so `useSyncExternalStore` sees a stable snapshot.
  readonly staleAt: () => string | undefined;
  readonly subscribe: (listener: () => void) => () => void;
}

export function createVersionWatch(): VersionWatch {
  let loaded: string | undefined;
  let serving: string | undefined;
  const listeners = new Set<() => void>();

  return {
    observe: (version: string): void => {
      if (loaded === undefined) {
        loaded = version;
        return;
      }
      if (version === loaded || version === serving) {
        return;
      }
      serving = version;
      for (const listener of listeners) {
        listener();
      }
    },
    staleAt: (): string | undefined => serving,
    subscribe: (listener: () => void): (() => void) => {
      listeners.add(listener);
      return (): void => {
        listeners.delete(listener);
      };
    },
  };
}

// The one place the header name is spelled. Wrapping fetch rather than each call site
// means a response cannot reach the query cache without the version being read off it.
export function watchingFetch(inner: typeof fetch, watch: VersionWatch): typeof fetch {
  return async (input, init) => {
    const response = await inner(input, init);
    const version = response.headers.get("X-Slopify-Version");
    if (version !== null) {
      watch.observe(version);
    }
    return response;
  };
}
