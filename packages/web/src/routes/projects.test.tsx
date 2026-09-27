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

const defaultChannel = "00000000-0000-4000-8000-000000000001";

export function listing(
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
    channelId: defaultChannel,
    uploadedAt: null,
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
      imageSeconds: 15,
      zoomPercent: 22.5,
      motionStyle: "zoom",
      edgeSilenceSeconds: 0,
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
      expect(container.querySelectorAll("[data-slot='skeleton-row']").length).toBe(6);
    });
  });

  it("teaches where runs come from when there are none", async () => {
    renderRouted(<ProjectsRoute />, deps([]));
    expect(await screen.findByRole("heading", { name: "No projects yet" })).not.toBeNull();
    expect(screen.getByRole("link", { name: "Make your first video" }).getAttribute("href")).toBe(
      "/play",
    );
  });

  it("lists every run with its state in words and a link into it", async () => {
    renderRouted(
      <ProjectsRoute />,
      deps([listing("p1", "Rope Tricks", "running"), listing("p2", "Knots", "done")]),
    );

    const row = await screen.findByRole("link", { name: "Rope Tricks" });
    expect(row.getAttribute("href")).toBe("/projects/p1");
    const list = screen.getByRole("list", { name: "Projects" });
    expect(within(list).getByText("Running")).not.toBeNull();
    expect(within(list).getByText("Done")).not.toBeNull();
  });

  it("says a run waits for a CLI's limits, and when they reset", async () => {
    const resetsAt = new Date();
    resetsAt.setHours(14, 0, 0, 0);
    renderRouted(
      <ProjectsRoute />,
      deps([
        listing("p1", "Rope Tricks", "running", {
          limitWaits: [
            {
              name: "Codex",
              stage: "images",
              resetsAt: resetsAt.toISOString(),
              retryAt: resetsAt.toISOString(),
            },
          ],
        }),
      ]),
    );
    const time = resetsAt.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
    const list = await screen.findByRole("list", { name: "Projects" });
    expect(within(list).getByText(`Waiting for Codex limits (resets at ${time})`)).not.toBeNull();
  });

  it("says what the run was made of and when it started", async () => {
    renderRouted(<ProjectsRoute />, deps([listing("p1", "Rope Tricks", "done")]));
    // The clock is the machine's, so the expectation is built the same way the row is.
    expect(
      await screen.findByText(
        `Documentary dossier · 16:9 · started ${startedAt("2026-09-02T19:14:00.000Z")}`,
      ),
    ).not.toBeNull();
  });

  it("carries a meter on a running row at the share the server averaged, and none otherwise", async () => {
    renderRouted(
      <ProjectsRoute />,
      deps([
        listing("p1", "Rope Tricks", "running", { progress: 0.37 }),
        listing("p2", "Knots", "done", { progress: 1 }),
      ]),
    );
    const meter = await screen.findByRole("meter", { name: "Rope Tricks progress" });
    expect(meter.getAttribute("aria-valuenow")).toBe("37");
    expect(screen.queryByRole("meter", { name: "Knots progress" })).toBeNull();
  });

  it("says a run that stopped for a review is waiting for you", async () => {
    renderRouted(
      <ProjectsRoute />,
      deps([listing("p1", "Rope Tricks", "pending", { progress: 0.5 })]),
    );
    expect(await screen.findByText("Waiting for you")).not.toBeNull();
  });

  it("offers a new video", async () => {
    renderRouted(<ProjectsRoute />, deps([]));
    expect((await screen.findByRole("link", { name: "New video" })).getAttribute("href")).toBe(
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

  it("narrows by search and by what needs doing", async () => {
    const user = userEvent.setup();
    renderRouted(
      <ProjectsRoute />,
      deps([
        listing("p1", "Rope Tricks", "failed"),
        listing("p2", "Knots", "done"),
        listing("p3", "Sailing", "done", { uploadedAt: "2026-09-03T10:00:00.000Z" }),
      ]),
    );
    await screen.findByRole("link", { name: "Rope Tricks" });
    await user.click(screen.getByRole("button", { name: "Ready to upload" }));
    expect(screen.queryByRole("link", { name: "Rope Tricks" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Sailing" })).toBeNull();
    expect(screen.getByRole("link", { name: "Knots" })).not.toBeNull();
    await user.click(screen.getByRole("button", { name: "All" }));
    await user.type(screen.getByRole("searchbox", { name: "Search projects" }), "sail");
    expect(screen.getByRole("link", { name: "Sailing" })).not.toBeNull();
    expect(screen.queryByRole("link", { name: "Knots" })).toBeNull();
  });
});

describe("marking uploaded", () => {
  it("marks a finished video uploaded from its row, and undoes it", async () => {
    const user = userEvent.setup();
    const sent: unknown[] = [];
    renderRouted(
      <ProjectsRoute />,
      deps(
        [
          listing("p1", "Rope Tricks", "done"),
          listing("p2", "Knots", "done", { uploadedAt: "2026-09-03T10:00:00.000Z" }),
        ],
        {
          "PUT /api/projects/p1/uploaded": async (request) => {
            sent.push(await request.json());
            return jsonAnswer({ uploadedAt: "2026-09-04T10:00:00.000Z" })(request);
          },
          "PUT /api/projects/p2/uploaded": async (request) => {
            sent.push(await request.json());
            return jsonAnswer({ uploadedAt: null })(request);
          },
        },
      ),
    );
    await user.click(await screen.findByRole("button", { name: "Mark uploaded" }));
    await waitFor(() => expect(sent).toEqual([{ uploaded: true }]));
    expect(screen.getByText("Uploaded")).not.toBeNull();
    await user.click(screen.getByRole("button", { name: "Mark Knots not uploaded" }));
    await waitFor(() => expect(sent).toEqual([{ uploaded: true }, { uploaded: false }]));
  });
});

// Deleting a project, through the screen that owns the confirmation.
describe("deleting a project", () => {
  it("confirms first, naming the project and what goes with it", async () => {
    const user = userEvent.setup();
    let deleted: string | undefined;
    renderRouted(
      <ProjectsRoute />,
      deps([listing("p1", "Rope Tricks", "done")], {
        "DELETE /api/projects/p1": (request) => {
          deleted = new URL(request.url).pathname;
          return emptyAnswer()(request);
        },
      }),
    );

    await user.click(await screen.findByRole("button", { name: "Delete Rope Tricks" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText('Delete "Rope Tricks"?')).not.toBeNull();
    expect(
      within(dialog).getByText(
        "Moves the project to the trash for 30 days. Restore it or delete it for good in Settings → Trash.",
      ),
    ).not.toBeNull();
    expect(deleted).toBeUndefined();

    await user.click(within(dialog).getByRole("button", { name: "Delete project" }));
    await waitFor(() => {
      expect(deleted).toBe("/api/projects/p1");
    });
  });

  it("deletes nothing when the confirmation is dismissed", async () => {
    const user = userEvent.setup();
    let deleted: string | undefined;
    renderRouted(
      <ProjectsRoute />,
      deps([listing("p1", "Rope Tricks", "done")], {
        "DELETE /api/projects/p1": (request) => {
          deleted = "called";
          return emptyAnswer()(request);
        },
      }),
    );

    await user.click(await screen.findByRole("button", { name: "Delete Rope Tricks" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Keep it" }));
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
    expect(deleted).toBeUndefined();
  });

  it("refuses while the run is going, and says what to do first", async () => {
    renderRouted(<ProjectsRoute />, deps([listing("p1", "Rope Tricks", "running")]));
    const button = await screen.findByRole("button", { name: "Delete Rope Tricks" });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    expect(button.getAttribute("title")).toBe("Cancel the run first, then delete it.");
  });

  it("names the problem when the server refuses the delete", async () => {
    const user = userEvent.setup();
    renderRouted(
      <ProjectsRoute />,
      deps([listing("p1", "Rope Tricks", "done")], {
        "DELETE /api/projects/p1": problemAnswer(
          "Some of this project's files could not be removed.",
          500,
        ),
      }),
    );

    await user.click(await screen.findByRole("button", { name: "Delete Rope Tricks" }));
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Delete project" }),
    );
    expect(
      await screen.findByText("Some of this project's files could not be removed."),
    ).not.toBeNull();
  });
});
