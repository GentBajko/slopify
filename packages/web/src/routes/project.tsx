import type { StageKind } from "@app/kernel/pipeline.js";
import type { Stage } from "@app/slices/admission/model.js";
import type { Output } from "@app/slices/storage/model.js";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { eventsUrl, fileUrl } from "@/api";
import { useApp } from "@/app-context";
import { StageGlyph } from "@/components/glyph";
import { Lamp, StageLamp } from "@/components/lamp";
import { Rail, RailGroup, RailMeter } from "@/components/rail";
import { subscribeProject } from "@/events";
import { startedAt } from "@/lib/utils";
import { keys, projectQuery } from "@/queries";

const stageNames: Readonly<Record<StageKind, string>> = {
  research: "Research",
  article: "Article",
  audio: "Audio",
  images: "Images",
  thumbnail: "Thumbnail",
  video: "Video",
};

// The rundown: one row per stage with its lamp and state word, then the video
// (uiux/screens/08-project.md). The per-stage bodies, the grids, the confirm dialogs and
// the error lines are S21.
export function ProjectRoute({ projectId }: { readonly projectId: string }) {
  const { api, openEvents } = useApp();
  const queryClient = useQueryClient();
  const project = useQuery(projectQuery(api, projectId));

  useEffect(
    () =>
      subscribeProject(openEvents, eventsUrl(api, `projects/${projectId}`), {
        refetch: () => {
          void queryClient.invalidateQueries({ queryKey: keys.project(projectId) });
          void queryClient.invalidateQueries({ queryKey: keys.projects });
        },
        appendArticle: (text) => {
          queryClient.setQueryData<string>(
            keys.article(projectId),
            (seen) => `${seen ?? ""}${text}`,
          );
        },
      }),
    [api, openEvents, queryClient, projectId],
  );

  const streaming = useQuery({
    queryKey: keys.article(projectId),
    // The article arrives over SSE and is only ever patched into the cache, never
    // fetched: this query exists to read and subscribe to it.
    queryFn: (): string => "",
    enabled: false,
  });

  if (project.error !== null) {
    return <p className="text-body text-red">{project.error.message}</p>;
  }
  if (project.data === undefined) {
    return <SkeletonRundown />;
  }

  const { project: summary, stages, outputs } = project.data;
  const video = outputs.find((output) => output.role === "video");

  return (
    <div className="mx-auto max-w-[1440px]">
      <Link to="/" className="mb-1 block text-small text-ink2 hover:text-ink">
        &lt; Projects
      </Link>
      <h1 className="mb-4 text-title font-bold tracking-[-0.01em]">{summary.title}</h1>

      <RailGroup>
        <Rail className="bg-panel2">
          <Lamp state={summary.status} />
          <span className="text-row font-bold">{summary.title}</span>
          <span className="text-small text-ink2">
            {`${summary.format} · started ${startedAt(summary.createdAt)}`}
          </span>
          <StageLamp
            label="Project"
            state={summary.status}
            className="ml-auto [&>[data-lamp]]:hidden"
          />
        </Rail>

        {stages.map((stage) => (
          <StageRow key={stage.id} stage={stage} outputs={outputs} />
        ))}
      </RailGroup>

      {streaming.data === undefined || streaming.data === "" ? null : (
        <section className="mt-6 max-w-[75ch] whitespace-pre-wrap text-body text-ink">
          <h2 className="engraved mb-[10px] text-ink3">Article</h2>
          {streaming.data}
        </section>
      )}

      {video === undefined ? null : (
        <section className="mt-6">
          <h2 className="engraved mb-[10px] text-ink3">Video</h2>
          {/* biome-ignore lint/a11y/useMediaCaption: the narration is the user's own
              audio, and no caption track exists for it anywhere in the pipeline. */}
          <video
            controls
            preload="metadata"
            src={fileUrl(api, projectId, "video")}
            className="max-h-[720px] rounded-panel border border-line bg-black"
          />
          <p className="mt-[10px]">
            <a
              href={fileUrl(api, projectId, "video")}
              download
              className="text-small text-run-text underline"
            >
              Download .mp4
            </a>
          </p>
        </section>
      )}
    </div>
  );
}

function StageRow({
  stage,
  outputs,
}: {
  readonly stage: Stage;
  readonly outputs: readonly Output[];
}) {
  const running = stage.state === "running";
  return (
    <Rail>
      <StageGlyph kind={stage.kind} className="text-ink2" />
      <span className="w-[110px] shrink-0 font-semibold">{stageNames[stage.kind]}</span>
      <span className="text-small text-ink2">{summaryOf(stage, outputs)}</span>
      <StageLamp
        label={stageNames[stage.kind]}
        state={stage.state}
        className="ml-auto flex-row-reverse"
      />
      {running && stage.progressTotal !== null ? (
        <RailMeter current={stage.progressCurrent ?? 0} total={stage.progressTotal} />
      ) : null}
    </Rail>
  );
}

function summaryOf(stage: Stage, outputs: readonly Output[]): string {
  if (stage.state === "failed") {
    return stage.failureReason ?? "The stage failed.";
  }
  if (stage.state === "skipped") {
    return "Not part of this run";
  }
  if (stage.state === "provided") {
    const names = outputs
      .filter((output) => output.stageKind === stage.kind)
      .flatMap((output) => (output.originalFilename === null ? [] : [output.originalFilename]));
    return names.length === 0 ? "Provided" : names.join(", ");
  }
  if (stage.state === "running" && stage.progressTotal !== null) {
    return `${String(stage.progressCurrent ?? 0)} of ${String(stage.progressTotal)}`;
  }
  if (stage.state === "pending") {
    return "Waits for the stages above";
  }
  return "";
}

function SkeletonRundown() {
  return (
    <div className="mx-auto max-w-[1440px]">
      <RailGroup>
        {[0, 1, 2, 3, 4, 5].map((row) => (
          <Rail key={row}>
            <span className="size-[10px] rounded-full bg-panel2" />
            <span className="h-4 w-24 rounded-control bg-panel2" />
            <span className="ml-auto h-3 w-16 rounded-control bg-panel2" />
          </Rail>
        ))}
      </RailGroup>
    </div>
  );
}
