import { remark } from "remark";
import remarkGfm from "remark-gfm";
import stripMarkdown from "strip-markdown";

// ceiling: conversions remembered. The same article is converted again every time a run plans
// its work, which is several times a step; a long article took seconds each time, on the
// thread that answers the page. The oldest goes first.
const remembered = 64;
const conversions = new Map<string, string>();

export function plainText(markdown: string): string {
  const known = conversions.get(markdown);
  if (known !== undefined) return known;
  const text = convert(markdown);
  conversions.set(markdown, text);
  while (conversions.size > remembered) {
    const oldest = conversions.keys().next().value;
    if (oldest === undefined) break;
    conversions.delete(oldest);
  }
  return text;
}

function convert(markdown: string): string {
  const processor = remark().use(remarkGfm).use(stripMarkdown);
  const tree = processor.runSync(processor.parse(markdown));
  const paragraphs = tree.children
    .map((node) => {
      if (node.type !== "paragraph")
        throw new Error(
          "Slopify hit an internal error (the article couldn't be turned into plain text). Try again; if it happens again, use Download diagnostics in Settings and report it.",
        );
      return node.children
        .map((child) => {
          if (child.type !== "text")
            throw new Error(
              "Slopify hit an internal error (the article couldn't be turned into plain text). Try again; if it happens again, use Download diagnostics in Settings and report it.",
            );
          return child.value;
        })
        .join("");
    })
    .filter((text) => text.trim() !== "");
  return paragraphs.length === 0 ? "" : paragraphs.join("\n\n") + "\n";
}
