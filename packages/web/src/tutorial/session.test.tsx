import { describe, expect, it } from "vitest";
import { tutorialStepIndex, tutorialSteps } from "./model";

describe("stable tutorial progress", () => {
  it("restores a stable step ID after the Play sequence changes", () => {
    const index = tutorialStepIndex("play-subtitles");
    expect(index).toBeDefined();
    expect(tutorialSteps[index ?? -1]?.page).toBe("play");
    expect(tutorialStepIndex("removed-step")).toBeUndefined();
  });
  it("follows Content, Outputs, Style and Review in order", () => {
    expect(tutorialSteps.filter((step) => step.page === "play").map((step) => step.id)).toEqual([
      "play-options",
      "play-article",
      "play-keywords",
      "play-audio",
      "play-images",
      "play-video",
      "play-subtitles",
      "play-start",
    ]);
  });
});

import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach } from "vitest";
import { AppProvider } from "@/app-context";
import { type Answer, jsonAnswer, problemAnswer, testDeps } from "@/test-app";
import { receiveTutorialEvent } from "./model";
import { useTutorialSession } from "./use-session";

afterEach(cleanup);
const saved = { schemaVersion: 1, active: true, stepId: "play-subtitles" };
function hook(
  get: Answer,
  put: Answer = jsonAnswer({ version: 2, readable: true, session: saved }),
  reset?: Answer,
) {
  const deps = testDeps({
    "GET /api/tutorial": get,
    "PUT /api/tutorial": put,
    ...(reset ? { "DELETE /api/tutorial": reset } : {}),
  });
  return renderHook(() => useTutorialSession(), {
    wrapper: ({ children }) => <AppProvider deps={deps}>{children}</AppProvider>,
  });
}
it("waits for restoration and preserves an early project-created handoff", async () => {
  let release: ((response: Response) => void) | undefined;
  const delayed = new Promise<Response>((resolve) => {
    release = resolve;
  });
  const writes: unknown[] = [];
  const { result } = hook(
    () => delayed,
    async (request) => {
      const input = (await request.json()) as { session: unknown };
      writes.push(input);
      return jsonAnswer({ version: writes.length + 1, readable: true, session: input.session })(
        request,
      );
    },
  );
  act(() =>
    result.current.update((session) =>
      receiveTutorialEvent(session, { type: "project-created", id: "receipt-project" }),
    ),
  );
  expect(result.current.session.active).toBe(false);
  expect(writes).toEqual([]);
  await act(async () => {
    release?.(
      await jsonAnswer({ version: 1, readable: true, session: saved })(
        new Request("http://slopify.test"),
      ),
    );
  });
  await waitFor(() => expect(result.current.session.projectId).toBe("receipt-project"));
  expect(tutorialSteps[result.current.session.step]?.id).toBe("project");
});
it("serializes transitions without rolling a newer step back after a delayed reply", async () => {
  let release: ((response: Response) => void) | undefined;
  const delayed = new Promise<Response>((resolve) => {
    release = resolve;
  });
  const writes: { baseVersion: number; session: { stepId: string } }[] = [];
  const { result } = hook(
    jsonAnswer({ version: 1, readable: true, session: saved }),
    async (request) => {
      const input = (await request.json()) as { baseVersion: number; session: { stepId: string } };
      writes.push(input);
      return writes.length === 1
        ? delayed
        : jsonAnswer({ version: input.baseVersion + 1, readable: true, session: input.session })(
            request,
          );
    },
  );
  await waitFor(() => expect(result.current.session.active).toBe(true));
  act(() => result.current.update((s) => ({ ...s, step: s.step - 1 })));
  await waitFor(() => expect(writes).toHaveLength(1));
  act(() => result.current.update((s) => ({ ...s, step: s.step + 1 })));
  expect(writes).toHaveLength(1);
  await act(async () => {
    release?.(
      await jsonAnswer({ version: 2, readable: true, session: { ...saved, stepId: "play-video" } })(
        new Request("http://slopify.test"),
      ),
    );
  });
  await waitFor(() => expect(writes).toHaveLength(2));
  expect(writes[1]?.baseVersion).toBe(2);
  expect(tutorialSteps[result.current.session.step]?.id).toBe("play-subtitles");
});
it("retries a lost acknowledgement with the identical payload before newer transitions", async () => {
  const writes: string[] = [];
  const { result } = hook(
    jsonAnswer({ version: 1, readable: true, session: saved }),
    async (request) => {
      const body = await request.text();
      writes.push(body);
      if (writes.length === 1) throw new Error("Reply lost");
      const input = JSON.parse(body) as { baseVersion: number; session: unknown };
      return jsonAnswer({ version: input.baseVersion + 1, readable: true, session: input.session })(
        request,
      );
    },
  );
  await waitFor(() => expect(result.current.session.active).toBe(true));
  act(() => result.current.update((s) => ({ ...s, step: s.step - 1 })));
  await waitFor(() => expect(result.current.error).toBe("Reply lost"));
  act(() => result.current.update((s) => ({ ...s, active: false })));
  await waitFor(() => expect(writes).toHaveLength(3));
  expect(writes[1]).toBe(writes[0]);
  expect(result.current.session.active).toBe(false);
});
it("keeps unknown progress safe and resets only after explicit Restart", async () => {
  const operations: string[] = [];
  const { result } = hook(
    jsonAnswer({ version: 1, readable: true, session: { ...saved, stepId: "removed-step" } }),
    async (request) => {
      operations.push("PUT");
      const input = (await request.json()) as { session: unknown };
      return jsonAnswer({ version: 1, readable: true, session: input.session })(request);
    },
    () => {
      operations.push("DELETE");
      return new Response(null, { status: 204 });
    },
  );
  await waitFor(() => expect(result.current.error).toContain("Restart tutorial"));
  act(() => result.current.start());
  expect(result.current.session.active).toBe(false);
  expect(operations).toEqual([]);
  act(() => result.current.restart());
  await waitFor(() => expect(operations).toEqual(["DELETE", "PUT"]));
  expect(result.current.session.step).toBe(0);
});
it("retains local progress on a CAS conflict without overwriting the other writer", async () => {
  const { result } = hook(
    jsonAnswer({ version: 1, readable: true, session: saved }),
    problemAnswer("Tutorial changed elsewhere", 409),
  );
  await waitFor(() => expect(result.current.session.active).toBe(true));
  act(() => result.current.update((s) => ({ ...s, step: s.step - 1 })));
  await waitFor(() => expect(result.current.error).toBe("Tutorial changed elsewhere"));
  expect(tutorialSteps[result.current.session.step]?.id).toBe("play-video");
});

