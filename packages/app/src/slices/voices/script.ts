import type { Message } from "../../kernel/ports/llm.js";
import { type Speaker, type VoiceFormat, voiceFormatLabels } from "./model.js";

// The script format, the one contract between the text model and the narration:
//
//   # Section title            a heading opens a section; sections are the chapters
//   Name: what they say        a turn: a speaker's name, a colon, their words
//   more of the same turn      a line straight under a turn continues it
//
// Blank lines separate turns and nothing else. A name matches a speaker case-insensitively
// and may be wrapped in ** as models like to. Square-bracketed stage directions are dropped
// from the spoken text, so "[laughs]" is never read aloud.

export interface ScriptTurn {
  // 1-based, in script order.
  readonly index: number;
  readonly speaker: string;
  readonly text: string;
  // The section the turn is in, -1 before the first heading.
  readonly section: number;
  // The turn's lines as written, for a turn that carries a table, a picture, an equation or
  // code for the narration to describe (`narration/blocks.ts`). Its `text` is the words.
  readonly markdown?: string | undefined;
}
export interface ScriptSection {
  readonly title: string;
  // The index of the section's first turn; a section with no turns is dropped.
  readonly firstTurn: number;
}
export interface Script {
  readonly turns: readonly ScriptTurn[];
  readonly sections: readonly ScriptSection[];
}
export type ScriptResult =
  | { readonly ok: true; readonly script: Script }
  | { readonly ok: false; readonly reason: string };

const heading = /^#{1,6}\s+(.+?)\s*#*\s*$/;
const turnLine = /^\*{0,2}([^:*\n]{1,60}?)\*{0,2}\s*:\s*\*{0,2}\s*(.*)$/;

export type NamedSpeaker = Pick<Speaker, "id" | "name">;

// With `keepMarkdown`, every turn also carries its lines as written (`markdown`).
export function parseScript(
  markdown: string,
  speakers: readonly NamedSpeaker[],
  keepMarkdown = false,
): ScriptResult {
  const byName = new Map(speakers.map((speaker) => [speaker.name.trim().toLowerCase(), speaker]));
  const names = speakers.map((speaker) => speaker.name.trim()).join(", ");
  const turns: { speaker: string; lines: string[]; section: number }[] = [];
  const sections: { title: string; firstTurn: number }[] = [];
  let open = false;
  for (const [at, raw] of markdown.replace(/\r\n?/g, "\n").split("\n").entries()) {
    const line = raw.trim();
    const number = at + 1;
    if (line === "") {
      open = false;
      continue;
    }
    const title = heading.exec(line);
    if (title !== null) {
      sections.push({ title: clean(title[1] ?? ""), firstTurn: turns.length + 1 });
      open = false;
      continue;
    }
    // Horizontal rules and the like carry no words.
    if (/^([-*_=~])\1{2,}$/.test(line)) {
      open = false;
      continue;
    }
    const turn = turnLine.exec(line);
    const speaker = turn === null ? undefined : byName.get((turn[1] ?? "").trim().toLowerCase());
    if (turn !== null && speaker !== undefined) {
      turns.push({ speaker: speaker.id, lines: [turn[2] ?? ""], section: sections.length - 1 });
      open = true;
      continue;
    }
    const last = turns.at(-1);
    if (open && last !== undefined) {
      last.lines.push(line);
      continue;
    }
    return {
      ok: false,
      reason:
        turn === null
          ? `Line ${String(number)} of the script is not a turn. Start every turn with a speaker's name and a colon (${names}), one turn per paragraph.`
          : `Line ${String(number)} of the script is spoken by "${(turn[1] ?? "").trim()}", who is not one of the speakers (${names}). Use only these names, or add the speaker under Speakers (Play → Narration, or Edit project → Providers).`,
    };
  }
  const spoken: ScriptTurn[] = [];
  for (const turn of turns) {
    const text = clean(turn.lines.join(" "));
    if (text === "") continue;
    spoken.push({
      index: spoken.length + 1,
      speaker: turn.speaker,
      text,
      section: turn.section,
      ...(keepMarkdown ? { markdown: turn.lines.join("\n") } : {}),
    });
  }
  if (spoken.length === 0)
    return {
      ok: false,
      reason: `The script has no spoken turns. Write each turn as a speaker's name, a colon and their words (${names}).`,
    };
  // A section keeps its place by its first turn that has words; one without words is dropped.
  const kept: ScriptSection[] = [];
  const sectionMap = new Map<number, number>();
  for (const [at, section] of sections.entries()) {
    const first = spoken.find((turn) => turn.section === at);
    if (first === undefined || section.title === "") continue;
    sectionMap.set(at, kept.length);
    kept.push({ title: section.title, firstTurn: first.index });
  }
  return {
    ok: true,
    script: {
      turns: spoken.map((turn) => ({ ...turn, section: sectionMap.get(turn.section) ?? -1 })),
      sections: kept,
    },
  };
}

// Emphasis, links and stage directions come out; the words stay.
function clean(text: string): string {
  return text
    .replace(/\[[^\]]*\]\([^)]*\)/g, (link) => link.slice(1, link.indexOf("]")))
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/(\*{1,3}|_{1,3})(\S(?:.*?\S)?)\1/g, "$2")
    .replace(/`/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// The script as plain text for the reading view and the Script download: the same format,
// normalised, so it parses back to itself.
export function formatScript(script: Script, speakers: readonly NamedSpeaker[]): string {
  const names = new Map(speakers.map((speaker) => [speaker.id, speaker.name.trim()]));
  const lines: string[] = [];
  for (const turn of script.turns) {
    const section = script.sections.find((one) => one.firstTurn === turn.index);
    if (section !== undefined) lines.push(`# ${section.title}`, "");
    lines.push(`${names.get(turn.speaker) ?? turn.speaker}: ${turn.text}`, "");
  }
  return `${lines.join("\n").trim()}\n`;
}

const formatGuidance: Readonly<Record<VoiceFormat, string>> = {
  audiobook:
    "An audiobook: the narrator reads the prose; characters speak only their own quoted dialogue.",
  podcast:
    "A podcast: the hosts talk with each other naturally, taking short turns, reacting and building on what the other said.",
  drama:
    "A radio drama: the narrator sets scenes briefly; the characters carry the story through what they say.",
  interview:
    "An interview or debate: the host asks and steers; guests answer at length and may disagree.",
};

export function scriptContract(format: VoiceFormat, speakers: readonly Speaker[]): string {
  return [
    `Write a script for ${voiceFormatLabels[format].toLowerCase()} narration. ${formatGuidance[format]}`,
    "Speakers (name - role):",
    ...speakers.map((speaker) => `- ${speaker.name.trim()} - ${speaker.role}`),
    "Format rules, followed exactly:",
    "- Every turn is one paragraph that starts with the speaker's name and a colon, e.g. `Name: words`.",
    "- Separate turns with a blank line. Use only the names above.",
    "- Start each section with a Markdown heading line (`# Title`); sections become chapters.",
    "- Write only words to be spoken: no stage directions, no bracketed notes, no lists or tables.",
  ].join("\n");
}

export function scriptMessages(
  format: VoiceFormat,
  speakers: readonly Speaker[],
  prompt: string,
  notes?: string,
): readonly Message[] {
  const trimmed = notes?.trim();
  return [
    { role: "system", content: scriptContract(format, speakers) },
    {
      role: "user",
      content:
        trimmed === undefined || trimmed === ""
          ? prompt
          : `Research notes\n\n${trimmed}\n\n${prompt}`,
    },
  ];
}
