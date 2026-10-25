import type { ProjectState } from "@app/kernel/pipeline.js";
import type { ProjectListing } from "@app/slices/admission/model.js";
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/kit/toast";
import { projectStateOf } from "@/lib/state-words";
import { startedAt } from "@/lib/utils";
import { projectsSearchOf } from "@/router";
import type { Answer } from "@/test-app";
import { emptyAnswer, jsonAnswer, problemAnswer, renderRouted, testDeps } from "@/test-app";
import { ProjectsRoute, projectFilterOf, projectSortOf } from "./projects.js";
import { inQueueOrder, matches, sortProjects } from "./projects-order.js";

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
    // A finished video says the same word as its filter and Home: Ready to upload.
    expect(within(list).getByText("Ready to upload")).not.toBeNull();
    // Open is in words on every row, not only behind the title.
    expect(within(list).getByRole("link", { name: "Open Knots" }).getAttribute("href")).toBe(
      "/projects/p2",
    );
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

  it("says what an unfinished run was made of and when it started", async () => {
    renderRouted(<ProjectsRoute />, deps([listing("p1", "Rope Tricks", "failed")]));
    // The clock is the machine's, so the expectation is built the same way the row is.
    expect(
      await screen.findByText(
        `Documentary dossier · 16:9 · started ${startedAt("2026-09-02T19:14:00.000Z")}`,
      ),
    ).not.toBeNull();
  });

  // Thirty finished projects told apart without opening one: the picture, the length, what was
  // made and when it finished, with Download video beside Open.
  it("says what a finished run made, its length and when it finished, with Download video", async () => {
    renderRouted(
      <ProjectsRoute />,
      deps([
        listing("p1", "Rope Tricks", "done", {
          finishedAt: "2026-09-27T17:22:21.000Z",
          durationSeconds: 185,
          outputs: { video: true, shorts: 2, pdf: true, audio: false },
        }),
      ]),
    );
    const row = (await screen.findByRole("link", { name: "Rope Tricks" })).closest("li");
    if (row === null) throw new Error("no row");
    expect(
      within(row).getByText(/^3:05 · 16:9 · video \+ 2 shorts \+ PDF · finished /),
    ).not.toBeNull();
    const download = within(row).getByRole("link", { name: "Download video: Rope Tricks" });
    expect(download.getAttribute("href")).toMatch(/\/files\/p1\/video$/);
    expect(download.textContent).toBe("Download video");
    expect(row.querySelector("img")?.getAttribute("src")).toMatch(/\/files\/p1\/thumbnail$/);
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

  it("says a stopped run's state in the words the agent tools use", async () => {
    renderRouted(
      <ProjectsRoute />,
      deps([
        listing("p1", "Rope Tricks", "pending", { progress: 0.5 }),
        listing("p2", "Knots", "pending", { progress: 0.5, prepared: true }),
        listing("p3", "Hitches", "pending", { progress: 0 }),
        listing("p4", "Splices", "pending", { progress: 0.5, waitingForAgent: true }),
        listing("p5", "Bends", "pending", { progress: 0.5, stopped: true }),
      ]),
    );
    expect(await screen.findByText("Waiting for your review")).not.toBeNull();
    expect(screen.getByText("Bends").closest("li")?.textContent).toContain("Stopped");
    expect(screen.getByText("Waiting for its day")).not.toBeNull();
    expect(screen.getByText("Waiting for the agent")).not.toBeNull();
    expect(screen.getByText("Hitches").closest("li")?.textContent).toContain("Queued");
    expect(screen.queryByText("Waiting for you")).toBeNull();
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
    await user.click(screen.getByRole("button", { name: "Ready to upload 1" }));
    expect(screen.queryByRole("link", { name: "Rope Tricks" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Sailing" })).toBeNull();
    expect(screen.getByRole("link", { name: "Knots" })).not.toBeNull();
    await user.click(screen.getByRole("button", { name: "All 3" }));
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

describe("needs you", () => {
  // A prepared run waits for its day, one parked on an agent's review for
  // the agent; neither is the person's to act on, so neither leads the list.
  // A stopped run waits for the person's Continue the run, so it is theirs.
  it("lists a stopped run under Needs you and sorts it with the waiting ones", () => {
    const projects = [
      listing("p1", "Going", "running", { progress: 0.5 }),
      listing("p2", "Stopped one", "pending", { progress: 0.5, stopped: true }),
    ];
    expect(projects.filter((one) => matches(one, "waiting")).map((one) => one.title)).toEqual([
      "Stopped one",
    ]);
    expect(sortProjects(projects, "status")[0]?.title).toBe("Stopped one");
  });

  // Paused, it waits for the person's Continue the run: under Needs you, as on Home.
  it("lists a paused run under Needs you and sorts it with the waiting ones", () => {
    const projects = [
      listing("p1", "Going", "running", { progress: 0.5 }),
      listing("p2", "Paused one", "paused", { progress: 0.5 }),
    ];
    expect(projects.filter((one) => matches(one, "waiting")).map((one) => one.title)).toEqual([
      "Paused one",
    ]);
    expect(sortProjects(projects, "status")[0]?.title).toBe("Paused one");
  });

  // Stopped before anything was made, it needs Continue the run: it isn't waiting its turn.
  it("counts a run stopped at its start as needing the person, not as Queued", () => {
    const stopped = listing("p1", "Stopped early", "pending", { stopped: true });
    expect(matches(stopped, "queued")).toBe(false);
    expect(matches(stopped, "waiting")).toBe(true);
  });

  // One Running filter, Home's count: what goes on by itself. A paused run waits for the
  // person, under Needs you on both screens.
  it("offers one Running filter, with the runs Home counts and no paused one", async () => {
    renderRouted(
      <ProjectsRoute />,
      deps([
        listing("p1", "Going", "running", { progress: 0.5 }),
        listing("p2", "Agent one", "pending", { progress: 0.5, waitingForAgent: true }),
        listing("p3", "Paused one", "paused", { progress: 0.5 }),
      ]),
    );
    const show = await screen.findByRole("group", { name: "Show" });
    // The counts sit on the filters themselves, and a filter with nothing in it is not offered.
    expect(
      within(show)
        .getAllByRole("button")
        .map((one) => one.textContent),
    ).toEqual(["All 3", "Running 2", "Needs you 1"]);
    expect(screen.queryByRole("complementary")).toBeNull();
    expect(matches(listing("p3", "Paused one", "paused", { progress: 0.5 }), "running")).toBe(
      false,
    );
  });

  // A run parked on an agent's review goes on by itself: it is among the running ones, as on
  // Home's Running.
  it("counts a run waiting for the agent as running", () => {
    const parked = listing("p1", "Agent one", "pending", { progress: 0.5, waitingForAgent: true });
    expect(matches(parked, "running")).toBe(true);
    expect(
      matches(
        listing("p2", "Kept", "pending", { progress: 0.5, waitingForAgent: true, setAside: true }),
        "running",
      ),
    ).toBe(false);
  });

  // A step failed beside another that still waits: the run reads by that wait (Running for the
  // agent's, Needs you for the person's) and is listed under Failed too. A run that made its
  // video and lost another step reads Done with problems and is ready to upload, not failed.
  it("lists a run whose step failed beside a wait by that wait and under Failed", () => {
    const agent = listing("p1", "Agent one", "pending", {
      waitingForAgent: true,
      stepFailed: true,
    });
    expect(projectStateOf(agent).word).toBe("Waiting for the agent");
    expect(matches(agent, "running")).toBe(true);
    expect(matches(agent, "waiting")).toBe(false);
    expect(matches(agent, "failed")).toBe(true);
    const person = listing("p2", "Held one", "pending", { stepFailed: true });
    expect(projectStateOf(person).word).toBe("Waiting for your review");
    expect(matches(person, "waiting")).toBe(true);
    expect(matches(person, "queued")).toBe(false);
    expect(matches(person, "failed")).toBe(true);
    expect(matches(listing("p3", "Held two", "pending", { progress: 0.4 }), "failed")).toBe(false);
    const partial = listing("p4", "Partly", "partial", { failedSteps: ["document"] });
    expect(matches(partial, "failed")).toBe(false);
    expect(matches(partial, "ready")).toBe(true);
  });

  // Parked on an agent's review before anything was made: it waits for the agent, not its turn.
  it("keeps a run waiting for the agent at its start out of Queued", () => {
    const parked = listing("p1", "Agent early", "pending", { waitingForAgent: true });
    expect(matches(parked, "queued")).toBe(false);
  });

  it("keeps prepared runs and runs waiting for the agent out of Needs you and its sort", async () => {
    const projects = [
      listing("p1", "Prepared one", "pending", { progress: 0.9, prepared: true }),
      listing("p2", "Agent one", "pending", { progress: 0.5, waitingForAgent: true }),
      listing("p3", "Held one", "pending", { progress: 0.4 }),
    ];
    expect(projects.filter((one) => matches(one, "waiting")).map((one) => one.title)).toEqual([
      "Held one",
    ]);
    expect(sortProjects(projects, "status")[0]?.title).toBe("Held one");
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
    await user.click(within(list).getByRole("button", { name: "Mark uploaded: Rope Tricks" }));
    await waitFor(() => expect(sent).toEqual([{ uploaded: true }]));
    expect(screen.getAllByText("Uploaded")).toHaveLength(2);
    await user.click(screen.getByRole("button", { name: "Undo upload mark: Knots" }));
    await waitFor(() => expect(sent).toEqual([{ uploaded: true }, { uploaded: false }]));
    // Marked weeks ago: the state stays, the row no longer offers to take it back.
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

  // The server refuses a delete while the run is going, so a running row offers none.
  it("offers no Delete while the run is going", async () => {
    renderRouted(<ProjectsRoute />, deps([listing("p1", "Rope Tricks", "running")]));
    await screen.findByRole("link", { name: "Rope Tricks" });
    expect(screen.queryByRole("button", { name: "Delete Rope Tricks" })).toBeNull();
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
    // Each row's title link carries the whole name as its tooltip.
    const names = (): string[] =>
      within(screen.getByRole("list", { name: "Projects" }))
        .getAllByRole("link")
        .filter((link) => link.hasAttribute("title"))
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
    // Nothing ticked: no bulk action above the list.
    expect(within(bar).queryByRole("button")).toBeNull();

    await user.click(within(bar).getByRole("checkbox", { name: "Select all" }));
    expect(within(bar).getByText("3 of 3 projects selected")).not.toBeNull();
    // The destructive one last.
    const actions = within(bar).getAllByRole("button");
    expect(actions.at(-1)?.textContent).toBe("Delete");
    await user.click(within(bar).getByRole("button", { name: "Delete" }));
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

describe("the samples", () => {
  // Read-only and never uploaded: no count, filter or button calls them ready to upload, and the
  // one thing a person does with one is copy it.
  it("never counts a sample as ready to upload, and offers Make my own copy on its row", async () => {
    const user = userEvent.setup();
    let copied = false;
    renderRouted(
      <ProjectsRoute />,
      deps(
        [
          listing("s1", "The Library of Alexandria", "done", { sample: true }),
          listing("p1", "Rope Tricks", "done"),
        ],
        {
          "POST /api/onboarding/sample/copy": (request) => {
            copied = true;
            return jsonAnswer({ projectId: "p9" })(request);
          },
        },
      ),
    );
    const row = (await screen.findByRole("link", { name: "The Library of Alexandria" })).closest(
      "li",
    );
    if (row === null) throw new Error("no row");
    expect(within(row).getByText("Sample")).not.toBeNull();
    expect(within(row).getByText("Done")).not.toBeNull();
    expect(within(row).queryByRole("button", { name: /^Mark uploaded/ })).toBeNull();
    expect(screen.getByRole("button", { name: "Ready to upload 1" })).not.toBeNull();
    expect(matches(listing("s1", "Sample", "done", { sample: true }), "ready")).toBe(false);
    await user.click(
      within(row).getByRole("button", { name: "Make my own copy of The Library of Alexandria" }),
    );
    await waitFor(() => expect(copied).toBe(true));
  });
});

describe("finished first and the queue", () => {
  it("sorts by when each run finished, unfinished ones after", () => {
    const projects = [
      listing("p1", "Older", "done", { finishedAt: "2026-09-20T10:00:00.000Z" }),
      listing("p2", "Going", "running"),
      listing("p3", "Newer", "done", { finishedAt: "2026-09-27T10:00:00.000Z" }),
    ];
    expect(sortProjects(projects, "finished").map((one) => one.title)).toEqual([
      "Newer",
      "Older",
      "Going",
    ]);
    expect(projectSortOf("finished")).toBe("finished");
  });

  // "Queue 3 videos": the Queued filter is the order they start in, and each waiting row moves
  // Earlier or Later in words.
  it("lists the queued videos in the order they start, each with Earlier and Later", async () => {
    renderRouted(
      <ProjectsRoute initialFilter="queued" />,
      deps(
        [
          listing("q1", "Bea", "pending", { createdAt: "2026-09-02T10:00:00.000Z" }),
          listing("q2", "Cal", "pending", { createdAt: "2026-09-03T10:00:00.000Z" }),
        ],
        {
          "GET /api/projects/queue": jsonAnswer({
            queue: [
              { projectId: "a", batchId: "b", position: 0, state: "active" },
              { projectId: "q1", batchId: "b", position: 1, state: "queued" },
              { projectId: "q2", batchId: "b", position: 2, state: "queued" },
            ],
          }),
        },
      ),
    );
    await screen.findByRole("button", { name: "Move Bea later in the queue" });
    const titles = within(screen.getByRole("list", { name: "Projects" }))
      .getAllByRole("link")
      .filter((link) => link.hasAttribute("title"))
      .map((link) => link.textContent);
    expect(titles).toEqual(["Bea", "Cal"]);
    expect(screen.getByRole("button", { name: "Move Cal earlier in the queue" })).not.toBeNull();
    expect(
      inQueueOrder([listing("x", "X", "pending"), listing("q2", "Cal", "pending")], ["q2"]).map(
        (one) => one.id,
      ),
    ).toEqual(["q2", "x"]);
  });
});

describe("on a phone", () => {
  // A row of chips wrapped and clipped there ("Ready / to"); one select keeps every label whole.
  it("picks what to show from one select with the counts", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "matchMedia",
      (query: string) =>
        ({
          matches: query === "(max-width: 767px)",
          media: query,
          addEventListener: () => {},
          removeEventListener: () => {},
        }) as unknown as MediaQueryList,
    );
    try {
      renderRouted(
        <ProjectsRoute />,
        deps([listing("p1", "Rope Tricks", "failed"), listing("p2", "Knots", "done")]),
      );
      const show = await screen.findByRole("combobox", { name: "Show" });
      expect([...(show as HTMLSelectElement).options].map((option) => option.textContent)).toEqual([
        "All (2)",
        "Ready to upload (1)",
        "Failed (1)",
      ]);
      expect(screen.queryByRole("group", { name: "Show" })).toBeNull();
      await user.selectOptions(show, "failed");
      expect(screen.queryByRole("link", { name: "Knots" })).toBeNull();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
