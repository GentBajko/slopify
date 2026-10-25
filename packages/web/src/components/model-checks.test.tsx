import { cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { ModelChecksSettings, NewModelsSlot } from "@/components/model-checks";
import { emptyAnswer, jsonAnswer, renderApp, renderRouted, testDeps } from "@/test-app";

afterEach(cleanup);

const hour = 60 * 60_000;
const state = (provider: string, over: Record<string, unknown> = {}) => ({
  provider,
  family: "llm",
  running: false,
  lastCheckedAt: null,
  spent: 0,
  works: 0,
  noAccess: 0,
  listed: 0,
  ...over,
});
const overview = (over: Record<string, unknown> = {}) =>
  jsonAnswer({
    auto: "free",
    providers: [
      state("openrouter", {
        works: 3,
        noAccess: 1,
        listed: 12,
        spent: 0.0012,
        lastCheckedAt: new Date(Date.now() - 2 * hour).toISOString(),
      }),
      state("codex"),
      state("fal", { family: "image" }),
    ],
    newForYou: [
      {
        provider: "openrouter",
        family: "llm",
        model: "x/new",
        name: "New One",
        firstWorksAt: new Date().toISOString(),
      },
    ],
    ...over,
  });
const providers = jsonAnswer({
  providers: [
    {
      id: "openrouter",
      family: "llm",
      displayName: "OpenRouter",
      readiness: { kind: "keyed", hasKey: true },
    },
    {
      id: "codex",
      family: "llm",
      displayName: "Codex CLI",
      readiness: { kind: "cli", installed: true },
    },
    {
      id: "fal",
      family: "image",
      displayName: "fal.ai",
      readiness: { kind: "keyed", hasKey: false },
    },
  ],
});

describe("Settings → Models: models that work for you", () => {
  it("lists each set-up provider with what its checks found and cost", async () => {
    renderApp(
      <ModelChecksSettings />,
      testDeps({ "GET /api/model-checks": overview(), "GET /api/providers": providers }),
    );
    await screen.findByText(
      "3 working · 1 not on your plan · 12 listed for you · last checked 2 h ago",
    );
    expect(screen.getByText("Checks cost $0.0012 so far")).toBeTruthy();
    expect(screen.getByText("0 working · not checked yet")).toBeTruthy();
    expect(screen.queryByText("fal.ai")).toBeNull();
  });

  it("shows the price before a paid check, and starts a free one at once", async () => {
    const started: string[] = [];
    renderApp(
      <ModelChecksSettings />,
      testDeps({
        "GET /api/model-checks": overview(),
        "GET /api/providers": providers,
        "GET /api/providers/openrouter/models/check/estimate": jsonAnswer({
          provider: "openrouter",
          count: 12,
          totalDollars: 0.04,
          unpriced: 0,
          planAccounts: [],
          text: "about $0.04",
          skipped: [],
        }),
        "GET /api/providers/codex/models/check/estimate": jsonAnswer({
          provider: "codex",
          count: 2,
          totalDollars: 0,
          unpriced: 0,
          planAccounts: ["codex"],
          text: "free",
          skipped: [],
        }),
        "POST /api/providers/codex/models/check": (request) => {
          started.push("codex");
          return jsonAnswer(
            {
              provider: "codex",
              count: 2,
              totalDollars: 0,
              unpriced: 0,
              planAccounts: ["codex"],
              text: "free",
              skipped: [],
            },
            202,
          )(request);
        },
        "POST /api/providers/openrouter/models/check": (request) => {
          started.push("openrouter");
          return jsonAnswer(
            {
              provider: "openrouter",
              count: 12,
              totalDollars: 0.04,
              unpriced: 0,
              planAccounts: [],
              text: "about $0.04",
              skipped: [],
            },
            202,
          )(request);
        },
      }),
    );
    await userEvent.click(await screen.findByRole("button", { name: "Check Codex CLI models" }));
    await screen.findByText("Checking 2 models in the background.");
    expect(started).toEqual(["codex"]);
    await userEvent.click(screen.getByRole("button", { name: "Check OpenRouter models" }));
    await screen.findByRole("heading", { name: "Check 12 OpenRouter models?" });
    expect(
      screen.getByText(
        "Each model gets one small request, so this costs about $0.04 at list price.",
      ),
    ).toBeTruthy();
    expect(started).toEqual(["codex"]);
    await userEvent.click(screen.getByRole("button", { name: "Check models" }));
    await waitFor(() => expect(started).toEqual(["codex", "openrouter"]));
  });

  it("turns automatic checks off and dismisses a new model", async () => {
    const sent: unknown[] = [];
    renderApp(
      <ModelChecksSettings />,
      testDeps({
        "GET /api/model-checks": overview(),
        "GET /api/providers": providers,
        "PUT /api/model-checks/auto": async (request) => {
          sent.push(await request.json());
          return jsonAnswer({ auto: "off" })(request);
        },
        "POST /api/model-checks/notices/dismiss": async (request) => {
          sent.push(await request.json());
          return emptyAnswer()(request);
        },
      }),
    );
    await screen.findByText("New One");
    await userEvent.selectOptions(screen.getByLabelText("Automatic checks"), "off");
    await userEvent.click(screen.getByRole("button", { name: "Dismiss New One" }));
    await waitFor(() =>
      expect(sent).toEqual([
        { auto: "off" },
        { keys: [{ provider: "openrouter", family: "llm", model: "x/new" }] },
      ]),
    );
  });

  it("offers to compare a new model on a template's sample, opening that template's studio ready", async () => {
    renderRouted(
      <ModelChecksSettings />,
      testDeps({
        "GET /api/model-checks": overview(),
        "GET /api/providers": providers,
        "GET /api/project-templates": jsonAnswer({
          templates: [
            {
              id: "11111111-1111-4111-8111-111111111111",
              name: "Weekly history",
              version: 4,
              createdAt: "2026-10-01T00:00:00Z",
              updatedAt: "2026-10-02T00:00:00Z",
            },
          ],
        }),
      }),
    );
    await userEvent.click(
      await screen.findByRole("button", { name: "Compare New One on a sample" }),
    );
    await screen.findByRole("dialog", { name: "Compare New One on a sample" });
    const link = await screen.findByRole("link", { name: "Compare on Weekly history" });
    expect(link.getAttribute("href")).toBe(
      "/templates/11111111-1111-4111-8111-111111111111?section=script&compareProvider=openrouter&compareModel=x%2Fnew",
    );
  });

  it("tells apart two providers that share a name", async () => {
    renderApp(
      <ModelChecksSettings />,
      testDeps({
        "GET /api/model-checks": overview({
          providers: [state("codex"), state("codex-image", { family: "image" })],
          newForYou: [],
        }),
        "GET /api/providers": jsonAnswer({
          providers: [
            {
              id: "codex",
              family: "llm",
              displayName: "Codex CLI",
              readiness: { kind: "cli", installed: true },
            },
            {
              id: "codex-image",
              family: "image",
              displayName: "Codex CLI",
              readiness: { kind: "cli", installed: true },
            },
          ],
        }),
      }),
    );
    await screen.findByText("Codex CLI (text)");
    expect(screen.getByText("Codex CLI (images)")).toBeTruthy();
  });

  it("says what to do when nothing is set up", async () => {
    renderApp(
      <ModelChecksSettings />,
      testDeps({
        "GET /api/model-checks": overview({ providers: [], newForYou: [] }),
        "GET /api/providers": jsonAnswer({ providers: [] }),
      }),
    );
    await screen.findByText(
      "No service is set up yet. Add a key or sign in on Settings → Keys & services.",
    );
    // Nothing new: the section and its Dismiss all are not drawn.
    expect(screen.queryByRole("region", { name: "New for you" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Dismiss all" })).toBeNull();
  });
});

describe("Home's new models line", () => {
  it("says how many new models work and links to Settings → Models", async () => {
    await renderRouted(<NewModelsSlot />, testDeps({ "GET /api/model-checks": overview() }));
    const link = await screen.findByRole("link", { name: "1 new AI model works for you" });
    expect(link.getAttribute("href")).toContain("section=models");
  });

  it("stays an empty reserved line with nothing new", async () => {
    await renderRouted(
      <NewModelsSlot />,
      testDeps({ "GET /api/model-checks": overview({ newForYou: [] }) }),
    );
    await waitFor(() => expect(document.querySelector('[data-slot="status-slot"]')).not.toBeNull());
    expect(screen.queryByRole("link")).toBeNull();
  });
});
