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

  it("says a deleted image leaves the video, made again without it", () => {
    expect(confirmationFor({ kind: "delete-image", outputId: "o1" }).consequence).toBe(
      "Removes the image; the video is made again without it when the video is on.",
    );
  });

  it("tells a thumbnail's redraw leaves the video alone, unlike an image's", () => {
    const thumbnail = confirmationFor({
      kind: "regenerate-image",
      outputId: "o1",
      thumbnail: true,
    });
    expect(thumbnail.title).toBe("Make the thumbnail again?");
    expect(thumbnail.verb).toBe("Make it again");
    expect(thumbnail.consequence).toContain("the video and shorts are not touched");
    expect(confirmationFor({ kind: "regenerate-image", outputId: "o1" }).consequence).toContain(
      "makes the video again with it",
    );
  });

  it("names each remake's consequence in plain words, and keeps Versions", () => {
    expect(confirmationFor({ kind: "rerun", stage: "images" }).consequence).toBe(
      "Draws every image made from a prompt again, then makes the video again with them; pictures you supplied stay as they are.",
    );
    expect(confirmationFor({ kind: "rerun", stage: "video" }).consequence).toBe(
      "Makes the video file again from the narration and images you already have; nothing is drawn or recorded again.",
    );
    expect(confirmationFor({ kind: "rerun", stage: "audio" }).consequence).toContain(
      "stays under Versions",
    );
    for (const stage of stageKinds)
      expect(confirmationFor({ kind: "rerun", stage }).consequence).not.toMatch(
        /History|Regenerat|export|cue/u,
      );
  });

  it("leads with the price where it is known", () => {
    expect(
      confirmationFor({
        kind: "rerun",
        stage: "video",
        price: "No charge: it runs on this computer.",
      }).consequence,
    ).toMatch(/^No charge: it runs on this computer\. Makes the video file again/u);
    expect(
      confirmationFor({
        kind: "regenerate-image",
        outputId: "o1",
        now: true,
        price: "About $0.04.",
      }).consequence,
    ).toMatch(/^About \$0\.04\. Draws a new image/u);
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
