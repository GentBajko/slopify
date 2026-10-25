import { bakeoffStartSchema } from "../../slices/template-studio/bakeoff.js";
import { studioSettingsSchema } from "../../slices/template-studio/budget.js";
import { samplesForAllSchema } from "../../slices/template-studio/for-all.js";
import { markReadySchema } from "../../slices/template-studio/ready.js";
import { makeSampleSchema, saveStudioSchema } from "../../slices/template-studio/save.js";
import { sayItAsSchema } from "../../slices/template-studio/say-it-as.js";
import { fullScriptSchema, topicSchema } from "../../slices/template-studio/topic.js";
import type { RouteTool } from "./route-tool.js";

// Edit template (Templates → a template → Edit template). Not the YouTube Studio tools.
export const templateStudioTools: readonly RouteTool[] = [
  {
    name: "get_template_studio",
    route: "GET /api/template-studio/:id",
    title: "Read a template in Edit template",
    description:
      "The template's sections with each sample's state (current, making, waiting, needs-fix, stale, off, provided), the sample topic, and which version schedules run. Its checks are read with get_template_checks.",
  },
  {
    name: "get_template_checks",
    route: "GET /api/template-studio/:id/checks",
    title: "Read a template's checks",
    description:
      "The free checks the template's current version passes before Approve for schedules, each failing one with what is wrong and where it is fixed: keywords filled, providers set up, a voice that is one of yours (Settings → Voices), release slots, a known monthly cost, someone to answer each checkpoint.",
  },
  {
    name: "mark_template_ready",
    route: "POST /api/template-studio/:id/ready",
    body: markReadySchema,
    title: "Approve a template for its schedules",
    description:
      "Approves the template's newest version (pass it as version) for its schedules, so they run it from their next run on: Edit template's Approve for schedules. Refused, approving nothing, while a check fails or a section's sample isn't current, with each thing to fix (problems). A version already approved is answered again. Until a template's first approval its schedules run its newest version; from then on a schedule runs only a version approved for schedules, saved before Edit template, or carried over from one by Slopify, and each version saved later waits until it is approved.",
    confirm:
      "Schedules run this version from their next run, and each version saved later waits until it is approved.",
  },
  {
    name: "get_prompt_anatomy",
    route: "GET /api/template-studio/:id/anatomy",
    title: "Read a section's prompt anatomy",
    description:
      "One of the prompts a template section sends (section: subject, script, voice, pictures, thumbnail, shorts, upload, reviews; item: the prompt's key from items), cut into segments: the person's own words (yours), their keywords' values (keyword), what Slopify fills itself (slopify) and what settings add (setting). Read from the prompt the sample sent when it was made from these settings.",
  },
  {
    name: "quote_template_save",
    route: "POST /api/template-studio/:id/quote",
    title: "Price a template Save's sample",
    description:
      'Prices a sample before anything is spent. Send one of: document (what a Save of this template document would make), topic (a new sample topic, "next-queued" or "fixed": every section) or fullScript (the whole script switched on or off: the script and what follows). It answers the sections it outdates, each step\'s cost, the total high estimate, how many steps have no price, and whether it fits today\'s sample budget. Changes nothing. Pass its high as acknowledgedHigh to save_template_studio.',
    unrecorded: true,
  },
  {
    name: "save_template_studio",
    route: "POST /api/template-studio/:id/save",
    body: saveStudioSchema,
    title: "Save a template in Edit template",
    description:
      'Saves the template document as its next version. With sample "make" it also makes the paid sample of what changed, which spends money: price it first with quote_template_save and pass that quote\'s high as acknowledgedHigh (and acknowledgedUnknown: true when the quote counts steps with no price). A higher price, an unaccepted unknown one or a sample past today\'s budget is refused with the new quote and nothing is saved. With sample "skip" only the free samples are made. Send the same mutationId to retry the very same Save.',
  },
  {
    name: "make_template_sample",
    route: "POST /api/template-studio/:id/samples/make",
    body: makeSampleSchema,
    title: "Make a template's paid sample again",
    description:
      "Queues the paid sample of the template's current version again, which spends money: after it waited (a higher price, steps with no price, today's budget) or failed. Pass the version and the price get_template_studio shows for it as acknowledgedHigh, and acknowledgedUnknown: true to accept steps with no price. A sample that would cost more still waits.",
  },
  {
    name: "set_sample_topic",
    route: "PUT /api/template-studio/:id/topic",
    body: topicSchema,
    title: "Change a template's sample topic",
    description:
      'Changes the topic the template\'s samples are made about and remakes every section\'s paid sample, which spends money: a typed topic, "next-queued" for the next topic one of its schedules has queued, or "fixed" for the topic every sample starts on. Pass the price as acknowledgedHigh (and acknowledgedUnknown: true to accept steps with no price); a higher price, an unaccepted unknown one or one past today\'s budget is refused with the new quote and nothing changes.',
  },
  {
    name: "set_sample_full_script",
    route: "POST /api/template-studio/:id/full-script",
    body: fullScriptSchema,
    title: "Write a template sample's full script",
    description:
      "Switches the template's sample between the whole script (fullScript: true) and the outline and first chapter (false), and remakes the script and what is made from it, which spends money. Pass the price as acknowledgedHigh; it is refused with the new quote at a higher price, unaccepted unknown prices or past today's budget.",
  },
  {
    name: "get_sample_pronunciations",
    route: "GET /api/template-studio/:id/pronunciations",
    title: "Read the names a template's voice may say wrong",
    description:
      "The names the template's sample script says that a voice may get wrong (its Pronunciation Glossary, and words Library → Narration aliases already change), each with its IPA, the first line it is said in and the alias it has (spokenAs). aliasesOn says whether the template's voice uses Library → Narration aliases.",
  },
  {
    name: "quote_say_it_as",
    route: "POST /api/template-studio/:id/say-it-as/quote",
    title: "Price saying a word another way",
    description:
      "Prices voicing again, with written said as spoken, only the template sample's lines that say it: how many lines, the high estimate, steps with no price and whether it fits today's sample budget. Changes nothing. Pass its high as acknowledgedHigh to say_it_as.",
    unrecorded: true,
  },
  {
    name: "say_it_as",
    route: "POST /api/template-studio/:id/say-it-as",
    body: sayItAsSchema,
    title: "Say a word another way",
    description:
      "Writes a Library → Narration aliases row (written said as spoken, whole word, any case; it replaces one for the same word) and voices again only the template sample's lines that say it, which spends money: price it first with quote_say_it_as and pass its high as acknowledgedHigh. The alias applies to every project started after it. Refused, writing nothing, at a higher price, with unaccepted unknown prices, past today's budget, or when the template's voice doesn't use aliases.",
  },
  {
    name: "get_template_studio_settings",
    route: "GET /api/template-studio/settings",
    title: "Read the template samples' budgets",
    description:
      "The most Edit template's samples may spend in one day (dailyBudget, US dollars), whether they may run steps on a CLI plan (samplesUsePlans; off by default, such a sample waits; it applies to designed pieces' samples too), the most designed pieces' template samples may spend in one day (designDailyBudget, $1 by default), and what each spent today and has left (today, designToday).",
  },
  {
    name: "update_template_studio_settings",
    route: "PUT /api/template-studio/settings",
    body: studioSettingsSchema,
    title: "Change the template samples' daily budgets",
    description:
      "Sets any of: dailyBudget, the most Edit template's samples may spend in one day, in US dollars (0 to 1000); designDailyBudget, the same for designed pieces' template samples (0 to 1000); samplesUsePlans, whether either may run steps on a Claude Code or Codex plan, which the dollar budgets can't limit. A field left out keeps what it was. A sample that would go over its budget, or needs a plan while plans are off, waits.",
  },
  {
    name: "quote_samples_for_all",
    route: "POST /api/template-studio/samples-for-all/quote",
    title: "Price the samples of every template",
    description:
      "Prices the paid sample of every template whose newest version has none (or changed since its last one), before anything is spent: each template's high estimate, whether it fits what is left of today's sample budget (spent in name order), the total and a sentence saying how many fit. Changes nothing. Pass its total as acknowledgedTotal to make_samples_for_all.",
    unrecorded: true,
  },
  {
    name: "make_samples_for_all",
    route: "POST /api/template-studio/samples-for-all",
    body: samplesForAllSchema,
    title: "Make the samples of every template",
    description:
      "Makes the paid sample of every template that needs one, which spends money: price them first with quote_samples_for_all and pass its total as acknowledgedTotal (and acknowledgedUnknown: true to accept steps with no price). The ones that fit today's budget are queued; the rest wait, saying so, until tomorrow or a higher budget. A higher total is refused with the new quote and nothing is queued.",
    confirm: "This spends money on the samples of every template that needs one.",
  },
  {
    name: "make_template_free_samples",
    route: "POST /api/template-studio/:id/free-samples",
    title: "Make a template's free samples",
    description:
      "Queues the samples made on this computer at no cost for the template's current version: the 30-second video, the loudness before and after, the PDF, and the schedules' cost a month. Read them back with get_template_studio.",
  },
  {
    name: "import_template_pack",
    route: "POST /api/template-studio/packs/import",
    title: "Import a template file",
    description:
      "Makes a new template from a template file (the .zip Edit template's Export as a file (.zip) made, at most 30 MB): its prompts and intros join Prompts (a name taken by other text comes in as \"<name> (2)\" and the template names that one), its voice is used as it is, and it is not checked in Edit template yet: look its samples over and approve it for schedules (mark_template_ready). A file holding anything that looks like a key, a file a template file never has or a newer format is refused, writing nothing. Answers templateId, the name it got, how many prompts and intros it added and which were renamed, whether Settings → Voices has its voice (voiceKnown; when false, get_template_checks' voice check says what to do) and how many samples it brought.",
    upload: "multipart",
  },
  {
    name: "get_template_pack_samples",
    route: "GET /api/template-studio/:id/pack-samples",
    title: "List the samples a template's file brought",
    description:
      "The samples an imported template file came with (role: thumbnail, picture or narration; name; url), shown in Edit template until the template makes its own. Empty for a template that didn't come from a file.",
  },
  {
    name: "quote_bakeoff",
    route: "POST /api/template-studio/:id/bakeoff/quote",
    title: "Price comparing models on a template's sample",
    description:
      "Prices making one section's sample again on one or two other models (section: script, voice or pictures; models: [{provider, model}], not the model the section uses now, which is compared from the current sample; voice models only of the template's voice provider). Needs a current sample of the newest version. Answers each model's high estimate, steps with no price, the total, today's sample budget and whether it fits. Changes nothing. Pass its high as acknowledgedHigh to start_bakeoff.",
    unrecorded: true,
  },
  {
    name: "start_bakeoff",
    route: "POST /api/template-studio/:id/bakeoff",
    body: bakeoffStartSchema,
    title: "Compare models on a template's sample",
    description:
      "Makes the section's sample again on each model, each on a hidden copy of the template's sample with only that section's work started, which spends money: price it first with quote_bakeoff and pass its high as acknowledgedHigh (and acknowledgedUnknown: true to accept steps with no price). A higher total, an unaccepted unknown price or a total past today's budget is refused with the new quote, starting nothing. The template doesn't change: read the results with get_bakeoff, then switch the model with save_template_studio and discard the copies with discard_bakeoff.",
    confirm: "This spends money making the section's sample again on each model.",
  },
  {
    name: "get_bakeoff",
    route: "GET /api/template-studio/:id/bakeoff",
    title: "Read a template's model bake-off",
    description:
      "The template's bake-off, or null: its section, the version it was made for (stale when the template was saved since), its state (queued, making, done, held with why, failed with why) and one entry per model, the one in use first (state current), each with what it was charged (cost, US dollars), how long its section took (seconds), its failure, and what it made (outputs; article: the script's opening).",
  },
  {
    name: "discard_bakeoff",
    route: "DELETE /api/template-studio/:id/bakeoff",
    title: "Discard a template's model bake-off",
    description:
      "Removes the bake-off's copies and what they made. What they were charged today still counts against the sample budget. Refused while a copy still has work going.",
    confirm: "The bake-off's copies and what they made are removed.",
  },
];
