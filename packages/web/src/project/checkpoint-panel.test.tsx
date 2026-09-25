import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import type { EventSourceLike } from "@/events";
import { jsonAnswer, renderApp, testDeps } from "@/test-app";
import { CheckpointPanel } from "./checkpoint-panel.js";
import { useLiveProject } from "./use-live.js";

afterEach(cleanup);

it("requires reconciliation when another tab changes the checkpoint set during local edits", async () => {
  const user = userEvent.setup();
  const source = new EventTarget();
  const events: EventSourceLike = {
    addEventListener: (type, listener) => source.addEventListener(type, listener as EventListener),
    close: vi.fn(),
  };
  let current = status;
  const changes: unknown[] = [];
  const patch = vi.fn(async (request: Request) => {
    changes.push(await request.json());
    return Response.json(current);
  });
  function Subject() {
    useLiveProject("p1", "r1");
    return (
      <CheckpointPanel
        projectId="p1"
        revisionId="r1"
        paused
        stages={[
          { kind: "audio", state: "pending", source: "generate" },
          { kind: "images", state: "pending", source: "generate" },
          { kind: "video", state: "pending", source: "generate" },
        ]}
      />
    );
  }
  renderApp(<Subject />, {
    ...testDeps({
      "GET /api/projects/p1/checkpoints": () => Response.json(current),
      "PATCH /api/projects/p1/checkpoints": patch,
    }),
    openEvents: () => events,
  });
  await user.click(await screen.findByRole("checkbox", { name: "Before Images" }));
  current = {
    ...status,
    checkpoints: [gate, { ...gate, stage: "video", checkpointId: "video-gate" }],
  };
  act(() =>
    source.dispatchEvent(
      new MessageEvent("project.updated", {
        data: JSON.stringify({ type: "project.updated", projectId: "p1", revisionId: "r1" }),
      }),
    ),
  );
  const alert = await screen.findByRole("alert");
  expect(alert.textContent).toContain("Checkpoint choices changed elsewhere");
  expect(alert.textContent).toContain("Reload checkpoint choices");
  expect(document.activeElement).toBe(alert);
  const save = screen.getByRole("button", { name: "Save checkpoints" });
  expect(save.hasAttribute("disabled")).toBe(true);
  fireEvent.click(save);
  expect(patch).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Reload checkpoint choices" }));
  await waitFor(() =>
    expect(
      (screen.getByRole("checkbox", { name: "Before Video / export" }) as HTMLInputElement).checked,
    ).toBe(true),
  );
  expect(
    (screen.getByRole("checkbox", { name: "Before Images" }) as HTMLInputElement).checked,
  ).toBe(false);
  expect(document.activeElement).toBe(screen.getByRole("group", { name: "Checkpoint choices" }));
  await user.click(screen.getByRole("checkbox", { name: "Before Images" }));
  await user.click(save);
  await waitFor(() => expect(patch).toHaveBeenCalledOnce());
  expect(changes[0]).toEqual({ revisionId: "r1", stages: ["audio", "video", "images"] });
});

it("adds and removes pending gates with explicit revision-bound saves", async () => {
  const user = userEvent.setup();
  let selected: string[] = [];
  const read = () => ({
    revisionId: "r1",
    checkpoints: selected.map((stage) => ({ ...gate, checkpointId: `${stage}-gate`, stage })),
  });
  const changes: unknown[] = [];
  const patch = vi.fn(async (request: Request) => {
    const input: unknown = await request.json();
    changes.push(input);
    selected = changes.length === 1 ? ["audio"] : [];
    return Response.json(read());
  });
  const post = vi.fn(jsonAnswer(released()));
  renderApp(
    <CheckpointPanel
      projectId="p1"
      revisionId="r1"
      paused
      stages={[
        { kind: "audio", state: "pending", source: "generate" },
        { kind: "images", state: "pending", source: "generate" },
        { kind: "video", state: "pending", source: "off" },
      ]}
    />,
    testDeps({
      "GET /api/projects/p1/checkpoints": () => Response.json(read()),
      "PATCH /api/projects/p1/checkpoints": patch,
      [path]: post,
    }),
  );
  const audio = await screen.findByRole("checkbox", { name: "Before Audio" });
  expect(
    screen.getByRole("checkbox", { name: "Before Video / export" }).hasAttribute("disabled"),
  ).toBe(false);
  audio.focus();
  await user.keyboard(" ");
  expect(patch).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Save checkpoints" }));
  await screen.findByText("Checkpoint choices saved.");
  expect(changes[0]).toEqual({ revisionId: "r1", stages: ["audio"] });
  expect(
    (await screen.findByRole("button", { name: "Approve Audio checkpoint" })).hasAttribute(
      "disabled",
    ),
  ).toBe(true);
  await user.click(screen.getByRole("checkbox", { name: "Before Audio" }));
  await user.click(screen.getByRole("button", { name: "Save checkpoints" }));
  await waitFor(() => expect(changes).toHaveLength(2));
  expect(changes[1]).toEqual({ revisionId: "r1", stages: [] });
  expect(post).not.toHaveBeenCalled();
});

