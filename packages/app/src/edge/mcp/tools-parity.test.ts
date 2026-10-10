import { afterEach, expect, it } from "vitest";
import { excludedRoutes } from "./excluded-routes.js";
import { connectAgent, mcpFixture } from "./mcp.fake.js";
import { routeTools } from "./tools.js";

const open: { readonly close: () => void }[] = [];
afterEach(() => {
  for (const fixture of open.splice(0)) fixture.close();
});

function apiRoutes(): readonly string[] {
  const h = mcpFixture();
  open.push(h);
  return [
    ...new Set(
      h.app.routes
        .filter(
          (row) => row.method !== "ALL" && row.method !== "OPTIONS" && row.path.startsWith("/api/"),
        )
        .map((row) => `${row.method} ${row.path}`),
    ),
  ];
}

it("offers every API route as a tool, or names why it does not", () => {
  const declared = apiRoutes();
  const offered = new Set(routeTools.map((tool) => tool.route));
  expect(
    declared.filter((route) => !offered.has(route) && excludedRoutes[route] === undefined),
  ).toEqual([]);
  expect([...offered].filter((route) => !declared.includes(route))).toEqual([]);
  expect(Object.keys(excludedRoutes).filter((route) => offered.has(route))).toEqual([]);
  expect(Object.keys(excludedRoutes).filter((route) => !declared.includes(route))).toEqual([]);
});

it("gives every tool its own name", () => {
  const names = routeTools.map((tool) => tool.name);
  expect(names.filter((name, index) => names.indexOf(name) !== index)).toEqual([]);
});

it("never offers keys, the pairing token, backups, the updater, host setup or YouTube actions", () => {
  const offered = new Set(routeTools.map((tool) => tool.route));
  for (const route of [
    "PUT /api/providers/:id/key",
    "POST /api/providers/:id/key/test",
    "DELETE /api/providers/:id/key",
    "GET /api/providers/key-guides",
    "POST /api/studio/settings/pairing",
    "GET /api/storage/export",
    "PUT /api/storage/import",
    "GET /api/backups",
    "PUT /api/backups",
    "POST /api/backups/run",
    "POST /api/update",
    "POST /api/update/activate",
    "PUT /api/settings/autostart",
    "PUT /api/providers/:id/path",
    "GET /api/studio/extension/:file",
    "POST /api/studio/packs/:projectId/choose",
    "POST /api/studio/ext/upload",
    "POST /api/studio/ext/upload-all",
    "PUT /api/studio/settings/auto-comment",
    "POST /api/storage/old-versions/delete",
    "POST /api/storage/cleanup",
  ])
    expect(offered.has(route)).toBe(false);
  for (const route of Object.keys(excludedRoutes).filter((one) => one.includes("/api/studio/ext/")))
    expect(excludedRoutes[route]).toContain("extension");
  expect(excludedRoutes["POST /api/storage/cleanup"]).toContain("Settings → Backup & storage");
  expect(excludedRoutes["POST /api/storage/old-versions/delete"]).toContain(
    "Settings → Backup & storage",
  );
});

it("reads a project's release times through the same route as the project page's Release block", async () => {
  const h = mcpFixture();
  open.push(h);
  const agent = await connectAgent(h.app);
  const read = await agent.callTool({
    name: "get_project_releases",
    arguments: { projectId: h.projectId },
  });
  expect(read.isError).toBeUndefined();
  expect(JSON.stringify(read.content)).toContain("leadHours");
});
