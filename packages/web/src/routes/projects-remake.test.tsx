import type { ProjectState } from "@app/kernel/pipeline.js";
import type { ProjectListing } from "@app/slices/admission/model.js";
import type { RebuildPreview, RebuildWork } from "@app/slices/rebuild/model.js";
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { ToastProvider } from "@/components/kit/toast";
import { revisionView } from "@/project/revision-fixture";
import { type Answer, jsonAnswer, problemAnswer, renderRouted, testDeps } from "@/test-app";
import { ProjectsRoute } from "./projects.js";
import { costWords, startsAtOnce } from "./projects-remake.js";

afterEach(cleanup);

const channel = "00000000-0000-4000-8000-000000000001";

function listing(id: string, title: string, status: ProjectState): ProjectListing {
  return {
    id,
    title,
    status,
    progress: 0,
    format: "16:9",
    channelId: channel,
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
    },
    createdAt: "2026-09-02T19:14:00.000Z",
    updatedAt: "2026-09-02T19:14:00.000Z",
  };
}

function work(key: string, disposition: RebuildWork["disposition"]): RebuildWork {
  return {
    key,
    stage: key.startsWith("image") ? "images" : "video",
    kind: disposition === "local" ? "local" : "provider",
    disposition,
    requestFingerprint: "q",
    fingerprint: "f",
    dependsOn: [],
    reason: disposition === "blocked" ? "The image provider is signed out." : "Inputs changed.",
    inflight: false,
    pieceIds: [],
  };
}

function preview(
  projectId: string,
  works: readonly RebuildWork[],
  cost: { low: number; high: number; unknown?: number },
): RebuildPreview {
  return {
    id: `pv-${projectId}`,
    projectId,
    baseRevisionId: "r1",
    planFingerprint: "f1",
    selection: { kind: "allAffected" },
    changedInputs: [],
    retained: [],
    warnings: [],
    wholeRequestNotice: null,
    providedReuseRequired: [],
    work: works,
    costs: {
      currency: "USD",
      rows: [],
      low: cost.low,
      high: cost.high,
      unknown: cost.unknown ?? 0,
      expectedWords: 0,
      catalogueDate: null,
      assumptions: [],
    },
  };
}

interface Started {
  readonly project: string;
  readonly body: Record<string, unknown>;
}

function routesFor(
  previews: Readonly<Record<string, RebuildPreview>>,
  started: Started[],
  startAnswer: (project: string, attempt: number) => Answer = () =>
    jsonAnswer({
      ok: true,
      value: { revisionId: "r1", admissionId: "a1", workIds: [], replayed: false },
    }),
): Record<string, Answer> {
  const routes: Record<string, Answer> = {};
  for (const [id, shown] of Object.entries(previews)) {
    routes[`POST /api/projects/${id}/revisions/prepare`] = jsonAnswer({
      ok: true,
      view: revisionView(),
      created: false,
    });
    routes[`POST /api/projects/${id}/rebuild/preview`] = jsonAnswer({ ok: true, value: shown });
    routes[`POST /api/projects/${id}/rebuild`] = async (request) => {
      const body = (await request.json()) as Record<string, unknown>;
      started.push({ project: id, body });
      return startAnswer(id, started.filter((one) => one.project === id).length)(request);
    };
  }
  return routes;
}

function render(projects: readonly ProjectListing[], routes: Record<string, Answer>) {
  return renderRouted(
    <ToastProvider>
      <ProjectsRoute />
    </ToastProvider>,
    testDeps({
      "GET /api/projects": jsonAnswer({ projects }),
      "GET /api/onboarding": jsonAnswer({
        show: false,
        sampleProjectId: "p4",
        samples: { library: "p4", audiobook: null, podcast: null },
        clis: [],
        packs: [],
      }),
      ...routes,
    }),
  );
}

function bar(): HTMLElement {
  const found = document.querySelector<HTMLElement>("[data-slot='selection-bar']");
  if (found === null) throw new Error("no selection bar");
  return found;
}

