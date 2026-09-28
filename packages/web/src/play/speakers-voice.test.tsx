import { defaultVoicesSettings } from "@app/slices/voices/model.js";
import { cleanup, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, expect, it } from "vitest";
import { renderRouted, testDeps } from "@/test-app";
import { AudioRail } from "./media-rails";
import { freshForm, type PlayFormState } from "./state";

afterEach(cleanup);

const narrator = { provider: "inworld", model: "inworld-tts-2", voice: "Ashley" };

function mount(intro: string) {
  const seen: { form?: PlayFormState } = {};
  function Subject() {
    const base = defaultVoicesSettings("audiobook");
    const [form, setForm] = useState<PlayFormState>({
      ...freshForm,
      intro,
      audio: { ...freshForm.audio, provider: "elevenlabs", model: "v3", voice: "someone-else" },
      voices: {
        ...base,
        speakers: base.speakers.map((speaker, index) =>
          index === 0 ? { ...speaker, voice: narrator } : speaker,
        ),
      },
    });
    seen.form = form;
    return (
      <AudioRail
        form={form}
        update={(patch) => setForm((old) => ({ ...old, ...patch }))}
        prompts={[]}
        voices={[]}
        providers={[]}
        silenceGapSeconds={0}
        problem={() => undefined}
        onPickFiles={() => {}}
        onRemoveFile={() => {}}
      />
    );
  }
  renderRouted(<Subject />, testDeps({}));
  return seen;
}

it("hides the single voice when each speaker has one and nothing else is read", async () => {
  const seen = mount("");
  await screen.findByText(/Speakers/);
  // Each speaker's own Voice stays; the single one above them goes.
  expect(document.querySelector("[data-play-field='audio.voice']")).toBeNull();
  expect(document.querySelector("[data-play-field='audio.provider']")).toBeNull();
  // The run still records one voice: the first speaker's.
  expect(seen.form?.audio).toMatchObject(narrator);
});

it("shows it as the intro and outro voice when there is an intro to read", async () => {
  mount("Welcome");
  expect(await screen.findByLabelText("Intro and outro voice")).toBeDefined();
  expect(screen.getByText(/This voice reads only the intro and outro/)).toBeDefined();
});
