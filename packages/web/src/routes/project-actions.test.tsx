import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { jsonAnswer, problemAnswer, renderRouted } from "@/test-app";
import { ProjectRoute } from "./project.js";
import { deps, finished, selectProjectStage } from "./project-fixtures.js";
import { revisionRouteFixture } from "./project-revision.fake.js";

afterEach(cleanup);

describe("the destructive actions", () => {
  it("confirms before deleting an image, and says what the deletion costs", async () => {
    const deleted = vi.fn();
    renderRouted(
      <ProjectRoute projectId="p1" />,
      deps({
        "DELETE /api/projects/p1/images/o-image-1": (request) => {
          deleted();
          return jsonAnswer(finished)(request);
        },
      }),
    );

    await selectProjectStage("Images");
    await userEvent.click(screen.getAllByRole("button", { name: "Delete" })[0] as HTMLElement);
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Delete this image?")).not.toBeNull();
    expect(
      within(dialog).getByText("Removes the image and re-renders video when enabled."),
    ).not.toBeNull();
    expect(deleted).not.toHaveBeenCalled();

    await userEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
    await waitFor(() => {
      expect(deleted).toHaveBeenCalledTimes(1);
    });
  });

  it("shows the server's own refusal when the last image cannot go", async () => {
    const refusal = "At least one image must remain, so the last one cannot be deleted.";
    renderRouted(
      <ProjectRoute projectId="p1" />,
      deps({ "DELETE /api/projects/p1/images/o-image-1": problemAnswer(refusal, 409) }),
    );

    await selectProjectStage("Images");
    await userEvent.click(screen.getAllByRole("button", { name: "Delete" })[0] as HTMLElement);
    await userEvent.click(
      within(await screen.findByRole("dialog")).getByRole("button", { name: "Delete" }),
    );

    const said = await screen.findByRole("alert");
    expect(said.textContent).toBe(refusal);
    // Said where the press happened: inside the Images stage's own block, not at the top
    // of a page the user has scrolled away from.
    const block = screen.getByRole("region", { name: "Images workspace" });
    expect(block.contains(said)).toBe(true);
    expect(within(block).getByRole("heading", { name: "Image library" })).not.toBeNull();
  });

  it("confirms before regenerating an image", async () => {
    const made = vi.fn();
    renderRouted(
      <ProjectRoute projectId="p1" />,
      deps({
        "POST /api/projects/p1/images/o-image-1/regenerate": (request) => {
          made();
          return jsonAnswer(finished)(request);
        },
      }),
    );

    await selectProjectStage("Images");
    await userEvent.click(screen.getAllByRole("button", { name: "Regenerate" })[0] as HTMLElement);
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Regenerate this image?")).not.toBeNull();
    expect(made).not.toHaveBeenCalled();
    await userEvent.click(within(dialog).getByRole("button", { name: "Regenerate" }));
    await waitFor(() => {
      expect(made).toHaveBeenCalledTimes(1);
    });
  });

  it("confirms before re-running a stage", async () => {
    const rerun = vi.fn();
    renderRouted(
      <ProjectRoute projectId="p1" />,
      deps({
        "POST /api/projects/p1/stages/video/rerun": (request) => {
          rerun();
          return jsonAnswer(finished)(request);
        },
      }),
    );

    await screen.findByText("Video");
    await userEvent.click(screen.getByRole("button", { name: "Re-render" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Replaces the final audio or video export.")).not.toBeNull();
    expect(rerun).not.toHaveBeenCalled();
    await userEvent.click(within(dialog).getByRole("button", { name: "Re-run" }));
    await waitFor(() => {
      expect(rerun).toHaveBeenCalledTimes(1);
    });
  });
});

describe("editing the article", () => {
  it("saves the article in a revision without starting a rebuild", async () => {
    const fixture = revisionRouteFixture(finished);
    renderRouted(<ProjectRoute projectId="p1" />, fixture.app);
    await userEvent.click(await screen.findByRole("button", { name: "Edit project" }));
    const editor = await screen.findByLabelText("Article text");
    await userEvent.clear(editor);
    await userEvent.type(editor, "Rewritten.");
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(fixture.save).toHaveBeenCalledOnce());
    expect(fixture.view().revision.content.articleMarkdown).toBe("Rewritten.");
    expect(fixture.start).not.toHaveBeenCalled();
  });

  it("keeps the typing when the revision save is refused", async () => {
    const fixture = revisionRouteFixture(finished);
    renderRouted(
      <ProjectRoute projectId="p1" />,
      deps({
        ...fixture.routes,
        "POST /api/projects/p1/revisions": problemAnswer("An article cannot be saved empty.", 400),
      }),
    );
    await userEvent.click(await screen.findByRole("button", { name: "Edit project" }));
    const editor = await screen.findByLabelText("Article text");
    await userEvent.clear(editor);
    await userEvent.type(editor, "Still mine.");
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await screen.findByText("An article cannot be saved empty.");
    expect((editor as HTMLTextAreaElement).value).toBe("Still mine.");
  });

  it("keeps an unfinished article edit when switching output stages, until discarded", async () => {
    const fixture = revisionRouteFixture(finished);
    renderRouted(<ProjectRoute projectId="p1" />, fixture.app);
    await userEvent.click(await screen.findByRole("button", { name: "Edit project" }));
    const editor = await screen.findByLabelText("Article text");
    await userEvent.clear(editor);
    await userEvent.type(editor, "My unfinished changes.");
    await selectProjectStage("Audio");
    await selectProjectStage("Article");
    expect((screen.getByLabelText("Article text") as HTMLTextAreaElement).value).toBe(
      "My unfinished changes.",
    );
    expect(screen.queryByRole("button", { name: "Save & update outputs" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Discard changes" }));
    expect(screen.queryByLabelText("Article text")).toBeNull();
    expect(fixture.save).not.toHaveBeenCalled();
  });
});