it("verifies saved prompt IDs before exposing a restored editor step", async () => {
  const deps = testDeps({
    "GET /api/tutorial": jsonAnswer({
      version: 1,
      readable: true,
      session: { ...saved, stepId: "article-name", articleId: "deleted-prompt" },
    }),
    "GET /api/prompts": jsonAnswer({ prompts: [] }),
  });
  const { result } = renderHook(() => useTutorialSession(), {
    wrapper: ({ children }) => <AppProvider deps={deps}>{children}</AppProvider>,
  });
  await waitFor(() => expect(result.current.session.active).toBe(true));
  expect(result.current.session.articleId).toBeUndefined();
  expect(tutorialSteps[result.current.session.step]?.id).toBe("article-name");
});
it("keeps a missing restored project inactive with an explicit recovery error", async () => {
  const deps = testDeps({
    "GET /api/tutorial": jsonAnswer({
      version: 1,
      readable: true,
      session: { ...saved, stepId: "project", projectId: "deleted-project" },
    }),
    "GET /api/projects/deleted-project": problemAnswer("Project no longer exists", 404),
  });
  const { result } = renderHook(() => useTutorialSession(), {
    wrapper: ({ children }) => <AppProvider deps={deps}>{children}</AppProvider>,
  });
  await waitFor(() => expect(result.current.error).toBe("Project no longer exists"));
  expect(result.current.session.active).toBe(false);
});
