import { describe, expect, it } from "vitest";
import { describedBlocks, narrationBlocks } from "./blocks.js";
import { describeMessages, spokenPassage } from "./describe.js";

const first = (markdown: string) => {
  const block = describedBlocks(narrationBlocks(markdown))[0];
  if (block === undefined) throw new Error("No described block");
  return block;
};

describe("describeMessages", () => {
  it("asks for a table's pattern and notable values, never row by row", () => {
    const [system, user] = describeMessages(
      first("## Seeds\n\n| Seed | Rivers |\n|---|---|\n| 1 | 12 |\n"),
      "",
      undefined,
    );
    expect(system?.content).toContain("give the pattern and the notable values");
    expect(system?.content).not.toContain("Style guidance");
    expect(user?.content).toBe("Section: Seeds\n\n| Seed | Rivers |\n|---|---|\n| 1 | 12 |");
  });

  it("asks for an equation's meaning in words", () => {
    const [system, user] = describeMessages(first("$$E = k (T_s - T_a) / h$$\n"), "", undefined);
    expect(system?.content).toContain("not symbol by symbol");
    expect(user?.content).toBe("$$E = k (T_s - T_a) / h$$");
    const [inline] = describeMessages(first("It grows as $E = kT^2$ does.\n"), "", undefined);
    expect(inline?.content).toContain("Rewrite this paragraph so it can be read aloud");
  });

  it("asks for a figure's meaning from its caption and never a bare 'Figure 3 shows'", () => {
    const [system, user] = describeMessages(
      first("![Relief](relief.png)\n\n*Figure 3: Elevation, blue low, red high.*\n"),
      "",
      undefined,
    );
    expect(system?.content).toContain(
      "Never say that a figure shows something without saying what",
    );
    expect(user?.content).toContain("Caption: Figure 3: Elevation, blue low, red high.");
  });

  it("asks for a one- or two-sentence summary of code, naming its language", () => {
    const [system, user] = describeMessages(
      first("```rust\nfn carve(h: &mut [f32]) {}\n```\n"),
      "",
      undefined,
    );
    expect(system?.content).toContain("one or two sentences");
    expect(user?.content).toContain("Language of the code: rust");
  });

  it("adds the Narration Preparation prompt as style guidance and the project language", () => {
    const [system] = describeMessages(first("| a |\n|---|\n| 1 |\n"), "Warm and slow.", "fr");
    expect(system?.content).toContain("Style guidance for the narration");
    expect(system?.content).toContain("Warm and slow.");
    expect(system?.content).toMatch(/French/);
  });
});

describe("spokenPassage", () => {
  it("leaves nothing a voice would read as punctuation", () => {
    expect(spokenPassage('"**Brest** has the larger range.\n\n- Dover is second."')).toBe(
      "Brest has the larger range. Dover is second.",
    );
  });
});
