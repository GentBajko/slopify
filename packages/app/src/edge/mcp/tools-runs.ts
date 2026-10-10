import { control, type RouteTool } from "./route-tool.js";

export const runTools: readonly RouteTool[] = [
  {
    name: "resume_project",
    route: "POST /api/projects/:id/resume",
    title: "Continue the run",
    description: `Continue the run: starts the project's held and unfinished work, including work a saved edit left waiting. ${control}`,
  },
];
