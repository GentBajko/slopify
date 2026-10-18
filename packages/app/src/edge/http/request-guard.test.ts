import { hostname } from "node:os";
import type { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { connectAgent, mcpFixture } from "../mcp/mcp.fake.js";
import { createRemoteAccessService } from "../remote-access/service.js";
import { fakeDns, fakeTailscale } from "../remote-access/tailscale.fake.js";
import { hostAllowed } from "./request-guard.js";

const open: { readonly close: () => void }[] = [];
afterEach(() => {
  for (const fixture of open.splice(0)) fixture.close();
});

function fixture(allowedHosts: readonly string[] = []) {
  const fake = fakeTailscale();
  let at = 0;
  const h = mcpFixture({
    allowedHosts,
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
  return h;
}

const page = "http://127.0.0.1:6969";
const local = { host: "127.0.0.1:6969" };

describe("which names Slopify answers to", () => {
  const rules = { listenHost: "127.0.0.1", remoteHost: undefined, extraHosts: [] };
  it.each([
    [undefined, true],
    ["127.0.0.1:6969", true],
    ["localhost:6969", true],
    ["LOCALHOST", true],
    ["app.localhost:6969", true],
    ["[::1]:6969", true],
    ["192.168.1.5:6969", true],
    [`${hostname()}:6969`, true],
    ["evil.example", false],
    ["evil.example:6969", false],
    ["127.0.0.1.nip.io:6969", false],
    ["", false],
  ])("Host %s → %s", (host, allowed) => {
    expect(hostAllowed(host, rules)).toBe(allowed);
  });

  it("answers the address it listens on, its Tailscale address and names it is told", () => {
    expect(hostAllowed("box.lan:6969", { ...rules, listenHost: "box.lan" })).toBe(true);
    expect(hostAllowed(fakeDns, { ...rules, remoteHost: fakeDns })).toBe(true);
    expect(hostAllowed(`${fakeDns}:8443`, { ...rules, remoteHost: `${fakeDns}:8443` })).toBe(true);
    expect(hostAllowed("box.tail1234.ts.net.evil.example", rules)).toBe(false);
    expect(hostAllowed("slopify:6969", { ...rules, extraHosts: ["slopify"] })).toBe(true);
    expect(hostAllowed("slopify:6969", { ...rules, listenHost: "0.0.0.0" })).toBe(false);
  });
});

describe("requests from other web pages", () => {
  it("refuses a request addressed to a name Slopify doesn't answer to", async () => {
    const h = fixture();
    const rebound = await h.app.request("/api/health", { headers: { host: "evil.example:6969" } });
    expect(rebound.status).toBe(403);
    expect(await rebound.text()).toContain("SLOPIFY_ALLOWED_HOSTS");
    expect((await h.app.request("/", { headers: { host: "evil.example" } })).status).toBe(403);
    expect((await h.app.request("/api/health", { headers: local })).status).toBe(200);
  });

  it("refuses a change from another page, a sandboxed page or a form", async () => {
    const h = fixture();
    const cleanup = (headers: Record<string, string>, body?: string | FormData) =>
      h.app.request(`${page}/api/storage/cleanup`, {
        method: "POST",
        headers: { ...local, ...headers },
        ...(body === undefined ? {} : { body }),
      });
    for (const origin of ["https://evil.example", "null", "http://127.0.0.1:7000"]) {
      const response = await cleanup({ origin });
      expect(response.status, origin).toBe(403);
      expect(await response.text()).toContain("another address");
    }
    const form = await cleanup({ "content-type": "text/plain" }, "x=1");
    expect(form.status).toBe(403);
    expect(await form.text()).toContain("X-Slopify-Client");
    const formData = new FormData();
    formData.set("file", new Blob(["x"]), "x.zip");
    expect((await cleanup({}, formData)).status).toBe(403);
    expect((await cleanup({ origin: page })).status).toBe(200);
    expect((await cleanup({ origin: page }, formData)).status).toBe(200);
    expect((await cleanup({ "x-slopify-client": "script" }, "x=1")).status).toBe(200);
    expect((await cleanup({ "content-type": "application/json" }, "{}")).status).toBe(200);
    expect((await cleanup({})).status).toBe(200);
  });

  it("keeps the extension, the update worker and agents working", async () => {
    const h = fixture();
    const pair = await h.app.request("/api/studio/ext/pair", {
      method: "POST",
      headers: { ...local, origin: "chrome-extension://abcdefghijklmnopabcdefghijklmnop" },
    });
    expect(await pair.text()).not.toContain("another address");
    const activate = await h.app.request("/api/update/activate", {
      method: "POST",
      headers: { ...local, "x-slopify-update-token": "t" },
    });
    expect(await activate.text()).not.toContain("Slopify refused this request");
    const agent = await connectAgent(h.app);
    const made = await agent.callTool({
      name: "create_channel",
      arguments: { body: { id: "00000000-0000-4000-8000-000000000009", name: "Agent's" } },
    });
    expect(made.isError).toBeFalsy();
    await agent.close();
  });
});

// The owner's own `tailscale serve` (set up by hand, not through Settings → Remote access): the
// page is https://<computer>.ts.net[:port], Tailscale forwards plain http to 127.0.0.1 with the
// browser's Host and its own identity headers.
describe("a page served through the person's own proxy", () => {
  const served = "box.tail1234.ts.net";
  const throughServe = (host: string) => ({
    host,
    origin: `https://${host}`,
    "x-forwarded-for": "100.101.102.103",
    "x-forwarded-proto": "https",
    "tailscale-user-login": "person@example.com",
    "tailscale-user-name": "Person",
  });
  const loopbackPeer = { incoming: { socket: { remoteAddress: "127.0.0.1" } } };

  it.each([served, `${served}:8443`])(
    "saves a setting and starts ordinary actions from %s",
    async (host) => {
      const h = fixture();
      const settings = await (await h.app.request("/api/settings", { headers: local })).json();
      const saved = await h.app.request("/api/settings", {
        method: "PUT",
        headers: { ...throughServe(host), "content-type": "application/json" },
        body: JSON.stringify(settings),
      });
      expect(saved.status, await saved.text()).toBe(200);
      const channel = await h.app.request("/api/channels", {
        method: "POST",
        headers: { ...throughServe(host), "content-type": "application/json" },
        body: JSON.stringify({ id: "00000000-0000-4000-8000-00000000000a", name: "Served" }),
      });
      expect(channel.status, await channel.text()).toBe(201);
    },
  );

  it("still refuses a cross-site page, and a page at the same name on another port", async () => {
    const h = fixture();
    for (const origin of ["https://evil.example", `https://${served}:8443`, "null"]) {
      const response = await h.app.request("/api/storage/cleanup", {
        method: "POST",
        headers: { ...throughServe(served), origin },
      });
      expect(response.status, origin).toBe(403);
      expect(await response.text()).toContain("another address");
    }
  });

  it("keeps host setup on the computer itself, and agents off the proxy", async () => {
    const h = fixture();
    const key = await h.app.request("/api/providers/openai/key", {
      method: "PUT",
      headers: { ...throughServe(served), "content-type": "application/json" },
      body: JSON.stringify({ key: "sk-test" }),
    });
    expect(key.status).toBe(403);
    expect(await key.text()).toContain("only on the computer Slopify runs on");
    const mcp = await h.app.request("/mcp", {
      method: "POST",
      headers: {
        ...throughServe(served),
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }),
    });
    expect(mcp.status).toBe(403);
    expect(await mcp.text()).toContain("Agents connect only on the computer Slopify runs on");
  });

  it("takes the name the browser used from X-Forwarded-Host only from a proxy on this computer", async () => {
    const h = fixture(["slopify.example"]);
    const behindProxy = (forwarded: string, origin: string) => ({
      host: "127.0.0.1:6969",
      origin,
      "x-forwarded-host": forwarded,
      "x-forwarded-for": "192.168.1.20",
      "content-type": "application/json",
    });
    const create = (headers: Record<string, string>, peer: unknown, n: number) =>
      h.app.request(
        "/api/channels",
        {
          method: "POST",
          headers,
          body: JSON.stringify({
            id: `00000000-0000-4000-8000-00000000001${String(n)}`,
            name: `Proxied ${String(n)}`,
          }),
        },
        peer,
      );
    const ok = await create(
      behindProxy("slopify.example", "https://slopify.example"),
      loopbackPeer,
      1,
    );
    expect(ok.status, await ok.text()).toBe(201);
    const remotePeer = { incoming: { socket: { remoteAddress: "192.168.1.20" } } };
    expect(
      (await create(behindProxy("slopify.example", "https://slopify.example"), remotePeer, 2))
        .status,
    ).toBe(403);
    expect(
      (await create(behindProxy("slopify.example", "https://evil.example"), loopbackPeer, 3))
        .status,
    ).toBe(403);
    const rebound = await create(
      behindProxy("evil.example", "https://evil.example"),
      loopbackPeer,
      4,
    );
    expect(rebound.status).toBe(403);
    expect(await rebound.text()).toContain("SLOPIFY_ALLOWED_HOSTS");
  });
});
