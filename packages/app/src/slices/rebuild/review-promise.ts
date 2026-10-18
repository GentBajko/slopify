import { plainText } from "../article/plain.js";
import { splitEndMatter } from "../article/split.js";
import { spokenWordsPerMinute } from "../images/scale.js";
import { normalizeNarrationText } from "../narration/plan.js";

// How long the opening the promise check reads lasts: the span in which a viewer decides
// whether the video is what its title and thumbnail said.
export const promiseOpeningSeconds = 30;

// The article as the voice would say it (no Markdown, no end matter: what `recipe-text.ts`
// hands the narration), so the reviewer reads what the viewer will hear.
export function spokenArticle(markdown: string): string {
  return normalizeNarrationText(plainText(splitEndMatter(markdown).body));
}

// The spoken text cut after the words said in the opening seconds, its own line breaks kept.
export function openingOf(
  spoken: string,
  seconds: number = promiseOpeningSeconds,
  wordsPerMinute: number = spokenWordsPerMinute,
): string {
  const words = Math.round((seconds * wordsPerMinute) / 60);
  let end = 0;
  let count = 0;
  for (const match of spoken.matchAll(/\S+/g)) {
    if (count === words) break;
    count += 1;
    end = match.index + match[0].length;
  }
  return spoken.slice(0, end);
}