it("keeps running and unavailable checkpoint choices disabled", async () => {
  renderApp(
    <CheckpointPanel
      projectId="p1"
      revisionId="r1"
      paused={false}
      stages={[
        { kind: "audio", state: "running", source: "generate" },
        { kind: "images", state: "provided", source: "provide" },
        { kind: "video", state: "skipped", source: "off" },
      ]}
    />,
    testDeps({ "GET /api/projects/p1/checkpoints": jsonAnswer(status) }),
  );
  for (const name of ["Before Audio", "Before Images", "Before Video / export"])
    expect((await screen.findByRole("checkbox", { name })).hasAttribute("disabled")).toBe(true);
});

it("keeps refused choices frozen until an explicit reload and restores keyboard focus", async () => {
  const user = userEvent.setup();
  const patch = vi.fn(() =>
    Response.json(
      {
        title: "Conflict",
        status: 409,
        reason: "conflict",
        detail: "This stage has already started.",
      },
      { status: 409 },
    ),
  );
  renderApp(
    <CheckpointPanel
      projectId="p1"
      revisionId="r1"
      paused={false}
      stages={[{ kind: "audio", state: "pending", source: "generate" }]}
    />,
    testDeps({
      "GET /api/projects/p1/checkpoints": jsonAnswer(status),
      "PATCH /api/projects/p1/checkpoints": patch,
    }),
  );
  await user.click(await screen.findByRole("checkbox", { name: "Before Audio" }));
  await user.click(screen.getByRole("button", { name: "Save checkpoints" }));
  const alert = await screen.findByRole("alert");
  expect(alert.textContent).toContain("This stage has already started.");
  expect(document.activeElement).toBe(alert);
  expect(screen.getByRole("button", { name: "Save checkpoints" }).hasAttribute("disabled")).toBe(
    true,
  );
  await user.click(screen.getByRole("button", { name: "Reload checkpoint choices" }));
  await waitFor(() =>
    expect(
      (screen.getByRole("checkbox", { name: "Before Audio" }) as HTMLInputElement).checked,
    ).toBe(true),
  );
  expect(document.activeElement).toBe(screen.getByRole("group", { name: "Checkpoint choices" }));
  expect(patch).toHaveBeenCalledOnce();
});

it("shows a released gate as authorized when generated outputs change its fingerprint", async () => {
  renderApp(
    panel(),
    testDeps({
      "GET /api/projects/p1/checkpoints": jsonAnswer({
        ...status,
        checkpoints: [
          {
            ...gate,
            state: "released",
            approvedAt: "2026-09-13T01:00:00.000Z",
            currentFingerprint: "b".repeat(64),
          },
        ],
      }),
    }),
  );
  expect(await screen.findByText(/Authorized for this revision/)).not.toBeNull();
  expect(screen.queryByText(/Inputs changed/)).toBeNull();
  expect(screen.queryByRole("button", { name: "Approve Audio checkpoint" })).toBeNull();
});

