import type { RouteTool } from "./route-tool.js";
import { channelTools } from "./tools-channels.js";
import { designTools } from "./tools-designs.js";
import { libraryTools } from "./tools-library.js";
import { planningTools } from "./tools-planning.js";
import { projectTools } from "./tools-projects.js";
import { publishingTools } from "./tools-publishing.js";
import { runTools } from "./tools-runs.js";
import { scheduleTools } from "./tools-schedules.js";
import { setupTools } from "./tools-setup.js";
import { storageTools } from "./tools-storage.js";
import { templateStudioTools } from "./tools-template-studio.js";

// Every API route an agent may call, as a tool; `excluded-routes.ts` names the rest and why.
export const routeTools: readonly RouteTool[] = [
  ...projectTools,
  ...publishingTools,
  ...runTools,
  ...planningTools,
  ...scheduleTools,
  ...channelTools,
  ...designTools,
  ...libraryTools,
  ...setupTools,
  ...storageTools,
  ...templateStudioTools,
];
