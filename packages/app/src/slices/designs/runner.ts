import type { Catalogue } from "../../catalog/schema.js";
import type { Format } from "../../kernel/pipeline.js";
import type { CastReference, GeneratedImage, ImageEdit } from "../../kernel/ports/image.js";
import { artworkRequest, castReferences } from "./artwork.js";
import { createDesignCalls, noProviderMessage } from "./calls.js";
import type { DesignResult, DesignView } from "./model.js";
import { nearestFormat } from "./picture-size.js";
import { costChanged, costChangedMessage, quoteDesignImage } from "./quote.js";
import { editPictureSchema, makeArtworkSchema, quoteEditSchema } from "./requests.js";
import { type DesignDeps, designView, mutationHash, reusedMessage } from "./service.js";
import {
  insertStep,
  makingSteps,
  restartStep,
  settleStep,
  stepById,
  stepByMutation,
} from "./steps-repo.js";

// Paid pictures of a design: a step is stored as "making" and the call runs in the background
// (at most two at once); the picture lands in the step, or the step fails with what to do.
// `main.ts` builds the generator from `standaloneImage`, so every call goes through the attempt
// wrapper and is metered against the design.

export type DesignImageGenerator = (request: {
  readonly designId: string;
  readonly purpose: "picture-edit" | "design-art";
  readonly provider: string;
  readonly model: string;
  readonly prompt: string;
  readonly aspect: Format;
  readonly edit?: ImageEdit | undefined;
  readonly cast?: readonly CastReference[] | undefined;
}) => Promise<GeneratedImage>;

export interface DesignRunnerDeps extends DesignDeps {
  readonly generate?: DesignImageGenerator | undefined;
  readonly catalogue: () => Catalogue;
  // Makes a picture the provider sent back small enough to send again (a JPEG by ffmpeg).
  readonly shrink?: ((bytes: Uint8Array) => Promise<Uint8Array>) | undefined;
}

export interface DesignRunner {
  readonly quoteEdit: (
    designId: string,
    raw: unknown,
  ) => DesignResult<ReturnType<typeof quoteDesignImage>>;
  readonly quoteArtwork: (designId: string) => DesignResult<ReturnType<typeof quoteDesignImage>>;
  readonly edit: (designId: string, raw: unknown) => DesignResult<DesignView>;
  readonly artwork: (designId: string, raw: unknown) => DesignResult<DesignView>;
  readonly retry: (designId: string, stepId: string) => DesignResult<DesignView>;
  // Steps still "making" when Slopify stopped never land.
  readonly recover: () => number;
  // Resolves once every started call has settled; for tests and shutdown.
  readonly idle: () => Promise<void>;
}

const stoppedMessage = "Slopify stopped while this picture was being made. Press Try again.";
const noProvider = {
  ok: false,
  reason: "no-image-provider",
  message: noProviderMessage,
} as const;
const notFound = {
  ok: false,
  reason: "not-found",
  message: "This design no longer exists. Open Library → Designs to choose another.",
} as const;

