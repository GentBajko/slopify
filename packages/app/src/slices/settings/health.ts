import type { Catalogue } from "../../catalog/schema.js";
import type { HostCliId, HostCliStatus, HostLlmId } from "../../kernel/ports/host-cli.js";
import type { ModelInfo, ProviderFamily } from "../../kernel/ports/model.js";
import {
  choiceSites,
  retiredModelUsage,
  slotLabels,
  type UsageSlot,
} from "../model-upkeep/usage.js";
import { cliPathStatus } from "./cli-paths.js";
import { keyGuides } from "./key-guides.js";
import { type KeyTestDeps, testProviderKey } from "./key-test.js";
import type { ProviderId, ProviderStatus } from "./model.js";
import { isLocalCliProvider } from "./model.js";
import { modelReach } from "./model-reach.js";
import { providerStatuses, type ReadinessDeps } from "./readiness.js";

// One line of the health check: what was checked, whether it passed, and what to do if not.
export interface HealthCheck {
  readonly label: string;
  // "ok" passed; "problem" stops runs; "warning" might; "skipped" could not be checked.
  readonly state: "ok" | "problem" | "warning" | "skipped";
  readonly detail: string;
}
export interface ProviderHealth {
  readonly id: ProviderId;
  readonly displayName: string;
  readonly family: ProviderFamily;
  // "unused" is a provider that is neither set up nor chosen anywhere: nothing to fix.
  readonly state: "ok" | "problem" | "warning" | "unused";
  readonly checks: readonly HealthCheck[];
}
export interface HealthReport {
  readonly checkedAt: string;
  readonly providers: readonly ProviderHealth[];
}

export type LoginReader = (
  command: string,
  id: HostLlmId,
  signal: AbortSignal,
) => Promise<HostCliStatus["login"]>;
export interface HealthDeps extends ReadinessDeps, KeyTestDeps {
  readonly catalogue?: () => Catalogue;
  readonly modelsFor?: (provider: string, family: ProviderFamily) => Promise<readonly ModelInfo[]>;
  // Asks a CLI on this computer whether it is signed in (`claude auth status`, `codex login status`).
  readonly login?: LoginReader;
}

const signInCommand: Readonly<Record<HostLlmId, string>> = {
  "claude-code": "claude auth login",
  codex: "codex login",
  gemini: "gemini",
};
function loginSource(id: HostCliId): HostLlmId {
  return id === "codex-image" ? "codex" : id;
}

// Where each provider's models are chosen, as "Text model in template “Weekly”".
function uses(db: HealthDeps["db"]): Map<string, { model: string; where: string }[]> {
  const found = new Map<string, { model: string; where: string }[]>();
  for (const site of choiceSites(db))
    for (const [slot, choice] of Object.entries(site.choices)) {
      if (choice === undefined || choice.provider === "" || choice.model.trim() === "") continue;
      // Images drawn by Codex use the image provider id; the text choice uses the CLI's own.
      const list = found.get(choice.provider) ?? [];
      list.push({
        model: choice.model,
        where: `${slotLabels[slot as UsageSlot]} in ${site.kind} “${site.name}”`,
      });
      found.set(choice.provider, list);
    }
  return found;
}

function overall(
  checks: readonly HealthCheck[],
  used: boolean,
  setUp: boolean,
): ProviderHealth["state"] {
  if (checks.some((check) => check.state === "problem")) return "problem";
  if (checks.some((check) => check.state === "warning")) return "warning";
  return setUp || used ? "ok" : "unused";
}

// "Check all" on Settings → Providers: each command-line tool found and signed in, each saved
// key accepted by its provider, and each chosen model still offered and answering for the key.
// `only` checks one provider: its row's Check again, or a sign-in fix-it's.
export async function checkProviderHealth(
  deps: HealthDeps,
  only?: ProviderId,
): Promise<HealthReport> {
  const statuses = (await providerStatuses(deps)).filter(
    (status) => only === undefined || status.id === only,
  );
  const inUse = uses(deps.db);
  const catalogue = deps.catalogue?.();
  const retired = catalogue === undefined ? [] : retiredModelUsage(deps.db, catalogue);
  const providers = await Promise.all(
    statuses.map((status) =>
      status.readiness.kind === "cli"
        ? cliHealth(deps, status, inUse.get(status.id) ?? [])
        : status.readiness.kind === "local"
          ? Promise.resolve(localHealth(status, inUse.get(status.id) ?? []))
          : keyedHealth(deps, status, inUse.get(status.id) ?? [], retired),
    ),
  );
  return { checkedAt: deps.clock.now().toISOString(), providers };
}

