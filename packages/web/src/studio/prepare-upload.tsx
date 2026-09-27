import {
  type PackItem,
  type StudioStep,
  studioSteps,
  studioUploadUrl,
  tagsLine,
} from "@app/slices/studio/model.js";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CopyIcon, DownloadIcon } from "lucide-react";
import { type ReactNode, useState } from "react";
import { chooseUploadPack, readUploadPack, saveRealFootage } from "@/api";
import { useApp } from "@/app-context";
import { StatusSlot, type StatusTone } from "@/components/kit/action-bar";
import { Button } from "@/components/kit/button";
import { Callout } from "@/components/kit/callout";
import { Drawer } from "@/components/kit/drawer";
import { InfoTip } from "@/components/kit/info-tip";
import { FileLink } from "@/components/kit/link";
import { List, ListRow } from "@/components/kit/list-row";
import { MediaFrame, MediaGrid } from "@/components/kit/media";
import { SectionHead } from "@/components/kit/section-head";
import { Segmented, Switch } from "@/components/kit/switch";
import { OpenFolder } from "@/project/open-folder";

// Prepare upload: everything YouTube Studio asks for, in the order it asks, for the video and
// each short: one row per step with a done tick and a small quiet action (Copy, Open folder,
// Download), the thumbnails under the list. Fill in YouTube Studio hands the chosen
// item to the Slopify Studio extension and opens Studio's upload page; without the extension
// the list is the whole flow. Slopify never uploads or publishes.
export function PrepareUpload({
  projectId,
  ready,
}: {
  readonly projectId: string;
  // A finished video is there to upload.
  readonly ready: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        variant="quiet"
        disabled={!ready}
        disabledReason="Available once the video has been made"
        onClick={() => setOpen(true)}
      >
        Prepare upload
      </Button>
      {open ? <PrepareUploadDrawer projectId={projectId} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

const stepLabels: Readonly<Record<StudioStep, string>> = {
  video: "Video file",
  title: "Title",
  description: "Description",
  thumbnails: "Thumbnail",
  playlist: "Playlist",
  audience: "Audience",
  altered: "AI use (under Show more)",
  tags: "Tags (under Show more)",
};

function itemKey(item: PackItem): string {
  return item.kind === "video" ? "video" : `short-${String(item.short)}`;
}

export function PrepareUploadDrawer({
  projectId,
  onClose,
}: {
  readonly projectId: string;
  readonly onClose: () => void;
}) {
  const { api } = useApp();
  const client = useQueryClient();
  const packKey = ["studio", "pack", projectId];
  const pack = useQuery({ queryKey: packKey, queryFn: () => readUploadPack(api, projectId) });
  const [chosen, setChosen] = useState("video");
  const [status, setStatus] = useState<{ text: string; tone: StatusTone } | undefined>();
  const items = pack.data?.items ?? [];
  const item = items.find((one) => itemKey(one) === chosen) ?? items[0];
  const fill = useMutation({
    mutationFn: (target: PackItem) => chooseUploadPack(api, projectId, target.short),
    onSuccess: () => {
      setStatus({
        text: "Studio is opening. Drop the video file into its upload dialog; the Slopify Studio extension then fills in the rest. Check everything and publish yourself.",
        tone: "success",
      });
    },
    onError: (error) => setStatus({ text: error.message, tone: "error" }),
  });
  const footage = useMutation({
    mutationFn: (real: boolean) => saveRealFootage(api, projectId, real),
    onSuccess: (saved) => {
      client.setQueryData(packKey, saved);
      setStatus({ text: "Saved. The AI use answer is updated.", tone: "success" });
    },
    onError: (error) =>
      setStatus({
        text: `Couldn't save whether the clips are real footage: ${error.message} Press the switch again.`,
        tone: "error",
      }),
  });
  const copy = (text: string, what: string) => {
    if (!navigator.clipboard) {
      setStatus({ text: `Couldn't copy the ${what}. Select the text and copy it.`, tone: "error" });
      return;
    }
    void navigator.clipboard.writeText(text).then(
      () => setStatus({ text: `Copied the ${what}.`, tone: "success" }),
      () =>
        setStatus({
          text: `Couldn't copy the ${what}. Select the text and copy it.`,
          tone: "error",
        }),
    );
  };
  return (
    <Drawer
      open
      title="Prepare upload"
      onClose={onClose}
      footer={
        <>
          <StatusSlot tone={status?.tone ?? "info"}>{status?.text}</StatusSlot>
          <Button
            variant="primary"
            disabled={item === undefined || fill.isPending}
            disabledReason="Wait for the upload pack to load"
            onClick={() => {
              if (item === undefined) return;
              // Opened now, inside the click, so the browser doesn't block the new tab.
              window.open(studioUploadUrl, "_blank", "noopener");
              fill.mutate(item);
            }}
          >
            Fill in YouTube Studio
          </Button>
          <InfoTip id="project.upload.fill-studio" />
        </>
      }
    >
      {pack.error === null ? null : (
        <Callout tone="danger" title="The upload pack couldn't be read.">
          {`${pack.error.message} Close Prepare upload and open it again.`}
        </Callout>
      )}
      {pack.data === undefined ? null : (
        <div className="flex flex-col gap-5">
          {items.length > 1 ? (
            <Segmented
              label="What to upload"
              value={item === undefined ? "" : itemKey(item)}
              onChange={setChosen}
              tip="project.upload.item"
              options={items.map((one) => ({
                value: itemKey(one),
                label: one.kind === "video" ? "Video" : `Short ${String(one.short)}`,
              }))}
              className="self-start"
            />
          ) : null}
          {pack.data.missing.length === 0 ? null : (
            <Callout tone="waiting" title="Some of it isn't made yet.">
              <ul className="m-0 flex list-none flex-col gap-1 p-0">
                {pack.data.missing.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </Callout>
          )}
          {item === undefined ? null : (
            <Steps
              key={itemKey(item)}
              projectId={projectId}
              item={item}
              footageSwitch={
                item.kind === "video" && pack.data.footage !== undefined ? (
                  <Switch
                    checked={footage.isPending ? footage.variables : pack.data.footage.real}
                    disabled={footage.isPending}
                    onChange={(next) => footage.mutate(next)}
                    tip="project.upload.real-footage"
                    label={`The ${pack.data.footage.clips === 1 ? "uploaded clip is" : `${String(pack.data.footage.clips)} uploaded clips are`} real footage (filmed, not made by AI)`}
                  />
                ) : undefined
              }
              copy={copy}
              doneKey={`slopify.upload.${projectId}.${itemKey(item)}`}
            />
          )}
          <Callout title="Slopify never publishes.">
            Fill in YouTube Studio hands this to the Slopify Studio extension (Settings → YouTube
            Studio) after you drop the video in. You check it and press Publish.
          </Callout>
        </div>
      )}
    </Drawer>
  );
}

function readDone(key: string): readonly string[] {
  try {
    const stored = JSON.parse(localStorage.getItem(key) ?? "[]") as unknown;
    return Array.isArray(stored) ? stored.filter((one) => typeof one === "string") : [];
  } catch {
    return [];
  }
}

// A download that looks like the row's other small quiet actions.
function Download({ href, filename }: { readonly href: string; readonly filename: string }) {
  return (
    <FileLink
      href={href}
      download={filename}
      aria-label={`Download ${filename}`}
      variant="quiet"
      size="small"
    >
      <DownloadIcon aria-hidden="true" className="size-4 shrink-0" strokeWidth={1.75} />
      Download
    </FileLink>
  );
}

function Steps({
  projectId,
  item,
  footageSwitch,
  copy,
  doneKey,
}: {
  readonly projectId: string;
  readonly item: PackItem;
  // The AI use step's "real footage" switch, for a video with uploaded clips.
  readonly footageSwitch?: ReactNode;
  readonly copy: (text: string, what: string) => void;
  // Where this browser remembers the ticks; a tick is a note to self, not project state.
  readonly doneKey: string;
}) {
  const { api } = useApp();
  const [done, setDone] = useState<readonly string[]>(() => readDone(doneKey));
  const tick = (step: StudioStep, on: boolean) => {
    const next = on ? [...done, step] : done.filter((one) => one !== step);
    setDone(next);
    try {
      localStorage.setItem(doneKey, JSON.stringify(next));
    } catch {
      // Not remembered in this browser; the tick still shows until the drawer closes.
    }
  };
  // Shorts have no thumbnail step: Studio picks a frame of a short.
  const steps = studioSteps.filter((step) => step !== "thumbnails" || item.kind === "video");
  const copyAction = (step: StudioStep) => {
    const text = copyTextOf(item, step);
    return (
      <Button
        variant="quiet"
        size="small"
        disabled={text === ""}
        disabledReason="Nothing to copy yet"
        aria-label={`Copy ${stepLabels[step].toLowerCase()}`}
        onClick={() => copy(text, stepLabels[step].toLowerCase())}
      >
        <CopyIcon aria-hidden="true" className="size-4 shrink-0" strokeWidth={1.75} />
        Copy
      </Button>
    );
  };
  const contentOf = (step: StudioStep): { value: ReactNode; actions?: ReactNode } => {
    switch (step) {
      case "video":
        return item.video === null
          ? { value: <span className="text-ink-3">Not made yet.</span> }
          : {
              value: item.video.filename,
              actions: (
                <>
                  <OpenFolder projectId={projectId} asset={item.video.asset} />
                  <Download
                    href={`${api.origin}${item.video.url}`}
                    filename={item.video.filename}
                  />
                </>
              ),
            };
      case "thumbnails":
        return item.thumbnails.length === 0
          ? { value: <span className="text-ink-3">None made.</span> }
          : {
              value:
                item.thumbnails.length > 1
                  ? `The first under Thumbnail; all ${String(item.thumbnails.length)} in A/B Testing (beside the title).`
                  : (item.thumbnails[0]?.filename ?? ""),
              actions: (
                <OpenFolder
                  projectId={projectId}
                  asset={item.thumbnails[0]?.asset ?? "thumbnail"}
                />
              ),
            };
      case "audience":
        return { value: "No, it's not made for kids" };
      case "altered":
        return {
          value: (
            <span className="flex flex-col gap-1">
              <span className="font-semibold">{item.alteredContent.altered ? "Yes" : "No"}</span>
              <span className="text-ink-2">{item.alteredContent.why}</span>
              {footageSwitch}
            </span>
          ),
        };
      case "description":
        return {
          value:
            item.chapterNotice === undefined ? (
              copyTextOf(item, step) || <span className="text-ink-3">Not written yet.</span>
            ) : (
              <span className="flex flex-col gap-1">
                <span>{item.description}</span>
                <span className="text-waiting">{item.chapterNotice}</span>
              </span>
            ),
          actions: copyAction(step),
        };
      case "playlist":
        return {
          value: item.playlist ?? (
            <span className="text-ink-3">None set (Settings → YouTube Studio).</span>
          ),
          actions: copyAction(step),
        };
      default:
        return {
          value: copyTextOf(item, step) || <span className="text-ink-3">Not written yet.</span>,
          actions: copyAction(step),
        };
    }
  };
  return (
    <div className="flex flex-col gap-5">
      <section aria-label="In the order Studio asks">
        <div className="mb-2 flex items-center gap-1">
          <div className="sl-kicker">In the order Studio asks</div>
          <InfoTip id="project.upload.steps" className="-my-1" />
        </div>
        <List label="Upload steps" className="[&_.sl-row__actions]:flex-wrap">
          {steps.map((step) => {
            const { value, actions } = contentOf(step);
            return (
              <ListRow
                key={step}
                className="items-start"
                lead={
                  <input
                    type="checkbox"
                    checked={done.includes(step)}
                    onChange={(event) => tick(step, event.currentTarget.checked)}
                    className="mt-1 size-4 shrink-0 self-start accent-[var(--color-accent)]"
                    aria-label={`${stepLabels[step]} done`}
                  />
                }
                title={stepLabels[step]}
                meta={
                  <span className="line-clamp-4 whitespace-pre-wrap break-words text-ink">
                    {value}
                  </span>
                }
                actions={actions}
              />
            );
          })}
        </List>
      </section>
      {item.thumbnails.length === 0 ? null : (
        <section aria-label="Thumbnails">
          <SectionHead
            as="h3"
            kicker="Thumbnails · A/B Testing"
            title={`${String(item.thumbnails.length)} ${item.thumbnails.length === 1 ? "thumbnail" : "thumbnails"}`}
            className="mb-3"
          />
          <MediaGrid label="Thumbnails to upload" className="grid-cols-2">
            {item.thumbnails.map((file, index) => (
              <MediaFrame
                key={file.asset}
                src={`${api.origin}${file.url}`}
                alt={`Thumbnail ${String.fromCharCode(65 + index)}`}
                title={String.fromCharCode(65 + index)}
                meta={file.filename}
                actionsShown
                actions={<Download href={`${api.origin}${file.url}`} filename={file.filename} />}
              />
            ))}
          </MediaGrid>
        </section>
      )}
    </div>
  );
}

function copyTextOf(item: PackItem, step: StudioStep): string {
  switch (step) {
    case "title":
      return item.title;
    case "description":
      return item.description;
    case "tags":
      return tagsLine(item.tags);
    case "playlist":
      return item.playlist ?? "";
    default:
      return "";
  }
}
