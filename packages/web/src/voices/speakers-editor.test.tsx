import type { CastMember } from "@app/slices/channels/model.js";
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

it("adds a cast member with a voice as a speaker, keeping the link to the cast", async () => {
  const user = userEvent.setup();
  const member = (id: string, name: string, kind: CastMember["kind"]): CastMember => ({
    id,
    channelId: "c",
    kind,
    name,
    aliases: [],
    description: "",
    version: 1,
    images: [],
    createdAt: "",
    updatedAt: "",
  });
  const cast: readonly CastMember[] = [
    {
      ...member("0b7c1f2e-0000-4000-8000-000000000001", "Ada", "character"),
      voice: { provider: "openai-tts", model: "tts-1", voice: "echo", pace: 1.1 },
    },
    member("0b7c1f2e-0000-4000-8000-000000000002", "Harbor", "place"),
  ];
  function WithCast(): ReactElement {
    const [value, setValue] = useState<VoicesSettings | undefined>(undefined);
    return (
      <>
        <SpeakersEditor
          value={value}
          onChange={setValue}
          providers={providers}
          voices={voices}
          cast={cast}
        />
        <output aria-label="Saved voices">{JSON.stringify(value ?? null)}</output>
      </>
    );
  }
  renderRouted(<WithCast />, testDeps({}));
  await user.selectOptions(await screen.findByLabelText("Format"), "podcast");
  const picker = screen.getByLabelText("Add from the cast");
  expect(
    within(picker)
      .getAllByRole("option")
      .map((option) => option.textContent),
  ).toEqual(["Pick one of 1", "Ada"]);
  await user.selectOptions(picker, "0b7c1f2e-0000-4000-8000-000000000001");
  expect(saved()?.speakers.at(-1)).toEqual({
    id: "cast-0b7c1f2e",
    name: "Ada",
    role: "host",
    voice: { provider: "openai-tts", model: "tts-1", voice: "echo" },
    pace: 1.1,
    castId: "0b7c1f2e-0000-4000-8000-000000000001",
  });
  expect(screen.getByLabelText<HTMLSelectElement>("Add from the cast").disabled).toBe(true);
});

it("lists each speaker only the voices that speak the project language, with Show all voices", async () => {
  const user = userEvent.setup();
  const multilingual: readonly Voice[] = [
    { id: "1", provider: "openai-tts", voiceId: "alloy", name: "Alloy", languages: ["en"] },
    { id: "2", provider: "openai-tts", voiceId: "echo", name: "Echo", languages: ["de"] },
    // Saved before voices had languages: offered for every language.
    { id: "3", provider: "openai-tts", voiceId: "fable", name: "Fable" },
  ];
  renderRouted(
    <SpeakersEditor
      value={{
        format: "podcast",
        source: "script",
        speakers: [
          {
            id: "a",
            name: "Alex",
            role: "host",
            voice: { provider: "openai-tts", model: "tts-1", voice: "" },
          },
        ],
        turnGapSeconds: 0.35,
        nameTags: true,
        nativeDialogue: true,
        audioFiles: true,
      }}
      onChange={() => {}}
      providers={providers}
      voices={multilingual}
      language="de"
    />,
    testDeps({}),
  );
  const row = within(await screen.findByRole("list", { name: "Speakers" })).getByRole("listitem");
  const names = () =>
    within(within(row).getByLabelText("Voice"))
      .getAllByRole("option")
      .map((option) => option.textContent);
  expect(names()).toEqual(["Pick a voice", "Echo", "Fable"]);
  await user.click(within(row).getByLabelText(/Show all voices/));
  expect(names()).toEqual(["Pick a voice", "Alloy", "Echo", "Fable"]);
});
