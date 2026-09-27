import { isAbsolute } from "node:path";
import { z } from "zod";
import type { GeneratedImage, ImagePort } from "./image.js";
import { type LlmDone, type LlmPort, messageRoles, thinkingModes } from "./llm.js";
import { llmDocumentsSchema } from "./llm-documents.js";
import { providerErrorKinds } from "./model.js";

export const hostLlmIds = ["claude-code", "codex", "gemini"] as const;
export type HostLlmId = (typeof hostLlmIds)[number];
export const hostCliIds = [...hostLlmIds, "codex-image"] as const;
export type HostCliId = (typeof hostCliIds)[number];
// The health answer's protocol stays 1: both sides read it as an exact value, so bumping it
// would lock an older app out of a newer helper and the other way round. Richer stream frames
// are negotiated per request instead, with `hostFramesHeader`.
export const hostCliProtocol = 1;
// Sent by the app on every LLM request: the frame version it can read. A helper puts the
// cached-token count, the answering model and the plan windows on the `done` frame only when
// this says 2 or more, because an app from before them rejects any field it does not know.
// An older helper ignores the header and sends the plain frame, which reads as "not reported".
export const hostFramesHeader = "x-slopify-frames";
export const hostFramesVersion = 2;
// What the Codex CLI reported spending on a bridged image (its tokens and plan windows), as
// base64url JSON. A header rather than a body change, so an older app just ignores it and a
// newer app reads a missing one as "not reported".
export const hostImageReportHeader = "x-slopify-image-report";
export const bridgeLimits = {
  request: 16 * 1024 * 1024,
  status: 64 * 1024,
  models: 1024 * 1024,
  frame: 4 * 1024 * 1024,
  stream: 64 * 1024 * 1024,
  image: 32 * 1024 * 1024,
  // An establishing image sent along with an image request; base64 keeps it inside `request`.
  reference: 10 * 1024 * 1024,
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
/** The helper's own ports: it can also open a verified project folder on the user's desktop. */
export interface HostCliRuntime extends HostCliPorts {
  readonly openFolder?: (path: string) => Promise<void>;
}
/** A folder the helper refuses to open on purpose; the route answers it with a 403. */
export class HostFolderRefused extends Error {}
/** The container's view: opening a folder answers false when the helper can't (or is too old to). */
export interface HostCliClient extends HostCliPorts {
  readonly openFolder: (path: string, signal: AbortSignal) => Promise<boolean>;
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
const bridgedImage = z
  .object({
    mime: z.enum(["image/png", "image/jpeg"]),
    base64: z
      .string()
      .max(Math.ceil(bridgeLimits.reference / 3) * 4)
      .regex(/^[A-Za-z0-9+/]*={0,2}$/),
  })
  .strict();
export const hostImageSchema = z
  .object({
    // "codex-imagegen" is the Codex default; any other is one of the Codex CLI's models.
    model: short.refine((v) => !v.startsWith("-") && !/\s/.test(v)),
    prompt: z.string().min(1).max(bridgeLimits.text),
    aspect: z.enum(["16:9", "9:16"]),
    thinking: z.enum(thinkingModes).optional(),
    // The establishing image, as base64 (at most `bridgeLimits.reference` bytes decoded).
    reference: z
      .object({
        mime: z.enum(["image/png", "image/jpeg"]),
        base64: z
          .string()
          .max(Math.ceil(bridgeLimits.reference / 3) * 4)
          .regex(/^[A-Za-z0-9+/]*={0,2}$/),
      })
      .strict()
      .optional(),
    // The cast members the brief mentions, with their pictures (`ImageRequest.cast`); the
    // whole request still has to fit `bridgeLimits.request`.
    cast: z
      .array(
        z
          .object({
            name: z.string().min(1).max(200),
            description: z.string().max(2000),
            images: z.array(bridgedImage).min(1).max(4),
          })
          .strict(),
      )
      .max(4)
      .optional(),
  })
  .strict();
export const hostOpenFolderSchema = z
  .object({
    path: z
      .string()
      .min(1)
      .max(4096)
      .refine((v) => isAbsolute(v) && !/[\p{Cc}]/u.test(v)),
  })
  .strict();
export const hostOpenedSchema = z.object({ opened: z.literal(true) }).strict();
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
            thinkingModes: z.array(z.enum(thinkingModes)).max(thinkingModes.length).optional(),
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
// Faults and frames are read leniently: a field this side does not know is dropped, never an
// error, so a newer helper can add optional fields without breaking this app. (Apps before
// frame version 2 read them strictly, which is why the helper asks before adding any.)
export const hostFaultSchema = z.object({
  type: z.literal("error"),
  kind: z.enum(providerErrorKinds),
  message: z.string().max(4096),
});
const limitWindowSchema = z.object({
  kind: z.enum(["five_hour", "weekly", "other"]),
  usedPercent: z.number().min(0).max(1_000_000),
  resetsAt: z.string().max(64).nullable(),
});
const limitWindowsSchema = z.array(limitWindowSchema).max(16);
const planLimitReadingSchema = z.object({
  before: limitWindowsSchema.optional(),
  after: limitWindowsSchema.optional(),
});
const usageSchema = z.object({
  inputTokens: z.number().nonnegative(),
  outputTokens: z.number().nonnegative(),
  // Frame version 2 on; an older helper never sends them.
  cachedInputTokens: z.number().nonnegative().optional(),
  model: short.optional(),
});
export const hostFrameSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("delta"), text: z.string().max(bridgeLimits.frame) }),
  z.object({ type: z.literal("activity") }),
  z.object({
    type: z.literal("done"),
    usage: usageSchema.nullable(),
    finishReason: z.string().max(256).nullable(),
    // Frame version 2 on.
    limits: planLimitReadingSchema.optional(),
  }),
  hostFaultSchema,
]);
export type HostFrame = z.infer<typeof hostFrameSchema>;

