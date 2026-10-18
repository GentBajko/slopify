import { describe, expect, it } from "vitest";
import { limitsFor } from "./limits.js";
import { countFor, fitText, hashtagsFor, stripChapters } from "./text.js";

describe("countFor", () => {
  it("counts X links as 23 whatever their length", () => {
    expect(countFor("see https://youtu.be/abcdefghijk-very-long-link", "weighted")).toBe(4 + 23);
  });

  it("counts CJK and emoji twice on X", () => {
    expect(countFor("日本", "weighted")).toBe(4);
    expect(countFor("👍🏽", "weighted")).toBe(2);
    expect(countFor("ab", "weighted")).toBe(2);
  });

  it("counts Bluesky in graphemes", () => {
    expect(countFor("👨‍👩‍👧 é", "graphemes")).toBe(3);
  });

  it("counts the other sites in UTF-16 characters", () => {
    expect(countFor("👍", "characters")).toBe(2);
  });
});

describe("fitText", () => {
  const short = { text: 40, unit: "characters" } as const;

  it("joins the body, link and hashtags when they fit", () => {
    const fitted = fitText(
      { body: "Hello.", link: "https://a.b", hashtags: ["#a", "#b"] },
      limitsFor("linkedin"),
      "LinkedIn",
    );
    expect(fitted).toEqual({ text: "Hello.\n\nhttps://a.b\n\n#a #b", used: 26 });
  });

  it("cuts at the last sentence that fits and says so", () => {
    const fitted = fitText(
      { body: "One two three. Four five six. Seven eight nine ten.", link: null, hashtags: ["#x"] },
      short,
      "Bluesky",
    );
    expect(fitted.text).toBe("One two three. Four five six.\n\n#x");
    expect(fitted.notice).toMatch(/cut to fit Bluesky's 40 characters\. Shorten it/);
    expect(fitted.used).toBeLessThanOrEqual(40);
  });

  it("cuts at a word with an ellipsis when not even one sentence fits", () => {
    const fitted = fitText(
      {
        body: "Averyveryverylongword and more words without any end at all",
        link: null,
        hashtags: [],
      },
      { text: 30, unit: "characters" },
      "X",
    );
    expect(fitted.text).toBe("Averyveryverylongword and…");
  });

  it("drops the hashtags before the link when the body has no room", () => {
    const fitted = fitText(
      {
        body: "Words here.",
        link: "https://example.com/abc",
        hashtags: ["#one", "#two", "#three"],
      },
      { text: 40, unit: "characters" },
      "X",
    );
    expect(fitted.text).toBe("Words here.\n\nhttps://example.com/abc");
    expect(fitted.notice).toContain("and its hashtags");
  });

  it("drops the link too when nothing else fits", () => {
    const fitted = fitText(
      { body: "Words here.", link: "https://example.com/a-very-long-link-indeed", hashtags: [] },
      { text: 20, unit: "characters" },
      "X",
    );
    expect(fitted.text).toBe("Words here.");
    expect(fitted.notice).toContain("its hashtags and the link");
  });

  it("counts an X link as 23 when fitting", () => {
    const body = "a".repeat(250);
    const fitted = fitText(
      { body, link: "https://youtu.be/abcdefghijk", hashtags: [] },
      limitsFor("x"),
      "X",
    );
    expect(fitted.notice).toBeUndefined();
    expect(fitted.used).toBe(250 + 2 + 23);
  });

  it("keeps an empty body empty", () => {
    expect(fitText({ body: "", link: null, hashtags: [] }, short, "X").text).toBe("");
  });
});

describe("hashtagsFor", () => {
  it("writes each tag once as a #Word, tags first then the shorts' hashtags", () => {
    expect(
      hashtagsFor(
        [
          ["dark fantasy", "lore", "Lore"],
          ["#sleep", "#lore"],
        ],
        3,
      ),
    ).toEqual(["#darkFantasy", "#lore", "#sleep"]);
  });

  it("skips bare numbers and empty tags", () => {
    expect(hashtagsFor([["2024", " ", "#"]], 5)).toEqual([]);
  });

  it("gives none when the count is 0", () => {
    expect(hashtagsFor([["a"]], 0)).toEqual([]);
  });
});

describe("stripChapters", () => {
  it("removes the chapter lines, their heading and the trailing hashtags", () => {
    const description = [
      "A story about the sea.",
      "",
      "Chapters:",
      "0:00 Intro",
      "1:20 The storm",
      "12:01:05 The end",
      "",
      "Follow for more.",
      "",
      "#sea #story",
      "",
    ].join("\n");
    expect(stripChapters(description)).toBe("A story about the sea.\n\nFollow for more.");
  });

  it("keeps a line that only starts with a number", () => {
    expect(stripChapters("10 reasons to sail")).toBe("10 reasons to sail");
  });

  it("keeps a heading that has no chapters under it", () => {
    expect(stripChapters("Contents:\nNothing here")).toBe("Contents:\nNothing here");
  });
});
