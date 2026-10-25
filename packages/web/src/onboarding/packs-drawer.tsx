import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useApp } from "@/app-context";
import { StatusSlot } from "@/components/kit/action-bar";
import { Button } from "@/components/kit/button";
import { Drawer } from "@/components/kit/drawer";
import { List, ListRow } from "@/components/kit/list-row";
import { installPack, onboardingKey, readFirstRun } from "./api.js";

// Templates → Add starter templates: the four starter templates, each adding its prompts, a
// suggested voice and the template. Adding one twice changes nothing and never replaces an item
// of yours.
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
      title="Add starter templates"
      onClose={onClose}
      footer={
        <StatusSlot tone={install.error || view.error ? "error" : "success"}>
          {install.error?.message ??
            view.error?.message ??
            (install.data === undefined
              ? undefined
              : install.data.added
                ? "Added: its prompts are in Prompts and its template is in this list."
                : "That starter template was already added.")}
        </StatusSlot>
      }
    >
      <p className="m-0 mb-4 text-small text-ink-2">
        Each adds prompts, a suggested voice and a template for one kind of channel. It never
        replaces a prompt or template of yours.
      </p>
      <List label="Starter templates" className="sl-list--wrap-meta">
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
                {pack.installed ? "Added" : "Add template"}
              </Button>
            }
          />
        ))}
        {view.data === undefined ? <ListRow title="Loading starter templates…" /> : null}
      </List>
    </Drawer>
  );
}
