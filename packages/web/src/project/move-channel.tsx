import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type ReactElement, useState } from "react";
import { moveProjectsToChannel } from "@/api";
import { useApp } from "@/app-context";
import { useCurrentChannel } from "@/channels/current";
import { Button } from "@/components/kit/button";
import { Dialog } from "@/components/kit/dialog";
import { Field, Select } from "@/components/kit/field";
import { useToast } from "@/components/kit/toast";
import { keys } from "@/queries";

// The project page's More → Move to channel…: the project goes to another channel's list,
// brand and playlists. Nothing it made changes.
export function MoveToChannel({
  projectId,
  title,
  open,
  onClose,
}: {
  readonly projectId: string;
  readonly title: string;
  readonly open: boolean;
  readonly onClose: () => void;
}): ReactElement {
  const { api } = useApp();
  const client = useQueryClient();
  const notify = useToast();
  const current = useCurrentChannel();
  const [target, setTarget] = useState("");
  const move = useMutation({
    mutationFn: () => moveProjectsToChannel(api, [projectId], target),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: keys.projects });
      notify(
        `Moved "${title}" to ${current.channels.find((one) => one.id === target)?.name ?? "the channel"}.`,
        "success",
      );
      onClose();
    },
    onError: (error: Error) => notify(`The project wasn't moved: ${error.message}`, "error"),
  });
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title="Move to channel"
      description="The project shows in that channel's list and uses its brand and playlists. Nothing it made changes."
      footer={
        <>
          <Button type="button" variant="quiet" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={target === "" || move.isPending}
            onClick={() => move.mutate()}
          >
            Move
          </Button>
        </>
      }
    >
      <Field label="Channel">
        <Select
          value={target}
          onChange={(event) => setTarget(event.currentTarget.value)}
          options={[
            { value: "", label: "Choose a channel" },
            ...current.channels.map((one) => ({ value: one.id, label: one.name })),
          ]}
        />
      </Field>
    </Dialog>
  );
}
