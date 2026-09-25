// The optional YouTube description step of the Video stage: a short summary, a chapter list
// YouTube turns into chapters, hashtags, and a separate list for YouTube's Tags field.
// Browser-safe: Play, Edit project and the project page read these names and limits too.

// YouTube's own rules for chapters in a description: the first starts at 0:00, there are at
// least three, and each lasts at least ten seconds.
export const minChapters = 3;
export const minChapterSeconds = 10;
// YouTube's limits on the Tags field: 500 characters in all, 100 for one tag.
export const tagsMaxCharacters = 500;
export const tagMaxCharacters = 100;
// YouTube ignores every hashtag of a description that has more than 15.
export const hashtagsMax = 15;
// YouTube's limit on a description.
export const descriptionMaxCharacters = 5000;

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
