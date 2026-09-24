import { z } from "zod";
import type { Message } from "../../kernel/ports/llm.js";

export type NarrationSegment = "body" | "intro" | "outro";
export interface SourceSentence {
  readonly sentence: number;
  readonly text: string;
}
const sentence = z.number().int().positive();
const instruction = z
  .string()
  .min(1)
  .max(240)
  .refine((text) => text.trim().length > 0 && !/[[\]<>*_`~#\p{Cc}]/u.test(text));
const cueSchema = z.discriminatedUnion("kind", [
  z.object({ sentence, kind: z.literal("instruction"), text: instruction }).strict(),
  z.object({ sentence, kind: z.literal("reset") }).strict(),
  z
    .object({
      sentence,
      kind: z.literal("sound"),
      sound: z.enum(["laugh", "breathe", "clear throat", "sigh", "cough", "yawn"]),
    })
    .strict(),
]);
const answerSchema = z.object({ cues: z.array(cueSchema) }).strict();
export type Cue = Readonly<z.infer<typeof cueSchema>>;
export type CueResult =
  | { readonly ok: true; readonly cues: readonly Cue[] }
  | { readonly ok: false; readonly reason: string };

export function sourceSentences(source: string): readonly SourceSentence[] {
  return Array.from(
    new Intl.Segmenter("en", { granularity: "sentence" }).segment(source),
    (part, index) => ({ sentence: index + 1, text: part.segment }),
  );
}

export function validatePreparation(answer: string, source: string): CueResult {
  let raw: unknown;
  try {
    raw = JSON.parse(answer);
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    return { ok: false, reason: "Return a JSON object containing only cues." };
  }
  const parsed = answerSchema.safeParse(raw);
  if (!parsed.success)
    return { ok: false, reason: "Use only the documented cue fields and values." };
  const count = sourceSentences(source).length;
  const persistent = new Set<number>();
  const sounds = new Set<string>();
  let previous = 0;
  for (const cue of parsed.data.cues) {
    if (cue.sentence > count || cue.sentence < previous)
      return { ok: false, reason: "Cue sentence numbers must be in source order and in range." };
    previous = cue.sentence;
    if (cue.kind !== "sound") {
      if (persistent.has(cue.sentence))
        return { ok: false, reason: "Use at most one instruction or reset per sentence." };
      persistent.add(cue.sentence);
    } else {
      const key = `${cue.sentence}:${cue.sound}`;
      if (sounds.has(key))
        return { ok: false, reason: "Do not repeat a sound at the same sentence." };
      sounds.add(key);
    }
  }
  return { ok: true, cues: parsed.data.cues };
}

const contract = [
  'Return JSON only: {"cues":[...]}.',
  "Each cue has sentence (a supplied 1-based index) and kind.",
  "instruction adds text: a short English delivery direction without brackets or markup.",
  "reset has no other fields. sound adds sound: laugh, breathe, clear throat, sigh, cough or yawn.",
  "Order cues by sentence. At most one instruction or reset per sentence.",
  "Never return or rewrite narration. Do not translate, correct, abbreviate or add dialogue.",
  "Use cues sparingly; an empty cues array is valid. Combine simultaneous directions.",
].join("\n");
export function preparationMessages(prompt: string, source: string): readonly Message[] {
  return [
    { role: "system", content: contract },
    {
      role: "user",
      content: JSON.stringify({ direction: prompt, sentences: sourceSentences(source) }),
    },
  ];
}
