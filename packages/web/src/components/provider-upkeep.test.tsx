import type { RetiredUsage } from "@app/slices/model-upkeep/model.js";
import { cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { freshDraftDocument, withProviderDefaults } from "@/play/draft-state";
import { emptyAnswer, jsonAnswer, renderApp, testDeps } from "@/test-app";
import { CatalogueSettings } from "./catalogue.js";
import { ProviderHealthCheck } from "./provider-health.js";
import { ProviderKeys } from "./provider-keys.js";
import { Welcome } from "./welcome.js";

afterEach(cleanup);

const usage: RetiredUsage = {
  key: "template:t1:llm",
  kind: "template",
  id: "t1",
  name: "Weekly",
  slot: "llm",
  provider: "openrouter",
  model: "old/model",
  why: "retired",
  replacement: { id: "new/model", name: "New Model" },
  blocked: null,
};

describe("key setup", () => {
  it("shows where to get a key and tests a saved one in plain words", async () => {
    let tested = 0;
    renderApp(
      <ProviderKeys />,
      testDeps({
        "GET /api/providers": jsonAnswer({
          providers: [
            {
              id: "openrouter",
              family: "llm",
              displayName: "OpenRouter",
              readiness: { kind: "keyed", hasKey: true },
            },
          ],
        }),
        "POST /api/providers/openrouter/key/test": (request) => {
          tested++;
          return jsonAnswer({
            provider: "openrouter",
            result: "rejected",
            ok: false,
            message: "OpenRouter did not accept this key (HTTP 401).",
            checkedAt: "2026-09-27T10:00:00.000Z",
          })(request);
        },
      }),
    );
    await userEvent.click(await screen.findByRole("button", { name: "About OpenRouter keys" }));
    expect(
      (await screen.findByRole("link", { name: "openrouter.ai/settings/keys" })).getAttribute(
        "href",
      ),
    ).toBe("https://openrouter.ai/settings/keys");
    await userEvent.keyboard("{Escape}");
    await userEvent.click(screen.getByRole("button", { name: "Test OpenRouter key" }));
    expect((await screen.findByRole("alert")).textContent).toBe(
      "OpenRouter did not accept this key (HTTP 401).",
    );
    expect(tested).toBe(1);
  });

  it("keeps Test disabled until a key is saved", async () => {
    renderApp(
      <ProviderKeys />,
      testDeps({
        "GET /api/providers": jsonAnswer({
          providers: [
            {
              id: "fal",
              family: "image",
              displayName: "fal.ai",
              readiness: { kind: "keyed", hasKey: false },
            },
          ],
        }),
      }),
    );
    expect(
      (await screen.findByRole("button", { name: "Test fal.ai key" })).hasAttribute("disabled"),
    ).toBe(true);
  });
});

describe("the health check", () => {
  it("runs on Check all and lists each provider's checks with fixes", async () => {
    renderApp(
      <ProviderHealthCheck />,
      testDeps({
        "POST /api/providers/health": jsonAnswer({
          checkedAt: "2026-09-27T10:00:00.000Z",
          providers: [
            {
              id: "codex",
              displayName: "Codex CLI",
              family: "llm",
              state: "problem",
              checks: [
                { label: "Installed", state: "ok", detail: "Found codex (version 0.150.0)." },
                {
                  label: "Signed in",
                  state: "problem",
                  detail: 'Codex CLI is not signed in. Run "codex login".',
                },
              ],
            },
            { id: "fal", displayName: "fal.ai", family: "image", state: "unused", checks: [] },
          ],
        }),
      }),
    );
    expect(screen.getByText("Not checked yet.")).not.toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Check all" }));
    expect(await screen.findByText("Needs fixing")).not.toBeNull();
    expect(screen.getByText(/Run "codex login"/)).not.toBeNull();
    expect(screen.getByText("Not set up and not used anywhere: fal.ai.")).not.toBeNull();
  });
});

describe("retired models", () => {
  it("lists each use with a one-click switch to the named replacement, and Switch all", async () => {
    const sent: unknown[] = [];
    let all = 0;
    renderApp(
      <CatalogueSettings />,
      testDeps({
        "GET /api/providers/catalogue": jsonAnswer({
          updatedAt: "2026-09-26",
          path: "/data/models.yaml",
          warning: null,
          sync: {
            checkedAt: "2026-09-27T09:00:00.000Z",
            changes: {
              added: [
                { family: "llm", provider: "openrouter", id: "new/model", name: "New Model" },
              ],
              retired: [
                { family: "llm", provider: "openrouter", id: "old/model", name: "Old Model" },
              ],
              priced: [],
            },
            warning: null,
          },
        }),
        "GET /api/providers/catalogue/retired": jsonAnswer({
          usages: [
            usage,
            {
              ...usage,
              key: "project:p1:llm",
              kind: "project",
              id: "p1",
              name: "Moon",
              blocked: "This project is running. Wait for it to finish or pause it, then switch.",
            },
          ],
        }),
        "POST /api/providers/catalogue/retired/switch": async (request) => {
          sent.push(await request.json());
          return jsonAnswer({ ok: true, changed: true })(request);
        },
        "POST /api/providers/catalogue/retired/switch-all": (request) => {
          all++;
          return jsonAnswer({ switched: 1, failed: [] })(request);
        },
      }),
    );
    expect(await screen.findByText(/1 new, 1 retired/)).not.toBeNull();
    expect(screen.getByText("Retired: Old Model")).not.toBeNull();
    const buttons = await screen.findAllByRole("button", { name: "Switch to New Model" });
    expect(buttons.map((button) => button.hasAttribute("disabled"))).toEqual([false, true]);
    expect(screen.getByText(/This project is running/)).not.toBeNull();
    await userEvent.click(buttons[0] as HTMLElement);
    await waitFor(() => {
      expect(sent).toEqual([
        {
          kind: "template",
          id: "t1",
          slot: "llm",
          from: { provider: "openrouter", model: "old/model" },
          to: "new/model",
        },
      ]);
    });
    await userEvent.click(screen.getByRole("button", { name: "Switch all" }));
    await waitFor(() => {
      expect(all).toBe(1);
    });
  });
});

describe("first run", () => {
  it("says no key is needed, hands Play the found providers, and goes away on Got it", async () => {
    let dismissed = false;
    const seen: unknown[] = [];
    renderApp(
      <Welcome onDefaults={(defaults) => seen.push(defaults)} />,
      testDeps({
        "GET /api/providers/first-run": (request) =>
          jsonAnswer(
            dismissed
              ? { firstRun: false, detected: [], defaults: {}, message: null, detail: null }
              : {
                  firstRun: true,
                  detected: [
                    {
                      id: "claude-code",
                      displayName: "Claude Code CLI",
                      installed: true,
                      usable: true,
                      version: "2.1.0",
                    },
                  ],
                  defaults: { llm: { provider: "claude-code", model: "sonnet" } },
                  message: "You can make a video now, no API keys needed.",
                  detail: "Slopify found Claude Code CLI and picked it on Play.",
                },
          )(request),
        "POST /api/providers/first-run/dismiss": (request) => {
          dismissed = true;
          return emptyAnswer()(request);
        },
      }),
    );
    expect(await screen.findByText("You can make a video now, no API keys needed.")).not.toBeNull();
    expect(screen.getByText("Found: Claude Code CLI 2.1.0")).not.toBeNull();
    expect(seen).toEqual([{ llm: { provider: "claude-code", model: "sonnet" } }]);
    await userEvent.click(screen.getByRole("button", { name: "Got it" }));
    await waitFor(() => {
      expect(screen.queryByText("You can make a video now, no API keys needed.")).toBeNull();
    });
  });

  it("fills only a draft nobody picked providers in", () => {
    const defaults = { llm: { provider: "claude-code", model: "sonnet" } };
    expect(withProviderDefaults(freshDraftDocument, defaults).form.llm).toEqual(defaults.llm);
    const picked = {
      ...freshDraftDocument,
      form: { ...freshDraftDocument.form, llm: { provider: "openrouter", model: "x" } },
    };
    expect(withProviderDefaults(picked, defaults)).toBe(picked);
    expect(withProviderDefaults(freshDraftDocument, {})).toBe(freshDraftDocument);
  });
});
