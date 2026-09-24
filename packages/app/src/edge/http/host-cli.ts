import { timingSafeEqual } from "node:crypto";
import type { HttpBindings } from "@hono/node-server";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { stream } from "hono/streaming";
import { z } from "zod";
import { sniffImage } from "../../adapters/image/bytes.js";
import { redact } from "../../kernel/log.js";
import {
  bridgeLimits,
  type HostCliPorts,
  hostCliIds,
  hostCliProtocol,
  type hostFaultSchema,
  hostFrameSchema,
  hostImageSchema,
  hostLlmIds,
  hostLlmSchema,
  hostModelsSchema,
  hostStatusSchema,
} from "../../kernel/ports/host-cli.js";
import { isProviderError, providerError } from "../../kernel/ports/model.js";

interface HostJob {
  readonly signal: AbortSignal;
  readonly abort: () => void;
  readonly release: () => void;
}
export interface HostGate {
  readonly active: number;
  readonly accepting: boolean;
  readonly acquire: (kind: "generation" | "metadata") => HostJob | undefined;
  readonly pause: () => void;
  readonly resume: () => void;
  readonly stop: () => void;
}
export function hostGate(): HostGate {
  let accepting = true;
  let stopped = false;
  const generation = new Set<AbortController>();
  const metadata = new Set<AbortController>();
  return {
    get active() {
      return generation.size;
    },
    get accepting() {
      return accepting;
    },
    acquire: (kind) => {
      const set = kind === "generation" ? generation : metadata;
      if (!accepting || set.size >= bridgeLimits[kind]) return undefined;
      const controller = new AbortController();
      set.add(controller);
      return {
        signal: controller.signal,
        abort: () => controller.abort(),
        release: () => {
          set.delete(controller);
        },
      };
    },
    pause: () => {
      accepting = false;
    },
    resume: () => {
      if (!stopped) accepting = true;
    },
    stop: () => {
      stopped = true;
      accepting = false;
      for (const controller of [...generation, ...metadata]) controller.abort();
    },
  };
}
export interface HostRouteOptions {
  readonly token: string;
  readonly version: string;
  readonly ports: HostCliPorts;
  readonly gate: HostGate;
}
type HostEnv = { Bindings: HttpBindings; Variables: { job: HostJob } };
const unavailable =
  "Host CLI operation did not finish reliably; its result may be uncertain. Review the affected rebuild before retrying.";
