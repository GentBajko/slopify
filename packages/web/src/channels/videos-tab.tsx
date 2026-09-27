import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type ReactElement, useId, useRef, useState } from "react";
import { useApp } from "@/app-context";
import { StatusSlot } from "@/components/kit/action-bar";
import { Button } from "@/components/kit/button";
import { ConfirmDialog } from "@/components/kit/dialog";
import { EmptyState } from "@/components/kit/empty-state";
import { Field, Input, Textarea } from "@/components/kit/field";
import { List, ListRow } from "@/components/kit/list-row";
import { SectionHead } from "@/components/kit/section-head";
import {
  clearVideos,
  deleteVideo,
  importVideos,
  previewVideos,
  videosKey,
  videosQuery,
} from "./memory-api";

const plural = (n: number, one: string, many: string): string =>
  `${n.toLocaleString("en")} ${n === 1 ? one : many}`;

// A Studio CSV's titles before saving: one tick per title, in file order.
interface Preview {
  readonly titles: readonly string[];
  readonly ticked: readonly boolean[];
}

// "Keep only titles containing…": the titles holding the text (any case) are ticked, the rest
// unticked; no text ticks them all.
export function tickedBy(titles: readonly string[], filter: string): readonly boolean[] {
  const needle = filter.trim().toLowerCase();
  return titles.map((title) => needle === "" || title.toLowerCase().includes(needle));
}

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
  const [preview, setPreview] = useState<Preview | undefined>(undefined);
  const [filter, setFilter] = useState("");
  const add = useMutation({
    mutationFn: (body: { readonly text: string; readonly filter?: string }) =>
      importVideos(api, channelId, { format: "lines", ...body }),
    onSuccess: async (result, body) => {
      if (body.filter === undefined) setText("");
      else setPreview(undefined);
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
  const scan = useMutation({
    mutationFn: (csv: string) => previewVideos(api, channelId, csv),
    onSuccess: (result) => {
      setFilter(result.filter);
      setPreview({ titles: result.titles, ticked: tickedBy(result.titles, result.filter) });
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
  const busy = add.isPending || scan.isPending || remove.isPending || clear.isPending;
  const error = read.error ?? scan.error ?? add.error ?? remove.error;
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
            add.mutate({ text });
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
            add.reset();
            scan.mutate(await picked.text());
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

// The CSV's titles with a tick each, so videos of other channels in the same Studio export
// (another game, another series) stay out; only the ticked ones are added.
function CsvPreview({
  preview,
  filter,
  busy,
  onFilter,
  onTick,
  onSave,
  onCancel,
}: {
  readonly preview: Preview;
  readonly filter: string;
  readonly busy: boolean;
  readonly onFilter: (filter: string) => void;
  readonly onTick: (ticked: readonly boolean[]) => void;
  readonly onSave: () => void;
  readonly onCancel: () => void;
}): ReactElement {
  const id = useId();
  const count = preview.ticked.filter(Boolean).length;
  return (
    <section aria-label="Titles in the CSV" className="mt-4">
      <SectionHead
        as="h3"
        title="Titles in the CSV"
        meta={`${count.toLocaleString("en")} of ${plural(preview.titles.length, "title", "titles")} ticked`}
      >
        <Button variant="primary" disabled={busy || count === 0} onClick={onSave}>
          Add {plural(count, "ticked title", "ticked titles")}
        </Button>
        <Button variant="quiet" disabled={busy} onClick={onCancel}>
          Cancel
        </Button>
      </SectionHead>
      <Field
        label="Keep only titles containing…"
        help='For example "D&D" or "Lore To Sleep To", in any case. Remembered for this channel.'
      >
        <Input value={filter} maxLength={200} onChange={(event) => onFilter(event.target.value)} />
      </Field>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Button size="small" disabled={busy} onClick={() => onTick(preview.titles.map(() => true))}>
          Tick all
        </Button>
        <Button
          size="small"
          disabled={busy}
          onClick={() => onTick(preview.titles.map(() => false))}
        >
          Untick all
        </Button>
      </div>
      <List label="Titles in the CSV" className="mt-2">
        {preview.titles.map((title, index) => (
          <ListRow
            // biome-ignore lint/suspicious/noArrayIndexKey: a CSV may list one title twice; rows never reorder.
            key={index}
            lead={
              <input
                id={`${id}-${index}`}
                type="checkbox"
                checked={preview.ticked[index] === true}
                disabled={busy}
                className="size-4 shrink-0 accent-accent"
                onChange={(event) =>
                  onTick(
                    preview.ticked.map((tick, at) => (at === index ? event.target.checked : tick)),
                  )
                }
              />
            }
            title={<label htmlFor={`${id}-${index}`}>{title}</label>}
          />
        ))}
      </List>
    </section>
  );
}
