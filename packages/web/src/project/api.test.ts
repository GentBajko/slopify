import { describe, expect, it } from "vitest";
import { createApi } from "@/api";
import { fakeFetch, jsonAnswer, problemAnswer, testOrigin } from "@/test-app";
import {
  cancelRun,
  deleteImage,
  readOutputText,
  regenerateImage,
  rerunStage,
  retryStage,
  saveArticle,
} from "./api.js";

const view = { project: { id: "p1" }, stages: [], outputs: [], redone: ["video"] };

function api(routes: Readonly<Record<string, ReturnType<typeof jsonAnswer>>>) {
  return createApi(testOrigin, fakeFetch(routes));
}

describe("the project page's actions", () => {
  it("posts a cancel and hands back the project the server answered with", async () => {
    const result = await cancelRun(
      api({ "POST /api/projects/p1/cancel": jsonAnswer({ ...view, canceled: ["video"] }) }),
      "p1",
    );
    expect(result.ok).toBe(true);
    expect(result.ok ? result.value.project.id : "").toBe("p1");
  });

  it("posts a retry and a re-run at the stage's own route", async () => {
    const routes = {
      "POST /api/projects/p1/stages/images/retry": jsonAnswer(view),
      "POST /api/projects/p1/stages/audio/rerun": jsonAnswer(view),
    };
    expect((await retryStage(api(routes), "p1", "images")).ok).toBe(true);
    expect((await rerunStage(api(routes), "p1", "audio")).ok).toBe(true);
  });

  it("puts the edited article as markdown", async () => {
    let sent = "";
    const client = api({
      "PUT /api/projects/p1/article": async (request) => {
        sent = JSON.stringify(await request.json());
        return jsonAnswer(view)(request);
      },
    });
    expect((await saveArticle(client, "p1", "# Edited")).ok).toBe(true);
    expect(sent).toBe('{"markdown":"# Edited"}');
  });

  it("deletes and regenerates one image by its output id", async () => {
    const routes = {
      "DELETE /api/projects/p1/images/o7": jsonAnswer(view),
      "POST /api/projects/p1/images/o7/regenerate": jsonAnswer(view),
    };
    expect((await deleteImage(api(routes), "p1", "o7")).ok).toBe(true);
    expect((await regenerateImage(api(routes), "p1", "o7")).ok).toBe(true);
  });

  it("hands a refused delete back as the server's own sentence, not an error", async () => {
    const refusal = "At least one image must remain, so the last one cannot be deleted.";
    const result = await deleteImage(
      api({ "DELETE /api/projects/p1/images/o7": problemAnswer(refusal, 409) }),
      "p1",
      "o7",
    );
    expect(result).toEqual({ ok: false, message: refusal });
  });

  it("hands a refusal back for every status the re-run rules answer with", async () => {
    for (const status of [400, 404, 409]) {
      const result = await rerunStage(
        api({ "POST /api/projects/p1/stages/audio/rerun": problemAnswer("no", status) }),
        "p1",
        "audio",
      );
      expect(result).toEqual({ ok: false, message: "no" });
    }
  });

  it("throws when the server faults, because that is not an answer the page can show", async () => {
    await expect(
      cancelRun(api({ "POST /api/projects/p1/cancel": problemAnswer("boom", 500) }), "p1"),
    ).rejects.toThrow("boom");
  });

  it("reads an output file as text from its asset URL", async () => {
    const client = api({
      "GET /files/p1/notes": () =>
        new Response("Chapter 1 of 7", { status: 200, headers: { "content-type": "text/plain" } }),
    });
    expect(await readOutputText(client, "p1", "notes")).toBe("Chapter 1 of 7");
  });

  it("names the problem when a file is recorded but gone from disk", async () => {
    const gone = "This file is recorded but is no longer on disk; re-run the stage.";
    await expect(
      readOutputText(api({ "GET /files/p1/notes": problemAnswer(gone, 404) }), "p1", "notes"),
    ).rejects.toThrow(gone);
  });
});
