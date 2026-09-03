import type { ProviderFamily, ProviderId, ProviderStatus } from "@app/slices/settings/model.js";
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { emptyAnswer, jsonAnswer, problemAnswer, renderApp, testDeps } from "@/test-app";
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

describe("the API key rails", () => {
  it("shows skeleton rails while the providers are coming", () => {
    const { container } = renderApp(<ProviderKeys />, testDeps({}));
    expect(container.querySelectorAll(".bg-panel2").length).toBeGreaterThan(0);
  });

  it("names the problem when the providers cannot be read", async () => {
    renderApp(
      <ProviderKeys />,
      testDeps({ "GET /api/providers": problemAnswer("The database is locked.", 500) }),
    );
    expect(await screen.findByText("The database is locked.")).not.toBeNull();
  });

  it("lists a CLI provider that answered, with its version and no key field", async () => {
    renderApp(
      <ProviderKeys />,
      testDeps({
        "GET /api/providers": listing([
          cli("claude-code", "Claude Code CLI", {
            kind: "cli",
            installed: true,
            version: "2.1.258",
          }),
        ]),
      }),
    );
    expect(await screen.findByText("Installed, version 2.1.258")).not.toBeNull();
    expect(screen.queryByLabelText(/Claude Code CLI API key/)).toBeNull();
    expect(screen.getByText("Claude Code CLI").closest("div")?.dataset.ready).toBe("true");
  });

  it("lists a CLI provider that ran but printed no version as installed", async () => {
    renderApp(
      <ProviderKeys />,
      testDeps({
        "GET /api/providers": listing([
          cli("codex", "Codex CLI", { kind: "cli", installed: true }),
        ]),
      }),
    );
    expect(await screen.findByText("Installed")).not.toBeNull();
  });

  it("greys a CLI that is not on PATH and says what to do about it", async () => {
    renderApp(
      <ProviderKeys />,
      testDeps({
        "GET /api/providers": listing([
          cli("codex", "Codex CLI", { kind: "cli", installed: false }),
        ]),
      }),
    );
    expect(await screen.findByText("Not found on PATH")).not.toBeNull();
    expect(screen.getByText("Install the Codex CLI and reload this page.")).not.toBeNull();

    const name = screen.getByText("Codex CLI");
    expect(name.className).toContain("text-ink3");
    expect(name.closest("div")?.dataset.ready).toBe("false");
  });

  it("teaches what a key is for while none is stored", async () => {
    renderApp(
      <ProviderKeys />,
      testDeps({
        "GET /api/providers": listing([keyed("openrouter", "llm", "OpenRouter", false)]),
      }),
    );
    expect(
      await screen.findByText("Paste a key to make its provider selectable on Play."),
    ).not.toBeNull();
    expect(screen.queryByRole("button", { name: /Remove OpenRouter key/ })).toBeNull();
  });

  it("drops the teaching line once any provider is keyed", async () => {
    renderApp(
      <ProviderKeys />,
      testDeps({
        "GET /api/providers": listing([keyed("openrouter", "llm", "OpenRouter", true)]),
      }),
    );
    await screen.findByLabelText("OpenRouter API key");
    expect(screen.queryByText("Paste a key to make its provider selectable on Play.")).toBeNull();
  });

  it("shows the mask and a stored-key note once a key is saved, and offers Remove", async () => {
    renderApp(
      <ProviderKeys />,
      testDeps({
        "GET /api/providers": listing([keyed("elevenlabs", "tts", "ElevenLabs", true)]),
      }),
    );
    const field = await screen.findByLabelText("ElevenLabs API key");
    expect(field.getAttribute("placeholder")).toBe("••••••••••••");
    expect(screen.getByText("A key is stored for this provider.")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Remove ElevenLabs key" })).not.toBeNull();
  });

  // A key is written, never read back. Nothing this page renders may carry any run of it
  // once the save has landed.
  it("keeps every part of a saved key out of the page", async () => {
    const secret = "sk-or-v1-QZJXWKPVNMTRGB74390HYUC";
    const user = userEvent.setup();
    let sent: string | undefined;

    renderApp(
      <ProviderKeys />,
      testDeps({
        "GET /api/providers": listing([keyed("openrouter", "llm", "OpenRouter", false)]),
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

  it("names the problem when a save is refused", async () => {
    const user = userEvent.setup();
    renderApp(
      <ProviderKeys />,
      testDeps({
        "GET /api/providers": listing([keyed("fal", "image", "fal.ai", false)]),
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
    renderApp(
      <ProviderKeys />,
      testDeps({
        "GET /api/providers": listing([keyed("openrouter", "llm", "OpenRouter", true)]),
        "DELETE /api/providers/openrouter/key": (request) => {
          deleted += 1;
          return emptyAnswer()(request);
        },
      }),
    );

    await user.click(await screen.findByRole("button", { name: "Remove OpenRouter key" }));
    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByText(
        "Projects that used this provider cannot retry until a key is saved.",
      ),
    ).not.toBeNull();

    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
    expect(deleted).toBe(0);

    await user.click(screen.getByRole("button", { name: "Remove OpenRouter key" }));
    const again = await screen.findByRole("dialog");
    await user.click(within(again).getByRole("button", { name: "Remove" }));
    await waitFor(() => {
      expect(deleted).toBe(1);
    });
  });

  it("names the problem when a removal is refused", async () => {
    const user = userEvent.setup();
    renderApp(
      <ProviderKeys />,
      testDeps({
        "GET /api/providers": listing([keyed("openrouter", "llm", "OpenRouter", true)]),
        "DELETE /api/providers/openrouter/key": problemAnswer(
          "No key is stored for OpenRouter.",
          404,
        ),
      }),
    );

    await user.click(await screen.findByRole("button", { name: "Remove OpenRouter key" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Remove" }));
    expect(await screen.findByText("No key is stored for OpenRouter.")).not.toBeNull();
  });
});
