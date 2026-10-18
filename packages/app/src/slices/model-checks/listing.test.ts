import { describe, expect, it } from "vitest";
import type { Clock } from "../../kernel/clock.js";
import { openDb } from "../../kernel/db/index.js";
import { migrate } from "../../kernel/db/migrate.js";
import type { KeyProbes } from "../../kernel/ports/key-probe.js";
import { upsertKey } from "../settings/repo.js";
import { createListing, type ListingDeps, listedFor } from "./listing.js";
import { readChecks } from "./repo.js";

// Stand-ins for adapters/key-probes.ts (tested beside it): same shape, no network.
const data = (body: string) => {
  try {
    const rows: unknown = (JSON.parse(body) as { data?: unknown }).data;
    return Array.isArray(rows) ? { ids: rows.map((row: { id: string }) => row.id) } : undefined;
  } catch {
    return undefined;
  }
};
const googleBase = "https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000";
const probes: KeyProbes = {
  "openai-image": {
    url: "https://api.openai.com/v1/models",
    headers: () => ({}),
    list: { url: () => "https://api.openai.com/v1/models", read: data },
  },
  "google-tts": {
    url: googleBase,
    headers: () => ({}),
    list: {
      url: (page) => (page === undefined ? googleBase : `${googleBase}&pageToken=${page}`),
      read: (body) => {
        const value = JSON.parse(body) as { models: { name: string }[]; nextPageToken?: string };
        const ids = value.models.map((row) => row.name.replace(/^models\//, ""));
        return value.nextPageToken === undefined ? { ids } : { ids, next: value.nextPageToken };
      },
    },
  },
  replicate: {
    url: "https://api.replicate.com/v1/account",
    headers: () => ({}),
    model: { url: (model) => `https://api.replicate.com/v1/models/${model}` },
  },
  cartesia: { url: "https://api.cartesia.ai/voices", headers: () => ({}) },
};

function movableClock(start: string): Clock & { readonly advance: (ms: number) => void } {
  let at = Date.parse(start);
  return {
    now: () => new Date(at),
    sleep: () => Promise.resolve(),
    advance: (ms) => {
      at += ms;
    },
  };
}

const catalogue: Readonly<Record<string, readonly string[]>> = {
  "openai-image": ["gpt-image-1", "gpt-image-2"],
  "google-tts": ["gemini-tts", "gemini-tts-pro"],
  replicate: ["a/b", "c/d", "e/f"],
  cartesia: ["sonic-3"],
};

type Answer = { readonly status: number; readonly body: string } | "offline";

function setup(answers: Readonly<Record<string, Answer>>, over: Partial<ListingDeps> = {}) {
  const db = openDb(":memory:");
  const clock = movableClock("2026-10-18T10:00:00.000Z");
  migrate(db, clock);
  const asked: string[] = [];
  const fetch: typeof globalThis.fetch = (input) => {
    const url = String(input);
    asked.push(url);
    const answer = answers[url];
    if (answer === undefined || answer === "offline")
      return Promise.reject(new TypeError("fetch failed"));
    return Promise.resolve(new Response(answer.body, { status: answer.status }));
  };
  const deps: ListingDeps = {
    db,
    clock,
    fetch,
    probes,
    known: (provider) => catalogue[provider] ?? [],
    cliModels: () => Promise.resolve(["gpt-5", "gpt-5-mini"]),
    ...over,
  };
  return { db, clock, deps, asked };
}
const listedOf = (db: Parameters<typeof readChecks>[0]) =>
  readChecks(db).map((row) => [row.model, row.listed]);

describe("listedFor", () => {
  it("marks catalogue models the key's live list names", async () => {
    const { db, deps } = setup({
      "https://api.openai.com/v1/models": {
        status: 200,
        body: '{"data":[{"id":"gpt-image-1"},{"id":"o9"}]}',
      },
    });
    upsertKey(db, "openai-image", "placeholder", "2026-10-18");
    expect(await listedFor(deps, "openai-image")).toEqual({ kind: "listed", listed: 1, of: 2 });
    expect(listedOf(db)).toEqual([
      ["gpt-image-1", true],
      ["gpt-image-2", false],
    ]);
  });

  it("follows Google's pages with the shared key", async () => {
    const base = "https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000";
    const { db, deps } = setup({
      [base]: {
        status: 200,
        body: '{"models":[{"name":"models/gemini-tts"}],"nextPageToken":"p2"}',
      },
      [`${base}&pageToken=p2`]: {
        status: 200,
        body: '{"models":[{"name":"models/gemini-tts-pro"}]}',
      },
    });
    upsertKey(db, "google-image", "placeholder", "2026-10-18");
    expect(await listedFor(deps, "google-tts")).toMatchObject({ kind: "listed", listed: 2 });
  });

  it("asks Replicate for each model's own page", async () => {
    const page = (id: string) => `https://api.replicate.com/v1/models/${id}`;
    const { db, deps } = setup({
      [page("a/b")]: { status: 200, body: "{}" },
      [page("c/d")]: { status: 404, body: "" },
      [page("e/f")]: { status: 500, body: "" },
    });
    upsertKey(db, "replicate", "placeholder", "2026-10-18");
    expect(await listedFor(deps, "replicate")).toEqual({ kind: "listed", listed: 1, of: 2 });
    expect(listedOf(db)).toEqual([
      ["a/b", true],
      ["c/d", false],
    ]);
  });

  it("lists every model a CLI offers", async () => {
    const { db, deps } = setup({});
    expect(await listedFor(deps, "codex")).toEqual({ kind: "listed", listed: 2, of: 2 });
    expect(readChecks(db).every((row) => row.account === "codex" && row.listed)).toBe(true);
  });

  it("skips a provider without a key, without a list, or whose list can't be read", async () => {
    const { db, deps } = setup({
      "https://api.openai.com/v1/models": { status: 500, body: "" },
    });
    expect(await listedFor(deps, "openai-image")).toEqual({ kind: "skipped", reason: "no-key" });
    upsertKey(db, "openai-image", "placeholder", "2026-10-18");
    expect(await listedFor(deps, "openai-image")).toEqual({
      kind: "skipped",
      reason: "unreadable",
    });
    upsertKey(db, "cartesia", "placeholder", "2026-10-18");
    expect(await listedFor(deps, "cartesia")).toEqual({ kind: "skipped", reason: "no-list" });
    expect(await listedFor(deps, "system-voice")).toEqual({ kind: "skipped", reason: "no-list" });
    const broken = setup({}, { cliModels: () => Promise.reject(new Error("not installed")) });
    expect(await listedFor(broken.deps, "codex")).toEqual({
      kind: "skipped",
      reason: "unreadable",
    });
    expect(readChecks(db)).toEqual([]);
  });

  it("treats a list it can't read as unreadable, not as empty", async () => {
    const { db, deps } = setup({
      "https://api.openai.com/v1/models": { status: 200, body: "<html>" },
    });
    upsertKey(db, "openai-image", "placeholder", "2026-10-18");
    expect(await listedFor(deps, "openai-image")).toEqual({
      kind: "skipped",
      reason: "unreadable",
    });
  });
});

describe("createListing", () => {
  it("reads a provider's list at most every six hours unless forced or the key changed", async () => {
    const { db, clock, deps, asked } = setup({
      "https://api.openai.com/v1/models": { status: 200, body: '{"data":[{"id":"gpt-image-1"}]}' },
    });
    upsertKey(db, "openai-image", "placeholder", "2026-10-18");
    const listing = createListing(deps);
    await listing.refresh("openai-image");
    await listing.refresh("openai-image");
    expect(asked).toHaveLength(1);
    clock.advance(6 * 60 * 60_000);
    await listing.refresh("openai-image");
    expect(asked).toHaveLength(2);
    await listing.refresh("openai-image", true);
    expect(asked).toHaveLength(3);
    upsertKey(db, "openai-image", "placeholder-2", "2026-10-18");
    await listing.refresh("openai-image");
    expect(asked).toHaveLength(4);
  });

  it("shares one read between callers asking at once", async () => {
    const { db, deps, asked } = setup({
      "https://api.openai.com/v1/models": { status: 200, body: '{"data":[]}' },
    });
    upsertKey(db, "openai-image", "placeholder", "2026-10-18");
    const listing = createListing(deps);
    await Promise.all([listing.refresh("openai-image"), listing.refresh("openai-image")]);
    expect(asked).toHaveLength(1);
  });
});
