import { detectSlots, filledKeywords } from "../admission/substitute.js";
import { isReserved } from "../keywords/model.js";
import type { PlayDraftDocument } from "../play-drafts/schema.js";
import { topicKeywords } from "../project-templates/one-off.js";
import {
  type ProviderChoices,
  withProviderDefaults,
} from "../project-templates/provider-defaults.js";
import { usesPostPrompt } from "../social/rules.js";
import { sectionLabel, type TemplateSection } from "./model.js";

export const freeCheckIds = [
  "keywords",
  "providers",
  "voice",
  "release-slots",
  "monthly-cost",
  "answerers",
] as const;
export type FreeCheckId = (typeof freeCheckIds)[number];

export interface Check {
  readonly id: FreeCheckId;
  readonly ok: boolean;
  readonly sentence: string;
  // Where the failing check is fixed; absent on a check that passed.
  readonly fix?: { readonly label: string; readonly href: string };
}

export type ProviderFamily = "llm" | "tts" | "image";

export interface FreeCheckInput {
  readonly templateId: string;
  readonly document: PlayDraftDocument;
  // The bodies the template's prompts and intro/outro have now (the Library's, else the
  // template's saved copy).
  readonly bodies: readonly string[];
  // Whether each provider this computer has is ready: a key stored, a CLI found.
  readonly providers: ReadonlyMap<string, { readonly name: string; readonly ready: boolean }>;
  // The writer and image service this computer picks for a setup nobody chose them in, which
  // every run of the template uses too (`project-templates/provider-defaults.ts`).
  readonly defaults?: ProviderChoices;
  readonly schedules: readonly ScheduleFit[];
  // The schedules' cost per month at the high estimate, with the steps no price is known for
  // and, when a run couldn't be priced at all, why. Null when no schedule runs this template.
  readonly monthlyCost: {
    readonly high: number;
    readonly unknown: number;
    readonly problem?: string | null;
    // The active schedules' runs a month.
    readonly runs?: number;
    // Paused schedules: nothing a month now, `high` a month once resumed.
    readonly paused?: { readonly schedules: number; readonly runs?: number; readonly high: number };
  } | null;
  // The voices saved in Settings → Voices, which Play's voice list offers. Absent: only that a
  // voice is chosen is checked.
  readonly voices?: readonly { readonly provider: string; readonly voiceId: string }[];
  readonly notificationUrl: boolean;
  // When an agent last reached Slopify through MCP, and now: "someone answers" holds for a week.
  readonly agentSeenAt: string | null;
  readonly now: Date;
}

export interface ScheduleFit {
  readonly id: string;
  readonly name: string;
  readonly topicKeyword: string | null;
  // The weekdays the schedule runs on (0 is Sunday) and the release times it gives each.
  readonly runDays: readonly number[];
  readonly releases: readonly { readonly day: number; readonly shorts: number }[];
  // Paused: it still uses the template, so its gaps are named, marked paused.
  readonly paused?: boolean;
}

const nameOf = (schedule: ScheduleFit): string =>
  schedule.paused === true ? `${schedule.name} (paused)` : schedule.name;

export const studioHref = (templateId: string, section: TemplateSection): string =>
  `/templates/${encodeURIComponent(templateId)}?section=${section}`;
const scheduleHref = (id: string): string =>
  `/calendar?tab=schedules&schedule=${encodeURIComponent(id)}`;
const weekdays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const agentWindowMs = 7 * 24 * 60 * 60 * 1000;

// The checks in order. Providers is one line per missing thing, each with its own fix, so the
// count of lines to fix is the count of things to fix. A run that can't start can't be priced
// either: while a line above says why, the monthly cost's line would only say it again, so it
// waits until they are fixed.
export function freeChecks(input: FreeCheckInput): readonly Check[] {
  const start = [keywordsCheck(input), ...providersChecks(input), voiceCheck(input)];
  const blocked = start.some((check) => !check.ok);
  const cost = monthlyCostCheck(input);
  return [
    ...start,
    releaseSlotsCheck(input),
    ...(blocked && !cost.ok ? [] : [cost]),
    answerersCheck(input),
  ];
}