// The system voice: a speech program was found, or not. Nothing to sign in to or pay for.
function localHealth(
  status: ProviderStatus,
  used: readonly { model: string; where: string }[],
): ProviderHealth {
  const { readiness } = status;
  const base = { id: status.id, displayName: status.displayName, family: status.family };
  if (readiness.kind !== "local") throw new Error("Expected the system voice.");
  const found = readiness.available;
  const checks: HealthCheck[] = [
    {
      label: "Speech program found",
      state: found ? "ok" : used.length > 0 ? "problem" : "skipped",
      detail: found
        ? `Speaks with ${readiness.engine ?? "this computer's speech program"}.`
        : `${readiness.issue ?? "No speech program was found on this computer."}${used.length > 0 ? ` It is chosen for ${describe(used)}.` : ""}`,
    },
  ];
  return { ...base, state: overall(checks, used.length > 0, found), checks };
}

async function cliHealth(
  deps: HealthDeps,
  status: ProviderStatus,
  used: readonly { model: string; where: string }[],
): Promise<ProviderHealth> {
  const { readiness } = status;
  if (readiness.kind !== "cli" || !isLocalCliProvider(status.id))
    throw new Error("Expected a command-line provider.");
  const name = status.displayName;
  const command = status.cliPath?.command ?? loginSource(status.id);
  const checks: HealthCheck[] = [];
  const base = { id: status.id, displayName: name, family: status.family };
  if (
    !readiness.installed ||
    readiness.issueKind === "missing" ||
    readiness.issueKind === "bridge"
  ) {
    checks.push({
      label: "Installed",
      state: used.length > 0 ? "problem" : "skipped",
      detail:
        readiness.issue ??
        `${name} was not found on this computer. Install it, sign in once in a terminal, then choose Check all again. If it is installed somewhere unusual, set its path in Settings → Providers.`,
    });
    return { ...base, state: used.length > 0 ? "problem" : "unused", checks };
  }
  checks.push({
    label: "Installed",
    state: readiness.issueKind === "version" ? "problem" : "ok",
    detail:
      readiness.issueKind === "version"
        ? (readiness.issue ?? `Update ${name}, then choose Check all again.`)
        : `Found ${command}${readiness.version === undefined ? "" : ` (version ${readiness.version})`}.`,
  });
  const source = loginSource(status.id);
  let login: HostCliStatus["login"] = "unknown";
  if (status.cliPath?.managedOnHost === true && deps.hostCliStatus !== undefined) {
    login = (await deps.hostCliStatus(status.id)).login;
  } else if (deps.login !== undefined) {
    try {
      login = await deps.login(
        cliPathStatus(deps.db, status.id).command,
        source,
        AbortSignal.timeout(15_000),
      );
    } catch {
      login = "unknown";
    }
  }
  checks.push(
    login === "signed-in"
      ? { label: "Signed in", state: "ok", detail: `${name} is signed in.` }
      : login === "signed-out"
        ? {
            label: "Signed in",
            state: "problem",
            detail:
              source === "gemini"
                ? `Gemini CLI is not signed in: ~/.gemini has no Google sign-in and no GEMINI_API_KEY is set. Open a terminal on the computer running it, run "gemini" and choose Login with Google (or set GEMINI_API_KEY), then choose Check all again.`
                : `${name} is not signed in. Open a terminal on the computer running it, run "${signInCommand[source]}" and sign in, then choose Check all again.`,
          }
        : {
            label: "Signed in",
            state: "skipped",
            detail:
              source === "gemini"
                ? `Slopify could not tell from the Gemini CLI's files (~/.gemini/settings.json) whether it is signed in. Run "gemini" in a terminal once to confirm it is signed in.`
                : `Slopify could not tell whether ${name} is signed in. Run "${signInCommand[source]}" in a terminal if runs fail with a sign-in error.`,
          },
  );
  if (used.length > 0) checks.push(await cliModels(deps, status, used));
  return { ...base, state: overall(checks, used.length > 0, true), checks };
}

