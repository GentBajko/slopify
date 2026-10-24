import { stageKinds } from "@app/kernel/pipeline.js";
import { describe, expect, it } from "vitest";
import { stageWords } from "./stage-words.js";

describe("the stage names", () => {
  it("name every stage once, in the words a person sees, never the pipeline's own", () => {
    expect(Object.keys(stageWords).toSorted()).toEqual([...stageKinds].toSorted());
    expect(stageWords.audio).toBe("Narration");
    expect(stageWords.document).toBe("PDF");
    const names = Object.values(stageWords);
    expect(new Set(names).size).toBe(names.length);
    expect(names.filter((name) => /audio|document|tts|speech|export/i.test(name))).toEqual([]);
  });
});
