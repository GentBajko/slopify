import type { ProviderStatus, Voice } from "@app/slices/settings/model.js";
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Answer } from "@/test-app";
import { emptyAnswer, jsonAnswer, problemAnswer, renderRouted, testDeps } from "@/test-app";
import { Voices } from "./voices.js";

afterEach(cleanup);

const tts: readonly ProviderStatus[] = [
  {
    id: "elevenlabs",
    family: "tts",
    displayName: "ElevenLabs",
    readiness: { kind: "keyed", hasKey: true },
  },
  {
    id: "cartesia",
    family: "tts",
    displayName: "Cartesia",
    readiness: { kind: "keyed", hasKey: false },
  },
];

const narrator: Voice = {
  id: "v1",
  provider: "elevenlabs",
  name: "Narrator M",
  voiceId: "abc123",
};

function deps(voices: readonly Voice[], extra: Readonly<Record<string, Answer>> = {}) {
  return testDeps({
    "GET /api/providers": jsonAnswer({ providers: tts }),
    "GET /api/settings/voices": jsonAnswer({ voices }),
    ...extra,
  });
}

describe("the voice list", () => {
  it("teaches what a voice is for when the list is empty", async () => {
    renderRouted(<Voices />, deps([]));
    expect(
      await screen.findByText("No voices yet. Add one below: narration reads your script in it."),
    ).not.toBeNull();
  });

  it("lists each voice with its service, its ID, whether it can speak, and Listen", async () => {
    renderRouted(<Voices />, deps([narrator]));
    const row = await screen.findByRole("row", { name: /Narrator M/ });
    expect(within(row).getByText("ElevenLabs")).not.toBeNull();
    expect(within(row).getByText("abc123")).not.toBeNull();
    expect(within(row).getByText("Ready")).not.toBeNull();
    expect(within(row).getByRole("button", { name: "Listen to Narrator M" })).not.toBeNull();
    expect(
      screen.queryByText("No voices yet. Add one below: narration reads your script in it."),
    ).toBeNull();
    // Where pronunciation is set, from the page that holds the voices.
    expect(screen.getByRole("link", { name: "Pronunciation" }).getAttribute("href")).toBe(
      "/narration-aliases",
    );
  });

  it("says which service has no key yet, with its key one press away, and offers no Listen", async () => {
    const quiet: Voice = { id: "v2", provider: "cartesia", name: "Calm", voiceId: "c-1" };
    renderRouted(<Voices />, deps([narrator, quiet]));
    expect(
      await screen.findByText("Cartesia has no key yet, so its voice can't narrate."),
    ).not.toBeNull();
    expect(screen.getByRole("link", { name: "Add a Cartesia key" }).getAttribute("href")).toBe(
      "/settings?section=providers&family=tts&provider=cartesia",
    );
    const row = screen.getByRole("row", { name: /Calm/ });
    expect(within(row).getByText("No key")).not.toBeNull();
    expect(within(row).queryByRole("button", { name: /^Listen/ })).toBeNull();
  });

  it("plays one sentence in a saved voice through its service's first model", async () => {
    const user = userEvent.setup();
    let auditioned: unknown;
    const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
    try {
      renderRouted(
        <Voices />,
        deps([narrator], {
          "GET /api/providers/elevenlabs/models": jsonAnswer({
            models: [{ id: "eleven_multilingual_v2", name: "Multilingual v2" }],
            allowsCustom: false,
          }),
          "POST /api/auditions": async (request) => {
            auditioned = await request.json();
            return new Response(new Blob(["mp3"]), { status: 200 });
          },
        }),
      );
      await user.click(await screen.findByRole("button", { name: "Listen to Narrator M" }));
      await waitFor(() => {
        expect(auditioned).toMatchObject({
          provider: "elevenlabs",
          model: "eleven_multilingual_v2",
          voice: "abc123",
          confirmed: true,
        });
      });
    } finally {
      play.mockRestore();
    }
  });

  it("marks a voice as imitating a real person with its own switch", async () => {
    const user = userEvent.setup();
    const sent: unknown[] = [];
    let voices: readonly Voice[] = [narrator];
    renderRouted(
      <Voices />,
      deps([], {
        "GET /api/settings/voices": (request) => jsonAnswer({ voices })(request),
        "PUT /api/settings/voices/v1/real-person": async (request) => {
          sent.push(await request.json());
          voices = [{ ...narrator, imitatesRealPerson: true }];
          return emptyAnswer()(request);
        },
      }),
    );
    const toggle = await screen.findByRole("switch", {
      name: "Narrator M sounds like a real person",
    });
    expect(toggle.getAttribute("aria-checked")).toBe("false");
    await user.click(toggle);
    await waitFor(() => {
      expect(toggle.getAttribute("aria-checked")).toBe("true");
    });
    expect(sent).toEqual([{ imitatesRealPerson: true }]);
  });

  it("names the problem when the list cannot be read", async () => {
    renderRouted(
      <Voices />,
      deps([], { "GET /api/settings/voices": problemAnswer("The database is locked.", 500) }),
    );
    expect(await screen.findByText("The database is locked.")).not.toBeNull();
  });

  it("adds a voice and empties the form", async () => {
    const user = userEvent.setup();
    let posted: unknown;
    renderRouted(
      <Voices />,
      deps([], {
        "POST /api/settings/voices": async (request) => {
          posted = await request.json();
          return jsonAnswer(narrator, 201)(request);
        },
      }),
    );

    const name = await screen.findByLabelText("Name");
    await user.type(name, "Narrator M");
    await user.type(screen.getByLabelText("Voice ID"), "abc123");
    await user.click(screen.getByRole("button", { name: "Add voice" }));

    await waitFor(() => {
      expect(posted).toEqual({ provider: "elevenlabs", name: "Narrator M", voiceId: "abc123" });
    });
    await waitFor(() => {
      expect((name as HTMLInputElement).value).toBe("");
    });
  });

  it("adds a voice on Enter and reads the typed language codes back by name", async () => {
    const user = userEvent.setup();
    let posted: unknown;
    renderRouted(
      <Voices />,
      deps([], {
        "POST /api/settings/voices": async (request) => {
          posted = await request.json();
          return jsonAnswer(narrator, 201)(request);
        },
      }),
    );
    const name = await screen.findByLabelText("Name");
    await user.type(name, "Narrator M");
    await user.type(screen.getByLabelText("Voice ID"), "abc123");
    await user.type(screen.getByLabelText("Languages it speaks (optional)"), "es, xx");
    expect(
      screen.getByText(/Reads as: Spanish\. Not a language code Slopify knows: xx/),
    ).not.toBeNull();
    await user.clear(screen.getByLabelText("Languages it speaks (optional)"));
    await user.type(screen.getByLabelText("Languages it speaks (optional)"), "de{Enter}");
    await waitFor(() => {
      expect(posted).toEqual({
        provider: "elevenlabs",
        name: "Narrator M",
        voiceId: "abc123",
        languages: ["de"],
      });
    });
  });

  // The conflict is with a row that already exists, so the sentence goes
  // under the field that holds the duplicate and Add stops until it changes.
  it("marks a duplicate voice ID on its own field and holds Add", async () => {
    const user = userEvent.setup();
    renderRouted(
      <Voices />,
      deps([narrator], {
        "POST /api/settings/voices": problemAnswer(
          "This voice ID is already listed for this provider.",
          409,
        ),
      }),
    );

    const voiceId = await screen.findByLabelText("Voice ID");
    await user.type(screen.getByLabelText("Name"), "Narrator F");
    await user.type(voiceId, "abc123");
    await user.click(screen.getByRole("button", { name: "Add voice" }));

    expect(
      await screen.findByText("This voice ID is already listed for this provider."),
    ).not.toBeNull();
    expect(voiceId.getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByRole("button", { name: "Add voice" }).hasAttribute("disabled")).toBe(true);

    await user.type(voiceId, "4");
    expect(screen.queryByText("This voice ID is already listed for this provider.")).toBeNull();
    expect(screen.getByRole("button", { name: "Add voice" }).hasAttribute("disabled")).toBe(false);
  });

  it("marks a refused name on the name field", async () => {
    const user = userEvent.setup();
    renderRouted(
      <Voices />,
      deps([], {
        "POST /api/settings/voices": () =>
          new Response(
            JSON.stringify({
              title: "Bad Request",
              status: 400,
              detail: "This voice cannot be added; the listed fields need attention.",
              fields: [{ field: "name", message: "A voice name is required." }],
            }),
            { status: 400, headers: { "content-type": "application/problem+json" } },
          ),
      }),
    );

    const name = await screen.findByLabelText("Name");
    await user.type(name, " ");
    await user.type(screen.getByLabelText("Voice ID"), "abc123");
    await user.click(screen.getByRole("button", { name: "Add voice" }));

    expect(await screen.findByText("A voice name is required.")).not.toBeNull();
    expect(name.getAttribute("aria-invalid")).toBe("true");
  });

  it("names a failure no field owns", async () => {
    const user = userEvent.setup();
    renderRouted(
      <Voices />,
      deps([], {
        "POST /api/settings/voices": problemAnswer("The database is locked.", 500),
      }),
    );

    await user.type(await screen.findByLabelText("Name"), "Narrator M");
    await user.type(screen.getByLabelText("Voice ID"), "abc123");
    await user.click(screen.getByRole("button", { name: "Add voice" }));
    expect(await screen.findByText("The database is locked.")).not.toBeNull();
  });

  it("names the problem when a removal is refused", async () => {
    const user = userEvent.setup();
    renderRouted(
      <Voices />,
      deps([narrator], {
        "DELETE /api/settings/voices/v1": problemAnswer("No voice has that id.", 404),
      }),
    );

    await user.click(await screen.findByRole("button", { name: "Remove Narrator M" }));
    await user.click(
      within(await screen.findByRole("dialog")).getByRole("button", { name: "Remove voice" }),
    );
    expect(await screen.findByText("No voice has that id.")).not.toBeNull();
  });

  it("confirms before removing a voice", async () => {
    const user = userEvent.setup();
    let deleted = 0;
    renderRouted(
      <Voices />,
      deps([narrator], {
        "DELETE /api/settings/voices/v1": (request) => {
          deleted += 1;
          return emptyAnswer()(request);
        },
      }),
    );

    await user.click(await screen.findByRole("button", { name: "Remove Narrator M" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/Remove Narrator M\?/)).not.toBeNull();

    await user.click(within(dialog).getByRole("button", { name: "Keep it" }));
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
    expect(deleted).toBe(0);

    await user.click(screen.getByRole("button", { name: "Remove Narrator M" }));
    await user.click(
      within(await screen.findByRole("dialog")).getByRole("button", { name: "Remove voice" }),
    );
    await waitFor(() => {
      expect(deleted).toBe(1);
    });
  });

  it("offers the computer's own voices for the system voice, and names the one picked", async () => {
    const user = userEvent.setup();
    let posted: unknown;
    let auditioned: unknown;
    renderRouted(
      <Voices />,
      testDeps({
        "GET /api/providers": jsonAnswer({
          providers: [
            ...tts,
            {
              id: "system-voice",
              family: "tts",
              displayName: "System voice",
              readiness: { kind: "local", available: true, engine: "eSpeak NG" },
            },
          ],
        }),
        "GET /api/settings/voices": jsonAnswer({ voices: [] }),
        "GET /api/providers/system-voice/voices": jsonAnswer({
          engines: [
            {
              id: "espeak-ng",
              name: "eSpeak NG",
              voices: [{ id: "en-us", name: "English (America)", language: "en-us" }],
              defaultVoice: "en-us",
            },
          ],
          issue: null,
        }),
        "POST /api/settings/voices": async (request) => {
          posted = await request.json();
          return jsonAnswer(narrator, 201)(request);
        },
        "POST /api/auditions": async (request) => {
          auditioned = await request.json();
          return new Response(new Blob(["mp3"]), { status: 200 });
        },
      }),
    );
    await screen.findByRole("option", { name: "System voice" });
    await user.selectOptions(screen.getByLabelText("Voice service"), "system-voice");
    await user.selectOptions(
      await screen.findByRole("combobox", { name: "Voice" }),
      await screen.findByRole("option", { name: "English (America) (en-us)" }),
    );
    expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe("English (America)");
    // Listen speaks a sample in the picked voice before it is added.
    await user.click(screen.getByRole("button", { name: "Listen" }));
    await waitFor(() => {
      expect(auditioned).toMatchObject({
        provider: "system-voice",
        model: "espeak-ng",
        voice: "en-us",
        confirmed: true,
      });
    });
    await user.click(screen.getByRole("button", { name: "Add voice" }));
    await waitFor(() => {
      expect(posted).toEqual({
        provider: "system-voice",
        name: "English (America)",
        voiceId: "en-us",
        languages: ["en"],
      });
    });
  });

  it("picks an OpenAI voice by name, or takes the ID of one of your own", async () => {
    const user = userEvent.setup();
    let posted: unknown;
    renderRouted(
      <Voices />,
      testDeps({
        "GET /api/providers": jsonAnswer({
          providers: [
            { ...tts[1], readiness: { kind: "keyed", hasKey: false } },
            {
              id: "openai-tts",
              family: "tts",
              displayName: "OpenAI",
              readiness: { kind: "keyed", hasKey: true },
            },
          ],
        }),
        "GET /api/settings/voices": jsonAnswer({ voices: [] }),
        "POST /api/settings/voices": async (request) => {
          posted = await request.json();
          return jsonAnswer(narrator, 201)(request);
        },
      }),
    );
    // The first service with a key is picked, not the first in the list.
    const service = (await screen.findByLabelText("Voice service")) as HTMLSelectElement;
    await waitFor(() => expect(service.value).toBe("openai-tts"));
    expect(screen.getByRole("option", { name: "Cartesia (no key)" })).not.toBeNull();
    const voice = screen.getByRole("combobox", { name: "Voice" });
    await user.selectOptions(voice, "fable");
    expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe("fable");
    await user.selectOptions(voice, "A voice of my own (paste its ID)");
    const id = screen.getByLabelText("Voice ID");
    expect(screen.getByText(/starts with voice_/)).not.toBeNull();
    await user.type(id, "voice_123");
    await user.click(screen.getByRole("button", { name: "Add voice" }));
    await waitFor(() => {
      expect(posted).toEqual({ provider: "openai-tts", name: "fable", voiceId: "voice_123" });
    });
  });

  it("with no service able to speak, starts Add a voice on the service the saved voices use", async () => {
    renderRouted(
      <Voices />,
      testDeps({
        "GET /api/providers": jsonAnswer({
          providers: [
            { ...tts[1], readiness: { kind: "keyed", hasKey: false } },
            {
              id: "openai-tts",
              family: "tts",
              displayName: "OpenAI",
              readiness: { kind: "keyed", hasKey: false },
            },
          ],
        }),
        "GET /api/settings/voices": jsonAnswer({
          voices: [{ id: "v1", provider: "openai-tts", name: "Storyteller", voiceId: "fable" }],
        }),
      }),
    );
    const service = (await screen.findByLabelText("Voice service")) as HTMLSelectElement;
    await waitFor(() => expect(service.value).toBe("openai-tts"));
  });

  it("says where an ElevenLabs voice ID comes from, and that a keyless service can't narrate yet", async () => {
    const user = userEvent.setup();
    renderRouted(<Voices />, deps([]));
    expect(
      (await screen.findByRole("link", { name: "ElevenLabs voice library" })).getAttribute("href"),
    ).toBe("https://elevenlabs.io/app/voice-library");
    await user.selectOptions(screen.getByLabelText("Voice service"), "cartesia");
    expect(screen.getByRole("link", { name: "Cartesia voice library" })).not.toBeNull();
    expect(
      screen.getByText(/Cartesia has no key yet: you can add the voice now, but it can't narrate/),
    ).not.toBeNull();
    expect(screen.getByRole("link", { name: "Add a Cartesia key" })).not.toBeNull();
  });

  it("offers a missing key once, keeps the way back on it, and says a system voice is not installed", async () => {
    renderRouted(
      <Voices back={{ to: "welcome", step: "found" }} />,
      testDeps({
        "GET /api/providers": jsonAnswer({
          providers: [
            {
              id: "openai-tts",
              family: "tts",
              displayName: "OpenAI",
              readiness: { kind: "keyed", hasKey: false },
            },
            {
              id: "system-voice",
              family: "tts",
              displayName: "System voice",
              readiness: { kind: "local", available: false },
            },
          ],
        }),
        "GET /api/settings/voices": jsonAnswer({
          voices: [{ id: "v1", provider: "openai-tts", name: "Storyteller", voiceId: "fable" }],
        }),
      }),
    );
    expect(
      await screen.findByText("OpenAI has no key yet, so its voice can't narrate."),
    ).not.toBeNull();
    // Add a voice starts on OpenAI too, and says it can't narrate, without a second button.
    expect(screen.getByText(/OpenAI has no key yet: you can add the voice now/)).not.toBeNull();
    const links = screen.getAllByRole("link", { name: "Add an OpenAI key" });
    expect(links).toHaveLength(1);
    expect(links[0]?.getAttribute("href")).toBe(
      "/settings?section=providers&family=tts&provider=openai-tts&return=welcome&step=found",
    );
    expect(screen.getByRole("option", { name: "System voice (not installed)" })).not.toBeNull();
  });
});
