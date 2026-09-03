import type { ProjectState } from "@app/kernel/pipeline.js";
import type { ProjectListing } from "@app/slices/admission/model.js";
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { startedAt } from "@/lib/utils";
import type { Answer } from "@/test-app";
import { emptyAnswer, jsonAnswer, problemAnswer, renderRouted, testDeps } from "@/test-app";
import { ProjectsRoute } from "./projects.js";

afterEach(cleanup);

function summary(
  id: string,
  title: string,
  status: ProjectState,
  over: Partial<ProjectListing> = {},
): ProjectListing {
  return {
    id,
    title,
    status,
    progress: 0,
    format: "16:9",
    config: {
      title,
      format: "16:9",
      sources: {
        research: "off",
        article: "generate",
        audio: "generate",
        images: "generate",
        thumbnail: "off",
        video: "generate",
      },
      articlePrompt: "Documentary dossier",
      imagePrompts: [],
      values: {},
      provided: {},
      silenceGapSeconds: 3,
      rendered: {},
    },
    createdAt: "2026-09-02T19:14:00.000Z",
    updatedAt: "2026-09-02T19:14:00.000Z",
    ...over,
  };
}

function deps(projects: readonly ProjectListing[], extra: Readonly<Record<string, Answer>> = {}) {
  return testDeps({ "GET /api/projects": jsonAnswer({ projects }), ...extra });
}

describe("the projects list", () => {
  it("shows skeleton rows while the list is coming", async () => {
    const { container } = renderRouted(<ProjectsRoute />, testDeps({}));
    await waitFor(() => {
      expect(container.querySelectorAll(".rounded-full").length).toBe(6);
    });
  });

  it("teaches where runs come from when there are none", async () => {
    renderRouted(<ProjectsRoute />, deps([]));
    expect(await screen.findByText(/No projects yet/)).not.toBeNull();
    expect(screen.getByRole("link", { name: "Play" }).getAttribute("href")).toBe("/play");
  });

  it("lists every run with its lamp, its state word and a link into it", async () => {
    renderRouted(
      <ProjectsRoute />,
      deps([summary("p1", "Rope Tricks", "running"), summary("p2", "Knots", "done")]),
    );

    const row = await screen.findByRole("link", { name: /Rope Tricks/ });
    expect(row.getAttribute("href")).toBe("/projects/p1");
    expect(screen.getByText("running")).not.toBeNull();
    expect(screen.getByText("done")).not.toBeNull();
  });

  it("says what the run was made of and when it started", async () => {
    renderRouted(<ProjectsRoute />, deps([summary("p1", "Rope Tricks", "done")]));

    expect(await screen.findByText("Documentary dossier · 16:9")).not.toBeNull();
    // The clock is the machine's, so the expectation is built the same way the row is.
    expect(screen.getByText(startedAt("2026-09-02T19:14:00.000Z"))).not.toBeNull();
  });

  it("names only the format when the run picked no article prompt", async () => {
    const generated = summary("p1", "Rope Tricks", "done");
    renderRouted(
      <ProjectsRoute />,
      deps([{ ...generated, config: { ...generated.config, articlePrompt: undefined } }]),
    );

    expect(await screen.findByText("16:9")).not.toBeNull();
  });

  it("carries the meter under a running row, at the share the server averaged", async () => {
    const { container } = renderRouted(
      <ProjectsRoute />,
      deps([summary("p1", "Rope Tricks", "running", { progress: 0.37 })]),
    );

    await screen.findByText("Rope Tricks");
    const meter = container.querySelector("[data-slot='rail-meter']");
    expect(meter).not.toBeNull();
    expect((meter as HTMLElement | null)?.style.width).toBe("37%");
  });

  it("carries no meter on a row that is not running", async () => {
    const { container } = renderRouted(
      <ProjectsRoute />,
      deps([summary("p1", "Rope Tricks", "done", { progress: 1 })]),
    );

    await screen.findByText("Rope Tricks");
    expect(container.querySelector("[data-slot='rail-meter']")).toBeNull();
  });

  it("offers a new run", async () => {
    renderRouted(<ProjectsRoute />, deps([]));
    expect((await screen.findByRole("link", { name: "New run" })).getAttribute("href")).toBe(
      "/play",
    );
  });

  it("names the problem when the list cannot be read", async () => {
    renderRouted(
      <ProjectsRoute />,
      testDeps({ "GET /api/projects": problemAnswer("The database is locked.", 500) }),
    );
    expect(await screen.findByText("The database is locked.")).not.toBeNull();
  });
});

// Deleting a project, through the screen that owns the confirmation.
describe("deleting a project", () => {
  it("confirms first, naming the project and what goes with it", async () => {
    const user = userEvent.setup();
    let deleted: string | undefined;
    renderRouted(
      <ProjectsRoute />,
      deps([summary("p1", "Rope Tricks", "done")], {
        "DELETE /api/projects/p1": (request) => {
          deleted = new URL(request.url).pathname;
          return emptyAnswer()(request);
        },
      }),
    );

    await user.click(await screen.findByRole("button", { name: "More for Rope Tricks" }));
    await user.click(screen.getByRole("menuitem", { name: "Delete" }));

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText('Delete "Rope Tricks"?')).not.toBeNull();
    expect(
      within(dialog).getByText("Deletes the project and every file it produced."),
    ).not.toBeNull();
    expect(deleted).toBeUndefined();

    await user.click(within(dialog).getByRole("button", { name: "Delete" }));
    await waitFor(() => {
      expect(deleted).toBe("/api/projects/p1");
    });
  });

  it("deletes nothing when the confirmation is dismissed", async () => {
    const user = userEvent.setup();
    let deleted: string | undefined;
    renderRouted(
      <ProjectsRoute />,
      deps([summary("p1", "Rope Tricks", "done")], {
        "DELETE /api/projects/p1": (request) => {
          deleted = "called";
          return emptyAnswer()(request);
        },
      }),
    );

    await user.click(await screen.findByRole("button", { name: "More for Rope Tricks" }));
    await user.click(screen.getByRole("menuitem", { name: "Delete" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cancel" }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
    expect(deleted).toBeUndefined();
  });

  it("refuses while the run is going, and says what to do first", async () => {
    const user = userEvent.setup();
    renderRouted(<ProjectsRoute />, deps([summary("p1", "Rope Tricks", "running")]));

    await user.click(await screen.findByRole("button", { name: "More for Rope Tricks" }));

    const item = screen.getByRole("menuitem", { name: "Delete" });
    expect(item.getAttribute("data-disabled")).not.toBeNull();
    expect(screen.getByText("Cancel the run first")).not.toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("names the problem when the server refuses the delete", async () => {
    const user = userEvent.setup();
    renderRouted(
      <ProjectsRoute />,
      deps([summary("p1", "Rope Tricks", "done")], {
        "DELETE /api/projects/p1": problemAnswer(
          "Some of this project's files could not be removed.",
          500,
        ),
      }),
    );

    await user.click(await screen.findByRole("button", { name: "More for Rope Tricks" }));
    await user.click(screen.getByRole("menuitem", { name: "Delete" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete" }));

    expect(
      await screen.findByText("Some of this project's files could not be removed."),
    ).not.toBeNull();
  });
});
