import type { ProjectSummary, Stage } from "@app/slices/admission/model.js";
import type { Output } from "@app/slices/storage/model.js";
import { useQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useApp } from "@/app-context";
import { type Aspect, MediaFrame, MediaGrid } from "@/components/kit/media";
import { SectionHead } from "@/components/kit/section-head";
import { StageLamp } from "@/components/lamp";
import { Rail, RailGroup } from "@/components/rail";
import { peaksKey, readPeaks } from "@/onboarding/api";
import { frameAspect } from "./body-images.js";
import { LiveWriting } from "./live-writing.js";
import { useOutputMedia } from "./revision-media.js";

const stageNames: Readonly<Record<Stage["kind"], string>> = {
  research: "Research",
  article: "Article",
  audio: "Narration",
  images: "Images",
  thumbnail: "Thumbnail",
  video: "Video",
  document: "Document",
};

// Watching the project build: the steps and where each stands, the article as it is written,
// the images as they land and the narration's waveform growing piece by piece. Everything here
// is fed by the project page's event stream; nothing on it starts or changes work.
export function LiveBuild({
  project,
  revisionId,
  stages,
  outputs,
}: {
  readonly project: ProjectSummary;
  readonly revisionId: string | null;
  readonly stages: readonly Stage[];
  readonly outputs: readonly Output[];
}): ReactElement {
  const images = outputs.filter((output) => output.role === "image");
  return (
    <div className="grid min-w-0 gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
      <div className="min-w-0">
        <SectionHead title="Steps" />
        <RailGroup>
          {stages
            .filter((stage) => stage.state !== "skipped")
            .map((stage) => (
              <Rail key={stage.id} className="justify-between">
                <span className="font-semibold">{stageNames[stage.kind]}</span>
                <StageLamp label={stageNames[stage.kind]} state={stage.state} />
              </Rail>
            ))}
        </RailGroup>
      </div>
      <div className="min-w-0">
        <SectionHead title="Article" />
        <LiveWriting projectId={project.id} stage="article" className="mb-6" />
        <SectionHead title="Narration" />
        <Waveform projectId={project.id} revisionId={revisionId} />
        <SectionHead title="Images" />
        {images.length === 0 ? (
          <p className="text-small text-ink-2">The images appear here as each one is drawn.</p>
        ) : (
          <MediaGrid list density="compact" label="Images so far">
            {images.map((image) => (
              <LiveImage key={image.id} output={image} aspect={frameAspect(project.format)} />
            ))}
          </MediaGrid>
        )}
      </div>
    </div>
  );
}

function LiveImage({
  output,
  aspect,
}: {
  readonly output: Output;
  readonly aspect: Aspect;
}): ReactElement | null {
  const media = useOutputMedia(output);
  if (media === undefined) return null;
  const number = output.meta.index === undefined ? "" : ` ${String(output.meta.index)}`;
  return (
    <li className="min-w-0">
      <MediaFrame
        src={media.url}
        alt={output.meta.prompt ?? `Image${number}`}
        aspect={aspect}
        {...(output.meta.index === undefined ? {} : { meta: `#${String(output.meta.index)}` })}
      />
    </li>
  );
}

// ceiling: bars drawn; a longer narration is folded into this many so the row stays one line.
const bars = 240;

function Waveform({
  projectId,
  revisionId,
}: {
  readonly projectId: string;
  readonly revisionId: string | null;
}): ReactElement {
  const { api } = useApp();
  const peaks = useQuery({
    queryKey: peaksKey(projectId, revisionId),
    queryFn: () => readPeaks(api, projectId),
    enabled: revisionId !== null,
  });
  const all = (peaks.data?.pieces ?? []).flatMap((piece) => piece.peaks);
  const seconds = (peaks.data?.pieces ?? []).reduce((sum, piece) => sum + piece.seconds, 0);
  const step = Math.max(1, Math.ceil(all.length / bars));
  const folded: number[] = [];
  for (let at = 0; at < all.length; at += step) folded.push(Math.max(...all.slice(at, at + step)));
  return (
    <div className="mb-6">
      <div
        role="img"
        aria-label={
          folded.length === 0
            ? "No narration yet"
            : `Narration so far: ${String(Math.round(seconds))} seconds`
        }
        className="flex h-16 items-center gap-px overflow-hidden rounded-control border border-line bg-raised px-2"
      >
        {folded.map((value, index) => (
          <span
            // biome-ignore lint/suspicious/noArrayIndexKey: bars are positional and never reorder.
            key={index}
            className="w-[3px] shrink-0 rounded-full bg-accent"
            style={{ height: `${String(Math.max(4, Math.round(value * 100)))}%` }}
          />
        ))}
      </div>
      <p className="mt-1 text-label text-ink-3">
        {peaks.error
          ? peaks.error.message
          : folded.length === 0
            ? "The waveform grows as each part of the narration is spoken."
            : `${String(Math.round(seconds))} s narrated${peaks.data !== undefined && "complete" in peaks.data && peaks.data.complete ? "" : " so far"}`}
      </p>
    </div>
  );
}
