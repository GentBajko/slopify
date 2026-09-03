import { remark } from "remark";
import remarkGfm from "remark-gfm";
import { plainText } from "./plain.js";

// The sources list and the pronunciation glossary are cut out of the narration source and
// stored as files of their own, so the narration never reaches them. The stored article
// keeps them: its markdown is never edited.
//
// The heading is found in the parsed document rather than by scanning lines: remark is
// already here for the plain-text conversion, it settles what a heading is at any level,
// and it will not mistake a sentence that mentions the words for a section of its own.

export interface EndMatter {
  // The three parts always concatenate back into the article they came from.
  readonly body: string;
  readonly sources: string;
  readonly glossary: string;
}

type Part = "sources" | "glossary";

// The two end-matter sections. The comparison is on the heading's own text, so "## Sources
// Consulted", "# SOURCES CONSULTED" and "**Sources Consulted:**" are one heading and
// "## Sources Consulted and Further Reading" is not.
const endHeadings: Readonly<Record<string, Part>> = {
  "sources consulted": "sources",
  "pronunciation glossary": "glossary",
};

interface Mark {
  readonly part: Part;
  readonly at: number;
}

export function splitEndMatter(markdown: string): EndMatter {
  const marks = endMatterMarks(markdown);
  const first = marks[0];
  if (first === undefined) {
    return { body: markdown, sources: "", glossary: "" };
  }
  const parts: Record<Part, string> = { sources: "", glossary: "" };
  for (const [index, mark] of marks.entries()) {
    // Everything up to the next end heading belongs to this one, so a chapter the model
    // wrote below its sources list travels with the sources rather than being narrated.
    parts[mark.part] += markdown.slice(mark.at, marks[index + 1]?.at ?? markdown.length);
  }
  return { body: markdown.slice(0, first.at), sources: parts.sources, glossary: parts.glossary };
}

function endMatterMarks(markdown: string): readonly Mark[] {
  const tree = remark().use(remarkGfm).parse(markdown);
  const marks: Mark[] = [];
  for (const node of tree.children) {
    // A paragraph counts as well as a heading: a model that answers with a bold line
    // rather than a `#` still meant it as the section's title.
    if (node.type !== "heading" && node.type !== "paragraph") {
      continue;
    }
    const at = node.position?.start.offset;
    const to = node.position?.end.offset;
    if (at === undefined || to === undefined) {
      continue;
    }
    const part = partOf(markdown.slice(at, to));
    if (part !== undefined) {
      marks.push({ part, at });
    }
  }
  return marks;
}

function partOf(source: string): Part | undefined {
  // The heading's own markup is dropped by the same conversion the narration source uses,
  // so nothing here has to know what a heading looks like.
  const heading = plainText(source).trim().toLowerCase().replace(/:$/, "");
  return endHeadings[heading];
}
