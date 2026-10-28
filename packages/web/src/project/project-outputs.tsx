import type { RunConfig, Stage } from "@app/slices/admission/model.js";
import type { Output } from "@app/slices/storage/model.js";
import { Link } from "@tanstack/react-router";
import {
  BookOpenTextIcon,
  ChevronDownIcon,
  DownloadIcon,
  FileTextIcon,
  ImageIcon,
  MicIcon,
  PlusIcon,
  VideoIcon,
} from "lucide-react";
import { type ReactElement, type ReactNode, useState } from "react";
import { Button, ButtonRow } from "@/components/kit/button";
import { FileLink, TextLink } from "@/components/kit/link";
import { List, ListRow } from "@/components/kit/list-row";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "@/components/kit/menu";
import { Status } from "@/components/kit/status";
import { cn } from "@/lib/utils";
import { AddOutputDialog, addableChoices } from "./add-output.js";
import { downloadWords } from "./parts.js";
import {
  type ExportFile,
  type OutputKind,
  type ProjectOutput,
  projectOutputs,
} from "./project-outputs-model.js";
import { useReadOnlySample } from "./read-only.js";
import type { RevisionController } from "./revision-controller.js";
import { useCurrentRevisionView, useOutputMedia } from "./revision-media.js";
import { SetDownload } from "./set-download.js";

// Every output the project holds, one row each: a picture of it, its name (which opens its
// section), its state in words and when it was made, its other files named under it as links,
// and its main file as a button. A row that is not current says what to do next. Add another
// output sits at the head of the list.
export function ProjectOutputs({
  projectId,
  revisionId,
  config,
  stages,
  outputs,
  controller,
}: {
  readonly projectId: string;
  readonly revisionId: string | null;
  readonly config: RunConfig;
  readonly stages: readonly Stage[];
  readonly outputs: readonly Output[];
  readonly controller: Pick<RevisionController, "review" | "requestEdit" | "busy">;
}): ReactElement {
  const view = useCurrentRevisionView();
  const [adding, setAdding] = useState(false);
  const states = new Map(
    (view?.outputs ?? [])
      .filter((row) => row.selected)
      .map((row) => [row.output.id, row.available ? row.state : ("missing" as const)] as const),
  );
  const rows = projectOutputs({ config, stages, outputs, states });
  const sample = useReadOnlySample(projectId);
  const addable = addableChoices(config).filter((choice) => choice.refusal === undefined).length;
  // The video's poster is its first thumbnail; a short's, its first picture.
  const poster = (kind: OutputKind): Output | undefined =>
    kind === "video"
      ? outputs.find((output) => output.role === "thumbnail")
      : kind === "shorts"
        ? (outputs.find((output) => output.role === "short_image") ??
          outputs.find((output) => output.role === "thumbnail"))
        : undefined;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="m-0 text-small text-ink-2">
          What this project makes, with each file's state and its downloads.
        </p>
        {/* Only what can be added is counted; a sample adds nothing, and says so at its top. */}
        {sample || addable === 0 ? null : (
          <Button
            variant="secondary"
            disabled={revisionId === null || controller.busy}
            disabledReason={
              revisionId === null
                ? "This project has no saved version yet; wait for its first step to start"
                : "Finish or close the open change first"
            }
            onClick={() => setAdding(true)}
          >
            <PlusIcon aria-hidden="true" strokeWidth={1.75} />
            {`Add an output (${String(addable)} possible)`}
          </Button>
        )}
      </div>
      <List label="All files" className="sl-list--wrap-actions sl-list--wrap-meta">
        {rows.map((row) => (
          <OutputRow key={row.kind} projectId={projectId} row={row} poster={poster(row.kind)} />
        ))}
      </List>
      {adding && revisionId !== null ? (
        <AddOutputDialog
          projectId={projectId}
          revisionId={revisionId}
          config={config}
          controller={controller}
          onClose={() => setAdding(false)}
        />
      ) : null}
    </div>
  );
}

// More than this many other files and the rest go behind one menu that says how many.
const shownFiles = 4;

function OutputRow({
  projectId,
  row,
  poster,
}: {
  readonly projectId: string;
  readonly row: ProjectOutput;
  readonly poster: Output | undefined;
}): ReactElement {
  const inline =
    row.alternatives.length > shownFiles
      ? row.alternatives.slice(0, shownFiles - 1)
      : row.alternatives;
  const rest = row.alternatives.slice(inline.length);
  // A file that is current needs no next step: its title opens its section. Anything else
  // says what to do there.
  const step = row.state === "current" ? undefined : row.next;
  return (
    <ListRow
      lead={<Preview kind={row.kind} output={row.main} poster={poster} />}
      title={
        <Link
          to="/projects/$projectId"
          params={{ projectId }}
          search={{ section: row.section }}
          resetScroll={false}
        >
          {row.title}
        </Link>
      }
      meta={
        <>
          <span className="block truncate">
            <Status tone={row.tone}>{row.stateWords}</Status>
            {row.version === undefined ? null : ` · ${row.version}`}
          </span>
          {inline.length === 0 && rest.length === 0 && step === undefined ? null : (
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-1">
              {inline.map((file) => (
                <FormatLink key={file.output.id} file={file} />
              ))}
              {rest.length === 0 ? null : <OtherFormats files={rest} />}
              {step === undefined ? null : (
                <TextLink
                  to="/projects/$projectId"
                  params={{ projectId }}
                  search={{ section: row.section }}
                  resetScroll={false}
                >
                  {step}
                </TextLink>
              )}
            </span>
          )}
        </>
      }
      actions={
        <ButtonRow>
          {row.set === undefined ? null : (
            <SetDownload
              projectId={projectId}
              set={row.set.set}
              members={row.set.members}
              variant="secondary"
            />
          )}
          {row.primary === undefined ? null : (
            <PrimaryDownload file={row.primary} older={row.state === "older"} />
          )}
        </ButtonRow>
      }
    />
  );
}

