import { describe, expect, it } from "vitest";
import { type AssistantCliStates, assistantCliOf, assistantScreenSchema } from "./model.js";

const ready = { installed: true, login: "signed-in" } as const;
const missing = { installed: false, login: "unknown" } as const;
const signedOut = { installed: true, login: "signed-out" } as const;
const states = (claude: AssistantCliStates["claude-code"], codex: AssistantCliStates["codex"]) => ({
  "claude-code": claude,
  codex,
});

describe("assistantCliOf", () => {
  it("auto takes Claude Code when it is ready", () => {
    expect(assistantCliOf(states(ready, ready), "auto", false)).toEqual({
      ok: true,
      cli: "claude-code",
    });
  });

  it("auto falls back to Codex when Claude Code is missing or signed out", () => {
    expect(assistantCliOf(states(missing, ready), "auto", false)).toEqual({
      ok: true,
      cli: "codex",
    });
    expect(assistantCliOf(states(signedOut, ready), "auto", false)).toEqual({
      ok: true,
      cli: "codex",
    });
  });

  it("treats a sign-in it couldn't read as usable", () => {
    expect(
      assistantCliOf(states({ installed: true, login: "unknown" }, missing), "auto", false),
    ).toEqual({ ok: true, cli: "claude-code" });
  });

  it("says to set one up when neither is ready", () => {
    const choice = assistantCliOf(states(missing, signedOut), "auto", false);
    expect(choice).toMatchObject({ ok: false, fix: { kind: "settings", section: "providers" } });
    expect(choice.ok ? "" : choice.reason).toContain(
      "Set up Claude Code or Codex in Settings → Providers.",
    );
  });

  it("names what keeps the chosen CLI from running, with its fix", () => {
    const out = assistantCliOf(states(signedOut, ready), "claude-code", false);
    expect(out.ok ? "" : out.reason).toContain('Run "claude auth login" in a terminal');
    const absent = assistantCliOf(states(ready, missing), "codex", false);
    expect(absent.ok ? "" : absent.reason).toContain("Codex isn't installed");
    const old = assistantCliOf(
      states(ready, {
        installed: true,
        login: "signed-in",
        issue: "Codex CLI 0.149.1 or newer is required.",
      }),
      "codex",
      false,
    );
    expect(old.ok ? "" : old.reason).toContain("0.149.1 or newer");
  });

  it("is unavailable in the Docker copy, with the way to get it", () => {
    const choice = assistantCliOf(states(ready, ready), "auto", true);
    expect(choice).toMatchObject({ ok: false, fix: { kind: "tutorial", page: "Install" } });
    expect(choice.ok ? "" : choice.reason).toContain("Docker");
  });
});

describe("assistantScreenSchema", () => {
  it("accepts a screen with ids, a section and a selection", () => {
    expect(
      assistantScreenSchema.parse({
        path: "/projects/p1",
        projectId: "p1",
        section: "narration",
        selection: [{ kind: "project", id: "p2", label: "Rope" }],
      }),
    ).toMatchObject({ projectId: "p1" });
  });

  it("refuses unknown fields, ids with slashes and more than 20 selected rows", () => {
    expect(assistantScreenSchema.safeParse({ path: "/", other: 1 }).success).toBe(false);
    expect(assistantScreenSchema.safeParse({ path: "/", projectId: "../p" }).success).toBe(false);
    const selection = Array.from({ length: 21 }, (_, index) => ({
      kind: "project",
      id: `p${String(index)}`,
      label: "x",
    }));
    expect(assistantScreenSchema.safeParse({ path: "/", selection }).success).toBe(false);
    expect(assistantScreenSchema.safeParse({ path: "x".repeat(301) }).success).toBe(false);
  });
});
