import type { ProviderStatus, Voice } from "@app/slices/settings/model.js";
import type { VoicesSettings } from "@app/slices/voices/model.js";
import { cleanup, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { type ReactElement, useState } from "react";
import { afterEach, beforeAll, expect, it, vi } from "vitest";
import { jsonAnswer, renderRouted, testDeps, testVersion } from "@/test-app";
import { ScriptView } from "./script-view";
import { SpeakersEditor } from "./speakers-editor";

afterEach(cleanup);
beforeAll(() => {
  // jsdom has no media playback; the audition only needs play() to exist.
  vi.spyOn(window.HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
  URL.createObjectURL = () => "blob:audition";
  URL.revokeObjectURL = () => {};
});

const providers: readonly ProviderStatus[] = [
  {
    id: "openai-tts",
    family: "tts",
    displayName: "OpenAI",
    readiness: { kind: "keyed", hasKey: true },
  },
];
const voices: readonly Voice[] = [
  { id: "1", provider: "openai-tts", voiceId: "alloy", name: "Alloy" },
  { id: "2", provider: "openai-tts", voiceId: "echo", name: "Echo" },
];

function Subject({ initial }: { readonly initial?: VoicesSettings }): ReactElement {
  const [value, setValue] = useState<VoicesSettings | undefined>(initial);
  return (
    <>
      <SpeakersEditor
        value={value}
        onChange={setValue}
        providers={providers}
        voices={voices}
        script={"Alex: Welcome to the show, everyone.\n\nSam: Thanks for having me."}
      />
      <output aria-label="Saved voices">{JSON.stringify(value ?? null)}</output>
    </>
  );
}
const saved = () =>
  JSON.parse(screen.getByLabelText("Saved voices").textContent ?? "null") as VoicesSettings | null;

it("starts a podcast with two hosts and goes back to Narration by removing the settings", async () => {
  const user = userEvent.setup();
  renderRouted(<Subject />, testDeps({}));
  await user.selectOptions(await screen.findByLabelText("Format"), "podcast");
  expect(saved()?.speakers.map((speaker) => [speaker.name, speaker.role])).toEqual([
    ["Alex", "host"],
    ["Sam", "host"],
  ]);
  await user.click(screen.getByRole("button", { name: "Add speaker" }));
  expect(saved()?.speakers).toHaveLength(3);
  await user.click(screen.getByRole("button", { name: "Remove Speaker 3" }));
  expect(saved()?.speakers).toHaveLength(2);
  await user.selectOptions(screen.getByLabelText("Format"), "");
  expect(saved()).toBeNull();
});

it("prices the audition, then speaks the speaker's first line only on the click", async () => {
  const user = userEvent.setup();
  const spoken: unknown[] = [];
  const deps = testDeps({
    "GET /api/providers/openai-tts/models": jsonAnswer({
      models: [{ id: "tts-1", name: "TTS 1" }],
      allowsCustom: false,
    }),
    "POST /api/auditions/quote": jsonAnswer({
      estimate: { currency: "USD", rows: [], low: 0.0004, high: 0.0004, unknown: 0 },
    }),
    "POST /api/auditions": async (request) => {
      spoken.push(await request.json());
      return new Response(new Uint8Array([0xff, 0xfb]), {
        headers: { "content-type": "audio/mpeg", "X-Slopify-Version": testVersion },
      });
    },
  });
  renderRouted(
    <Subject
      initial={{
        format: "podcast",
        source: "script",
        speakers: [
          {
            id: "a",
            name: "Alex",
            role: "host",
            voice: { provider: "openai-tts", model: "tts-1", voice: "alloy" },
          },
          {
            id: "s",
            name: "Sam",
            role: "host",
            voice: { provider: "openai-tts", model: "", voice: "" },
          },
        ],
        turnGapSeconds: 0.35,
        nameTags: true,
        nativeDialogue: true,
        audioFiles: true,
      }}
    />,
    deps,
  );
  const rows = within(await screen.findByRole("list", { name: "Speakers" })).getAllByRole(
    "listitem",
  );
  const [alex, sam] = rows;
  if (alex === undefined || sam === undefined) throw new Error("Two speakers expected");
  expect(within(sam).getByRole("button", { name: /^Audition/ })).toHaveProperty("disabled", true);
  const button = await within(alex).findByRole("button", { name: "Audition · about $0.0004" });
  expect(spoken).toEqual([]);
  await user.click(button);
  expect(await within(alex).findByText("Playing the audition.")).toBeTruthy();
  expect(spoken).toEqual([
    {
      provider: "openai-tts",
      model: "tts-1",
      voice: "alloy",
      text: "Welcome to the show, everyone.",
      confirmed: true,
    },
  ]);
});

it("shows the script turn by turn under each speaker, with its sections", async () => {
  renderRouted(
    <ScriptView
      script={"# One\n\nAlex: Hello.\n\nSam: Hi."}
      voices={{
        format: "podcast",
        source: "script",
        speakers: [
          { id: "a", name: "Alex", role: "host", voice: { provider: "", model: "", voice: "" } },
          { id: "s", name: "Sam", role: "host", voice: { provider: "", model: "", voice: "" } },
        ],
        turnGapSeconds: 0.35,
        nameTags: true,
        nativeDialogue: true,
        audioFiles: true,
      }}
    />,
    testDeps({}),
  );
  const turns = within(await screen.findByRole("list", { name: "Script" })).getAllByRole(
    "listitem",
  );
  expect(turns.map((turn) => turn.textContent)).toEqual(["OneAlexHello.", "SamHi."]);
});
