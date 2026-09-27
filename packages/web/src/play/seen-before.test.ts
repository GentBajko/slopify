import { describe, expect, it } from "vitest";
import { seenBefore } from "./seen-before";

describe("seenBefore", () => {
  it("finds a project this channel already made on the topic", () => {
    expect(seenBefore(["History: Cleopatra", "Cleopatra"], ["History: Cleopatra"], [])).toEqual({
      title: "History: Cleopatra",
      where: "project",
    });
  });

  it("finds one of the channel's existing uploads", () => {
    expect(seenBefore(["Cleopatra's Palace"], [], ["Cleopatra's palace", "Hypatia"])).toEqual({
      title: "Cleopatra's palace",
      where: "video",
    });
  });

  it("stays quiet for a new topic or nothing typed", () => {
    expect(seenBefore(["Red Pyramids"], ["Bent Pyramids"], ["Hypatia"])).toBeUndefined();
    expect(seenBefore(["  "], ["Cleopatra"], [])).toBeUndefined();
  });
});