function list(names: readonly string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names.at(-1) ?? ""}`;
}

// A keyword is filled when it has a value, is the topic a schedule fills each run, or is one
// Slopify fills itself ({{Scene}}, {{Appearance}} and every {{Slopify_…}} name).
function keywordsCheck(input: FreeCheckInput): Check {
  const { form } = input.document;
  const topics = new Set([
    ...topicKeywords(form.title),
    ...input.schedules.flatMap((schedule) =>
      schedule.topicKeyword === null ? [] : [schedule.topicKeyword],
    ),
  ]);
  const names = new Set([form.title, ...input.bodies].flatMap((body) => detectSlots(body).names));
  const empty = [...names].filter(
    (name) =>
      !topics.has(name) &&
      !filledKeywords.includes(name) &&
      // The keywords registry's: an unknown Slopify_ name is refused when the prompt is saved.
      !isReserved(name) &&
      (form.values[name] ?? "").trim() === "",
  );
  if (empty.length === 0)
    return {
      id: "keywords",
      ok: true,
      sentence: "Every keyword has a value or is filled per video.",
    };
  return {
    id: "keywords",
    ok: false,
    sentence: `${empty.length === 1 ? "A keyword is" : "Keywords are"} empty: ${list(empty.map((name) => `{{${name}}}`))}. A run would send the prompt with nothing in ${empty.length === 1 ? "its place" : "their place"}.`,
    fix: {
      label: `Fill them in ${sectionLabel.subject}`,
      href: studioHref(input.templateId, "subject"),
    },
  };
}

function usedProviders(document: PlayDraftDocument): readonly {
  readonly family: ProviderFamily;
  readonly provider: string;
  readonly section: TemplateSection;
  readonly what: string;
}[] {
  const { form } = document;
  const generates = (source: string | undefined): boolean =>
    source !== undefined && source !== "off" && source !== "provide";
  const text =
    generates(form.sources.research) ||
    generates(form.sources.article) ||
    form.sources.thumbnail === "prompt_by_llm" ||
    form.youtubeDescription === true ||
    usesPostPrompt(form) ||
    form.shorts?.enabled === true;
  const reviews =
    form.reviews !== undefined &&
    (form.reviews.reviewer ?? "model") === "model" &&
    Object.values(form.reviews.stages).some((stage) => stage.mode !== "off");
  return [
    ...(text
      ? [
          {
            family: "llm" as const,
            provider: form.llm.provider,
            section: "script" as const,
            what: "writing service",
          },
        ]
      : []),
    ...(generates(form.sources.audio)
      ? [
          {
            family: "tts" as const,
            provider: form.audio.provider,
            section: "voice" as const,
            what: "voice service",
          },
        ]
      : []),
    ...(generates(form.sources.images) || generates(form.sources.thumbnail)
      ? [
          {
            family: "image" as const,
            provider: form.images.provider,
            section: "pictures" as const,
            what: "image service",
          },
        ]
      : []),
    ...(reviews && form.reviews !== undefined
      ? [
          {
            family: "llm" as const,
            provider: form.reviews.provider,
            section: "reviews" as const,
            what: "service for the AI checks",
          },
        ]
      : []),
  ];
}

function providersChecks(input: FreeCheckInput): readonly Check[] {
  const used = usedProviders(withProviderDefaults(input.document, input.defaults ?? {}));
  const unchosen = used.filter(
    (one, index) =>
      one.provider === "" && used.findIndex((other) => other.what === one.what) === index,
  );
  const missing = used.filter(
    (one, index) =>
      one.provider !== "" &&
      input.providers.get(one.provider)?.ready !== true &&
      used.findIndex((other) => other.provider === one.provider) === index,
  );
  const lines = [
    ...unchosen.map(
      (one): Check => ({
        id: "providers",
        ok: false,
        sentence: `No ${one.what} is chosen, so a run can't start.`,
        fix: {
          label: `Choose one in ${sectionLabel[one.section]}`,
          href: studioHref(input.templateId, one.section),
        },
      }),
    ),
    ...missing.map((one): Check => {
      const name = input.providers.get(one.provider)?.name ?? one.provider;
      return {
        id: "providers",
        ok: false,
        sentence: `${name}, the ${one.what}, isn't set up on this computer: no key is stored or its program wasn't found.`,
        fix: {
          label: "Set it up in Settings → Keys & services",
          href: "/settings?section=providers",
        },
      };
    }),
  ];
  return lines.length > 0
    ? lines
    : [{ id: "providers", ok: true, sentence: "Every service this template uses is set up." }];
}

// The narration's voice (and each speaker's) is chosen and is one of the voices this computer
// keeps in Settings → Voices: an imported pack's voice may be someone else's.
function voiceCheck(input: FreeCheckInput): Check {
  const { form } = input.document;
  const voiced = form.sources.audio === "generate";
  const fix = {
    label: `Choose a voice in ${sectionLabel.voice}`,
    href: studioHref(input.templateId, "voice"),
  };
  if (!voiced) return { id: "voice", ok: true, sentence: "The narration isn't voiced by Slopify." };
  const picks = [
    { who: "The narration's", provider: form.audio.provider, voice: form.audio.voice },
    ...(form.voices?.speakers ?? []).map((speaker) => ({
      who: `${speaker.name.trim() === "" ? "A speaker" : speaker.name}'s`,
      provider: speaker.voice.provider,
      voice: speaker.voice.voice,
    })),
  ];
  if (form.audio.voice.trim() === "" && form.voices === undefined)
    return {
      id: "voice",
      ok: false,
      sentence: "No voice is chosen for the narration, so a run can't start.",
      fix,
    };
  const known = input.voices;
  const unknown =
    known === undefined
      ? undefined
      : picks.find(
          (pick) =>
            pick.voice.trim() !== "" &&
            !known.some((one) => one.provider === pick.provider && one.voiceId === pick.voice),
        );
  if (unknown !== undefined)
    return {
      id: "voice",
      ok: false,
      sentence: `${unknown.who} voice (ID ${unknown.voice}) isn't one of your voices in Settings → Voices. Add it there under that ID, or choose one of yours.`,
      fix,
    };
  return { id: "voice", ok: true, sentence: "The narration's voice is one of your voices." };
}

