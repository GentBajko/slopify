import { modelFields } from "../../catalog/validate.js";
import type { Project, RunDraft, Stage } from "../../slices/admission/model.js";
import { stagesOf } from "../../slices/admission/repo.js";
import { admit, type FieldError } from "../../slices/admission/rules.js";
import { startRun } from "../../slices/admission/start.js";
import { resolveFont } from "../../slices/fonts/index.js";
import { pickTemplates, renderPicked } from "../../slices/library/slots.js";
import { stagedFiles } from "../../slices/storage/repo.js";
import type { StorageDeps } from "../../slices/storage/staging.js";
import { record, type TelemetryDeps } from "../../slices/telemetry/record.js";
import type { AppDeps } from "./app.js";

export type CreatedProject =
  | { readonly ok: true; readonly project: Project; readonly stages: readonly Stage[] }
  | {
      readonly ok: false;
      readonly status: 400 | 409;
      readonly detail: string;
      readonly fields: readonly FieldError[];
    };

// Starts a project from a whole draft, the way POST /api/projects always has: the prompt
// bodies are read now, the draft is admitted, the project and its first work are committed in
// one transaction, and only then is the runner woken. "Make a 60-second short" starts its
// project through the same door.
export async function createProject(deps: AppDeps, draft: RunDraft): Promise<CreatedProject> {
  if (draft.checkpoints?.length)
    return {
      ok: false,
      status: 409,
      detail:
        "This project has checkpoints turned on, so it must be started from Play with Review and start.",
      fields: [],
    };
  const subtitles = draft.subtitles;
  if (subtitles !== undefined && subtitles.mode !== "off") {
    try {
      await resolveFont(deps.paths, subtitles.fontId);
    } catch {
      return {
        ok: false,
        status: 400,
        detail:
          "The subtitle font you picked is no longer available. Choose another font before starting.",
        fields: [
          {
            field: "subtitles.fontId",
            message:
              "This font is no longer available. Choose another or upload it again in Settings.",
          },
        ],
      };
    }
  }
  // The bodies are read here, at the click, so an edit made since the prompt was selected is
  // the one that runs.
  const picked = pickTemplates(deps.db, draft);
  const admitted = admit({
    draft: picked.draft,
    staged: stagedFiles(deps.db),
    requiredSlots: picked.requiredSlots,
  });
  const modelErrors = modelFields(picked.draft, deps.catalogue);
  if (!admitted.ok || picked.missing.length > 0 || modelErrors.length > 0)
    return {
      ok: false,
      status: 400,
      detail: "This video cannot start yet. Fix the highlighted fields, then try again.",
      fields: [...picked.missing, ...modelErrors, ...(admitted.ok ? [] : admitted.fields)],
    };
  const storage: StorageDeps = {
    catalogue: deps.catalogue,
    db: deps.db,
    paths: deps.paths,
    ids: deps.ids,
    clock: deps.clock,
    log: deps.log,
    emit: (event) => {
      deps.hub.emitGlobal(event);
    },
  };
  // Rendered from the values admit() has trimmed, so the stored text carries no padding the
  // user did not intend.
  const { project } = startRun(
    storage,
    admitted.draft,
    renderPicked(picked, admitted.draft.values),
    false,
    Object.fromEntries(picked.bodies.map(({ key, body }) => [key, body])),
  );
  const telemetry: TelemetryDeps = {
    db: deps.db,
    ids: deps.ids,
    clock: deps.clock,
    log: deps.log,
    appVersion: deps.version,
  };
  // One event per project created. record() swallows its own failures, so a broken telemetry
  // write cannot cost the user the run.
  record(telemetry, "project.created", {});
  deps.flushSoon();
  // The run starts only once the project is committed.
  deps.runner.tick(project.id);
  return { ok: true, project, stages: stagesOf(deps.db, project.id) };
}
