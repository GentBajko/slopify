import type { ReactNode } from "react";
import { createContext, useContext } from "react";
import type { Api } from "./api.js";
import type { OpenEvents } from "./events.js";
import type { VersionWatch } from "./version.js";

// Everything the tree needs that is not React's. It is built once in main.tsx and handed down
// through this provider; no module here reaches for a client of its own.
export interface AppDeps {
  readonly api: Api;
  readonly openEvents: OpenEvents;
  readonly version: VersionWatch;
}

const AppContext = createContext<AppDeps | undefined>(undefined);

export function AppProvider({
  deps,
  children,
}: {
  readonly deps: AppDeps;
  readonly children: ReactNode;
}) {
  return <AppContext.Provider value={deps}>{children}</AppContext.Provider>;
}

export function useApp(): AppDeps {
  const deps = useContext(AppContext);
  if (deps === undefined) {
    throw new Error("useApp was called outside AppProvider");
  }
  return deps;
}
