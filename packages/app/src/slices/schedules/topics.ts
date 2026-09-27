import { z } from "zod";
import { transact } from "../../kernel/db/tx.js";
import type { Message } from "../../kernel/ports/llm.js";
import { liveProject } from "../admission/repo.js";
import { scheduleChannel } from "../channels/repo.js";
import { channelVideoTitles } from "../channels/videos.js";
import type { ScheduleDeps, ScheduleResult } from "./model.js";
import { scheduleById } from "./repo.js";
import {
  type HeldTopic,
  heldTopicSchema,
  queueMax,
  type ScheduleSummary,
  topicMoveSchema,
  topicTitleSchema,
  topicTransferSchema,
} from "./schema.js";
import { newTopics } from "./similar.js";

// A schedule that finds its own topics asks an LLM whenever its queue holds fewer than
// `keepAtLeast`. Only one generation per schedule runs at a time: a lease on the schedule row
// (`topics_generating_at`) is taken before the LLM is asked and cleared after, so a tick and a
// "Generate topics now" press cannot both ask. A lease older than `leaseMs` belongs to a
// generation that died with the process and is taken over.
export const generationTimeoutMs = 10 * 60_000;
const leaseMs = generationTimeoutMs + 5 * 60_000;
// A failure is recorded on the schedule and the next tick after this long tries again, so a
// signed-out CLI or a bad answer is not asked again every 15 seconds.
export const generationRetryMs = 5 * 60_000;
// Asked for on top of what is missing, so the duplicates dropped still leave enough.
const spare = 5;
const askMax = 50;
// The prompt lists every title; this only bounds a pathological library.
const knownMax = 5000;

export type GenerateResult =
  | { readonly ok: true; readonly added: number; readonly mode: "queue" | "hold" }
  | {
      readonly ok: false;
      readonly reason: "not-found" | "off" | "busy" | "full" | "failed";
      readonly message: string;
    };

export function generationWanted(schedule: ScheduleSummary): number {
  const generation = schedule.topicGeneration;
  if (generation.mode === "off") return 0;
  const waiting = schedule.items.length + (generation.mode === "hold" ? schedule.topics.held : 0);
  return Math.max(0, Math.min(generation.keepAtLeast, queueMax) - waiting);
}

// Whether a tick should start a generation for this schedule now.
export function generationDue(schedule: ScheduleSummary, now: Date): boolean {
  if (schedule.deletedAt !== null || schedule.status !== "active") return false;
  if (generationWanted(schedule) === 0) return false;
  if (schedule.topics.generatingSince !== null && !stale(schedule.topics.generatingSince, now))
    return false;
  return (
    schedule.topics.failedAt === null ||
    now.valueOf() - new Date(schedule.topics.failedAt).valueOf() >= generationRetryMs
  );
}

function stale(since: string, now: Date): boolean {
  return now.valueOf() - new Date(since).valueOf() >= leaseMs;
}

// `force` is the "Generate topics now" button: it ignores the retry wait and asks for a few
// even when the queue is full.
export async function generateTopics(
  deps: ScheduleDeps,
  scheduleId: string,
  options: { readonly force?: boolean; readonly signal?: AbortSignal } = {},
): Promise<GenerateResult> {
  const now = deps.clock.now();
  const claimed = transact(deps.db, (): GenerateResult | ScheduleSummary => {
    const schedule = scheduleById(deps.db, scheduleId);
    if (schedule === undefined || schedule.deletedAt !== null)
      return { ok: false, reason: "not-found", message: "This schedule no longer exists." };
    if (schedule.topicGeneration.mode === "off")
      return {
        ok: false,
        reason: "off",
        message:
          "Topic generation is off for this schedule. Turn it on under Edit → Topic generation.",
      };
    if (schedule.status === "canceled" || schedule.status === "completed")
      return {
        ok: false,
        reason: "off",
        message: `This schedule is ${schedule.status}, so it needs no more topics.`,
      };
    if (!options.force && generationWanted(schedule) === 0)
      return { ok: false, reason: "full", message: "The queue already has enough topics." };
    const taken = deps.db
      .prepare(
        `UPDATE schedules SET topics_generating_at=?
         WHERE id=? AND (topics_generating_at IS NULL OR topics_generating_at<=?)`,
      )
      .run(now.toISOString(), scheduleId, new Date(now.valueOf() - leaseMs).toISOString());
    if (Number(taken.changes) !== 1)
      return {
        ok: false,
        reason: "busy",
        message: "Slopify is already generating topics for this schedule. Wait for it to finish.",
      };
    return schedule;
  });
  if ("ok" in claimed) return claimed;
  const schedule = claimed;
  try {
    return await ask(deps, schedule, options);
  } finally {
    deps.db
      .prepare(
        "UPDATE schedules SET topics_generating_at=NULL WHERE id=? AND topics_generating_at=?",
      )
      .run(scheduleId, now.toISOString());
  }
}

