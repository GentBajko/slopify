import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import type { DatabaseSync } from "node:sqlite";
import type { Clock } from "../../kernel/clock.js";
import type { ProjectEvent } from "../../kernel/events.js";
import type { Log } from "../../kernel/log.js";
import type { Paths } from "../../kernel/paths.js";
import type { Message } from "../../kernel/ports/llm.js";
import type {
  StandaloneLlm,
  StandaloneLlmAnswer,
  StandaloneLlmCall,
} from "../../kernel/runner/standalone.js";
import type { ProviderChoice, RunConfig } from "../admission/model.js";
import { projectById } from "../admission/repo.js";
import { castMentions } from "../channels/cast-match.js";
import type { CastSnapshot } from "../channels/model.js";
import { castOfChannel, projectChannelId } from "../channels/repo.js";
import { outputPath } from "../storage/layout.js";
import { outputsOf } from "../storage/repo.js";
import { episodeMemoryOn, memoryOfProject, saveGeneratedMemory } from "./repo.js";

// When a project finishes, a small LLM call writes what the episode covered (at most
// `summaryWordsMax` words) for its channel's episode memory. It never fails the project: every
// failure is logged and the project stays done.

export const summaryWordsMax = 150;
// Part of the cached recipe: raising it makes every finished article summarised afresh.
const promptVersion = 1;
// Only the start of a long article is sent; the summary names what it covers, not every detail.
const articleCharsMax = 24_000;
const timeoutMs = 3 * 60_000;

// Asked through `kernel/runner/standalone.ts`: the stage calls' retries, and the call lands on
// Home's run cost against the channel, since the project is already done.
export type EpisodeLlmCall = StandaloneLlmCall;
export type EpisodeLlmAnswer = StandaloneLlmAnswer;

export interface EpisodeSummaryDeps {
  readonly db: DatabaseSync;
  readonly paths: Paths;
  readonly clock: Clock;
  readonly log: Log;
  readonly uuid: () => string;
  readonly llm: StandaloneLlm;
}

export type SummaryOutcome =
  | "saved"
  | "off"
  | "unchanged"
  | "edited"
  | "no-article"
  | "no-llm"
  | "gone"
  | "failed";

export function summaryMessages(title: string, article: string): readonly Message[] {
  return [
    {
      role: "system",
      content: `You keep a YouTube channel's episode log. Answer with the summary alone: plain prose, at most ${String(summaryWordsMax)} words, no heading, no list.`,
    },
    {
      role: "user",
      content: [
        `Summarise the episode "${title}" for the writers of later episodes: what it covered, the key facts and claims it made, the people, characters and places it featured and what happened to them, and how it ended. Later episodes read this so they don't contradict it.`,
        "",
        "The episode's text:",
        "",
        article.length > articleCharsMax ? `${article.slice(0, articleCharsMax)}…` : article,
      ].join("\n"),
    },
  ];
}

// Trims a summary that ran long to its first `summaryWordsMax` words.
export function clampSummary(text: string): string {
  const words = text.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  return words.length <= summaryWordsMax
    ? words.join(" ")
    : `${words.slice(0, summaryWordsMax).join(" ")}…`;
}

export async function summarizeEpisode(
  deps: EpisodeSummaryDeps,
  projectId: string,
  signal?: AbortSignal,
): Promise<SummaryOutcome> {
  try {
    return await summarize(deps, projectId, signal);
  } catch (error) {
    // Slopify is closing; the next finish of this project writes it.
    if (signal?.aborted === true) return "failed";
    deps.log.write("warn", "episode.memory", {
      projectId,
      detail: `The episode summary wasn't saved: ${error instanceof Error ? error.message : String(error)}. The project is unaffected; only later episodes won't be reminded of this one. Check the project's text model in Settings → Providers.`,
    });
    return "failed";
  }
}

