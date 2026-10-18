import { transact } from "../../kernel/db/tx.js";
import { errorText } from "../../kernel/errors.js";
import { castImageMaxBytes, storeImageBlob } from "../channels/images.js";
import { imageBlob } from "../channels/repo.js";
import { backupMaxImageBytes } from "../storage/backup-format.js";
import { castReferences } from "./artwork.js";
import { pictureSize } from "./picture-size.js";
import { updateDesign } from "./repo.js";
import type { DesignRunnerDeps } from "./runner.js";
import { settleStep, stepById } from "./steps-repo.js";

// The background half of the runner: each "making" step's provider call, at most two at once,
// settled into its step (and made the design's current version when it lands).

export const maxConcurrentDesignCalls = 2;

export const noProviderMessage =
  "No image provider is set up. Add one in Settings → Providers, then press the button again.";

export interface DesignCalls {
  readonly start: (designId: string, stepId: string) => void;
  readonly idle: () => Promise<void>;
}

export function createDesignCalls(deps: DesignRunnerDeps): DesignCalls {
  let running = 0;
  const waiting: (() => void)[] = [];
  const inFlight = new Set<Promise<void>>();
  const slot = async (): Promise<void> => {
    if (running < maxConcurrentDesignCalls) {
      running += 1;
      return;
    }
    await new Promise<void>((resolve) => waiting.push(resolve));
  };
  const release = (): void => {
    const next = waiting.shift();
    if (next === undefined) running -= 1;
    else next();
  };

  const finish = (
    designId: string,
    stepId: string,
    outcome: Parameters<typeof settleStep>[2],
  ): void => {
    const at = deps.clock.now().toISOString();
    transact(deps.db, () => {
      if (settleStep(deps.db, stepId, outcome, at) && outcome.state === "ready")
        updateDesign(deps.db, designId, undefined, { headStepId: stepId }, at);
    });
    try {
      deps.emit?.({ kind: "design.changed", designId });
    } catch (error) {
      deps.log.write("warn", "designs.emit", { detail: errorText(error) });
    }
  };

  const call = async (designId: string, stepId: string): Promise<void> => {
    await slot();
    try {
      const step = stepById(deps.db, stepId);
      const generate = deps.generate;
      if (
        step === undefined ||
        step.state !== "making" ||
        step.provider === null ||
        step.model === null
      )
        return;
      if (generate === undefined) throw new Error(noProviderMessage);
      const cast = castReferences(deps.db, step.inputs.castMemberIds);
      if (!cast.ok) throw new Error(cast.message);
      const parent = step.parentId === null ? undefined : stepById(deps.db, step.parentId);
      const source =
        parent === undefined || parent.sha256 === null
          ? undefined
          : imageBlob(deps.db, parent.sha256);
      if (step.kind === "edit" && source === undefined)
        throw new Error(
          "The version this edit starts from is no longer kept. Continue from another version, then press Edit.",
        );
      const sent =
        source === undefined || source.bytes.byteLength <= castImageMaxBytes
          ? source
          : await shrunk(source.bytes);
      const image = await generate({
        designId,
        purpose: step.kind === "edit" ? "picture-edit" : "design-art",
        provider: step.provider,
        model: step.model,
        prompt: step.inputs.prompt ?? step.instruction ?? "",
        aspect: step.inputs.aspect ?? "1:1",
        ...(sent === undefined || step.kind !== "edit" ? {} : { edit: { source: sent } }),
        ...(cast.value.length === 0 ? {} : { cast: cast.value }),
      });
      const size = pictureSize(image.bytes);
      if (size === undefined || image.bytes.byteLength > backupMaxImageBytes)
        throw new Error(
          "The provider answered with something that is not a usable PNG or JPEG picture.",
        );
      const sha256 = storeImageBlob(
        deps.db,
        image.bytes,
        image.mime,
        deps.clock.now().toISOString(),
      );
      finish(designId, stepId, { state: "ready", sha256, ...size });
    } catch (error) {
      const reason = errorText(error).slice(0, 500);
      deps.log.write("warn", "designs.picture.failed", {
        detail: `${designId}/${stepId}: ${reason}`,
      });
      finish(designId, stepId, {
        state: "failed",
        error: `The picture couldn't be made: ${reason} Press Try again, or choose another image model under Made with … · change.`,
      });
    } finally {
      release();
    }
  };

  const shrunk = async (bytes: Uint8Array): Promise<{ bytes: Uint8Array; mime: "image/jpeg" }> => {
    if (deps.shrink === undefined)
      throw new Error("The picture is too large to send to the provider.");
    return { bytes: await deps.shrink(bytes), mime: "image/jpeg" };
  };

  const start = (designId: string, stepId: string): void => {
    const job = call(designId, stepId);
    inFlight.add(job);
    void job.finally(() => inFlight.delete(job));
  };

  return {
    start,
    idle: async () => {
      while (inFlight.size > 0) await Promise.allSettled([...inFlight]);
    },
  };
}
