import type { Stage } from "@app/slices/admission/model.js";
import { cleanup, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { body, stage } from "@/routes/project-fixtures";
import { renderRouted, testDeps } from "@/test-app";
import { OpenProjectTab } from "./fix-it.js";
import { RevisionControlContext } from "./revision-action-context.js";
import { revisionView } from "./revision-fixture.js";
import type { SectionKind } from "./sections.js";
import { StageRow } from "./stage-row.js";
import type { Action, ProjectActions } from "./use-actions.js";

afterEach(cleanup);

function setup(kind: SectionKind, over: Partial<Stage>) {
  const failed = stage(kind, "failed", over);
  const run = vi.fn((_action: Action) => undefined);
  const openTab = vi.fn();
  const actions: ProjectActions = {
    run,
    pending: false,
    refusal: undefined,
    dismissRefusal: () => undefined,
  };
  const summary = body({ status: "failed", stages: [], outputs: [] }).project;
  const project = {
    ...summary,
    format: "16:9" as const,
    config: {
      ...revisionView().revision.config,
      llm: { provider: "codex", model: "gpt" },
      images: { provider: "fal", model: "flux" },
    },
  };
  renderRouted(
    <RevisionControlContext value={true}>
      <OpenProjectTab value={openTab}>
        <StageRow
          section={{ kind, stage: failed }}
          project={project}
          outputs={[]}
          providers={[]}
          actions={actions}
        >
          {null}
        </StageRow>
      </OpenProjectTab>
    </RevisionControlContext>,
    testDeps({}),
  );
  return { run, openTab };
}

it("shows the sign-in command for a signed-out CLI, with Re-check", async () => {
  setup("article", {
    failureKind: "missing_key",
    failureReason:
      'The Codex CLI is not signed in, or its sign-in has expired. Open a terminal on the computer running the CLI, run "codex login" and sign in, then use Retry stage.',
  });
  expect(await screen.findByText("codex login")).not.toBeNull();
  expect(screen.getByRole("button", { name: "Re-check" })).not.toBeNull();
});

it("softens a refused image prompt after saying what it will do, or opens Edit", async () => {
  const user = userEvent.setup();
  const { run, openTab } = setup("images", {
    failureKind: "refusal",
    failureReason: "fal.ai refused to make this image under its content rules.",
  });
  await user.click(await screen.findByRole("button", { name: "Soften and retry" }));
  const dialog = await screen.findByRole("dialog");
  expect(within(dialog).getByText(/rewrites each refused prompt/)).not.toBeNull();
  await user.click(within(dialog).getByRole("button", { name: "Soften and retry" }));
  expect(run).toHaveBeenCalledWith({ kind: "soften", stage: "images" });
  await user.click(screen.getByRole("button", { name: "Edit prompt" }));
  expect(openTab).toHaveBeenCalledWith("edit");
});

it("links a rejected key to the provider's settings and a full disk to storage", async () => {
  setup("images", {
    failureKind: "auth",
    failureReason: "fal.ai did not accept the API key (error 401).",
  });
  expect(
    (await screen.findByRole("link", { name: "Open Settings → Providers → fal.ai" })).getAttribute(
      "href",
    ),
  ).toContain("section=providers");
  cleanup();
  setup("video", { failureReason: "ffmpeg: No space left on device" });
  expect((await screen.findByRole("link", { name: "Free space" })).getAttribute("href")).toContain(
    "section=storage",
  );
});