async function ask(
  deps: ScheduleDeps,
  schedule: ScheduleSummary,
  options: { readonly force?: boolean; readonly signal?: AbortSignal },
): Promise<GenerateResult> {
  const fail = (message: string): GenerateResult => {
    const failedAt = deps.clock.now();
    const retry =
      "Slopify tries again in 5 minutes, or press Generate topics now on the Schedules screen.";
    const text = `Couldn't generate topics: ${message} ${retry}`;
    deps.db
      .prepare("UPDATE schedules SET topics_failed_at=?,topics_error=? WHERE id=?")
      .run(failedAt.toISOString(), text, schedule.id);
    return { ok: false, reason: "failed", message: text };
  };
  const template = deps.template(schedule.templateId, schedule.templateVersion);
  const llm = schedule.topicGeneration.llm ?? template?.document.form.llm;
  if (llm === undefined)
    return fail(
      "the template this schedule uses was deleted, so there is no LLM to ask. Edit the schedule and choose a template, or pick an LLM under Topic generation.",
    );
  if (deps.topicLlm === undefined)
    return fail("no LLM is available in this Slopify. Restart Slopify and try again.");
  const wanted = Math.max(generationWanted(schedule), options.force ? spare : 0);
  const known = knownTitles(deps, schedule.id);
  const signal = AbortSignal.any([
    AbortSignal.timeout(generationTimeoutMs),
    ...(options.signal === undefined ? [] : [options.signal]),
  ]);
  let answer: string;
  try {
    const answered = await deps.topicLlm({
      owner: { kind: "schedule", id: schedule.id },
      purpose: "topics",
      provider: llm.provider,
      model: llm.model,
      ...(llm.thinking === undefined ? {} : { thinking: llm.thinking }),
      messages: topicMessages(
        withChannelBrief(deps, schedule),
        template?.document.form.title,
        known,
        Math.min(wanted + spare, askMax),
      ),
      signal,
    });
    answer = answered.text;
  } catch (error) {
    if (options.signal?.aborted === true)
      return { ok: false, reason: "failed", message: "Slopify was closing." };
    const detail = error instanceof Error ? error.message : String(error);
    return fail(
      `${llm.provider} (${llm.model}) did not answer: ${detail.trim().slice(0, 300)}. Check it in Settings → Providers, or pick another LLM under Edit → Topic generation.`,
    );
  }
  const suggested = parseTopics(answer);
  if (suggested.length === 0)
    return fail(
      `${llm.provider} (${llm.model}) answered without a list of topics. Try again, or pick another LLM under Edit → Topic generation.`,
    );
  return transact(deps.db, (): GenerateResult => {
    const current = scheduleById(deps.db, schedule.id);
    if (current === undefined || current.deletedAt !== null)
      return { ok: false, reason: "not-found", message: "This schedule no longer exists." };
    // Checked again against what is there now: a topic added while the LLM was thinking counts.
    const fresh = newTopics(suggested, knownTitles(deps, schedule.id)).slice(
      0,
      Math.max(0, Math.min(wanted, queueMax - current.items.length)),
    );
    if (fresh.length === 0)
      return fail(
        "every topic the LLM suggested was already made, queued or turned down for this schedule. Add more detail to the series brief under Edit, so it has new ground to cover.",
      );
    const at = deps.clock.now().toISOString();
    const mode = current.topicGeneration.mode === "hold" ? "hold" : "queue";
    if (mode === "queue") {
      deps.db
        .prepare(
          "UPDATE schedules SET items_json=?,version=version+1,updated_at=? WHERE id=? AND deleted_at IS NULL",
        )
        .run(
          JSON.stringify([...current.items, ...fresh.map((title) => ({ title, values: {} }))]),
          at,
          schedule.id,
        );
    } else {
      const start = nextRank(deps, schedule.id);
      fresh.forEach((title, index) => {
        deps.db
          .prepare(
            `INSERT INTO schedule_topics (id,schedule_id,title,state,rank,created_at)
             VALUES (?,?,?,'held',?,?)`,
          )
          .run(deps.uuid(), schedule.id, title, start + index, at);
      });
    }
    deps.db
      .prepare(
        "UPDATE schedules SET topics_generated_at=?,topics_failed_at=NULL,topics_error=NULL WHERE id=?",
      )
      .run(at, schedule.id);
    if (mode === "hold") {
      const waiting = heldTopics(deps, schedule.id).length;
      try {
        deps.topicsWaiting?.({
          type: "schedule.topics",
          scheduleId: schedule.id,
          scheduleName: current.name,
          added: fresh.length,
          waiting,
        });
      } catch {
        // A notification is never a reason to lose the topics.
      }
    }
    return { ok: true, added: fresh.length, mode };
  });
}

