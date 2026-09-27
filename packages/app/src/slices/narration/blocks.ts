import type {
  Blockquote,
  Code,
  Html,
  List,
  Nodes,
  Paragraph,
  PhrasingContent,
  RootContent,
} from "mdast";
import { remark } from "remark";
import remarkGfm from "remark-gfm";

// The article as it will be spoken, block by block, for "Describe tables and figures in the
// narration". Flattening the Markdown (`article/plain.ts`) keeps the words of prose but has
// nothing to say about a table, a picture, an equation or a program: it drops them or reads
// their bare cells. Here the document is walked instead, and every block a listener cannot
// follow read aloud is kept whole for the text model to describe in a sentence or four
// (`narration/describe.ts`); everything else becomes plain spoken text.
//
// Deterministic: the same Markdown always gives the same blocks, so a description is cached by
// its block and an unchanged article never asks for one again. The article's end matter (the
// sources and the pronunciation glossary) is cut off before this runs (`article/split.ts`), as
// it is for the flattened text, so neither is ever narrated.

export const describedKinds = ["table", "figure", "diagram", "math", "code"] as const;
export type DescribedKind = (typeof describedKinds)[number];

export interface TextBlock {
  readonly kind: "text";
  readonly text: string;
}
export interface DescribedBlock {
  readonly kind: DescribedKind;
  // 1-based, in reading order among the described blocks: the `n` of `narration:describe:<n>`.
  readonly index: number;
  // What the text model reads: the block's own Markdown (a figure's alt text, caption and
  // legend), with any equation written as it was.
  readonly source: string;
  // The heading the block sits under, which tells the model what it is about.
  readonly section: string | null;
  // A figure's picture as the article names it (a file name or a URL).
  readonly image?: string | undefined;
  // A code block's language, as its fence names it.
  readonly lang?: string | undefined;
  // A paragraph whose formulas are said in words, rather than an equation on its own.
  readonly inline?: true | undefined;
}
export type NarrationBlock = TextBlock | DescribedBlock;

export interface BlockOptions {
  // Code blocks are summarised in a sentence or two by default; "skip" leaves them out.
  readonly code?: "describe" | "skip" | undefined;
  // The project language: the connecting words of a list ("First, … Then, …") are English
  // and only English gets them; another language hears each item as its own sentence.
  readonly language?: string | undefined;
}

// Private-use characters around an equation's number while the document is parsed, so an
// underscore or asterisk inside an equation is never read as emphasis.
const open = "\uE000";
const close = "\uE001";
const placeholder = /\uE000(\d+)\uE001/g;

export function narrationBlocks(markdown: string, options: BlockOptions = {}): NarrationBlock[] {
  const { text: protectedText, math } = protectMath(markdown);
  const tree = remark().use(remarkGfm).parse(protectedText);
  const walker = new Walker(protectedText, math, options);
  walker.blocks(tree.children);
  return walker.out;
}

export function describedBlocks(blocks: readonly NarrationBlock[]): DescribedBlock[] {
  return blocks.filter((block): block is DescribedBlock => block.kind !== "text");
}

// The narration: the text blocks as they are and each described block as its spoken passage,
// one paragraph each, in the flattened text's own shape. Null while any passage is unknown.
export function spokenNarration(
  blocks: readonly NarrationBlock[],
  passage: (block: DescribedBlock) => string | null,
): string | null {
  const paragraphs: string[] = [];
  for (const block of blocks) {
    const text = block.kind === "text" ? block.text : passage(block);
    if (text === null) return null;
    const clean = text.trim();
    if (clean !== "") paragraphs.push(clean);
  }
  return paragraphs.length === 0 ? "" : `${paragraphs.join("\n\n")}\n`;
}

interface MathSpan {
  readonly tex: string;
  readonly written: string;
  readonly display: boolean;
}

