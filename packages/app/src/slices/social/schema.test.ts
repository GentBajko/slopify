import { describe, expect, it } from "vitest";
import { runConfigSchema } from "../admission/schema.js";
import { defaultChoices } from "./defaults.js";
import { socialPlatforms } from "./model.js";
import {
  choiceBody,
  postChoiceSchema,
  redditFieldsSchema,
  resultBody,
  socialSettingsSchema,
} from "./schema.js";

const config = {
  title: "T",
  format: "16:9",
  sources: {
    research: "off",
    article: "provide",
    audio: "off",
    images: "off",
    thumbnail: "off",
    video: "off",
  },
  imagePrompts: [],
  values: {},
  provided: { article: "A." },
  silenceGapSeconds: 0,
  rendered: {},
};

describe("config.social", () => {
  it("leaves a config saved before posting without it", () => {
    const parsed = runConfigSchema.parse(config);
    expect(Object.hasOwn(parsed, "social")).toBe(false);
  });

  it("keeps the sites a project posts to", () => {
    const social = { x: defaultChoices.x, reddit: defaultChoices.reddit };
    const parsed = runConfigSchema.parse({ ...config, social });
    expect(parsed.social).toEqual(social);
    expect(runConfigSchema.parse(JSON.parse(JSON.stringify(parsed))).social).toEqual(social);
  });

  it("refuses a site Slopify doesn't post to", () => {
    expect(socialSettingsSchema.safeParse({ myspace: defaultChoices.x }).success).toBe(false);
  });

  it.each(socialPlatforms)("accepts the %s default", (platform) => {
    expect(postChoiceSchema.parse(defaultChoices[platform])).toEqual(defaultChoices[platform]);
  });

  it("refuses an unknown text source and a negative hashtag count", () => {
    expect(postChoiceSchema.safeParse({ ...defaultChoices.x, text: "poem" }).success).toBe(false);
    expect(postChoiceSchema.safeParse({ ...defaultChoices.x, hashtags: -1 }).success).toBe(false);
  });

  it("refuses a design id that could leave its folder", () => {
    const media = { designs: ["../secret"] };
    expect(postChoiceSchema.safeParse({ ...defaultChoices.x, media }).success).toBe(false);
  });
});

describe("bodies", () => {
  it("takes a project's own pick, not posting there, or back to the template's", () => {
    expect(choiceBody.parse({ choice: { off: true } }).choice).toEqual({ off: true });
    expect(choiceBody.parse({ choice: null }).choice).toBeNull();
    expect(choiceBody.parse({ choice: defaultChoices.bluesky }).choice).toEqual(
      defaultChoices.bluesky,
    );
    expect(choiceBody.safeParse({ choice: { off: false } }).success).toBe(false);
  });

  it("writes a subreddit without its r/", () => {
    const fields = redditFieldsSchema.parse({
      subreddit: " r/videos ",
      title: "T",
      flair: "",
      kind: "link",
    });
    expect(fields.subreddit).toBe("videos");
  });

  it("drops what a newer extension adds to its report", () => {
    const parsed = resultBody.parse({
      projectId: "p",
      platform: "x",
      state: "filled",
      extra: 1,
    });
    expect(parsed).toEqual({ projectId: "p", platform: "x", state: "filled" });
  });

  it("refuses a report of a state the extension never sets", () => {
    expect(resultBody.safeParse({ projectId: "p", platform: "x", state: "waiting" }).success).toBe(
      false,
    );
  });
});
