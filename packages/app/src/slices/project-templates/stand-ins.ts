import type { PlayDraftForm } from "../play-drafts/schema.js";
import { isSampleStandIn } from "../settings/model.js";

type Choices = Pick<PlayDraftForm, "llm" | "audio" | "images" | "voices">;

// A template made from a bundled sample asks for the person's own providers: the samples'
// stand-ins can't run anything new, so their choices are left blank, the same as a template
// nobody has picked a provider in (Play then offers the providers this computer has).
export function withoutSampleStandIns<T extends Choices>(form: T): T {
  const blankVoice = { provider: "", model: "", voice: "" };
  const voices = form.voices;
  return {
    ...form,
    llm: isSampleStandIn(form.llm.provider) ? { provider: "", model: "" } : form.llm,
    audio: isSampleStandIn(form.audio.provider) ? { ...form.audio, ...blankVoice } : form.audio,
    images: isSampleStandIn(form.images.provider) ? { provider: "", model: "" } : form.images,
    ...(voices === undefined
      ? {}
      : {
          voices: {
            ...voices,
            speakers: voices.speakers.map((speaker) =>
              isSampleStandIn(speaker.voice.provider) ? { ...speaker, voice: blankVoice } : speaker,
            ),
          },
        }),
  };
}
