import { describe, expect, it } from "vitest";
import { plainText } from "./plain.js";

// The narration source is plain text. The bar is what a TTS engine would say out loud, so every
// assertion here is about a character the engine must never reach.

const article = `# The Wreck of the *Mary Rose*

She sank in **1545**, and the [wreck](https://example.test/wreck) lay there
until 1982.

## Timeline

- 1510 — built in Portsmouth
- 1545 — lost off Southsea

1. Raised in 1982
2. Displayed in Portsmouth

Here is \`inline code\` and a block:

\`\`\`ts
const neverSpoken = 1;
\`\`\`

> A quote about the ship.

| Year | Event |
|---|---|
| 1545 | Sank |

![A photograph of the hull](hull.png)

Struck ~~through~~ and footnoted[^1].

[^1]: Never spoken either.
`;

describe("plainText", () => {
  it("unwraps headings, emphasis, links and lists into bare sentences", () => {
    const spoken = plainText(article);

    expect(spoken).toContain("The Wreck of the Mary Rose");
    expect(spoken).toContain("She sank in 1545, and the wreck lay there\nuntil 1982.");
    expect(spoken).toContain("1510 — built in Portsmouth");
    expect(spoken).toContain("Raised in 1982");
    expect(spoken).toContain("A quote about the ship.");
    expect(spoken).toContain("Struck through and footnoted.");
  });

  it("leaves nothing a TTS engine would read aloud as punctuation", () => {
    const spoken = plainText(article);

    for (const character of ["#", "*", "`", "|", "[", "]", "_", "~", "\\", ">"]) {
      expect(spoken).not.toContain(character);
    }
    // A link's text is spoken; the URL it pointed at is not.
    expect(spoken).not.toContain("https://example.test/wreck");
  });

  it("drops the constructs that are not prose at all", () => {
    const spoken = plainText(article);

    // Code, tables and footnote definitions carry no narration (strip-markdown's own
    // defaults for code and tables; the footnote marker goes with its definition).
    expect(spoken).not.toContain("neverSpoken");
    expect(spoken).not.toContain("Year");
    expect(spoken).not.toContain("Sank");
    expect(spoken).not.toContain("Never spoken either");
  });

  it("keeps an image's alt text, which is the only thing in it anyone could say", () => {
    expect(plainText("![A photograph of the hull](hull.png)\n")).toBe("A photograph of the hull\n");
  });

  it("answers nothing for nothing", () => {
    expect(plainText("")).toBe("");
    expect(plainText("   \n\n")).toBe("");
  });
});