export function createDesignRunner(deps: DesignRunnerDeps): DesignRunner {
  const calls = createDesignCalls(deps);
  const start = calls.start;
  const view = (designId: string): DesignResult<DesignView> => {
    const value = designView(deps.db, designId);
    return value === undefined ? notFound : { ok: true, value };
  };

  return {
    quoteEdit: (designId, raw) => {
      const parsed = quoteEditSchema.safeParse(raw);
      if (!parsed.success)
        return { ok: false, reason: "invalid", message: "Choose an image model to quote." };
      if (designView(deps.db, designId) === undefined) return notFound;
      return {
        ok: true,
        value: quoteDesignImage(deps.catalogue(), {
          ...parsed.data,
          purpose: "picture-edit",
          sendsPictures: true,
        }),
      };
    },
    quoteArtwork: (designId) => {
      const design = designView(deps.db, designId);
      if (design === undefined) return notFound;
      const request = artworkRequest(design.document, design.values);
      if (!request.ok) return request;
      return {
        ok: true,
        value: quoteDesignImage(deps.catalogue(), {
          ...request.value,
          purpose: "design-art",
          sendsPictures: request.value.castMemberIds.length > 0,
        }),
      };
    },
    edit: (designId, raw) => {
      const parsed = editPictureSchema.safeParse(raw);
      if (!parsed.success)
        return {
          ok: false,
          reason: "invalid",
          message: "Write what to change (at most 4,000 characters), then press Edit.",
        };
      const input = parsed.data;
      const { mutationId, acknowledgedHigh: _shown, ...asked } = input;
      const replay = stepByMutation(deps.db, mutationId);
      if (replay !== undefined)
        return replay.hash === mutationHash(asked) && replay.step.designId === designId
          ? view(designId)
          : { ok: false, reason: "mutation-reused", message: reusedMessage };
      if (designView(deps.db, designId) === undefined) return notFound;
      const from = stepById(deps.db, input.fromStepId);
      if (
        from === undefined ||
        from.designId !== designId ||
        from.state !== "ready" ||
        from.width === null ||
        from.height === null
      )
        return {
          ok: false,
          reason: "not-ready",
          message:
            "The version to edit has no picture yet. Wait for it to finish, or continue from another version.",
        };
      if (deps.generate === undefined) return noProvider;
      const cast = castReferences(deps.db, input.castMemberIds ?? []);
      if (!cast.ok) return cast;
      const quote = quoteDesignImage(deps.catalogue(), {
        ...input,
        purpose: "picture-edit",
        sendsPictures: true,
      });
      if (costChanged(quote, input.acknowledgedHigh))
        return {
          ok: false,
          reason: "cost-changed",
          message: costChangedMessage(quote, "this edit"),
          current: quote,
        };
      const step = insertStep(deps.db, {
        id: deps.ids.next(),
        designId,
        parentId: from.id,
        kind: "edit",
        instruction: input.instruction,
        provider: input.provider,
        model: input.model,
        inputs: {
          castMemberIds: input.castMemberIds ?? [],
          aspect: nearestFormat({ width: from.width, height: from.height }),
          prompt: input.instruction,
        },
        state: "making",
        sha256: null,
        width: null,
        height: null,
        mutationId,
        mutationHash: mutationHash(asked),
        at: deps.clock.now().toISOString(),
      });
      start(designId, step.id);
      return view(designId);
    },
    artwork: (designId, raw) => {
      const parsed = makeArtworkSchema.safeParse(raw);
      if (!parsed.success)
        return {
          ok: false,
          reason: "invalid",
          message: "Press Make again from the design's page.",
        };
      const replay = stepByMutation(deps.db, parsed.data.mutationId);
      if (replay !== undefined)
        return replay.step.designId === designId
          ? view(designId)
          : { ok: false, reason: "mutation-reused", message: reusedMessage };
      const design = designView(deps.db, designId);
      if (design === undefined) return notFound;
      const request = artworkRequest(design.document, design.values);
      if (!request.ok) return request;
      if (deps.generate === undefined) return noProvider;
      const cast = castReferences(deps.db, request.value.castMemberIds);
      if (!cast.ok) return cast;
      const quote = quoteDesignImage(deps.catalogue(), {
        ...request.value,
        purpose: "design-art",
        sendsPictures: request.value.castMemberIds.length > 0,
      });
      if (costChanged(quote, parsed.data.acknowledgedHigh))
        return {
          ok: false,
          reason: "cost-changed",
          message: costChangedMessage(quote, "the artwork"),
          current: quote,
        };
      const step = insertStep(deps.db, {
        id: deps.ids.next(),
        designId,
        parentId: null,
        kind: "generate",
        instruction: null,
        provider: request.value.provider,
        model: request.value.model,
        inputs: {
          castMemberIds: request.value.castMemberIds,
          aspect: request.value.aspect,
          prompt: request.value.prompt,
        },
        state: "making",
        sha256: null,
        width: null,
        height: null,
        mutationId: parsed.data.mutationId,
        mutationHash: mutationHash({ artwork: request.value }),
        at: deps.clock.now().toISOString(),
      });
      start(designId, step.id);
      return view(designId);
    },
    retry: (designId, stepId) => {
      const step = stepById(deps.db, stepId);
      if (
        step === undefined ||
        step.designId !== designId ||
        designView(deps.db, designId) === undefined
      )
        return {
          ok: false,
          reason: "not-found",
          message: "That version is no longer in this design. Reload the page.",
        };
      if (step.state !== "failed")
        return {
          ok: false,
          reason: "busy",
          message: "This version didn't fail, so there is nothing to try again.",
        };
      if (deps.generate === undefined) return noProvider;
      restartStep(deps.db, stepId);
      start(designId, stepId);
      return view(designId);
    },
    recover: () => {
      let settled = 0;
      for (const step of makingSteps(deps.db))
        if (
          settleStep(
            deps.db,
            step.id,
            { state: "failed", error: stoppedMessage },
            deps.clock.now().toISOString(),
          )
        )
          settled += 1;
      return settled;
    },
    idle: calls.idle,
  };
}