function releaseSlotsCheck(input: FreeCheckInput): Check {
  const shorts = input.document.form.shorts;
  const wanted = shorts?.enabled === true ? Math.max(0, Number.parseInt(shorts.count, 10) || 0) : 0;
  for (const schedule of input.schedules) {
    if (schedule.releases.length === 0) continue;
    const missing = schedule.runDays.filter(
      (day) => !schedule.releases.some((release) => release.day === day),
    );
    if (missing.length > 0)
      return {
        id: "release-slots",
        ok: false,
        sentence: `${nameOf(schedule)} runs on ${list(missing.map((day) => weekdays[day] ?? String(day)))} but has no release time for ${missing.length === 1 ? "that day" : "those days"}.`,
        fix: {
          label: `Add the release times in ${schedule.name}`,
          href: scheduleHref(schedule.id),
        },
      };
    const short = schedule.releases.find((release) => release.shorts < wanted);
    if (short !== undefined)
      return {
        id: "release-slots",
        ok: false,
        sentence: `This template makes ${String(wanted)} shorts a video, but ${nameOf(schedule)} gives ${weekdays[short.day] ?? ""}'s run release times for ${String(short.shorts)}.`,
        fix: {
          label: `Add short release times in ${schedule.name}`,
          href: scheduleHref(schedule.id),
        },
      };
  }
  return {
    id: "release-slots",
    ok: true,
    sentence:
      input.schedules.length === 0
        ? "No schedule runs this template yet."
        : "Every run has a release time for the video and its shorts.",
  };
}

function monthlyCostCheck(input: FreeCheckInput): Check {
  if (input.monthlyCost === null)
    return {
      id: "monthly-cost",
      ok: true,
      sentence: "No schedule runs this template, so it costs nothing a month.",
    };
  const paused = input.monthlyCost.paused?.schedules ?? 0;
  const resumed = `up to about $${(input.monthlyCost.paused?.high ?? 0).toFixed(2)} a month when resumed`;
  const many = (n: number) => `${String(n)} paused ${n === 1 ? "schedule" : "schedules"}`;
  if (input.monthlyCost.unknown === 0) {
    const activeCost = `Its schedules cost up to about $${input.monthlyCost.high.toFixed(2)} a month`;
    return {
      id: "monthly-cost",
      ok: true,
      sentence:
        paused === 0
          ? `${activeCost}.`
          : input.monthlyCost.high === 0 && (input.monthlyCost.runs ?? 0) === 0
            ? `${many(paused)} ${paused === 1 ? "uses" : "use"} this template: ${paused === 1 ? "it costs" : "they cost"} nothing while paused, and ${resumed}.`
            : `${activeCost}; ${many(paused)} would add ${resumed}.`,
    };
  }
  return {
    id: "monthly-cost",
    ok: false,
    sentence:
      input.monthlyCost.problem ??
      `The monthly cost isn't known: ${String(input.monthlyCost.unknown)} ${input.monthlyCost.unknown === 1 ? "step has" : "steps have"} no price in the model list.`,
    fix: { label: "See which in Schedule", href: studioHref(input.templateId, "schedule") },
  };
}

function answerersCheck(input: FreeCheckInput): Check {
  const { form } = input.document;
  const asks =
    (form.checkpoints?.length ?? 0) > 0 ||
    (form.reviews?.reviewer === "agent" &&
      Object.values(form.reviews.stages).some((stage) => stage.mode !== "off"));
  if (!asks)
    return { id: "answerers", ok: true, sentence: "Nothing in a run waits for an answer." };
  const agent =
    input.agentSeenAt !== null &&
    input.now.getTime() - new Date(input.agentSeenAt).getTime() <= agentWindowMs;
  if (input.notificationUrl || agent)
    return {
      id: "answerers",
      ok: true,
      sentence: agent
        ? "An agent connected this week answers when a run pauses."
        : "You're notified when a run pauses for you.",
    };
  return {
    id: "answerers",
    ok: false,
    sentence:
      "A run pauses for your approval and nobody would know: no notification address is set and no agent connected in the last 7 days.",
    fix: {
      label: "Set a notification address in Settings → Notifications",
      href: "/settings?section=notifications",
    },
  };
}
