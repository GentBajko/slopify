import { platformLabels, type SocialPlatform } from "@app/slices/social/model.js";
import {
  type FillQueueItem,
  type PackItem,
  type StudioStep,
  studioSteps,
  studioUploadUrl,
  tagsLine,
} from "@app/slices/studio/model.js";
import type { Slot } from "@app/slices/studio/releases.js";
import { youtubeTitleProblem } from "@app/slices/youtube/model.js";
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
import { Checkbox, HelpLine, Select } from "@/components/kit/field";
import { Fold } from "@/components/kit/fold";
import { helpScope } from "@/components/kit/info-tip";
import { FileLink, TextLink } from "@/components/kit/link";
import { List, ListRow } from "@/components/kit/list-row";
import { Lightbox, MediaFrame, MediaGrid } from "@/components/kit/media";
import { SectionHead } from "@/components/kit/section-head";
import { Segmented, Switch } from "@/components/kit/switch";
import { OpenFolder } from "@/project/open-folder";
import { projectReleasesKey } from "@/project/release-times";
import { useSampleProject } from "@/project/youtube-sample";
import { keys } from "@/queries";
import { readPostPacks, socialPacksKey } from "@/social/api";
import { PostFillButton, PostPanel } from "@/social/post-panel";
import { fillBlocked } from "@/social/words";
import { ExtensionInstall } from "./extension-install";
import { studioSettingsKey } from "./settings-panel";
import { UploadDone } from "./upload-done";

export const studioQueueKey = ["studio", "queue"] as const;

