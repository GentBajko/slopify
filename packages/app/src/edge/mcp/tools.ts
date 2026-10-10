import type { RouteTool } from "./route-tool.js";
import { projectTools } from "./tools-projects.js";
import { runTools } from "./tools-runs.js";

// Every API route an agent may call, as a tool; `excluded-routes.ts` names the rest and why.
export const routeTools: readonly RouteTool[] = [...projectTools, ...runTools];