function nextRank(deps: ScheduleDeps, scheduleId: string): number {
  const row = deps.db
    .prepare("SELECT max(rank) AS rank FROM schedule_topics WHERE schedule_id=? AND state='held'")
    .get(scheduleId);
  const rank = z.object({ rank: z.number().nullable() }).parse(row).rank;
  return rank === null ? 0 : rank + 1;
}

// Everything this schedule has queued, held, turned down or used, every project's title, and
// the titles of the videos its channel made before Slopify (Channel page → Existing videos).
export function knownTitles(
  deps: Pick<ScheduleDeps, "db">,
  scheduleId: string,
): { readonly topics: readonly string[]; readonly projects: readonly string[] } {
  const schedule = scheduleById(deps.db, scheduleId);
  const logged = deps.db
    .prepare("SELECT title FROM schedule_topics WHERE schedule_id=? ORDER BY created_at DESC")
    .all(scheduleId)
    .map((row) => z.object({ title: z.string() }).parse(row).title);
  const projects = deps.db
    .prepare(`SELECT title FROM projects WHERE ${liveProject()} ORDER BY created_at DESC`)
    .all()
    .map((row) => z.object({ title: z.string() }).parse(row).title);
  const channel = scheduleChannel(deps.db, scheduleId);
  const existing = channel === undefined ? [] : channelVideoTitles(deps.db, channel.id);
  return {
    topics: [...new Set([...(schedule?.items.map((item) => item.title) ?? []), ...logged])],
    projects: [...new Set([...projects, ...existing])],
  };
}

// A schedule without a brief of its own reads its channel's series brief (the channel of the
// template it runs); one it sets itself wins.
export function withChannelBrief<T extends Pick<ScheduleSummary, "id" | "brief">>(
  deps: Pick<ScheduleDeps, "db">,
  schedule: T,
): T {
  if (schedule.brief?.trim()) return schedule;
  const brief = scheduleChannel(deps.db, schedule.id)?.seriesBrief.trim() ?? "";
  return brief === "" ? schedule : { ...schedule, brief };
}

export function topicMessages(
  schedule: ScheduleSummary,
  templateTitle: string | undefined,
  known: { readonly topics: readonly string[]; readonly projects: readonly string[] },
  count: number,
): readonly Message[] {
  const titles = [...new Set([...known.topics, ...known.projects])].slice(0, knownMax);
  const keyword = schedule.topicKeyword;
  const fills =
    keyword !== null && templateTitle?.includes(`{{${keyword}}}`) === true
      ? `Each topic fills {{${keyword}}} in the video title "${templateTitle}", so write only the topic itself, not a whole title.`
      : "Each topic becomes the video's subject; write it as a short title.";
  const brief = schedule.brief?.trim();
  return [
    {
      role: "system",
      content:
        "You plan the next videos for a YouTube channel. Answer with a JSON array of strings and nothing else.",
    },
    {
      role: "user",
      content: [
        `Suggest ${String(count)} new topics for the series "${schedule.name}".`,
        "",
        "Series brief:",
        brief === undefined || brief === ""
          ? "(none given; work out what the channel covers from the titles below)"
          : brief,
        "",
        `${fills} Keep each under 120 characters.`,
        "Rank them most view-worthy first: the topics most likely to be watched, as the brief defines it.",
        "",
        titles.length === 0
          ? "Nothing has been made for this channel yet."
          : "Never repeat or rephrase any of these, which were already made, queued or turned down:",
        ...titles.map((title) => `- ${title}`),
      ].join("\n"),
    },
  ];
}

