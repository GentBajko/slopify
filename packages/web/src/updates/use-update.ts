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
} from "./api.js";

interface UpdateView {
  readonly info: UpdateInfo | undefined;
  readonly updating: boolean;
  readonly checking: boolean;
  readonly installing: boolean;
  readonly reconnecting: boolean;
  readonly error: string | undefined;
  readonly inspect: () => void;
  readonly refresh: () => void;
  readonly install: () => void;
}

export function useUpdate(reload: () => void): UpdateView {
  const { api } = useApp();
  const client = useQueryClient();
  const [acceptedVersion, setAcceptedVersion] = useState<string | null>(null);
  const reloaded = useRef(false);
  const status = useQuery({
    queryKey: updateKey,
    queryFn: ({ signal }) => checkUpdate(api, false, signal),
    staleTime: updateCheckInterval,
    refetchOnWindowFocus: "always",
    refetchInterval: (query) =>
      acceptedVersion !== null ||
      query.state.data?.status === "checking" ||
      query.state.data?.status === "installing" ||
      query.state.data?.status === "restarting"
        ? updateReconnectInterval
        : updateCheckInterval,
    retry: false,
  });

  const refresh = useMutation({
    mutationFn: () => checkUpdate(api, true),
    onMutate: () => client.cancelQueries({ queryKey: updateKey }),
    onSuccess: (info) => client.setQueryData(updateKey, info),
    retry: false,
  });
  const install = useMutation({
    mutationFn: () => installUpdate(api),
    onMutate: () => client.cancelQueries({ queryKey: updateKey }),
    onSuccess: (info) => {
      setAcceptedVersion(info.currentVersion);
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
    if (acceptedVersion === null || status.data === undefined) return;
    const activated = status.data.status === "idle" || status.data.status === "error";
    // A replacement answers health checks before its activation commits. Keep this
    // tab on the current build until that candidate leaves the restart barrier.
    if (status.data.currentVersion !== acceptedVersion && activated && !reloaded.current) {
      reloaded.current = true;
      reload();
    } else if (status.data.status === "error") {
      setAcceptedVersion(null);
    }
  }, [acceptedVersion, reload, status.data]);

  const updating =
    acceptedVersion !== null ||
    status.data?.status === "installing" ||
    status.data?.status === "restarting";
  const error =
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
    inspect: () => {
      void status.refetch();
    },
    refresh: () => {
      install.reset();
      refresh.mutate();
    },
    install: () => {
      refresh.reset();
      install.mutate();
    },
  };
}
