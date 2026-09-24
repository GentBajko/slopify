import { expect, it, vi } from "vitest";
import type { HostCliPorts } from "../../kernel/ports/host-cli.js";
import { hostCliRoutes, hostGate } from "./host-cli.js";

function harness(override: Partial<HostCliPorts> = {}) {
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
    app: hostCliRoutes({ token, version: "1.4.0", ports: { ...ports, ...override }, gate }),
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
it("bounds chunked request bodies before admitting a provider call", async () => {
  const h = harness();
  let sent = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (sent++ < 17) controller.enqueue(new Uint8Array(1024 * 1024));
      else controller.close();
    },
  });
  const request = new Request("http://localhost/v1/llm/codex", {
    method: "POST",
    headers: h.headers,
    body,
    duplex: "half",
  } as RequestInit);
  expect((await h.app.fetch(request)).status).toBe(413);
  expect(h.calls()).toBe(0);
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
it("refuses a ninth metadata operation until the first eight finish", async () => {
  let release = () => {};
  const ready = new Promise<void>((resolve) => {
    release = resolve;
  });
  let calls = 0;
  const h = harness({
    status: async (id) => {
      calls++;
      await ready;
      return { id, command: "fixture", installed: true, login: "unknown" };
    },
  });
  const requests = Array.from({ length: 8 }, () =>
    h.app.request("/v1/status/codex", { headers: h.headers }),
  );
  await expect.poll(() => calls).toBe(8);
  expect((await h.app.request("/v1/status/codex", { headers: h.headers })).status).toBe(503);
  expect(calls).toBe(8);
  release();
  expect((await Promise.all(requests)).every((response) => response.status === 200)).toBe(true);
  expect((await h.app.request("/v1/status/codex", { headers: h.headers })).status).toBe(200);
});
it.each(["llm", "image"] as const)(
  "enforces the %s deadline without synthetic activity",
  async (kind) => {
    let began = () => {};
    const started = new Promise<void>((resolve) => {
      began = resolve;
    });
    let stopped = false;
    const wait = async (signal: AbortSignal) => {
      began();
      try {
        await new Promise<void>((_resolve, reject) =>
          signal.addEventListener("abort", () => reject(signal.reason), { once: true }),
        );
      } finally {
        stopped = true;
      }
    };
    const ports: HostCliPorts = {
      status: async (id) => ({ id, command: "fixture", installed: true, login: "unknown" }),
      llm: (id) => ({
        id,
        capabilities: { streams: true, reportsUsage: true, webSearch: true },
        models: async () => [],
        complete: async function* (req) {
          yield { type: "activity" };
          await wait(req.signal);
        },
      }),
      image: {
        id: "codex-image",
        models: async () => [],
        generate: async (req) => {
          await wait(req.signal);
          throw new Error("unreachable");
        },
      },
    };
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      const app = hostCliRoutes({
        token: "a".repeat(64),
        version: "1.4.0",
        ports,
        gate: hostGate(),
      });
      const result = Promise.resolve(
        app.request(kind === "llm" ? "/v1/llm/codex" : "/v1/image", {
          method: "POST",
          headers: {
            authorization: `Bearer ${"a".repeat(64)}`,
            "content-type": "application/json",
          },
          body: JSON.stringify(
            kind === "llm"
              ? { model: "test", messages: [{ role: "user", content: "hello" }] }
              : { model: "codex-imagegen", prompt: "test", aspect: "16:9" },
          ),
        }),
      ).then((res) => res.text());
      await started;
      await vi.advanceTimersByTimeAsync((kind === "llm" ? 120_000 : 300_000) - 1);
      expect(stopped).toBe(false);
      await vi.advanceTimersByTimeAsync(2);
      expect(stopped).toBe(true);
      const text = await result;
      if (kind === "image") expect(JSON.parse(text).kind).toBe("unavailable");
      else expect(text.match(/activity/g)).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  },
);
