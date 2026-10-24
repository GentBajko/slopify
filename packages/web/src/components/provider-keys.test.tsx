import type {
  ProviderFamily,
  ProviderId,
  ProviderStatus,
  Voice,
} from "@app/slices/settings/model.js";
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  type Answer,
  emptyAnswer,
  jsonAnswer,
  problemAnswer,
  renderRouted,
  testDeps,
} from "@/test-app";
import { ProviderKeys } from "./provider-keys.js";

afterEach(cleanup);

function keyed(
  id: ProviderId,
  family: ProviderFamily,
  displayName: string,
  hasKey: boolean,
): ProviderStatus {
  return { id, family, displayName, readiness: { kind: "keyed", hasKey } };
}

function cli(id: ProviderId, displayName: string, readiness: ProviderStatus["readiness"]) {
  return { id, family: "llm" as const, displayName, readiness };
}

const listing = (providers: readonly ProviderStatus[]) => jsonAnswer({ providers });

function deps(
  providers: readonly ProviderStatus[],
  extra: Readonly<Record<string, Answer>> = {},
  voices: readonly Voice[] = [],
) {
  return testDeps({
    "GET /api/providers": listing(providers),
    "GET /api/settings/voices": jsonAnswer({ voices }),
    ...extra,
  });
}

// Opens a service from its line in a kind's list, as a person would.
async function open(kind: string, name: string): Promise<void> {
  const list = await screen.findByRole("list", { name: kind });
  await userEvent.click(within(list).getByRole("button", { name }));
}

