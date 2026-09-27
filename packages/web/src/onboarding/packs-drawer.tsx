import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useApp } from "@/app-context";
import { StatusSlot } from "@/components/kit/action-bar";
import { Drawer } from "@/components/kit/drawer";
import { InfoTip } from "@/components/kit/info-tip";
import { List, ListRow } from "@/components/kit/list-row";
import { Button } from "@/components/ui/button";
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
      <p className="mb-4 flex items-center gap-1 text-small text-ink-2">
        Prompts, a suggested voice and a template for one kind of channel.
        <InfoTip id="welcome.packs" />
      </p>
      <List label="Starter packs" className="[&_.sl-row__meta]:whitespace-normal">
        {(view.data?.packs ?? []).map((pack) => (
          <ListRow
            key={pack.id}
            title={pack.name}
            meta={pack.summary}
            actions={
              <Button
                disabled={pack.installed || install.isPending}
                onClick={() => install.mutate(pack.id)}
              >
                {pack.installed ? "Added" : "Add pack"}
              </Button>
            }
          />
        ))}
        {view.data === undefined ? <ListRow title="Loading packs…" /> : null}
      </List>
    </Drawer>
  );
}
