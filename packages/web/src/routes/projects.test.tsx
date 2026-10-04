import type { ProjectState } from "@app/kernel/pipeline.js";
import type { ProjectListing } from "@app/slices/admission/model.js";
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { ToastProvider } from "@/components/kit/toast";
import { startedAt } from "@/lib/utils";
import { projectsSearchOf } from "@/router";
import type { Answer } from "@/test-app";
import { emptyAnswer, jsonAnswer, problemAnswer, renderRouted, testDeps } from "@/test-app";
import { ProjectsRoute, projectFilterOf, projectSortOf } from "./projects.js";

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
      sources: {
        research: "off",
        article: "generate",
        audio: "generate",
        images: "generate",
        thumbnail: "off",
        video: "generate",
      },
      articlePrompt: "Documentary dossier",
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

  it("carries a progress bar on a running row at the share the server averaged, and none otherwise", async () => {
    renderRouted(
      <ProjectsRoute />,
      deps([
        listing("p1", "Rope Tricks", "running", { progress: 0.37 }),
        listing("p2", "Knots", "done", { progress: 1 }),
      ]),
    );
    // Task completion is a progress bar, not a meter (a meter is a quantity in a range).
    const bar = await screen.findByRole("progressbar", { name: "Rope Tricks progress" });
    expect(bar.getAttribute("aria-valuenow")).toBe("37");
    expect(screen.queryByRole("progressbar", { name: "Knots progress" })).toBeNull();
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
    expect((await screen.findByRole("link", { name: "Create" })).getAttribute("href")).toBe(
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

  it("opens on the filter Home linked to, and shows queued runs apart from waiting ones", async () => {
    renderRouted(
      <ProjectsRoute initialFilter="queued" />,
      deps([
        listing("p1", "Queued one", "pending"),
        listing("p2", "Held one", "pending", { progress: 0.4 }),
        listing("p3", "Going", "running"),
      ]),
    );
    expect(await screen.findByRole("link", { name: "Queued one" })).not.toBeNull();
    expect(screen.queryByRole("link", { name: "Held one" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Going" })).toBeNull();
    expect(projectFilterOf("running")).toBe("running");
    expect(projectFilterOf("nonsense")).toBeUndefined();
  });
});

describe("marking uploaded", () => {
  it("marks a finished video uploaded from its row, and offers the undo for a day", async () => {
    const user = userEvent.setup();
    const sent: unknown[] = [];
    renderRouted(
      <ProjectsRoute />,
      deps(
        [
          listing("p1", "Rope Tricks", "done"),
          listing("p2", "Knots", "done", { uploadedAt: new Date().toISOString() }),
          listing("p3", "Sailing", "done", { uploadedAt: "2026-09-03T10:00:00.000Z" }),
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
    const list = await screen.findByRole("list", { name: "Projects" });
    await user.click(within(list).getByRole("button", { name: "Mark uploaded" }));
    await waitFor(() => expect(sent).toEqual([{ uploaded: true }]));
    expect(screen.getAllByText("Uploaded")).toHaveLength(2);
    await user.click(screen.getByRole("button", { name: "Undo upload mark: Knots" }));
    await waitFor(() => expect(sent).toEqual([{ uploaded: true }, { uploaded: false }]));
    // Marked weeks ago: the badge stays, the row no longer offers to take it back.
    expect(screen.queryByRole("button", { name: "Undo upload mark: Sailing" })).toBeNull();
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
        "Moves the project to the trash for 30 days. Undo brings it back, or restore it later in Settings → Backup & storage → Trash.",
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
    expect(button.getAttribute("aria-disabled")).toBe("true");
    expect(button.getAttribute("data-tip")).toBe("Cancel the run first, then delete it.");
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

describe("ordering and paging", () => {
  it("sorts by name, by recent change and by status, and keeps the order in the address", async () => {
    const user = userEvent.setup();
    const picked: string[] = [];
    renderRouted(
      <ProjectsRoute onSort={(sort) => picked.push(sort)} />,
      deps([
        listing("p1", "Beta", "done", {
          createdAt: "2026-09-03T10:00:00.000Z",
          updatedAt: "2026-09-03T10:00:00.000Z",
        }),
        listing("p2", "alpha", "failed", {
          createdAt: "2026-09-01T10:00:00.000Z",
          updatedAt: "2026-09-05T10:00:00.000Z",
        }),
        listing("p3", "Gamma", "running", {
          createdAt: "2026-09-02T10:00:00.000Z",
          updatedAt: "2026-09-02T10:00:00.000Z",
        }),
      ]),
    );
    const names = (): string[] =>
      within(screen.getByRole("list", { name: "Projects" }))
        .getAllByRole("link")
        .map((link) => link.textContent ?? "");
    await screen.findByRole("link", { name: "Beta" });
    expect(names()).toEqual(["Beta", "Gamma", "alpha"]);
    const sort = screen.getByRole("combobox", { name: "Sort projects" });
    await user.selectOptions(sort, "name");
    expect(names()).toEqual(["alpha", "Beta", "Gamma"]);
    await user.selectOptions(sort, "changed");
    expect(names()).toEqual(["alpha", "Beta", "Gamma"]);
    await user.selectOptions(sort, "status");
    expect(names()).toEqual(["Gamma", "alpha", "Beta"]);
    expect(picked).toEqual(["name", "changed", "status"]);
    expect(projectsSearchOf({ sort: "name" })).toEqual({ sort: "name" });
    expect(projectsSearchOf({ sort: "newest" })).toEqual({});
    expect(projectSortOf("nonsense")).toBeUndefined();
  });

  it("draws fifty rows and offers the rest behind Show more", async () => {
    const user = userEvent.setup();
    renderRouted(
      <ProjectsRoute />,
      deps(
        Array.from({ length: 62 }, (_, index) =>
          listing(`p${String(index)}`, `Project ${String(index)}`, "done"),
        ),
      ),
    );
    await screen.findByRole("link", { name: "Project 0" });
    expect(screen.getAllByRole("checkbox", { name: /^Select row:/ })).toHaveLength(50);
    expect(screen.getByText("50 of 62 shown")).not.toBeNull();
    await user.click(screen.getByRole("button", { name: "Show 12 more" }));
    expect(screen.getAllByRole("checkbox", { name: /^Select row:/ })).toHaveLength(62);
    expect(screen.queryByRole("button", { name: /^Show \d+ more$/ })).toBeNull();
  });

  it("gives a long name its full text on hover", async () => {
    const long = "A very long project name that the row cuts short with an ellipsis";
    renderRouted(<ProjectsRoute />, deps([listing("p1", long, "done")]));
    expect((await screen.findByRole("link", { name: long })).getAttribute("title")).toBe(long);
  });
});

describe("selected projects", () => {
  it("deletes the ticked projects after asking, and Undo restores them from the trash", async () => {
    const user = userEvent.setup();
    const deleted: string[] = [];
    const restored: unknown[] = [];
    renderRouted(
      <ToastProvider>
        <ProjectsRoute />
      </ToastProvider>,
      deps(
        [
          listing("p1", "Rope Tricks", "done"),
          listing("p2", "Knots", "failed"),
          listing("p3", "Sailing", "running"),
        ],
        {
          "DELETE /api/projects/p1": (request) => {
            deleted.push("p1");
            return emptyAnswer()(request);
          },
          "DELETE /api/projects/p2": (request) => {
            deleted.push("p2");
            return emptyAnswer()(request);
          },
          "POST /api/trash/bulk/restore": async (request) => {
            restored.push(await request.json());
            return jsonAnswer({ restored: [{}, {}], failed: [] })(request);
          },
        },
      ),
    );
    await screen.findByRole("link", { name: "Rope Tricks" });
    const bar = document.querySelector<HTMLElement>("[data-slot='selection-bar']");
    if (bar === null) throw new Error("no selection bar");
    const remove = within(bar).getByRole("button", { name: "Delete" });
    expect(remove.hasAttribute("disabled")).toBe(true);

    await user.click(within(bar).getByRole("checkbox", { name: "Select all" }));
    expect(within(bar).getByText("3 of 3 projects selected")).not.toBeNull();
    await user.click(remove);
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Delete 2 projects?")).not.toBeNull();
    expect(within(dialog).getByText(/1 project still running stays/)).not.toBeNull();
    await user.click(within(dialog).getByRole("button", { name: "Delete 2 projects" }));
    await waitFor(() => expect(deleted).toEqual(["p1", "p2"]));

    await user.click(await screen.findByRole("button", { name: "Undo" }));
    await waitFor(() =>
      expect(restored).toEqual([
        {
          items: [
            { kind: "project", id: "p1" },
            { kind: "project", id: "p2" },
          ],
        },
      ]),
    );
  });

  it("marks the ticked finished videos uploaded and leaves the rest", async () => {
    const user = userEvent.setup();
    const marked: string[] = [];
    const answer = (id: string) => async (request: Request) => {
      marked.push(id);
      return jsonAnswer({ uploadedAt: "2026-09-04T10:00:00.000Z" })(request);
    };
    renderRouted(
      <ProjectsRoute />,
      deps(
        [
          listing("p1", "Rope Tricks", "done"),
          listing("p2", "Knots", "running"),
          listing("p3", "Sailing", "done"),
        ],
        {
          "PUT /api/projects/p1/uploaded": answer("p1"),
          "PUT /api/projects/p3/uploaded": answer("p3"),
        },
      ),
    );
    await user.click(await screen.findByRole("checkbox", { name: "Select row: Rope Tricks" }));
    await user.click(screen.getByRole("checkbox", { name: "Select row: Knots" }));
    const bar = document.querySelector<HTMLElement>("[data-slot='selection-bar']");
    if (bar === null) throw new Error("no selection bar");
    await user.click(within(bar).getByRole("button", { name: "Mark uploaded" }));
    await waitFor(() => expect(marked).toEqual(["p1"]));
  });

  it("gives each row checkbox a 24px target", async () => {
    renderRouted(<ProjectsRoute />, deps([listing("p1", "Rope Tricks", "done")]));
    const box = await screen.findByRole("checkbox", { name: "Select row: Rope Tricks" });
    expect(box.closest("label")?.className).toContain("size-6");
  });
});
