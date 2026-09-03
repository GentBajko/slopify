import { describe, expect, it } from "vitest";
import { splitEndMatter } from "./split.js";

// Find the first section whose heading is 'Sources Consulted' or 'Pronunciation Glossary'
// (case-insensitive); that section and everything after it are removed from the narration
// source and written as two separate files. Nothing is rewritten on the way, so the three parts
// always add back up to the article.

const both = `# Rope

Rope is twisted fibre.

## Knots

A bowline holds.

## Sources Consulted

- https://example.test/rope

## Pronunciation Glossary

- bowline /ˈboʊlɪn/
`;

function whole(markdown: string): string {
  const split = splitEndMatter(markdown);
  return split.body + split.sources + split.glossary;
}

describe("splitEndMatter", () => {
  it("cuts both end sections out of the body and keeps every character", () => {
    const split = splitEndMatter(both);

    expect(split.body).toBe("# Rope\n\nRope is twisted fibre.\n\n## Knots\n\nA bowline holds.\n\n");
    expect(split.sources).toBe("## Sources Consulted\n\n- https://example.test/rope\n\n");
    expect(split.glossary).toBe("## Pronunciation Glossary\n\n- bowline /ˈboʊlɪn/\n");
    expect(whole(both)).toBe(both);
  });

  it("matches the headings whatever their level and however they are cased", () => {
    const shouty = both
      .replace("## Sources Consulted", "# SOURCES CONSULTED")
      .replace("## Pronunciation Glossary", "###### pronunciation glossary");
    const split = splitEndMatter(shouty);

    expect(split.body).toBe("# Rope\n\nRope is twisted fibre.\n\n## Knots\n\nA bowline holds.\n\n");
    expect(split.sources).toContain("https://example.test/rope");
    expect(split.glossary).toContain("bowline");
    expect(whole(shouty)).toBe(shouty);
  });

  it("takes a bolded line as the heading it was meant to be", () => {
    const bolded = both.replace("## Sources Consulted", "**Sources Consulted:**");
    const split = splitEndMatter(bolded);

    expect(split.body).not.toContain("Sources Consulted");
    expect(split.sources).toBe("**Sources Consulted:**\n\n- https://example.test/rope\n\n");
    expect(whole(bolded)).toBe(bolded);
  });

  it("leaves an article with neither section whole", () => {
    const plain = "# Rope\n\nRope is twisted fibre.\n";
    const split = splitEndMatter(plain);

    expect(split.body).toBe(plain);
    expect(split.sources).toBe("");
    expect(split.glossary).toBe("");
  });

  it("cuts only the section that is there when the other is missing", () => {
    const glossaryOnly = `# Rope

Rope is twisted fibre.

## Pronunciation Glossary

- bowline /ˈboʊlɪn/
`;
    const split = splitEndMatter(glossaryOnly);

    expect(split.body).toBe("# Rope\n\nRope is twisted fibre.\n\n");
    expect(split.sources).toBe("");
    expect(split.glossary).toBe("## Pronunciation Glossary\n\n- bowline /ˈboʊlɪn/\n");
    expect(whole(glossaryOnly)).toBe(glossaryOnly);
  });

  it("removes everything after the first end heading, wherever the model put it", () => {
    const early = `# Rope

## Sources Consulted

- https://example.test/rope

## Knots

A bowline holds.
`;
    const split = splitEndMatter(early);

    // The cut takes that section and everything after it. A chapter the model
    // wrote below its sources list is end matter too, not narration.
    expect(split.body).toBe("# Rope\n\n");
    expect(split.sources).toContain("A bowline holds.");
    expect(split.glossary).toBe("");
    expect(whole(early)).toBe(early);
  });

  it("keeps a line that only looks like the heading", () => {
    const nearly = `# Rope

The Sources Consulted for this piece are at the end.

## Sources Consulted and Further Reading

- https://example.test/rope
`;
    const split = splitEndMatter(nearly);

    expect(split.body).toBe(nearly);
    expect(split.sources).toBe("");
    expect(split.glossary).toBe("");
  });

  it("files a second sources section under sources rather than losing it", () => {
    const twice = `${both}\n## Sources Consulted\n\n- https://example.test/more\n`;
    const split = splitEndMatter(twice);

    expect(split.sources).toContain("https://example.test/rope");
    expect(split.sources).toContain("https://example.test/more");
    expect(whole(twice).length).toBe(twice.length);
  });

  it("answers three empty parts for an empty article", () => {
    expect(splitEndMatter("")).toEqual({ body: "", sources: "", glossary: "" });
  });
});
