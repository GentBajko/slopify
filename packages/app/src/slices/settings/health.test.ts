import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseCatalogue } from "../../catalog/store.js";
import { draftFixture, must } from "../play-drafts/draft.fake.js";
import { createDraft } from "../play-drafts/service.js";
import type { CliProbe } from "./cli-status.js";
import { dismissFirstRun, firstRunStatus, readProviderDefaults } from "./first-run.js";
import { checkProviderHealth, type HealthDeps } from "./health.js";
import { saveProviderKey } from "./keys.js";
import { providerStatuses } from "./readiness.js";

const catalogue = parseCatalogue(
  readFileSync(new URL("../../assets/models.yaml", import.meta.url), "utf8"),
);
const installed: CliProbe = async (binary) => ({ ran: true, stdout: `${binary} 1.2.3` });
const onlyClaude: CliProbe = async (binary) =>
  binary === "claude" ? { ran: true, stdout: "2.1.0 (Claude Code)" } : { ran: false, stdout: "" };

function deps(h: ReturnType<typeof draftFixture>, probe: CliProbe, status = 200): HealthDeps {
  return {
    db: h.deps.db,
    clock: h.deps.clock,
    probe,
    fetch: (async () => new Response("{}", { status })) as typeof globalThis.fetch,
    probes: { openrouter: { url: "https://openrouter.test/key", headers: () => ({}) } },
    catalogue: () => catalogue,
    modelsFor: async (provider) =>
      provider === "claude-code"
        ? [{ id: "sonnet", name: "Sonnet" }]
        : [{ id: "gpt", name: "GPT" }],
    login: async (_command, id) => (id === "codex" ? "signed-out" : "signed-in"),
  };
}

describe("the providers health check", () => {
  it("reports each CLI's sign-in, each key's test and each chosen model, with fixes", async () => {
    const h = draftFixture();
    try {
      saveProviderKey(h.deps, "openrouter", "bad");
      must(
        createDraft(h.deps, {
          id: randomUUID(),
          document: {
            ...h.document,
            form: {
              ...h.document.form,
              title: "Moon",
              llm: { provider: "claude-code", model: "opus-old" },
            },
          },
        }),
      );
      const report = await checkProviderHealth(deps(h, installed, 401));
      const of = (id: string) => report.providers.find((row) => row.id === id);
      expect(of("claude-code")).toMatchObject({
        state: "problem",
        checks: [
          { label: "Installed", state: "ok" },
          { label: "Signed in", state: "ok" },
          {
            label: "Chosen models",
            state: "problem",
            detail: expect.stringContaining("opus-old (Text model in draft “Moon”)"),
          },
        ],
      });
      expect(of("codex")?.checks[1]).toMatchObject({
        state: "problem",
        detail: expect.stringContaining('run "codex login"'),
      });
      // The Gemini CLI's sign-in is read from its files now, like the others' status commands.
      expect(of("gemini")?.checks[1]).toMatchObject({ label: "Signed in", state: "ok" });
      expect(of("openrouter")).toMatchObject({
        state: "problem",
        checks: [
          {
            label: "Key valid",
            state: "problem",
            detail: expect.stringContaining("did not accept"),
          },
        ],
      });
      // Neither set up nor chosen: nothing to fix.
      expect(of("fal")).toMatchObject({ state: "unused" });
    } finally {
      h.close();
    }
  });

  it("checks one provider only for a sign-in fix-it's Check again, without testing keys", async () => {
    const h = draftFixture();
    try {
      saveProviderKey(h.deps, "openrouter", "k");
      let fetched = 0;
      const d: HealthDeps = {
        ...deps(h, installed),
        fetch: (async () => {
          fetched += 1;
          return new Response("{}");
        }) as typeof globalThis.fetch,
      };
      const report = await checkProviderHealth(d, "codex");
      expect(report.providers.map((row) => row.id)).toEqual(["codex"]);
      expect(report.providers[0]?.checks[1]).toMatchObject({
        label: "Signed in",
        state: "problem",
      });
      expect(fetched).toBe(0);
    } finally {
      h.close();
    }
  });
});

