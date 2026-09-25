import { stageKinds } from "@app/kernel/pipeline.js";
import type { RevisionView } from "@app/slices/revisions/model.js";
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { body, stage } from "@/routes/project-fixtures";
import { jsonAnswer, renderApp, renderRouted, testDeps } from "@/test-app";
import { ConfirmedButton, canRerunSection } from "./controls.js";
import { ProjectHeader } from "./header.js";
import { RevisionControlContext } from "./revision-action-context.js";
import { revisionView } from "./revision-fixture.js";
import { RevisionMedia } from "./revision-media.js";
import { StageRow } from "./stage-row.js";
import type { Action, ProjectActions } from "./use-actions.js";

afterEach(cleanup);
function generated(): RevisionView {
  const view = revisionView();
  return {
    ...view,
    revision: {
      ...view.revision,
      fingerprints: { "audio:body:future": "pending" },
      config: {
        ...view.revision.config,
        sources: {
          research: "generate",
          article: "generate",
          audio: "generate",
          images: "generate",
          thumbnail: "from_prompt",
          video: "generate",
        },
      },
      content: {
        ...view.revision.content,
        articleEdited: false,
        imageOrder: ["one"],
        imageDefinitions: { one: { source: "generate", prompt: "One", assetId: null } },
      },
    },
  };
}
it("offers all six generated sections but no provided/off conversion or edited-article overwrite", () => {
  const view = generated();
  for (const kind of stageKinds) expect(canRerunSection(view, kind)).toBe(true);
  const provided: RevisionView = {
    ...view,
    revision: {
      ...view.revision,
      config: {
        ...view.revision.config,
        sources: {
          research: "provide",
          article: "provide",
          audio: "provide",
          images: "provide",
          thumbnail: "provide",
          video: "off",
        },
      },
      content: {
        ...view.revision.content,
        imageDefinitions: { one: { source: "provide", prompt: null, assetId: "a1" } },
      },
    },
  };
  for (const kind of stageKinds.filter((one) => one !== "video"))
    expect(canRerunSection(provided, kind)).toBe(false);
  expect(canRerunSection(provided, "video")).toBe(true);
  expect(canRerunSection(revisionView(), "video")).toBe(false);
  expect(
    canRerunSection(
      {
        ...view,
        revision: { ...view.revision, content: { ...view.revision.content, articleEdited: true } },
      },
      "article",
    ),
  ).toBe(false);
  expect(
    canRerunSection(
      {
        ...view,
        revision: {
          ...view.revision,
          fingerprints: { "audio:body:one:1": "supplied" },
          content: {
            ...view.revision.content,
            narrationOverrides: { "audio:body:one": { kind: "asset", assetId: "a1" } },
          },
        },
      },
      "audio",
    ),
  ).toBe(false);
});

it("confirms rerun by keyboard, cancels safely, retains History and disables duplicate clicks", async () => {
  const user = userEvent.setup();
  const run = vi.fn();
  const view = generated();
  const deps = testDeps({ "GET /api/projects/p1/revisions/r1": jsonAnswer({ view }) });
  function Control() {
    const [pending, setPending] = useState(false);
    return (
      <RevisionMedia projectId="p1" revisionId="r1">
        <RevisionControlContext value={true}>
          <ConfirmedButton
            action={{ kind: "rerun", stage: "images" }}
            run={() => {
              run();
              setPending(true);
            }}
            pending={pending}
          >
            Re-run images
          </ConfirmedButton>
        </RevisionControlContext>
      </RevisionMedia>
    );
  }
  renderApp(<Control />, deps);
  const button = await screen.findByRole("button", { name: "Re-run images" });
  button.focus();
  await user.keyboard("{Enter}");
  const dialog = await screen.findByRole("dialog");
  expect(dialog.textContent).toMatch(/generated images.*video.*History/i);
  expect(within(dialog).queryByRole("checkbox")).toBeNull();
  await user.keyboard("{Escape}");
  expect(run).not.toHaveBeenCalled();
  await user.click(button);
  const confirm = within(await screen.findByRole("dialog")).getByRole("button", { name: "Re-run" });
  confirm.focus();
  await user.keyboard("{Enter}");
  expect(run).toHaveBeenCalledTimes(1);
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Re-run images" }).hasAttribute("disabled")).toBe(
      true,
    ),
  );
});

