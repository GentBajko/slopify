import {
  type PostCount,
  type PostingExtension,
  type PostSchedule,
  type PostStatus,
  type PostTextSource,
  platformLabels,
  type SocialPlatform,
} from "@app/slices/social/model.js";
import type { Tone } from "@/components/kit/status";
import { groupedNumber } from "@/lib/format";

// The words the post panel shows, kept apart from the components so each sentence is tested.

// Why Fill in <site> can't be pressed yet, from what the extension last reported; undefined
// when it can.
export function fillBlocked(
  extension: PostingExtension,
  platform: SocialPlatform,
): string | undefined {
  const site = platformLabels[platform];
  if (!extension.paired)
    return "Install and pair the Slopify Studio extension first (Settings → YouTube Studio and posting)";
  if (extension.sites === null)
    return "Update the Slopify Studio extension: the paired one can't fill posts yet. Then open its options and allow the sites";
  if (!extension.sites.includes(platform))
    return `In the extension's options, press Allow posting on ${site}, then reload this page`;
  return undefined;
}

// When the post goes out and who presses what.
export function releaseLine(
  schedule: PostSchedule,
  platform: SocialPlatform,
  when: (iso: string) => string,
): string {
  const site = platformLabels[platform];
  if (schedule.mode === "native" && schedule.at !== null)
    return `Scheduled in ${site}'s own scheduler for ${when(schedule.at)}. You press Schedule.`;
  if (schedule.mode === "at-release" && schedule.at !== null)
    return `Fills at release time (${when(schedule.at)}) in a background tab; you press Post on ${site}.`;
  return `Goes out when you press Post on ${site}.`;
}

export function stateLine(
  status: PostStatus,
  platform: SocialPlatform,
  when: (iso: string) => string,
): { readonly tone: Tone; readonly text: string } {
  const site = platformLabels[platform];
  const at = status.at === null ? "" : ` · ${when(status.at)}`;
  switch (status.state) {
    case "none":
      return { tone: "off", text: "Not filled yet" };
    case "waiting":
      return { tone: "waiting", text: `Waiting for the extension to fill it on ${site}${at}` };
    case "filling":
      return { tone: "running", text: `The extension is filling it on ${site}` };
    case "filled":
      return { tone: "waiting", text: `Filled on ${site}: check it and press Post there${at}` };
    case "scheduled":
      return { tone: "done", text: `Scheduled on ${site}${at}` };
    case "posted":
      return { tone: "done", text: `Posted on ${site}${at}` };
    case "failed":
      return {
        tone: "failed",
        text: `Fill stopped: ${status.message ?? `the extension couldn't fill ${site}'s form. Press Fill in ${site} again.`}`,
      };
  }
}

// "142 / 280": the post's length the way the site counts it.
export function countLine(count: PostCount): string {
  const base = `${groupedNumber.format(count.used)} / ${groupedNumber.format(count.max)}`;
  const over = count.used - count.max;
  if (over > 0) return `${base} · ${groupedNumber.format(over)} over`;
  return count.unit === "weighted" ? `${base} · links count as 23` : base;
}

export const textSourceLabels: Readonly<Record<PostTextSource, string>> = {
  summary: "Summary",
  description: "YouTube description",
  title: "Title",
  prompt: "Written by a post prompt",
  custom: "My own text",
  none: "No text",
};

// The text sources a picker offers. A post prompt is a paid call, so it is offered only where
// Save shows its price (Play, Template Studio) or where it is already the choice.
export function textSourceOptions(
  withPrompt: boolean,
): readonly { readonly value: PostTextSource; readonly label: string }[] {
  const order: readonly PostTextSource[] = [
    "summary",
    "description",
    "title",
    ...(withPrompt ? (["prompt"] as const) : []),
    "custom",
    "none",
  ];
  return order.map((value) => ({ value, label: textSourceLabels[value] }));
}