// Copy for YouTube Studio: everything YouTube Studio asks for, in the order it asks, for the
// video and each short: one row per step with a done tick and a small quiet action (Copy, Open
// folder, Download), the thumbnails under the list, and last "I've uploaded it". Fill in
// YouTube Studio adds the chosen item to what waits for the paired Slopify Studio extension and
// opens Studio's upload page; unpaired, the drawer shows how to install it and the list is the
// whole flow. Slopify never uploads. On a bundled sample it only reads: nothing is saved.
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
        Copy for YouTube Studio
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
  schedule: "Release (Visibility step)",
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
  // The bundled samples read only: their pack is shown and copied, nothing is saved or filled.
  const readOnly = useSampleProject(projectId);
  const [chosen, setChosen] = useState("video");
  const [status, setStatus] = useState<{ text: string; tone: StatusTone } | undefined>();
  // The other sites this project posts to (`slices/social`). A project that posts nowhere, or a
  // Slopify without posting, has none, and the drawer is YouTube's alone.
  const social = useQuery({
    queryKey: socialPacksKey(projectId),
    queryFn: () => readPostPacks(api, projectId),
    retry: false,
  });
  const posts = social.data?.packs ?? [];
  const [where, setWhere] = useState<"youtube" | SocialPlatform>("youtube");
  const post = posts.find((one) => one.platform === where);
  const say = (text: string, tone: StatusTone) => setStatus({ text, tone });
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
      // The same date the YouTube section's Release block and Calendar → Releases show.
      void client.invalidateQueries({ queryKey: projectReleasesKey(projectId) });
      void client.invalidateQueries({ queryKey: keys.studioReleases });
      setStatus({ text: "Saved the release date.", tone: "success" });
    },
    onError: (error) =>
      setStatus({
        text: `Couldn't change the release date: ${error.message} Choose it again.`,
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
      title="Copy for YouTube Studio"
      onClose={onClose}
      footer={
        post !== undefined && social.data !== undefined ? (
          <>
            {/* Until something happens, the slot says why Fill can't be pressed yet. */}
            <StatusSlot tone={status?.tone ?? "warning"} wrap={status === undefined}>
              {status?.text ?? fillBlocked(social.data.extension, post.platform)}
            </StatusSlot>
            <PostFillButton pack={post} extension={social.data.extension} say={say} />
          </>
        ) : (
          <>
            <StatusSlot tone={status?.tone ?? "info"}>{status?.text}</StatusSlot>
            {paired === false && !readOnly ? (
              <FileLink
                href={studioUploadUrl}
                target="_blank"
                rel="noopener noreferrer"
                variant="primary"
              >
                Open YouTube Studio
              </FileLink>
            ) : null}
            {/* Unpaired, there is nothing to fill with: the install fold says how to get it. */}
            {readOnly || paired === false ? null : (
              <Button
                variant="primary"
                disabled={item === undefined || fill.isPending || paired !== true}
                disabledReason={
                  settings.error !== null
                    ? `Couldn't check whether the extension is paired: ${settings.error.message} Close Copy for YouTube Studio and open it again.`
                    : "Wait for the fields to load"
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
            )}
          </>
        )
      }
    >
      <p className="m-0 mb-4 max-w-[var(--measure)] text-ink">
        {readOnly
          ? "Slopify never uploads. This is the read-only sample: copy from it to see how it works, and make your own copy to post your own."
          : paired === true
            ? "Slopify never uploads. It copies each field in the order YouTube Studio asks for them; Fill in YouTube Studio types them in for you with the Slopify Studio extension. You check it and press Publish."
            : "Slopify never uploads. It copies each field in the order YouTube Studio asks for them. You paste them into Studio's upload dialog, check it and press Publish."}
      </p>
      {posts.length === 0 ? null : (
        <Segmented
          label="Where"
          value={post === undefined ? "youtube" : post.platform}
          onChange={(next) => {
            setWhere(next);
            setStatus(undefined);
          }}
          help="Each site has its own post: its words, pictures or video, and its Fill button."
          options={[
            { value: "youtube" as const, label: "YouTube" },
            ...posts.map((one) => ({ value: one.platform, label: platformLabels[one.platform] })),
          ]}
          className="mb-5 flex-wrap self-start"
        />
      )}
      {post === undefined ? null : (
        <div className="flex flex-col gap-5">
          <PostPanel key={post.platform} pack={post} say={say} />
          <Callout title="Slopify never posts.">
            {`Fill in ${platformLabels[post.platform]} hands this post to the Slopify Studio extension, which fills ${platformLabels[post.platform]}'s own post form. You check it and press Post.`}
          </Callout>
        </div>
      )}
      {post !== undefined || pack.error === null ? null : (
        <Callout tone="danger" title="The fields for YouTube Studio couldn't be read.">
          {`${pack.error.message} Close Copy for YouTube Studio and open it again.`}
        </Callout>
      )}
      {post !== undefined || pack.data === undefined ? null : (
        <div className="flex flex-col gap-5">
          {paired === false && !readOnly ? (
            <Fold summary="Install the Slopify Studio extension" state="fills Studio in for you">
              <ExtensionInstall />
            </Fold>
          ) : null}
          {items.length > 1 ? (
            <Segmented
              label="What to upload"
              value={item === undefined ? "" : itemKey(item)}
              onChange={setChosen}
              help="Each one is uploaded on its own, with its own title, description and tags."
              options={items.map((one) => ({
                value: itemKey(one),
                label: one.kind === "video" ? "Video" : `Short ${String(one.short)}`,
              }))}
              className="self-start"
            />
          ) : null}
          {pack.data.missing.length === 0 ? null : (
            <Callout tone="waiting" title="Before you upload">
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
                item.kind === "video" && pack.data.footage !== undefined && !readOnly ? (
                  <Switch
                    checked={footage.isPending ? footage.variables : pack.data.footage.real}
                    disabled={footage.isPending}
                    onChange={(next) => footage.mutate(next)}
                    help="Changes the AI use answer above; nothing in the video changes."
                    label={`The ${pack.data.footage.clips === 1 ? "uploaded clip is" : `${String(pack.data.footage.clips)} uploaded clips are`} real footage (filmed, not made by AI)`}
                  />
                ) : undefined
              }
              playlistPicker={
                pack.data.playlistChoices.length > 1 && !readOnly ? (
                  <span className="flex flex-col gap-1">
                    {pack.data.playlistChoices.map((choice) => (
                      <label key={choice.name} className="flex min-h-8 items-center gap-2">
                        <Checkbox
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
              {...(readOnly ? {} : { onPick: (next) => pick.mutate(next) })}
              releaseLink={
                <TextLink
                  to="/projects/$projectId"
                  params={{ projectId }}
                  search={{ section: "youtube" }}
                  onClick={onClose}
                >
                  Release in the project's YouTube section
                </TextLink>
              }
              slotPicker={
                item.kind !== "video" ||
                readOnly ||
                ((pack.data.slotChoices ?? []).length === 0 &&
                  pack.data.schedule === undefined) ? undefined : (
                  <span className="flex items-center gap-1">
                    <Select
                      aria-label="Release date"
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
                        { value: "", label: "No date (set it in Studio yourself)" },
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
                  </span>
                )
              }
              picking={pick.isPending}
              doneKey={`slopify.upload.${projectId}.${itemKey(item)}`}
            />
          )}
          {item === undefined || readOnly ? null : (
            <UploadDone
              key={`uploaded-${itemKey(item)}`}
              projectId={projectId}
              short={item.kind === "video" ? null : (item.short ?? null)}
            />
          )}
          {(queue.data ?? []).length === 0 ? null : (
            <section aria-label="Waiting for Studio">
              <div className="sl-kicker">Waiting for Studio</div>
              <HelpLine className="mb-2">
                Each upload dialog you open in Studio is filled with the first one, which then
                leaves the list.
              </HelpLine>
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
  releaseLink,
  doneKey,
}: {
  readonly projectId: string;
  readonly item: PackItem;
  // The AI use step's "real footage" switch, for a video with uploaded clips.
  readonly footageSwitch?: ReactNode;
  // The channel's playlists to tick for this project, when it has more than one.
  readonly playlistPicker?: ReactNode;
  readonly copy: (text: string, what: string) => void;
  // Which title and thumbnail the upload carries (indexes in the project's own order); absent
  // where nothing may be saved (the sample), which shows the pick without changing it.
  readonly onPick?: (pick: { readonly title: number; readonly thumbnail: number }) => void;
  readonly picking: boolean;
  // The posting plan's free times for the video's release (the shorts follow it).
  readonly slotPicker?: ReactNode;
  // Where the release date is set when it has none: the project's YouTube section.
  readonly releaseLink: ReactNode;
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
  // Copy only where there is something to copy; the row says when there isn't.
  const copyAction = (step: StudioStep) => {
    const text = copyTextOf(item, step);
    if (text === "") return undefined;
    return (
      <Button
        variant="quiet"
        size="small"
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
        return item.titles.length === 0 || item.pickable === undefined || onPick === undefined
          ? {
              value: (
                <span className="flex flex-col gap-1">
                  <span>{copyTextOf(item, step)}</span>
                  <TitleProblem title={item.title} />
                </span>
              ),
              actions: copyAction(step),
            }
          : {
              value: (
                <span className="flex flex-col gap-1">
                  <TitleProblem title={item.title} />
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
                {item.scheduleAt === undefined ? (
                  <>No date yet. Set one under {releaseLink}, or pick it in Studio yourself.</>
                ) : (
                  `Goes public ${slotTime(item.scheduleAt)}, your time. In Studio's Visibility step pick Schedule and enter it; the Slopify Studio extension types it in for you.`
                )}
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
              <span className="text-ink-3">None set (Settings → YouTube Studio and posting).</span>
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
      <section aria-label="In the order Studio asks" {...helpScope}>
        <div className="flex items-center gap-1">
          <div className="sl-kicker">In the order Studio asks</div>
          <span className="flex-1" />
          <label className="flex min-h-8 cursor-pointer items-center gap-2 text-small text-ink-2">
            <Checkbox
              checked={ticked === steps.length}
              ref={(box) => {
                if (box !== null) box.indeterminate = ticked > 0 && ticked < steps.length;
              }}
              onChange={(event) => remember(event.currentTarget.checked ? [...steps] : [])}
              className="shrink-0"
            />
            Select all
          </label>
        </div>
        <HelpLine className="mb-2">
          Tick each step as you go. The ticks are a note to yourself, kept in this browser only.
        </HelpLine>
        <List label="Upload steps" className="sl-list--wrap-actions">
          {steps.map((step) => {
            const { value, actions } = contentOf(step);
            return (
              <ListRow
                key={step}
                className="items-start"
                lead={
                  <Checkbox
                    checked={done.includes(step)}
                    onChange={(event) => tick(step, event.currentTarget.checked)}
                    className="mt-1 shrink-0 self-start"
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
                  actions={
                    <>
                      {chosen || item.pickable === undefined || onPick === undefined ? null : (
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

// Why YouTube would refuse the title the upload carries, and where to change it.
function TitleProblem({ title }: { readonly title: string }): ReactNode {
  const problem = youtubeTitleProblem(title);
  return problem === undefined ? null : (
    <span role="alert" className="text-danger">
      {`${problem} Change it under Other titles in the project's YouTube section, or rename the project, then open Copy for YouTube Studio again.`}
    </span>
  );
}
