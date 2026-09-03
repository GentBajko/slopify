import type { DatabaseSync } from "node:sqlite";
import { falImage } from "./adapters/image/fal.js";
import { openAiImage } from "./adapters/image/openai.js";
import { replicateImage } from "./adapters/image/replicate.js";
import { claudeCodeLlm } from "./adapters/llm/claude-code.js";
import { codexLlm } from "./adapters/llm/codex.js";
import { openRouterLlm } from "./adapters/llm/openrouter.js";
import type { RunCli } from "./adapters/llm/run-cli.js";
import { cartesiaTts } from "./adapters/tts/cartesia.js";
import { elevenLabsTts } from "./adapters/tts/elevenlabs.js";
import { openAiTts } from "./adapters/tts/openai.js";
import type { Clock } from "./kernel/clock.js";
import type { ImagePort } from "./kernel/ports/image.js";
import type { LlmPort } from "./kernel/ports/llm.js";
import type { ProviderFamily } from "./kernel/ports/model.js";
import type { ProviderListing, Registry } from "./kernel/ports/registry.js";
import type { TtsPort } from "./kernel/ports/tts.js";
import type { CliProbe } from "./slices/settings/cli-status.js";
import { keyForAttempt } from "./slices/settings/keys.js";
import type { ProviderId } from "./slices/settings/model.js";
import { providerStatuses } from "./slices/settings/readiness.js";

// Where the adapters and the settings slice meet: `adapters/**` may not import a slice
// and `slices/**` may not import an adapter, so pairing an adapter with the key store
// and the CLI probe belongs to the composition root alone (01-architecture §Q33). It
// sits beside `main.ts` rather than inside it only for length; the linter forbids
// anything below the root to import this file, exactly as it does the registry type.

export interface RegistryDeps {
  readonly db: DatabaseSync;
  // Injected rather than reached for, so a test can build the registry without a network
  // or a child process and `main.ts` owns the real ones (06-testing Doubles).
  readonly fetch: typeof globalThis.fetch;
  readonly spawn: RunCli;
  readonly clock: Clock;
  readonly probe: CliProbe;
}

export function buildRegistry(deps: RegistryDeps): Registry {
  // `logic/02` §Q16: read per request, never held, so an attempt in flight finishes on
  // the key it started with and the next one picks up a key saved since. The closure is
  // handed to the one adapter that provider belongs to and to nothing else (§Q18).
  const keyOf = (provider: ProviderId) => (): string | undefined => {
    const found = keyForAttempt({ db: deps.db, clock: deps.clock }, provider);
    return found.ok ? found.key : undefined;
  };

  const llms = new Map<string, LlmPort>([
    ["openrouter", openRouterLlm({ fetch: deps.fetch, key: keyOf("openrouter") })],
    // No key: both CLIs authenticate with their own login (`logic/02` §Q135).
    ["claude-code", claudeCodeLlm({ run: deps.spawn })],
    ["codex", codexLlm({ run: deps.spawn })],
  ]);
  // One key per provider (`logic/02` invariant), so each adapter is handed the reader for
  // its own row and no other. OpenAI keeps two rows because it ships an adapter in two
  // families and a user may key one without the other (`slices/settings/model.ts`).
  const ttses = new Map<string, TtsPort>([
    ["elevenlabs", elevenLabsTts({ fetch: deps.fetch, key: keyOf("elevenlabs") })],
    ["openai-tts", openAiTts({ fetch: deps.fetch, key: keyOf("openai-tts") })],
    ["cartesia", cartesiaTts({ fetch: deps.fetch, key: keyOf("cartesia") })],
  ]);
  // `logic/09` and `logic/02` §Q15: three image providers behind one port, each handed
  // the reader for its own key row. Replicate also takes the clock: `Prefer: wait` gives
  // up after 60 s and the prediction has to be polled, and the wait is spent on the
  // app's clock so a test never sits through one.
  const images = new Map<string, ImagePort>([
    ["fal", falImage({ fetch: deps.fetch, key: keyOf("fal") })],
    [
      "replicate",
      replicateImage({ fetch: deps.fetch, key: keyOf("replicate"), clock: deps.clock }),
    ],
    ["openai-image", openAiImage({ fetch: deps.fetch, key: keyOf("openai-image") })],
  ]);

  return {
    llm: (id: string): LlmPort => resolve(llms, "llm", id),
    tts: (id: string): TtsPort => resolve(ttses, "tts", id),
    image: (id: string): ImagePort => resolve(images, "image", id),
    // `logic/02` step 5: every supported provider, keyed or not, found or not, so Play
    // can grey one out with a reason instead of hiding it.
    list: async (): Promise<readonly ProviderListing[]> =>
      (await providerStatuses({ db: deps.db, probe: deps.probe })).map((status) => ({
        family: status.family,
        id: status.id,
        name: status.displayName,
        readiness: status.readiness,
      })),
  };
}

// The Registry contract: an id the catalogue does not carry is a bug in admission, not a
// user error, so it throws rather than answering undefined.
function resolve<T>(ports: ReadonlyMap<string, T>, family: ProviderFamily, id: string): T {
  const port = ports.get(id);
  if (port === undefined) {
    throw new Error(`no ${family} adapter is registered for ${id}`);
  }
  return port;
}
