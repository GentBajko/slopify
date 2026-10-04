import type { RunConfig, Stage } from "@app/slices/admission/model.js";
import type { Output } from "@app/slices/storage/model.js";
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
import { AddOutputDialog } from "./add-output.js";
import {
  type ExportFile,
  type OutputKind,
  type ProjectOutput,
  projectOutputs,
} from "./project-outputs-model.js";
import type { RevisionController } from "./revision-controller.js";
import { useCurrentRevisionView, useOutputMedia } from "./revision-media.js";
import { SetDownload } from "./set-download.js";

// Every output the project holds, one row each: a preview, its state in words, which source
// version it was made from, its main export with the other formats in a menu beside it, and
// a link to its section for the next step. Add another output sits at the head of the list.
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
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="m-0 text-small text-ink-2">
          What this project makes, with each file's state and its downloads.
        </p>
        <Button
          variant="secondary"
          disabled={revisionId === null || controller.busy}
          disabledReason={
            revisionId === null
              ? "This project has no saved version yet; wait for its first step to start"
              : "Finish or close the open edit or remake first"
          }
          onClick={() => setAdding(true)}
        >
          <PlusIcon aria-hidden="true" strokeWidth={1.75} />
          Add another output
        </Button>
      </div>
      <List label="Outputs">
        {rows.map((row) => (
          <OutputRow key={row.kind} projectId={projectId} row={row} />
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

function OutputRow({
  projectId,
  row,
}: {
  readonly projectId: string;
  readonly row: ProjectOutput;
}): ReactElement {
  return (
    <ListRow
      lead={<Preview kind={row.kind} output={row.main} />}
      title={row.title}
      meta={
        <>
          <Status tone={row.tone}>{row.stateWords}</Status>
          {row.version === undefined ? null : <span>{` · ${row.version}`}</span>}
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
          {row.alternatives.length === 0 ? null : <OtherFormats files={row.alternatives} />}
        </ButtonRow>
      }
    >
      <TextLink
        to="/projects/$projectId"
        params={{ projectId }}
        search={{ section: row.section }}
        resetScroll={false}
        className="text-small"
      >
        {row.next}
      </TextLink>
    </ListRow>
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
  return (
    <FileLink
      href={media.url}
      download
      variant="secondary"
      title={older ? `${file.label}, the previous version` : file.label}
    >
      <DownloadIcon aria-hidden="true" strokeWidth={1.75} />
      {older ? `${file.label} · previous version` : file.label}
    </FileLink>
  );
}

// The other formats of one output behind one quiet menu: subtitles beside the video, plain text
// and the PDF beside the Markdown.
function OtherFormats({ files }: { readonly files: readonly ExportFile[] }): ReactElement {
  return (
    <Menu modal={false}>
      <MenuTrigger asChild>
        <Button variant="quiet">
          Other formats
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

// A picture where the output has one (an image, a thumbnail), the length of a recording, and
// the output's icon otherwise.
function Preview({
  kind,
  output,
}: {
  readonly kind: OutputKind;
  readonly output: Output | undefined;
}): ReactElement {
  const media = useOutputMedia(output);
  const picture = output !== undefined && (output.role === "image" || output.role === "thumbnail");
  return (
    <span className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-control bg-sunken text-ink-2">
      {picture && media !== undefined ? (
        <img src={media.url} alt="" className="size-full object-cover" loading="lazy" />
      ) : output?.durationMs !== null && output?.durationMs !== undefined ? (
        <span className="text-small tabular-nums">{length(output.durationMs)}</span>
      ) : (
        icons[kind]
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
