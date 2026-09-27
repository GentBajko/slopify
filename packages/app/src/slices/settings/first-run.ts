import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import type { ModelInfo, ProviderFamily } from "../../kernel/ports/model.js";
import { readinessIsUsable } from "../../kernel/ports/model.js";
import type { ProviderId, ProviderStatus } from "./model.js";
import { keyedProviders, readSetting, writeSetting } from "./repo.js";

// What a fresh Play form picks before the user picks anything. Written once, on the first
// launch that finds a command-line tool, and read by Play for every new draft.
const choiceSchema = z.object({ provider: z.string().min(1), model: z.string() }).strict();
export const providerDefaultsSchema = z
  .object({ llm: choiceSchema.optional(), images: choiceSchema.optional() })
  .strict();
export type ProviderDefaults = z.infer<typeof providerDefaultsSchema>;
const defaultsKey = "provider.defaults";
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
  // No key saved and the welcome not yet dismissed.
  readonly firstRun: boolean;
  readonly detected: readonly DetectedCli[];
  readonly defaults: ProviderDefaults;
  // The one sentence the welcome leads with, or null when there is nothing to say.
  readonly message: string | null;
  readonly detail: string | null;
}

// The order a text tool is preferred in when several are found.
const textPreference: readonly ProviderId[] = ["claude-code", "codex", "gemini"];

export function readProviderDefaults(db: DatabaseSync): ProviderDefaults {
  const raw = readSetting(db, defaultsKey);
  if (raw === undefined) return {};
  try {
    const parsed = providerDefaultsSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : {};
  } catch {
    return {};
  }
}

export function dismissFirstRun(db: DatabaseSync): void {
  writeSetting(db, doneKey, "1");
}

export interface FirstRunDeps {
  readonly db: DatabaseSync;
  readonly modelsFor?: (provider: string, family: ProviderFamily) => Promise<readonly ModelInfo[]>;
}

// First launch: find Claude Code, Codex and Gemini, pick the found ones as Play's defaults, and
// say a video can be made without any API key. Later launches only report what was found.
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
  const names = detected
    .filter((cli) => cli.usable && cli.id !== "codex-image")
    .map((cli) => cli.displayName);
  return {
    firstRun,
    detected,
    defaults,
    message: !firstRun
      ? null
      : names.length > 0
        ? "You can make a video now, no API keys needed."
        : "No AI command-line tool was found on this computer.",
    detail: !firstRun
      ? null
      : names.length > 0
        ? `Slopify found ${list(names)} and picked ${names.length === 1 ? "it" : "them"} on Play. Narration still needs a voice provider key, or turn Audio off or upload your own. Keys are optional extras in Settings → Providers.`
        : "Install Claude Code, Codex or Gemini CLI and sign in once in a terminal, then reload this page. Or paste an API key in Settings → Providers.",
  };
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

function list(names: readonly string[]): string {
  return names.length <= 1
    ? (names[0] ?? "")
    : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}
