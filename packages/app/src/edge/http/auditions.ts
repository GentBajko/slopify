import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import { isProviderError } from "../../kernel/ports/model.js";
import type { NarratedAudio, TtsCall } from "../../kernel/runner/providers.js";
import type { AttemptResult } from "../../kernel/runner/work.js";
import { estimateRequests } from "../../slices/estimate/index.js";
import { auditionLineMax } from "../../slices/voices/audition.js";
import type { AppDeps } from "./app.js";
import { onInvalid, problem } from "./problem.js";

// Voice auditions: each speaker reads one of their own lines before a run, so a voice can be
// swapped for the price of a sentence. The quote comes first and costs nothing; speaking only
// happens on an explicit request that says it was confirmed.

export type Audition = (
  call: TtsCall,
  signal: AbortSignal,
) => Promise<AttemptResult<NarratedAudio>>;

const line = z.object({
  provider: z.string().min(1).max(100),
  model: z.string().min(1).max(200),
  text: z.string().trim().min(1).max(auditionLineMax),
});
const quoteBody = z.object({
  lines: z
    .array(line.extend({ speaker: z.string().max(100) }))
    .min(1)
    .max(10),
});
const speakBody = line.extend({
  voice: z.string().min(1).max(200),
  // The page sends this only from the Audition button, after showing the price.
  confirmed: z.literal(true),
});

export function auditionRoutes(deps: AppDeps & { readonly audition?: Audition | undefined }) {
  return new Hono()
    .post("/quote", zValidator("json", quoteBody, onInvalid), (c) => {
      const { lines } = c.req.valid("json");
      if (deps.catalogue === undefined) return c.json({ estimate: null });
      const estimate = estimateRequests(
        lines.map((one) => ({
          kind: "tts" as const,
          stage: one.speaker,
          provider: one.provider,
          model: one.model,
          text: one.text,
        })),
        deps.catalogue.read(),
      );
      return c.json({ estimate });
    })
    .post("/", zValidator("json", speakBody, onInvalid), async (c) => {
      const body = c.req.valid("json");
      if (deps.audition === undefined)
        return problem(c, {
          status: 500,
          title: "Internal Server Error",
          detail:
            "Voice auditions aren't available in this build. Start the run and listen to the narration in the project instead.",
        });
      try {
        const spoken = await deps.audition(
          { provider: body.provider, model: body.model, voiceId: body.voice, text: body.text },
          c.req.raw.signal,
        );
        if (!spoken.ok)
          return problem(c, {
            status: 409,
            title: "Conflict",
            detail: "The audition was held back. Try the Audition button again in a moment.",
          });
        return c.body(spoken.value.bytes.slice().buffer, 200, {
          "content-type": "audio/mpeg",
          "cache-control": "no-store",
        });
      } catch (error) {
        if (isProviderError(error))
          return problem(c, {
            status: 502,
            title: "Bad Gateway",
            detail: `The audition couldn't be spoken: ${error.message}`,
          });
        throw error;
      }
    });
}
