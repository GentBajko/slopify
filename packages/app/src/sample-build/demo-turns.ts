import { createHash } from "node:crypto";
import { normalizeNarrationText } from "../slices/narration/plan.js";
import { sourceSentences, validatePreparation } from "../slices/narration/preparation.js";
import { prepareRequests } from "../slices/narration/steering.js";
import { parseScript } from "../slices/voices/script.js";
import type { Demo } from "./demos.js";

// What a demo's narration asks the voice to say, worked out with the pipeline's own code: the
// script's turns, each turn's delivery cues turned into Inworld tags by the preparation step's
// request builder. The voices script speaks exactly these requests ahead of the build, and the
// build's stand-in voice answers each request with the file made for it.

export const demoVoiceModel = "inworld-tts-2";
// Inworld TTS-2's request limit in the bundled catalogue; every demo turn is far below it.
const maxCharacters = 10_000;

export interface DemoRequest {
  readonly turn: number;
  readonly speaker: string;
  readonly voice: string;
  readonly model: string;
  // What the voice is sent, tags included, and what it says, tags left out.
  readonly text: string;
  readonly spokenText: string;
  readonly file: string;
}

// A spoken request's file is named by its voice and words, so editing the script keeps every
// turn it did not change and speaks only the new ones.
export function requestFile(voice: string, text: string): string {
  return `turn-${createHash("sha256").update(`${voice}\n${demoVoiceModel}\n${text}`).digest("hex").slice(0, 12)}.mp3`;
}

export function demoScript(demo: Demo): string {
  return demo.attributed ?? demo.article;
}

export function demoRequests(demo: Demo): readonly DemoRequest[] {
  const parsed = parseScript(demoScript(demo), demo.speakers);
  if (!parsed.ok) throw new Error(`The ${demo.id} demo's script is not a script: ${parsed.reason}`);
  return parsed.script.turns.flatMap((turn) => {
    const speaker = demo.speakers.find((one) => one.id === turn.speaker);
    if (speaker === undefined) throw new Error(`No speaker ${turn.speaker}.`);
    const text = normalizeNarrationText(turn.text);
    const checked = validatePreparation(demoCues(demo, turn.index), text);
    if (!checked.ok)
      throw new Error(`Turn ${String(turn.index)} of the ${demo.id} demo: ${checked.reason}`);
    const prepared = prepareRequests(text, checked.cues, maxCharacters);
    if (!prepared.ok) throw new Error(prepared.reason);
    return prepared.requests.map((request) => ({
      turn: turn.index,
      speaker: speaker.id,
      voice: speaker.voice,
      model: demoVoiceModel,
      text: request.text,
      spokenText: request.spokenText,
      file: requestFile(speaker.voice, request.text),
    }));
  });
}

// The preparation step's answer for one turn, as the text model would give it.
export function demoCues(demo: Demo, turn: number): string {
  return JSON.stringify({ cues: demo.delivery[turn] ?? [] });
}

// The preparation step's answer for a request, found by the turn's sentences: the demo's
// scripted text model gets the sentences, not the turn number.
export function demoCuesFor(demo: Demo, sentences: readonly string[]): string {
  const parsed = parseScript(demoScript(demo), demo.speakers);
  if (!parsed.ok) throw new Error(parsed.reason);
  const wanted = sentences.join("");
  const turn = parsed.script.turns.find(
    (one) =>
      sourceSentences(normalizeNarrationText(one.text))
        .map((sentence) => sentence.text)
        .join("") === wanted,
  );
  if (turn === undefined)
    throw new Error(`The ${demo.id} demo has no turn that reads "${wanted.slice(0, 60)}".`);
  return demoCues(demo, turn.index);
}
