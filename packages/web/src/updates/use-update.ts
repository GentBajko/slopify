import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useApp } from "@/app-context";
import {
  checkUpdate,
  installUpdate,
  type UpdateInfo,
  updateCheckInterval,
  updateKey,
  updateReconnectInterval,
  updateRecoveryTimeout,
} from "./api.js";

interface UpdateView {
  readonly info: UpdateInfo | undefined;
  readonly updating: boolean;
  readonly checking: boolean;
  readonly installing: boolean;
  readonly reconnecting: boolean;
  readonly error: string | undefined;
  readonly refresh: () => void;
  readonly install: () => void;
}

export function useUpdate(reload: () => void): UpdateView {
  const { api } = useApp();
  const client = useQueryClient();
  const [acceptedVersion, setAcceptedVersion] = useState<string | null>(null);
  const [recoveryTimedOut, setRecoveryTimedOut] = useState(false);
  const [recoveryError, setRecoveryError] = useState<string | undefined>();
  const reloaded = useRef(false);
  const status = useQuery({
    queryKey: updateKey,
    queryFn: ({ signal }) => checkUpdate(api, false, signal),
    staleTime: updateCheckInterval,
    refetchOnWindowFocus: "always",
    refetchInterval: (query) =>
      !recoveryTimedOut &&
      (acceptedVersion !== null ||
        query.state.data?.status === "checking" ||
        query.state.data?.status === "installing" ||
        query.state.data?.status === "restarting")
        ? updateReconnectInterval
        : updateCheckInterval,
    retry: false,
  });

  const refresh = useMutation({
    mutationFn: () => checkUpdate(api, true),
    onMutate: () => {
      setRecoveryTimedOut(false);
      setRecoveryError(undefined);
      return client.cancelQueries({ queryKey: updateKey });
    },
    onSuccess: (info) => client.setQueryData(updateKey, info),
    retry: false,
  });
  const install = useMutation({
    mutationFn: () => installUpdate(api),
    onMutate: () => {
      setRecoveryTimedOut(false);
      setRecoveryError(undefined);
      return client.cancelQueries({ queryKey: updateKey });
    },
    onSuccess: (info) => {
      setAcceptedVersion(info.currentVersion);
      setRecoveryTimedOut(false);
      setRecoveryError(undefined);
      client.setQueryData(updateKey, info);
    },
    onError: () => {
      // A refusal may mean a project started since the last check. Read that state
      // back; the failed POST itself is never retried.
      void client.invalidateQueries({ queryKey: updateKey });
    },
    retry: false,
  });

  useEffect(() => {
    if (acceptedVersion === null) return;
    const timeout = window.setTimeout(() => {
      setAcceptedVersion(null);
      setRecoveryTimedOut(true);
      setRecoveryError("The update did not finish. Restart Slopify and try again.");
    }, updateRecoveryTimeout);
    return () => window.clearTimeout(timeout);
  }, [acceptedVersion]);

  useEffect(() => {
    if (acceptedVersion === null || status.data === undefined) return;
    const activated = status.data.status === "idle" || status.data.status === "error";
    // A replacement answers health checks before its activation commits. Keep this
    // tab on the current build until that candidate leaves the restart barrier.
    if (status.data.currentVersion !== acceptedVersion && activated && !reloaded.current) {
      reloaded.current = true;
      setAcceptedVersion(null);
      setRecoveryTimedOut(false);
      setRecoveryError(undefined);
      reload();
    } else if (activated) {
      setAcceptedVersion(null);
      setRecoveryTimedOut(false);
      setRecoveryError(undefined);
    }
  }, [acceptedVersion, reload, status.data]);

  const updating =
    !recoveryTimedOut &&
    (acceptedVersion !== null ||
      status.data?.status === "installing" ||
      status.data?.status === "restarting");
  const error =
    recoveryError ??
    install.error?.message ??
    refresh.error?.message ??
    (updating ? undefined : (status.error?.message ?? status.data?.error));

  return {
    info: status.data,
    updating,
    checking: status.isFetching || refresh.isPending || status.data?.status === "checking",
    installing: install.isPending,
    reconnecting: updating && status.isError,
    error,
    refresh: () => {
      install.reset();
      setRecoveryTimedOut(false);
      setRecoveryError(undefined);
      refresh.mutate();
    },
    install: () => {
      refresh.reset();
      setRecoveryTimedOut(false);
      setRecoveryError(undefined);
      install.mutate();
    },
  };
}
