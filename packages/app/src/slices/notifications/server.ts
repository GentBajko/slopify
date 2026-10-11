import type { DatabaseSync } from "node:sqlite";
import { createRunNotifier, type RunNotifier, type RunNotifierDeps } from "./notifier.js";
import { readNotificationUrl } from "./settings.js";
import { noticeSubject } from "./subject.js";
import { toldFailures } from "./told.js";

// The server's run notifier (`main.ts`): the Notification URL saved in Settings, each notice
// read from the project's rows as it goes out, and what was told kept beside them.
export function createServerNotifier(
  db: DatabaseSync,
  deps: Pick<RunNotifierDeps, "link" | "send" | "log">,
): RunNotifier {
  return createRunNotifier({
    ...deps,
    url: () => readNotificationUrl(db),
    subject: (projectId) => noticeSubject(db, projectId),
    told: toldFailures(db),
  });
}