function drawer(): HTMLElement {
  const found = document.querySelector<HTMLElement>("[data-slot='drawer']");
  if (found === null) throw new Error("no drawer");
  return found;
}

describe("Remake outdated for the ticked projects", () => {
  it("reviews every project's scope and cost, says which are left out and why, then starts them with one press", async () => {
    const user = userEvent.setup();
    const started: Started[] = [];
    render(
      [
        listing("p1", "Rope Tricks", "done"),
        listing("p2", "Knots", "done"),
        listing("p3", "Sailing", "running"),
        listing("p4", "Sample Tour", "done"),
        listing("p5", "Anchors", "done"),
      ],
      routesFor(
        {
          p1: preview("p1", [work("image:a", "generate"), work("export:video", "local")], {
            low: 0.04,
            high: 0.06,
          }),
          p2: preview("p2", [work("export:video", "local")], { low: 0, high: 0 }),
          p5: preview("p5", [work("image:a", "reuse")], { low: 0, high: 0 }),
        },
        started,
      ),
    );
    await screen.findByRole("link", { name: "Rope Tricks" });
    // The Sample badge: which projects are samples has loaded.
    expect(await screen.findByText("Sample")).not.toBeNull();
    await user.click(within(bar()).getByRole("checkbox", { name: "Select all" }));
    await user.click(within(bar()).getByRole("button", { name: "Remake outdated" }));

    const review = await waitFor(drawer);
    const total = within(review).getByRole("region", { name: "What the remakes cost" });
    expect(within(total).getByText("About $0.04–$0.06")).not.toBeNull();
    const toMake = within(review).getByRole("list", { name: "Projects to remake" });
    expect(within(toMake).getByText("Made again: Image request.")).not.toBeNull();
    expect(
      within(toMake).getByText("Then rebuilt on this computer, free: Video export."),
    ).not.toBeNull();
    expect(
      within(toMake).getByText("Rebuilt on this computer, free: Video export."),
    ).not.toBeNull();
    const left = within(review).getByRole("list", { name: "Left out" });
    expect(within(left).getByText(/running now/)).not.toBeNull();
    expect(within(left).getByText(/sample project/)).not.toBeNull();
    expect(within(left).getByText(/Nothing in it is outdated/)).not.toBeNull();
    expect(started).toEqual([]);

    await user.click(within(review).getByRole("button", { name: "Remake 2 projects" }));
    await waitFor(() => expect(started.map((one) => one.project)).toEqual(["p1", "p2"]));
    expect(started[0]?.body).toMatchObject({
      baseRevisionId: "r1",
      previewId: "pv-p1",
      acknowledgeUnknownCosts: false,
      confirmedProvidedWorkKeys: [],
    });
    expect(await screen.findByText(/Started the remake of 2 projects/)).not.toBeNull();
  });

  it("names a project that didn't start on its row and tries only that one again, with the same request", async () => {
    const user = userEvent.setup();
    const started: Started[] = [];
    render(
      [listing("p1", "Rope Tricks", "done"), listing("p2", "Knots", "done")],
      routesFor(
        {
          p1: preview("p1", [work("image:a", "generate")], { low: 0.05, high: 0.05 }),
          p2: preview("p2", [work("image:a", "generate")], { low: 0.05, high: 0.05 }),
        },
        started,
        (project, attempt) =>
          project === "p2" && attempt === 1
            ? problemAnswer("Slopify cannot run this rebuild yet.", 409)
            : jsonAnswer({
                ok: true,
                value: { revisionId: "r1", admissionId: "a1", workIds: [], replayed: false },
              }),
      ),
    );
    await screen.findByRole("link", { name: "Rope Tricks" });
    await user.click(within(bar()).getByRole("checkbox", { name: "Select all" }));
    await user.click(within(bar()).getByRole("button", { name: "Remake outdated" }));
    const review = await waitFor(drawer);
    const total = within(review).getByRole("region", { name: "What the remakes cost" });
    expect(within(total).getByText("About $0.10")).not.toBeNull();
    await user.click(within(review).getByRole("button", { name: "Remake 2 projects" }));

    expect(
      await within(review).findByText("Didn't start: Slopify cannot run this rebuild yet."),
    ).not.toBeNull();
    await user.click(within(review).getByRole("button", { name: "Try 1 project again" }));
    await waitFor(() => expect(started.map((one) => one.project)).toEqual(["p1", "p2", "p2"]));
    expect(started[2]?.body.idempotencyKey).toBe(started[1]?.body.idempotencyKey);
    await user.click(await within(review).findByRole("button", { name: "Done" }));
    expect(document.querySelector("[data-slot='drawer']")).toBeNull();
  });

  it("holds the start until unknown estimates are accepted", async () => {
    const user = userEvent.setup();
    const started: Started[] = [];
    render(
      [listing("p1", "Rope Tricks", "done")],
      routesFor(
        { p1: preview("p1", [work("image:a", "generate")], { low: 0, high: 0, unknown: 2 }) },
        started,
      ),
    );
    await user.click(await screen.findByRole("checkbox", { name: "Select row: Rope Tricks" }));
    await user.click(within(bar()).getByRole("button", { name: "Remake outdated" }));
    const review = await waitFor(drawer);
    const go = within(review).getByRole("button", { name: "Remake 1 project" });
    expect(go.hasAttribute("disabled")).toBe(true);
    await user.click(
      within(review).getByRole("checkbox", {
        name: "I understand that 2 cost estimates are unknown.",
      }),
    );
    await user.click(go);
    await waitFor(() => expect(started[0]?.body.acknowledgeUnknownCosts).toBe(true));
  });

  it("starts free work on this computer at once, as a single project does", async () => {
    const user = userEvent.setup();
    const started: Started[] = [];
    render(
      [listing("p1", "Rope Tricks", "done"), listing("p2", "Knots", "done")],
      routesFor(
        {
          p1: preview("p1", [work("export:video", "local")], { low: 0, high: 0 }),
          p2: preview("p2", [work("export:video", "local")], { low: 0, high: 0 }),
        },
        started,
      ),
    );
    await screen.findByRole("link", { name: "Rope Tricks" });
    await user.click(within(bar()).getByRole("checkbox", { name: "Select all" }));
    await user.click(within(bar()).getByRole("button", { name: "Remake outdated" }));
    await waitFor(() => expect(started.map((one) => one.project)).toEqual(["p1", "p2"]));
    expect(document.querySelector("[data-slot='drawer']")).toBeNull();
    expect(await screen.findByText(/Started the remake of 2 projects/)).not.toBeNull();
  });
});

describe("the remake review's words", () => {
  it("says a plan's work costs nothing, and adds unknown estimates", () => {
    const free = preview("p1", [], { low: 0, high: 0 }).costs;
    expect(costWords([free])).toBe("No charge");
    expect(
      costWords([
        preview("p1", [], { low: 0.1, high: 0.2 }).costs,
        preview("p2", [], { low: 0, high: 0, unknown: 1 }).costs,
      ]),
    ).toBe("About $0.10–$0.20, plus 1 unknown estimate");
  });

  it("starts at once only when nothing is left out and everything is free", () => {
    const project = listing("p1", "Rope Tricks", "done");
    const local = preview("p1", [work("export:video", "local")], { low: 0, high: 0 });
    const paid = preview("p1", [work("image:a", "generate")], { low: 0.1, high: 0.1 });
    const plan = (shown: RebuildPreview) => ({ project, preview: shown, idempotencyKey: "k" });
    expect(startsAtOnce({ plans: [plan(local)], skipped: [] })).toBe(true);
    expect(startsAtOnce({ plans: [plan(paid)], skipped: [] })).toBe(false);
    expect(startsAtOnce({ plans: [plan(local)], skipped: [{ project, reason: "Running" }] })).toBe(
      false,
    );
  });
});