function protectMath(markdown: string): { text: string; math: MathSpan[] } {
  // Code keeps its dollars: a shell variable is not an equation.
  const code: [number, number][] = [];
  const visit = (node: Nodes): void => {
    if ((node.type === "code" || node.type === "inlineCode") && node.position) {
      code.push([node.position.start.offset ?? 0, node.position.end.offset ?? 0]);
      return;
    }
    if ("children" in node) for (const child of node.children) visit(child);
  };
  visit(remark().use(remarkGfm).parse(markdown));
  const math: MathSpan[] = [];
  const pattern =
    /\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]|\\\(([\s\S]+?)\\\)|(?<![\\$\w])\$(?![\s$])([^$\n]+?)(?<![\s\\])\$(?![\w$])/g;
  const text = markdown.replace(pattern, (written, a, b, c, d, at: number) => {
    if (code.some(([from, to]) => at < to && at + written.length > from)) return written;
    const tex = String(a ?? b ?? c ?? d ?? "").trim();
    math.push({ tex, written, display: a !== undefined || b !== undefined });
    return `${open}${String(math.length - 1)}${close}`;
  });
  return { text, math };
}

class Walker {
  readonly out: NarrationBlock[] = [];
  private section: string | null = null;
  private described = 0;

  constructor(
    private readonly markdown: string,
    private readonly math: readonly MathSpan[],
    private readonly options: BlockOptions,
  ) {}

  blocks(nodes: readonly RootContent[]): void {
    for (let at = 0; at < nodes.length; at++) {
      const node = nodes[at];
      if (node === undefined) continue;
      switch (node.type) {
        case "heading": {
          const text = this.spoken(node.children).replace(placeholder, (_all, n: string) => {
            const tex = this.math[Number(n)]?.tex ?? "";
            return readable(tex) ?? tex;
          });
          this.section = text.trim() || this.section;
          this.text(text);
          break;
        }
        case "paragraph": {
          if (node.children.some((child) => child.type === "image")) {
            // A caption or legend written under the picture belongs to it.
            const captions: Paragraph[] = [];
            while (captions.length < 2) {
              const next = nodes[at + captions.length + 1];
              if (next?.type !== "paragraph" || !isCaption(next, this.markdown)) break;
              captions.push(next);
            }
            at += captions.length;
            this.figure(node, captions);
            break;
          }
          this.paragraph(node);
          break;
        }
        case "list":
          this.list(node);
          break;
        case "blockquote":
          this.quote(node);
          break;
        case "table":
          this.describe("table", this.source(node));
          break;
        case "code":
          this.code(node);
          break;
        case "html":
          this.html(node);
          break;
        // A footnote's text, a link definition, a rule and front matter are never spoken.
        default:
          break;
      }
    }
  }

  private text(text: string): void {
    const clean = tidy(text);
    if (clean !== "") this.out.push({ kind: "text", text: clean });
  }

  private describe(
    kind: DescribedKind,
    source: string,
    extra: Pick<DescribedBlock, "image" | "lang" | "inline"> = {},
  ): void {
    this.described += 1;
    this.out.push({
      kind,
      index: this.described,
      source: source.trim(),
      section: this.section,
      ...(extra.image === undefined ? {} : { image: extra.image }),
      ...(extra.lang === undefined ? {} : { lang: extra.lang }),
      ...(extra.inline === undefined ? {} : { inline: extra.inline }),
    });
  }

  private paragraph(node: Paragraph): void {
    const raw = this.spoken(node.children);
    const only = /^\s*\uE000(\d+)\uE001\s*$/.exec(raw);
    const alone = only === null ? undefined : this.math[Number(only[1])];
    if (alone !== undefined) {
      this.describe("math", alone.written);
      return;
    }
    const spans = [...raw.matchAll(placeholder)].map((match) => this.math[Number(match[1])]);
    if (spans.some((span) => span === undefined || span.display || readable(span.tex) === null)) {
      // Said in words by the model, the rest of the paragraph with it.
      this.describe("math", this.source(node), { inline: true });
      return;
    }
    this.text(
      raw.replace(
        placeholder,
        (_all, n: string) => readable(this.math[Number(n)]?.tex ?? "") ?? "",
      ),
    );
  }

