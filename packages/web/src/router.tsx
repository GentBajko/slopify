import { createRootRoute, createRoute, createRouter } from "@tanstack/react-router";
import { Shell } from "@/components/shell";
import { PlayRoute } from "@/routes/play";
import { ProjectRoute } from "@/routes/project";
import { ProjectsRoute } from "@/routes/projects";
import { SettingsRoute } from "@/routes/settings";

// A code-based route tree: a handful of screens need no file convention, and the
// generated tree a plugin would write would be one more artefact to keep honest.
const rootRoute = createRootRoute({ component: Shell });

const projectsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: ProjectsRoute,
});

const playRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "play",
  component: PlayRoute,
});

const projectRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "projects/$projectId",
  component: ProjectPage,
});

const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "settings",
  component: SettingsRoute,
});

function ProjectPage() {
  const { projectId } = projectRoute.useParams();
  return <ProjectRoute projectId={projectId} />;
}

const routeTree = rootRoute.addChildren({
  projectsRoute,
  playRoute,
  projectRoute,
  settingsRoute,
});

export function createAppRouter() {
  return createRouter({ routeTree });
}

export type AppRouter = ReturnType<typeof createAppRouter>;

declare module "@tanstack/react-router" {
  interface Register {
    router: AppRouter;
  }
}
