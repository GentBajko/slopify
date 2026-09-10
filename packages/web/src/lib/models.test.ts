import { describe, expect, it } from "vitest";
import { jsonAnswer, problemAnswer, testDeps } from "@/test-app";
import { listProviderModels } from "./models";

describe("provider model API", () => {
  it("retains the server's catalogue, custom-ID policy and warning", async () => {
    const expected = {
      models: [{ id: "new-model", name: "New model" }],
      allowsCustom: false,
      warning: "Using the saved catalogue.",
      notice: "These models use supported input formats.",
    };
    const { api } = testDeps({ "GET /api/providers/fal/models": jsonAnswer(expected) });
    expect(await listProviderModels(api, "fal")).toEqual(expected);
  });

  it("explicit refresh bypasses the server's model cache", async () => {
    let query = "";
    const { api } = testDeps({
      "GET /api/providers/gemini/models": (request) => {
        query = new URL(request.url).search;
        return jsonAnswer({ models: [], allowsCustom: true })(request);
      },
    });
    await listProviderModels(api, "gemini", true);
    expect(query).toBe("?refresh=1");
  });

  it("reports a failed discovery request without inventing model options", async () => {
    const { api } = testDeps({
      "GET /api/providers/codex/models": problemAnswer("Discovery failed.", 503),
    });
    await expect(listProviderModels(api, "codex")).rejects.toThrow("Discovery failed.");
  });
});
