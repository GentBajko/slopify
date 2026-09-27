import type { Clock } from "../clock.js";
import type { Log } from "../log.js";
import type { ImagePort } from "../ports/image.js";
import type { LlmPort } from "../ports/llm.js";
import type { Registry } from "../ports/registry.js";
import type { StandaloneMeter } from "./meter.js";
import type { StandaloneDeps } from "./standalone.js";

// Test support, not shipped. A slice test that wants the real standalone call over a fake
// provider builds its deps here: slices may not hold a registry, even in a test.
export function standaloneOver(
  ports: { readonly llm?: LlmPort; readonly image?: ImagePort },
  deps: { readonly clock: Clock; readonly log?: Log; readonly meter?: StandaloneMeter },
): StandaloneDeps {
  const registry: Registry = {
    llm: () => {
      if (ports.llm === undefined) throw new Error("no llm in this test");
      return ports.llm;
    },
    tts: () => {
      throw new Error("no tts in this test");
    },
    image: () => {
      if (ports.image === undefined) throw new Error("no image provider in this test");
      return ports.image;
    },
    list: () => Promise.resolve([]),
  };
  return {
    registry,
    clock: deps.clock,
    log: deps.log ?? { write: () => {} },
    ...(deps.meter === undefined ? {} : { meter: deps.meter }),
  };
}
