import { expect, it } from "vitest";
import { callRoute } from "./call-route.js";
import { routeCallDeps } from "./mcp.fake.js";
import type { RouteTool } from "./route-tool.js";

function answering(response: Response) {
  const seen: Request[] = [];
  return {
    seen,
    ...routeCallDeps(async (request: Request): Promise<Response> => {
      seen.push(request);
      return response.clone();
    }),
  };
}
const problem = (status: number, body: Record<string, unknown>): Response =>
  new Response(JSON.stringify({ type: "about:blank", title: "Conflict", status, ...body }), {
    status,
    headers: { "content-type": "application/problem+json" },
  });

const resume: RouteTool = {
  name: "resume_project",
  route: "POST /api/projects/:id/resume",
  title: "Continue the run",
  description: "Continue the run.",
};

it("sends the path parameters and the body to the route and returns its JSON", async () => {
  const fake = answering(Response.json({ ok: true }, { status: 202 }));
  const result = await callRoute(fake, resume, {
    id: "p1",
    body: { baseRevisionId: "r1", idempotencyKey: "k1" },
  });
  const sent = fake.seen[0];
  expect(sent?.method).toBe("POST");
  expect(new URL(sent?.url ?? "http://x").pathname).toBe("/api/projects/p1/resume");
  expect(await sent?.json()).toEqual({ baseRevisionId: "r1", idempotencyKey: "k1" });
  expect(result).toEqual({ content: [{ type: "text", text: '{"ok":true}' }] });
});

it("puts query arguments on the URL", async () => {
  const fake = answering(Response.json({ runs: [] }));
  await callRoute(
    fake,
    { name: "get_calendar", route: "GET /api/calendar", title: "Calendar", description: "" },
    { query: { from: "2026-09-01T00:00:00.000Z", to: "2026-09-08T00:00:00.000Z" } },
  );
  expect(new URL(fake.seen[0]?.url ?? "http://x").searchParams.get("to")).toBe(
    "2026-09-08T00:00:00.000Z",
  );
});

it("passes the route's refusal through and says how to retry against a moved project", async () => {
  const fake = answering(
    problem(409, {
      detail: "This project changed since the page loaded. Reload the page, then try again.",
      reason: "conflict",
      currentRevisionId: "r7",
    }),
  );
  const result = await callRoute(fake, resume, { id: "p1", body: {} });
  expect(result.isError).toBe(true);
  expect(JSON.stringify(result.content)).toContain("This project changed since the page loaded.");
  expect(JSON.stringify(result.content)).toContain(
    "call resume_project once more with baseRevisionId r7 and a new idempotencyKey",
  );
});

it("adds no retry hint to a refusal that is not about a moved project", async () => {
  const fake = answering(
    problem(409, {
      detail: "This section is still running.",
      reason: "running",
      currentRevisionId: "r7",
    }),
  );
  const result = await callRoute(fake, resume, { id: "p1", body: {} });
  expect(JSON.stringify(result.content)).not.toContain("once more with baseRevisionId");
});

it("turns a schema refusal into the arguments that were wrong", async () => {
  const fake = answering(
    problem(400, {
      detail:
        "Slopify could not read this request, which usually means the page is out of date. Reload the page and try again.",
      errors: [{ path: "idempotencyKey", message: "Invalid UUID" }],
    }),
  );
  const result = await callRoute(fake, resume, { id: "p1", body: {} });
  const said = JSON.stringify(result.content);
  expect(said).toContain("idempotencyKey: Invalid UUID");
  expect(said).not.toContain("Reload the page");
});

it("names the fields a refusal lists when its sentence does not already say them", async () => {
  const fake = answering(
    problem(400, {
      detail: "This edit can't be saved.",
      fields: [{ field: "title", message: "Give the video a title." }],
    }),
  );
  const result = await callRoute(fake, resume, { id: "p1", body: {} });
  expect(JSON.stringify(result.content)).toContain("title: Give the video a title.");
});

it("asks for confirmed: true before an action the page confirms, and sends nothing", async () => {
  const fake = answering(new Response(null, { status: 204 }));
  const cancel: RouteTool = { ...resume, name: "cancel_project", confirm: "Cancel this run?" };
  const refused = await callRoute(fake, cancel, { id: "p1" });
  expect(refused.isError).toBe(true);
  expect(JSON.stringify(refused.content)).toContain("confirmed: true");
  expect(fake.seen).toHaveLength(0);
  expect(await callRoute(fake, cancel, { id: "p1", confirmed: true })).toEqual({
    content: [{ type: "text", text: "Done." }],
  });
});

it("returns a picture as image content", async () => {
  const fake = answering(
    new Response(new Uint8Array([137, 80, 78, 71]), { headers: { "content-type": "image/png" } }),
  );
  const result = await callRoute(
    fake,
    {
      name: "get_cast_picture",
      route: "GET /api/channels/pictures/:sha256",
      title: "Picture",
      description: "",
    },
    { sha256: "a" },
  );
  expect(result.content).toEqual([{ type: "image", data: "iVBORw==", mimeType: "image/png" }]);
});

it("sends a file as multipart for an upload tool, and as the bytes for a raw one", async () => {
  const multipart = answering(Response.json({ id: "s1" }, { status: 201 }));
  await callRoute(
    multipart,
    {
      name: "upload_staged_file",
      route: "POST /api/staging/:kind",
      title: "Upload",
      description: "",
      upload: "multipart",
    },
    { kind: "images", file: { name: "one.png", contentType: "image/png", base64: "iVBORw==" } },
  );
  const form = await multipart.seen[0]?.formData();
  const file = form?.get("file");
  expect(file instanceof File ? file.name : undefined).toBe("one.png");
  const raw = answering(Response.json({ rows: 1 }));
  await callRoute(
    raw,
    {
      name: "import_studio_export",
      route: "POST /api/studio/channels/:channelId/report",
      title: "Import",
      description: "",
      upload: "raw",
    },
    {
      channelId: "c1",
      file: { name: "export.zip", contentType: "application/zip", base64: "UEsDBA==" },
    },
  );
  expect(raw.seen[0]?.headers.get("content-type")).toBe("application/zip");
  expect(new Uint8Array(await (raw.seen[0]?.arrayBuffer() ?? new ArrayBuffer(0)))).toEqual(
    new Uint8Array([80, 75, 3, 4]),
  );
});

it("refuses a path parameter that would leave the tool's route, and sends nothing", async () => {
  const fake = answering(new Response(null, { status: 204 }));
  const trash: RouteTool = {
    name: "delete_from_trash",
    route: "DELETE /api/trash/:kind/:id",
    title: "Delete forever",
    description: "",
  };
  const oldVersions: RouteTool = {
    name: "delete_old_versions",
    route: "POST /api/storage/projects/:id/old-versions/delete",
    title: "Delete old versions",
    description: "",
  };
  for (const [tool, args] of [
    [oldVersions, { id: ".." }],
    [trash, { kind: "..", id: "update" }],
    [resume, { id: "%2e%2e" }],
    [resume, { id: "." }],
    [resume, { id: "a/b" }],
    [resume, {}],
  ] as const) {
    const refused = await callRoute(fake, tool, args);
    expect(refused.isError).toBe(true);
    expect(JSON.stringify(refused.content)).toContain(`call ${tool.name} again`);
  }
  expect(fake.seen).toHaveLength(0);
});
