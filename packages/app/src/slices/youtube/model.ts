// The optional YouTube description step of the Video stage: a short summary, a chapter list
// YouTube turns into chapters, hashtags, a separate list for YouTube's Tags field, a comment
// to pin under the video, and two more titles for YouTube's title A/B test.
// Browser-safe: Play, Edit project and the project page read these names and limits too.

// YouTube's own rules for chapters in a description: the first starts at 0:00, there are at
// least three, and each lasts at least ten seconds.
export const minChapters = 3;
export const minChapterSeconds = 10;
// YouTube's limits on the Tags field: 500 characters in all, 100 for one tag.
export const tagsMaxCharacters = 500;
export const tagMaxCharacters = 100;
// YouTube ignores every hashtag of a description that has more than 60 (YouTube Help,
// "Use hashtags for YouTube videos"); the first three show above the title.
export const hashtagsMax = 60;
export const hashtagsShownByTitle = 3;
// YouTube's limit on a description.
export const descriptionMaxCharacters = 5000;
// YouTube's title A/B test ("Test & compare") takes up to three titles: the video's own and
// these alternatives. YouTube's limit on a title.
export const alternativeTitles = 2;
export const titleMaxCharacters = 100;
// YouTube's limit on a comment is 10,000; a pinned comment people read in full is a line or
// two. The model is asked for 200; this is the most a hand-picked prompt may make it.
export const pinnedCommentMaxCharacters = 500;

// What a project uses when no Description prompt from the library is picked. No keywords,
// so it never asks Play for a field.
export const defaultDescriptionPrompt = [
  "Write a YouTube description for this video.",
  "",
  "- Summary: a 2-3 sentence hook that says what the viewer gets from watching, in plain words, without clickbait.",
  "- Chapters: split the video where the topic changes, 5-12 chapters for a long video and fewer for a short one. Chapter titles are 2-6 words, in title case, and name what that part covers.",
  "- Hashtags: 3-5 hashtags about the subject, most specific last.",
  "- Tags: 15-25 search terms a viewer might type to find this video, from broad to specific.",
].join("\n");

// The name Play, Edit project and the review summary show for the prompt used when none is
// picked.
export const defaultDescriptionPromptName = "Built-in";

// YouTube's API refuses < and > in a title or a description.
const forbidden = /[<>]/;

// Why YouTube would refuse a title as typed, or undefined when it takes it: at most 100
// characters, no < or >. The project's own title is not this; only the title sent to YouTube.
export function youtubeTitleProblem(title: string): string | undefined {
  const trimmed = title.trim();
  if (trimmed.length > titleMaxCharacters)
    return `YouTube takes titles of up to ${String(titleMaxCharacters)} characters; this one has ${String(trimmed.length)}. Shorten it.`;
  if (forbidden.test(trimmed)) return "YouTube doesn't allow < or > in a title. Remove them.";
  return undefined;
}

// The same for a description: at most 5,000 characters, no < or >.
export function youtubeDescriptionProblem(description: string): string | undefined {
  if (description.length > descriptionMaxCharacters)
    return `YouTube takes descriptions of up to ${descriptionMaxCharacters.toLocaleString("en-US")} characters; this one has ${description.length.toLocaleString("en-US")}. Shorten it.`;
  if (forbidden.test(description))
    return "YouTube doesn't allow < or > in a description. Remove them.";
  return undefined;
}

// The hashtags of a hashtag line, and a warning when YouTube would ignore them all.
export function hashtagNote(line: string): string | undefined {
  const count = line.split(/\s+/u).filter((word) => word.startsWith("#") && word.length > 1).length;
  if (count === 0) return undefined;
  if (count > hashtagsMax)
    return `${String(count)} hashtags: YouTube ignores every hashtag when there are more than ${String(hashtagsMax)}. Remove ${String(count - hashtagsMax)}.`;
  return `${String(count)} hashtag${count === 1 ? "" : "s"}; the first ${String(Math.min(count, hashtagsShownByTitle))} show above the title.`;
}
