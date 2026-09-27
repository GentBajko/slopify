import { describe, expect, it } from "vitest";
import { seenBefore } from "./seen-before";

describe("seenBefore", () => {
  it("finds a project this channel already made on the topic", () => {
    expect(seenBefore(["D&D Lore: Tiamat", "Tiamat"], ["D&D Lore: Tiamat"], [])).toEqual({
      title: "D&D Lore: Tiamat",
      where: "project",
    });
  });

  it("finds one of the channel's existing uploads", () => {
    expect(seenBefore(["Tiamat's Lair"], [], ["Tiamat's lair", "Vecna"])).toEqual({
      title: "Tiamat's lair",
      where: "video",
    });
  });

  it("stays quiet for a new topic or nothing typed", () => {
    expect(seenBefore(["Red Dragons"], ["Blue Dragons"], ["Vecna"])).toBeUndefined();
    expect(seenBefore(["  "], ["Tiamat"], [])).toBeUndefined();
  });
});
