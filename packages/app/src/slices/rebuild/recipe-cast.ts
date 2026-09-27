import type { RunConfig } from "../admission/model.js";
import { castMentions } from "../channels/cast-match.js";

// The cast members an image request is drawn with: the ones its texts mention, at most
// `castMembersPerImage` of them in the order they are first mentioned. Undefined when none is,
// so the request - and its fingerprint - is exactly what it was before the channel had a cast.
// A member's name and description go with its pictures, since the note that introduces each
// picture to the provider names them.
export const castMembersPerImage = 4;

export interface CastInput {
  readonly name: string;
  readonly description: string;
  // SHA-256 of each picture, in the order they were added to the member.
  readonly images: readonly string[];
}

export function castFor(
  config: Pick<RunConfig, "cast">,
  ...texts: readonly (string | null | undefined)[]
): readonly CastInput[] | undefined {
  const text = texts.filter((value) => typeof value === "string" && value !== "").join("\n");
  const mentioned = castMentions(text, config.cast).slice(0, castMembersPerImage);
  return mentioned.length === 0
    ? undefined
    : mentioned.map((member) => ({
        name: member.name,
        description: member.description,
        images: member.images,
      }));
}
