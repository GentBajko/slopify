import type { DatabaseSync } from "node:sqlite";
import { derive } from "../../kernel/runner/graph.js";
import { projectById, stagesOf } from "../admission/repo.js";
import { stepFailedBesideWait } from "../admission/state-words.js";
import { lastStarter } from "../agents/repo.js";
import { projectHolds } from "../reviews/holds.js";
import { uploadedAndSettled } from "../uploads/repo.js";
import { settledStatus } from "../uploads/rules.js";
import { atItsDay, failuresOf, type NoticeSubject } from "./rules.js";

// What a notification says about a project, read at the moment it goes out, by the rule the
// Projects list reads it with (`edge/http/projects.ts`).
export function noticeSubject(
  db: DatabaseSync,
  projectId: string,
): Omit<NoticeSubject, "reason"> | undefined {
  const project = projectById(db, projectId);
  if (project === undefined) return undefined;
  const stages = stagesOf(db, projectId);
  const settled = uploadedAndSettled(db, projectId);
  const holds = projectHolds(db, { projectId, standings: new Map([[projectId, stages]]), settled });
  const status = settledStatus(derive(stages, project.paused), settled.has(projectId));
  const failures = failuresOf(stages);
  return {
    title: project.title,
    makesVideo: project.config.sources.video !== "off",
    startedBy: lastStarter(db, projectId),
    waitingForAgent: holds.waitingForAgent.has(projectId),
    atItsDay: atItsDay(holds.prepared.has(projectId), holds.holding.get(projectId) ?? []),
    status,
    ...(stepFailedBesideWait(status, stages) ? { stepFailed: true } : {}),
    ...(failures.length === 0 ? {} : { failures }),
  };
}
