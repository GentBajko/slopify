import { expect, it } from "vitest";
import type { HostCliPorts } from "../../kernel/ports/host-cli.js";
import { hostCliRoutes, hostGate } from "./host-cli.js";

function harness() {
  let calls = 0;
  const ports: HostCliPorts = {
    status: async (id) => ({ id, command: "/host/cli", installed: true, login: "unknown" }),
    llm: (id) => ({
      id,
      capabilities: { streams: true, reportsUsage: true, webSearch: true },
      models: async () => [],
      complete: async function* () {
        calls++;
        yield { type: "delta", text: "hello" };
        yield { type: "done", usage: null, finishReason: null };
      },
    }),
    image: {
      id: "codex-image",
      models: async () => [],
      generate: async () => {
        calls++;
        return { bytes: Buffer.from([0xff, 0xd8, 0xff, 0xd9]), mime: "image/jpeg" };
      },
    },
  };
  const token = "a".repeat(64);
  const gate = hostGate();
  return {
    calls: () => calls,
    gate,
    app: hostCliRoutes({ token, version: "1.4.0", ports, gate }),
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
  };
}
it("authenticates before parsing or invoking any provider", async () => {
  const h = harness();
  expect((await h.app.request("/v1/llm/codex", { method: "POST", body: "invalid" })).status).toBe(
    401,
  );
  expect(
    (await h.app.request("/v1/status/codex", { headers: { authorization: "Bearer wrong" } }))
      .status,
  ).toBe(401);
  expect(h.calls()).toBe(0);
});
it.each(["/v2/llm/codex", "/v1/llm/shell", "/v1/exec"])(
  "rejects unknown operation %s",
  async (path) => {
    const h = harness();
    expect(
      (await h.app.request(path, { method: "POST", headers: h.headers, body: "{}" })).status,
    ).toBe(404);
    expect(h.calls()).toBe(0);
  },
);
it("rejects command fields, malformed JSON and oversized inputs before spawning", async () => {
  const h = harness();
  for (const body of [
    "invalid",
    JSON.stringify({ model: "test", messages: [{ role: "user", content: "x" }], cwd: "/" }),
    JSON.stringify({
      model: "test",
      messages: [{ role: "user", content: "x".repeat(2 * 1024 * 1024 + 1) }],
    }),
  ]) {
    expect(
      (await h.app.request("/v1/llm/codex", { method: "POST", headers: h.headers, body })).status,
    ).toBe(400);
  }
  expect(h.calls()).toBe(0);
});
it("streams only typed events and serves image bytes", async () => {
  const h = harness();
  const response = await h.app.request("/v1/llm/codex", {
    method: "POST",
    headers: h.headers,
    body: JSON.stringify({ model: "test", messages: [{ role: "user", content: "hello" }] }),
  });
  expect(await response.text()).toBe(
    '{"type":"delta","text":"hello"}\n{"type":"done","usage":null,"finishReason":null}\n',
  );
  const image = await h.app.request("/v1/image", {
    method: "POST",
    headers: h.headers,
    body: JSON.stringify({ model: "codex-imagegen", prompt: "test", aspect: "16:9" }),
  });
  expect(image.headers.get("content-type")).toBe("image/jpeg");
  expect(new Uint8Array(await image.arrayBuffer())).toEqual(
    new Uint8Array([0xff, 0xd8, 0xff, 0xd9]),
  );
  expect(h.gate.active).toBe(0);
});
it("pauses admissions without canceling active calls", async () => {
  const h = harness();
  const current = h.gate.acquire("generation");
  h.gate.pause();
  expect(current?.signal.aborted).toBe(false);
  const response = await h.app.request("/v1/image", {
    method: "POST",
    headers: h.headers,
    body: JSON.stringify({ model: "codex-imagegen", prompt: "test", aspect: "16:9" }),
  });
  expect(response.status).toBe(503);
  expect(h.calls()).toBe(0);
  current?.release();
  h.gate.resume();
  expect(h.gate.accepting).toBe(true);
});
it("bounds generation and metadata admission independently", () => {
  const gate = hostGate();
  const jobs = Array.from({ length: 5 }, () => gate.acquire("generation"));
  expect(gate.acquire("generation")).toBeUndefined();
  const metadata = Array.from({ length: 8 }, () => gate.acquire("metadata"));
  expect(gate.acquire("metadata")).toBeUndefined();
  gate.stop();
  expect(jobs.every((job) => job?.signal.aborted)).toBe(true);
  for (const job of [...jobs, ...metadata]) job?.release();
  expect(gate.active).toBe(0);
});
