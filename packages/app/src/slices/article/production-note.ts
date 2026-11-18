// A model that works as an agent (the Claude Code provider) sometimes opens its answer with a
// line about its own work - "I've read all sixteen documents in full and am now writing the
// narration" - before the text it was asked for. Kept, that line is narrated, and asking for
// the text again only brings a new one like it. So it goes before the answer is kept.
//
// Conservative by design: a paragraph goes only when it is short and plainly about the work -
// the model saying what it read or is writing, naming the documents, sources, article or
// narration - or announces the text ("Here is the narration:"). A storyteller who says "I"
// keeps every word unless the sentence is also about the files. With a heading in the text,
// the notes before the first heading go; without one, only a first paragraph that is a note.
// The text is never left empty.

// ceiling: characters. A note is a sentence or two; a longer paragraph is narration.
const noteLength = 300;
// ceiling: paragraphs dropped before the first heading.
const notesBefore = 4;

const announcement =
  /^here(?:'s| is| are)\s+(?:the|your|my)\s+(?:[\w-]+\s+){0,3}?(?:article|narration|script|draft|intro|outro|end matter)\b/i;
const workStatement =
  /(?:\bI(?:'ve|'m|'ll|'d)?|\bI (?:have|am|will|had)|\blet me|\bnow|^|[.!?:]\s+)\s*(?:(?:now|just|also|fully|carefully|then|finished|done)\s+)*(?:read|reading|reviewed|reviewing|gone through|went through|been through|going through|looked (?:at|over|through)|studied|checked|drafted|drafting|draft|written|writing|write|compose|composing|produced|producing|prepare|preparing)\b/i;
const workNoun =
  /\b(?:documents?|sources?|notes|research|files?|brief|prompt|instructions|narration|article|script|draft|end matter|outline|attachments?|intro|outro)\b/i;
// A note opens on the model itself ("I", "let me", "now") or on the verb ("Writing the script
// now."); narration that only goes on to mention a document doesn't.
const noteOpening =
  /^\W*(?:okay|ok|alright|sure|great|right|done|i\b|i'|let me|now|writing|drafting|reading|composing)/i;
const rule = /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/;
const headingLine = /^#{1,6}\s/m;

export function withoutProductionNote(text: string): string {
  const hasHeading = headingLine.test(text);
  let rest = text;
  let dropped = 0;
  for (;;) {
    const block = firstBlock(rest);
    if (block === undefined) break;
    if (dropped > 0 && rule.test(block.text)) {
      rest = block.after;
      continue;
    }
    if (!isNote(block.text) || block.after.trim() === "") break;
    rest = block.after;
    dropped += 1;
    if (!hasHeading || dropped >= notesBefore) break;
  }
  return dropped === 0 ? text : rest;
}

function isNote(paragraph: string): boolean {
  const text = paragraph.replace(/[‘’]/g, "'").replace(/\s+/g, " ").trim();
  if (text === "" || text.length > noteLength || headingLine.test(text)) return false;
  if (announcement.test(text)) return true;
  return noteOpening.test(text) && workStatement.test(text) && workNoun.test(text);
}

// The first paragraph: its lines up to a blank line or a heading, and the text after it from
// its next non-blank line.
function firstBlock(text: string): { text: string; after: string } | undefined {
  const lines = text.replace(/^(?:[ \t]*\r?\n)+/, "").split("\n");
  if (lines.length === 1 && lines[0]?.trim() === "") return undefined;
  let end = 1;
  if (!headingLine.test(lines[0] ?? "")) {
    while (end < lines.length) {
      const line = lines[end] ?? "";
      if (line.trim() === "" || headingLine.test(line)) break;
      end += 1;
    }
  }
  return {
    text: lines.slice(0, end).join("\n"),
    after: lines
      .slice(end)
      .join("\n")
      .replace(/^(?:[ \t]*\r?\n)+/, ""),
  };
}