// The `done` frame the helper sends to an app that reads frame `version`. Version 1 is the
// original shape exactly; version 2 adds what the CLI reported, each part kept only when it is
// well formed so one odd value never costs the answer.
export function hostDoneFrame(event: LlmDone, version: number): HostFrame {
  const plain =
    event.usage === null
      ? null
      : { inputTokens: event.usage.inputTokens, outputTokens: event.usage.outputTokens };
  if (!(version >= 2)) return { type: "done", usage: plain, finishReason: event.finishReason };
  const cached = z.number().nonnegative().safeParse(event.usage?.cachedInputTokens);
  const model = short.safeParse(event.usage?.model);
  const limits = planLimitReadingSchema.safeParse(event.limits);
  return {
    type: "done",
    usage:
      plain === null
        ? null
        : {
            ...plain,
            ...(cached.success ? { cachedInputTokens: cached.data } : {}),
            ...(model.success ? { model: model.data } : {}),
          },
    finishReason: event.finishReason,
    ...(event.limits !== undefined && limits.success ? { limits: limits.data } : {}),
  };
}

const imageReportSchema = z.object({
  usage: usageSchema.optional(),
  limits: planLimitReadingSchema.optional(),
});
// The image report header's value, or undefined when there is nothing well formed to report.
export function encodeHostImageReport(image: GeneratedImage): string | undefined {
  const report = imageReportSchema.safeParse({
    ...(image.usage === undefined ? {} : { usage: image.usage }),
    ...(image.limits === undefined ? {} : { limits: image.limits }),
  });
  if (!report.success || (report.data.usage === undefined && report.data.limits === undefined))
    return undefined;
  const value = Buffer.from(JSON.stringify(report.data)).toString("base64url");
  // Well inside Node's 16 KB header allowance; a larger report is dropped, never the image.
  return value.length > 8192 ? undefined : value;
}
// The usage and plan windows a helper sent beside an image: empty when it sent none (an older
// helper) or something unreadable, which only costs the report.
export function decodeHostImageReport(
  value: string | string[] | undefined,
): Pick<GeneratedImage, "usage" | "limits"> {
  if (typeof value !== "string" || value.length > 8192) return {};
  try {
    const report = imageReportSchema.safeParse(
      JSON.parse(Buffer.from(value, "base64url").toString("utf8")),
    );
    if (!report.success) return {};
    return {
      ...(report.data.usage === undefined ? {} : { usage: report.data.usage }),
      ...(report.data.limits === undefined ? {} : { limits: report.data.limits }),
    };
  } catch {
    return {};
  }
}
