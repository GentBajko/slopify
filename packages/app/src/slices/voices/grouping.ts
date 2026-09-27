import { type Speaker, speakerPace } from "./model.js";
import type { ScriptTurn } from "./script.js";

// Which consecutive turns go to one native multi-speaker request, and which are spoken one
// turn per request. Only models that take several voices in one request are listed.
//
// ElevenLabs text-to-dialogue (POST /v1/text-to-dialogue/stream): `inputs` of {text, voice_id},
// at most 10 distinct voices and about 2,000 characters across the inputs per request, on
// eleven_v3 (https://elevenlabs.io/docs/api-reference/text-to-dialogue/stream).
// ceiling: Gemini's two-speaker TTS is the other native model, but Slopify has no Google TTS
// adapter yet; adding it is a row here plus the adapter.
export interface DialogueCapability {
  readonly provider: string;
  readonly models: readonly string[];
  readonly maxVoices: number;
  readonly maxCharacters: number;
}
export const dialogueCapabilities: readonly DialogueCapability[] = [
  { provider: "elevenlabs", models: ["eleven_v3"], maxVoices: 10, maxCharacters: 2000 },
];

export function dialogueCapability(
  provider: string,
  model: string,
): DialogueCapability | undefined {
  return dialogueCapabilities.find(
    (capability) => capability.provider === provider && capability.models.includes(model),
  );
}

export interface TurnGroup {
  readonly turns: readonly ScriptTurn[];
  // One request carrying every turn with its own voice; false is one request per turn.
  readonly native: boolean;
}

// `spokenLength` is how long a turn's text is once it goes to the voice (narration aliases can
// make it longer than the script), so a request never passes the provider's limit.
export function groupTurns(
  turns: readonly ScriptTurn[],
  speakers: readonly Speaker[],
  nativeDialogue: boolean,
  spokenLength: (text: string) => number = (text) => text.length,
): readonly TurnGroup[] {
  const byId = new Map(speakers.map((speaker) => [speaker.id, speaker]));
  const groups: { turns: ScriptTurn[]; native: boolean }[] = [];
  let current: ScriptTurn[] = [];
  let capability: DialogueCapability | undefined;
  let signature = "";
  const close = (): void => {
    if (current.length > 0) groups.push({ turns: current, native: current.length > 1 });
    current = [];
    capability = undefined;
    signature = "";
  };
  for (const turn of turns) {
    const speaker = byId.get(turn.speaker);
    const own =
      nativeDialogue && speaker !== undefined
        ? dialogueCapability(speaker.voice.provider, speaker.voice.model)
        : undefined;
    if (own === undefined || speaker === undefined || spokenLength(turn.text) > own.maxCharacters) {
      close();
      groups.push({ turns: [turn], native: false });
      continue;
    }
    // One provider, one model and one pace per request: the pace is applied to the request's
    // audio as a whole after it comes back.
    const mine = `${speaker.voice.provider}\n${speaker.voice.model}\n${String(speakerPace(speaker))}`;
    const voices = new Set(
      [...current, turn].map((one) => byId.get(one.speaker)?.voice.voice ?? ""),
    );
    const characters = [...current, turn].reduce((sum, one) => sum + spokenLength(one.text), 0);
    if (
      current.length > 0 &&
      (mine !== signature ||
        voices.size > (capability?.maxVoices ?? 0) ||
        characters > (capability?.maxCharacters ?? 0))
    )
      close();
    current.push(turn);
    capability = own;
    signature = mine;
  }
  close();
  return groups;
}
