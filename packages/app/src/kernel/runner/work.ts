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

export function fingerprint(value: FingerprintValue): Fingerprint {
  function canonical(item: FingerprintValue): string {
    if (typeof item === "number") z.number().finite().parse(item);
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
