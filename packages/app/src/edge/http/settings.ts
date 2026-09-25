import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import { appearances, providerIds } from "../../slices/settings/model.js";
import type { PlaybackDeps } from "../../slices/settings/playback.js";
import { readSettings, saveSettings } from "../../slices/settings/playback.js";
import type { AddVoiceReason, VoicesDeps } from "../../slices/settings/voices.js";
import {
  addVoice,
  removeVoice,
  voiceIdMax,
  voiceNameMax,
  voices,
} from "../../slices/settings/voices.js";
import type { AppDeps } from "./app.js";
import { onInvalid, problem, titleOf } from "./problem.js";

const idParam = z.object({ id: z.string().min(1).max(64) });
// Shape only. The rules - trimming, emptiness, length, the provider speaking at all -
// are the slice's, so one set of messages reaches the form.
const voiceBody = z.object({
  provider: z.enum(providerIds),
  name: z.string(),
  voiceId: z.string(),
});
const playbackBody = z.object({
  silenceGapSeconds: z.number(),
  appearance: z.enum(appearances),
});

// The return type is inferred so Hono keeps the route types the SPA's client is
// generated from; see stagingRoutes.
export function settingsRoutes(deps: AppDeps) {
  const playback: PlaybackDeps = { db: deps.db, log: deps.log };
  const voiceDeps: VoicesDeps = { db: deps.db, ids: deps.ids };

  return new Hono()
    .get("/", (c) => c.json(readSettings(playback)))
    .put("/", zValidator("json", playbackBody, onInvalid), (c) => {
      const result = saveSettings(playback, c.req.valid("json"));
      if (!result.ok) {
        return problem(c, {
          status: 400,
          title: titleOf(400),
          detail: "These settings cannot be saved yet. Fix the highlighted fields and try again.",
          extensions: { fields: result.fields },
        });
      }
      return c.json(result.settings);
    })
    .get("/voices", (c) => c.json({ voices: voices(voiceDeps) }))
    .post("/voices", zValidator("json", voiceBody, onInvalid), (c) => {
      const result = addVoice(voiceDeps, c.req.valid("json"));
      if (!result.ok) {
        // A voice ID already listed for its provider is a conflict with
        // a row that exists, which the form shows under the Voice ID input.
        return result.reason === "duplicate-voice-id"
          ? problem(c, {
              status: 409,
              title: titleOf(409),
              detail:
                "This voice ID is already saved for this provider. Use the existing voice, or enter a different voice ID.",
            })
          : problem(c, {
              status: 400,
              title: titleOf(400),
              detail: "This voice cannot be added yet. Fix the highlighted field and try again.",
              extensions: { fields: [fieldOf(result.reason)] },
            });
      }
      return c.json(result.voice, 201);
    })
    .delete("/voices/:id", zValidator("param", idParam, onInvalid), (c) => {
      if (!removeVoice(voiceDeps, c.req.valid("param").id).ok) {
        return problem(c, {
          status: 404,
          title: titleOf(404),
          detail:
            "This voice no longer exists; it may have been deleted already. Reload the page to see your voices.",
        });
      }
      return c.body(null, 204);
    });
}

function fieldOf(reason: Exclude<AddVoiceReason, "duplicate-voice-id">): {
  field: string;
  message: string;
} {
  switch (reason) {
    case "blank-name":
      return { field: "name", message: "Enter a name for this voice." };
    case "name-too-long":
      return {
        field: "name",
        message: `Keep the voice name to ${String(voiceNameMax)} characters or fewer.`,
      };
    case "blank-voice-id":
      return {
        field: "voiceId",
        message: "Enter the voice ID from your provider's voice library.",
      };
    case "voice-id-too-long":
      return {
        field: "voiceId",
        message: `A voice ID is at most ${String(voiceIdMax)} characters. Check you copied only the ID.`,
      };
    case "not-a-tts-provider":
      return {
        field: "provider",
        message: "Choose a text-to-speech provider, such as Inworld or Cartesia.",
      };
  }
}
