import { describe, expect, it, vi } from "vitest";
import { createApi } from "@/api";
import { fakeFetch, jsonAnswer, problemAnswer, testOrigin } from "@/test-app";
import { checkUpdate, installUpdate } from "./api.js";

const status = {
  currentVersion: "0.6.0",
  latestVersion: "0.6.1",
  available: true,
  canUpdate: true,
  busy: false,
  status: "idle",
};

describe("update API", () => {
  it("forces discovery only for an explicit fresh check and never installs on a read", async () => {
    const requests: Request[] = [];
    const api = createApi(
      testOrigin,
      fakeFetch({
        "GET /api/update": (request) => {
          requests.push(request);
          return jsonAnswer(status)(request);
        },
      }),
    );
    expect(await checkUpdate(api)).toEqual(status);
    expect(await checkUpdate(api, true)).toEqual(status);
    expect(requests.map((request) => new URL(request.url).search)).toEqual(["", "?refresh=1"]);
  });

  it("posts once with no installation arguments and preserves the server's refusal", async () => {
    const post = vi.fn(problemAnswer("Pause running projects before updating.", 409));
    const api = createApi(testOrigin, fakeFetch({ "POST /api/update": post }));
    await expect(installUpdate(api)).rejects.toThrow("Pause running projects before updating.");
    expect(post).toHaveBeenCalledTimes(1);
    expect(await post.mock.calls[0]?.[0].text()).toBe("");
  });

  it("cancels a pending check when its caller aborts", async () => {
    const controller = new AbortController();
    controller.abort();
    const fetch = vi.fn<typeof globalThis.fetch>(async (_input, init) => {
      init?.signal?.throwIfAborted();
      return new Response();
    });
    await expect(
      checkUpdate(createApi(testOrigin, fetch), false, controller.signal),
    ).rejects.toThrow();
  });
});
