import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useApp } from "@/app-context";
import { StatusSlot } from "@/components/kit/action-bar";
import { Button } from "@/components/kit/button";
import { Drawer } from "@/components/kit/drawer";
import { InfoTip } from "@/components/kit/info-tip";
import { Rail, RailGroup } from "@/components/rail";
import { installPack, onboardingKey, readFirstRun } from "./api.js";

// Library → Templates → Add pack: the four starter packs, each adding its prompts, a suggested
// voice and a template. Adding one twice changes nothing and never replaces an item of yours.
export function PacksDrawer({
  open,
  onClose,
  onInstalled,
}: {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onInstalled: () => void;
}): ReactElement {
  const { api } = useApp();
  const client = useQueryClient();
  const view = useQuery({
    queryKey: onboardingKey,
    queryFn: () => readFirstRun(api),
    enabled: open,
  });
  const install = useMutation({
    mutationFn: (id: string) => installPack(api, id),
    onSuccess: () => onInstalled(),
    onSettled: () => client.invalidateQueries({ queryKey: onboardingKey }),
  });
  return (
    <Drawer
      open={open}
      title="Add a starter pack"
      onClose={onClose}
      footer={
        <StatusSlot tone={install.error || view.error ? "error" : "success"}>
          {install.error?.message ??
            view.error?.message ??
            (install.data === undefined
              ? undefined
              : install.data.added
                ? "Added: its prompts are in Prompts and its template is in this list."
                : "That pack was already added.")}
        </StatusSlot>
      }
    >
      <p className="mb-4 flex items-center gap-1 text-small text-ink2">
        Prompts, a suggested voice and a template for one kind of channel.
        <InfoTip id="welcome.packs" />
      </p>
      <RailGroup>
        {(view.data?.packs ?? []).map((pack) => (
          <Rail key={pack.id}>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="font-semibold">{pack.name}</span>
              <span className="text-small text-ink2">{pack.summary}</span>
            </span>
            <Button
              disabled={pack.installed || install.isPending}
              onClick={() => install.mutate(pack.id)}
            >
              {pack.installed ? "Added" : "Add pack"}
            </Button>
          </Rail>
        ))}
        {view.data === undefined ? <Rail>Loading packs…</Rail> : null}
      </RailGroup>
    </Drawer>
  );
}
