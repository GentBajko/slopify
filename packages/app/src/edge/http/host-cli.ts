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
type HostEnv = {
  Bindings: HttpBindings;
  Variables: { job: HostJob & { readonly holdStream: () => void } };
};
const unavailable =
  "The AI command-line tool on your computer stopped before it finished, so this result is uncertain. Check the section's outputs on the project page, then use Retry stage.";
function fault(error: unknown, token: string): z.infer<typeof hostFaultSchema> {
  return {
    type: "error",
    kind: isProviderError(error) ? error.fault.kind : "unavailable",
    message: redact(
      isProviderError(error)
        ? error.message
        : "The Slopify helper on your computer could not run the AI command-line tool. Check the tool is installed and signed in, then run the Slopify Docker launcher again.",
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
        {
          type: "error",
          kind: "unavailable",
          message:
            "The Slopify helper on your computer refused the connection. Run the Slopify Docker launcher again to reconnect it.",
        },
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
          message:
            "The Slopify helper on your computer is busy or restarting. Wait a moment, then use Retry stage.",
        },
        503,
      );
    const outgoing = c.env?.outgoing;
    let responseEnded = !outgoing;
    let handlerEnded = false;
    let streaming = false;
    const releaseIfFinished = () => {
      if (responseEnded && handlerEnded && !streaming) job.release();
    };
    c.set("job", {
      ...job,
      holdStream: () => {
        streaming = true;
      },
      release: () => {
        streaming = false;
        releaseIfFinished();
      },
    });
    const finish = () => {
      responseEnded = true;
      releaseIfFinished();
    };
    const close = () => {
      if (!outgoing?.writableFinished) job.abort();
      finish();
    };
    outgoing?.once("close", close);
    outgoing?.once("finish", finish);
    const abort = () => job.abort();
    c.req.raw.signal.addEventListener("abort", abort, { once: true });
    try {
      await next();
    } finally {
      c.req.raw.signal.removeEventListener("abort", abort);
      handlerEnded = true;
      releaseIfFinished();
    }
  });
  app.use(
    "/v1/*",
    bodyLimit({
      maxSize: bridgeLimits.request,
      onError: (c) =>
        c.json(
          {
            type: "error",
            kind: "unavailable",
            message:
              "Slopify hit an internal error (a request to the helper on your computer was too large). Try again; if it keeps happening, use Download diagnostics in Settings and report it.",
          },
          413,
        ),
    }),
  );
  app.get("/v1/status/:provider", async (c) => {
    const id = z.enum(hostCliIds).safeParse(c.req.param("provider"));
    if (!id.success) return c.notFound();
    const status = hostStatusSchema.parse(await ports.status(id.data));
    const text = JSON.stringify(status);
    if (Buffer.byteLength(text) > bridgeLimits.status)
      throw providerError({
        kind: "unavailable",
        message:
          "Slopify hit an internal error (the helper on your computer sent a status report that was too large). Try again; if it keeps happening, use Download diagnostics in Settings and report it.",
      });
    return c.json(status);
  });
  app.get("/v1/models/:provider", async (c) => {
    const id = z.enum(hostCliIds).safeParse(c.req.param("provider"));
    if (!id.success) return c.notFound();
    const result = hostModelsSchema.parse({
      models: await (id.data === "codex-image" ? ports.image : ports.llm(id.data)).models(),
    });
    if (Buffer.byteLength(JSON.stringify(result)) > bridgeLimits.models)
      throw providerError({
        kind: "unavailable",
        message:
          "Slopify hit an internal error (the helper on your computer sent a model list that was too large). Try again; if it keeps happening, use Download diagnostics in Settings and report it.",
      });
    return c.json(result);
  });
  app.post("/v1/llm/:provider", async (c) => {
    const id = z.enum(hostLlmIds).safeParse(c.req.param("provider"));
    if (!id.success) return c.notFound();
    const body = hostLlmSchema.safeParse(await json(c.req.raw));
    if (!body.success) return invalid(c);
    const job = c.get("job");
    job.holdStream();
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
            if (done || parsed.type === "error")
              throw new Error(
                "Slopify hit an internal error (the AI tool on your computer sent a reply Slopify could not read). Try again; if it keeps happening, use Download diagnostics in Settings and report it.",
              );
            const frame = `${JSON.stringify(parsed)}\n`;
            total += Buffer.byteLength(frame);
            if (Buffer.byteLength(frame) > bridgeLimits.frame || total > bridgeLimits.stream)
              throw new Error(
                "Slopify hit an internal error (the AI tool on your computer sent a reply that was too large). Try again; if it keeps happening, use Download diagnostics in Settings and report it.",
              );
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
        throw new Error(
          "Slopify hit an internal error (the image made on your computer was too large or not a valid image). Try again; if it keeps happening, use Download diagnostics in Settings and report it.",
        );
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
      {
        type: "error",
        kind: "unavailable",
        message:
          "The Slopify helper on your computer does not match this version of Slopify. Run the Slopify Docker launcher again to update it.",
      },
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
    {
      type: "error",
      kind: "unavailable",
      message:
        "Slopify hit an internal error (the helper on your computer received a request it could not read). Try again; if it keeps happening, use Download diagnostics in Settings and report it.",
    },
    400,
  );
}
