import { z } from "zod";

// Multiple voices: a run whose narration is a script of speaker turns rather than one voice
// reading an article. Absent on a run is the Narration format, which is every project saved
// before this existed, and nothing about such a run reads anything in this slice.

export const voiceFormats = ["audiobook", "podcast", "drama", "interview"] as const;
export type VoiceFormat = (typeof voiceFormats)[number];
export const voiceFormatLabels: Readonly<Record<VoiceFormat, string>> = {
  audiobook: "Audiobook",
  podcast: "Podcast",
  drama: "Radio drama",
  interview: "Interview",
};

export const speakerRoles = ["narrator", "host", "guest", "character"] as const;
export type SpeakerRole = (typeof speakerRoles)[number];

// Where the script comes from. `script` asks the text model for speaker turns with a Script
// prompt; `attribute` (audiobooks) writes or takes the article as usual and has the text model
// hand its dialogue to the speakers.
export const scriptSources = ["script", "attribute"] as const;
export type ScriptSource = (typeof scriptSources)[number];

export const speakersMax = 10;
export const speakerNameMax = 40;
export const paceSteps = [0.8, 0.9, 1, 1.1, 1.2] as const;
export const turnGapSteps = [0, 0.2, 0.35, 0.5, 0.8, 1.2] as const;
export const defaultTurnGapSeconds = 0.35;

const voiceChoiceSchema = z.object({
  provider: z.string(),
  model: z.string(),
  voice: z.string(),
});

export const speakerSchema = z.object({
  // Stable across renames, so a turn keeps its speaker when the name is edited.
  id: z
    .string()
    .min(1)
    .max(60)
    .regex(/^[a-z0-9-]+$/),
  name: z.string().max(speakerNameMax),
  role: z.enum(speakerRoles),
  voice: voiceChoiceSchema,
  // Played faster or slower after synthesis, so a change re-joins the audio and pays for nothing.
  pace: z.number().optional(),
  // `Term: /IPA/` lines, the Pronunciation Glossary's own format, for this speaker only.
  pronunciations: z.string().max(20_000).optional(),
  // The cast entry this speaker was picked from, when the cast library holds it.
  castId: z.string().max(200).optional(),
  // SHA-256 of the cast member's first picture when the run started: the portrait in a podcast
  // or interview's speaker panel. Absent is the initials tile.
  portrait: z
    .string()
    .regex(/^[0-9a-f]{64}$/)
    .optional(),
});
export type Speaker = z.infer<typeof speakerSchema>;

// A book: a series of audiobook projects, one per chapter, that share their speakers, voices,
// cast and settings. "Make the next chapter" on a finished chapter starts the next one in Play.
// The MP3 and M4B carry it as their album and track. Absent is a project on its own, which is
// every project made before this.
export const bookTitleMax = 200;
export const bookChapterMax = 9999;
export const bookSchema = z
  .object({ title: z.string().max(bookTitleMax), chapter: z.number() })
  .strict()
  .readonly();
export type Book = z.infer<typeof bookSchema>;

export function bookLabel(book: Book): string {
  return `${book.title.trim()} · Chapter ${String(book.chapter)}`;
}

export const voicesSettingsSchema = z.object({
  format: z.enum(voiceFormats),
  source: z.enum(scriptSources),
  speakers: z.array(speakerSchema).max(speakersMax),
  turnGapSeconds: z.number(),
  // The speaker's name before their captions ("Ada: ...").
  nameTags: z.boolean(),
  // Consecutive turns go to a provider's own multi-speaker request where it has one.
  nativeDialogue: z.boolean(),
  // MP3 and M4B files with chapter markers beside the video.
  audioFiles: z.boolean(),
  // The book this project is a chapter of. Absent is none.
  book: bookSchema.optional(),
});
export type VoicesSettings = z.infer<typeof voicesSettingsSchema>;

// `hosts` are the channel's hosts as speakers (`castHosts`): a podcast or an interview starts
// with them in place of the placeholder hosts, and the other formats ignore them.
export function defaultVoicesSettings(
  format: VoiceFormat,
  hosts: readonly Speaker[] = [],
): VoicesSettings {
  return {
    format,
    source: "script",
    speakers: withHosts(format, starterSpeakers(format), hosts),
    turnGapSeconds: defaultTurnGapSeconds,
    nameTags: format === "podcast" || format === "interview",
    nativeDialogue: true,
    audioFiles: true,
  };
}

// A podcast keeps a placeholder host only while it has fewer than two; an interview keeps its
// guest after the hosts.
function withHosts(
  format: VoiceFormat,
  starters: readonly Speaker[],
  hosts: readonly Speaker[],
): Speaker[] {
  if (hosts.length === 0 || (format !== "podcast" && format !== "interview")) return [...starters];
  const cast = hosts.slice(0, speakersMax - 1).map((host) => ({ ...host, role: "host" as const }));
  const fill =
    format === "podcast"
      ? starters.slice(0, Math.max(0, 2 - cast.length))
      : starters.filter((one) => one.role !== "host");
  return [...cast, ...fill.filter((one) => !cast.some((host) => host.id === one.id))];
}

