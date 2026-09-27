import { describe, expect, it } from "vitest";
import {
  channelLinksProblem,
  fillPlaceholders,
  mergeLinks,
  placeholderParts,
} from "./placeholders.js";

const links = [
  { name: "Patreon", url: "https://patreon.com/me" },
  { name: "Previous video", url: "https://youtu.be/old" },
];

describe("fillPlaceholders", () => {
  it("fills known placeholders without regard to case or spacing", () => {
    expect(
      fillPlaceholders("Support me: {{Patreon}}\nLast time: {{ previous  VIDEO }}", links),
    ).toEqual({
      text: "Support me: https://patreon.com/me\nLast time: https://youtu.be/old",
      unknown: [],
    });
  });

  it("keeps an unknown placeholder as typed and names it once", () => {
    expect(fillPlaceholders("{{Discord}} and {{discord}} and {{Patreon}}", links)).toEqual({
      text: "{{Discord}} and {{discord}} and https://patreon.com/me",
      unknown: ["Discord"],
    });
  });

  it("leaves text without placeholders alone, and single braces are not placeholders", () => {
    expect(fillPlaceholders("Plain {text} here", links)).toEqual({
      text: "Plain {text} here",
      unknown: [],
    });
  });

  it("splits the text into parts for highlighting", () => {
    expect(placeholderParts("a {{Patreon}} b {{Nope}}", links)).toEqual([
      { kind: "text", text: "a " },
      { kind: "placeholder", raw: "{{Patreon}}", name: "Patreon", url: "https://patreon.com/me" },
      { kind: "text", text: " b " },
      { kind: "placeholder", raw: "{{Nope}}", name: "Nope", url: undefined },
    ]);
  });
});

describe("mergeLinks", () => {
  it("lets a project's own link win over the Settings one of the same name", () => {
    expect(
      mergeLinks(links, [
        { name: "previous video", url: "https://youtu.be/this-series" },
        { name: "Blank", url: " " },
      ]),
    ).toEqual([
      { name: "previous video", url: "https://youtu.be/this-series" },
      { name: "Patreon", url: "https://patreon.com/me" },
    ]);
  });
});

describe("channelLinksProblem", () => {
  it("accepts a good list and names what is wrong with a bad one", () => {
    expect(channelLinksProblem(links)).toBeUndefined();
    expect(channelLinksProblem([{ name: " ", url: "https://a.b" }])).toMatch(/has no name/u);
    expect(channelLinksProblem([...links, { name: "PATREON", url: "https://x.y" }])).toMatch(
      /Two links are named/u,
    );
    expect(channelLinksProblem([{ name: "{{Patreon}}", url: "https://a.b" }])).toMatch(
      /contains \{ or \}/u,
    );
    expect(channelLinksProblem([{ name: "Discord", url: "discord.gg/abc" }])).toMatch(
      /not a web address/u,
    );
    expect(channelLinksProblem([{ name: "Discord", url: "" }])).toMatch(/has no address/u);
  });
});
