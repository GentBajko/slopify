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
    name: "make_template_free_samples",
    route: "POST /api/template-studio/:id/free-samples",
    title: "Make a template's free samples",
    description:
      "Queues the samples made on this computer at no cost for the template's current version: the 30-second video, the loudness before and after, the PDF, and the schedules' cost a month. Read them back with get_template_studio.",
  },
];