  private figure(node: Paragraph, captions: readonly Paragraph[]): void {
    const image = node.children.find((child) => child.type === "image");
    const lines: string[] = [];
    for (const child of node.children)
      if (child.type === "image" && child.alt?.trim()) lines.push(`Alt text: ${child.alt.trim()}`);
    const beside = tidy(
      this.restore(this.spoken(node.children.filter((child) => child.type !== "image"))),
    );
    if (beside !== "") lines.push(`Caption: ${beside}`);
    for (const caption of captions) {
      const text = tidy(this.restore(this.spoken(caption.children)));
      if (text !== "") lines.push(`Caption: ${text}`);
    }
    this.describe("figure", lines.join("\n") || "A picture with no caption.", {
      ...(image?.url ? { image: image.url } : {}),
    });
  }

  private html(node: Html): void {
    // An article pasted from the web may carry its figures as HTML.
    const img = /<img\b[^>]*>/i.exec(node.value);
    if (img === null) return;
    const attribute = (name: string): string | undefined =>
      new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, "i")
        .exec(img[0])
        ?.slice(2)
        .find(Boolean);
    const caption = /<figcaption[^>]*>([\s\S]*?)<\/figcaption>/i.exec(node.value)?.[1];
    const lines = [
      ...(attribute("alt")?.trim() ? [`Alt text: ${attribute("alt")?.trim() ?? ""}`] : []),
      ...(caption?.trim() ? [`Caption: ${tidy(caption.replace(/<[^>]+>/g, " "))}`] : []),
    ];
    const src = attribute("src");
    this.describe("figure", lines.join("\n") || "A picture with no caption.", {
      ...(src ? { image: src } : {}),
    });
  }

  private code(node: Code): void {
    const lang = node.lang?.trim().toLowerCase() ?? "";
    const source = this.restore(this.source(node));
    const named = lang === "" ? {} : { lang };
    if (
      lang === "mermaid" ||
      (["", "text", "txt", "ascii", "plain"].includes(lang) && isDrawing(node.value))
    )
      this.describe("diagram", source, named);
    else if (["math", "latex", "tex", "katex"].includes(lang)) this.describe("math", source);
    else if (this.options.code !== "skip") this.describe("code", source, named);
  }

  private quote(node: Blockquote): void {
    const start = this.out.length;
    this.blocks(node.children);
    // The quoted words are spoken in quotation marks, which a voice reads as a quote.
    for (let at = start; at < this.out.length; at++) {
      const block = this.out[at];
      if (block?.kind === "text") this.out[at] = { kind: "text", text: `“${block.text}”` };
    }
  }

  private list(node: List): void {
    const items: string[] = [];
    const flush = (): void => {
      if (items.length > 0) this.text(this.sentences(items.splice(0), node.ordered === true));
    };
    for (const item of node.children) {
      const words: string[] = [];
      for (const child of item.children) {
        if (child.type === "paragraph" && !child.children.some((one) => one.type === "image")) {
          const raw = this.spoken(child.children);
          if (!raw.includes(open)) {
            words.push(raw);
            continue;
          }
        }
        // A table, a picture or a nested list inside an item is its own block, after the
        // item's words.
        if (words.length > 0) items.push(tidy(words.splice(0).join(" ")));
        flush();
        this.blocks([child]);
      }
      if (words.length > 0) items.push(tidy(words.join(" ")));
    }
    flush();
  }

  private sentences(items: readonly string[], ordered: boolean): string {
    const english = this.options.language === undefined || this.options.language === "en";
    const kept = items.filter((item) => item !== "");
    if (!english || kept.length < 2) return kept.map(sentence).join(" ");
    if (ordered)
      return kept
        .map((item, at) =>
          sentence(`${at === 0 ? "First" : at === kept.length - 1 ? "Finally" : "Then"}, ${item}`),
        )
        .join(" ");
    // Short items read as one sentence, "a, b and c"; longer ones one sentence each.
    if (kept.every((item) => item.split(/\s+/).length <= 5 && !/[.!?;:,—–]/.test(item))) {
      const joined = `${kept.slice(0, -1).join(", ")} and ${kept.at(-1) ?? ""}`;
      return sentence(joined.charAt(0).toUpperCase() + joined.slice(1));
    }
    return kept.map(sentence).join(" ");
  }

  // The words of inline Markdown: link text without its address, no footnote markers, no
  // bare URLs. Equations stay as placeholders for the caller to decide on.
  private spoken(nodes: readonly PhrasingContent[]): string {
    return nodes.map((node) => this.inline(node)).join("");
  }

  private inline(node: PhrasingContent): string {
    switch (node.type) {
      case "text":
      case "inlineCode":
        return node.value;
      case "emphasis":
      case "strong":
      case "delete":
        return this.spoken(node.children);
      case "link": {
        const text = this.spoken(node.children);
        return isAddress(text, node.url) ? "" : text;
      }
      case "linkReference": {
        const text = this.spoken(node.children);
        return /^\s*\^?\d+\s*$/.test(text) ? "" : text;
      }
      case "image":
      case "imageReference":
        return node.alt ?? "";
      case "break":
        return "\n";
      default:
        return "";
    }
  }

  private source(node: Nodes): string {
    const from = node.position?.start.offset;
    const to = node.position?.end.offset;
    return from === undefined || to === undefined
      ? ""
      : this.restore(this.markdown.slice(from, to));
  }

  private restore(text: string): string {
    return text.replace(placeholder, (_all, n: string) => this.math[Number(n)]?.written ?? "");
  }
}

