import type { PromptKind } from "@app/slices/library/model.js";
import { createRootRoute, createRoute, createRouter, useNavigate } from "@tanstack/react-router";
import { Shell } from "@/components/shell";
import { kindOf } from "@/lib/prompt-kinds";
import { PlayRoute } from "@/routes/play";
import { ProjectRoute } from "@/routes/project";
import { ProjectsRoute } from "@/routes/projects";
import { PromptEditorRoute } from "@/routes/prompt-editor";
import { PromptsRoute } from "@/routes/prompts";
import { SettingsRoute } from "@/routes/settings";

// A code-based route tree: a handful of screens need no file convention, and the
// generated tree a plugin would write would be one more artefact to keep honest.
const rootRoute = createRootRoute({ component: Shell });

// The kind tab of 04 and the kind a new prompt opens on live in the URL, so the tab
// survives a reload and "New prompt" can carry the tab it was pressed on into 05
// (uiux/screens/05-prompt-editor.md, New).
interface KindSearch {
  readonly kind: PromptKind;
}

interface NewPromptSearch extends KindSearch {
  // The prompt being duplicated, when Duplicate opened the editor (`logic/15` §Q124).
  readonly from?: string;
}

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

const promptsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "prompts",
  validateSearch: (search: Record<string, unknown>): KindSearch => ({ kind: kindOf(search.kind) }),
  component: PromptsPage,
});

const newPromptRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "prompts/new",
  validateSearch: (search: Record<string, unknown>): NewPromptSearch => {
    const kind = kindOf(search.kind);
    return typeof search.from === "string" ? { kind, from: search.from } : { kind };
  },
  component: NewPromptPage,
});

const promptRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "prompts/$promptId",
  component: PromptPage,
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

function PromptsPage() {
  const { kind } = promptsRoute.useSearch();
  const navigate = useNavigate();
  return (
    <PromptsRoute
      kind={kind}
      onKind={(next) => {
        void navigate({ to: "/prompts", search: { kind: next }, replace: true });
      }}
    />
  );
}

function NewPromptPage() {
  const { kind, from } = newPromptRoute.useSearch();
  const leave = useLeave();
  return <PromptEditorRoute promptId={undefined} kind={kind} from={from} onLeave={leave} />;
}

function PromptPage() {
  const { promptId } = promptRoute.useParams();
  const leave = useLeave();
  return (
    <PromptEditorRoute
      promptId={promptId}
      // The row the editor loads carries the kind; the tab is only a default for a prompt
      // that does not exist yet.
      kind="article"
      from={undefined}
      onLeave={leave}
    />
  );
}

// Saving, deleting and leaving all land on the list, on the tab the prompt belongs to.
function useLeave(): (kind: PromptKind) => void {
  const navigate = useNavigate();
  return (kind) => {
    void navigate({ to: "/prompts", search: { kind } });
  };
}

const routeTree = rootRoute.addChildren({
  projectsRoute,
  playRoute,
  projectRoute,
  promptsRoute,
  newPromptRoute,
  promptRoute,
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