it("allows canceled Resume and paused Retry without approving a checkpoint or opening cost review", async () => {
  const user = userEvent.setup();
  const run = vi.fn((_action: Action) => undefined);
  const actions: ProjectActions = {
    run,
    pending: false,
    refusal: undefined,
    dismissRefusal: () => undefined,
  };
  const summary = body({ status: "canceled", stages: [], outputs: [] }).project;
  const project = { ...summary, format: "16:9" as const, config: generated().revision.config };
  renderRouted(
    <RevisionControlContext value={true}>
      <ProjectHeader
        project={project}
        prompts={undefined}
        actions={actions}
        inFlight={false}
        resumable={false}
        primaryOutput={undefined}
      />
      <StageRow
        stage={stage("audio", "failed")}
        project={{ ...project, status: "paused" }}
        outputs={[]}
        providers={[]}
        actions={actions}
      >
        {null}
      </StageRow>
    </RevisionControlContext>,
    testDeps({}),
  );
  const resume = await screen.findByRole("button", { name: "Resume" });
  resume.focus();
  await user.keyboard("{Enter}");
  const retry = screen.getByRole("button", { name: "Retry stage" });
  expect(retry.hasAttribute("disabled")).toBe(false);
  retry.focus();
  await user.keyboard("{Enter}");
  expect(run.mock.calls.map(([action]) => action)).toEqual([
    { kind: "resume" },
    { kind: "retry", stage: "audio" },
  ]);
  expect(screen.queryByRole("dialog")).toBeNull();
  await user.click(screen.getByRole("button", { name: /^About recovering/ }));
  expect(await screen.findByText(/Resume recovers unfinished work/)).not.toBeNull();
});

it.each([
  [{ kind: "resume" }, "Resuming…", ["Retry stage", "Retry stage"]],
  [{ kind: "retry", stage: "images" }, "Resume", ["Retry stage", "Retrying…"]],
] as const)(
  "labels only the in-flight control while every control waits: %j",
  async (performing, resume, retries) => {
    const actions: ProjectActions = {
      run: () => undefined,
      pending: true,
      performing,
      refusal: undefined,
      dismissRefusal: () => undefined,
    };
    const summary = body({ status: "failed", stages: [], outputs: [] }).project;
    const project = { ...summary, format: "16:9" as const, config: generated().revision.config };
    renderRouted(
      <RevisionControlContext value={true}>
        <ProjectHeader
          project={project}
          prompts={undefined}
          actions={actions}
          inFlight={false}
          resumable={false}
          primaryOutput={undefined}
        />
        {(["audio", "images"] as const).map((kind) => (
          <StageRow
            key={kind}
            stage={stage(kind, "failed")}
            project={project}
            outputs={[]}
            providers={[]}
            actions={actions}
          >
            {null}
          </StageRow>
        ))}
      </RevisionControlContext>,
      testDeps({}),
    );
    expect((await screen.findByRole("button", { name: resume })).hasAttribute("disabled")).toBe(
      true,
    );
    const labels = within(
      screen.getByRole("region", { name: /Audio workspace|Narration workspace/ }),
    )
      .getAllByRole("button")
      .concat(
        within(screen.getByRole("region", { name: /Images workspace/ })).getAllByRole("button"),
      )
      .filter((button) => /^Retry/.test(button.textContent ?? ""));
    expect(labels.map((button) => button.textContent)).toEqual(retries);
    expect(labels.every((button) => button.hasAttribute("disabled"))).toBe(true);
  },
);
