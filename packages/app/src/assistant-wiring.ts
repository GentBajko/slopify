import type { DatabaseSync } from "node:sqlite";
import { assistantCliRunner } from "./adapters/llm/assistant-cli.js";
import type { RunCli } from "./adapters/llm/run-cli.js";
import type { Clock } from "./kernel/clock.js";
import type { Ids } from "./kernel/ids.js";
import type { Log } from "./kernel/log.js";
import {
  type AssistantCli,
  type AssistantCliState,
  type AssistantCliStates,
  type AssistantEvent,
  assistantClis,
} from "./slices/assistant/model.js";
import { createTurnTokens } from "./slices/assistant/tokens.js";
import { type Assistant, createAssistant } from "./slices/assistant/turn.js";
import { cliPathStatus } from "./slices/settings/cli-paths.js";
import {
  type CliProbe,
  cliProbeTimeoutMs,
  readinessFromProbe,
} from "./slices/settings/cli-status.js";
import type { LoginReader } from "./slices/settings/health.js";
import { providerById } from "./slices/settings/model.js";

// The in-app assistant wired to this computer's CLIs: which are installed and signed in (asked
// at most once a minute, so opening the panel never waits on a probe twice), the CLI runner,
// and this server's own address for `/mcp/assistant`.

// ceiling: a CLI's state is kept a minute; signing in or installing one shows on the next
// message after that.
const statesTtlMs = 60_000;

export function wireAssistant(deps: {
  readonly db: DatabaseSync;
  readonly ids: Ids;
  readonly clock: Clock;
  readonly log: Pick<Log, "write">;
  readonly emit: (event: AssistantEvent) => void;
  readonly spawn: RunCli;
  readonly probe: CliProbe;
  readonly readLogin: LoginReader;
  readonly selfUrl: () => string;
  readonly container: boolean;
}): Assistant {
  let cached: { readonly at: number; readonly states: Promise<AssistantCliStates> } | undefined;
  const stateOf = async (cli: AssistantCli): Promise<AssistantCliState> => {
    const provider = providerById(cli);
    if (provider.auth !== "cli") return { installed: false, login: "unknown" };
    const { command } = cliPathStatus(deps.db, cli);
    const readiness = readinessFromProbe(
      await deps.probe(command, provider.versionArgs, cliProbeTimeoutMs),
      provider,
    );
    if (readiness.kind !== "cli" || !readiness.installed)
      return { installed: false, login: "unknown" };
    const login = await deps.readLogin(command, cli, AbortSignal.timeout(cliProbeTimeoutMs));
    return { installed: true, login, issue: readiness.issue };
  };
  const clis = (): Promise<AssistantCliStates> => {
    const now = deps.clock.now().valueOf();
    if (cached === undefined || now - cached.at > statesTtlMs) {
      const states = Promise.all(assistantClis.map(stateOf)).then(
        ([claude, codex]) =>
          ({
            "claude-code": claude ?? { installed: false, login: "unknown" },
            codex: codex ?? { installed: false, login: "unknown" },
          }) satisfies AssistantCliStates,
      );
      cached = { at: now, states };
      states.catch(() => {
        cached = undefined;
      });
    }
    return cached.states;
  };
  return createAssistant({
    db: deps.db,
    ids: deps.ids,
    clock: deps.clock,
    log: deps.log,
    emit: deps.emit,
    runCli: assistantCliRunner(deps.spawn),
    clis,
    binaryOf: (cli) => cliPathStatus(deps.db, cli).command,
    selfUrl: deps.selfUrl,
    container: deps.container,
    tokens: createTurnTokens(),
  });
}

// The address the CLIs reach this server at: loopback when it listens on every address.
export function assistantSelfUrl(host: string, port: number): string {
  const wildcard = host === "" || host === "0.0.0.0" || host === "::";
  const reach = wildcard ? "127.0.0.1" : host;
  return `http://${reach.includes(":") ? `[${reach}]` : reach}:${String(port)}`;
}
