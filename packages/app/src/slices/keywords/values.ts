// The facts a run copies when it starts, for the keywords Slopify fills from them, and how each
// becomes a keyword's text. Browser-safe.

import { previousVideoLink } from "../youtube/placeholders.js";
import type { KeywordPlace } from "./model.js";

export interface KeywordFacts {
  readonly channel?: string | undefined;
  readonly series?: string | undefined;
  readonly links?: readonly { readonly name: string; readonly url: string }[] | undefined;
  readonly previousVideo?:
    | { readonly title: string; readonly url?: string | undefined }
    | undefined;
  readonly nextVideo?: { readonly title: string } | undefined;
  readonly cast?: readonly { readonly name: string; readonly description: string }[] | undefined;
  readonly coveredBefore?: readonly string[] | undefined;
  readonly episode?: number | undefined;
  readonly brand?:
    | { readonly colours: readonly string[]; readonly fonts: readonly string[] }
    | undefined;
}

// The description's own link placeholder for the next video, filled when it is shown like
// "Previous video".
export const nextVideoLink = "Next video";

// Every keyword the facts fill, for one place. A Description prompt keeps the links as the
// placeholders the description page fills when it shows the description, so they stay live.
export function factValues(
  facts: KeywordFacts | undefined,
  title: string,
  place: KeywordPlace,
): Readonly<Record<string, string>> {
  const described = place === "description";
  const links = facts?.links ?? [];
  const previous = facts?.previousVideo;
  return {
    Slopify_Title: title,
    Slopify_Channel: facts?.channel ?? "",
    Slopify_Series: facts?.series?.trim() ?? "",
    Slopify_Links: links
      .map((link) => `${link.name}: ${described ? `{{${link.name}}}` : link.url}`)
      .join("\n"),
    Slopify_Previous_Video: described
      ? `{{${previousVideoLink}}}`
      : previous === undefined
        ? ""
        : previous.url === undefined || previous.url === ""
          ? previous.title
          : `${previous.title} – ${previous.url}`,
    Slopify_Next_Video: described ? `{{${nextVideoLink}}}` : (facts?.nextVideo?.title ?? ""),
    Slopify_Cast: (facts?.cast ?? [])
      .map((member) =>
        member.description.trim() === "" ? member.name : `${member.name}: ${member.description}`,
      )
      .join("\n"),
    Slopify_Covered_Before: (facts?.coveredBefore ?? []).join("\n"),
    Slopify_Episode: facts?.episode === undefined ? "" : String(facts.episode),
    Slopify_Brand: brandText(facts?.brand),
  };
}

function brandText(brand: KeywordFacts["brand"]): string {
  if (brand === undefined) return "";
  const parts = [
    ...(brand.colours.length === 0 ? [] : [`Colors: ${brand.colours.join(", ")}.`]),
    ...(brand.fonts.length === 0 ? [] : [`Fonts: ${brand.fonts.join(", ")}.`]),
  ];
  return parts.join(" ");
}

// The finished length as the description and post prompts say it: "42 min 10 s".
export function durationText(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const rest = total % 60;
  return [
    ...(hours > 0 ? [`${String(hours)} h`] : []),
    ...(hours > 0 || minutes > 0 ? [`${String(minutes)} min`] : []),
    `${String(rest)} s`,
  ].join(" ");
}

// The release date as a prompt says it: "Thursday 22 October 2026", in the computer's time zone
// like every other release time Slopify shows. Blank when the video has no release time.
export function releaseDateText(at: string | undefined, timeZone?: string): string {
  if (at === undefined || at.trim() === "") return "";
  const date = new Date(at);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    ...(timeZone === undefined ? {} : { timeZone }),
  })
    .format(date)
    .replace(",", "");
}
