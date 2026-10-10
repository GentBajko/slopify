import type { RouteTool } from "./route-tool.js";

export const projectTools: readonly RouteTool[] = [
  {
    name: "list_projects",
    route: "GET /api/projects",
    title: "List projects",
    description: "Every project as the Projects list shows it, with its id, title and status.",
  },
  {
    name: "get_project",
    route: "GET /api/projects/:id",
    title: "Read a project",
    description:
      "One project as its page shows it: revisionId (the baseRevisionId every change needs), its stages and its output files.",
  },
];
