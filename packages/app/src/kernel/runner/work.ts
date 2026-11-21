import { createHash } from "node:crypto";
import { z } from "zod";
import type { StageKind } from "../pipeline.js";

export type WorkKey = string;
export type Fingerprint = string;
export type FingerprintValue =
  | null
  | boolean
  | number
  | string
  | readonly FingerprintValue[]
  | { readonly [key: string]: FingerprintValue };

export interface WorkRef {
  readonly projectId: string;
  readonly revisionId: string;
  readonly workId: string;
  readonly stageId: string;
  readonly kind: StageKind;
  readonly fingerprint: Fingerprint;
}

export interface PublicationRef {
  readonly work: WorkRef;
  readonly pieceId: string | null;
  readonly publicationId: string;
}

export type AttemptResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly reason: "held" };
export type StageRunResult = "done" | "held";

// Made once: building a schema for every number fingerprinted was a good share of planning.
const finiteNumber = z.number().finite();
// The fingerprint of a value as JSON would write it: the same answer as
// `fingerprint(JSON.parse(JSON.stringify(value)))` with every number checked finite, in one
// pass. Planning fingerprints every recipe's whole input (prompts with the article in them) on
// every derivation; writing it out, reading it back and writing it out again sorted was a large
// share of the server's time during a run.
export function fingerprintJson(value: unknown): Fingerprint {
  const text = canonicalJson(value);
  if (text === undefined) throw new SyntaxError("Nothing to fingerprint");
  return createHash("sha256").update(text).digest("hex");
}
function canonicalJson(input: unknown): string | undefined {
  let value = input;
  if (
    value !== null &&
    typeof value === "object" &&
    typeof (value as { toJSON?: unknown }).toJSON === "function"
  )
    value = (value as { toJSON: () => unknown }).toJSON();
  switch (typeof value) {
    case "number":
      finiteNumber.parse(value);
      return JSON.stringify(value);
    case "string":
    case "boolean":
      return JSON.stringify(value);
    case "bigint":
      // JSON can't write one: throw as it does.
      return JSON.stringify(value);
    case "undefined":
    case "function":
    case "symbol":
      return undefined;
  }
  if (value === null) return "null";
  if (Array.isArray(value)) {
    const items: string[] = [];
    for (let at = 0; at < value.length; at++) items.push(canonicalJson(value[at]) ?? "null");
    return `[${items.join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  const parts: string[] = [];
  for (const key of Object.keys(record).sort()) {
    const part = canonicalJson(record[key]);
    if (part !== undefined) parts.push(`${JSON.stringify(key)}:${part}`);
  }
  return `{${parts.join(",")}}`;
}

export function fingerprint(value: FingerprintValue): Fingerprint {
  function canonical(item: FingerprintValue): string {
    if (typeof item === "number") finiteNumber.parse(item);
    if (item === null || typeof item !== "object") return JSON.stringify(item);
    if (Array.isArray(item)) return `[${item.map(canonical).join(",")}]`;
    const record = item as { readonly [key: string]: FingerprintValue };
    return `{${Object.keys(record)
      .sort()
      .map((key) => {
        const part = record[key];
        if (part === undefined) throw new Error("Missing fingerprint input");
        return `${JSON.stringify(key)}:${canonical(part)}`;
      })
      .join(",")}}`;
  }
  return createHash("sha256").update(canonical(value)).digest("hex");
}