describe("Keys & services' lists", () => {
  it("shows the lists' shape while the services are coming", async () => {
    renderRouted(<ProviderKeys />, testDeps({ "GET /api/providers": () => new Promise(() => {}) }));
    expect(await screen.findByRole("status", { name: "Loading services" })).not.toBeNull();
  });

  it("lists every service on one line with its state in words, beside the first one still to set up", async () => {
    const user = userEvent.setup();
    renderRouted(
      <ProviderKeys />,
      deps([
        keyed("openrouter", "llm", "OpenRouter", true),
        keyed("elevenlabs", "tts", "ElevenLabs", false),
        keyed("fal", "image", "fal.ai", false),
      ]),
    );
    const text = await screen.findByRole("list", { name: "Writing services" });
    expect(within(text).getByText("Ready")).not.toBeNull();
    expect(within(text).getByText("API key")).not.toBeNull();
    expect(
      within(screen.getByRole("list", { name: "Voice services" })).getByText("No key"),
    ).not.toBeNull();
    // Writing is ready, so the first kind with nothing usable opens: the voice service.
    expect(screen.getByRole("heading", { name: "ElevenLabs" })).not.toBeNull();
    expect(screen.getByLabelText("ElevenLabs API key")).not.toBeNull();
    expect(screen.queryByLabelText("OpenRouter API key")).toBeNull();
    // The key box comes before where to get one, which is folded.
    const steps = screen.getByText("Where to get a key").closest("details");
    expect(steps?.open).toBe(false);

    await user.click(within(text).getByRole("button", { name: "OpenRouter" }));
    expect(screen.getByRole("heading", { name: "OpenRouter" })).not.toBeNull();
    expect(screen.getByLabelText("OpenRouter API key")).not.toBeNull();
    expect(screen.queryByLabelText("ElevenLabs API key")).toBeNull();
    expect(within(text).getByRole("listitem").getAttribute("aria-current")).toBe("true");
  });

  it("opens the voice service the saved voices need, before any other", async () => {
    renderRouted(
      <ProviderKeys />,
      deps(
        [
          keyed("openrouter", "llm", "OpenRouter", true),
          keyed("elevenlabs", "tts", "ElevenLabs", false),
          keyed("openai-tts", "tts", "OpenAI", false),
        ],
        {},
        [{ id: "v1", provider: "openai-tts", name: "History narrator", voiceId: "fable" }],
      ),
    );
    expect(await screen.findByLabelText("OpenAI API key")).not.toBeNull();
    // What it does and costs is said in words, not behind a button.
    expect(
      screen.getByText(/Narrates the script with OpenAI's text-to-speech voices/),
    ).not.toBeNull();
    expect(screen.queryByRole("button", { name: /^About / })).toBeNull();
  });

  it("opens the service a link names, whatever needs setting up first", async () => {
    renderRouted(
      <ProviderKeys focus={{ family: "image", provider: "fal", arrival: true }} />,
      deps([
        keyed("openrouter", "llm", "OpenRouter", false),
        keyed("elevenlabs", "tts", "ElevenLabs", false),
        keyed("fal", "image", "fal.ai", false),
      ]),
    );
    expect(await screen.findByLabelText("fal.ai API key")).not.toBeNull();
    expect(screen.queryByLabelText("OpenRouter API key")).toBeNull();
  });

  it("scrolls to the kind a link names only when it does not already show in the window", async () => {
    const scrolled = vi.fn();
    const proto = HTMLElement.prototype as { scrollIntoView?: unknown };
    const before = proto.scrollIntoView;
    proto.scrollIntoView = scrolled;
    const at = (top: number) =>
      vi
        .spyOn(HTMLElement.prototype, "getBoundingClientRect")
        .mockReturnValue({ top, bottom: top + 300 } as DOMRect);
    const services = [
      keyed("openrouter", "llm", "OpenRouter", true),
      keyed("openai-tts", "tts", "OpenAI", false),
    ];
    try {
      // Already in view on a wide window: the page stays put, so its header stays in view.
      at(200);
      renderRouted(
        <ProviderKeys focus={{ family: "tts", provider: undefined, arrival: true }} />,
        deps(services),
      );
      expect(await screen.findByLabelText("OpenAI API key")).not.toBeNull();
      expect(scrolled).not.toHaveBeenCalled();
      cleanup();
      vi.restoreAllMocks();

      // Below the fold, as on a phone: the page brings that kind to the top.
      at(1400);
      renderRouted(
        <ProviderKeys focus={{ family: "tts", provider: undefined, arrival: true }} />,
        deps(services),
      );
      expect(await screen.findByLabelText("OpenAI API key")).not.toBeNull();
      await waitFor(() => {
        expect(scrolled).toHaveBeenCalledWith({ block: "start", behavior: "auto" });
      });
    } finally {
      vi.restoreAllMocks();
      proto.scrollIntoView = before;
    }
  });

  it("names the problem when the services cannot be read", async () => {
    renderRouted(
      <ProviderKeys />,
      testDeps({ "GET /api/providers": problemAnswer("The database is locked.", 500) }),
    );
    expect(await screen.findByText("The database is locked.")).not.toBeNull();
  });

  it("lists a tool that answered, with its version and no key field", async () => {
    renderRouted(
      <ProviderKeys />,
      deps([
        cli("claude-code", "Claude Code CLI", { kind: "cli", installed: true, version: "2.1.258" }),
      ]),
    );
    expect(
      within(await screen.findByRole("list", { name: "Writing services" })).getByText("Ready"),
    ).not.toBeNull();
    // Nothing needs setting up, so nothing opens until the line is pressed.
    expect(screen.queryByText("Installed, version 2.1.258")).toBeNull();
    await open("Writing services", "Claude Code CLI");
    expect(screen.getByText("Installed, version 2.1.258")).not.toBeNull();
    expect(screen.queryByLabelText(/Claude Code CLI API key/)).toBeNull();
    expect(screen.getByRole("region", { name: "Claude Code CLI" }).dataset.ready).toBe("true");
  });

  it("lists a tool that ran but printed no version as installed", async () => {
    renderRouted(
      <ProviderKeys />,
      deps([cli("codex", "Codex CLI", { kind: "cli", installed: true })]),
    );
    await open("Writing services", "Codex CLI");
    expect(await screen.findByText("Installed")).not.toBeNull();
  });

  it("shows an installed but too old tool as needing fixing, with the fix", async () => {
    const issue =
      "Codex CLI 0.149.1 or newer is required; version 0.148.0 is installed. Update Codex CLI and try again.";
    renderRouted(
      <ProviderKeys />,
      deps([
        cli("codex", "Codex CLI", {
          kind: "cli",
          installed: true,
          version: "0.148.0",
          issue,
          issueKind: "version",
        }),
      ]),
    );
    expect(await screen.findByText(issue)).not.toBeNull();
    expect(screen.getByRole("region", { name: "Codex CLI" }).dataset.ready).toBe("false");
    expect(screen.getAllByText("Needs fixing").length).toBeGreaterThan(0);
  });

  it("says Signed out for a tool that is installed but not signed in", async () => {
    renderRouted(
      <ProviderKeys />,
      deps([
        cli("codex", "Codex CLI", {
          kind: "cli",
          installed: true,
          issue: "Codex CLI is not signed in. Run codex login in a terminal.",
          issueKind: "login",
        }),
      ]),
    );
    const list = await screen.findByRole("list", { name: "Writing services" });
    expect(within(list).getByText("Signed out")).not.toBeNull();
  });

  it("greys a tool that is not on PATH and says what to do about it", async () => {
    renderRouted(
      <ProviderKeys />,
      deps([cli("codex", "Codex CLI", { kind: "cli", installed: false })]),
    );
    expect(
      await screen.findByText("Not found in the folders your terminal searches (PATH)"),
    ).not.toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Change path" }));
    expect(screen.getByRole("button", { name: "Save Codex CLI path" })).not.toBeNull();

    expect(screen.getByRole("region", { name: "Codex CLI" }).dataset.ready).toBe("false");
    expect(screen.getAllByText("Not found").length).toBeGreaterThan(0);
  });

  it("offers neither Test nor Remove until there is a key to test or remove", async () => {
    const user = userEvent.setup();
    renderRouted(<ProviderKeys />, deps([keyed("openrouter", "llm", "OpenRouter", false)]));
    const field = await screen.findByLabelText("OpenRouter API key");
    expect(screen.queryByRole("button", { name: "Test the key (free)" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Remove the key" })).toBeNull();
    await user.type(field, "sk-or-test");
    expect(screen.getByRole("button", { name: "Test the key (free)" })).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Remove the key" })).toBeNull();
  });

  it("shows the mask and a stored-key note once a key is saved, and offers Remove", async () => {
    renderRouted(<ProviderKeys />, deps([keyed("elevenlabs", "tts", "ElevenLabs", true)]));
    await open("Voice services", "ElevenLabs");
    const field = await screen.findByLabelText("ElevenLabs API key");
    expect(field.getAttribute("placeholder")).toBe("••••••••••••");
    expect(screen.getByText("A key is stored for this provider.")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Remove the key" })).not.toBeNull();
  });

  // A key is written, never read back. Nothing this page renders may carry any run of it
  // once the save has landed.
  it("keeps every part of a saved key out of the page", async () => {
    const secret = "sk-or-v1-QZJXWKPVNMTRGB74390HYUC";
    const user = userEvent.setup();
    let sent: string | undefined;

    renderRouted(
      <ProviderKeys />,
      deps([keyed("openrouter", "llm", "OpenRouter", false)], {
        "PUT /api/providers/openrouter/key": async (request) => {
          sent = ((await request.json()) as { key: string }).key;
          return jsonAnswer({ provider: "openrouter", hasKey: true, masked: "••••••••••••" })(
            request,
          );
        },
      }),
    );

    const field = await screen.findByLabelText("OpenRouter API key");
    await user.type(field, secret);
    await user.click(screen.getByRole("button", { name: "Save OpenRouter key" }));

    expect(await screen.findByText("Saved")).not.toBeNull();
    expect(sent).toBe(secret);

    // The value is gone from the field itself, from every other field on the page, and
    // from the serialised markup - attributes and text alike.
    expect((field as HTMLInputElement).value).toBe("");
    for (const input of document.querySelectorAll("input")) {
      expect(input.value).toBe("");
    }
    const html = document.body.innerHTML;
    expect(html).not.toContain(secret);
    for (let at = 0; at + 4 <= secret.length; at += 1) {
      expect(html).not.toContain(secret.slice(at, at + 4));
    }
  });

  it("offers Done and the way back once a key is saved on a detour from the welcome", async () => {
    const user = userEvent.setup();
    let stored = false;
    renderRouted(
      <ProviderKeys
        focus={{ family: "tts", provider: "openai-tts", arrival: true }}
        back={{ to: "welcome", step: "found" }}
      />,
      testDeps({
        "GET /api/providers": (request) =>
          listing([keyed("openai-tts", "tts", "OpenAI", stored)])(request),
        "GET /api/settings/voices": jsonAnswer({ voices: [] }),
        "PUT /api/providers/openai-tts/key": (request) => {
          stored = true;
          return jsonAnswer({ provider: "openai-tts", hasKey: true, masked: "••••••••••••" })(
            request,
          );
        },
      }),
    );
    const field = await screen.findByLabelText("OpenAI API key");
    expect(screen.queryByRole("link", { name: /^Done/ })).toBeNull();
    await user.type(field, "sk-test{Enter}");
    const done = await screen.findByRole("link", { name: "Done · back to the welcome" });
    expect(done.getAttribute("href")).toBe("/welcome?step=found");
    // No voice uses OpenAI yet, so a voice is the next thing to add, with the way back kept.
    const next = screen.getByRole("link", { name: "Add an OpenAI voice" });
    expect(next.getAttribute("href")).toBe("/settings?section=voices&return=welcome&step=found");
  });

  it("says nothing about adding a voice once a saved voice uses the service", async () => {
    renderRouted(
      <ProviderKeys focus={{ family: "tts", provider: "openai-tts", arrival: true }} />,
      deps([keyed("openai-tts", "tts", "OpenAI", true)], {}, [
        { id: "v1", provider: "openai-tts", name: "History narrator", voiceId: "fable" },
      ]),
    );
    expect(await screen.findByRole("button", { name: "Remove the key" })).not.toBeNull();
    expect(screen.queryByRole("link", { name: /voice$/ })).toBeNull();
  });

  it("saves on Enter and shows the pasted key only while Show key is pressed", async () => {
    const user = userEvent.setup();
    let sent: string | undefined;
    renderRouted(
      <ProviderKeys />,
      deps([keyed("openrouter", "llm", "OpenRouter", false)], {
        "PUT /api/providers/openrouter/key": async (request) => {
          sent = ((await request.json()) as { key: string }).key;
          return jsonAnswer({ provider: "openrouter", hasKey: true, masked: "••••••••••••" })(
            request,
          );
        },
      }),
    );
    const field = await screen.findByLabelText("OpenRouter API key");
    expect(field.getAttribute("type")).toBe("password");
    await user.type(field, "sk-or-test");
    await user.click(screen.getByRole("button", { name: "Show key" }));
    expect(field.getAttribute("type")).toBe("text");
    await user.click(screen.getByRole("button", { name: "Hide key" }));
    expect(field.getAttribute("type")).toBe("password");
    await user.type(field, "{Enter}");
    expect(await screen.findByText("Saved")).not.toBeNull();
    expect(sent).toBe("sk-or-test");
  });

  it("names the problem when a save is refused", async () => {
    const user = userEvent.setup();
    renderRouted(
      <ProviderKeys />,
      deps([keyed("fal", "image", "fal.ai", false)], {
        "PUT /api/providers/fal/key": problemAnswer(
          "This key cannot be saved; the listed fields need attention.",
          400,
        ),
      }),
    );

    const field = await screen.findByLabelText("fal.ai API key");
    await user.type(field, "   ");
    // A field holding only spaces has nothing to save, so the control says so first.
    expect(screen.getByRole("button", { name: "Save fal.ai key" }).hasAttribute("disabled")).toBe(
      true,
    );

    await user.clear(field);
    await user.type(field, "abc");
    await user.click(screen.getByRole("button", { name: "Save fal.ai key" }));
    expect(
      await screen.findByText("This key cannot be saved; the listed fields need attention."),
    ).not.toBeNull();
    expect(field.getAttribute("aria-invalid")).toBe("true");
  });

  it("names the consequence before removing a key, and cancels without asking again", async () => {
    const user = userEvent.setup();
    let deleted = 0;
    renderRouted(
      <ProviderKeys />,
      deps([keyed("openrouter", "llm", "OpenRouter", true)], {
        "DELETE /api/providers/openrouter/key": (request) => {
          deleted += 1;
          return emptyAnswer()(request);
        },
      }),
    );

    await open("Writing services", "OpenRouter");
    await user.click(await screen.findByRole("button", { name: "Remove the key" }));
    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByText(
        "Projects that used this service cannot retry until a key is saved.",
      ),
    ).not.toBeNull();

    await user.click(within(dialog).getByRole("button", { name: "Keep it" }));
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
    expect(deleted).toBe(0);

    await user.click(screen.getByRole("button", { name: "Remove the key" }));
    const again = await screen.findByRole("dialog");
    await user.click(within(again).getByRole("button", { name: "Remove key" }));
    await waitFor(() => {
      expect(deleted).toBe(1);
    });
  });

  it("names the problem when a removal is refused", async () => {
    const user = userEvent.setup();
    renderRouted(
      <ProviderKeys />,
      deps([keyed("openrouter", "llm", "OpenRouter", true)], {
        "DELETE /api/providers/openrouter/key": problemAnswer(
          "No key is stored for OpenRouter.",
          404,
        ),
      }),
    );

    await open("Writing services", "OpenRouter");
    await user.click(await screen.findByRole("button", { name: "Remove the key" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Remove key" }));
    expect(await screen.findByText("No key is stored for OpenRouter.")).not.toBeNull();
  });

  it("shows the system voice as built in, with no key field, and why it can't speak", async () => {
    renderRouted(
      <ProviderKeys />,
      deps([
        keyed("openrouter", "llm", "OpenRouter", true),
        {
          id: "system-voice",
          family: "tts",
          displayName: "System voice",
          readiness: {
            kind: "local",
            available: false,
            issue: "No speech program was found on this computer. Install espeak-ng.",
          },
        },
      ]),
    );
    const voice = await screen.findByRole("list", { name: "Voice services" });
    expect(within(voice).getByText("Built in")).not.toBeNull();
    expect(within(voice).getByText("Not installed")).not.toBeNull();
    expect(screen.getByRole("heading", { name: "System voice" })).not.toBeNull();
    expect(screen.getByText(/Install espeak-ng/)).not.toBeNull();
    expect(screen.queryByLabelText("System voice API key")).toBeNull();
  });

  it("on one column, opens a service's setup under its own line and keeps the lists together", async () => {
    const user = userEvent.setup();
    const matchMedia = window.matchMedia;
    window.matchMedia = ((query: string) => ({
      ...matchMedia.call(window, query),
      matches: false,
    })) as typeof window.matchMedia;
    try {
      renderRouted(
        <ProviderKeys />,
        deps([
          keyed("openrouter", "llm", "OpenRouter", false),
          keyed("elevenlabs", "tts", "ElevenLabs", false),
        ]),
      );
      const text = await screen.findByRole("list", { name: "Writing services" });
      // Nothing opens by itself on a phone: the lists come first.
      expect(screen.queryByLabelText("OpenRouter API key")).toBeNull();
      const row = within(text).getByRole("button", { name: "OpenRouter" });
      expect(row.getAttribute("aria-expanded")).toBe("false");
      await user.click(row);
      expect(row.getAttribute("aria-expanded")).toBe("true");
      const field = screen.getByLabelText("OpenRouter API key");
      expect(text.contains(field)).toBe(true);
      await user.click(row);
      expect(screen.queryByLabelText("OpenRouter API key")).toBeNull();
    } finally {
      window.matchMedia = matchMedia;
    }
  });
});
