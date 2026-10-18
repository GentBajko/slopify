import type { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { connectAgent, mcpFixture } from "../mcp/mcp.fake.js";
import type { RemoteAccessView } from "../remote-access/model.js";
import { createRemoteAccessService } from "../remote-access/service.js";
import { type FakeTailscale, fakeDns, fakeTailscale } from "../remote-access/tailscale.fake.js";
import { agentBindings, assistantBindings } from "./actor.js";

const open: { readonly close: () => void }[] = [];
afterEach(() => {
  for (const fixture of open.splice(0)) fixture.close();
});

function fixture(fake: FakeTailscale = fakeTailscale()) {
  let at = 0;
  const h = mcpFixture({
    remoteAccess: (db: DatabaseSync) =>
      createRemoteAccessService({
        db,
        run: fake.run,
        platform: "linux",
        container: false,
        listenHost: "127.0.0.1",
        port: () => 6970,
        log: { write: () => undefined },
        now: () => {
          at += 10_000;
          return at;
        },
      }),
  });
  open.push(h);
  const put = (body: unknown, headers: Record<string, string> = {}, env?: object) =>
    h.app.request(
      "/api/settings/remote-access",
      {
        method: "PUT",
        headers: { "content-type": "application/json", ...headers },
        body: JSON.stringify(body),
      },
      env,
    );
  return { h, fake, put };
}

const viaTailscale = (port = 443) => ({
  host: port === 443 ? fakeDns : `${fakeDns}:${port}`,
  "x-forwarded-for": "100.101.102.103",
  "x-forwarded-proto": "https",
  "x-forwarded-host": port === 443 ? fakeDns : `${fakeDns}:${port}`,
  "tailscale-user-login": "ann@example.com",
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
const rpcHeaders = {
  "content-type": "application/json",
  accept: "application/json, text/event-stream",
};

describe("/api/settings/remote-access", () => {
  it("turns it on and off for the person on this computer", async () => {
    const { h, fake, put } = fixture();
    const on = (await (await put({ enabled: true })).json()) as RemoteAccessView;
    expect(on).toMatchObject({ state: "on", enabled: true, address: `https://${fakeDns}` });
    const read = (await (
      await h.app.request("/api/settings/remote-access")
    ).json()) as RemoteAccessView;
    expect(read).toMatchObject({ state: "on", changeable: true });
    const off = (await (await put({ enabled: false })).json()) as RemoteAccessView;
    expect(off).toMatchObject({ state: "off", enabled: false });
    expect(fake.config.Web?.[`${fakeDns}:443`]).toBeUndefined();
  });

  it("refuses agents and the assistant, who can only read it", async () => {
    const { fake, put } = fixture();
    for (const env of [agentBindings, assistantBindings]) {
      const refused = await put({ enabled: true }, {}, env);
      expect(refused.status).toBe(403);
      expect(((await refused.json()) as { detail: string }).detail).toMatch(/person's/u);
    }
    expect(fake.calls).toEqual([]);
  });

  it("refuses a change from a page opened through Tailscale, and says the switch is this computer's", async () => {
    const { h, put } = fixture();
    await put({ enabled: true });
    const refused = await put({ enabled: false }, viaTailscale());
    expect(refused.status).toBe(403);
    const body = (await refused.json()) as { title: string; detail: string };
    expect(body.title).toBe("Forbidden");
    expect(body.detail).toMatch(/only on the computer/u);
    const read = (await (
      await h.app.request("/api/settings/remote-access", { headers: viaTailscale() })
    ).json()) as RemoteAccessView;
    expect(read).toMatchObject({ state: "on", changeable: false });
  });

  it("lets agents read it with get_remote_access", async () => {
    const { h, put } = fixture();
    await put({ enabled: true });
    const agent = await connectAgent(h.app);
    const tools = await agent.listTools();
    const names = tools.tools.map((tool) => tool.name);
    expect(names).toContain("get_remote_access");
    expect(names.some((name) => /remote_access/u.test(name) && name !== "get_remote_access")).toBe(
      false,
    );
    const read = await agent.callTool({ name: "get_remote_access", arguments: {} });
    expect(JSON.stringify(read.content)).toContain(`https://${fakeDns}`);
    await agent.close();
  });
});

describe("requests through Tailscale", () => {
  it("accepts the Slopify page at the address the browser used, on or off, and no other", async () => {
    const { h, put } = fixture();
    const settings = (headers: Record<string, string>) =>
      h.app.request("/api/studio/settings", { headers });
    // Off: the same page served by the person's own `tailscale serve` is still Slopify's.
    expect(
      (await settings({ ...viaTailscale(8443), origin: `https://${fakeDns}:8443` })).status,
    ).toBe(200);
    await put({ enabled: true, httpsPort: 8443 });
    expect(
      (await settings({ ...viaTailscale(8443), origin: `https://${fakeDns}:8443` })).status,
    ).toBe(200);
    expect((await settings({ ...viaTailscale(8443), origin: `https://${fakeDns}` })).status).toBe(
      403,
    );
    expect(
      (await settings({ ...viaTailscale(8443), origin: "https://other.tail1234.ts.net:8443" }))
        .status,
    ).toBe(403);
    expect((await settings({ origin: `http://${fakeDns}:8443` })).status).toBe(403);
  });

  it("keeps /mcp and /mcp/assistant on this computer", async () => {
    const { h, put } = fixture();
    await put({ enabled: true });
    for (const path of ["/mcp", "/mcp/assistant"])
      for (const headers of [
        viaTailscale(),
        { host: fakeDns },
        { "x-forwarded-for": "100.101.102.103" },
      ]) {
        const response = await h.app.request(path, {
          method: "POST",
          headers: { ...rpcHeaders, ...headers },
          body: JSON.stringify(initialize),
        });
        expect(response.status).toBe(403);
        expect(await response.text()).toContain(
          "Agents connect only on the computer Slopify runs on",
        );
      }
    const local = await connectAgent(h.app);
    expect(local.getServerVersion()?.name).toBe("slopify");
    await local.close();
  });

  it("refuses everything that came through Tailscale Funnel", async () => {
    const { h } = fixture();
    for (const path of ["/api/health", "/", "/mcp"]) {
      const response = await h.app.request(path, {
        headers: { host: fakeDns, "tailscale-funnel-request": "?1" },
      });
      expect(response.status).toBe(403);
      expect(await response.text()).toMatch(/doesn't answer the public internet/u);
    }
  });

  it("answers the page itself through Tailscale", async () => {
    const { h } = fixture();
    const health = await h.app.request("/api/health", { headers: viaTailscale() });
    expect(health.status).toBe(200);
  });
});

describe("over the tailnet", () => {
  it("lets in only the Tailscale account remote access was turned on under", async () => {
    const { h, put } = fixture();
    expect((await put({ enabled: true })).status).toBe(200);
    const health = (login: string | undefined) =>
      h.app.request("/api/health", {
        headers: {
          ...viaTailscale(),
          ...(login === undefined ? {} : { "tailscale-user-login": login }),
        },
      });
    expect((await health("ann@example.com")).status).toBe(200);
    const other = await health("eve@example.com");
    expect(other.status).toBe(403);
    expect(await other.text()).toContain("only the Tailscale account that turned remote access on");
    const page = await h.app.request("/", {
      headers: { ...viaTailscale(), "tailscale-user-login": "eve@example.com" },
    });
    expect(page.status).toBe(403);
    expect((await h.app.request("/api/health")).status).toBe(200);
  });

  it("refuses host setup, keys, imports, updates and destructive storage from another device", async () => {
    const { h, put } = fixture();
    await put({ enabled: true });
    const json = { "content-type": "application/json" };
    const writes: [string, string, unknown][] = [
      ["PUT", "/api/providers/openrouter/key", { key: "sk-or-v1-x" }],
      ["DELETE", "/api/providers/openrouter/key", undefined],
      ["PUT", "/api/providers/claude-code/path", { path: "/tmp/evil" }],
      ["PUT", "/api/storage/import", undefined],
      ["POST", "/api/storage/cleanup", undefined],
      ["POST", "/api/storage/old-versions/delete", undefined],
      ["POST", `/api/storage/projects/${h.projectId}/old-versions/delete`, undefined],
      ["POST", `/api/storage/projects/${h.projectId}/keep-outputs`, undefined],
      ["POST", "/api/storage/files/move", { target: "/tmp/x" }],
      ["PUT", "/api/backups", {}],
      ["POST", "/api/update", undefined],
      ["DELETE", "/api/update", undefined],
      ["POST", "/api/update/activate", undefined],
      ["PUT", "/api/settings/autostart", { enabled: true }],
      ["POST", "/api/assistant/asks/a1", { answer: "allow" }],
    ];
    for (const [method, path, body] of writes) {
      const response = await h.app.request(path, {
        method,
        headers: { ...json, ...viaTailscale() },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      expect(response.status, `${method} ${path}`).toBe(403);
      expect(await response.text(), `${method} ${path}`).toContain(
        "only on the computer Slopify runs on",
      );
    }
    const local = await h.app.request("/api/providers/claude-code/path", {
      method: "PUT",
      headers: json,
      body: JSON.stringify({ path: "" }),
    });
    expect(await local.text()).not.toContain("only on the computer Slopify runs on");
    const denied = await h.app.request("/api/assistant/asks/a1", {
      method: "POST",
      headers: { ...json, ...viaTailscale() },
      body: JSON.stringify({ answer: "deny" }),
    });
    expect(await denied.text()).not.toContain("only on the computer Slopify runs on");
  });
});