// A JSON array of strings, or failing that one topic per line with bullets and numbers dropped.
export function parseTopics(answer: string): string[] {
  const start = answer.indexOf("[");
  const end = answer.lastIndexOf("]");
  let lines: unknown[] | undefined;
  if (start !== -1 && end > start) {
    try {
      const parsed: unknown = JSON.parse(answer.slice(start, end + 1));
      if (Array.isArray(parsed)) lines = parsed;
    } catch {
      lines = undefined;
    }
  }
  lines ??= answer.split(/\r?\n/);
  return lines
    .map((line) =>
      typeof line === "string"
        ? line
        : typeof line === "object" && line !== null && "title" in line
          ? String(line.title)
          : "",
    )
    .map((line) =>
      line
        .replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "")
        .replace(/^["'“”]+|["'“”,]+$/g, "")
        .replace(/\s+/g, " ")
        .trim(),
    )
    .filter((line) => line !== "" && line !== "[" && line !== "]" && line.length <= 200);
}

export function heldTopics(
  deps: Pick<ScheduleDeps, "db">,
  scheduleId: string,
): readonly HeldTopic[] {
  return deps.db
    .prepare(
      `SELECT id,title,rank,created_at FROM schedule_topics
       WHERE schedule_id=? AND state='held' ORDER BY rank,created_at,id`,
    )
    .all(scheduleId)
    .map((row) => {
      const value = z
        .object({ id: z.string(), title: z.string(), rank: z.number(), created_at: z.string() })
        .parse(row);
      return heldTopicSchema.parse({
        id: value.id,
        title: value.title,
        rank: value.rank,
        createdAt: value.created_at,
      });
    });
}

function openSchedule(deps: ScheduleDeps, scheduleId: string): ScheduleResult<ScheduleSummary> {
  const schedule = scheduleById(deps.db, scheduleId);
  if (schedule === undefined || schedule.deletedAt !== null)
    return { ok: false, reason: "not-found" };
  if (schedule.status === "canceled" || schedule.status === "completed")
    return { ok: false, reason: "conflict" };
  return { ok: true, value: schedule };
}

// Approved topics join the end of the queue in their ranked order. `edits` renames a topic
// as it is approved.
export function approveHeldTopics(
  deps: ScheduleDeps,
  scheduleId: string,
  ids: readonly string[] | "all",
  edits: Readonly<Record<string, string>> = {},
): ScheduleResult<ScheduleSummary> {
  return transact(deps.db, () => {
    const open = openSchedule(deps, scheduleId);
    if (!open.ok) return open;
    const held = heldTopics(deps, scheduleId);
    const chosen = ids === "all" ? held : held.filter((topic) => ids.includes(topic.id));
    if (ids !== "all" && chosen.length !== ids.length)
      return { ok: false, reason: "topic-not-found" };
    const titles: string[] = [];
    for (const topic of chosen) {
      const title = topicTitleSchema.safeParse(edits[topic.id] ?? topic.title);
      if (!title.success) return { ok: false, reason: "invalid-input" };
      titles.push(title.data);
    }
    if (open.value.items.length + titles.length > queueMax)
      return { ok: false, reason: "queue-full" };
    const at = deps.clock.now().toISOString();
    for (const topic of chosen)
      deps.db.prepare("DELETE FROM schedule_topics WHERE id=?").run(topic.id);
    deps.db
      .prepare("UPDATE schedules SET items_json=?,version=version+1,updated_at=? WHERE id=?")
      .run(
        JSON.stringify([...open.value.items, ...titles.map((title) => ({ title, values: {} }))]),
        at,
        scheduleId,
      );
    return { ok: true, value: scheduleById(deps.db, scheduleId) as ScheduleSummary };
  });
}

// Turned down topics stay recorded so no later generation suggests them again.
export function rejectHeldTopic(
  deps: ScheduleDeps,
  scheduleId: string,
  topicId: string,
): ScheduleResult<ScheduleSummary> {
  const changed = deps.db
    .prepare(
      `UPDATE schedule_topics SET state='rejected',decided_at=?
       WHERE id=? AND schedule_id=? AND state='held'`,
    )
    .run(deps.clock.now().toISOString(), topicId, scheduleId);
  if (Number(changed.changes) !== 1) return { ok: false, reason: "topic-not-found" };
  return { ok: true, value: scheduleById(deps.db, scheduleId) as ScheduleSummary };
}

export function editHeldTopic(
  deps: ScheduleDeps,
  scheduleId: string,
  topicId: string,
  title: string,
): ScheduleResult<HeldTopic> {
  const parsed = topicTitleSchema.safeParse(title);
  if (!parsed.success) return { ok: false, reason: "invalid-input" };
  const changed = deps.db
    .prepare("UPDATE schedule_topics SET title=? WHERE id=? AND schedule_id=? AND state='held'")
    .run(parsed.data, topicId, scheduleId);
  if (Number(changed.changes) !== 1) return { ok: false, reason: "topic-not-found" };
  const topic = heldTopics(deps, scheduleId).find((row) => row.id === topicId);
  return topic === undefined
    ? { ok: false, reason: "topic-not-found" }
    : { ok: true, value: topic };
}

// Moves one queued topic to another position. Each run takes the first topic, so this is
// also what reorders the calendar.
export function moveTopic(
  deps: ScheduleDeps,
  scheduleId: string,
  input: unknown,
): ScheduleResult<ScheduleSummary> {
  const parsed = topicMoveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid-input" };
  return transact(deps.db, () => {
    const open = openSchedule(deps, scheduleId);
    if (!open.ok) return open;
    const schedule = open.value;
    if (schedule.version !== parsed.data.baseVersion) return { ok: false, reason: "conflict" };
    const { from } = parsed.data;
    if (from >= schedule.items.length) return { ok: false, reason: "invalid-input" };
    const items = [...schedule.items];
    const [topic] = items.splice(from, 1);
    if (topic === undefined) return { ok: false, reason: "invalid-input" };
    items.splice(Math.min(parsed.data.to, items.length), 0, topic);
    writeItems(deps, scheduleId, schedule.version, items);
    return { ok: true, value: scheduleById(deps.db, scheduleId) as ScheduleSummary };
  });
}

// Takes one queued topic off this schedule and puts it on another's queue.
export function transferTopic(
  deps: ScheduleDeps,
  scheduleId: string,
  input: unknown,
): ScheduleResult<{ readonly source: ScheduleSummary; readonly target: ScheduleSummary }> {
  const parsed = topicTransferSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid-input" };
  if (parsed.data.targetId === scheduleId) return { ok: false, reason: "invalid-input" };
  return transact(deps.db, () => {
    const source = openSchedule(deps, scheduleId);
    if (!source.ok) return source;
    const target = openSchedule(deps, parsed.data.targetId);
    if (!target.ok) return target;
    if (source.value.version !== parsed.data.baseVersion) return { ok: false, reason: "conflict" };
    const items = [...source.value.items];
    const [topic] = items.splice(parsed.data.index, 1);
    if (topic === undefined) return { ok: false, reason: "invalid-input" };
    if (target.value.items.length + 1 > queueMax) return { ok: false, reason: "queue-full" };
    const landing = [...target.value.items];
    landing.splice(Math.min(parsed.data.position ?? landing.length, landing.length), 0, topic);
    writeItems(deps, scheduleId, source.value.version, items);
    writeItems(deps, target.value.id, target.value.version, landing);
    return {
      ok: true,
      value: {
        source: scheduleById(deps.db, scheduleId) as ScheduleSummary,
        target: scheduleById(deps.db, target.value.id) as ScheduleSummary,
      },
    };
  });
}

function writeItems(
  deps: ScheduleDeps,
  scheduleId: string,
  version: number,
  items: ScheduleSummary["items"],
): void {
  deps.db
    .prepare(
      "UPDATE schedules SET items_json=?,version=version+1,updated_at=? WHERE id=? AND version=?",
    )
    .run(JSON.stringify(items), deps.clock.now().toISOString(), scheduleId, version);
}

// Boot: a generation cannot outlive the process that asked.
export function releaseTopicLeases(deps: Pick<ScheduleDeps, "db">): void {
  deps.db.prepare("UPDATE schedules SET topics_generating_at=NULL").run();
}
