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

function fixture() {
  const fake = fakeTailscale();
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