describe("model reachable", () => {
  function withModel(h: ReturnType<typeof draftFixture>, model: string) {
    saveProviderKey(h.deps, "openrouter", "good");
    must(
      createDraft(h.deps, {
        id: randomUUID(),
        document: {
          ...h.document,
          form: { ...h.document.form, title: "Moon", llm: { provider: "openrouter", model } },
        },
      }),
    );
  }
  function reachDeps(
    h: ReturnType<typeof draftFixture>,
    list: (url: string) => Response,
  ): HealthDeps & { asked: string[] } {
    const asked: string[] = [];
    return {
      ...deps(h, installed),
      fetch: (async (url: string) => {
        asked.push(url);
        return url.endsWith("/key") ? new Response("{}", { status: 200 }) : list(url);
      }) as typeof globalThis.fetch,
      probes: {
        openrouter: {
          url: "https://openrouter.test/key",
          headers: () => ({}),
          model: {
            url: () => "https://openrouter.test/models",
            lists: (body, model) =>
              (JSON.parse(body) as { data: { id: string }[] }).data.some((one) => one.id === model),
          },
        },
      },
      asked,
    };
  }
  const models = () =>
    new Response(JSON.stringify({ data: [{ id: "anthropic/claude-sonnet-4.6" }] }), {
      status: 200,
    });

  it("asks the provider for the chosen model with the saved key", async () => {
    const h = draftFixture();
    try {
      withModel(h, "anthropic/claude-sonnet-4.6");
      const d = reachDeps(h, models);
      const report = await checkProviderHealth(d, "openrouter");
      expect(report.providers.map((row) => row.id)).toEqual(["openrouter"]);
      expect(report.providers[0]?.checks.at(-1)).toMatchObject({
        label: "Model reachable",
        state: "ok",
      });
      expect(d.asked).toEqual(["https://openrouter.test/key", "https://openrouter.test/models"]);
    } finally {
      h.close();
    }
  });

  it("names a chosen model the key can't use, and where it is chosen", async () => {
    const h = draftFixture();
    try {
      withModel(h, "anthropic/claude-gone");
      const report = await checkProviderHealth(reachDeps(h, models), "openrouter");
      expect(report.providers[0]).toMatchObject({ state: "problem" });
      expect(report.providers[0]?.checks.at(-1)).toMatchObject({
        label: "Model reachable",
        state: "problem",
        detail: expect.stringContaining("anthropic/claude-gone (Text model in draft “Moon”)"),
      });
    } finally {
      h.close();
    }
  });

  it("warns rather than passes when the provider doesn't answer", async () => {
    const h = draftFixture();
    try {
      withModel(h, "anthropic/claude-sonnet-4.6");
      const report = await checkProviderHealth(
        reachDeps(h, () => new Response("busy", { status: 503 })),
        "openrouter",
      );
      expect(report.providers[0]?.checks.at(-1)).toMatchObject({
        label: "Model reachable",
        state: "warning",
      });
    } finally {
      h.close();
    }
  });
});

describe("first run", () => {
  it("finds the CLIs, picks them as Play's defaults once, and says no key is needed", async () => {
    const h = draftFixture();
    try {
      const d = deps(h, installed);
      const status = await firstRunStatus(d, await providerStatuses(d));
      expect(status).toMatchObject({
        firstRun: true,
        message: "You can make a video now, no API keys needed.",
        defaults: {
          llm: { provider: "claude-code", model: "sonnet" },
          images: { provider: "codex-image", model: "gpt" },
        },
      });
      expect(status.detected.filter((cli) => cli.usable).map((cli) => cli.id)).toEqual([
        "claude-code",
        "codex",
        "gemini",
        "codex-image",
      ]);
      expect(readProviderDefaults(h.deps.db)).toEqual(status.defaults);
      dismissFirstRun(h.deps.db);
      expect((await firstRunStatus(d, await providerStatuses(d))).firstRun).toBe(false);
    } finally {
      h.close();
    }
  });

  it("prefers what is found, and is not a first run once a key is saved", async () => {
    const h = draftFixture();
    try {
      const d = deps(h, onlyClaude);
      const status = await firstRunStatus(d, await providerStatuses(d));
      expect(status.defaults).toEqual({ llm: { provider: "claude-code", model: "sonnet" } });
      expect(status.detail).toContain("Claude Code CLI");
      const other = draftFixture();
      try {
        saveProviderKey(other.deps, "openrouter", "k");
        const e = deps(other, installed);
        expect(await firstRunStatus(e, await providerStatuses(e))).toMatchObject({
          firstRun: false,
          message: null,
          defaults: {},
        });
      } finally {
        other.close();
      }
    } finally {
      h.close();
    }
  });

  it("says what to install when nothing is found", async () => {
    const h = draftFixture();
    try {
      const d = deps(h, async () => ({ ran: false, stdout: "" }));
      expect(await firstRunStatus(d, await providerStatuses(d))).toMatchObject({
        firstRun: true,
        defaults: {},
        message: "No AI command-line tool was found on this computer.",
        detail: expect.stringContaining("Settings → Providers"),
      });
    } finally {
      h.close();
    }
  });
});
