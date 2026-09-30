import type { ProjectSummary, Stage } from "@app/slices/admission/model.js";
import type { Output } from "@app/slices/storage/model.js";
import { useQuery } from "@tanstack/react-query";
import { type ReactElement, use } from "react";
import { useApp } from "@/app-context";
import { Button } from "@/components/kit/button";
import { type Aspect, MediaFrame, MediaGrid } from "@/components/kit/media";
import { SectionHead } from "@/components/kit/section-head";
import { peaksKey, readPeaks } from "@/onboarding/api";
import { frameAspect } from "./body-images.js";
import { OpenProjectTab } from "./fix-it.js";
import { LiveAudio } from "./live-audio.js";
import { LiveWriting } from "./live-writing.js";
import { useOutputMedia } from "./revision-media.js";
import { workDuration } from "./run-cost.js";
import { WaveAudioPlayer } from "./waveform.js";

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
  // In the order they are shown, not the order they happened to land in.
  const images = outputs
    .filter((output) => output.role === "image")
    .sort((a, b) => (a.meta.index ?? 0) - (b.meta.index ?? 0));
  const article = stages.find((stage) => stage.kind === "article");
  const openTab = use(OpenProjectTab);
  // The steps are in the status rail beside this; here is what they make.
  return (
    <div className="flex min-w-0 flex-col">
      <div className="min-w-0">
        <SectionHead title="Article" />
        {article?.state === "running" ? (
          <LiveWriting projectId={project.id} stage="article" className="mb-6" />
        ) : article?.state === "done" ? (
          <p className="mb-6 flex flex-wrap items-center gap-3 text-small text-ink-2">
            The article is written.
            {openTab === undefined ? null : (
              <Button variant="secondary" size="small" onClick={() => openTab("output")}>
                Read it
              </Button>
            )}
          </p>
        ) : (
          <p className="mb-6 text-small text-ink-2">
            {article === undefined || article.state === "skipped"
              ? "This project has no article."
              : "The article appears here as it is written."}
          </p>
        )}
        <SectionHead title="Narration" />
        <LiveNarration
          projectId={project.id}
          revisionId={revisionId}
          audio={stages.find((stage) => stage.kind === "audio")}
          outputs={outputs}
        />
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

// Narration in Live: while it is spoken, the waveform growing and the parts so far to play;
// once it is done, the body narration's own player (the levelled join when Level the volume is
// on, which is what the video plays).
function LiveNarration({
  projectId,
  revisionId,
  audio,
  outputs,
}: {
  readonly projectId: string;
  readonly revisionId: string | null;
  readonly audio: Stage | undefined;
  readonly outputs: readonly Output[];
}): ReactElement {
  const body =
    outputs.find((output) => output.role === "audio_levelled" && output.meta.segment === "body") ??
    outputs.find((output) => output.role === "audio_body");
  const media = useOutputMedia(audio?.state === "running" ? undefined : body);
  if (audio?.state === "running")
    return (
      <>
        <Waveform projectId={projectId} revisionId={revisionId} />
        <LiveAudio projectId={projectId} />
      </>
    );
  if (media !== undefined)
    return (
      <div className="mb-6">
        <WaveAudioPlayer label="Body narration" src={media.url} />
      </div>
    );
  return <Waveform projectId={projectId} revisionId={revisionId} />;
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
            : `Narration so far: ${workDuration(seconds * 1000)}`
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
            : `${workDuration(seconds * 1000)} narrated${peaks.data !== undefined && "complete" in peaks.data && peaks.data.complete ? "" : " so far"}`}
      </p>
    </div>
  );
}
