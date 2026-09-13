import { act, cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { jsonAnswer } from "@/test-app";
import { deferred, mountPlay } from "./play-test-fixture";
import { reviewHarness, reviewStorage, suppliedDocument } from "./review-test-harness";

beforeEach(() => {
  Object.defineProperty(window, "localStorage", { configurable: true, value: reviewStorage() });
});
afterEach(() => {
  cleanup();
  window.localStorage.clear();
});
it("opens Review with the keyboard without posting Start", async () => {
  const { requests } = await mountPlay();
  screen.getByLabelText("Project title").focus();
  await userEvent.keyboard("{Control>}{Enter}{/Control}");
  expect(screen.getByRole("button", { name: "Review" }).getAttribute("aria-current")).toBe("step");
  expect(screen.getByRole("button", { name: "Start run" })).not.toBeNull();
  expect(requests.some((request) => new URL(request.url).pathname.endsWith("/start"))).toBe(false);
});
it("synchronously guards doubleclick and clears only the confirmed active draft", async () => {
  const pending = deferred();
  let held: Response | undefined;
  const harness = reviewHarness(async (request, response) => {
    if (request.url.endsWith("/start")) {
      held = response;
      return pending.promise;
    }
    return response;
  });
  await harness.prepare();
  await waitFor(() => expect(harness.session().review.valid).toBe(true));
  await act(async () => {
    void harness.session().startRun();
    void harness.session().startRun();
  });
  await waitFor(() => expect(held).toBeDefined());
  expect(harness.requests.filter((request) => request.url.endsWith("/start"))).toHaveLength(1);
  expect(window.localStorage.getItem("slopify.play-draft")).toBeTruthy();
  await act(async () => {
    if (held) pending.resolve(held);
  });
  await waitFor(() => expect(harness.created).toHaveBeenCalledTimes(1));
  expect(window.localStorage.getItem("slopify.play-draft")).toBeNull();
});
it.each([false, true])(
  "recovers a lost committed response with the active draft anchor (reload=%s)",
  async (reload) => {
    let lost = false;
    const harness = reviewHarness(async (request, response) => {
      if (request.url.endsWith("/start") && !lost) {
        lost = true;
        throw new Error("Connection lost");
      }
      return response;
    });
    await harness.prepare();
    await waitFor(() => expect(harness.session().review.valid).toBe(true));
    const id = harness.session().activeId;
    await userEvent.click(screen.getByRole("button", { name: "Start run" }));
    await screen.findByRole("button", { name: "Check Start result" });
    expect(window.localStorage.getItem("slopify.play-draft")).toBe(id);
    if (reload) {
      await act(async () => {
        await harness.restart();
      });
    } else await userEvent.click(screen.getByRole("button", { name: "Check Start result" }));
    await waitFor(() => expect(harness.created).toHaveBeenCalledExactlyOnceWith("p1"));
    expect(harness.requests.filter((request) => request.url.endsWith("/start"))).toHaveLength(1);
  },
);

it("retries an uncertain uncommitted Start with exactly the same identity", async () => {
  let calls = 0;
  const harness = reviewHarness(undefined, {
    "POST /api/drafts/:id/start": async (request) => {
      calls++;
      if (calls === 1) throw new Error("Disconnected before acknowledgement");
      const body = (await request.json()) as { reviewId: string };
      return jsonAnswer({
        requestId: body.reviewId,
        projectIds: ["original"],
        queue: [],
        replayed: false,
      })(request);
    },
  });
  await harness.prepare();
  await waitFor(() => expect(harness.session().review.valid).toBe(true));
  await userEvent.click(screen.getByRole("button", { name: "Start run" }));
  await userEvent.click(await screen.findByRole("button", { name: "Check Start result" }));
  await waitFor(() => expect(harness.created).toHaveBeenCalledExactlyOnceWith("original"));
  const bodies = await Promise.all(
    harness.requests
      .filter((request) => request.url.endsWith("/start"))
      .map((request) => request.json()),
  );
  expect(bodies).toHaveLength(2);
  expect(bodies[0]).toEqual(bodies[1]);
});
it("replays one receipt and rejects changed-body reuse without creating again", async () => {
  const create = vi.fn(jsonAnswer({ project: { id: "one" } }, 201));
  const harness = reviewHarness(undefined, { "POST /api/projects": create });
  await harness.prepare();
  await waitFor(() => expect(harness.session().review.valid).toBe(true));
  await userEvent.click(screen.getByRole("button", { name: "Start run" }));
  await waitFor(() => expect(harness.created).toHaveBeenCalledTimes(1));
  const sent = harness.requests.find((request) => request.url.endsWith("/start"));
  if (!sent) throw new Error("Missing Start request");
  const body = (await sent.clone().json()) as { baseVersion: number; reviewId: string };
  const replay = await harness.send(sent.clone());
  expect(await replay.json()).toMatchObject({ projectIds: ["one"], replayed: true });
  const conflict = await harness.send(sent.url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...body, baseVersion: body.baseVersion + 1 }),
  });
  expect(conflict.status).toBe(409);
  expect(create).toHaveBeenCalledTimes(1);
});
it("starts 50 videos from the same frozen base setup after restarting", async () => {
  const harness = reviewHarness();
  const variants = Array.from({ length: 49 }, (_, index) => ({
    id: crypto.randomUUID(),
    title: `Video ${index + 2}`,
    values: { topic: `Topic ${index + 2}`, dormant: "kept" },
  }));
  await harness.prepare({ ...suppliedDocument, variants });
  await act(async () => {
    await harness.session().flush();
  });
  await harness.restart();
  await waitFor(() => expect(harness.session().review.valid).toBe(true));
  const runs = harness.session().review.receipt?.runs;
  expect(runs).toHaveLength(50);
  expect(runs?.every((run) => run.draft.provided.article === "The supplied article.")).toBe(true);
  expect(runs?.map((run) => run.draft.title)).toEqual([
    "Article only",
    ...variants.map((row) => row.title),
  ]);
  await userEvent.click(screen.getByRole("button", { name: "Queue 50 videos" }));
  await waitFor(() => expect(harness.created).toHaveBeenCalledExactlyOnceWith("p1"));
  const sent = harness.requests.find((request) => request.url.endsWith("/start"));
  if (!sent) throw new Error("Missing batch Start");
  const replay = await harness.send(sent.clone());
  const result = (await replay.json()) as { projectIds: readonly string[] };
  expect(result.projectIds).toHaveLength(50);
});
