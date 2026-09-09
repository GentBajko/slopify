import type { DatabaseSync } from "node:sqlite";
import { transact } from "../../kernel/db/tx.js";
import type { ProjectEvent } from "../../kernel/events.js";
import { derive, satisfied } from "../../kernel/runner/graph.js";
import type { Runner } from "../../kernel/runner/index.js";
import {
  finishStage,
  projectById,
  resetStage,
  setProjectPaused,
  stagesOf,
  updateProjectConfig,
} from "../admission/repo.js";
import type { FieldError } from "../admission/rules.js";
import type { RerunDeps } from "../reruns/index.js";
import { clearUnfinishedAudio } from "../reruns/index.js";
import type { ProviderStatus } from "../settings/model.js";
import { providers as providerCatalog } from "../settings/model.js";
import { hasKey, listVoices } from "../settings/repo.js";
import { withProjectControl } from "./lock.js";
import type { ProviderChanges, ProviderValidation } from "./providers.js";
import { validateLocalProviderChanges, validateProviderChanges } from "./providers.js";

export interface ControlDeps extends RerunDeps {
  readonly runner: Runner;
  readonly emit: (projectId: string, event: ProjectEvent) => void;
  readonly providers: () => Promise<readonly ProviderStatus[]>;
  readonly modelsFor: NonNullable<ProviderValidation["modelsFor"]>;
}

export const providerCheckTimeoutMs = 15_000;

async function providerFields(
  deps: ControlDeps,
  changes: ProviderChanges,
): Promise<readonly FieldError[]> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      (async () =>
        validateProviderChanges(changes, {
          providers: await deps.providers(),
          voices: listVoices(deps.db),
          modelsFor: deps.modelsFor,
        }))(),
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(
          () => reject(new Error("Provider catalog timed out")),
          providerCheckTimeoutMs,
        );
      }),
    ]);
  } finally {
    clearTimeout(timeout);
  }
}

export type ControlResult =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly reason:
        | "no-project"
        | "running"
        | "not-editable"
        | "invalid-providers"
        | "catalog-unavailable";
      readonly fields?: readonly FieldError[];
    };

function changed(deps: ControlDeps, id: string, wake = false): void {
  deps.emit(id, { type: "project.updated", projectId: id });
  if (wake) deps.runner.tick(id);
  else
    deps.emit(id, {
      type: "project.state",
      projectId: id,
      state: derive(stagesOf(deps.db, id), projectById(deps.db, id)?.paused),
    });
}

export function pauseProject(deps: ControlDeps, id: string): Promise<ControlResult> {
  return withProjectControl(deps.db, id, async () => {
    const project = projectById(deps.db, id);
    if (project === undefined) return { ok: false, reason: "no-project" };
    const before = stagesOf(deps.db, id);
    if (before.every((stage) => satisfied(stage.state))) return { ok: true };
    const running = before.filter((stage) => stage.state === "running").map((stage) => stage.id);
    if (project.paused === true && running.length === 0 && !deps.runner.hasInflight?.(id))
      return { ok: true };
    transact(deps.db, () => setProjectPaused(deps.db, id, true, deps.clock.now().toISOString()));
    deps.emit(id, { type: "project.updated", projectId: id });
    await deps.runner.abortProject(id, "pause");
    // Covers a failed final row write and runners that report interruption as canceled.
    for (const stage of stagesOf(deps.db, id)) {
      if (running.includes(stage.id) && (stage.state === "running" || stage.state === "canceled")) {
        finishStage(deps.db, stage.id, "pending", null, deps.clock.now().toISOString());
        deps.emit(id, { type: "stage.state", projectId: id, stage: stage.kind, state: "pending" });
      }
    }
    changed(deps, id);
    return { ok: true };
  });
}

export function resumeProject(deps: ControlDeps, id: string): Promise<ControlResult> {
  return withProjectControl(deps.db, id, () => {
    const project = projectById(deps.db, id);
    if (project === undefined) return { ok: false, reason: "no-project" };
    const stages = stagesOf(deps.db, id);
    if (stages.some((stage) => stage.state === "running") || deps.runner.hasInflight?.(id))
      return { ok: true };
    if (project.paused !== true && stages.every((stage) => satisfied(stage.state)))
      return { ok: true };
    transact(deps.db, () => {
      for (const stage of stages) {
        if (stage.state === "failed" || stage.state === "canceled") resetStage(deps.db, stage.id);
      }
      setProjectPaused(deps.db, id, false, deps.clock.now().toISOString());
    });
    changed(deps, id, true);
    return { ok: true };
  });
}

function editable(db: DatabaseSync, id: string, runner: Runner): ControlResult {
  const project = projectById(db, id);
  if (project === undefined) return { ok: false, reason: "no-project" };
  const stages = stagesOf(db, id);
  if (stages.some((stage) => stage.state === "running") || runner.hasInflight?.(id))
    return { ok: false, reason: "running" };
  if (project.paused !== true && derive(stages) !== "failed")
    return { ok: false, reason: "not-editable" };
  return { ok: true };
}

export function changeProviders(
  deps: ControlDeps,
  id: string,
  changes: ProviderChanges,
): Promise<ControlResult> {
  return withProjectControl(deps.db, id, async () => {
    const allowed = editable(deps.db, id, deps.runner);
    if (!allowed.ok) return allowed;
    let fields: readonly FieldError[];
    try {
      fields = await providerFields(deps, changes);
    } catch {
      deps.log.write("warn", "project.providers", {
        projectId: id,
        detail: "Provider readiness or model catalog could not be loaded.",
      });
      return { ok: false, reason: "catalog-unavailable" };
    }
    if (fields.length > 0) return { ok: false, reason: "invalid-providers", fields };
    // Catalog/CLI reads await. Recheck after them before touching a project another
    // action may have deleted, and never rebuild its saved prompts or upload choices.
    const stillAllowed = editable(deps.db, id, deps.runner);
    if (!stillAllowed.ok) return stillAllowed;
    const project = projectById(deps.db, id);
    if (project === undefined) return { ok: false, reason: "no-project" };
    // Settings can change while a remote catalog is loading. Revalidate its local
    // key and voice rows synchronously so the saved choice is usable at commit.
    const localFields = validateLocalProviderChanges(changes, {
      providers: providerCatalog.map((provider) => ({
        ...provider,
        readiness:
          provider.auth === "cli"
            ? { kind: "cli" as const, installed: true }
            : { kind: "keyed" as const, hasKey: hasKey(deps.db, provider.id) },
      })),
      voices: listVoices(deps.db),
    });
    if (localFields.length > 0)
      return { ok: false, reason: "invalid-providers", fields: localFields };
    const audioChanged =
      changes.audio !== undefined &&
      (changes.audio.provider !== project.config.audio?.provider ||
        changes.audio.model !== project.config.audio?.model ||
        changes.audio.voice !== project.config.audio?.voice);
    const orphaned = transact(deps.db, () => {
      const files = audioChanged ? clearUnfinishedAudio(deps, id) : [];
      updateProjectConfig(
        deps.db,
        id,
        {
          ...project.config,
          ...(changes.llm === undefined ? {} : { llm: changes.llm }),
          ...(changes.audio === undefined ? {} : { audio: changes.audio }),
          ...(changes.images === undefined ? {} : { images: changes.images }),
        },
        deps.clock.now().toISOString(),
      );
      return files;
    });
    // The clear helper owns the row changes; files are unlinked only after commit.
    for (const remove of orphaned) remove();
    deps.emit(id, { type: "project.updated", projectId: id });
    return { ok: true };
  });
}
