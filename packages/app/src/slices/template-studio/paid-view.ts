import type { DatabaseSync } from "node:sqlite";
import type { Log } from "../../kernel/log.js";
import type { Paths } from "../../kernel/paths.js";
import { projectExists } from "../admission/repo.js";
import type { PlayDraftDocument } from "../play-drafts/schema.js";
import { templateById } from "../project-templates/repo.js";
import { currentRevisionId } from "../revisions/repo.js";
import { getRevisionView } from "../revisions/view.js";
import { runningJob } from "./jobs.js";
import type { SampleVersionState, TemplateSection } from "./model.js";
import { sampleOf, sampleVersions } from "./repo.js";
import { sectionOfWork } from "./sections.js";
import { paidStatuses, type SectionStatus } from "./status.js";

// What the studio shows of a template's paid sample: the files its sample project holds now,
// served by the project's own file route, each placed in its section, and each version's state.

export interface PaidOutput {
  readonly section: TemplateSection;
  readonly role: string;
  readonly url: string;
  readonly name: string;
}

export interface PaidView {
  readonly projectId: string | null;
  readonly revisionId: string | null;
  // The current version's paid sample, or null when none was asked for.
  readonly state: SampleVersionState | null;
  readonly sentence: string | null;
  // What it was quoted at, or what a waiting one now costs: Make sample's price.
  readonly quotedHigh: number | null;
  readonly article: string | null;
  readonly outputs: readonly PaidOutput[];
  readonly versions: readonly {
    readonly version: number;
    readonly state: SampleVersionState;
    readonly updatedAt: string;
  }[];
}

export interface PaidViewDeps {
  readonly db: DatabaseSync;
  readonly paths: Paths;
  readonly log: Log;
}

export function paidView(
  deps: PaidViewDeps,
  templateId: string,
  head: { readonly version: number; readonly document: PlayDraftDocument },
): {
  readonly view: PaidView;
  readonly statuses: Partial<Readonly<Record<TemplateSection, SectionStatus>>>;
} {
  const versions = sampleVersions(deps.db, templateId);
  const row = versions.find((one) => one.templateVersion === head.version);
  const sample = sampleOf(deps.db, templateId);
  const projectId =
    sample !== undefined && projectExists(deps.db, sample.projectId) ? sample.projectId : null;
  const revisionId = projectId === null ? null : (currentRevisionId(deps.db, projectId) ?? null);
  const revision =
    projectId === null || revisionId === null
      ? undefined
      : getRevisionView(
          {
            db: deps.db,
            paths: deps.paths,
            log: deps.log,
            ids: { next: () => "" },
            clock: { now: () => new Date(), sleep: async () => undefined },
          },
          projectId,
          revisionId,
        );
  const outputs =
    revision === undefined || projectId === null || revisionId === null
      ? []
      : revision.outputs.flatMap((row): PaidOutput[] => {
          const section = sectionOfWork(row.workKey);
          if (!row.selected || !row.available || row.state !== "ready" || section === undefined)
            return [];
          return [
            {
              section,
              role: row.output.role,
              url: `/files/${encodeURIComponent(projectId)}/revisions/${encodeURIComponent(revisionId)}/${encodeURIComponent(row.recordId)}`,
              name: row.output.path.split("/").pop() ?? row.output.path,
            },
          ];
        });
  const running = runningJob(deps.db);
  return {
    view: {
      projectId,
      revisionId,
      state: row?.state ?? null,
      sentence: row?.heldReason ?? null,
      quotedHigh: row?.quotedHigh ?? null,
      article: revision?.articleMarkdown ?? null,
      outputs,
      versions: versions.map((one) => ({
        version: one.templateVersion,
        state: one.state,
        updatedAt: one.updatedAt,
      })),
    },
    statuses: paidStatuses({
      headVersion: head.version,
      headDocument: head.document,
      versions,
      documentOf: (version) => templateById(deps.db, templateId, version)?.document,
      running:
        running?.templateId === templateId &&
        running.templateVersion === head.version &&
        running.kind !== "free",
      busyElsewhere: running !== undefined && running.templateId !== templateId,
    }),
  };
}
