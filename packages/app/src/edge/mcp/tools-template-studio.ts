import type { RouteTool } from "./route-tool.js";

// The template studio (Library → Templates → Open studio). Not the YouTube Studio tools.
export const templateStudioTools: readonly RouteTool[] = [
  {
    name: "get_template_studio",
    route: "GET /api/template-studio/:id",
    title: "Read a template's studio",
    description:
      "The template's sections with each sample's state (current, making, waiting, needs-fix, stale, off, provided), the sample topic, and which version schedules run. Its checks are read with get_template_checks.",
  },
  {
    name: "get_template_checks",
    route: "GET /api/template-studio/:id/checks",
    title: "Read a template's checks",
    description:
      "The free checks the template's current version passes before Mark ready, each failing one with what is wrong and where it is fixed: keywords filled, providers set up, release slots, a known monthly cost, someone to answer each checkpoint.",
  },
  {
    name: "get_prompt_anatomy",
    route: "GET /api/template-studio/:id/anatomy",
    title: "Read a section's prompt anatomy",
    description:
      "One of the prompts a template section sends (section: subject, script, voice, pictures, thumbnail, shorts, upload, reviews; item: the prompt's key from items), cut into segments: the person's own words (yours), their keywords' values (keyword), what Slopify fills itself (slopify) and what settings add (setting). Read from the prompt the sample sent when it was made from this setup.",
  },
  {
    name: "quote_template_save",
    route: "POST /api/template-studio/:id/quote",
    title: "Price a template Save's sample",
    description:
      "Prices the sample a Save of this template document would make, before anything is spent: the sections it outdates, each step's cost, the total high estimate, how many steps have no price, and whether it fits today's sample budget. Changes nothing. Pass its high as acknowledgedHigh to save_template_studio.",
    unrecorded: true,
  },
  {
    name: "save_template_studio",
    route: "POST /api/template-studio/:id/save",
    title: "Save a template in its studio",
    description:
      'Saves the template document as its next version. With sample "make" it also makes the paid sample of what changed, which spends money: price it first with quote_template_save and pass that quote\'s high as acknowledgedHigh (and acknowledgedUnknown: true when the quote counts steps with no price). A higher price, an unaccepted unknown one or a sample past today\'s budget is refused with the new quote and nothing is saved. With sample "skip" only the free samples are made. Send the same mutationId to retry the very same Save.',
  },
  {
    name: "make_template_sample",
    route: "POST /api/template-studio/:id/samples/make",
    title: "Make a template's paid sample again",
    description:
      "Queues the paid sample of the template's current version again, which spends money: after it waited (a higher price, steps with no price, today's budget) or failed. Pass the version and the price get_template_studio shows for it as acknowledgedHigh, and acknowledgedUnknown: true to accept steps with no price. A sample that would cost more still waits.",
  },
  {
    name: "get_template_studio_settings",
    route: "GET /api/template-studio/settings",
    title: "Read the template studio's settings",
    description:
      "The most the studio's samples may spend in one day (dailyBudget, US dollars) and what they spent today and have left.",
  },
  {
    name: "update_template_studio_settings",
    route: "PUT /api/template-studio/settings",
    title: "Change the template studio's daily budget",
    description:
      "Sets the most the studio's samples may spend in one day, in US dollars (0 to 1000). A sample that would go over it waits until the next day or a higher budget.",
  },
  {
    name: "make_template_free_samples",
    route: "POST /api/template-studio/:id/free-samples",
    title: "Make a template's free samples",
    description:
      "Queues the samples made on this computer at no cost for the template's current version: the 30-second video, the loudness before and after, the PDF, and the schedules' cost a month. Read them back with get_template_studio.",
  },
];
