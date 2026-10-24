import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type ReactElement, useRef, useState } from "react";
import { useApp } from "@/app-context";
import { StatusSlot } from "@/components/kit/action-bar";
import { Button } from "@/components/kit/button";
import { ConfirmDialog } from "@/components/kit/dialog";
import { EmptyState } from "@/components/kit/empty-state";
import { Field, Input, Textarea } from "@/components/kit/field";
import { List, ListRow } from "@/components/kit/list-row";
import { useToast } from "@/components/kit/toast";
import { pluralGrouped } from "@/lib/format";
import { ShowMore, useBounded } from "./bounded-list";
import {
  type ChannelVideo,
  clearVideos,
  deleteVideo,
  importVideos,
  previewVideos,
  videosKey,
  videosQuery,
} from "./memory-api";
import { CsvPreview, type Preview, tickedBy } from "./videos-csv-preview";

// The Titles to avoid tab: titles of videos the channel made before Slopify, pasted or imported
// from YouTube Studio, so new topic ideas and duplicate checks skip them too. What it is for
// comes first; the paste box opens from Paste titles….
export function VideosTab({ channelId }: { readonly channelId: string }): ReactElement {
  const { api } = useApp();
  const client = useQueryClient();
  const read = useQuery(videosQuery(api, channelId));
  const [text, setText] = useState("");
  const [pasting, setPasting] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [note, setNote] = useState<string | undefined>(undefined);
  const file = useRef<HTMLInputElement>(null);
  const refresh = () => client.invalidateQueries({ queryKey: videosKey(channelId) });
  const [preview, setPreview] = useState<Preview | undefined>(undefined);
  const [filter, setFilter] = useState("");
  const add = useMutation({
    mutationFn: (body: { readonly text: string; readonly filter?: string }) =>
      importVideos(api, channelId, { format: "lines", ...body }),
    onSuccess: async (result, body) => {
      if (body.filter === undefined) {
        setText("");
        setPasting(false);
      } else setPreview(undefined);
      setNote(
        `Added ${pluralGrouped(result.added, "title", "titles")}${
          result.skipped > 0
            ? `; skipped ${result.skipped.toLocaleString("en")} already listed`
            : ""
        }.`,
      );
      await refresh();
    },
  });
  const scan = useMutation({
    mutationFn: (csv: string) => previewVideos(api, channelId, csv),
    onSuccess: (result) => {
      setFilter(result.filter);
      setPreview({ titles: result.titles, ticked: tickedBy(result.titles, result.filter) });
    },
  });
  const notify = useToast();
  const remove = useMutation({
    mutationFn: (video: ChannelVideo) => deleteVideo(api, channelId, video.id),
    onSuccess: async (_, video) => {
      notify(`Removed “${video.title}”.`, "info", {
        label: "Undo",
        run: () => restore.mutate(video.title),
      });
      await refresh();
    },
  });
  // Undo puts the title back as a pasted line would.
  const restore = useMutation({
    mutationFn: (title: string) => importVideos(api, channelId, { format: "lines", text: title }),
    onSuccess: refresh,
    onError: (failure, title) =>
      notify(
        `Couldn't put “${title}” back: ${failure.message} Press Paste titles…, paste it and press Add titles.`,
        "error",
      ),
  });
  const [search, setSearch] = useState("");
  const clear = useMutation({
    mutationFn: () => clearVideos(api, channelId),
    onSuccess: async () => {
      setClearing(false);
      await refresh();
    },
  });
  const videos = read.data ?? [];
  const needle = search.trim().toLowerCase();
  const found =
    needle === "" ? videos : videos.filter((video) => video.title.toLowerCase().includes(needle));
  const rows = useBounded(found, needle);
  const busy =
    add.isPending || scan.isPending || remove.isPending || restore.isPending || clear.isPending;
  const error = read.error ?? scan.error ?? add.error ?? remove.error;
  return (
    <div className="flex flex-col gap-3">
      <p className="m-0 max-w-[90ch] text-small text-ink-2">
        New topic ideas and duplicate checks skip these titles, as they skip the videos made here.
        List the videos this channel made before Slopify.
      </p>
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            aria-expanded={pasting}
            disabled={busy}
            onClick={() => {
              add.reset();
              setPasting((open) => !open);
            }}
          >
            Paste titles…
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
              add.reset();
              scan.mutate(await picked.text());
            }}
          />
          {videos.length === 0 ? null : (
            <Button
              variant="quiet"
              disabled={busy}
              onClick={() => {
                clear.reset();
                setClearing(true);
              }}
            >
              Remove all
            </Button>
          )}
        </div>
        <p className="m-0 text-small text-ink-2">
          The CSV comes from YouTube Studio: Analytics → Content → Advanced mode, then export the
          table.
        </p>
      </div>
      {pasting ? (
        <div className="flex flex-col gap-2">
          <Field label="Titles, one per line" help="A title already listed is skipped.">
            <Textarea rows={5} value={text} onChange={(event) => setText(event.target.value)} />
          </Field>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="primary"
              disabled={busy || text.trim() === ""}
              disabledReason={busy ? "Adding…" : "Paste at least one title"}
              onClick={() => {
                setNote(undefined);
                add.mutate({ text });
              }}
            >
              Add titles
            </Button>
            <Button variant="quiet" onClick={() => setPasting(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}
      <StatusSlot tone={error ? "error" : note ? "success" : "info"}>
        {error?.message ??
          note ??
          (read.isPending
            ? "Loading the titles…"
            : scan.isPending
              ? "Reading the CSV…"
              : undefined)}
      </StatusSlot>
      {preview === undefined ? null : (
        <CsvPreview
          preview={preview}
          filter={filter}
          busy={busy}
          onFilter={(next) => {
            setFilter(next);
            setPreview({ ...preview, ticked: tickedBy(preview.titles, next) });
          }}
          onTick={(ticked) => setPreview({ ...preview, ticked })}
          onSave={() => {
            setNote(undefined);
            const titles = preview.titles.filter((_, index) => preview.ticked[index]);
            add.mutate({ text: titles.join("\n"), filter });
          }}
          onCancel={() => {
            add.reset();
            setPreview(undefined);
          }}
        />
      )}
      {read.data && videos.length === 0 && preview === undefined && !pasting ? (
        <EmptyState title="No titles to avoid yet">
          Press Paste titles… for a few, or import the whole list from YouTube Studio.
        </EmptyState>
      ) : null}
      {videos.length > 0 ? (
        <section aria-label="Titles to avoid">
          <div className="mb-2 flex flex-wrap items-center gap-3">
            <Input
              type="search"
              aria-label="Search titles to avoid"
              placeholder="Search titles to avoid"
              value={search}
              className="w-full min-w-0 sm:w-64"
              onChange={(event) => setSearch(event.target.value)}
            />
            <span className="text-small text-ink-2" role="status">
              {needle === ""
                ? pluralGrouped(videos.length, "title", "titles")
                : `${found.length.toLocaleString("en")} of ${pluralGrouped(videos.length, "title", "titles")} match`}
            </span>
          </div>
          {found.length === 0 ? (
            <EmptyState title="No title matches">
              {`None of the titles contains “${search.trim()}”. Clear the search to see them all.`}
            </EmptyState>
          ) : (
            <List label="Titles to avoid">
              {rows.shown.map((video) => (
                <ListRow
                  key={video.id}
                  title={video.title}
                  actions={
                    <Button
                      size="small"
                      variant="quiet"
                      disabled={busy}
                      aria-label={`Remove ${video.title}`}
                      onClick={() => remove.mutate(video)}
                    >
                      Remove
                    </Button>
                  }
                />
              ))}
            </List>
          )}
          <ShowMore hidden={rows.hidden} onMore={rows.more} />
        </section>
      ) : null}
      <ConfirmDialog
        open={clearing}
        title={`Remove all ${pluralGrouped(videos.length, "title", "titles")}?`}
        consequence={
          clear.error?.message ??
          "Topic suggestions and duplicate checks stop skipping them. Your videos on YouTube are not touched."
        }
        confirmLabel="Remove all"
        cancelLabel="Keep them"
        pending={clear.isPending}
        onConfirm={() => clear.mutate()}
        onCancel={() => setClearing(false)}
      />
    </div>
  );
}
