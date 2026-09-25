import { remark } from "remark";
import remarkGfm from "remark-gfm";
import stripMarkdown from "strip-markdown";

export function plainText(markdown: string): string {
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
