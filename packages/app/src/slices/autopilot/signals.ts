import type { DatabaseSync } from "node:sqlite";
import type { Catalogue } from "../../catalog/schema.js";
import type { Clock } from "../../kernel/clock.js";
import { errorText } from "../../kernel/errors.js";
import type { Log } from "../../kernel/log.js";
import type { HostLlmId } from "../../kernel/ports/host-cli.js";
import { defaultChannelId } from "../channels/model.js";
import { projectChannels, templateChannelId } from "../channels/repo.js";
import type { UsageSlot } from "../model-upkeep/model.js";
import { choiceSites, retiredModelUsage, slotLabels } from "../model-upkeep/usage.js";
import { weekSummary } from "../run-cost/week.js";
import { calendarRange } from "../schedules/agenda.js";
import type { ScheduleDeps } from "../schedules/model.js";
import { scheduleRows } from "../schedules/repo.js";
import type { ScheduleSummary } from "../schedules/schema.js";
import { bufferForecast } from "./buffer.js";
import { type AutopilotView, forecastDays } from "./model.js";
import { readSnoozes, weeklyNotifyOf } from "./repo.js";
import { type AutopilotSignals, type CliLogin, warningsOf } from "./warnings.js";
import { weeklyReport } from "./weekly.js";

const dayMs = 24 * 60 * 60_000;
// ceiling: one probe that hangs is skipped after this, so the hourly check always ends.
export const probeTimeoutMs = 15_000;

const clis: Readonly<Record<HostLlmId, { readonly name: string; readonly signIn: string }>> = {
  "claude-code": { name: "Claude Code", signIn: "claude auth login" },
  codex: { name: "Codex", signIn: "codex login" },
  gemini: { name: "Antigravity CLI", signIn: "agy" },
};
const cliOfProvider = (provider: string): HostLlmId | undefined =>
  provider === "codex-image"
    ? "codex"
    : provider === "claude-code" || provider === "codex" || provider === "gemini"
      ? provider
      : undefined;

export interface AutopilotDeps {
  readonly db: DatabaseSync;
  readonly clock: Clock;
  readonly log: Pick<Log, "write">;
  readonly template: ScheduleDeps["template"];
  readonly catalogue?: (() => Catalogue) | undefined;
  // Asks a CLI whether it is signed in; never starts a run.
  readonly cliLogin?: ((id: HostLlmId, signal: AbortSignal) => Promise<CliLogin>) | undefined;
  // The OpenRouter key's limit and what is left; null with no key or no limit.
  readonly openRouterKey?:
    | ((
        signal: AbortSignal,
      ) => Promise<{ readonly limit: number; readonly remaining: number } | null>)
    | undefined;
  readonly disk?:
    | (() => Promise<{ readonly freeBytes: number; readonly totalBytes: number }>)
    | undefined;
}

// What the hourly check found outside the database. A probe that failed or timed out is left
// out: its warning is not shown rather than guessed.
export interface AutopilotProbes {
  readonly checkedAt: string;
  readonly clis: ReadonlyMap<HostLlmId, CliLogin>;
  readonly openRouter: { readonly limit: number; readonly remaining: number } | null;
  readonly disk: { readonly freeBytes: number; readonly totalBytes: number } | null;
}

const live = (schedule: ScheduleSummary) =>
  schedule.deletedAt === null && (schedule.status === "active" || schedule.status === "paused");

// A design schedule makes designed pieces from dated rows: no video fills a slot, no topic runs
// out and no CLI writes it, so the forecast and its warnings leave it out entirely.
const makesVideos = (schedule: Pick<ScheduleSummary, "templateKind">) =>
  schedule.templateKind !== "design";

// The CLIs an active schedule's template or topic finding chooses: the only ones worth asking.
export function clisInUse(db: DatabaseSync): readonly HostLlmId[] {
  const schedules = scheduleRows(db).filter(
    (one) => one.deletedAt === null && one.status === "active" && makesVideos(one),
  );
  const templates = new Set(schedules.map((one) => one.templateId));
  const ids = new Set(schedules.map((one) => one.id));
  const found = new Set<HostLlmId>();
  for (const site of choiceSites(db)) {
    const used =
      (site.kind === "template" && templates.has(site.id)) ||
      (site.kind === "schedule" && ids.has(site.id));
    if (!used) continue;
    for (const choice of Object.values(site.choices)) {
      const cli = choice === undefined ? undefined : cliOfProvider(choice.provider);
      if (cli !== undefined) found.add(cli);
    }
  }
  for (const schedule of schedules) {
    const cli = cliOfProvider(schedule.topicGeneration.llm?.provider ?? "");
    if (schedule.topicGeneration.mode !== "off" && cli !== undefined) found.add(cli);
  }
  return [...found].sort();
}

async function within<T>(
  deps: Pick<AutopilotDeps, "log">,
  what: string,
  probe: (signal: AbortSignal) => Promise<T>,
): Promise<T | undefined> {
  const signal = AbortSignal.timeout(probeTimeoutMs);
  try {
    return await Promise.race([
      probe(signal),
      new Promise<never>((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(new Error(`${what} took too long`)), {
          once: true,
        });
      }),
    ]);
  } catch (error) {
    deps.log.write("warn", "autopilot.probe", { detail: `${what}: ${errorText(error)}` });
    return undefined;
  }
}

