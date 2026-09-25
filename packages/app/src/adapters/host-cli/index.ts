import type { IncomingMessage } from "node:http";
import type { z } from "zod";
import { redact } from "../../kernel/log.js";
import {
  bridgeLimits,
  type HostCliId,
  type HostCliPorts,
  hostFaultSchema,
  hostFrameSchema,
  hostHealthSchema,
  hostImageSchema,
  hostLlmSchema,
  hostModelsSchema,
  hostStatusSchema,
} from "../../kernel/ports/host-cli.js";
import type { LlmDone, LlmEvent } from "../../kernel/ports/llm.js";
import { isProviderError, providerError } from "../../kernel/ports/model.js";
import { sniffImage } from "../image/bytes.js";
import {
  type HostRequestOptions,
  hostRequest,
  hostUnavailable,
  readHostBytes,
} from "./transport.js";

const tooBigForHost =
  "Slopify could not send this request to the host helper because it is larger than, or shaped differently from, what the helper accepts. Make the inputs shorter in Edit project, then use Retry stage; if it happens again, use Download diagnostics in Settings and report it.";

export function createHostCliClient(options: {
  readonly directory: string | undefined;
}): HostCliPorts {
  async function request(input: Omit<HostRequestOptions, "directory">): Promise<IncomingMessage> {
    if (!options.directory) throw hostUnavailable();
    const response = await hostRequest({ ...input, directory: options.directory });
    if (response.statusCode !== 200) {
      try {
        const parsed = hostFaultSchema.safeParse(
          JSON.parse((await readHostBytes(response, bridgeLimits.status)).toString("utf8")),
        );
        if (parsed.success)
          throw providerError({ kind: parsed.data.kind, message: redact(parsed.data.message) });
      } catch (error) {
        if (isProviderError(error)) throw error;
      }
      throw hostUnavailable(input.method === "POST");
    }
    return response;
  }
  async function metadata<T>(
    path: string,
    schema: z.ZodType<T>,
    signal = AbortSignal.timeout(35_000),
  ): Promise<T> {
    const response = await request({ path, method: "GET", kind: "metadata", signal });
    try {
      if (response.headers["content-type"]?.split(";")[0] !== "application/json")
        throw hostUnavailable();
      const bytes = await readHostBytes(
        response,
        path.includes("/models/") ? bridgeLimits.models : bridgeLimits.status,
      );
      return schema.parse(JSON.parse(bytes.toString("utf8")));
    } catch {
      throw hostUnavailable();
    } finally {
      response.destroy();
    }
  }
  async function ready(signal: AbortSignal): Promise<void> {
    const health = await metadata("/v1/health", hostHealthSchema, signal);
    if (!health.accepting) throw hostUnavailable();
  }
  const models = async (id: HostCliId) =>
    (await metadata(`/v1/models/${id}`, hostModelsSchema)).models.map((model) => ({
      id: model.id,
      name: model.name,
      ...(model.group === undefined ? {} : { group: model.group }),
      ...(model.thinkingModes === undefined ? {} : { thinkingModes: model.thinkingModes }),
    }));
  return {
    status: async (id) => {
      try {
        const status = await metadata(`/v1/status/${id}`, hostStatusSchema);
        if (status.id !== id) throw hostUnavailable();
        return {
          id: status.id,
          command: status.command,
          installed: status.installed,
          login: status.login,
          ...(status.version === undefined ? {} : { version: status.version }),
          ...(status.issueKind === undefined ? {} : { issueKind: status.issueKind }),
          ...(status.issue === undefined ? {} : { issue: status.issue }),
        };
      } catch {
        return {
          id,
          command: id === "claude-code" ? "claude" : id === "codex-image" ? "codex" : id,
          installed: false,
          login: "unknown",
          issueKind: "bridge",
          issue: hostUnavailable().message,
        };
      }
    },
    llm: (id) => ({
      id,
      capabilities: { streams: true, reportsUsage: true, webSearch: true },
      models: () => models(id),
      complete: async function* (req) {
        const parsed = hostLlmSchema.safeParse({
          model: req.model,
          messages: req.messages,
          ...(req.documents === undefined ? {} : { documents: req.documents }),
          ...(req.thinking === undefined ? {} : { thinking: req.thinking }),
          ...(req.webSearch === undefined ? {} : { webSearch: req.webSearch }),
        });
        if (!parsed.success)
          throw providerError({
            kind: "unsupported",
            message: tooBigForHost,
          });
        await ready(req.signal);
        const response = await request({
          path: `/v1/llm/${id}`,
          method: "POST",
          kind: "llm",
          body: Buffer.from(JSON.stringify(parsed.data)),
          signal: req.signal,
        });
        try {
          if (response.headers["content-type"]?.split(";")[0] !== "application/x-ndjson")
            throw hostUnavailable(true);
          yield* readEvents(response);
        } catch (error) {
          if (isProviderError(error)) throw error;
          throw hostUnavailable(true);
        } finally {
          response.destroy();
        }
      },
    }),
    image: {
      id: "codex-image",
      models: () => models("codex-image"),
      generate: async (req) => {
        const parsed = hostImageSchema.safeParse({
          model: req.model,
          prompt: req.prompt,
          aspect: req.aspect,
        });
        if (!parsed.success)
          throw providerError({
            kind: "unsupported",
            message: tooBigForHost,
          });
        await ready(req.signal);
        const response = await request({
          path: "/v1/image",
          method: "POST",
          kind: "image",
          body: Buffer.from(JSON.stringify(parsed.data)),
          signal: req.signal,
        });
        try {
          const mime = response.headers["content-type"];
          if (mime !== "image/png" && mime !== "image/jpeg") throw hostUnavailable(true);
          const bytes = await readHostBytes(response, bridgeLimits.image);
          if (sniffImage(bytes) !== mime) throw hostUnavailable(true);
          return { bytes, mime };
        } catch (error) {
          if (isProviderError(error)) throw error;
          throw hostUnavailable(true);
        } finally {
          response.destroy();
        }
      },
    },
  };
}
async function* readEvents(response: IncomingMessage): AsyncGenerator<LlmEvent> {
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let pending = "";
  let total = 0;
  let terminal: LlmDone | undefined;
  for await (const bytes of response) {
    if (!Buffer.isBuffer(bytes)) throw hostUnavailable(true);
    total += bytes.byteLength;
    if (total > bridgeLimits.stream) throw hostUnavailable(true);
    pending += decoder.decode(bytes, { stream: true });
    let newline = pending.indexOf("\n");
    while (newline !== -1) {
      const line = pending.slice(0, newline);
      pending = pending.slice(newline + 1);
      if (Buffer.byteLength(line) + 1 > bridgeLimits.frame) throw hostUnavailable(true);
      if (line.trim() !== "") {
        if (terminal) throw hostUnavailable(true);
        const event = hostFrameSchema.parse(JSON.parse(line));
        if (event.type === "error")
          throw providerError({ kind: event.kind, message: redact(event.message) });
        if (event.type === "done") terminal = event;
        else yield event;
      }
      newline = pending.indexOf("\n");
    }
    if (Buffer.byteLength(pending) >= bridgeLimits.frame) throw hostUnavailable(true);
  }
  pending += decoder.decode();
  if (!response.complete || pending.trim() !== "" || !terminal) throw hostUnavailable(true);
  yield terminal;
}
