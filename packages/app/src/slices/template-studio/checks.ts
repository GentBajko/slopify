import { detectSlots, filledKeywords } from "../admission/substitute.js";
import type { PlayDraftDocument } from "../play-drafts/schema.js";
import { topicKeywords } from "../project-templates/one-off.js";
import { sectionLabel, type TemplateSection } from "./model.js";

export const freeCheckIds = [
  "keywords",
  "providers",
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
  readonly schedules: readonly ScheduleFit[];
  // The schedules' cost per month at the high estimate, with the steps no price is known for
  // and, when a run couldn't be priced at all, why. Null when no schedule runs this template.
  readonly monthlyCost: {
    readonly high: number;
    readonly unknown: number;
    readonly problem?: string | null;
  } | null;
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
}

export const studioHref = (templateId: string, section: TemplateSection): string =>
  `/templates/${encodeURIComponent(templateId)}?section=${section}`;
const scheduleHref = (id: string): string =>
  `/calendar?tab=schedules&schedule=${encodeURIComponent(id)}`;
const weekdays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const agentWindowMs = 7 * 24 * 60 * 60 * 1000;

export function freeChecks(input: FreeCheckInput): readonly Check[] {
  return [
    keywordsCheck(input),
    providersCheck(input),
    releaseSlotsCheck(input),
    monthlyCostCheck(input),
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
      !name.startsWith("Slopify_") &&
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
      label: "Fill the keywords in Subject & research",
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
            what: "text model",
          },
        ]
      : []),
    ...(generates(form.sources.audio)
      ? [
          {
            family: "tts" as const,
            provider: form.audio.provider,
            section: "voice" as const,
            what: "voice",
          },
        ]
      : []),
    ...(generates(form.sources.images) || generates(form.sources.thumbnail)
      ? [
          {
            family: "image" as const,
            provider: form.images.provider,
            section: "pictures" as const,
            what: "picture model",
          },
        ]
      : []),
    ...(reviews && form.reviews !== undefined
      ? [
          {
            family: "llm" as const,
            provider: form.reviews.provider,
            section: "reviews" as const,
            what: "reviewer model",
          },
        ]
      : []),
  ];
}

function providersCheck(input: FreeCheckInput): Check {
  const used = usedProviders(input.document);
  const unchosen = used.find((one) => one.provider === "");
  if (unchosen !== undefined)
    return {
      id: "providers",
      ok: false,
      sentence: `No ${unchosen.what} is chosen, so the run can't start.`,
      fix: {
        label: `Choose one in ${sectionLabel[unchosen.section]}`,
        href: studioHref(input.templateId, unchosen.section),
      },
    };
  const missing = used.find((one) => input.providers.get(one.provider)?.ready !== true);
  if (missing === undefined)
    return { id: "providers", ok: true, sentence: "Every provider this template uses is set up." };
  const name = input.providers.get(missing.provider)?.name ?? missing.provider;
  return {
    id: "providers",
    ok: false,
    sentence: `${name} (the ${missing.what}) isn't set up on this computer: no key is stored or its program wasn't found.`,
    fix: { label: "Set it up in Settings → Providers", href: "/settings?section=providers" },
  };
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
        sentence: `${schedule.name} runs on ${list(missing.map((day) => weekdays[day] ?? String(day)))} but has no release time for ${missing.length === 1 ? "that day" : "those days"}.`,
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
        sentence: `This template makes ${String(wanted)} shorts a video, but ${schedule.name} gives ${weekdays[short.day] ?? ""}'s run release times for ${String(short.shorts)}.`,
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
  if (input.monthlyCost.unknown === 0)
    return {
      id: "monthly-cost",
      ok: true,
      sentence: `Its schedules cost up to about $${input.monthlyCost.high.toFixed(2)} a month.`,
    };
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
        ? "An agent connected this week answers the checkpoints."
        : "You're notified when a checkpoint waits.",
    };
  return {
    id: "answerers",
    ok: false,
    sentence:
      "A run stops at a checkpoint and nobody would know: no notification address is set and no agent connected in the last 7 days.",
    fix: {
      label: "Set a notification address in Settings → Notifications",
      href: "/settings?section=notifications",
    },
  };
}
