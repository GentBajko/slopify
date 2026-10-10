import { z } from "zod";
import { projectStates, stageKinds, stageStates } from "../../kernel/pipeline.js";
import { progressOf } from "../../kernel/runner/graph.js";
import { projectStateWord, stageStateWords } from "../../slices/admission/state-words.js";

const flags = {
  setAside: z.boolean().optional(),
  prepared: z.boolean().optional(),
  waitingForAgent: z.boolean().optional(),
};
const listSchema = z
  .object({
    projects: z.array(
      z.object({ status: z.enum(projectStates), progress: z.number(), ...flags }).loose(),
    ),
  })
  .loose();
const bodySchema = z
  .object({
    project: z.object({ status: z.enum(projectStates), ...flags }).loose(),
    stages: z.array(
      z
        .object({
          kind: z.enum(stageKinds),
          state: z.enum(stageStates),
          progressCurrent: z.number().nullable().optional(),
          progressTotal: z.number().nullable().optional(),
        })
        .loose(),
    ),
  })
  .loose();

// The Projects list with each project's state in the words Slopify's pages use.
export function listWithStateWords(value: unknown): unknown {
  const parsed = listSchema.safeParse(value);
  if (!parsed.success) return value;
  return {
    ...parsed.data,
    projects: parsed.data.projects.map((project) => ({
      ...project,
      stateWord: projectStateWord(project),
    })),
  };
}

// A project's page: the project's and each step's state in words.
export function projectWithStateWords(value: unknown): unknown {
  const parsed = bodySchema.safeParse(value);
  if (!parsed.success) return value;
  const { project, stages } = parsed.data;
  const progress = progressOf(
    stages.map((stage) => ({
      kind: stage.kind,
      state: stage.state,
      progressCurrent: stage.progressCurrent ?? null,
      progressTotal: stage.progressTotal ?? null,
    })),
  );
  return {
    ...parsed.data,
    project: { ...project, stateWord: projectStateWord({ ...project, progress }) },
    stages: stages.map((stage) => ({ ...stage, stateWord: stageStateWords[stage.state] })),
  };
}
