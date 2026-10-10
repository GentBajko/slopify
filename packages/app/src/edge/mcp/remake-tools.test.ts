import { expect, it } from "vitest";
import { z } from "zod";
import { routeCallDeps } from "./mcp.fake.js";
import { remakeOutdated } from "./remake-tools.js";

const preview = (projectId: string, key: string, low: number, high: number, unknown: number) => ({
  ok: true,
  value: {
    id: `${projectId}-preview`,
    projectId,
    baseRevisionId: `${projectId}-r1`,
    work: [{ key, disposition: "generate", reason: "" }],
    providedReuseRequired: [],
    costs: { low, high, unknown, rows: [] },
  },
});

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
