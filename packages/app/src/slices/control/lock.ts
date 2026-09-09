import type { DatabaseSync } from "node:sqlite";

// Every project mutation uses the same queue. A pause owns it until provider calls
// have unwound, so a second tab cannot resume or replace configuration mid-abort.
const queues = new WeakMap<DatabaseSync, Map<string, Promise<unknown>>>();

export function withProjectControl<T>(
  db: DatabaseSync,
  projectId: string,
  work: () => T | Promise<T>,
): Promise<T> {
  let projects = queues.get(db);
  if (projects === undefined) {
    projects = new Map();
    queues.set(db, projects);
  }
  const previous = projects.get(projectId);
  const result = previous === undefined ? Promise.resolve().then(work) : previous.then(work, work);
  projects.set(projectId, result);
  const release = (): void => {
    if (projects.get(projectId) === result) projects.delete(projectId);
  };
  void result.then(release, release);
  return result;
}
