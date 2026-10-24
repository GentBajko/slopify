import type { HelpEntry } from "../entry.js";

// Schedules and channels (the current channel, its language and YouTube AI disclosure). The
// cast editor says what each field does in a line under it.
export const planningHelp = {
  // Schedules
  "planning.schedule.name": {
    title: "Schedule name",
    body: "A name to tell this schedule apart in the list, on the calendar and on the channel page. It never appears in the videos. Up to 200 characters.",
    tutorial: { page: "Schedules", anchor: "create-a-schedule" },
  },
  "planning.schedule.template": {
    title: "Template",
    body: "The saved template each run starts from, with its version. Each run uses the template's newest version until you press Mark ready in Edit template; from then on runs use the newest version marked ready, and a version you save later waits until you mark it ready. The template decides the services, and so what each run costs. Save templates from Create; they are listed under Templates.",
    tutorial: { page: "Schedules", anchor: "create-a-schedule" },
  },
  "planning.schedule.cadence": {
    title: "Cadence",
    body: "How often the schedule runs. Every day runs once a day at the local time. Selected weekdays runs on the days you tick. One time runs once at a date and time, then completes. Each run starts one project. Default: Every day at 09:00.",
    tutorial: { page: "Schedules", anchor: "when-it-runs" },
  },
  "planning.schedule.time": {
    title: "Local time",
    body: "The clock time each run starts, read in the timezone below. Default: 09:00. A run only starts while Slopify is open; Missed run decides what happens when it was closed.",
    tutorial: { page: "Schedules", anchor: "when-it-runs" },
  },
  "planning.schedule.once-at": {
    title: "Run at",
    body: "The date and time of the single run, read in the timezone below. After that run starts, the schedule shows as completed.",
    tutorial: { page: "Schedules", anchor: "when-it-runs" },
  },
  "planning.schedule.weekdays": {
    title: "Weekdays",
    body: "The days a Selected weekdays schedule runs, each at the local time. Tick at least one; each ticked day is one project a week. Default: Mon, Wed and Fri.",
    tutorial: { page: "Schedules", anchor: "when-it-runs" },
  },
  "planning.schedule.timezone": {
    title: "Timezone",
    body: "The IANA zone the run time is read in, such as Europe/Tirane or America/New_York. Default: this computer's zone. When clocks go back, a repeated time uses the earlier one; a time skipped when clocks go forward moves forward by the gap.",
    tutorial: { page: "Schedules", anchor: "when-it-runs" },
  },
  "planning.schedule.timezone-once": {
    title: "Timezone",
    body: "The IANA zone the one-off date and time are read in, such as Europe/Tirane or America/New_York. Default: this computer's zone. When clocks go back, a repeated time uses the earlier one; nonexistent spring-forward times are refused, so pick another.",
    tutorial: { page: "Schedules", anchor: "when-it-runs" },
  },
  "planning.schedule.missed": {
    title: "Missed run",
    body: "What happens to a run that came due while Slopify was closed or asleep. Skip drops it when it is more than 1 minute late and waits for the next time. Run once when Slopify reopens starts one catch-up run, however many were missed. Default: Skip.",
    tutorial: { page: "Schedules", anchor: "when-it-runs" },
  },
  "planning.schedule.spend": {
    title: "Spend ceiling",
    body: "The most one run may cost, in US dollars, such as 5 or 2.50. Before each run Slopify estimates the project's cost; when the high estimate is over this, or a cost can't be estimated, the run fails instead of starting. Leave it empty for no ceiling. Default: empty.",
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
  "planning.schedule.brief": {
    title: "Series brief",
    body: "What the series covers, its style and what makes a topic worth a video. Only topic generation reads it. Leave it empty to use the series brief on the channel's Name and look tab. Up to 4,000 characters.",
    tutorial: { page: "Schedules", anchor: "topics-that-find-themselves" },
  },
  "planning.schedule.new-topics": {
    title: "New topics",
    body: "Off: you add every topic yourself. Generate and queue directly: new topics join the end of the list. Generate and hold for approval: they wait under Topics waiting, and beside the calendar, until you approve them. Each generation is one AI call. Default: Off.",
    tutorial: { page: "Schedules", anchor: "topics-that-find-themselves" },
  },
  "planning.schedule.rank-topics": {
    title: "Rank topics",
    body: "Scores every queued topic 0-100 and orders the topics Slopify generates best first; Rescore scores them again. By what the library covers: a topic far from anything made or queued scores higher, and nothing leaves this computer. Also by public search interest: adds Google or DuckDuckGo suggestions and Wikipedia views, so each new topic's title is sent to them. Topics you add or move keep their places. Never uses channel analytics. Default: Off.",
    tutorial: { page: "Schedules", anchor: "rank-topics" },
  },
  "planning.schedule.keep-count": {
    title: "Keep at least this many queued",
    body: "Slopify asks for new topics whenever the queue, plus the topics waiting for approval when holding, drops below this number. A higher number keeps more topics lined up ahead of the runs, for you to review. From 1 to 100. Default: 10.",
    tutorial: { page: "Schedules", anchor: "topics-that-find-themselves" },
  },
  "planning.schedule.generation-llm": {
    title: "Topic generation AI model",
    body: "The AI model that suggests topics. Ticked, it uses the service and model the template writes with. Untick to pick another, such as a cheaper model. Either way each generation is one call on that service. Default: the template's model.",
    tutorial: { page: "Schedules", anchor: "topics-that-find-themselves" },
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
