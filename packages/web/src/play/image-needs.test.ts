import { defaultVideoEdit } from "@app/slices/video/edit-settings.js";
import { describe, expect, it } from "vitest";
import { aKind, imageServiceUsers, kindAfterOff, listed } from "./image-needs";
import { outputKindPatch } from "./output-kind";
import { freshForm, type PlayFormState } from "./state";

const as = (kind: Parameters<typeof outputKindPatch>[1]): PlayFormState => ({
  ...freshForm,
  ...outputKindPatch(freshForm, kind),
});

describe("what else the image service draws", () => {
  it("names the drawn thumbnail, the shorts and the animated images, as admission asks", () => {
    expect(imageServiceUsers(freshForm)).toEqual([]);
    expect(
      imageServiceUsers({
        ...freshForm,
        sources: { ...freshForm.sources, thumbnail: "prompt_by_llm", video: "generate" },
        shorts: {
          enabled: true,
          count: "2",
          minSeconds: "45",
          maxSeconds: "90",
          prompt: "",
          imagePrompt: "",
        },
        videoEdit: { ...defaultVideoEdit, animate: "every" },
      }),
    ).toEqual(["the thumbnail", "the shorts", "the animated images"]);
    // An uploaded thumbnail is not drawn, and shorts need narration.
    expect(
      imageServiceUsers({
        ...freshForm,
        sources: { ...freshForm.sources, thumbnail: "provide", audio: "off" },
        shorts: {
          enabled: true,
          count: "2",
          minSeconds: "45",
          maxSeconds: "90",
          prompt: "",
          imagePrompt: "",
        },
      }),
    ).toEqual([]);
  });

  it("lists them in words", () => {
    expect(listed([])).toBe("");
    expect(listed(["the thumbnail"])).toBe("the thumbnail");
    expect(listed(["a", "b", "c"])).toBe("a, b and c");
  });
});

describe("what turning a stage off makes instead", () => {
  it("names the kind a video or an audiobook becomes", () => {
    expect(kindAfterOff(as("video"), "images")).toBe("audiobook");
    expect(kindAfterOff(as("audiobook"), "audio")).toBe("article");
    expect(aKind("audiobook")).toBe("an audiobook");
    expect(aKind("video")).toBe("a video");
  });

  it("says nothing when the kind stays, or when nothing would be made at all", () => {
    // A silent video is still a video.
    expect(kindAfterOff(as("video"), "audio")).toBeUndefined();
    // A set of images writes no article: with its images off it makes nothing to name.
    expect(kindAfterOff(as("images"), "images")).toBeUndefined();
  });
});
