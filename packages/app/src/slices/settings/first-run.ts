import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import type { ModelInfo, ProviderFamily } from "../../kernel/ports/model.js";
import { readinessIsUsable } from "../../kernel/ports/model.js";
import type { ProviderId, ProviderStatus } from "./model.js";
import { keyedProviders, readJsonSetting, readSetting, writeSetting } from "./repo.js";

// What a fresh Play form picks before the user picks anything. Written once, on the first
// launch that finds a command-line tool, and read by Play for every new draft.
const choiceSchema = z.object({ provider: z.string().min(1), model: z.string() }).strict();
export const providerDefaultsSchema = z
  .object({ llm: choiceSchema.optional(), images: choiceSchema.optional() })
  .strict();
export type ProviderDefaults = z.infer<typeof providerDefaultsSchema>;
export const providerDefaultsKey = "provider.defaults";
const defaultsKey = providerDefaultsKey;
// Set by the first-launch callout's "Got it" in older versions. Nothing writes it now; an
// install that pressed it keeps its first launch behind it.
const doneKey = "first-run.done";

export interface DetectedCli {
  readonly id: ProviderId;
  readonly displayName: string;
  readonly installed: boolean;
  // Installed, new enough and not reporting a sign-in problem.
  readonly usable: boolean;
  readonly version?: string;
  readonly issue?: string;
}
export interface FirstRunStatus {
  // No key saved, and no "Got it" pressed on the callout older versions showed.
  readonly firstRun: boolean;
  readonly detected: readonly DetectedCli[];
  readonly defaults: ProviderDefaults;
}

// The order a text tool is preferred in when several are found.
const textPreference: readonly ProviderId[] = ["claude-code", "codex", "gemini"];

export function readProviderDefaults(db: DatabaseSync): ProviderDefaults {
  return readJsonSetting(db, defaultsKey, providerDefaultsSchema, {});
}

export interface FirstRunDeps {
  readonly db: DatabaseSync;
  readonly modelsFor?: (provider: string, family: ProviderFamily) => Promise<readonly ModelInfo[]>;
}

// First launch: find Claude Code, Codex and Gemini and pick the found ones as Create's defaults.
// Later launches only report what was found. The first-run screen (slices/onboarding) says what
// was found in its own words.
export async function firstRunStatus(
  deps: FirstRunDeps,
  statuses: readonly ProviderStatus[],
): Promise<FirstRunStatus> {
  const detected: DetectedCli[] = statuses
    .filter((status) => status.readiness.kind === "cli")
    .map((status) => {
      const readiness = status.readiness;
      if (readiness.kind !== "cli") throw new Error("Expected a command-line provider.");
      return {
        id: status.id,
        displayName: status.id === "codex-image" ? "Codex CLI (images)" : status.displayName,
        installed: readiness.installed,
        usable: readinessIsUsable(readiness),
        ...(readiness.version === undefined ? {} : { version: readiness.version }),
        ...(readiness.issue === undefined ? {} : { issue: readiness.issue }),
      };
    });
  const firstRun =
    keyedProviders(deps.db).size === 0 && readSetting(deps.db, doneKey) === undefined;
  let defaults = readProviderDefaults(deps.db);
  const usable = new Set(detected.filter((cli) => cli.usable).map((cli) => cli.id));
  const text = textPreference.find((id) => usable.has(id));
  if (
    firstRun &&
    readSetting(deps.db, defaultsKey) === undefined &&
    (text !== undefined || usable.has("codex-image"))
  ) {
    defaults = {
      ...(text === undefined
        ? {}
        : { llm: { provider: text, model: await firstModel(deps, text, "llm") } }),
      ...(usable.has("codex-image")
        ? {
            images: {
              provider: "codex-image",
              model: await firstModel(deps, "codex-image", "image"),
            },
          }
        : {}),
    };
    writeSetting(deps.db, defaultsKey, JSON.stringify(defaults));
  }
  return { firstRun, detected, defaults };
}

async function firstModel(
  deps: FirstRunDeps,
  provider: ProviderId,
  family: ProviderFamily,
): Promise<string> {
  try {
    return (await deps.modelsFor?.(provider, family))?.[0]?.id ?? "";
  } catch {
    // The picker shows the tool's list once it answers; the provider is still chosen.
    return "";
  }
}
