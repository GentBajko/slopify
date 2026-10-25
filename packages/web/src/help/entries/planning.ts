import type { HelpEntry } from "../entry.js";

// Schedules and channels (the current channel, its language and YouTube AI disclosure). The
// cast editor says what each field does in a line under it.
export const planningHelp = {
  // Schedules
  "planning.schedule.missed": {
    title: "Missed run",
    body: "What happens to a run that came due while Slopify was closed or asleep. Skip drops it when it is more than 1 minute late and waits for the next time. Run once when Slopify reopens starts one catch-up run, however many were missed. Default: Skip.",
    tutorial: { page: "Schedules", anchor: "when-it-runs" },
  },
  "planning.schedule.topic-format": {
    title: "How to write the topics",
    body: "Three ways to write the same list; switching keeps everything. One per line fills only the topic keyword. Table adds a column for each keyword a topic sets itself, such as its word count. YAML / JSON holds the same as text, for pasting or keeping in a file.",
    tutorial: { page: "Schedules", anchor: "three-ways-to-write-the-list" },
  },
  "planning.schedule.topic-lines": {
    title: "Topics, one per line",
    body: "Type or paste one topic per line; blank lines are skipped. Each topic fills the keyword under Each topic fills, and the first line is the next run. Every other keyword uses its every-run value.",
    tutorial: { page: "Schedules", anchor: "three-ways-to-write-the-list" },
  },
  "planning.schedule.topic-yaml": {
    title: "Topics as YAML or JSON",
    body: 'A list such as "- Cleopatra", or one map per topic such as "- Topic: Cleopatra" with a line for each keyword it sets, like "Min. Word Count: 12000". A JSON array works too. A keyword a topic leaves out uses its every-run value. The schedule saves only once the list reads.',
    tutorial: { page: "Schedules", anchor: "three-ways-to-write-the-list" },
  },
  "planning.schedule.topic-keyword": {
    title: "Each topic fills",
    body: "The template keyword, such as {{Topic}}, that each queued topic replaces. Default: the keyword the template's project title uses, else the first one. When the title doesn't use it, every project gets the same title.",
    tutorial: { page: "Schedules", anchor: "which-keyword-a-topic-fills" },
  },
  "planning.schedule.every-run": {
    title: "Every-run value",
    body: "The value this keyword gets on every run, such as a word count. Default: the template's own value. A topic that sets the keyword itself, in Table or YAML / JSON, overrides it for that one run.",
    tutorial: { page: "Schedules", anchor: "which-keyword-a-topic-fills" },
  },
  "planning.schedule.held-keywords": {
    title: "Keywords of a waiting topic",
    body: "The template's other keywords, set for this one topic's run, the same as a column in the queue's table. Leave one empty to use the schedule's every-run value (shown greyed). They go with the topic into the queue when you approve it.",
    tutorial: { page: "Schedules", anchor: "approve-held-topics" },
  },

  // Channels
  "planning.channel.ai-disclosure": {
    title: "YouTube AI disclosure",
    body: "Studio's AI use answer for this channel's videos and Shorts, given by Copy for YouTube Studio and the Studio extension. Automatic says Yes only for YouTube's three cases: a voice marked as imitating a real person, real footage altered, or photorealistic AI pictures from a marked Image prompt. Mark voices in Settings → Voices and image prompts in Prompts. Default: Automatic.",
    tutorial: { page: "Publishing-to-YouTube", anchor: "override-per-channel" },
  },
  "planning.channel.language": {
    title: "Language of new projects",
    body: "The language this channel's new projects are written and narrated in when Create or the template picks none. It applies with the channel's look turned off too, since it is not styling. Pick voices that speak it. Not set means English. Projects already made keep their language.",
    tutorial: { page: "Other-Languages", anchor: "set-a-channels-language" },
  },
} as const satisfies Readonly<Record<string, HelpEntry>>;
