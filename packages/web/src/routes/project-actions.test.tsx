import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CommandPaletteProvider,
  CommandRegistry,
  matchCommands,
} from "@/components/kit/command-palette";
import { intents, requestIntent } from "@/lib/intents";
import {
  jsonAnswer,
  openProjectEditor,
  openProjectTab,
  problemAnswer,
  renderRouted,
} from "@/test-app";
import { ProjectRoute } from "./project.js";
import { deps, finished, recoveryAccepted, selectProjectStage } from "./project-fixtures.js";
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
    await userEvent.click(screen.getByRole("button", { name: "Delete image 1" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Delete this image?")).not.toBeNull();
    expect(
      within(dialog).getByText("Removes the image and re-renders video when enabled."),
    ).not.toBeNull();
    expect(deleted).not.toHaveBeenCalled();

    await userEvent.click(within(dialog).getByRole("button", { name: "Delete the image" }));
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
    await userEvent.click(screen.getByRole("button", { name: "Delete image 1" }));
    await userEvent.click(
      within(await screen.findByRole("dialog")).getByRole("button", { name: "Delete the image" }),
    );

    const said = await screen.findByText(refusal);
    // Said where the press happened: inside the Images section, not at the top of a page the
    // user has scrolled away from.
    const block = screen.getByRole("region", { name: "Images" });
    expect(block.contains(said)).toBe(true);
    expect(said.closest('[role="alert"]')).not.toBeNull();
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
    await userEvent.click(screen.getByRole("button", { name: "Regenerate image 1" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Regenerate this image?")).not.toBeNull();
    expect(made).not.toHaveBeenCalled();
    await userEvent.click(within(dialog).getByRole("button", { name: "Regenerate the image" }));
    await waitFor(() => {
      expect(made).toHaveBeenCalledTimes(1);
    });
  });

  it("opens the Images section and asks to regenerate image 1 when asked from another screen", async () => {
    const made = vi.fn();
    // What "Regenerate image 1 in …" from Home leaves before it navigates here.
    requestIntent(intents.showImages("p1"));
    requestIntent(intents.regenerateImage("p1"), 1);
    renderRouted(
      <ProjectRoute projectId="p1" />,
      deps({
        "POST /api/projects/p1/images/o-image-1/regenerate": (request) => {
          made();
          return jsonAnswer(finished)(request);
        },
      }),
    );

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Regenerate this image?")).not.toBeNull();
    expect(made).not.toHaveBeenCalled();
    await userEvent.click(within(dialog).getByRole("button", { name: "Regenerate the image" }));
    await waitFor(() => {
      expect(made).toHaveBeenCalledTimes(1);
    });
    expect(screen.getByRole("region", { name: "Images" })).not.toBeNull();
  });

  it("regenerates any image by number from the palette, shown or not", async () => {
    const registry = new CommandRegistry();
    renderRouted(
      <CommandPaletteProvider registry={registry}>
        <ProjectRoute projectId="p1" />
      </CommandPaletteProvider>,
      deps({}),
    );
    await waitFor(() =>
      expect(registry.list().some((one) => one.id === "project.image.regenerate")).toBe(true),
    );
    const [found] = matchCommands(registry.list(), "regenerate image 1");
    expect(found?.title).toBe("Regenerate image 1");
    void found?.run();
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Regenerate this image?")).not.toBeNull();
  });

  it("confirms before making a whole stage again, from the section's More", async () => {
    const rerun = vi.fn();
    renderRouted(
      <ProjectRoute projectId="p1" />,
      deps({
        "POST /api/projects/p1/stages/video/rerun": (request) => {
          rerun();
          return jsonAnswer(recoveryAccepted)(request);
        },
      }),
    );

    const video = await screen.findByRole("region", { name: "Video" });
    await userEvent.click(within(video).getByRole("button", { name: "Render the video again" }));
    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByText(
        "Rebuilds local exports from saved media without regenerating narration or images; previous outputs stay in History. No charge: it runs on this computer.",
      ),
    ).not.toBeNull();
    expect(rerun).not.toHaveBeenCalled();
    await userEvent.click(within(dialog).getByRole("button", { name: "Render the video again" }));
    await waitFor(() => {
      expect(rerun).toHaveBeenCalledTimes(1);
    });
  });
});

describe("editing the article", () => {
  it("saves the article in a revision without starting a rebuild", async () => {
    const fixture = revisionRouteFixture(finished);
    renderRouted(<ProjectRoute projectId="p1" />, fixture.app);
    await openProjectEditor();
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
    await openProjectEditor();
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
    await openProjectEditor();
    const editor = await screen.findByLabelText("Article text");
    await userEvent.clear(editor);
    await userEvent.type(editor, "My unfinished changes.");
    await selectProjectStage("Audio");
    await selectProjectStage("Article");
    // The draft waits in the Settings view, which the rail marks unsaved.
    const rail = screen.getByRole("navigation", { name: "Project sections" });
    expect(within(rail).getByRole("link", { name: /^Settings/ }).textContent).toContain("unsaved");
    await openProjectTab("Edit");
    expect((screen.getByLabelText("Article text") as HTMLTextAreaElement).value).toBe(
      "My unfinished changes.",
    );
    expect(screen.queryByRole("button", { name: "Save & update outputs" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Discard changes" }));
    expect(screen.queryByLabelText("Article text")).toBeNull();
    expect(fixture.save).not.toHaveBeenCalled();
  });
});
