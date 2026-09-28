import { stageKinds } from "@app/kernel/pipeline.js";
import type { ProjectSummary } from "@app/slices/admission/model.js";
import type { RevisionView } from "@app/slices/revisions/model.js";
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { body, stage } from "@/routes/project-fixtures";
import { jsonAnswer, renderApp, testDeps } from "@/test-app";
import { canRerunSection } from "./controls.js";
import { RevisionControlContext } from "./revision-action-context.js";
import { revisionView } from "./revision-fixture.js";
import { RevisionMedia } from "./revision-media.js";
import { SectionMore } from "./stage-section.js";
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
          document: "generate",
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
it("offers every generated section but no provided/off conversion or edited-article overwrite", () => {
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

it("makes a whole stage again from the section's own button, confirmed, by keyboard", async () => {
  const user = userEvent.setup();
  const run = vi.fn((_action: Action) => undefined);
  const view = generated();
  const deps = testDeps({ "GET /api/projects/p1/revisions/r1": jsonAnswer({ view }) });
  const project = body({ status: "done", stages: [], outputs: [] })
    .project as unknown as ProjectSummary;
  function Control() {
    const [pending, setPending] = useState(false);
    const actions: ProjectActions = {
      run: (action) => {
        run(action);
        setPending(true);
      },
      pending,
      refusal: undefined,
      dismissRefusal: () => undefined,
    };
    return (
      <RevisionMedia projectId="p1" revisionId="r1">
        <RevisionControlContext value={true}>
          <SectionMore stages={[stage("images", "done")]} project={project} actions={actions} />
        </RevisionControlContext>
      </RevisionMedia>
    );
  }
  renderApp(<Control />, deps);
  const again = await screen.findByRole("button", { name: "Make all images again" });
  await user.click(again);
  const dialog = await screen.findByRole("dialog");
  expect(dialog.textContent).toMatch(/generated images.*video.*History/i);
  expect(within(dialog).queryByRole("checkbox")).toBeNull();
  await user.keyboard("{Escape}");
  expect(run).not.toHaveBeenCalled();
  await user.click(again);
  const confirm = within(await screen.findByRole("dialog")).getByRole("button", {
    name: "Make all images again",
  });
  confirm.focus();
  await user.keyboard("{Enter}");
  expect(run).toHaveBeenCalledWith({ kind: "rerun", stage: "images" });
  // While it runs, the button stays in place but can't be pressed again.
  await waitFor(() =>
    expect(again.getAttribute("aria-disabled") === "true" || again.hasAttribute("disabled")).toBe(
      true,
    ),
  );
});

it("offers no whole-stage remake for provided or edited work", async () => {
  const view = revisionView();
  const deps = testDeps({ "GET /api/projects/p1/revisions/r1": jsonAnswer({ view }) });
  const actions: ProjectActions = {
    run: () => undefined,
    pending: false,
    refusal: undefined,
    dismissRefusal: () => undefined,
  };
  renderApp(
    <RevisionMedia projectId="p1" revisionId="r1">
      <RevisionControlContext value={true}>
        <SectionMore
          stages={[stage("video", "done")]}
          project={
            body({ status: "done", stages: [], outputs: [] }).project as unknown as ProjectSummary
          }
          actions={actions}
        />
      </RevisionControlContext>
    </RevisionMedia>,
    deps,
  );
  await waitFor(() => expect(screen.queryByRole("button", { name: /More actions/ })).toBeNull());
});
