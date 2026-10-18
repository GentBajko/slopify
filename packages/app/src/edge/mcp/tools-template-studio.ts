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
];
