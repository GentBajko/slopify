import type { DatabaseSync } from "node:sqlite";
import type { MiddlewareHandler } from "hono";
import type { Clock } from "../../kernel/clock.js";
import type { Log } from "../../kernel/log.js";
import { projectsMadeBy } from "../../slices/agents/model.js";
import { recordStart } from "../../slices/agents/repo.js";
import { actorOf } from "./actor.js";

const projectStart =
  /^\/api\/projects\/([0-9A-Za-z_-]{1,64})\/(?:resume|rebuild|stages\/[a-z]+\/(?:retry|soften|rerun)|reviews\/[0-9A-Za-z_-]+\/redo)\/?$/;
const createdStart =
  /^\/api\/(?:drafts\/[^/]+\/start|onboarding\/short|schedules\/[^/]+\/topics\/prepare)\/?$/;

// The projects whose work a successful POST started: the one its path names, or those it made.
export async function startedProjects(
  path: string,
  response: Response,
): Promise<readonly string[]> {
  const named = projectStart.exec(path)?.[1];
  if (named !== undefined) return [named];
  if (!createdStart.test(path)) return [];
  return projectsMadeBy(
    await response
      .clone()
      .json()
      .catch(() => undefined),
  );
}

// Who last started each project's work, for the notices its run sends.
export function startRecorder(deps: {
  readonly db: DatabaseSync;
  readonly clock: Clock;
  readonly log: Log;
}): MiddlewareHandler {
  return async (c, next) => {
    await next();
    if (c.req.method !== "POST" || !c.res.ok) return;
    for (const projectId of await startedProjects(c.req.path, c.res))
      try {
        recordStart(deps.db, { projectId, actor: actorOf(c), at: deps.clock.now().toISOString() });
      } catch (error) {
        deps.log.write("error", "project.start", {
          projectId,
          detail: error instanceof Error ? error.message : String(error),
        });
      }
  };
}
