import {
  type FillQueueItem,
  type PackItem,
  type StudioStep,
  studioSteps,
  studioUploadUrl,
  tagsLine,
} from "@app/slices/studio/model.js";
import type { Slot } from "@app/slices/studio/releases.js";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CopyIcon, DownloadIcon } from "lucide-react";
import { type ReactNode, useState } from "react";
import {
  chooseUploadPack,
  readStudioQueue,
  readStudioSettings,
  readUploadPack,
  removeFromStudioQueue,
  saveProjectPlaylists,
  saveRealFootage,
  saveUploadPick,
  saveUploadSlot,
} from "@/api";
import { useApp } from "@/app-context";
import { StatusSlot, type StatusTone } from "@/components/kit/action-bar";
import { Button } from "@/components/kit/button";
import { Callout } from "@/components/kit/callout";
import { Drawer } from "@/components/kit/drawer";
import { Select } from "@/components/kit/field";
import { helpScope, InfoTip } from "@/components/kit/info-tip";
import { FileLink } from "@/components/kit/link";
import { List, ListRow } from "@/components/kit/list-row";
import { Lightbox, MediaFrame, MediaGrid } from "@/components/kit/media";
import { SectionHead } from "@/components/kit/section-head";
import { Segmented, Switch } from "@/components/kit/switch";
import { OpenFolder } from "@/project/open-folder";
import { ExtensionInstall } from "./extension-install";
import { studioSettingsKey } from "./settings-panel";

export const studioQueueKey = ["studio", "queue"] as const;

