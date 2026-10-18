import type { DatabaseSync } from "node:sqlite";
import { diskSpaceAt, openRouterKeyLimit } from "./adapters/account-limits.js";
import type { Catalogue } from "./catalog/schema.js";
import type { Clock } from "./kernel/clock.js";
import { causedBy } from "./kernel/errors.js";
import type { Log } from "./kernel/log.js";
import type { HostCliPorts } from "./kernel/ports/host-cli.js";
import { sendWeeklyReport } from "./slices/autopilot/notify.js";
import { type AutopilotProbes, createAutopilotHealth } from "./slices/autopilot/signals.js";
import type { SendNotification } from "./slices/notifications/send.js";
import type { ScheduleDeps } from "./slices/schedules/model.js";
import { cliPathStatus } from "./slices/settings/cli-paths.js";
import type { LoginReader } from "./slices/settings/health.js";
import { keyOf } from "./slices/settings/repo.js";

// ceiling: the first check waits for the server to settle after a start, then runs hourly; the
// weekly report is looked at every quarter hour, so Monday 09:00 is met within 15 minutes.
const firstCheckMs = 30_000;
const checkEveryMs = 60 * 60_000;
const weeklyEveryMs = 15 * 60_000;

// Home's autopilot block reads the hourly check's answers; nothing here blocks a request.
export function startAutopilot(deps: {
  readonly db: DatabaseSync;
  readonly clock: Clock;
  readonly log: Pick<Log, "write">;
  readonly dataDir: string;
  readonly template: ScheduleDeps["template"];
  readonly catalogue: () => Catalogue;
  readonly fetch: typeof fetch;
  readonly send: SendNotification;
  readonly hostCli?: Pick<HostCliPorts, "status"> | undefined;
  readonly readLogin: LoginReader;
}): { readonly latest: () => AutopilotProbes | undefined; readonly stop: () => void } {
  const health = createAutopilotHealth({
    db: deps.db,
    clock: deps.clock,
    log: deps.log,
    template: deps.template,
    catalogue: deps.catalogue,
    cliLogin: async (id, signal) =>
      deps.hostCli === undefined
        ? deps.readLogin(cliPathStatus(deps.db, id).command, id, signal)
        : (await deps.hostCli.status(id)).login,
    openRouterKey: async (signal) => {
      const key = keyOf(deps.db, "openrouter");
      return key === undefined ? null : openRouterKeyLimit(deps.fetch, key, signal);
    },
    disk: () => diskSpaceAt(deps.dataDir),
  });
  const check = (): void => {
    health.refresh().catch((error: unknown) => {
      deps.log.write("error", "autopilot.check", { detail: causedBy(error) });
    });
  };
  const weekly = (): void => {
    sendWeeklyReport({
      db: deps.db,
      clock: deps.clock,
      send: deps.send,
      log: deps.log,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    }).catch((error: unknown) => {
      deps.log.write("error", "autopilot.weekly", { detail: causedBy(error) });
    });
  };
  const first = setTimeout(() => {
    check();
    weekly();
  }, firstCheckMs);
  const checkTimer = setInterval(check, checkEveryMs);
  const weeklyTimer = setInterval(weekly, weeklyEveryMs);
  return {
    latest: health.latest,
    stop: () => {
      clearTimeout(first);
      clearInterval(checkTimer);
      clearInterval(weeklyTimer);
    },
  };
}
