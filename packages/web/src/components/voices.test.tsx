import type { ProviderStatus, Voice } from "@app/slices/settings/model.js";
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import type { Answer } from "@/test-app";
import { emptyAnswer, jsonAnswer, problemAnswer, renderApp, testDeps } from "@/test-app";
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
    renderApp(<Voices />, deps([]));
    expect(
      await screen.findByText(
        "Add a voice ID from your text-to-speech provider. Audio needs one to narrate.",
      ),
    ).not.toBeNull();
  });

  it("lists each voice with its provider's name and its ID", async () => {
    renderApp(<Voices />, deps([narrator]));
    const row = await screen.findByRole("row", { name: /Narrator M/ });
    expect(within(row).getByText("ElevenLabs")).not.toBeNull();
    expect(within(row).getByText("abc123")).not.toBeNull();
    expect(
      screen.queryByText(
        "Add a voice ID from your text-to-speech provider. Audio needs one to narrate.",
      ),
    ).toBeNull();
  });

  it("names the problem when the list cannot be read", async () => {
    renderApp(
      <Voices />,
      deps([], { "GET /api/settings/voices": problemAnswer("The database is locked.", 500) }),
    );
    expect(await screen.findByText("The database is locked.")).not.toBeNull();
  });

  it("adds a voice and empties the form", async () => {
    const user = userEvent.setup();
    let posted: unknown;
    renderApp(
      <Voices />,
      deps([], {
        "POST /api/settings/voices": async (request) => {
          posted = await request.json();
          return jsonAnswer(narrator, 201)(request);
        },
      }),
    );

    const name = await screen.findByLabelText("Voice name");
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

  // The conflict is with a row that already exists, so the sentence goes
  // under the field that holds the duplicate and Add stops until it changes.
  it("marks a duplicate voice ID on its own field and holds Add", async () => {
    const user = userEvent.setup();
    renderApp(
      <Voices />,
      deps([narrator], {
        "POST /api/settings/voices": problemAnswer(
          "This voice ID is already listed for this provider.",
          409,
        ),
      }),
    );

    const voiceId = await screen.findByLabelText("Voice ID");
    await user.type(screen.getByLabelText("Voice name"), "Narrator F");
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
    renderApp(
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

    const name = await screen.findByLabelText("Voice name");
    await user.type(name, " ");
    await user.type(screen.getByLabelText("Voice ID"), "abc123");
    await user.click(screen.getByRole("button", { name: "Add voice" }));

    expect(await screen.findByText("A voice name is required.")).not.toBeNull();
    expect(name.getAttribute("aria-invalid")).toBe("true");
  });

  it("names a failure no field owns", async () => {
    const user = userEvent.setup();
    renderApp(
      <Voices />,
      deps([], {
        "POST /api/settings/voices": problemAnswer("The database is locked.", 500),
      }),
    );

    await user.type(await screen.findByLabelText("Voice name"), "Narrator M");
    await user.type(screen.getByLabelText("Voice ID"), "abc123");
    await user.click(screen.getByRole("button", { name: "Add voice" }));
    expect(await screen.findByText("The database is locked.")).not.toBeNull();
  });

  it("names the problem when a removal is refused", async () => {
    const user = userEvent.setup();
    renderApp(
      <Voices />,
      deps([narrator], {
        "DELETE /api/settings/voices/v1": problemAnswer("No voice has that id.", 404),
      }),
    );

    await user.click(await screen.findByRole("button", { name: "Remove Narrator M" }));
    await user.click(
      within(await screen.findByRole("dialog")).getByRole("button", { name: "Remove" }),
    );
    expect(await screen.findByText("No voice has that id.")).not.toBeNull();
  });

  it("confirms before removing a voice", async () => {
    const user = userEvent.setup();
    let deleted = 0;
    renderApp(
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

    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
    expect(deleted).toBe(0);

    await user.click(screen.getByRole("button", { name: "Remove Narrator M" }));
    await user.click(
      within(await screen.findByRole("dialog")).getByRole("button", { name: "Remove" }),
    );
    await waitFor(() => {
      expect(deleted).toBe(1);
    });
  });
});
