import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { expect, it } from "vitest";
import { z } from "zod";
import { routeCallDeps } from "./mcp.fake.js";
import { registerRemakeTools, remakeOutdated } from "./remake-tools.js";

const preview = (projectId: string, key: string, low: number, high: number, unknown: number) => ({
  ok: true,
  value: {
    id: `${projectId}-preview`,
    projectId,
    baseRevisionId: `${projectId}-r1`,
    planFingerprint: "plan",
    selection: { kind: "allAffected" },
    changedInputs: [],
    work: [
      {
        key,
        stage: "audio",
        kind: "provider",
        disposition: "generate",
        requestFingerprint: "request",
        fingerprint: "work",
        dependsOn: [],
        reason: "",
        inflight: false,
        pieceIds: [],
      },
    ],
    retained: [],
    providedReuseRequired: [],
    costs: {
      currency: "USD",
      rows: [],
      low,
      high,
      unknown,
      expectedWords: 0,
      catalogueDate: null,
      assumptions: [],
    },
    wholeRequestNotice: null,
    warnings: [],
  },
});

const skippedOf = (content: unknown) =>
  z
    .object({ skipped: z.array(z.object({ projectId: z.string(), reason: z.string() }).loose()) })
    .parse(
      JSON.parse(z.array(z.object({ text: z.string() }).loose()).parse(content)[0]?.text ?? ""),
    ).skipped;

it("previews each project's remake, leaves out the running one, and adds one total", async () => {
  const deps = routeCallDeps(async (request) => {
    const path = new URL(request.url).pathname;
    const project = /^\/api\/projects\/([^/]+)/.exec(path)?.[1] ?? "";
    if (path === `/api/projects/${project}`)
      return Response.json({
        project: {
          id: project,
          title: project === "p2" ? "Lighthouse" : "Harbor",
          status: project === "p2" ? "running" : "done",
        },
      });
    if (path.endsWith("/revisions/prepare"))
      return Response.json({ ok: true, view: { revision: { id: `${project}-r1` } } });
    if (path.endsWith("/rebuild/preview"))
      return Response.json(
        project === "p1"
          ? preview("p1", "audio:body", 1, 2, 0)
          : preview("p3", "image:one", 3, 5, 1),
      );
    return new Response(null, { status: 404 });
  });
  const result = await remakeOutdated(deps, ["p1", "p2", "p3"]);
  const said = z
    .object({
      plans: z.array(
        z
          .object({ projectId: z.string(), previewId: z.string(), remakes: z.array(z.string()) })
          .loose(),
      ),
      skipped: z.array(z.object({ projectId: z.string(), reason: z.string() }).loose()),
      total: z.object({ low: z.number(), high: z.number(), unknown: z.number() }),
    })
    .parse(
      JSON.parse(
        z.array(z.object({ text: z.string() }).loose()).parse(result.content)[0]?.text ?? "",
      ),
    );
  expect(said.plans.map((plan) => [plan.projectId, plan.previewId, plan.remakes])).toEqual([
    ["p1", "p1-preview", ["audio:body"]],
    ["p3", "p3-preview", ["image:one"]],
  ]);
  expect(said.skipped).toEqual([
    expect.objectContaining({
      projectId: "p2",
      reason: "It is running now. Remake it once the run has finished.",
    }),
  ]);
  expect(said.total).toEqual({ low: 4, high: 7, unknown: 1 });
});

it("says why a project couldn't be checked and what to do, whatever the API answered", async () => {
  const deps = routeCallDeps(async (request) => {
    const path = new URL(request.url).pathname;
    if (path === "/api/projects/silent") return new Response(null, { status: 500 });
    if (path === "/api/projects/refused")
      return Response.json(
        { title: "Not Found", status: 404, detail: "This project is no longer here." },
        { status: 404, headers: { "content-type": "application/problem+json" } },
      );
    if (path === "/api/projects/odd") return Response.json({ project: { name: "Harbor" } });
    if (path === "/api/projects/oddpreview")
      return Response.json({ project: { title: "Harbor", status: "done" } });
    if (path.endsWith("/revisions/prepare"))
      return Response.json({ ok: true, view: { revision: { id: "r1" } } });
    if (path.endsWith("/rebuild/preview"))
      return Response.json({ ok: true, value: { id: "x", work: [] } });
    return new Response(null, { status: 404 });
  });
  const skipped = skippedOf(
    (await remakeOutdated(deps, ["silent", "refused", "odd", "oddpreview"])).content,
  );
  expect(skipped.map((one) => [one.projectId, one.reason])).toEqual([
    [
      "silent",
      "It couldn't be checked: Remake outdated failed: Slopify answered HTTP 500 without saying why. Call preview_remake_outdated again; if it keeps failing, use Download diagnostics in Settings and report it.",
    ],
    ["refused", "It couldn't be checked: This project is no longer here."],
    [
      "odd",
      "It couldn't be checked: its project page came back in a shape this tool doesn't read. Open the project and use Remake outdated on the Projects list; if it keeps happening, use Download diagnostics in Settings and report it.",
    ],
    [
      "oddpreview",
      "It couldn't be checked: its remake plan came back in a shape this tool doesn't read. Open the project and use Remake outdated on the Projects list; if it keeps happening, use Download diagnostics in Settings and report it.",
    ],
  ]);
});

it("refuses a project id that would leave the project's routes before calling anything", async () => {
  const called: string[] = [];
  const deps = routeCallDeps(async (request) => {
    called.push(new URL(request.url).pathname);
    return new Response(null, { status: 404 });
  });
  const server = new McpServer({ name: "slopify", version: "test" });
  registerRemakeTools(server, deps);
  const [clientEnd, serverEnd] = InMemoryTransport.createLinkedPair();
  await server.connect(serverEnd);
  const agent = new Client({ name: "test-agent", version: "1" });
  await agent.connect(clientEnd);
  const answer = await agent.callTool({
    name: "preview_remake_outdated",
    arguments: { projectIds: ["p1", ".."] },
  });
  expect(answer.isError).toBe(true);
  expect(called).toEqual([]);
});

it("logs a refusal it couldn't read with the project it was checking", async () => {
  const deps = routeCallDeps(
    async () =>
      new Response("{not json", {
        status: 409,
        headers: { "content-type": "application/problem+json" },
      }),
  );
  await remakeOutdated(deps, ["p1"]);
  expect(deps.logged).toEqual([
    expect.stringMatching(/^mcp\.refusal \[p1\]: .*GET \/api\/projects\/p1 .*HTTP 409.*JSON/),
  ]);
});
