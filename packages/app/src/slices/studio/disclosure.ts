// YouTube's "AI use" question (it was "Altered or synthetic content"), answered for every
// video and short of a project. Browser-safe: the upload pack carries the answer, the channel
// page names the setting.
//
// The question as Studio asks it (read on the live Details page, 2026-09-27), behind Show more:
//   AI use — "Was AI used to generate or edit your content in any of the following ways?"
//   1. "Makes a real person appear to say or do something they didn't say or do"
//   2. "Alters footage of a real event or place"
//   3. "Generates a realistic-looking scene that didn't actually occur"
//   Radios "Yes, AI was used" / "No, AI wasn't used"; "Selecting 'yes' adds a label to your
//   content."
// YouTube's help page (https://support.google.com/youtube/answer/14328491) says the same:
// clearly unrealistic content (fantasy, animation), minor edits (colour, filters) and
// production help (AI for the script, thumbnail, title or captions) need no label.
//
// So the automatic answer is Yes only when one of the three cases applies, and No otherwise:
// 1. a saved voice marked "Imitates a real person" (Settings → Voices) narrates it: an AI
//    voice cloned from, or made to sound like, a real person, so that person seems to say it;
// 2. uploaded clips the person marked as real footage (the project's Prepare upload) get the
//    Look's atmosphere overlay (embers, dust or fog), which adds to a real scene what wasn't
//    there. A colour grade, vignette or grain alone is one of YouTube's minor edits;
// 3. an AI image model draws its pictures from an Image prompt marked "Draws photorealistic
//    pictures" (Library → Prompts). Stylised, painterly or illustrated images are not
//    realistic-looking, and animating them doesn't make them so.
// An AI narrator that doesn't pose as a real person, AI-written text and an AI thumbnail are
// none of the three. Every mark is off until the person sets it. A channel can still set
// Always Yes or Always No (Channels → the channel → Brand → YouTube AI disclosure).

export const aiDisclosureSettings = ["auto", "yes", "no"] as const;
export type AiDisclosureSetting = (typeof aiDisclosureSettings)[number];

export const aiDisclosureLabels: Readonly<Record<AiDisclosureSetting, string>> = {
  auto: "Automatic",
  yes: "Always Yes",
  no: "Always No",
};

// Studio's three cases, as it words them.
export const aiUseCases = [
  "Makes a real person appear to say or do something they didn't say or do",
  "Alters footage of a real event or place",
  "Generates a realistic-looking scene that didn't actually occur",
] as const;

export interface AiDisclosure {
  // Studio's answer: true is "Yes".
  readonly altered: boolean;
  // Why, in plain words.
  readonly why: string;
}

// What the answer is worked out from, already resolved from the project, the saved voices,
// the Library and the Prepare upload marks (`pack.ts`).
export interface DisclosureInput {
  readonly setting: AiDisclosureSetting;
  readonly kind: "video" | "short";
  // Case 1: the names of the AI voices narrating it that are marked "Imitates a real person".
  readonly realPersonVoices: readonly string[];
  // Case 2: whether it shows uploaded clips marked as real footage, and the Look's atmosphere
  // laid over them ("fog"), if any.
  readonly realFootage: boolean;
  readonly footageOverlay?: string | undefined;
  // Case 3: whether an AI image model draws its pictures from an Image prompt marked
  // photorealistic.
  readonly photorealistic: boolean;
}

const where = "Channels → the channel → Brand → YouTube AI disclosure";

export function aiDisclosureOf(input: DisclosureInput): AiDisclosure {
  if (input.setting === "yes")
    return { altered: true, why: `This channel is set to Always Yes (${where}).` };
  if (input.setting === "no")
    return { altered: false, why: `This channel is set to Always No (${where}).` };
  const reasons: string[] = [];
  if (input.realPersonVoices.length > 0)
    reasons.push(
      `the narration uses ${quotedList(input.realPersonVoices)}, marked in Settings → Voices as imitating a real person (YouTube's case 1: "${aiUseCases[0]}")`,
    );
  if (input.realFootage && input.footageOverlay !== undefined)
    reasons.push(
      `the Look's ${input.footageOverlay} overlay is laid over uploaded clips marked as real footage (YouTube's case 2: "${aiUseCases[1]}")`,
    );
  if (input.photorealistic)
    reasons.push(
      `an AI image model draws its pictures from an Image prompt marked photorealistic in Library → Prompts (YouTube's case 3: "${aiUseCases[2]}")`,
    );
  if (reasons.length > 0)
    return {
      altered: true,
      why: `Yes because ${list(reasons)}. Selecting Yes adds YouTube's AI label.`,
    };
  const footage =
    input.realFootage && input.kind === "video"
      ? " The uploaded real footage only gets colour, vignette or grain, which YouTube counts as minor edits."
      : "";
  return {
    altered: false,
    why: `No because none of YouTube's three AI use cases applies: no narrating voice is marked as imitating a real person (Settings → Voices), no real footage is altered, and no AI pictures come from an Image prompt marked photorealistic (Library → Prompts). Stylised AI pictures and an AI narrator that doesn't pose as a real person don't need the label.${footage}`,
  };
}

function quotedList(names: readonly string[]): string {
  const quoted = names.map((name) => `"${name}"`);
  return `the voice${names.length === 1 ? "" : "s"} ${list(quoted)}`;
}

function list(parts: readonly string[]): string {
  if (parts.length <= 1) return parts.join("");
  return `${parts.slice(0, -1).join(", ")} and ${parts.at(-1) ?? ""}`;
}
