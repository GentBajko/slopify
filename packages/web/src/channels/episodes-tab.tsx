import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type ReactElement, useState } from "react";
import { useApp } from "@/app-context";
import { StatusSlot } from "@/components/kit/action-bar";
import { Button } from "@/components/kit/button";
import { ConfirmDialog, Dialog } from "@/components/kit/dialog";
import { EmptyState } from "@/components/kit/empty-state";
import { Field, Textarea } from "@/components/kit/field";
import { List, ListRow } from "@/components/kit/list-row";
import { Switch } from "@/components/kit/switch";
import {
  deleteEpisodeMemory,
  type EpisodeMemory,
  episodesKey,
  episodesQuery,
  saveEpisodeSummary,
  setEpisodeMemory,
} from "./memory-api";

const preview = (text: string): string => (text.length > 160 ? `${text.slice(0, 160)}…` : text);

// The Episodes tab: episode memory's on/off setting and the summaries finished episodes left,
// each opened to read or edit, or deleted.
export function EpisodesTab({ channelId }: { readonly channelId: string }): ReactElement {
  const { api } = useApp();
  const client = useQueryClient();
  const read = useQuery(episodesQuery(api, channelId));
  const [editing, setEditing] = useState<EpisodeMemory | null>(null);
  const [deleting, setDeleting] = useState<EpisodeMemory | null>(null);
  const refresh = () => client.invalidateQueries({ queryKey: episodesKey(channelId) });
  const toggle = useMutation({
    mutationFn: (enabled: boolean) => setEpisodeMemory(api, channelId, enabled),
    onSuccess: (value) => client.setQueryData(episodesKey(channelId), value),
  });
  const remove = useMutation({
    mutationFn: (id: string) => deleteEpisodeMemory(api, channelId, id),
    onSuccess: async () => {
      setDeleting(null);
      await refresh();
    },
  });
  const enabled = read.data?.enabled ?? false;
  const memories = read.data?.memories ?? [];
  return (
    <div>
      <Switch
        checked={enabled}
        disabled={read.data === undefined || toggle.isPending}
        onChange={(next) => toggle.mutate(next)}
        label="Episode memory"
        tip="planning.channel.episode-memory"
        describedBy={`${channelId}-memory-help`}
      />
      <p id={`${channelId}-memory-help`} className="mt-1 mb-3 text-small text-ink-2">
        Finished episodes leave a short summary that new related episodes are written with.
      </p>
      <StatusSlot tone={read.error || toggle.error || remove.error ? "error" : "info"}>
        {read.error?.message ??
          toggle.error?.message ??
          (deleting ? undefined : remove.error?.message) ??
          (read.isPending ? "Loading the episodes…" : undefined)}
      </StatusSlot>
      {read.data && memories.length === 0 ? (
        <EmptyState title="No episodes remembered yet">
          {enabled
            ? "When a video on this channel finishes, its summary appears here."
            : "Turn on episode memory, and the next finished video's summary appears here."}
        </EmptyState>
      ) : null}
      {memories.length > 0 ? (
        <List label="Episode summaries">
          {memories.map((memory) => (
            <ListRow
              key={memory.id}
              title={memory.title}
              meta={
                <>
                  {memory.source === "edited" ? "Edited · " : ""}
                  {memory.cast.length > 0 ? `${memory.cast.join(", ")} · ` : ""}
                  {preview(memory.summary)}
                </>
              }
              actions={
                <>
                  <Button
                    size="small"
                    aria-label={`Open the summary of ${memory.title}`}
                    onClick={() => setEditing(memory)}
                  >
                    Open
                  </Button>
                  <Button
                    size="small"
                    variant="quiet"
                    aria-label={`Delete the summary of ${memory.title}`}
                    onClick={() => {
                      remove.reset();
                      setDeleting(memory);
                    }}
                  >
                    Delete
                  </Button>
                </>
              }
            />
          ))}
        </List>
      ) : null}
      {editing ? (
        <SummaryDialog
          key={editing.id}
          channelId={channelId}
          memory={editing}
          onClose={() => setEditing(null)}
        />
      ) : null}
      <ConfirmDialog
        open={deleting !== null}
        title={`Delete the summary of ${deleting?.title ?? "this episode"}?`}
        consequence={
          remove.error?.message ??
          "New episodes stop being reminded of it. The video itself is not changed."
        }
        confirmLabel="Delete summary"
        pending={remove.isPending}
        onConfirm={() => {
          if (deleting) remove.mutate(deleting.id);
        }}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}

function SummaryDialog({
  channelId,
  memory,
  onClose,
}: {
  readonly channelId: string;
  readonly memory: EpisodeMemory;
  readonly onClose: () => void;
}): ReactElement {
  const { api } = useApp();
  const client = useQueryClient();
  const [text, setText] = useState(memory.summary);
  const save = useMutation({
    mutationFn: () => saveEpisodeSummary(api, channelId, memory.id, text),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: episodesKey(channelId) });
      onClose();
    },
  });
  const changed = text.trim() !== memory.summary.trim();
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={memory.title}
      description={
        memory.source === "edited"
          ? "You edited this summary; finishing the video again keeps your text."
          : "Written by the text model when the video finished. An edit here is kept."
      }
      footer={
        <>
          <Button onClick={onClose}>Close</Button>
          <Button
            variant="primary"
            disabled={!changed || save.isPending}
            onClick={() => save.mutate()}
          >
            Save summary
          </Button>
        </>
      }
    >
      <Field label="Summary" error={save.error?.message} tip="planning.channel.episode-summary">
        <Textarea rows={8} value={text} onChange={(event) => setText(event.target.value)} />
      </Field>
    </Dialog>
  );
}
