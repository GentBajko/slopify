import type { RouteTool } from "./route-tool.js";

// The template studio (Library → Templates → Open studio). Not the YouTube Studio tools.
export const templateStudioTools: readonly RouteTool[] = [
  {
    name: "get_template_studio",
    route: "GET /api/template-studio/:id",
    title: "Read a template's studio",
    description:
      "The template's sections with each sample's state (current, making, waiting, needs-fix, stale, off, provided), its free checks with how to fix each, the sample topic, and which version schedules run.",
  },
  {
    name: "make_template_free_samples",
    route: "POST /api/template-studio/:id/free-samples",
    title: "Make a template's free samples",
    description:
      "Queues the samples made on this computer at no cost for the template's current version: the 30-second video, the loudness before and after, the PDF, and the schedules' cost a month. Read them back with get_template_studio.",
  },
];
