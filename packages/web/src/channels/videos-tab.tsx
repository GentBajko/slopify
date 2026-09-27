import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type ReactElement, useRef, useState } from "react";
import { useApp } from "@/app-context";
import { StatusSlot } from "@/components/kit/action-bar";
import { Button } from "@/components/kit/button";
import { ConfirmDialog } from "@/components/kit/dialog";
import { EmptyState } from "@/components/kit/empty-state";
import { Field, Textarea } from "@/components/kit/field";
import { List, ListRow } from "@/components/kit/list-row";
import { clearVideos, deleteVideo, importVideos, videosKey, videosQuery } from "./memory-api";

const plural = (n: number, one: string, many: string): string =>
  `${n.toLocaleString("en")} ${n === 1 ? one : many}`;

// The Existing videos tab: titles of videos the channel made before Slopify, pasted or imported
// from YouTube Studio, so topic suggestions and duplicate checks skip them too.
export function VideosTab({ channelId }: { readonly channelId: string }): ReactElement {
  const { api } = useApp();
  const client = useQueryClient();
  const read = useQuery(videosQuery(api, channelId));
  const [text, setText] = useState("");
  const [clearing, setClearing] = useState(false);
  const [note, setNote] = useState<string | undefined>(undefined);
  const file = useRef<HTMLInputElement>(null);
  const refresh = () => client.invalidateQueries({ queryKey: videosKey(channelId) });
  const add = useMutation({
    mutationFn: (body: { readonly format: "lines" | "csv"; readonly text: string }) =>
      importVideos(api, channelId, body),
    onSuccess: async (result, body) => {
      if (body.format === "lines") setText("");
      setNote(
        `Added ${plural(result.added, "title", "titles")}${
          result.skipped > 0
            ? `; skipped ${result.skipped.toLocaleString("en")} already listed`
            : ""
        }.`,
      );
      await refresh();
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => deleteVideo(api, channelId, id),
    onSuccess: refresh,
  });
  const clear = useMutation({
    mutationFn: () => clearVideos(api, channelId),
    onSuccess: async () => {
      setClearing(false);
      await refresh();
    },
  });
  const videos = read.data ?? [];
  const busy = add.isPending || remove.isPending || clear.isPending;
  const error = read.error ?? add.error ?? remove.error;
  return (
    <div>
      <p className="mb-3 text-small text-ink-2">
        Topic suggestions and duplicate checks skip these titles, as they skip the videos made here.
      </p>
      <Field
        label="Paste titles"
        help="One title per line. Titles already listed are skipped, whatever their case."
      >
        <Textarea rows={5} value={text} onChange={(event) => setText(event.target.value)} />
      </Field>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Button
          variant="primary"
          disabled={busy || text.trim() === ""}
          onClick={() => {
            setNote(undefined);
            add.mutate({ format: "lines", text });
          }}
        >
          Add titles
        </Button>
        <Button
          disabled={busy}
          onClick={() => {
            file.current?.click();
          }}
        >
          Import a YouTube Studio CSV…
        </Button>
        <input
          ref={file}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          aria-label="YouTube Studio CSV file"
          onChange={async (event) => {
            const picked = event.target.files?.[0];
            event.target.value = "";
            if (picked === undefined) return;
            setNote(undefined);
            add.mutate({ format: "csv", text: await picked.text() });
          }}
        />
        <Button
          variant="quiet"
          disabled={busy || videos.length === 0}
          onClick={() => {
            clear.reset();
            setClearing(true);
          }}
        >
          Remove all
        </Button>
      </div>
      <StatusSlot tone={error ? "error" : note ? "success" : "info"} className="mt-1">
        {error?.message ?? note ?? (read.isPending ? "Loading the titles…" : undefined)}
      </StatusSlot>
      {read.data && videos.length === 0 ? (
        <EmptyState title="No existing videos listed">
          In YouTube Studio open Analytics → Content → Advanced mode, export the table as a CSV, and
          import it here; or paste the titles above.
        </EmptyState>
      ) : null}
      {videos.length > 0 ? (
        <List label="Existing videos">
          {videos.map((video) => (
            <ListRow
              key={video.id}
              title={video.title}
              actions={
                <Button
                  size="small"
                  variant="quiet"
                  disabled={busy}
                  aria-label={`Remove ${video.title}`}
                  onClick={() => remove.mutate(video.id)}
                >
                  Remove
                </Button>
              }
            />
          ))}
        </List>
      ) : null}
      <ConfirmDialog
        open={clearing}
        title={`Remove all ${plural(videos.length, "title", "titles")}?`}
        consequence={
          clear.error?.message ??
          "Topic suggestions and duplicate checks stop skipping them. Your videos on YouTube are not touched."
        }
        confirmLabel="Remove all"
        pending={clear.isPending}
        onConfirm={() => clear.mutate()}
        onCancel={() => setClearing(false)}
      />
    </div>
  );
}