// Prepare upload: everything YouTube Studio asks for, in the order it asks, for the video and
// each short: one row per step with a done tick and a small quiet action (Copy, Open folder,
// Download), the thumbnails under the list. Fill in YouTube Studio adds the chosen item to what
// waits for the paired Slopify Studio extension and opens Studio's upload page; unpaired, the
// drawer shows how to install it and the list is the whole flow. Slopify never publishes.
export function PrepareUpload({
  projectId,
  ready,
  variant = "secondary",
  size = "default",
}: {
  readonly projectId: string;
  // A finished video is there to upload.
  readonly ready: boolean;
  // Primary where it is the item's one thing to do next; a real button either way.
  readonly variant?: "primary" | "secondary";
  readonly size?: "default" | "small";
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        variant={variant}
        size={size}
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
  schedule: "Schedule (Visibility)",
};

// "Sun 5 Oct, 20:00" in this browser's time zone, as Studio's schedule shows it to you.
function slotTime(iso: string): string {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

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
  // Whether an extension is paired: without one, Fill in YouTube Studio would hand the item to
  // nothing, so the drawer shows how to install it and the steps are the whole flow.
  const settings = useQuery({
    queryKey: studioSettingsKey,
    queryFn: () => readStudioSettings(api),
  });
  const paired = settings.data === undefined ? undefined : settings.data.pairing.origin !== null;
  const queue = useQuery({ queryKey: studioQueueKey, queryFn: () => readStudioQueue(api) });
  const fill = useMutation({
    mutationFn: (target: PackItem) => chooseUploadPack(api, projectId, target.short),
    onSuccess: (waiting) => {
      client.setQueryData(studioQueueKey, waiting);
      setStatus({
        text:
          waiting.length > 1
            ? `Added; ${String(waiting.length)} uploads are waiting. Studio is opening: each upload you start there is filled with the next one, in the order under Waiting for Studio. Check everything and publish yourself.`
            : "Studio is opening. The Slopify Studio extension puts the video into its upload dialog and fills in the details. Check everything and publish yourself.",
        tone: "success",
      });
    },
    onError: (error) =>
      setStatus({
        text: `Couldn't hand this to the extension: ${error.message}`,
        tone: "error",
      }),
  });
  const remove = useMutation({
    mutationFn: (entry: FillQueueItem) => removeFromStudioQueue(api, entry.projectId, entry.short),
    onSuccess: (waiting) => client.setQueryData(studioQueueKey, waiting),
    onError: (error) =>
      setStatus({
        text: `Couldn't remove it from Waiting for Studio: ${error.message} Press Remove again.`,
        tone: "error",
      }),
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
  const playlists = useMutation({
    mutationFn: (names: readonly string[]) => saveProjectPlaylists(api, projectId, names),
    onSuccess: (saved) => {
      client.setQueryData(packKey, saved);
      setStatus({ text: "Saved this project's playlists.", tone: "success" });
    },
    onError: (error) =>
      setStatus({
        text: `Couldn't save the playlists: ${error.message} Tick the playlist again.`,
        tone: "error",
      }),
  });
  const slot = useMutation({
    mutationFn: (next: Slot | null) => saveUploadSlot(api, projectId, next),
    onSuccess: (saved) => {
      client.setQueryData(packKey, saved);
      setStatus({ text: "Saved when this project goes out.", tone: "success" });
    },
    onError: (error) =>
      setStatus({
        text: `Couldn't change the slot: ${error.message} Choose it again.`,
        tone: "error",
      }),
  });
  const pick = useMutation({
    mutationFn: (next: { readonly title: number; readonly thumbnail: number }) =>
      saveUploadPick(api, projectId, next),
    onSuccess: (saved) => {
      client.setQueryData(packKey, saved);
      setStatus({ text: "Saved what the upload uses.", tone: "success" });
    },
    onError: (error) =>
      setStatus({
        text: `Couldn't save the choice: ${error.message} Choose it again.`,
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
          {paired === false ? (
            <FileLink
              href={studioUploadUrl}
              target="_blank"
              rel="noopener noreferrer"
              variant="secondary"
            >
              Open YouTube Studio
            </FileLink>
          ) : null}
          <Button
            variant="primary"
            disabled={item === undefined || fill.isPending || paired !== true}
            disabledReason={
              paired === false
                ? "Install and pair the Slopify Studio extension first (steps above)"
                : settings.error !== null
                  ? `Couldn't check whether the extension is paired: ${settings.error.message} Close Prepare upload and open it again.`
                  : "Wait for the upload pack to load"
            }
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
          {paired === false ? (
            <Callout tone="waiting" title="The Slopify Studio extension isn't paired.">
              <div className="flex flex-col gap-3">
                <p className="m-0">
                  Without it, the steps below are the upload pack: copy each into Studio's upload
                  dialog. To have Studio filled in for you, install the extension:
                </p>
                <ExtensionInstall />
              </div>
            </Callout>
          ) : null}
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
              playlistPicker={
                pack.data.playlistChoices.length > 1 ? (
                  <span className="flex flex-col gap-1">
                    {pack.data.playlistChoices.map((choice) => (
                      <label key={choice.name} className="flex min-h-8 items-center gap-2">
                        <input
                          type="checkbox"
                          className="size-4 accent-[var(--color-accent)]"
                          checked={choice.chosen}
                          disabled={playlists.isPending}
                          onChange={(event) => {
                            const on = event.currentTarget.checked;
                            playlists.mutate(
                              pack.data.playlistChoices
                                .filter((one) => (one.name === choice.name ? on : one.chosen))
                                .map((one) => one.name),
                            );
                          }}
                        />
                        {choice.name}
                      </label>
                    ))}
                  </span>
                ) : undefined
              }
              copy={copy}
              onPick={(next) => pick.mutate(next)}
              slotPicker={
                item.kind !== "video" ? undefined : (
                  <span className="flex items-center gap-1" {...helpScope}>
                    <Select
                      aria-label="Posting plan slot"
                      value={
                        pack.data.schedule === undefined
                          ? ""
                          : `${pack.data.schedule.row}|${pack.data.schedule.longAt}`
                      }
                      disabled={slot.isPending}
                      onChange={(event) => {
                        const [row, longAt] = event.currentTarget.value.split("|");
                        slot.mutate(
                          row === undefined || longAt === undefined ? null : { row, longAt },
                        );
                      }}
                      options={[
                        { value: "", label: "Not scheduled (set it in Studio yourself)" },
                        ...(pack.data.schedule === undefined
                          ? []
                          : [
                              {
                                value: `${pack.data.schedule.row}|${pack.data.schedule.longAt}`,
                                label: slotTime(pack.data.schedule.longAt),
                              },
                            ]),
                        ...(pack.data.slotChoices ?? []).map((one) => ({
                          value: `${one.row}|${one.longAt}`,
                          label: slotTime(one.longAt),
                        })),
                      ]}
                    />
                    <InfoTip id="project.upload.slot" />
                  </span>
                )
              }
              picking={pick.isPending}
              doneKey={`slopify.upload.${projectId}.${itemKey(item)}`}
            />
          )}
          {(queue.data ?? []).length === 0 ? null : (
            <section aria-label="Waiting for Studio">
              <div className="mb-2 flex items-center gap-1">
                <div className="sl-kicker">Waiting for Studio</div>
                <InfoTip id="project.upload.queue" className="-my-1" />
              </div>
              <List label="Waiting to be filled">
                {(queue.data ?? []).map((entry, index) => {
                  const what = entry.short === null ? "Video" : `Short ${String(entry.short)}`;
                  return (
                    <ListRow
                      key={`${entry.projectId}-${String(entry.short)}`}
                      title={`${entry.projectTitle} · ${what}`}
                      meta={
                        index === 0
                          ? "Next: filled in the next upload dialog you open in Studio."
                          : `Filled after ${String(index)} more upload${index === 1 ? "" : "s"}.`
                      }
                      actions={
                        <Button
                          variant="quiet"
                          size="small"
                          disabled={remove.isPending}
                          aria-label={`Remove ${entry.projectTitle} ${what.toLowerCase()} from Waiting for Studio`}
                          onClick={() => remove.mutate(entry)}
                        >
                          Remove
                        </Button>
                      }
                    />
                  );
                })}
              </List>
            </section>
          )}
          <Callout title="Slopify never publishes.">
            {paired === false
              ? "Copy each step into Studio's upload dialog (Open YouTube Studio), check it and press Publish yourself."
              : "Fill in YouTube Studio hands this to the Slopify Studio extension, which puts the video into Studio's upload dialog and fills in the details. You check it and press Publish."}
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

// The video file's download: a small secondary button beside its one Open folder.
function Download({ href, filename }: { readonly href: string; readonly filename: string }) {
  return (
    <FileLink
      href={href}
      download={filename}
      aria-label={`Download ${filename}`}
      variant="secondary"
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
  playlistPicker,
  copy,
  onPick,
  picking,
  slotPicker,
  doneKey,
}: {
  readonly projectId: string;
  readonly item: PackItem;
  // The AI use step's "real footage" switch, for a video with uploaded clips.
  readonly footageSwitch?: ReactNode;
  // The channel's playlists to tick for this project, when it has more than one.
  readonly playlistPicker?: ReactNode;
  readonly copy: (text: string, what: string) => void;
  // Which title and thumbnail the upload carries (indexes in the project's own order).
  readonly onPick: (pick: { readonly title: number; readonly thumbnail: number }) => void;
  readonly picking: boolean;
  // The posting plan's slot for the video (the shorts follow it).
  readonly slotPicker?: ReactNode;
  // Where this browser remembers the ticks; a tick is a note to self, not project state.
  readonly doneKey: string;
}) {
  const { api } = useApp();
  const [done, setDone] = useState<readonly string[]>(() => readDone(doneKey));
  const [openThumbnail, setOpenThumbnail] = useState<number | null>(null);
  const remember = (next: readonly string[]) => {
    setDone(next);
    try {
      localStorage.setItem(doneKey, JSON.stringify(next));
    } catch {
      // Not remembered in this browser; the tick still shows until the drawer closes.
    }
  };
  const tick = (step: StudioStep, on: boolean) =>
    remember(on ? [...done, step] : done.filter((one) => one !== step));
  // Shorts have no thumbnail step: Studio picks a frame of a short.
  const steps = studioSteps.filter((step) => step !== "thumbnails" || item.kind === "video");
  const ticked = steps.filter((step) => done.includes(step)).length;
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
                  <Download
                    href={`${api.origin}${item.video.url}`}
                    filename={item.video.filename}
                  />
                  <OpenFolder projectId={projectId} asset={item.video.asset} size="small" />
                </>
              ),
            };
      case "thumbnails":
        return item.thumbnails.length === 0
          ? { value: <span className="text-ink-3">None made.</span> }
          : {
              value:
                item.thumbnails.length > 1
                  ? `${letterOf(item.pickable?.thumbnail ?? 0)} under Thumbnail (choose below). The A/B test tries all ${String(item.thumbnails.length)} once the video is public.`
                  : (item.thumbnails[0]?.filename ?? ""),
              actions: (
                <OpenFolder
                  projectId={projectId}
                  asset={item.thumbnails[0]?.asset ?? "thumbnail"}
                  size="small"
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
      case "title":
        return item.titles.length === 0 || item.pickable === undefined
          ? { value: copyTextOf(item, step), actions: copyAction(step) }
          : {
              value: (
                <span className="flex flex-col gap-1">
                  <span
                    role="radiogroup"
                    aria-label="Title the upload uses"
                    className="flex flex-col gap-1"
                  >
                    {item.pickable.titles.map((one, index) => (
                      <label key={one} className="flex min-h-8 items-center gap-2">
                        <input
                          type="radio"
                          name={`upload-title-${projectId}`}
                          className="size-4 accent-[var(--color-accent)]"
                          checked={index === item.pickable?.title}
                          disabled={picking}
                          onChange={() =>
                            onPick({ title: index, thumbnail: item.pickable?.thumbnail ?? 0 })
                          }
                        />
                        {one}
                      </label>
                    ))}
                  </span>
                  <span className="text-ink-2">
                    The upload uses the chosen title; the A/B test tries the others beside it once
                    the video is public.
                  </span>
                </span>
              ),
              actions: (
                <>
                  {copyAction(step)}
                  <Button
                    variant="quiet"
                    size="small"
                    aria-label="Copy the other titles"
                    onClick={() => copy(item.titles.join("\n"), "other titles")}
                  >
                    <CopyIcon aria-hidden="true" className="size-4 shrink-0" strokeWidth={1.75} />
                    Copy others
                  </Button>
                </>
              ),
            };
      case "schedule":
        return {
          value: (
            <span className="flex flex-col gap-1">
              {slotPicker}
              <span className="text-ink-2">
                {item.scheduleAt === undefined
                  ? "Not scheduled: Slopify has no slot for it. Set the date in Studio's Visibility step."
                  : `${slotTime(item.scheduleAt)}, your time. The extension types it into Studio's Visibility step; you press Schedule.`}
              </span>
            </span>
          ),
        };
      case "playlist":
        return {
          value:
            playlistPicker ??
            (item.playlists.length > 0 ? (
              item.playlists.join(", ")
            ) : (
              <span className="text-ink-3">None set (Settings → YouTube Studio).</span>
            )),
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
          <span className="flex-1" />
          <label className="flex min-h-8 cursor-pointer items-center gap-2 text-small text-ink-2">
            <input
              type="checkbox"
              checked={ticked === steps.length}
              ref={(box) => {
                if (box !== null) box.indeterminate = ticked > 0 && ticked < steps.length;
              }}
              onChange={(event) => remember(event.currentTarget.checked ? [...steps] : [])}
              className="size-4 shrink-0 accent-[var(--color-accent)]"
            />
            Select all
          </label>
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
          <MediaGrid label="Thumbnails to upload" density="compact">
            {(item.pickable?.thumbnails ?? item.thumbnails).map((file, index) => {
              const chosen = index === (item.pickable?.thumbnail ?? 0);
              return (
                <MediaFrame
                  key={file.asset}
                  src={`${api.origin}${file.url}`}
                  alt={`Thumbnail ${letterOf(index)}`}
                  title={
                    chosen && item.thumbnails.length > 1
                      ? `${letterOf(index)} · upload`
                      : letterOf(index)
                  }
                  meta={file.filename}
                  onOpen={() => setOpenThumbnail(index)}
                  openLabel={`Open thumbnail ${letterOf(index)} full size`}
                  actionsShown
                  actions={
                    <>
                      {chosen || item.pickable === undefined ? null : (
                        <Button
                          variant="quiet"
                          size="small"
                          disabled={picking}
                          onClick={() =>
                            onPick({ title: item.pickable?.title ?? 0, thumbnail: index })
                          }
                        >
                          Use for upload
                        </Button>
                      )}
                      <Download href={`${api.origin}${file.url}`} filename={file.filename} />
                    </>
                  }
                />
              );
            })}
          </MediaGrid>
          <Lightbox
            items={(item.pickable?.thumbnails ?? item.thumbnails).map((file, index) => ({
              src: `${api.origin}${file.url}`,
              alt: `Thumbnail ${String.fromCharCode(65 + index)}`,
              caption: file.filename,
            }))}
            index={openThumbnail}
            onIndex={setOpenThumbnail}
            onClose={() => setOpenThumbnail(null)}
            actions={(_, index) => {
              const file = (item.pickable?.thumbnails ?? item.thumbnails)[index];
              return file === undefined ? null : (
                <Download href={`${api.origin}${file.url}`} filename={file.filename} />
              );
            }}
          />
        </section>
      )}
    </div>
  );
}

// "A", "B", "C": a thumbnail as Studio's A/B Testing and this page name it.
function letterOf(index: number): string {
  return String.fromCharCode(65 + index);
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
      return item.playlists.join(", ");
    default:
      return "";
  }
}
