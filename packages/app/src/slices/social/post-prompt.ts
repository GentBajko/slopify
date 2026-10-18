// The request that writes a post for another site with a Library prompt of kind "post" (or the
// built-in one), and the check its answer must pass. Pure.

import type { Message } from "../../kernel/ports/llm.js";
import { limitsFor, type PlatformLimits } from "./limits.js";
import { platformLabels, type SocialPlatform } from "./model.js";
import { countFor } from "./text.js";

// Changing it changes every post written with the built-in prompt, so it ships with a new
// recipe operation version.
export const defaultPostPrompt =
  "Write one post that makes people want to watch the video. Use the article's own facts, open with its most striking one, and write the way people write on this site.";

// A post written by a prompt is held to the site's limit, and never longer than this: a post,
// not an article.
const writtenMax = 3000;

export interface PostTarget {
  readonly platform: SocialPlatform;
  readonly max: number;
  readonly unit: PlatformLimits["unit"];
}

// The limit a written post must keep: the site's free limit (X Premium's longer posts are the
// person's to write), at most `writtenMax`.
export function postTarget(platform: SocialPlatform): PostTarget {
  const limits = limitsFor(platform);
  return { platform, max: Math.min(limits.text, writtenMax), unit: limits.unit };
}

export function postMessages(input: {
  readonly instruction: string;
  readonly target: PostTarget;
  readonly title: string;
  readonly article: string;
}): readonly Message[] {
  const site = platformLabels[input.target.platform];
  return [
    {
      role: "system",
      content: [
        `You write one ${site} post about a narrated video, from its article.`,
        input.instruction.trim() === "" ? defaultPostPrompt : input.instruction.trim(),
        `Keep it within ${String(input.target.max)} characters as ${site} counts them.`,
        "Leave out hashtags and links: they are added after you.",
        "Answer with the post's text and nothing else.",
      ].join("\n\n"),
    },
    {
      role: "user",
      content: [`Video: ${input.title}`, `Article:\n\n${input.article}`].join("\n\n"),
    },
  ];
}

// The post as it is kept: without quotes around it.
export function postText(answer: string): string {
  const trimmed = answer.trim();
  const quoted = /^(["“'])([\s\S]*)(["”'])$/u.exec(trimmed);
  return (quoted?.[2] ?? trimmed).trim();
}

// Why an answer can't be kept, or undefined when it can. A failed check is a failed attempt,
// which the provider wrapper asks again while attempts remain.
export function checkPost(answer: string, target: PostTarget): string | undefined {
  const site = platformLabels[target.platform];
  const text = postText(answer);
  const fix =
    "Use Try again; if it keeps happening, shorten what the post prompt asks for in Library → Prompts → Post, or choose another model in Edit project → Providers.";
  if (text === "") return `The AI model sent back an empty ${site} post. ${fix}`;
  const used = countFor(text, target.unit);
  if (used > target.max)
    return `The AI model's ${site} post is ${String(used)} characters; it may be at most ${String(target.max)}. ${fix}`;
  return undefined;
}
