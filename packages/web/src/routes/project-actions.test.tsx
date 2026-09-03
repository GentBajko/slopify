import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { jsonAnswer, problemAnswer, renderRouted } from "@/test-app";
import { ProjectRoute } from "./project.js";
import { deps, finished } from "./project-fixtures.js";

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

    await screen.findByText("Images");
    await userEvent.click(screen.getAllByRole("button", { name: "Delete" })[0] as HTMLElement);
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Delete this image?")).not.toBeNull();
    expect(
      within(dialog).getByText("Removed from the slideshow; the video re-renders."),
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

    await screen.findByText("Images");
    await userEvent.click(screen.getAllByRole("button", { name: "Delete" })[0] as HTMLElement);
    await userEvent.click(
      within(await screen.findByRole("dialog")).getByRole("button", { name: "Delete" }),
    );

    const said = await screen.findByRole("alert");
    expect(said.textContent).toBe(refusal);
    // Said where the press happened: inside the Images stage's own block, not at the top
    // of a page the user has scrolled away from.
    const block = said.closest("div.border-b") as HTMLElement;
    expect(within(block).getByText("Images")).not.toBeNull();
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

    await screen.findByText("Images");
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
    expect(within(dialog).getByText("Replaces the video with a fresh render.")).not.toBeNull();
    expect(rerun).not.toHaveBeenCalled();
    await userEvent.click(within(dialog).getByRole("button", { name: "Re-run" }));
    await waitFor(() => {
      expect(rerun).toHaveBeenCalledTimes(1);
    });
  });
});

describe("editing the article", () => {
  it("confirms the save and sends the edited markdown", async () => {
    let sent = "";
    renderRouted(
      <ProjectRoute projectId="p1" />,
      deps({
        "PUT /api/projects/p1/article": async (request) => {
          sent = ((await request.json()) as { markdown: string }).markdown;
          return jsonAnswer(finished)(request);
        },
      }),
    );

    await userEvent.click(await screen.findByRole("button", { name: "Edit" }));
    const editor = await screen.findByLabelText("Article");
    await userEvent.clear(editor);
    await userEvent.type(editor, "Rewritten.");

    await userEvent.click(screen.getByRole("button", { name: "Save & re-run from audio" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Save the edited article?")).not.toBeNull();
    expect(sent).toBe("");

    await userEvent.click(within(dialog).getByRole("button", { name: "Save & re-run from audio" }));
    await waitFor(() => {
      expect(sent).toBe("Rewritten.");
    });
  });

  it("keeps the typing in the editor when the server refuses the save", async () => {
    renderRouted(
      <ProjectRoute projectId="p1" />,
      deps({
        "PUT /api/projects/p1/article": problemAnswer("An article cannot be saved empty.", 400),
      }),
    );

    await userEvent.click(await screen.findByRole("button", { name: "Edit" }));
    const editor = await screen.findByLabelText("Article");
    await userEvent.clear(editor);
    await userEvent.type(editor, "Still mine.");
    await userEvent.click(screen.getByRole("button", { name: "Save & re-run from audio" }));
    await userEvent.click(
      within(await screen.findByRole("dialog")).getByRole("button", {
        name: "Save & re-run from audio",
      }),
    );

    expect((await screen.findByRole("alert")).textContent).toBe(
      "An article cannot be saved empty.",
    );
    expect((screen.getByLabelText("Article") as HTMLTextAreaElement).value).toBe("Still mine.");
  });

  it("confirms a discard before it throws the typing away", async () => {
    renderRouted(<ProjectRoute projectId="p1" />, deps());

    await userEvent.click(await screen.findByRole("button", { name: "Edit" }));
    await userEvent.type(await screen.findByLabelText("Article"), " and mine");
    await userEvent.click(screen.getByRole("button", { name: "Discard" }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Discard these edits?")).not.toBeNull();
    await userEvent.click(within(dialog).getByRole("button", { name: "Keep editing" }));
    expect(screen.getByLabelText("Article")).not.toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "Discard" }));
    await userEvent.click(
      within(await screen.findByRole("dialog")).getByRole("button", { name: "Discard" }),
    );
    await waitFor(() => {
      expect(screen.queryByLabelText("Article")).toBeNull();
    });
  });
});