function fault(error: unknown, token: string): z.infer<typeof hostFaultSchema> {
  return {
    type: "error",
    kind: isProviderError(error) ? error.fault.kind : "unavailable",
    message: redact(
      isProviderError(error)
        ? error.message
        : "Host helper operation failed. Check the host CLI and rerun the Docker launcher.",
    )
      .replaceAll(token, "[redacted]")
      .slice(0, 4096),
  };
}
export function hostCliRoutes(options: HostRouteOptions): Hono<HostEnv> {
  const app = new Hono<HostEnv>();
  const { gate, ports, token } = options;
  app.use("*", async (c, next) => {
    const supplied = Buffer.from(c.req.header("authorization") ?? "");
    const expected = Buffer.from(`Bearer ${token}`);
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected))
      return c.json(
        { type: "error", kind: "unavailable", message: "Host helper authorization failed." },
        401,
      );
    c.header("Cache-Control", "no-store");
    await next();
  });
  app.get("/v1/health", (c) =>
    c.json({
      protocol: hostCliProtocol,
      version: options.version,
      active: gate.active,
      accepting: gate.accepting,
    }),
  );
  app.use("/v1/*", async (c, next) => {
    const kind = c.req.method === "POST" ? "generation" : "metadata";
    const job = gate.acquire(kind);
    if (!job)
      return c.json(
        {
          type: "error",
          kind: "unavailable",
          message: "The host helper is busy or restarting. Review the rebuild after it is ready.",
        },
        503,
      );
    c.set("job", job);
    const outgoing = c.env?.outgoing;
    const close = () => {
      if (!outgoing?.writableFinished) job.abort();
      job.release();
    };
    outgoing?.once("close", close);
    outgoing?.once("finish", job.release);
    const abort = () => job.abort();
    c.req.raw.signal.addEventListener("abort", abort, { once: true });
    try {
      await next();
    } finally {
      c.req.raw.signal.removeEventListener("abort", abort);
      if (kind === "metadata" || !outgoing) job.release();
    }
  });
  app.use(
    "/v1/*",
    bodyLimit({
      maxSize: bridgeLimits.request,
      onError: (c) =>
        c.json({ type: "error", kind: "unavailable", message: "Host request is too large." }, 413),
    }),
  );
  app.get("/v1/status/:provider", async (c) => {
    const id = z.enum(hostCliIds).safeParse(c.req.param("provider"));
    if (!id.success) return c.notFound();
    const status = hostStatusSchema.parse(await ports.status(id.data));
    const text = JSON.stringify(status);
    if (Buffer.byteLength(text) > bridgeLimits.status)
      throw providerError({ kind: "unavailable", message: "Host status exceeded its limit." });
    return c.json(status);
  });
  app.get("/v1/models/:provider", async (c) => {
    const id = z.enum(hostCliIds).safeParse(c.req.param("provider"));
    if (!id.success) return c.notFound();
    const result = hostModelsSchema.parse({
      models: await (id.data === "codex-image" ? ports.image : ports.llm(id.data)).models(),
    });
    if (Buffer.byteLength(JSON.stringify(result)) > bridgeLimits.models)
      throw providerError({ kind: "unavailable", message: "Host models exceeded their limit." });
    return c.json(result);
  });
  app.post("/v1/llm/:provider", async (c) => {
    const id = z.enum(hostLlmIds).safeParse(c.req.param("provider"));
    if (!id.success) return c.notFound();
    const body = hostLlmSchema.safeParse(await json(c.req.raw));
    if (!body.success) return invalid(c);
    const job = c.get("job");
    const controller = new AbortController();
    const signal = AbortSignal.any([job.signal, controller.signal]);
    let timer = setTimeout(() => controller.abort(), 120_000);
    let total = 0;
    let done = false;
    c.header("Content-Type", "application/x-ndjson");
    return stream(
      c,
      async (output) => {
        output.onAbort(() => controller.abort());
        const abort = () => output.abort();
        signal.addEventListener("abort", abort, { once: true });
        try {
          for await (const event of ports.llm(id.data).complete({ ...body.data, signal })) {
            signal.throwIfAborted();
            clearTimeout(timer);
            timer = setTimeout(() => controller.abort(), 120_000);
            const parsed = hostFrameSchema.parse(event);
            if (done || parsed.type === "error") throw new Error("Invalid provider stream.");
            const frame = `${JSON.stringify(parsed)}\n`;
            total += Buffer.byteLength(frame);
            if (Buffer.byteLength(frame) > bridgeLimits.frame || total > bridgeLimits.stream)
              throw new Error("Host stream exceeded its limit.");
            await output.write(frame);
            signal.throwIfAborted();
            done = parsed.type === "done";
          }
          if (!done) throw providerError({ kind: "unavailable", message: unavailable });
        } catch (error) {
          if (!output.aborted)
            await output.write(
              `${JSON.stringify(fault(signal.aborted ? providerError({ kind: "unavailable", message: unavailable }) : error, token))}\n`,
            );
        } finally {
          clearTimeout(timer);
          signal.removeEventListener("abort", abort);
          controller.abort();
          job.release();
        }
      },
      async () => {
        controller.abort();
        job.release();
      },
    );
  });
  app.post("/v1/image", async (c) => {
    const body = hostImageSchema.safeParse(await json(c.req.raw));
    if (!body.success) return invalid(c);
    const job = c.get("job");
    const controller = new AbortController();
    const signal = AbortSignal.any([job.signal, controller.signal]);
    const timer = setTimeout(() => controller.abort(), 300_000);
    try {
      const result = await ports.image.generate({ ...body.data, signal });
      if (signal.aborted) throw providerError({ kind: "unavailable", message: unavailable });
      if (result.bytes.byteLength > bridgeLimits.image || sniffImage(result.bytes) !== result.mime)
        throw new Error("Invalid host image.");
      c.header("Content-Type", result.mime);
      c.header("Content-Length", String(result.bytes.byteLength));
      return c.body(new Uint8Array(result.bytes));
    } catch (error) {
      throw signal.aborted ? providerError({ kind: "unavailable", message: unavailable }) : error;
    } finally {
      clearTimeout(timer);
      controller.abort();
    }
  });
  app.onError((error, c) => c.json(fault(error, token), 503));
  app.notFound((c) =>
    c.json(
      { type: "error", kind: "unavailable", message: "Unknown host helper operation or protocol." },
      404,
    ),
  );
  return app;
}
async function json(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}
function invalid(c: import("hono").Context<HostEnv>): Response {
  return c.json(
    { type: "error", kind: "unavailable", message: "Invalid host provider request." },
    400,
  );
}