async function summarize(
  deps: EpisodeSummaryDeps,
  projectId: string,
  signal: AbortSignal | undefined,
): Promise<SummaryOutcome> {
  const project = projectById(deps.db, projectId);
  if (project === undefined) return "gone";
  const channelId = projectChannelId(deps.db, projectId);
  if (!episodeMemoryOn(deps.db, channelId)) return "off";
  const existing = memoryOfProject(deps.db, projectId);
  if (existing?.source === "edited") return "edited";
  const article = articleText(deps, projectId);
  if (article === undefined) return "no-article";
  const recipe = createHash("sha256")
    .update(JSON.stringify([promptVersion, project.title, article]))
    .digest("hex");
  if (existing?.recipe === recipe) return "unchanged";
  const choice = llmOf(project.config);
  if (choice === undefined) {
    deps.log.write("info", "episode.memory", {
      projectId,
      detail:
        "No episode summary: this project has no text model chosen, so later episodes won't be reminded of it.",
    });
    return "no-llm";
  }
  const answer = await deps.llm({
    owner: { kind: "channel", id: channelId },
    purpose: "episode-summary",
    provider: choice.provider,
    model: choice.model,
    messages: summaryMessages(project.title, article),
    signal: AbortSignal.any([
      AbortSignal.timeout(timeoutMs),
      ...(signal === undefined ? [] : [signal]),
    ]),
  });
  const summary = clampSummary(answer.text);
  if (summary === "") throw new Error(`${choice.provider} (${choice.model}) answered with nothing`);
  // Read again: the project may have been deleted, or the summary edited, while the LLM wrote.
  if (projectById(deps.db, projectId) === undefined) return "gone";
  if (memoryOfProject(deps.db, projectId)?.source === "edited") return "edited";
  saveGeneratedMemory(
    deps.db,
    {
      id: existing?.id ?? deps.uuid(),
      channelId,
      projectId,
      title: project.title,
      summary,
      cast: castMentions(
        `${project.title}\n${article}`,
        castOf(deps.db, project.config, channelId),
      ).map((member) => member.name),
      recipe,
    },
    deps.clock.now().toISOString(),
  );
  return "saved";
}

// The project's own text model; failing that, the one its automatic reviews use.
function llmOf(config: RunConfig): ProviderChoice | undefined {
  if (config.llm !== undefined) return config.llm;
  return config.reviews === undefined
    ? undefined
    : { provider: config.reviews.provider, model: config.reviews.model };
}

// The cast the run was started with, else the channel's cast as it is now.
function castOf(db: DatabaseSync, config: RunConfig, channelId: string): readonly CastSnapshot[] {
  if (config.cast !== undefined && config.cast.length > 0) return config.cast;
  return castOfChannel(db, channelId).map((member) => ({
    name: member.name,
    aliases: member.aliases,
    description: member.description,
    images: [],
  }));
}

function articleText(deps: EpisodeSummaryDeps, projectId: string): string | undefined {
  const output = outputsOf(deps.db, projectId).find((row) => row.role === "article_txt");
  if (output === undefined) return undefined;
  const path = outputPath(deps.paths, projectId, output.path);
  if (!existsSync(path)) return undefined;
  const text = readFileSync(path, "utf8").trim();
  return text === "" ? undefined : text;
}

// Watches the project events for a project that has just finished and summarises it in the
// background. One summary per project at a time; `close` stops new ones at shutdown and
// aborts the ones in flight.
export interface EpisodeMemoryWatcher {
  readonly observe: (event: ProjectEvent) => void;
  readonly settled: () => Promise<void>;
  readonly close: () => void;
}

export function createEpisodeMemoryWatcher(deps: EpisodeSummaryDeps): EpisodeMemoryWatcher {
  const inflight = new Map<string, Promise<void>>();
  const stop = new AbortController();
  return {
    observe: (event) => {
      if (stop.signal.aborted || event.type !== "project.state" || event.state !== "done") return;
      const projectId = event.projectId;
      if (inflight.has(projectId)) return;
      const running = (async () => {
        // Off the emitter's call stack: it may be inside a transaction.
        await Promise.resolve();
        await summarizeEpisode(deps, projectId, stop.signal);
      })().finally(() => {
        inflight.delete(projectId);
      });
      inflight.set(projectId, running);
    },
    settled: async () => {
      while (inflight.size > 0) await Promise.all([...inflight.values()]);
    },
    close: () => {
      stop.abort();
    },
  };
}