function starterSpeakers(format: VoiceFormat): Speaker[] {
  const blank = { provider: "", model: "", voice: "" };
  const speaker = (id: string, name: string, role: SpeakerRole): Speaker => ({
    id,
    name,
    role,
    voice: blank,
  });
  switch (format) {
    case "audiobook":
      return [speaker("narrator", "Narrator", "narrator")];
    case "podcast":
      return [speaker("host-1", "Alex", "host"), speaker("host-2", "Sam", "host")];
    case "drama":
      return [
        speaker("narrator", "Narrator", "narrator"),
        speaker("character-1", "Mara", "character"),
      ];
    case "interview":
      return [speaker("host-1", "Host", "host"), speaker("guest-1", "Guest", "guest")];
  }
}

export function usesVoices(draft: {
  readonly sources: { readonly audio: string };
  readonly voices?: VoicesSettings | undefined;
}): boolean {
  return draft.voices !== undefined && draft.sources.audio === "generate";
}

// The article prompt a script run picks is a Script prompt, and the article is the script.
export function usesScriptPrompt(draft: {
  readonly sources: { readonly audio: string };
  readonly voices?: VoicesSettings | undefined;
}): boolean {
  return usesVoices(draft) && draft.voices?.source === "script";
}

export interface VoiceProblem {
  readonly field: string;
  readonly message: string;
}

// The rules a multi-voice run must pass before it starts, named for the control to fix.
export function voicesProblems(settings: VoicesSettings): readonly VoiceProblem[] {
  const problems: VoiceProblem[] = [];
  const { speakers } = settings;
  if (speakers.length === 0)
    problems.push({
      field: "voices.speakers",
      message:
        "Add at least one speaker under Speakers (Play → Audio, or Edit project → Providers).",
    });
  if (settings.source === "attribute" && settings.format !== "audiobook")
    problems.push({
      field: "voices.source",
      message:
        "Only audiobooks can hand an existing text's dialogue to speakers. Choose Write a script under Speakers (Play → Audio, or Edit project → Providers).",
    });
  if ((settings.format === "podcast" || settings.format === "interview") && speakers.length < 2)
    problems.push({
      field: "voices.speakers",
      message: `A ${voiceFormatLabels[settings.format].toLowerCase()} needs at least two speakers. Add one under Speakers (Play → Audio, or Edit project → Providers).`,
    });
  if (
    (settings.format === "audiobook" || settings.format === "drama") &&
    !speakers.some((speaker) => speaker.role === "narrator")
  )
    problems.push({
      field: "voices.speakers",
      message: `An ${settings.format === "drama" ? "radio drama" : "audiobook"} needs a narrator. Set one speaker's role to Narrator under Speakers (Play → Audio, or Edit project → Providers).`,
    });
  const names = new Set<string>();
  const ids = new Set<string>();
  for (const [index, speaker] of speakers.entries()) {
    const field = `voices.speakers.${String(index)}`;
    const name = speaker.name.trim();
    if (name === "")
      problems.push({ field: `${field}.name`, message: "Enter a name for this speaker." });
    else if (!/^[\p{L}\p{N}][\p{L}\p{N} .'-]*$/u.test(name))
      problems.push({
        field: `${field}.name`,
        message:
          "Use only letters, numbers, spaces, dots, apostrophes and hyphens in a speaker name, starting with a letter or number.",
      });
    else if (names.has(name.toLowerCase()))
      problems.push({
        field: `${field}.name`,
        message: `Two speakers are called "${name}". Give each speaker a different name.`,
      });
    names.add(name.toLowerCase());
    if (ids.has(speaker.id))
      problems.push({
        field: `${field}.name`,
        message: "Two speakers share one id. Remove one of them and add it again.",
      });
    ids.add(speaker.id);
    if (speaker.voice.provider.trim() === "" || speaker.voice.model.trim() === "")
      problems.push({
        field: `${field}.voice`,
        message: `Choose a voice provider and model for ${name || "this speaker"}.`,
      });
    else if (speaker.voice.voice.trim() === "")
      problems.push({
        field: `${field}.voice.voice`,
        message: `Choose a voice for ${name || "this speaker"}.`,
      });
    if (speaker.pace !== undefined && !(paceSteps as readonly number[]).includes(speaker.pace))
      problems.push({
        field: `${field}.pace`,
        message: `Pick a pace from the list for ${name || "this speaker"}.`,
      });
  }
  if (settings.book !== undefined) {
    if (settings.book.title.trim() === "")
      problems.push({
        field: "voices.book.title",
        message:
          "Enter the book's title under Speakers (Play → Audio), or remove the book to make a project on its own.",
      });
    if (
      !Number.isInteger(settings.book.chapter) ||
      settings.book.chapter < 1 ||
      settings.book.chapter > bookChapterMax
    )
      problems.push({
        field: "voices.book.chapter",
        message: `Enter a chapter number from 1 to ${String(bookChapterMax)} under Speakers (Play → Audio).`,
      });
  }
  if (!(turnGapSteps as readonly number[]).includes(settings.turnGapSeconds))
    problems.push({
      field: "voices.turnGapSeconds",
      message:
        "Pick a gap between turns from the list under Speakers (Play → Audio, or Edit project → Providers).",
    });
  return problems;
}

export function speakerPace(speaker: Speaker): number {
  return speaker.pace ?? 1;
}
