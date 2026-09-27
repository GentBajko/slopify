import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import {
  notificationUrlMax,
  notificationUrlProblem,
  testNotice,
  webhookBody,
} from "../../slices/notifications/rules.js";
import { createNotificationSender, sendFailureText } from "../../slices/notifications/send.js";
import { readNotificationUrl, saveNotificationUrl } from "../../slices/notifications/settings.js";
import { appearances, providerIds } from "../../slices/settings/model.js";
import type { PlaybackDeps } from "../../slices/settings/playback.js";
import { readSettings, saveSettings } from "../../slices/settings/playback.js";
import type { AddVoiceReason, VoicesDeps } from "../../slices/settings/voices.js";
import {
  addVoice,
  removeVoice,
  setVoiceImitatesRealPerson,
  setVoiceLanguages,
  voiceIdMax,
  voiceNameMax,
  voices,
} from "../../slices/settings/voices.js";
import { readChannelLinks, writeChannelLinks } from "../../slices/youtube/edits-repo.js";
import {
  channelLinkNameMax,
  channelLinksMax,
  channelLinksProblem,
  channelLinkUrlMax,
} from "../../slices/youtube/placeholders.js";
import type { AppDeps } from "./app.js";
import { onInvalid, problem, titleOf } from "./problem.js";

const idParam = z.object({ id: z.string().min(1).max(64) });
// Shape only. The rules - trimming, emptiness, length, the provider speaking at all -
// are the slice's, so one set of messages reaches the form.
const voiceBody = z.object({
  provider: z.enum(providerIds),
  name: z.string(),
  voiceId: z.string(),
  languages: z.array(z.string().max(20)).max(60).optional(),
});
const voiceLanguagesBody = z.object({ languages: z.array(z.string().max(20)).max(60) });
const voiceRealPersonBody = z.object({ imitatesRealPerson: z.boolean() });
// Length and scheme are the slice's rules, so their sentences reach the field; this bound only
// keeps a pasted novel off the parser.
const notificationBody = z.object({ url: z.string().max(notificationUrlMax * 2) });
// Shape and a generous bound only; `channelLinksProblem` says what is wrong in Settings' words.
export const channelLinksBody = z.object({
  links: z
    .array(
      z.object({
        name: z.string().max(channelLinkNameMax * 4),
        url: z.string().max(channelLinkUrlMax * 2),
      }),
    )
    .max(channelLinksMax * 2),
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
  const send = deps.sendNotification ?? createNotificationSender(globalThis.fetch);

  return (
    new Hono()
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
      // The named links `{{Name}}` placeholders in YouTube descriptions fill from
      // (`slices/youtube/placeholders.ts`).
      .get("/channel-links", (c) => c.json({ links: readChannelLinks(deps.db) }))
      .put("/channel-links", zValidator("json", channelLinksBody, onInvalid), (c) => {
        const { links } = c.req.valid("json");
        const refused = channelLinksProblem(links);
        if (refused !== undefined)
          return problem(c, {
            status: 400,
            title: titleOf(400),
            detail: `The channel links weren't saved: ${refused} Then press Save in Settings → Channel links.`,
          });
        writeChannelLinks(deps.db, links);
        return c.json({ links: readChannelLinks(deps.db) });
      })
      .get("/notifications", (c) => c.json({ url: readNotificationUrl(deps.db) }))
      .put("/notifications", zValidator("json", notificationBody, onInvalid), (c) => {
        const result = saveNotificationUrl(deps.db, c.req.valid("json").url);
        if (!result.ok) {
          return problem(c, {
            status: 400,
            title: titleOf(400),
            detail: `The Notification URL wasn't saved: ${result.message} Fix it in Settings → Notifications → Notification URL, then press Save.`,
            extensions: { fields: [{ field: "url", message: result.message }] },
          });
        }
        return c.json({ url: result.url });
      })
      .post("/notifications/test", zValidator("json", notificationBody, onInvalid), async (c) => {
        const url = c.req.valid("json").url.trim();
        const invalid =
          url === ""
            ? "Enter a Notification URL first, for example https://ntfy.sh/your-topic."
            : notificationUrlProblem(url);
        if (invalid !== undefined) {
          return problem(c, {
            status: 400,
            title: titleOf(400),
            detail: `The test notification wasn't sent: ${invalid}`,
            extensions: { fields: [{ field: "url", message: invalid }] },
          });
        }
        const result = await send(url, webhookBody(testNotice));
        if (!result.ok) {
          deps.log.write("warn", "notification.test", { detail: sendFailureText(result) });
          return problem(c, {
            status: 502,
            title: titleOf(502),
            detail: `The test notification wasn't delivered: ${sendFailureText(result)}. Check the address in Settings → Notifications → Notification URL (for ntfy, https://ntfy.sh/your-topic), then press Send test notification again.`,
          });
        }
        return c.json({ sent: true });
      })
      .get("/voices", (c) => c.json({ voices: voices(voiceDeps) }))
      .post("/voices", zValidator("json", voiceBody, onInvalid), async (c) => {
        const body = c.req.valid("json");
        // Languages left blank are asked of the provider, when it says; no answer is unknown.
        const languages =
          body.languages !== undefined && body.languages.length > 0
            ? body.languages
            : await deps.voiceLanguages?.(body.provider, body.voiceId.trim(), c.req.raw.signal);
        const result = addVoice(voiceDeps, {
          ...body,
          ...(languages === undefined ? {} : { languages }),
        });
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
      .put(
        "/voices/:id/languages",
        zValidator("param", idParam, onInvalid),
        zValidator("json", voiceLanguagesBody, onInvalid),
        (c) => {
          const result = setVoiceLanguages(
            voiceDeps,
            c.req.valid("param").id,
            c.req.valid("json").languages,
          );
          if (result.ok) return c.body(null, 204);
          return result.reason === "missing"
            ? problem(c, {
                status: 404,
                title: titleOf(404),
                detail:
                  "This voice no longer exists; it may have been deleted. Reload Settings → Voices to see your voices.",
              })
            : problem(c, {
                status: 400,
                title: titleOf(400),
                detail: "The languages weren't saved. Fix the highlighted field and try again.",
                extensions: { fields: [fieldOf("unknown-language")] },
              });
        },
      )
      // "Imitates a real person": the voice's narration answers Yes to YouTube's AI use.
      .put(
        "/voices/:id/real-person",
        zValidator("param", idParam, onInvalid),
        zValidator("json", voiceRealPersonBody, onInvalid),
        (c) => {
          const result = setVoiceImitatesRealPerson(
            voiceDeps,
            c.req.valid("param").id,
            c.req.valid("json").imitatesRealPerson,
          );
          return result.ok
            ? c.body(null, 204)
            : problem(c, {
                status: 404,
                title: titleOf(404),
                detail:
                  "This voice no longer exists; it may have been deleted. Reload Settings → Voices to see your voices.",
              });
        },
      )
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
      })
  );
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
    case "unknown-language":
      return {
        field: "languages",
        message:
          "Enter language codes separated by commas, such as es, de or pt, or leave it blank to ask the provider.",
      };
    case "not-a-tts-provider":
      return {
        field: "provider",
        message: "Choose a text-to-speech provider, such as Inworld or Cartesia.",
      };
  }
}