function PrimaryDownload({
  file,
  older,
}: {
  readonly file: ExportFile;
  readonly older: boolean;
}): ReactElement | null {
  const media = useOutputMedia(file.output);
  if (media === undefined) return null;
  // Named with its verb like every download button on the page: "Download video (.mp4)",
  // "Download PDF (.pdf)", "Download all 4 images (.zip)".
  const words = downloadWords(file.label);
  return (
    <FileLink
      href={media.url}
      download
      variant="secondary"
      title={older ? `${words}, the previous version` : words}
    >
      <DownloadIcon aria-hidden="true" strokeWidth={1.75} />
      {older ? `${words} · previous version` : words}
    </FileLink>
  );
}

// One of a row's other files, named as what it is: "Captions (.srt)", "Spoken text (.txt)".
function FormatLink({ file }: { readonly file: ExportFile }): ReactElement | null {
  const media = useOutputMedia(file.output);
  if (media === undefined) return null;
  return (
    <a href={media.url} download className="sl-link">
      {file.label}
    </a>
  );
}

// The rest of a long row's files behind one menu that says how many there are.
function OtherFormats({ files }: { readonly files: readonly ExportFile[] }): ReactElement {
  return (
    <Menu modal={false}>
      <MenuTrigger asChild>
        <Button variant="quiet" size="small">
          {`Also: ${String(files.length)} more files`}
          <ChevronDownIcon aria-hidden="true" strokeWidth={1.75} />
        </Button>
      </MenuTrigger>
      <MenuContent>
        {files.map((file) => (
          <FormatItem key={file.output.id} file={file} />
        ))}
      </MenuContent>
    </Menu>
  );
}

function FormatItem({ file }: { readonly file: ExportFile }): ReactElement | null {
  const media = useOutputMedia(file.output);
  if (media === undefined) return null;
  return (
    <MenuItem asChild>
      <a href={media.url} download>
        <DownloadIcon aria-hidden="true" strokeWidth={1.75} className="size-4 text-ink-2" />
        {file.label}
      </a>
    </MenuItem>
  );
}

const icons: Readonly<Record<OutputKind, ReactNode>> = {
  article: <FileTextIcon aria-hidden="true" strokeWidth={1.75} />,
  narration: <MicIcon aria-hidden="true" strokeWidth={1.75} />,
  voices: <MicIcon aria-hidden="true" strokeWidth={1.75} />,
  images: <ImageIcon aria-hidden="true" strokeWidth={1.75} />,
  thumbnails: <ImageIcon aria-hidden="true" strokeWidth={1.75} />,
  video: <VideoIcon aria-hidden="true" strokeWidth={1.75} />,
  shorts: <VideoIcon aria-hidden="true" strokeWidth={1.75} />,
  pdf: <BookOpenTextIcon aria-hidden="true" strokeWidth={1.75} />,
};

// A picture of the output: an image or thumbnail itself, the video's thumbnail and a short's
// first picture as their posters, each recording's length over it; the output's icon when
// there is no picture.
function Preview({
  kind,
  output,
  poster,
}: {
  readonly kind: OutputKind;
  readonly output: Output | undefined;
  readonly poster: Output | undefined;
}): ReactElement {
  const own = output !== undefined && (output.role === "image" || output.role === "thumbnail");
  const picture = useOutputMedia(own ? output : poster);
  const seconds = output?.durationMs ?? null;
  // One frame size for every row, so the names line up; a short's 9:16 poster stands in the
  // middle of it.
  return (
    <span className="relative flex h-14 w-24 shrink-0 items-center justify-center overflow-hidden rounded-control bg-sunken text-ink-2">
      {picture === undefined ? (
        icons[kind]
      ) : (
        <img
          src={picture.url}
          alt=""
          className={cn(
            "object-cover",
            kind === "shorts" ? "aspect-[9/16] h-full w-auto" : "size-full",
          )}
          loading="lazy"
        />
      )}
      {seconds === null ? null : (
        <span className="absolute right-1 bottom-1 rounded-[3px] bg-[rgb(0_0_0/0.7)] px-1 text-[11px] text-white tabular-nums leading-4">
          {length(seconds)}
        </span>
      )}
    </span>
  );
}

function length(ms: number): string {
  const seconds = Math.round(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  return minutes >= 60
    ? `${String(Math.floor(minutes / 60))}h ${String(minutes % 60).padStart(2, "0")}m`
    : `${String(minutes)}:${String(seconds % 60).padStart(2, "0")}`;
}