function isCaption(node: Paragraph, markdown: string): boolean {
  if (node.children.length === 1 && node.children[0]?.type === "emphasis") return true;
  const from = node.position?.start.offset ?? 0;
  const head = markdown.slice(from, from + 40).replace(/^[*_\s]+/, "");
  return /^(figure|fig\.|chart|graph|diagram|image|legend|caption|source)\b/i.test(head);
}

// An ASCII or box-drawing chart in a plain fence: box characters, or lines that are mostly
// rules and bars.
function isDrawing(value: string): boolean {
  if (/[─│┌┐└┘├┤┬┴┼═║╔╗╚╝▲▼►◄█░▒▓]/.test(value)) return true;
  const lines = value.split("\n").filter((line) => line.trim() !== "");
  return (
    lines.filter((line) => /[-+|*]{3,}|[|+].*[|+]/.test(line)).length >=
    Math.max(3, lines.length / 2)
  );
}

// A link whose text is its own address, or any bare URL: nothing a listener can use.
function isAddress(text: string, url: string): boolean {
  const clean = text.trim();
  return clean === "" || clean === url || /^(https?:\/\/|www\.|mailto:)/i.test(clean);
}

const greek =
  /\\(alpha|beta|gamma|delta|epsilon|zeta|eta|theta|iota|kappa|lambda|mu|nu|xi|pi|rho|sigma|tau|upsilon|phi|chi|psi|omega|Gamma|Delta|Theta|Lambda|Xi|Pi|Sigma|Phi|Psi|Omega)\b/g;

// A short inline symbol read as it is written ("$T$" is "T", "$\alpha$" is "alpha"), or null
// when it is a formula to be said in words.
function readable(tex: string): string | null {
  const plain = tex.replace(greek, (_all, name: string) => name.toLowerCase()).trim();
  return plain.length <= 20 && /^[\p{L}\p{N}\s.,%]*$/u.test(plain) ? plain : null;
}

function sentence(text: string): string {
  const clean = text.trim();
  return clean === "" || /[.!?…:;]["”’)]?$/.test(clean) ? clean : `${clean}.`;
}

// Footnote markers and bare addresses out, then the spacing they leave behind.
function tidy(text: string): string {
  return text
    .replace(/\s?\[(?:\^?[\w-]+)(?:\s*[,–-]\s*\^?\d+)*\](?!\()/g, (marker) =>
      /\[\^|\[\d/.test(marker) ? "" : marker,
    )
    .replace(/\s?\b(?:https?:\/\/|www\.)[^\s)]+/g, "")
    .replace(/[ \t]+([.,;:!?])/g, "$1")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\(\s*\)/g, "")
    .trim();
}