const gate = {
  projectId: "p1",
  revisionId: "r1",
  checkpointId: "audio-gate",
  stage: "audio",
  workId: "w1",
  fingerprint: "a".repeat(64),
  currentFingerprint: "a".repeat(64),
  state: "held",
  createdAt: "2026-09-13T00:00:00.000Z",
  approvedAt: null,
  dependents: ["video"],
  workKeys: ["audio:body", "video:main"],
};
const status = { revisionId: "r1", checkpoints: [gate] };
const path = "POST /api/projects/p1/checkpoints/audio-gate/approve";
function panel() {
  return <CheckpointPanel projectId="p1" revisionId="r1" paused={false} stages={[]} />;
}
function released() {
  const {
    currentFingerprint: _fingerprint,
    dependents: _dependents,
    workKeys: _keys,
    ...row
  } = gate;
  return {
    checkpoint: { ...row, state: "released", approvedAt: "2026-09-13T01:00:00.000Z" },
    replayed: true,
  };
}

it("explains held stage, dependents and reviewed revision without issuing commands", async () => {
  const post = vi.fn(jsonAnswer(released()));
  renderApp(
    panel(),
    testDeps({ "GET /api/projects/p1/checkpoints": jsonAnswer(status), [path]: post }),
  );
  await screen.findByRole("button", { name: "Approve Audio checkpoint" });
  expect(screen.getByText(/Audio is held for your review/)).not.toBeNull();
  expect(screen.getByText("Reviewed revision: r1")).not.toBeNull();
  expect(screen.getByRole("list", { name: "Dependent work" }).textContent).toContain("Video");
  expect(post).not.toHaveBeenCalled();
});

it("approves by keyboard with exact identity, accepts a duplicate and returns focus to status", async () => {
  const post = vi.fn(jsonAnswer(released()));
  renderApp(
    panel(),
    testDeps({ "GET /api/projects/p1/checkpoints": jsonAnswer(status), [path]: post }),
  );
  const button = await screen.findByRole("button", { name: "Approve Audio checkpoint" });
  button.focus();
  await userEvent.keyboard("{Enter}");
  await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
  const request = post.mock.calls[0]?.[0];
  expect(await request?.json()).toEqual({
    revisionId: "r1",
    fingerprint: gate.fingerprint,
    idempotencyKey: expect.any(String),
  });
  await waitFor(() => expect(screen.getByRole("status").textContent).toContain("already approved"));
  expect(document.activeElement).toBe(screen.getByRole("status"));
});

it("retains the same identity after an uncertain response and retries only on request", async () => {
  const bodies: unknown[] = [];
  const post = vi.fn(async (request: Request) => {
    bodies.push(await request.json());
    if (bodies.length === 1) throw new Error("Connection lost");
    return Response.json(released());
  });
  renderApp(
    panel(),
    testDeps({ "GET /api/projects/p1/checkpoints": jsonAnswer(status), [path]: post }),
  );
  fireEvent.click(await screen.findByRole("button", { name: "Approve Audio checkpoint" }));
  const retry = await screen.findByRole("button", { name: "Retry approval" });
  expect(post).toHaveBeenCalledTimes(1);
  fireEvent.click(retry);
  await waitFor(() => expect(post).toHaveBeenCalledTimes(2));
  expect(bodies[1]).toEqual(bodies[0]);
});

it("shows a typed stale refusal and requires reloading before a fresh approval", async () => {
  const post = vi.fn(() =>
    Response.json(
      { title: "Conflict", status: 409, reason: "conflict", detail: "Review the current inputs." },
      { status: 409 },
    ),
  );
  renderApp(
    panel(),
    testDeps({ "GET /api/projects/p1/checkpoints": jsonAnswer(status), [path]: post }),
  );
  fireEvent.click(await screen.findByRole("button", { name: "Approve Audio checkpoint" }));
  expect(await screen.findByRole("alert")).toHaveProperty(
    "textContent",
    expect.stringContaining("Review the current inputs."),
  );
  expect(screen.queryByRole("button", { name: "Retry approval" })).toBeNull();
  expect(
    screen.getByRole("button", { name: "Approve Audio checkpoint" }).hasAttribute("disabled"),
  ).toBe(true);
  expect(screen.getByRole("button", { name: "Reload checkpoints" })).not.toBeNull();
  expect(post).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", { name: "Reload checkpoints" }));
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Approve Audio checkpoint" }).hasAttribute("disabled"),
    ).toBe(false),
  );
  expect(post).toHaveBeenCalledTimes(1);
});

