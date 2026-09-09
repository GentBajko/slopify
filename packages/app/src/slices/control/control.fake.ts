import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { fixedClock } from "../../kernel/clock.fake.js";
import { openDb } from "../../kernel/db/index.js";
import { migrate } from "../../kernel/db/migrate.js";
import type { ProjectEvent } from "../../kernel/events.js";
import { ensureDirs, layout, type Paths } from "../../kernel/paths.js";
import { type StageKind, type StageState, stageKinds } from "../../kernel/pipeline.js";
import { dependenciesOf } from "../../kernel/runner/graph.js";
import { createRunner, type Runner, type StageRun } from "../../kernel/runner/index.js";
import type { RunConfig } from "../admission/model.js";
import {
  claimStage,
  finishStage,
  insertProject,
  insertStage,
  projectPaused,
  stagesOf,
} from "../admission/repo.js";
import { providers as catalog } from "../settings/model.js";
import { hasKey, insertVoice, upsertKey } from "../settings/repo.js";
import type { ControlDeps } from "./index.js";

interface ControlHarness {
  readonly db: DatabaseSync;
  readonly paths: Paths;
  readonly runner: Runner;
  readonly deps: ControlDeps;
  readonly events: readonly ProjectEvent[];
  readonly state: (kind: StageKind) => StageState | undefined;
}

export const clock = fixedClock("2026-09-03T09:00:00.000Z");
export const config: RunConfig = {
  title: "Saved project",
  format: "16:9",
  sources: {
    research: "generate",
    article: "generate",
    audio: "generate",
    images: "generate",
    thumbnail: "from_prompt",
    video: "generate",
  },
  llm: { provider: "openrouter", model: "old" },
  audio: { provider: "openai-tts", model: "old", voice: "old-voice" },
  images: { provider: "fal", model: "old" },
  articlePrompt: "Deleted library prompt",
  imagePrompts: [{ name: "Deleted image prompt", number: 2 }],
  values: { topic: "boats" },
  rendered: { article: "Write boats", "image:0": "Paint boats" },
  provided: { thumbnail: "consumed-upload" },
  silenceGapSeconds: 3,
};

export function harness(
  states: Partial<Record<StageKind, StageState>> = {},
  runs: Partial<Record<StageKind, StageRun>> = {},
): ControlHarness {
  const paths = layout(mkdtempSync(join(tmpdir(), "slopify-control-")));
  ensureDirs(paths, { mode: 0o700 });
  const db = openDb(paths.db);
  migrate(db, clock);
  insertProject(db, {
    id: "p1",
    title: config.title,
    format: config.format,
    config,
    createdAt: clock.now().toISOString(),
    updatedAt: clock.now().toISOString(),
  });
  for (const kind of stageKinds)
    insertStage(db, {
      id: `s-${kind}`,
      projectId: "p1",
      kind,
      source: config.sources[kind],
      state: states[kind] ?? "skipped",
      attemptCount: 0,
      progressCurrent: null,
      progressTotal: null,
      failureReason: null,
      startedAt: null,
      finishedAt: null,
    });
  for (const provider of catalog)
    if (provider.auth === "key") upsertKey(db, provider.id, "test-key", clock.now().toISOString());
  insertVoice(db, {
    id: "new-voice",
    provider: "openai-tts",
    name: "New voice",
    voiceId: "new-voice",
  });
  const events: ProjectEvent[] = [];
  const emit: ControlDeps["emit"] = (_id, event) => {
    events.push(event);
  };
  const log = { write: () => {} };
  const runner = createRunner({
    stages: {
      stagesOf: (id) => stagesOf(db, id),
      paused: (id) => projectPaused(db, id),
      dependenciesOf: (_id, kind) => dependenciesOf(kind, config.sources),
      claim: (id) => claimStage(db, id, clock.now().toISOString()),
      finish: (id, state, reason) => finishStage(db, id, state, reason, clock.now().toISOString()),
    },
    runs,
    emit,
    emitRunningCount: () => {},
    log,
  });
  const deps: ControlDeps = {
    db,
    paths,
    runner,
    clock,
    log,
    ids: { next: () => "unused" },
    emit,
    providers: async () =>
      catalog.map((provider) => ({
        ...provider,
        readiness:
          provider.auth === "cli"
            ? { kind: "cli" as const, installed: true }
            : { kind: "keyed" as const, hasKey: hasKey(db, provider.id) },
      })),
    modelsFor: async () => [{ id: "new", name: "New model" }],
  };
  return {
    db,
    paths,
    runner,
    deps,
    events,
    state: (kind: StageKind) => stagesOf(db, "p1").find((stage) => stage.kind === kind)?.state,
  };
}

export function deferred(): { readonly promise: Promise<void>; readonly resolve: () => void } {
  let resolve = () => {};
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
