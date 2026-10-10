import type { DatabaseSync } from "node:sqlite";
import { projectById } from "../admission/repo.js";
import { lastStarter } from "../agents/repo.js";
import { projectHolds } from "../reviews/holds.js";
import type { NoticeSubject } from "./rules.js";

// What a notification says about a project, read at the moment it goes out.
export function noticeSubject(
  db: DatabaseSync,
  projectId: string,
): Omit<NoticeSubject, "reason"> | undefined {
  const project = projectById(db, projectId);
  if (project === undefined) return undefined;
  const holds = projectHolds(db, { projectId });
  return {
    title: project.title,
    makesVideo: project.config.sources.video !== "off",
    startedBy: lastStarter(db, projectId),
    waitingForAgent: holds.waitingForAgent.has(projectId),
  };
}
