import { splitText } from "../../kernel/ports/text.js";
import { fingerprint } from "../../kernel/runner/work.js";

export interface NarrationRequest {
  readonly key: string;
  readonly logicalKey: string;
  readonly logicalText: string;
  readonly segment: "body" | "intro" | "outro";
  readonly text: string;
  readonly requestFingerprint: string;
  readonly fingerprint: string;
  readonly assetId: string | null;
}
export interface NarrationPlanInput {
  readonly groups: readonly {
    readonly key: string;
    readonly segment: "body" | "intro" | "outro";
    readonly text: string;
    readonly wholeRequest: boolean;
    readonly regenerationToken: string | null;
  }[];
  readonly provider: string;
  readonly model: string;
  readonly voice: string;
  readonly maxCharacters: number;
  readonly retained: readonly {
    readonly requestFingerprint: string;
    readonly fingerprint: string;
    readonly assetId: string;
    readonly available: boolean;
  }[];
}
export function normalizeNarrationText(text: string): string {
  return text.replace(/\r\n?/g, "\n").trim();
}
export function narrationRequestFingerprint(input: {
  readonly provider: string;
  readonly model: string;
  readonly voice: string;
  readonly text: string;
  readonly segment: "body" | "intro" | "outro";
  readonly wholeText: string | null;
}): string {
  return fingerprint([
    "narration-request-v1",
    input.provider,
    input.model,
    input.voice,
    input.text,
    null,
    input.segment,
    input.wholeText === null ? null : fingerprint(["whole-v1", input.wholeText]),
  ]);
}
export function planNarration(input: NarrationPlanInput): readonly NarrationRequest[] {
  return input.groups.flatMap((group) => {
    const text = normalizeNarrationText(group.text);
    return splitText(text, input.maxCharacters).map((part, index) => {
      const requestFingerprint = narrationRequestFingerprint({
        ...input,
        text: part,
        segment: group.segment,
        wholeText: group.wholeRequest ? text : null,
      });
      const workFingerprint = fingerprint([requestFingerprint, group.regenerationToken]);
      const retained =
        group.regenerationToken === null
          ? input.retained.find(
              (one) => one.available && one.requestFingerprint === requestFingerprint,
            )
          : input.retained.find((one) => one.available && one.fingerprint === workFingerprint);
      return {
        key: `${group.key}:${index + 1}`,
        logicalKey: group.key,
        logicalText: text,
        segment: group.segment,
        text: part,
        requestFingerprint,
        fingerprint: workFingerprint,
        assetId: retained?.assetId ?? null,
      };
    });
  });
}

export function narrationRegenerationToken(
  tokens: Readonly<Record<string, string>>,
  logicalKey: string,
  segment: "body" | "intro" | "outro",
): string | null {
  return tokens[logicalKey] ?? tokens[`audio:${segment}:future`] ?? null;
}
export function narrationRegenerationKey(key: string): string {
  return /^audio:(body:.+|intro|outro):[0-9]+$/.test(key)
    ? key.slice(0, key.lastIndexOf(":"))
    : key;
}
