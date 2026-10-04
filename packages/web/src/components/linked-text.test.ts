import { describe, expect, it } from "vitest";
import { settingsLinkParts } from "./linked-text";

describe("settingsLinkParts", () => {
  it("turns each named Settings page into a link to its section", () => {
    expect(
      settingsLinkParts(
        "Choose another model in Settings → Models, or clean up in Settings → Backup & storage.",
      ),
    ).toEqual([
      "Choose another model in ",
      { label: "Settings → Models", section: "models" },
      ", or clean up in ",
      { label: "Settings → Backup & storage", section: "storage" },
      ".",
    ]);
  });

  it("leaves a sentence without a Settings page as it is", () => {
    expect(settingsLinkParts("Try again.")).toEqual(["Try again."]);
  });
});
