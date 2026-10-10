import { z } from "zod";
import { projectStates, stageStates } from "../../kernel/pipeline.js";
import { projectStateWord, stageStateWords } from "../../slices/admission/state-words.js";

const flags = { setAside: z.boolean().optional(), prepared: z.boolean().optional() };
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
    stages: z.array(z.object({ state: z.enum(stageStates) }).loose()),
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
      stateWord: projectStateWord({ ...project, started: project.progress > 0 }),
    })),
  };
}

// A project's page: the project's and each step's state in words.
export function projectWithStateWords(value: unknown): unknown {
  const parsed = bodySchema.safeParse(value);
  if (!parsed.success) return value;
  const { project, stages } = parsed.data;
  const started = stages.some((stage) => stage.state === "done" || stage.state === "provided");
  return {
    ...parsed.data,
    project: { ...project, stateWord: projectStateWord({ ...project, started }) },
    stages: stages.map((stage) => ({ ...stage, stateWord: stageStateWords[stage.state] })),
  };
}
