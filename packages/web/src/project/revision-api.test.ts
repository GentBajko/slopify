import { expect, it } from "vitest";
import { createApi } from "@/api";
import { fakeFetch, testOrigin } from "@/test-app";
import { prepareRevision } from "./revision-api.js";

it("keeps conflict identity and server field paths", async () => {
  const api = createApi(
    testOrigin,
    fakeFetch({
      "POST /api/projects/p1/revisions/prepare": () =>
        new Response(
          JSON.stringify({
            title: "Conflict",
            status: 409,
            reason: "conflict",
            currentRevisionId: "r2",
            detail: "Project changed.",
            fields: [{ field: "content.subtitleCues.cues.0.end", message: "Past narration." }],
          }),
          { status: 409, headers: { "content-type": "application/problem+json" } },
        ),
    }),
  );
  expect(await prepareRevision(api, "p1")).toMatchObject({
    ok: false,
    reason: "conflict",
    currentRevisionId: "r2",
    fields: [{ field: "content.subtitleCues.cues.0.end", message: "Past narration." }],
  });
});

it("preserves validation paths and throws infrastructure failures", async () => {
  for (const status of [400, 500]) {
    const api = createApi(
      testOrigin,
      fakeFetch({
        "POST /api/projects/p1/revisions/prepare": () =>
          new Response(
            JSON.stringify({
              title: "Request failed",
              status,
              errors: [{ path: "edit.config.title", message: "Required" }],
            }),
            { status },
          ),
      }),
    );
    if (status === 400)
      expect(await prepareRevision(api, "p1")).toMatchObject({
        ok: false,
        fields: [{ field: "edit.config.title", message: "Required" }],
      });
    else await expect(prepareRevision(api, "p1")).rejects.toThrow("Request failed");
  }
});
