import { describe, expect, it } from "vitest";
import {
  assembleDescription,
  checkDescriptionAnswer,
  descriptionMessages,
  tagsLength,
  tagsText,
} from "./answer.js";

const good = {
  summary: "Szass Tam's plan, step by step.",
  chapters: [
    { start: "0:00", title: "Heist Approaches" },
    { start: "2:15", title: "Weapon Customisation" },
    { start: "18:43", title: "What Do You Want to See?" },
  ],
  hashtags: ["#DnD", "ForgottenRealms", "#SzassTam"],
  tags: ["dnd", "forgotten realms", "szass tam"],
};
const duration = 20 * 60;
const check = (answer: unknown, seconds = duration) =>
  checkDescriptionAnswer(typeof answer === "string" ? answer : JSON.stringify(answer), seconds);
const reason = (answer: unknown, seconds = duration): string => {
  const result = check(answer, seconds);
  if (result.ok) throw new Error("Expected a refusal");
  return result.reason;
};

describe("checkDescriptionAnswer", () => {
  it("accepts a valid answer, bare or fenced, and assembles YouTube's layout", () => {
    for (const text of [
      JSON.stringify(good),
      `Here it is:\n\`\`\`json\n${JSON.stringify(good)}\n\`\`\``,
    ]) {
      const result = check(text);
      if (!result.ok) throw new Error(result.reason);
      expect(assembleDescription(result.value)).toBe(
        [
          "Szass Tam's plan, step by step.",
          "",
          "0:00 Heist Approaches",
          "2:15 Weapon Customisation",
          "18:43 What Do You Want to See?",
          "",
          "#DnD #ForgottenRealms #SzassTam",
        ].join("\n"),
      );
      expect(tagsText(result.value.tags)).toBe("dnd, forgotten realms, szass tam");
    }
  });

  it("writes H:MM:SS chapters in a video of an hour or more", () => {
    const result = check(
      { ...good, chapters: [...good.chapters, { start: "1:02:03", title: "Late Part" }] },
      2 * 3600,
    );
    if (!result.ok) throw new Error(result.reason);
    expect(assembleDescription(result.value)).toContain("\n1:02:03 Late Part\n");
  });

  it("refuses an answer that is not the JSON object", () => {
    expect(reason("Sure! 0:00 Intro")).toMatch(/didn't come back in the expected format/);
    expect(reason({ summary: "x", chapters: [] })).toMatch(/expected format/);
  });

  it("refuses an empty summary", () => {
    expect(reason({ ...good, summary: "  " })).toMatch(/has no summary/);
  });

  it("refuses fewer than three chapters", () => {
    expect(reason({ ...good, chapters: good.chapters.slice(0, 2) })).toBe(
      "The AI model's chapters broke YouTube's rules (there must be at least 3 chapters, and it wrote 2). Retry stage, or choose another model in Edit project → Providers.",
    );
  });

  it("refuses a first chapter that does not start at 0:00", () => {
    expect(
      reason({ ...good, chapters: [{ start: "0:02", title: "Intro" }, ...good.chapters.slice(1)] }),
    ).toBe(
      "The AI model's chapters broke YouTube's rules (the first chapter must start at 0:00). Retry stage, or choose another model in Edit project → Providers.",
    );
  });

  it("refuses a time it cannot read", () => {
    expect(
      reason({
        ...good,
        chapters: [good.chapters[0], { start: "2m15", title: "Two" }, good.chapters[2]],
      }),
    ).toMatch(/chapter 2 starts at "2m15", not a time like 2:15/);
  });

  it("refuses chapters out of order", () => {
    expect(
      reason({
        ...good,
        chapters: [good.chapters[0], good.chapters[2], { start: "2:15", title: "Back" }],
      }),
    ).toMatch(/chapter 3 at 2:15 must start after chapter 2 at 18:43/);
    expect(
      reason({ ...good, chapters: [good.chapters[0], good.chapters[1], good.chapters[1]] }),
    ).toMatch(/must start after/);
  });

  it("refuses a chapter shorter than ten seconds, including the last", () => {
    expect(
      reason({
        ...good,
        chapters: [good.chapters[0], { start: "0:05", title: "Short" }, good.chapters[2]],
      }),
    ).toMatch(/chapter 1 "Heist Approaches" lasts 5 seconds/);
    expect(reason(good, 18 * 60 + 50)).toMatch(
      /chapter 3 "What Do You Want to See\?" lasts 7 seconds/,
    );
  });

  it("refuses a chapter at or after the end of the video", () => {
    expect(reason(good, 18 * 60 + 43)).toMatch(
      /chapter 3 starts at 18:43, after the video ends at 18:43/,
    );
  });

  it("refuses a chapter with no title or one that starts with a time", () => {
    expect(
      reason({
        ...good,
        chapters: [good.chapters[0], { start: "2:15", title: " " }, good.chapters[2]],
      }),
    ).toMatch(/chapter 2 needs a one-line title/);
    expect(
      reason({
        ...good,
        chapters: [good.chapters[0], { start: "2:15", title: "2:15 Two" }, good.chapters[2]],
      }),
    ).toMatch(/chapter 2 needs a one-line title/);
  });

  it("refuses missing, too many or multi-word hashtags", () => {
    expect(reason({ ...good, hashtags: [] })).toMatch(
      /hashtags broke YouTube's rules \(there must be at least one/,
    );
    expect(
      reason({ ...good, hashtags: Array.from({ length: 16 }, (_, index) => `#Tag${index}`) }),
    ).toMatch(/past 15, and it wrote 16/);
    expect(reason({ ...good, hashtags: ["#Forgotten Realms"] })).toMatch(
      /"#Forgotten Realms" is not one word/,
    );
  });

  it("refuses tags over YouTube's limits, repeated or with commas", () => {
    expect(reason({ ...good, tags: [] })).toMatch(/at least one tag/);
    expect(reason({ ...good, tags: ["x".repeat(101)] })).toMatch(/over 100 characters/);
    expect(reason({ ...good, tags: ["dnd", "DnD"] })).toMatch(/"DnD" is listed twice/);
    expect(reason({ ...good, tags: ["dnd, 5e"] })).toMatch(/contains a comma/);
    const many = Array.from(
      { length: 30 },
      (_, index) => `tag number ${String(index).padStart(3, "0")}`,
    );
    expect(reason({ ...good, tags: many })).toMatch(/come to 509 characters, over YouTube's 500/);
  });

  it("refuses angle brackets and a description over 5000 characters", () => {
    expect(reason({ ...good, summary: "Use <b>bold</b>" })).toMatch(/contains < or >/);
    expect(reason({ ...good, summary: "x".repeat(5000) })).toMatch(/over YouTube's 5000/);
  });
});

it("counts the Tags field as YouTube does: commas, and quotes around tags with spaces", () => {
  expect(tagsLength(["dnd", "forgotten realms"])).toBe(3 + 1 + 16 + 2);
  expect(tagsLength([])).toBe(0);
});

it("sends the prompt, title, length and timed transcript, with the rules in the system message", () => {
  const messages = descriptionMessages({
    instruction: "Write it for {{Topic}} fans.",
    title: "Szass Tam",
    durationSeconds: 1250,
    transcript: "[0:02] Welcome.",
  });
  expect(messages.map((message) => message.role)).toEqual(["system", "user"]);
  expect(messages[0]?.content).toContain('The first chapter starts at exactly "0:00"');
  expect(messages[0]?.content).toContain("before the video ends at 20:50");
  expect(messages[1]?.content).toBe(
    [
      "Write it for {{Topic}} fans.",
      "",
      "Video title: Szass Tam",
      "Video length: 20:50",
      "",
      "Transcript, each passage led by the time it starts in the video:",
      "",
      "[0:02] Welcome.",
    ].join("\n"),
  );
});
