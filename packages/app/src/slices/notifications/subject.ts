import type { DatabaseSync } from "node:sqlite";
import { derive } from "../../kernel/runner/graph.js";
import { projectById, stagesOf } from "../admission/repo.js";
import { stepFailedBesideWait } from "../admission/state-words.js";
import { lastStarter } from "../agents/repo.js";
import { projectHolds } from "../reviews/holds.js";
import { atItsDay, failuresOf, type NoticeSubject } from "./rules.js";

// What a notification says about a project, read at the moment it goes out.
export function noticeSubject(
  db: DatabaseSync,
  projectId: string,
): Omit<NoticeSubject, "reason"> | undefined {
  const project = projectById(db, projectId);
  if (project === undefined) return undefined;
  const holds = projectHolds(db, { projectId });
  const stages = stagesOf(db, projectId);
  const failures = failuresOf(stages);
  return {
    title: project.title,
    makesVideo: project.config.sources.video !== "off",
    startedBy: lastStarter(db, projectId),
    waitingForAgent: holds.waitingForAgent.has(projectId),
    atItsDay: atItsDay(holds.prepared.has(projectId), holds.holding.get(projectId) ?? []),
    ...(stepFailedBesideWait(derive(stages, project.paused), stages) ? { stepFailed: true } : {}),
    ...(failures.length === 0 ? {} : { failures }),
  };
}
