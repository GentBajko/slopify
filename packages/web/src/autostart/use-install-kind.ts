import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { useApp } from "@/app-context";
import { rememberInstall } from "@/http";
import { autostartKey, readAutostart } from "./api.js";

// The start-at-login view says whether this Slopify runs natively or in Docker. The shell
// reads it once so that "Slopify isn't responding" can later name the right fix even though
// the server is no longer there to ask.
export function useInstallKind(): void {
  const { api } = useApp();
  const view = useQuery({
    queryKey: autostartKey,
    queryFn: () => readAutostart(api),
    retry: false,
    staleTime: Number.POSITIVE_INFINITY,
  });
  const kind = view.data?.kind;
  useEffect(() => {
    if (kind !== undefined) rememberInstall(kind);
  }, [kind]);
}