export async function collectProbes(deps: AutopilotDeps): Promise<AutopilotProbes> {
  const asked = await Promise.all(
    clisInUse(deps.db).map(async (id) => {
      const login = deps.cliLogin;
      if (login === undefined) return undefined;
      const answer = await within(deps, `${clis[id].name} sign-in`, (signal) => login(id, signal));
      return answer === undefined ? undefined : ([id, answer] as const);
    }),
  );
  const key = deps.openRouterKey;
  const disk = deps.disk;
  const [openRouter, space] = await Promise.all([
    key === undefined ? undefined : within(deps, "OpenRouter key", key),
    disk === undefined ? undefined : within(deps, "free disk space", () => disk()),
  ]);
  return {
    checkedAt: deps.clock.now().toISOString(),
    clis: new Map(asked.flatMap((one) => (one === undefined ? [] : [one]))),
    openRouter: openRouter ?? null,
    disk: space ?? null,
  };
}

// The hourly check's last answers, held in memory: Home reads them and never waits for a CLI.
export function createAutopilotHealth(deps: AutopilotDeps): {
  readonly latest: () => AutopilotProbes | undefined;
  readonly refresh: () => Promise<AutopilotProbes>;
} {
  let latest: AutopilotProbes | undefined;
  let running: Promise<AutopilotProbes> | undefined;
  return {
    latest: () => latest,
    refresh: () => {
      running ??= collectProbes(deps)
        .then((probes) => {
          latest = probes;
          return probes;
        })
        .finally(() => {
          running = undefined;
        });
      return running;
    },
  };
}

// Home's autopilot block for every channel, or one: the forecast and warnings from the
// database now and the probes' last answers, and the last seven days.
export function autopilotView(
  deps: Pick<AutopilotDeps, "db" | "clock" | "template" | "catalogue">,
  probes: AutopilotProbes | undefined,
  channelId?: string,
): AutopilotView {
  const now = deps.clock.now();
  const until = new Date(now.valueOf() + forecastDays * dayMs);
  const inChannel = (templateId: string) =>
    channelId === undefined || templateChannelId(deps.db, templateId) === channelId;
  const schedules = scheduleRows(deps.db).filter(
    (one) => live(one) && makesVideos(one) && inChannel(one.templateId),
  );
  const ahead = calendarRange(deps, now, until);
  // Finished videos not uploaded: the calendar's longest look back.
  const behind = calendarRange(deps, new Date(now.valueOf() - 91 * dayMs), now);
  const channels = projectChannels(deps.db);
  const ready = behind.ok
    ? behind.value.projects.filter(
        (one) =>
          one.readyToUpload === true &&
          one.setAside !== true &&
          (channelId === undefined || (channels.get(one.id) ?? defaultChannelId) === channelId),
      ).length
    : 0;
  const runs = ahead.ok
    ? ahead.value.runs.filter((run) => makesVideos(run) && inChannel(run.templateId))
    : [];
  const forecast = bufferForecast({
    now,
    until,
    runs,
    ready,
    schedules: schedules.map((one) => ({
      id: one.id,
      name: one.name,
      paused: one.status === "paused",
      queued: one.items.length,
      generation: one.topicGeneration.mode,
      generationFailing: one.topics.error !== null,
      cadence: one.cadence,
      timezone: one.timezone,
    })),
  });
  const active = new Set(schedules.filter((one) => one.status === "active").map((one) => one.id));
  const templates = new Set(
    schedules.filter((one) => active.has(one.id)).map((one) => one.templateId),
  );
  const catalogue = deps.catalogue?.();
  const signals: AutopilotSignals = {
    clis: [...(probes?.clis ?? new Map<HostLlmId, CliLogin>())].map(([id, login]) => ({
      id,
      ...clis[id],
      login,
    })),
    plans: weekSummary(deps.db, now.toISOString()).plans,
    openRouter: probes?.openRouter ?? null,
    disk: probes?.disk ?? null,
    schedules: schedules.map((one) => ({
      id: one.id,
      name: one.name,
      paused: one.status === "paused",
      queued: one.items.length,
      generation: one.topicGeneration.mode,
      topicsError: one.topics.error,
    })),
    retired:
      catalogue === undefined
        ? []
        : retiredModelUsage(deps.db, catalogue).flatMap((use) =>
            (use.kind === "template" && templates.has(use.id)) ||
            (use.kind === "schedule" && active.has(use.id))
              ? [
                  {
                    kind: use.kind,
                    id: use.id,
                    name: use.name,
                    slot: slotLabels[use.slot as UsageSlot],
                    model: use.model,
                    why: use.why,
                    replacement: use.replacement?.name ?? null,
                  },
                ]
              : [],
          ),
  };
  return {
    forecast,
    warnings: warningsOf(signals, readSnoozes(deps.db, now), now),
    checkedAt: probes?.checkedAt ?? null,
    weekly: weeklyReport(
      deps.db,
      new Date(now.valueOf() - 7 * dayMs).toISOString(),
      now.toISOString(),
      channelId,
    ),
    weeklyNotify: weeklyNotifyOf(deps.db),
  };
}