async function cliModels(
  deps: HealthDeps,
  status: ProviderStatus,
  used: readonly { model: string; where: string }[],
): Promise<HealthCheck> {
  if (deps.modelsFor === undefined)
    return {
      label: "Chosen models",
      state: "skipped",
      detail: "The model list is not loaded yet.",
    };
  let offered: readonly ModelInfo[];
  try {
    offered = await deps.modelsFor(status.id, status.family);
  } catch {
    return {
      label: "Chosen models",
      state: "warning",
      detail: `Slopify could not read ${status.displayName}'s model list, so it could not check the chosen models. Make sure it is signed in and up to date, then choose Check all again.`,
    };
  }
  const ids = new Set(offered.map((model) => model.id));
  const missing = used.filter((use) => !ids.has(use.model));
  if (missing.length === 0)
    return {
      label: "Chosen models",
      state: "ok",
      detail: `Every chosen model (${[...new Set(used.map((use) => use.model))].join(", ")}) is available.`,
    };
  return {
    label: "Chosen models",
    state: "problem",
    detail: `${status.displayName} does not offer ${describe(missing)}. Update ${status.displayName}, or pick another model there and save.`,
  };
}

// Asks the provider, with the saved key, for each chosen model: a model the account can't use
// fails here before a run does.
async function reachable(
  deps: HealthDeps,
  status: ProviderStatus,
  used: readonly { model: string; where: string }[],
): Promise<HealthCheck> {
  const name = status.displayName;
  const found = await modelReach(
    deps,
    status.id,
    used.map((use) => use.model),
  );
  if (found === undefined)
    return {
      label: "Model reachable",
      state: "skipped",
      detail: `${name} has no model check Slopify can ask without generating something. The key works; the first run shows whether the model does.`,
    };
  const missing = used.filter((use) => found.get(use.model) === "missing");
  if (missing.length > 0)
    return {
      label: "Model reachable",
      state: "problem",
      detail: `${name} does not offer ${describe(missing)} to this key: the model id is wrong, retired, or the account has no access to it. Pick another model there and save, or enable the model for your account, then choose Check all again.`,
    };
  const unknown = [...found].filter(([, reach]) => reach === "unknown").map(([model]) => model);
  if (unknown.length > 0)
    return {
      label: "Model reachable",
      state: "warning",
      detail: `${name} didn't answer for ${unknown.join(", ")}, so Slopify couldn't confirm the key can use ${unknown.length === 1 ? "it" : "them"}. Check your internet connection, then choose Check all again.`,
    };
  return {
    label: "Model reachable",
    state: "ok",
    detail: `${name} answered for ${[...found.keys()].join(", ")} with this key.`,
  };
}

function describe(missing: readonly { model: string; where: string }[]): string {
  const shown = missing.slice(0, 3).map((use) => `${use.model} (${use.where})`);
  return missing.length > 3
    ? `${shown.join("; ")} and ${missing.length - 3} more`
    : shown.join("; ");
}

async function keyedHealth(
  deps: HealthDeps,
  status: ProviderStatus,
  used: readonly { model: string; where: string }[],
  retired: ReturnType<typeof retiredModelUsage>,
): Promise<ProviderHealth> {
  const { readiness } = status;
  const base = { id: status.id, displayName: status.displayName, family: status.family };
  const guide = keyGuides[status.id];
  const checks: HealthCheck[] = [];
  const hasKey = readiness.kind === "keyed" && readiness.hasKey;
  if (!hasKey) {
    checks.push({
      label: "Key saved",
      state: used.length > 0 ? "problem" : "skipped",
      detail: `No key is saved.${used.length > 0 ? ` It is chosen for ${describe(used)}.` : ""} Make one at ${guide?.keyPage.url ?? "the provider's website"}, paste it in Settings → Providers → ${status.displayName} and choose Save.`,
    });
    return { ...base, state: used.length > 0 ? "problem" : "unused", checks };
  }
  const test = await testProviderKey(deps, status.id);
  checks.push({
    label: "Key valid",
    state: test.ok
      ? "ok"
      : test.result === "rate-limited" ||
          test.result === "provider-down" ||
          test.result === "unreachable"
        ? "warning"
        : "problem",
    detail: test.message,
  });
  const mine = retired.filter((usage) => usage.provider === status.id);
  if (mine.length > 0)
    checks.push({
      label: "Chosen models",
      state: "problem",
      detail: `${describe(
        mine.map((usage) => ({
          model: usage.model,
          where: `${slotLabels[usage.slot]} in ${usage.kind} “${usage.name}”`,
        })),
      )} ${mine.length === 1 ? "is" : "are"} no longer offered. Use Switch in Settings → Models → Retired models in use.`,
    });
  else if (used.length > 0)
    checks.push({
      label: "Chosen models",
      state: "ok",
      detail: "Every chosen model is still offered.",
    });
  if (used.length > 0 && test.ok) checks.push(await reachable(deps, status, used));
  return { ...base, state: overall(checks, used.length > 0, true), checks };
}
