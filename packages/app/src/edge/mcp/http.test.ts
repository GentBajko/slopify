import { afterEach, expect, it } from "vitest";
import { lastAgentConnection } from "../../slices/agents/connection.js";
import { originAllowed } from "./http.js";
import { connectAgent, mcpFixture } from "./mcp.fake.js";

const open: { readonly close: () => void }[] = [];
afterEach(() => {
  for (const fixture of open.splice(0)) fixture.close();
});

const initialize = {
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    protocolVersion: "2025-11-25",
    capabilities: {},
    clientInfo: { name: "test-agent", version: "1" },
  },
};
const headers = {
  "content-type": "application/json",
  accept: "application/json, text/event-stream",
};

it("connects an agent with no token, answers as slopify and records when it connected", async () => {
  const h = mcpFixture();
  open.push(h);
  expect(lastAgentConnection(h.deps.db)).toBeNull();
  const client = await connectAgent(h.app);
  expect(client.getServerVersion()?.name).toBe("slopify");
  expect(lastAgentConnection(h.deps.db)).toBe("2026-09-10T00:00:00.000Z");
  const listed = await client.listTools();
  expect(listed.tools.map((tool) => tool.name)).toEqual(
    expect.arrayContaining(["list_projects", "get_project", "resume_project"]),
  );
  const projects = await client.callTool({ name: "list_projects", arguments: {} });
  expect(JSON.stringify(projects.content)).toContain("Saved");
  await client.close();
});

it("refuses a request from a web page at another address and records nothing", async () => {
  const h = mcpFixture();
  open.push(h);
  const response = await h.app.request("/mcp", {
    method: "POST",
    headers: { ...headers, origin: "http://rebind.example:6969" },
    body: JSON.stringify(initialize),
  });
  expect(response.status).toBe(403);
  expect(await response.text()).toContain("Settings → Connections → Agents (MCP)");
  expect(lastAgentConnection(h.deps.db)).toBeNull();
});

it("accepts the app's loopback origins and its configured host, nothing else", () => {
  expect(originAllowed(undefined, "127.0.0.1")).toBe(true);
  expect(originAllowed("http://localhost:6969", "127.0.0.1")).toBe(true);
  expect(originAllowed("http://127.0.0.1:7000", "127.0.0.1")).toBe(true);
  expect(originAllowed("http://[::1]:6969", "127.0.0.1")).toBe(true);
  expect(originAllowed("http://studio.localhost:6969", "127.0.0.1")).toBe(true);
  expect(originAllowed("http://192.168.1.20:6969", "192.168.1.20")).toBe(true);
  expect(originAllowed("http://192.168.1.20:6969", "0.0.0.0")).toBe(false);
  expect(originAllowed("http://rebind.example", "127.0.0.1")).toBe(false);
  expect(originAllowed("null", "127.0.0.1")).toBe(false);
});

it("answers GET and DELETE with 405: the endpoint keeps no session and no stream", async () => {
  const h = mcpFixture();
  open.push(h);
  for (const method of ["GET", "DELETE"]) {
    const response = await h.app.request("/mcp", { method, headers });
    expect(response.status).toBe(405);
  }
});

it("refuses a body that is not JSON with a sentence", async () => {
  const h = mcpFixture();
  open.push(h);
  const response = await h.app.request("/mcp", { method: "POST", headers, body: "{" });
  expect(response.status).toBe(400);
  expect(await response.text()).toContain("not JSON");
});
