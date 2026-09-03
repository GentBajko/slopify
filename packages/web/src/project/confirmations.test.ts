import { stageKinds } from "@app/kernel/pipeline.js";
import { describe, expect, it } from "vitest";
import type { Destructive } from "./confirmations.js";
import { confirmationFor } from "./confirmations.js";

const every: readonly Destructive[] = [
  { kind: "cancel" },
  ...stageKinds.map((stage) => ({ kind: "rerun", stage }) as const),
  { kind: "delete-image", outputId: "o1" },
  { kind: "regenerate-image", outputId: "o1" },
  { kind: "save-article", markdown: "# Edited" },
  { kind: "discard-article" },
];

describe("the dialog in front of a destructive action", () => {
  it("uses the cancel copy the design chapter and the reference sheet both fix", () => {
    expect(confirmationFor({ kind: "cancel" })).toEqual({
      title: "Cancel this run?",
      consequence: "Stops every running stage; finished outputs are kept.",
      verb: "Cancel run",
      dismiss: "Keep running",
    });
  });

  it("uses the design chapter's own sentence for a deleted image", () => {
    expect(confirmationFor({ kind: "delete-image", outputId: "o1" }).consequence).toBe(
      "Removed from the slideshow; the video re-renders.",
    );
  });

  it("names what a re-run of each stage replaces", () => {
    expect(confirmationFor({ kind: "rerun", stage: "images" }).consequence).toBe(
      "Replaces every image in this run; the video re-renders.",
    );
    expect(confirmationFor({ kind: "rerun", stage: "video" }).consequence).toBe(
      "Replaces the video with a fresh render.",
    );
  });

  it("never names the way out the same thing as the action", () => {
    for (const action of every) {
      const confirmation = confirmationFor(action);
      expect(confirmation.verb).not.toBe(confirmation.dismiss);
    }
  });

  it("gives every action a one-sentence consequence and an imperative verb", () => {
    for (const action of every) {
      const { title, consequence, verb } = confirmationFor(action);
      expect(title.endsWith("?")).toBe(true);
      expect(consequence.endsWith(".")).toBe(true);
      expect(consequence.split(". ").length).toBeLessThanOrEqual(1);
      expect(verb.length).toBeGreaterThan(0);
    }
  });
});
