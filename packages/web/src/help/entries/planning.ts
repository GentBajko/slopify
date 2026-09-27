import type { HelpEntry } from "../entry.js";

// Schedules, the calendar, channels (brand kit, cast, episode memory, existing videos) and the
// named links YouTube descriptions fill from.
export const planningHelp = {
  // Schedules
  "planning.schedules": {
    title: "Schedules",
    body: "A schedule starts a new project from a saved template at a local time, while Slopify is open on this machine. Each run makes a fresh project, so changing the template later never rewrites an old run. It uses the template version you picked and never includes uploaded media. Each run costs what that template's project costs.",
  },
  "planning.schedule.name": {
    title: "Schedule name",
    body: "A name to tell this schedule apart in the list, on the calendar and on the channel page. It never appears in the videos. Up to 200 characters.",
  },
  "planning.schedule.template": {
    title: "Template",
    body: "The saved template each run starts from, with its version. The schedule keeps this version when you save the template again; pick the template again here to use the newer one. The template decides the providers, and so what each run costs. Save templates from Play; they are listed in Library → Templates.",
  },
  "planning.schedule.cadence": {
    title: "Cadence",
    body: "How often the schedule runs. Every day runs once a day at the local time. Selected weekdays runs on the days you tick. One time runs once at a date and time, then completes. Each run starts one project. Default: Every day at 09:00.",
  },
  "planning.schedule.time": {
    title: "Local time",
    body: "The clock time each run starts, read in the timezone below. Default: 09:00. A run only starts while Slopify is open; Missed run decides what happens when it was closed.",
  },
  "planning.schedule.once-at": {
    title: "Run at",
    body: "The date and time of the single run, read in the timezone below. After that run starts, the schedule shows as completed.",
  },
  "planning.schedule.weekdays": {
    title: "Weekdays",
    body: "The days a Selected weekdays schedule runs, each at the local time. Tick at least one; each ticked day is one project a week. Default: Mon, Wed and Fri.",
  },
  "planning.schedule.timezone": {
    title: "Timezone",
    body: "The IANA zone the run time is read in, such as Europe/Tirane or America/New_York. Default: this computer's zone. When clocks go back, a repeated time uses the earlier one; a time skipped when clocks go forward moves forward by the gap.",
  },
  "planning.schedule.timezone-once": {
    title: "Timezone",
    body: "The IANA zone the one-off date and time are read in, such as Europe/Tirane or America/New_York. Default: this computer's zone. When clocks go back, a repeated time uses the earlier one; nonexistent spring-forward times are refused, so pick another.",
  },
  "planning.schedule.missed": {
    title: "Missed run",
    body: "What happens to a run that came due while Slopify was closed or asleep. Skip drops it when it is more than 1 minute late and waits for the next time. Run once when Slopify reopens starts one catch-up run, however many were missed. Default: Skip.",
  },
  "planning.schedule.spend": {
    title: "Spend ceiling",
    body: "The most one run may cost, in US cents: 500 is $5.00. Before each run Slopify estimates the project's cost; when the high estimate is over this, or a cost can't be estimated, the run fails instead of starting. Leave it empty for no ceiling. Default: empty.",
  },
  "planning.schedule.topics": {
    title: "Topics",
    body: "Each run takes the first topic, starts one project with it and removes it from the list. The schedule completes when the list is empty, unless topic generation is on. With no topics and generation off, every run uses the template as saved. Up to 500 topics.",
  },
  "planning.schedule.topic-format": {
    title: "How to write the topics",
    body: "Three ways to write the same list; switching keeps everything. One per line fills only the topic keyword. Table adds a column for each keyword a topic sets itself, such as its word count. YAML / JSON holds the same as text, for pasting or keeping in a file.",
  },
  "planning.schedule.topic-lines": {
    title: "Topics, one per line",
    body: "Type or paste one topic per line; blank lines are skipped. Each topic fills the keyword under Each topic fills, and the first line is the next run. Every other keyword uses its every-run value.",
  },
  "planning.schedule.topic-yaml": {
    title: "Topics as YAML or JSON",
    body: 'A list such as "- Tiamat", or one map per topic such as "- Topic: Tiamat" with a line for each keyword it sets, like "Min. Word Count: 12000". A JSON array works too. A keyword a topic leaves out uses its every-run value. The schedule saves only once the list reads.',
  },
  "planning.schedule.topic-table": {
    title: "Topic table",
    body: "One row per run, in order. The first column fills the topic keyword; each extra column sets that keyword for that topic's run only, and a blank cell uses the every-run value. Set a keyword per topic adds a column; the x in a column's header drops it. Project title shows the result.",
  },
  "planning.schedule.topic-keyword": {
    title: "Each topic fills",
    body: "The template keyword, such as {{Topic}}, that each queued topic replaces. Default: the keyword the template's project title uses, else the first one. When the title doesn't use it, every project gets the same title.",
  },
  "planning.schedule.every-run": {
    title: "Every-run value",
    body: "The value this keyword gets on every run, such as a word count. Default: the template's own value. A topic that sets the keyword itself, in Table or YAML / JSON, overrides it for that one run.",
  },
  "planning.schedule.generation": {
    title: "Topic generation",
    body: "When the queue holds fewer topics than you ask for, Slopify asks an LLM for more: one call for what is missing plus 5 spare, at most 50. It sends the series brief and every title this schedule, your projects and the channel's existing videos already have, and drops near duplicates.",
  },
  "planning.schedule.brief": {
    title: "Series brief",
    body: "What the series covers, its style and what makes a topic worth a video. Only topic generation reads it. Leave it empty to use the channel's series brief from the channel's Brand tab. Up to 4,000 characters.",
  },
  "planning.schedule.new-topics": {
    title: "New topics",
    body: "Off: you add every topic yourself. Generate and queue directly: new topics join the end of the list. Generate and hold for approval: they wait under Topics waiting, and beside the calendar, until you approve them. Each generation is one LLM call. Default: Off.",
  },
  "planning.schedule.keep-count": {
    title: "Keep at least this many queued",
    body: "Slopify asks for new topics whenever the queue, plus the topics waiting for approval when holding, drops below this number. A higher number keeps more topics lined up ahead of the runs, for you to review. From 1 to 100. Default: 10.",
  },
  "planning.schedule.generation-llm": {
    title: "Topic generation LLM",
    body: "The text model that suggests topics. Ticked, it uses the provider and model the template writes with. Untick to pick another, such as a cheaper model. Either way each generation is one call on that provider. Default: the template's LLM.",
  },
  "planning.schedule.generate-now": {
    title: "Generate topics now",
    body: "Asks the LLM for new topics right away, at least 5, even when the queue is full and even during the 5 minutes Slopify waits after a failed try. One LLM call. When holding for approval they wait for you; otherwise they join the queue.",
  },
  "planning.schedule.held-keywords": {
    title: "Keywords of a waiting topic",
    body: "The template's other keywords, set for this one topic's run, the same as a column in the queue's table. Leave one empty to use the schedule's every-run value (shown greyed). They go with the topic into the queue when you approve it.",
  },
  "planning.schedule.held": {
    title: "Topics waiting",
    body: "Topics the LLM suggested, waiting for you. Approve adds one to the end of the queue; Edit changes its words first; Reject drops it for good, so it is never suggested again. Approve all queues every one in order. Waiting topics count toward Keep at least.",
  },

  // Calendar
  "planning.calendar.view": {
    title: "Calendar view",
    body: "Weeks shows the coming 4 weeks as a grid: drag a topic to another day or onto another schedule's run, or focus it and press Alt+arrow keys. List shows the same runs day by day, with buttons to move each topic. This browser remembers your choice.",
  },
  "planning.calendar.move": {
    title: "Moving topics",
    body: "Earlier and later swap a topic with its neighbour in the same schedule's queue, so it takes the other's run. Move to puts it at the end of another schedule's queue, so it takes that schedule's next free run. No schedule runs outside its own times.",
  },
  "planning.calendar.add-schedule": {
    title: "Schedule",
    body: "The schedule the topics join. They go to the end of its queue, after the topics already there (the count beside each name), so they take its next free runs. Only active and paused schedules are listed.",
  },
  "planning.calendar.add-topics": {
    title: "Topics, one per line",
    body: "Each line becomes one topic, in order; blank lines are skipped. A topic fills the schedule's topic keyword, and every other keyword keeps its every-run value. To give topics their own values, edit the schedule's topics as a table under Schedules.",
  },

  // Channels
  "planning.channels": {
    title: "Channels",
    body: "A channel is one series: its brand kit, series brief, cast, templates and schedules. Every template belongs to one channel, and each run from it uses that channel's look and cast. The default channel holds everything made before channels and can't be deleted.",
  },
  "planning.channel.current": {
    title: "Current channel",
    body: "Home, Projects and the calendar show only this channel's work. All channels shows everything. It only filters what you see; every project and schedule keeps its own channel. This browser remembers your choice.",
  },
  "planning.channel.name": {
    title: "Channel name",
    body: "The name you see in the channel picker, on Play and on the calendar. It stays inside Slopify and doesn't have to match your YouTube channel. Up to 200 characters.",
  },
  "planning.channel.brief": {
    title: "Series brief",
    body: "What the channel covers, its style and what makes a topic worth a video. Topic generation reads it for every schedule of this channel that has no brief of its own. It doesn't change how videos are written. Up to 10,000 characters.",
  },
  "planning.channel.ai-disclosure": {
    title: "YouTube AI disclosure",
    body: "Studio's AI use answer for this channel's videos and Shorts, given by Prepare upload and the Studio extension. Automatic says Yes only for YouTube's three cases: a voice marked as imitating a real person, real footage altered, or photorealistic AI pictures from a marked Image prompt. Saves as you pick. Default: Automatic.",
  },
  "planning.channel.language": {
    title: "Language of new projects",
    body: "The language this channel's new projects are written and narrated in when Play or the template picks none. It applies with the brand kit off too, since it is not styling. Pick voices that speak it. Not set means English. Projects already made keep their language.",
  },
  "planning.channel.brand-kit": {
    title: "Brand kit",
    body: "The look every template of this channel gets unless it sets its own: fonts, colours, end screen, intro, outro, document theme and ambient sound. It fills only what a template leaves at its default, and a blank field adds nothing. Turn it off for one video on Play or in Edit project.",
  },
  "planning.channel.brand.caption-font": {
    title: "Caption font",
    body: "The subtitle font for this channel's videos whose template leaves the font at Default. Not set leaves the template's font alone. Fonts you upload in the subtitle font picker on Play appear here.",
  },
  "planning.channel.brand.caption-colour": {
    title: "Caption colour",
    body: "The subtitle text colour, as # and six hex digits such as #FFFFFF, for videos whose template sets no colour of its own. Blank leaves the template's colour alone.",
  },
  "planning.channel.brand.caption-outline": {
    title: "Caption outline",
    body: "The colour of the line around each subtitle letter, as # and six hex digits such as #000000, for videos whose template sets none. A dark outline keeps light captions readable on bright pictures. Blank leaves the template's outline alone.",
  },
  "planning.channel.brand.font": {
    title: "Title font",
    body: "The font of chapter cards and the end screen for videos whose template sets no title style. Not set leaves the template's font alone. Fonts you upload in the subtitle font picker on Play appear here.",
  },
  "planning.channel.brand.title-colour": {
    title: "Title colour",
    body: "The text colour of chapter cards and the end screen, as # and six hex digits such as #FFD700, for videos whose template sets no title style. Blank leaves the template's colour alone.",
  },
  "planning.channel.brand.end-screen": {
    title: "End screen text",
    body: "A line shown over the last 5 seconds of every video of this channel whose template sets no end screen, such as Subscribe for more. Up to 200 characters. Blank shows no end screen text.",
  },
  "planning.channel.brand.intro": {
    title: "Intro",
    body: "A clip from Library → Entries played before every video of this channel whose template has no intro. Not set adds none. It adds its own length to each video and no provider cost.",
  },
  "planning.channel.brand.outro": {
    title: "Outro",
    body: "A clip from Library → Entries played after every video of this channel whose template has no outro. Not set adds none. It adds its own length to each video and no provider cost.",
  },
  "planning.channel.brand.document-theme": {
    title: "Document theme",
    body: "The look of the PDF document for videos of this channel whose template picks no theme: a built-in theme or one you saved. Not set leaves the template's choice alone. A saved theme that was deleted is skipped.",
  },
  "planning.channel.template-move": {
    title: "Move a template",
    body: "Moves a template, and every schedule that runs it, to another channel. Their next runs use that channel's brand kit, cast and series brief. Projects already made keep what they were made with.",
  },
  "planning.channel.episode-memory": {
    title: "Episode memory",
    body: "When a video of this channel finishes, one short call to its text model writes a summary of up to 150 words. A new episode about the same cast or title words gets up to 5 related summaries in its writing prompt, so it agrees with them. Videos already made never change. Default: on for new channels.",
  },
  "planning.channel.episode-summary": {
    title: "Episode summary",
    body: "What the text model wrote this episode covered. Related new episodes read it before they are written. Edit it to correct a fact; your text is kept even if the video finishes again.",
  },
  "planning.channel.videos-paste": {
    title: "Existing video titles",
    body: "Titles of videos this channel made before Slopify, one per line. Topic generation and its duplicate checks skip them, as they skip the videos made here. Titles already listed are skipped, whatever their case.",
  },
  "planning.channel.videos-csv": {
    title: "Import a YouTube Studio CSV",
    body: "In YouTube Studio open Analytics → Content → Advanced mode and export the table as a CSV. Slopify reads its titles on this machine and lists them with ticks first, so you keep only this channel's videos.",
  },
  "planning.channel.videos-filter": {
    title: "Keep only titles containing",
    body: 'Ticks only the titles containing this text, in any case, such as "D&D" or "Lore To Sleep To"; empty ticks them all. Use it when one Studio export holds several series. Remembered for this channel\'s next import.',
  },
  "planning.channel.videos-ticks": {
    title: "Titles in the CSV",
    body: "Only ticked titles are added when you press Add. Untick videos of other series in the same export, or type in Keep only titles containing to tick by text.",
  },

  // Cast
  "planning.cast.kind": {
    title: "Kind",
    body: "Character, creature, place or object. A generated reference picture of a character or creature is portrait (9:16), of a place or object landscape (16:9), and its starting prompt asks for the whole figure, place or object in view. It doesn't change how the member is matched.",
  },
  "planning.cast.name": {
    title: "Name",
    body: "The name matched against video titles and image briefs, as whole words, ignoring case. When it is found, this member's pictures go with that image as references. Add other spellings and plurals as aliases. Up to 200 characters.",
  },
  "planning.cast.aliases": {
    title: "Aliases",
    body: "Other names that count as this member, matched as whole words, ignoring case: Tiamat is found in Tiamat's lair but not in Tiamatic. Add plurals and titles such as the Dragon Queen. Up to 20.",
  },
  "planning.cast.description": {
    title: "Description for the image model",
    body: "What the member looks like, in a sentence. It goes to the image model with the member's reference pictures for every image that names it, and starts the prompt of a generated picture. Up to 2,000 characters.",
  },
  "planning.cast.voice": {
    title: "Cast voice",
    body: "How this member speaks in multi-voice runs: pick them under Speakers on Play and they read with this voice, model and pace in every episode. The list shows voices that speak the channel's language. Leave the provider empty for no voice. A run keeps the voice it started with.",
  },
  "planning.cast.pictures": {
    title: "Reference pictures",
    body: "Up to 4 pictures per member, sent with every image whose brief, or the video's title, names it, so it looks the same each time. Upload a PNG or JPEG up to 10 MB, or generate one below. Videos already made keep the pictures they started with.",
  },
  "planning.cast.generate": {
    title: "Make a reference picture",
    body: "Pick an image provider and model, describe the picture, then press Generate a picture. Each press is one image call on that provider, billed at its price for one image. A plain background with the whole figure in view makes the best reference.",
  },
  "planning.cast.picture-prompt": {
    title: "Picture to make",
    body: "The prompt for the generated reference picture. It starts from the name, the description and a request for a plain background; edit it as you like. Up to 4,000 characters.",
  },

  // YouTube
  "planning.links.named": {
    title: "Named links",
    body: "Write {{Name}} in a YouTube description, or ask for it in a Description prompt, and it becomes the link of that name when the description is shown or copied, such as {{Patreon}} or {{Discord}}. A project's own {{Previous video}} wins over the one here. A name with no link stays as typed.",
  },
} as const satisfies Readonly<Record<string, HelpEntry>>;
