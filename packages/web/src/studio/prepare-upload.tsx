import {
  type PackItem,
  type StudioStep,
  studioSteps,
  studioUploadUrl,
  tagsLine,
} from "@app/slices/studio/model.js";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CopyIcon, DownloadIcon } from "lucide-react";
import { type ReactNode, useId, useState } from "react";
import { chooseUploadPack, readUploadPack } from "@/api";
import { useApp } from "@/app-context";
import { StatusSlot, type StatusTone } from "@/components/kit/action-bar";
import { Drawer } from "@/components/kit/drawer";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { OpenFolder } from "@/project/open-folder";

// Prepare upload: everything YouTube Studio asks for, in the order it asks, for the video and
// each short, with a Copy and a done tick per step. Fill in YouTube Studio hands the chosen
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
        variant="ghost"
        disabled={!ready}
        title={ready ? undefined : "Available once the video has been made"}
        onClick={() => setOpen(true)}
      >
        Prepare upload
      </Button>
      {open ? <UploadDrawer projectId={projectId} onClose={() => setOpen(false)} /> : null}
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
  tags: "Tags (under Show more)",
};

function itemKey(item: PackItem): string {
  return item.kind === "video" ? "video" : `short-${String(item.short)}`;
}

function UploadDrawer({
  projectId,
  onClose,
}: {
  readonly projectId: string;
  readonly onClose: () => void;
}) {
  const { api } = useApp();
  const pack = useQuery({
    queryKey: ["studio", "pack", projectId],
    queryFn: () => readUploadPack(api, projectId),
  });
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
          <Button
            disabled={item === undefined || fill.isPending}
            onClick={() => {
              if (item === undefined) return;
              // Opened now, inside the click, so the browser doesn't block the new tab.
              window.open(studioUploadUrl, "_blank", "noopener");
              fill.mutate(item);
            }}
          >
            Fill in YouTube Studio
          </Button>
          <StatusSlot tone={status?.tone ?? "info"}>{status?.text}</StatusSlot>
        </>
      }
    >
      {pack.error === null ? null : (
        <p role="alert" className="text-small text-red">
          The upload pack couldn't be read: {pack.error.message}
        </p>
      )}
      {pack.data === undefined ? null : (
        <div className="flex flex-col gap-4">
          <p className="text-small text-ink2">
            In Studio's order. Slopify never publishes: you press Publish in Studio. The Fill in
            button needs the Slopify Studio extension (Settings → YouTube Studio).
          </p>
          {items.length > 1 ? (
            <ToggleGroup
              type="single"
              aria-label="What to upload"
              value={item === undefined ? "" : itemKey(item)}
              onValueChange={(next) => {
                if (next !== "") setChosen(next);
              }}
              className="flex-wrap"
            >
              {items.map((one) => (
                <ToggleGroupItem key={itemKey(one)} value={itemKey(one)}>
                  {one.kind === "video" ? "Video" : `Short ${String(one.short)}`}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          ) : null}
          {pack.data.missing.length === 0 ? null : (
            <ul className="flex flex-col gap-1 text-small text-ink2">
              {pack.data.missing.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          )}
          {item === undefined ? null : (
            <Steps
              key={itemKey(item)}
              projectId={projectId}
              item={item}
              copy={copy}
              doneKey={`slopify.upload.${projectId}.${itemKey(item)}`}
            />
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

function Steps({
  projectId,
  item,
  copy,
  doneKey,
}: {
  readonly projectId: string;
  readonly item: PackItem;
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
  return (
    <ol className="flex flex-col">
      {steps.map((step) => (
        <Step
          key={step}
          label={stepLabels[step]}
          done={done.includes(step)}
          onDone={(on) => tick(step, on)}
          copyText={copyTextOf(item, step)}
          onCopy={(text) => copy(text, stepLabels[step].toLowerCase())}
        >
          {step === "video" ? (
            item.video === null ? (
              <span className="text-ink3">Not made yet.</span>
            ) : (
              <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
                <a
                  href={`${api.origin}${item.video.url}`}
                  download={item.video.filename}
                  className="inline-flex items-center gap-[5px] text-small text-ink2 hover:text-ink"
                >
                  <DownloadIcon aria-hidden="true" className="size-[14px] shrink-0" />
                  {item.video.filename}
                </a>
                <OpenFolder projectId={projectId} asset={item.video.asset} />
              </span>
            )
          ) : step === "thumbnails" ? (
            item.thumbnails.length === 0 ? (
              <span className="text-ink3">None made.</span>
            ) : (
              <span className="flex flex-col gap-1">
                {item.thumbnails.length > 1 ? (
                  <span className="text-ink2">
                    The first under Thumbnail; all {String(item.thumbnails.length)} under Test &
                    compare.
                  </span>
                ) : null}
                <span className="flex flex-wrap gap-x-3 gap-y-1">
                  {item.thumbnails.map((file) => (
                    <a
                      key={file.asset}
                      href={`${api.origin}${file.url}`}
                      download={file.filename}
                      className="inline-flex items-center gap-[5px] text-small text-ink2 hover:text-ink"
                    >
                      <DownloadIcon aria-hidden="true" className="size-[14px] shrink-0" />
                      {file.filename}
                    </a>
                  ))}
                  <OpenFolder
                    projectId={projectId}
                    asset={item.thumbnails[0]?.asset ?? "thumbnail"}
                  />
                </span>
              </span>
            )
          ) : step === "audience" ? (
            "No, it's not made for kids"
          ) : step === "playlist" ? (
            (item.playlist ?? (
              <span className="text-ink3">None set (Settings → YouTube Studio).</span>
            ))
          ) : (
            <span className="line-clamp-4 whitespace-pre-wrap break-words">
              {copyTextOf(item, step) || <span className="text-ink3">Not written yet.</span>}
            </span>
          )}
        </Step>
      ))}
    </ol>
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

function Step({
  label,
  done,
  onDone,
  copyText,
  onCopy,
  children,
}: {
  readonly label: string;
  readonly done: boolean;
  readonly onDone: (on: boolean) => void;
  readonly copyText: string;
  readonly onCopy: (text: string) => void;
  readonly children: ReactNode;
}) {
  const id = useId();
  return (
    <li className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-3 border-b border-line py-3">
      <input
        id={id}
        type="checkbox"
        checked={done}
        onChange={(event) => onDone(event.currentTarget.checked)}
        className="mt-1 size-4"
        aria-label={`${label} done`}
      />
      <div className="flex min-w-0 flex-col gap-1">
        <label htmlFor={id} className="text-small font-semibold text-ink2">
          {label}
        </label>
        <div className="text-small text-ink">{children}</div>
      </div>
      <Button
        type="button"
        variant="ghost"
        disabled={copyText === ""}
        aria-label={`Copy ${label.toLowerCase()}`}
        onClick={() => onCopy(copyText)}
      >
        <CopyIcon aria-hidden="true" className="size-[14px] shrink-0" />
        Copy
      </Button>
    </li>
  );
}