it("does not submit twice while an approval is awaiting a response", async () => {
  let finish: (response: Response) => void = () => {};
  const response = new Promise<Response>((resolve) => {
    finish = resolve;
  });
  const post = vi.fn(() => response);
  renderApp(
    panel(),
    testDeps({ "GET /api/projects/p1/checkpoints": jsonAnswer(status), [path]: post }),
  );
  const button = await screen.findByRole("button", { name: "Approve Audio checkpoint" });
  fireEvent.click(button);
  fireEvent.click(button);
  expect(post).toHaveBeenCalledTimes(1);
  await act(async () => finish(Response.json(released())));
  expect(await screen.findByRole("status")).not.toBeNull();
});

it("keeps project pause authoritative and rejects another revision's status", async () => {
  const deps = testDeps({ "GET /api/projects/p1/checkpoints": jsonAnswer(status) });
  const mounted = renderApp(
    <CheckpointPanel projectId="p1" revisionId="r1" paused stages={[]} />,
    deps,
  );
  expect(
    (await screen.findByRole("button", { name: "Approve Audio checkpoint" })).hasAttribute(
      "disabled",
    ),
  ).toBe(true);
  expect(screen.getByText(/Project is paused/)).not.toBeNull();
  mounted.unmount();
  renderApp(<CheckpointPanel projectId="p1" revisionId="r2" paused={false} stages={[]} />, deps);
  expect(await screen.findByText(/edited after these checkpoints loaded/)).not.toBeNull();
  expect(screen.queryByRole("button", { name: "Approve Audio checkpoint" })).toBeNull();
});

it.each(["running", "canceled"] as const)("disables approval for an %s stage", async (state) => {
  renderApp(
    <CheckpointPanel
      projectId="p1"
      revisionId="r1"
      paused={false}
      stages={[{ kind: "audio", state }]}
    />,
    testDeps({ "GET /api/projects/p1/checkpoints": jsonAnswer(status) }),
  );
  expect(
    (await screen.findByRole("button", { name: "Approve Audio checkpoint" })).hasAttribute(
      "disabled",
    ),
  ).toBe(true);
});

it("allows a held gate to be approved after its stage completes while dependent work is pending", async () => {
  renderApp(
    <CheckpointPanel
      projectId="p1"
      revisionId="r1"
      paused={false}
      stages={[
        { kind: "audio", state: "done", source: "generate" },
        { kind: "video", state: "pending", source: "generate" },
      ]}
    />,
    testDeps({ "GET /api/projects/p1/checkpoints": jsonAnswer(status) }),
  );
  expect(
    (await screen.findByRole("button", { name: "Approve Audio checkpoint" })).hasAttribute(
      "disabled",
    ),
  ).toBe(false);
  expect(screen.getByRole("checkbox", { name: "Before Audio" }).hasAttribute("disabled")).toBe(
    true,
  );
});

it("refreshes checkpoints on project events and reconnect without approving", async () => {
  const source = new EventTarget();
  const events: EventSourceLike = {
    addEventListener: (type, listener) => source.addEventListener(type, listener as EventListener),
    close: vi.fn(),
  };
  let current = status;
  const get = vi.fn(() => Response.json(current));
  const post = vi.fn(jsonAnswer(released()));
  const deps = {
    ...testDeps({ "GET /api/projects/p1/checkpoints": get, [path]: post }),
    openEvents: () => events,
  };
  function Subject() {
    useLiveProject("p1", "r1");
    return panel();
  }
  const mounted = renderApp(<Subject />, deps);
  await screen.findByRole("button", { name: "Approve Audio checkpoint" });
  current = { ...status, checkpoints: [{ ...gate, state: "invalidated" }] };
  act(() =>
    source.dispatchEvent(
      new MessageEvent("project.updated", {
        data: JSON.stringify({ type: "project.updated", projectId: "p1", revisionId: "r1" }),
      }),
    ),
  );
  await screen.findByText(/Inputs changed/);
  const before = get.mock.calls.length;
  act(() => {
    source.dispatchEvent(new Event("open"));
    source.dispatchEvent(new Event("open"));
  });
  await waitFor(() => expect(get.mock.calls.length).toBeGreaterThan(before));
  expect(post).not.toHaveBeenCalled();
  mounted.unmount();
  expect(events.close).toHaveBeenCalledOnce();
});
