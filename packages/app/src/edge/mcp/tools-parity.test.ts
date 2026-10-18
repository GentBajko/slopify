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

it("asks for confirmed: true on every tool whose page confirms first", () => {
  const confirmed = new Set(
    routeTools.filter((tool) => tool.confirm !== undefined).map((tool) => tool.name),
  );
  for (const name of [
    "delete_old_versions",
    "delete_from_trash",
    "delete_from_trash_many",
    "rerun_stage",
    "soften_stage",
    "cancel_project",
    "trash_project",
    "keep_project_outputs",
    "reset_description_field",
    "discard_draft",
    "delete_template",
    "cancel_schedule",
    "delete_schedule",
    "delete_channel",
    "delete_cast_member",
    "delete_episode_memory",
    "remove_channel_videos",
    "delete_prompt",
    "delete_entry",
    "delete_document_theme",
    "remove_voice",
    "move_files_folder",
    "mark_template_ready",
    "make_samples_for_all",
    "delete_design",
    "delete_design_template",
    "mark_design_template_ready",
  ])
    expect(confirmed.has(name), name).toBe(true);
  // The pages remove these in one press, so the tools don't ask either.
  expect(
    routeTools
      .filter((tool) => tool.route.startsWith("DELETE ") && tool.confirm === undefined)
      .map((tool) => tool.name)
      .sort(),
  ).toEqual(["delete_cast_picture", "delete_staged_file", "remove_channel_video"]);
});

it("leaves the POST tools that only look, price or test unrecorded as an agent's change", () => {
  const unrecorded = routeTools
    .filter((tool) => tool.route.startsWith("POST ") && tool.unrecorded === true)
    .map((tool) => tool.name)
    .sort();
  expect(unrecorded).toEqual(
    [
      "check_providers",
      "estimate_run",
      "preview_added_output",
      "preview_channel_videos",
      "preview_rebuild",
      "quote_samples_for_all",
      "quote_bakeoff",
      "quote_say_it_as",
      "quote_template_save",
      "quote_design_artwork",
      "quote_design_edit",
      "quote_design_template",
      "quote_voice_sample",
      "review_draft",
      "send_test_notification",
    ].sort(),
  );
});

it("tells the agent's client a test send goes out and a catalogue check can change the list", async () => {
  const h = mcpFixture();
  open.push(h);
  const agent = await connectAgent(h.app);
  const { tools } = await agent.listTools();
  const hints = (name: string) => tools.find((tool) => tool.name === name)?.annotations;
  expect(hints("send_test_notification")).toMatchObject({
    readOnlyHint: false,
    openWorldHint: true,
  });
  expect(hints("check_catalogue")).toMatchObject({ readOnlyHint: false, openWorldHint: true });
  expect(hints("refresh_catalogue")).toMatchObject({ readOnlyHint: false, openWorldHint: true });
  // It asks each provider whether it answers: it looks outside, and changes nothing.
  expect(hints("check_providers")).toMatchObject({ readOnlyHint: true, openWorldHint: true });
  expect(hints("preview_rebuild")).toMatchObject({ readOnlyHint: true, openWorldHint: false });
});

it("offers designs with the confirm sentence Mark ready shows and takes a picture as bytes", () => {
  const tool = (name: string) => routeTools.find((one) => one.name === name);
  expect(tool("mark_design_template_ready")?.confirm).toBe(
    "Schedules start making pieces from this version.",
  );
  expect(tool("upload_design_picture")?.upload).toBe("raw");
  for (const name of ["edit_design_picture", "make_design_artwork", "make_design_from_template"])
    expect(tool(name)?.description).toContain("acknowledgedHigh");
});
