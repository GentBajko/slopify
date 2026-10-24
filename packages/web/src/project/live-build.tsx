import type { ProjectSummary, Stage } from "@app/slices/admission/model.js";
import type { CheckpointHold } from "@app/slices/reviews/holds.js";
import type { Output } from "@app/slices/storage/model.js";
import { useQuery } from "@tanstack/react-query";
import { type ReactElement, type ReactNode, use, useEffect, useState } from "react";
import { useApp } from "@/app-context";
import { Button } from "@/components/kit/button";
import { type Aspect, MediaFrame, MediaGrid } from "@/components/kit/media";
import { Player } from "@/components/kit/player";
import { SectionHead } from "@/components/kit/section-head";
import { Meter } from "@/components/kit/stats";
import { Steps } from "@/components/kit/steps";
import { peaksKey, readPeaks } from "@/onboarding/api";
import { frameAspect } from "./body-images.js";
import { OpenProjectTab } from "./fix-it.js";
import { LiveAudio } from "./live-audio.js";
import { LiveWriting } from "./live-writing.js";
import { useOutputMedia } from "./revision-media.js";
import { runSteps } from "./run-aside.js";
import { workDuration } from "./run-cost.js";
import { timeLeft } from "./status-rows.js";
import { duration, finalOutput, stageFraction, summaryOf } from "./summary.js";
import { WaveAudioPlayer } from "./waveform.js";
import { overallProgress } from "./workspace.js";

// Progress: watching the run while it goes. A headline with the whole run's share and time
// left ("Making your video · 3 of 5 · about 6 min left") over one bar, the steps with their
// times, then what each makes as it lands: the article as it is written, the narration's
// waveform growing, the images as they are drawn and the video while it renders, which becomes
// its player the moment the file is there. A finished step says so in the past tense. Fed by
// the page's event stream; nothing here starts or changes work.
export function LiveBuild({
  project,
  revisionId,
  stages,
  outputs,
  resumable,
  holding,
}: {
  readonly project: ProjectSummary;
  readonly revisionId: string | null;
  readonly stages: readonly Stage[];
  readonly outputs: readonly Output[];
  readonly resumable: boolean;
  readonly holding: readonly CheckpointHold[];
}): ReactElement {
  const now = useNow(project.status === "running");
  const overall = overallProgress(stages);
  const left = project.status === "paused" ? undefined : timeLeft(stages, now);
  const steps = runSteps({ stages, outputs, project, resumable, holding, now });
  // In the order they are shown, not the order they happened to land in.
  const images = outputs
    .filter((output) => output.role === "image")
    .sort((a, b) => (a.meta.index ?? 0) - (b.meta.index ?? 0));
  const stageOf = (kind: Stage["kind"]): Stage | undefined =>
    stages.find((stage) => stage.kind === kind && stage.state !== "skipped");
  const article = stageOf("article");
  const audio = stageOf("audio");
  const imagesStage = stageOf("images");
  const video = stageOf("video");
  const headline = [
    project.status === "paused" ? "Paused" : makingWords(project),
    `${String(overall.completed)} of ${String(overall.total)}`,
    left,
  ]
    .filter((part) => part !== undefined)
    .join(" · ");
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-col gap-2">
        <p className="m-0 font-semibold text-ink">{headline}</p>
        <Meter
          progress
          value={overall.percent / 100}
          label="Whole run"
          valueText={`${String(overall.percent)}% of the run done`}
          tone={project.status === "paused" ? "waiting" : "accent"}
        />
      </div>
      <Steps steps={steps} label="Run steps" />
      {article === undefined ? null : (
        <Pane title="Article">
          <LiveArticle project={project} article={article} />
        </Pane>
      )}
      {audio === undefined ? null : (
        <Pane title="Narration">
          <LiveNarration
            projectId={project.id}
            revisionId={revisionId}
            audio={audio}
            outputs={outputs}
          />
        </Pane>
      )}
      {imagesStage === undefined ? null : (
        <Pane title="Images">
          {images.length === 0 ? (
            <p className="m-0 text-small text-ink-2">
              {imagesStage.state === "pending"
                ? "Not started yet. Each image appears here as it is drawn."
                : "The images appear here as each one is drawn."}
            </p>
          ) : (
            <MediaGrid list density="compact" label="Images so far">
              {images.map((image) => (
                <LiveImage key={image.id} output={image} aspect={frameAspect(project.format)} />
              ))}
            </MediaGrid>
          )}
        </Pane>
      )}
      {video === undefined || finalOutput(project.config) !== "video" ? null : (
        <Pane title="Video">
          <LiveVideo project={project} video={video} outputs={outputs} />
        </Pane>
      )}
    </div>
  );
}

