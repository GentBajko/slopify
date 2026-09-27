import type { Stage } from "@app/slices/admission/model.js";
import { cleanup, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { body, stage } from "@/routes/project-fixtures";
import { renderRouted, testDeps } from "@/test-app";
import type { SectionId } from "./next-action.js";
import { NextActionBeside, NextActionPanel, useNextAction } from "./next-action-view.js";
import { revisionView } from "./revision-fixture.js";
import type { RevisionController } from "./revision-workspace.js";
import type { Action, ProjectActions } from "./use-actions.js";

// A failed step's fix is the project's next action (next-action.ts decides which); these check
// that each one does what its name says from the rail and beside the step.

afterEach(cleanup);

function Harness({
  failed,
  actions,
  openSection,
  review,
}: {
  readonly failed: Stage;
  readonly actions: ProjectActions;
  readonly openSection: (section: SectionId) => void;
  readonly review: RevisionController["review"];
}) {
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
  const state = useNextAction({
    project,
    stages: [failed],
    resumable: false,
    sample: false,
    gates: [],
    outdated: [],
    waits: [],
    uploadReady: false,
    actions,
    controller: { review, pending: false } as unknown as RevisionController,
    openSection,
    openUpload: () => undefined,
  });
  return (
    <>
      <NextActionPanel state={state} />
      <section aria-label="Beside the step">
        <NextActionBeside state={state} section={state.next?.section ?? "article"} />
      </section>
    </>
  );
}

function setup(kind: Stage["kind"], over: Partial<Stage>) {
  const run = vi.fn((_action: Action) => undefined);
  const openSection = vi.fn();
  const review = vi.fn();
  const actions: ProjectActions = {
    run,
    pending: false,
    refusal: undefined,
    dismissRefusal: () => undefined,
  };
  renderRouted(
    <Harness
      failed={stage(kind, "failed", over)}
      actions={actions}
      openSection={openSection}
      review={review}
    />,
    testDeps({}),
  );
  return { run, openSection };
}

const rail = () => screen.findByRole("region", { name: "Next action" });
const beside = () => screen.findByRole("region", { name: "Beside the step" });

it("names a signed-out CLI, gives its command, and retries the step", async () => {
  const { run } = setup("article", {
    failureKind: "missing_key",
    failureReason:
      'The Codex CLI is not signed in, or its sign-in has expired. Open a terminal on the computer running the CLI, run "codex login" and sign in, then use Try again.',
  });
  const next = await screen.findByRole("region", { name: "Next action" });
  expect(within(next).getByText("Codex is signed out, so the article stopped.")).not.toBeNull();
  expect(within(next).getByText(/codex login/)).not.toBeNull();
  await userEvent.click(within(next).getByRole("button", { name: "Try the article again" }));
  expect(run).toHaveBeenCalledWith({ kind: "retry", stage: "article" });
});

it("softens a refused image prompt after saying what it will do", async () => {
  const user = userEvent.setup();
  const { run } = setup("images", {
    failureKind: "refusal",
    failureReason: "fal.ai refused to make this image under its content rules.",
  });
  await user.click(await within(await rail()).findByRole("button", { name: "Soften and retry" }));
  const dialog = await screen.findByRole("dialog");
  expect(within(dialog).getByText(/rewrites each refused prompt/)).not.toBeNull();
  expect(run).not.toHaveBeenCalled();
  await user.click(within(dialog).getByRole("button", { name: "Soften and retry" }));
  expect(run).toHaveBeenCalledWith({ kind: "soften", stage: "images" });
});

it("opens the settings for a refused article prompt, beside the step as in the rail", async () => {
  const { openSection } = setup("article", {
    failureKind: "refusal",
    failureReason: "The model refused to write this.",
  });
  await userEvent.click(
    await within(await beside()).findByRole("button", { name: "Edit the prompt" }),
  );
  expect(openSection).toHaveBeenCalledWith("settings");
});

it("links a rejected key to the provider's settings and a full disk to storage", async () => {
  setup("images", {
    failureKind: "auth",
    failureReason: "fal.ai did not accept the API key (error 401).",
  });
  expect(
    (
      await within(await rail()).findByRole("link", { name: "Open Settings → Providers → fal.ai" })
    ).getAttribute("href"),
  ).toContain("section=providers");
  cleanup();
  setup("video", { failureReason: "ffmpeg: No space left on device" });
  expect(
    (await within(await rail()).findByRole("link", { name: "Free space" })).getAttribute("href"),
  ).toContain("section=storage");
});

it("shows the step's own words behind Error details, beside the step", async () => {
  setup("images", { failureReason: "fal.ai: 500 Internal Server Error" });
  const step = await beside();
  await userEvent.click(within(step).getByText("Error details"));
  expect(within(step).getByText("fal.ai: 500 Internal Server Error")).not.toBeNull();
});
