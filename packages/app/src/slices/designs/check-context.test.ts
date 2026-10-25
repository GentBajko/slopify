import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { ProviderStatus } from "../settings/model.js";
import { designCheckContext } from "./check-context.js";

const barlow = fileURLToPath(new URL("../../assets/fonts/Barlow-Regular.ttf", import.meta.url));
const status = (readiness: ProviderStatus["readiness"]): ProviderStatus => ({
  id: "fal",
  family: "image",
  displayName: "fal.ai",
  readiness,
});
const context = (statuses: readonly ProviderStatus[] | Error) =>
  designCheckContext({
    resolveFont: async (id) => {
      if (id !== "default") throw new Error("gone");
      return {
        id,
        name: "Barlow Regular",
        family: "Barlow",
        source: "bundled",
        path: barlow,
        extension: ".ttf",
        assName: "Barlow",
        faceIndex: 0,
      };
    },
    providers: async () => {
      if (statuses instanceof Error) throw statuses;
      return statuses;
    },
  });

describe("what Mark ready reads from this computer", () => {
  it("reads a font's file, and answers none for one that is gone", async () => {
    const ctx = context([]);
    expect((await ctx.font("default"))?.bytes.byteLength).toBeGreaterThan(1000);
    expect(await ctx.font("uploaded-x")).toBeUndefined();
  });

  it("says what to fix about the image provider", async () => {
    expect(await context([status({ kind: "keyed", hasKey: true })]).providerProblem("fal")).toBe(
      null,
    );
    expect(await context([status({ kind: "keyed", hasKey: false })]).providerProblem("fal")).toBe(
      "fal.ai has no API key, so the picture can't be made. Add the key in Settings → Keys & services, then press Approve for schedules again.",
    );
    expect(
      await context([
        status({ kind: "cli", installed: true, issue: "Sign in with codex login." }),
      ]).providerProblem("fal"),
    ).toBe(
      "fal.ai can't be used yet: Sign in with codex login. Fix it in Settings → Keys & services, then press Approve for schedules again.",
    );
    expect(await context([]).providerProblem("nope")).toContain("isn't one this Slopify knows");
    expect(await context(new Error("Probe failed.")).providerProblem("fal")).toBe(
      "Slopify couldn't check the image provider: Probe failed. Open Settings → Keys & services, then press Approve for schedules again.",
    );
  });
});