function Pane({
  title,
  children,
}: {
  readonly title: string;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <section aria-label={title} className="flex min-w-0 flex-col gap-2">
      <SectionHead as="h3" title={title} size="small" className="pb-0" />
      {children}
    </section>
  );
}

// "Making your video", "Making your audiobook", "Writing your article".
function makingWords(project: ProjectSummary): string {
  const format = project.config.voices?.format;
  if (format === "audiobook" || format === "drama") return "Making your audiobook";
  if (format === "podcast") return "Making your podcast";
  const made = finalOutput(project.config);
  return made === "video"
    ? "Making your video"
    : made === "audio"
      ? "Making your narration"
      : "Writing your article";
}

// A clock for the time left, ticking each second while the run goes.
function useNow(ticking: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!ticking) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [ticking]);
  return now;
}

function LiveArticle({
  project,
  article,
}: {
  readonly project: ProjectSummary;
  readonly article: Stage;
}): ReactElement {
  const openTab = use(OpenProjectTab);
  if (article.state === "running") return <LiveWriting projectId={project.id} stage="article" />;
  const finished = article.state === "done" || article.state === "provided";
  return (
    <p className="m-0 flex flex-wrap items-center gap-3 text-small text-ink-2">
      {article.state === "provided"
        ? "Supplied by you."
        : article.state === "done"
          ? "Written."
          : "Not started yet. It is written here as you watch."}
      {finished && openTab !== undefined ? (
        <Button variant="secondary" size="small" onClick={() => openTab("output")}>
          Read it
        </Button>
      ) : null}
    </p>
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

// The video while it renders, with how far it is; its player once the file is there.
function LiveVideo({
  project,
  video,
  outputs,
}: {
  readonly project: ProjectSummary;
  readonly video: Stage;
  readonly outputs: readonly Output[];
}): ReactElement {
  const file = outputs.find((output) => output.role === "video");
  const media = useOutputMedia(video.state === "done" ? file : undefined);
  if (media !== undefined && file !== undefined)
    return (
      <div className="flex max-w-[720px] flex-col gap-1">
        <Player src={media.url} label={`${project.title}, the video`} />
        <p className="m-0 text-small text-ink-2">
          {[duration(file.durationMs ?? undefined), "rendered"].filter(Boolean).join(" · ")}
        </p>
      </div>
    );
  if (video.state === "running") {
    const share = stageFraction(video);
    const words = summaryOf(video, outputs, project);
    return share === undefined ? (
      <p className="m-0 text-small text-ink-2">{words}</p>
    ) : (
      <div className="flex max-w-[480px] flex-col gap-1">
        <p className="m-0 text-small text-ink-2">{words}</p>
        <Meter progress value={share} label="Video" valueText={words} />
      </div>
    );
  }
  return (
    <p className="m-0 text-small text-ink-2">
      Not started yet. It is put together once the narration and images are made.
    </p>
  );
}

// Narration while it is spoken: the waveform growing and the parts so far to play; once it is
// done, the body narration's own player (the levelled join when Level the volume is on, which
// is what the video plays) and its length.
function LiveNarration({
  projectId,
  revisionId,
  audio,
  outputs,
}: {
  readonly projectId: string;
  readonly revisionId: string | null;
  readonly audio: Stage;
  readonly outputs: readonly Output[];
}): ReactElement {
  const body =
    outputs.find((output) => output.role === "audio_levelled" && output.meta.segment === "body") ??
    outputs.find((output) => output.role === "audio_body");
  const media = useOutputMedia(audio.state === "running" ? undefined : body);
  if (audio.state === "running")
    return (
      <>
        <Waveform projectId={projectId} revisionId={revisionId} />
        <LiveAudio projectId={projectId} />
      </>
    );
  if (media !== undefined)
    return (
      <div className="flex flex-col gap-1">
        <WaveAudioPlayer label="Body narration" src={media.url} />
        <p className="m-0 text-small text-ink-2">
          {[duration(body?.durationMs ?? undefined), "narrated"].filter(Boolean).join(" · ")}
        </p>
      </div>
    );
  if (audio.state === "pending")
    return (
      <p className="m-0 text-small text-ink-2">
        Not started yet. Its waveform grows here as each part is spoken.
      </p>
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
    <div>
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
