import type { SubtitleConfig } from "@app/slices/subtitles/model.js";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { useApp } from "@/app-context";
import { Rail, RailGroup } from "@/components/rail";
import type { ProviderChanges } from "@/project/api";
import { StageBodyFor } from "@/project/bodies";
import { ProjectHeader } from "@/project/header";
import { RefusalLine } from "@/project/parts";
import { changedProviderChoices, ProjectProviders } from "@/project/providers";
import { StageRow } from "@/project/stage-row";
import { ProjectSubtitles } from "@/project/subtitles";
import { useProjectActions } from "@/project/use-actions";
import { useLiveProject } from "@/project/use-live";
import { projectQuery, promptsQuery, providersQuery } from "@/queries";
import { sameSubtitles, subtitlesFor } from "@/subtitles/config";

// The project page. The rundown - one row per stage with its lamp, its state word and the
// body it opens into - plus the re-run actions and Cancel. This file is only the
// composition: what a row draws is `project/stage-row.tsx`, what a body draws is
// `project/body-*.tsx`, and what an action does is `project/use-actions.ts`.
export function ProjectRoute({ projectId }: { readonly projectId: string }) {
  const { api } = useApp();
  const project = useQuery(projectQuery(api, projectId));
  const providers = useQuery(providersQuery(api));
  const prompts = useQuery(promptsQuery(api));
  const actions = useProjectActions(projectId);
  const [providerEdits, setProviderEdits] = useState<ProviderChanges>({});
  const [subtitleEdits, setSubtitleEdits] = useState<
    { readonly projectId: string; readonly value: SubtitleConfig } | undefined
  >();
  const [subtitleUpload, setSubtitleUpload] = useState<
    { readonly projectId: string; readonly pending: boolean } | undefined
  >();

  useLiveProject(projectId);

  if (project.error !== null) {
    return <p className="text-body text-red">{project.error.message}</p>;
  }
  if (project.data === undefined) {
    return <SkeletonRundown />;
  }

  const { project: summary, stages, outputs } = project.data;
  // No action is offered while a stage of the project is running, and the server refuses
  // one that gets through anyway.
  const inFlight = stages.some((stage) => stage.state === "running");
  const busy =
    summary.status === "running" || summary.status === "paused" || inFlight || actions.pending;

  const savedSubtitles = subtitlesFor(summary.config.subtitles, summary.config.sources);
  const subtitles =
    subtitleEdits?.projectId === projectId
      ? subtitlesFor(subtitleEdits.value, summary.config.sources)
      : savedSubtitles;
  const subtitlesDirty = !sameSubtitles(subtitles, savedSubtitles);
  const subtitleUploading = subtitleUpload?.projectId === projectId && subtitleUpload.pending;
  const discardSubtitles = () =>
    setSubtitleEdits((current) => (current?.projectId === projectId ? undefined : current));

  return (
    <div className="mx-auto max-w-[1440px]">
      {/* The back link sits above a detail page's title. */}
      <Link to="/" className="mb-[10px] block text-small text-ink2 hover:text-ink">
        &lt; Projects
      </Link>

      <RailGroup>
        <div data-tour="project-controls" className="border-b border-line">
          <ProjectHeader
            project={summary}
            prompts={prompts.data?.prompts}
            actions={actions}
            inFlight={inFlight}
            unsavedProviders={
              Object.keys(changedProviderChoices(summary.config, providerEdits)).length > 0 ||
              subtitlesDirty ||
              subtitleUploading
            }
          />
          <ProjectProviders
            project={summary}
            providers={providers.data?.providers ?? []}
            actions={actions}
            inFlight={inFlight}
            edits={providerEdits}
            setEdits={setProviderEdits}
          />
          {actions.refusal === undefined || actions.refusal.stage !== undefined ? null : (
            // A refused cancel belongs to the project, not to one stage; every other
            // refusal is drawn under the row whose control was pressed.
            <Rail className="py-[10px]">
              <RefusalLine message={actions.refusal.message} onDismiss={actions.dismissRefusal} />
            </Rail>
          )}
        </div>

        {stages.map((stage) => (
          <StageRow
            key={stage.id}
            stage={stage}
            project={summary}
            outputs={outputs}
            providers={providers.data?.providers ?? []}
            actions={actions}
          >
            <StageBodyFor
              stage={stage}
              project={summary}
              outputs={outputs}
              actions={actions}
              busy={busy}
              {...(stage.kind === "video"
                ? {
                    subtitleControls: (
                      <ProjectSubtitles
                        key={projectId}
                        project={summary}
                        actions={actions}
                        inFlight={inFlight}
                        value={subtitles}
                        uploading={subtitleUploading}
                        onChange={(value) =>
                          setSubtitleEdits({
                            projectId,
                            value: subtitlesFor(value, summary.config.sources),
                          })
                        }
                        onDiscard={discardSubtitles}
                        onUploading={(pending) =>
                          setSubtitleUpload((current) =>
                            current?.projectId === projectId && current.pending === pending
                              ? current
                              : { projectId, pending },
                          )
                        }
                      />
                    ),
                  }
                : {})}
            />
          </StageRow>
        ))}
      </RailGroup>
    </div>
  );
}

// The final layout's shape, not a spinner.
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
