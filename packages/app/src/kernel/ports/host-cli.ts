import { z } from "zod";
import type { ImagePort } from "./image.js";
import { type LlmPort, messageRoles, thinkingModes } from "./llm.js";
import { llmDocumentsSchema } from "./llm-documents.js";
import { providerErrorKinds } from "./model.js";

export const hostLlmIds = ["claude-code", "codex", "gemini"] as const;
export type HostLlmId = (typeof hostLlmIds)[number];
export const hostCliIds = [...hostLlmIds, "codex-image"] as const;
export type HostCliId = (typeof hostCliIds)[number];
export const hostCliProtocol = 1;
export const bridgeLimits = {
  request: 16 * 1024 * 1024,
  status: 64 * 1024,
  models: 1024 * 1024,
  frame: 4 * 1024 * 1024,
  stream: 64 * 1024 * 1024,
  image: 32 * 1024 * 1024,
  text: 2 * 1024 * 1024,
  generation: 5,
  metadata: 8,
} as const;

export interface HostCliStatus {
  readonly id: HostCliId;
  readonly command: string;
  readonly installed: boolean;
  readonly version?: string;
  readonly login: "signed-in" | "signed-out" | "unknown";
  readonly issueKind?: "missing" | "version" | "login" | "bridge";
  readonly issue?: string;
}
export interface HostCliPorts {
  readonly status: (id: HostCliId) => Promise<HostCliStatus>;
  readonly llm: (id: HostLlmId) => LlmPort;
  readonly image: ImagePort;
}
const short = z
  .string()
  .min(1)
  .max(256)
  .refine((v) => !/[\p{Cc}]/u.test(v));
const message = z
  .object({ role: z.enum(messageRoles), content: z.string().max(bridgeLimits.text) })
  .strict();
export const hostLlmSchema = z
  .object({
    model: short,
    messages: z.array(message).min(1).max(128),
    documents: llmDocumentsSchema.optional(),
    thinking: z.enum(thinkingModes).optional(),
    webSearch: z.boolean().optional(),
  })
  .strict();
export const hostImageSchema = z
  .object({
    model: z.literal("codex-imagegen"),
    prompt: z.string().min(1).max(bridgeLimits.text),
    aspect: z.enum(["16:9", "9:16"]),
  })
  .strict();
export type HostLlmBody = z.infer<typeof hostLlmSchema>;
export type HostImageBody = z.infer<typeof hostImageSchema>;
export const hostStatusSchema = z
  .object({
    id: z.enum(hostCliIds),
    command: z.string().max(4096),
    installed: z.boolean(),
    version: short.optional(),
    login: z.enum(["signed-in", "signed-out", "unknown"]),
    issueKind: z.enum(["missing", "version", "login", "bridge"]).optional(),
    issue: z.string().max(4096).optional(),
  })
  .strict();
export const hostModelsSchema = z
  .object({
    models: z
      .array(
        z
          .object({
            id: short,
            name: short,
            group: short.optional(),
            thinkingModes: z.array(z.enum(thinkingModes)).max(5).optional(),
          })
          .strict(),
      )
      .max(1000),
  })
  .strict();
export const hostHealthSchema = z
  .object({
    protocol: z.literal(hostCliProtocol),
    version: short,
    active: z.number().int().min(0).max(bridgeLimits.generation),
    accepting: z.boolean(),
  })
  .strict();
export const hostFaultSchema = z
  .object({
    type: z.literal("error"),
    kind: z.enum(providerErrorKinds),
    message: z.string().max(4096),
  })
  .strict();
export const hostFrameSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("delta"), text: z.string().max(bridgeLimits.frame) }).strict(),
  z.object({ type: z.literal("activity") }).strict(),
  z
    .object({
      type: z.literal("done"),
      usage: z
        .object({ inputTokens: z.number().nonnegative(), outputTokens: z.number().nonnegative() })
        .strict()
        .nullable(),
      finishReason: z.string().max(256).nullable(),
    })
    .strict(),
  hostFaultSchema,
]);
