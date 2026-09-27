// Channel links and the placeholders that use them. A description (the generated one, the
// user's edit, or what a Description prompt told the model to write) can hold `{{Patreon}}` or
// `{{Previous video}}`; they are filled from the saved links when the description is shown or
// copied, never when it is written, so changing a link changes every description at once.
// A placeholder with no link of that name stays in the text as typed and is marked, never
// silently dropped. Browser-safe.

export interface ChannelLink {
  readonly name: string;
  readonly url: string;
}

// The link YouTube descriptions most often point at, and the one that changes per project:
// the project page offers it by name, and a project's own value wins over the Settings list.
export const previousVideoLink = "Previous video";

export const channelLinkNameMax = 60;
export const channelLinkUrlMax = 2000;
export const channelLinksMax = 50;

export type PlaceholderPart =
  | { readonly kind: "text"; readonly text: string }
  | {
      readonly kind: "placeholder";
      // As typed, braces and all.
      readonly raw: string;
      readonly name: string;
      // Undefined when no link has that name.
      readonly url: string | undefined;
    };

const placeholder = /\{\{([^{}\n]{1,80})\}\}/gu;

// Names match without regard to case or repeated spaces: `{{previous  video}}` is the
// "Previous video" link.
export function linkKey(name: string): string {
  return name.trim().replace(/\s+/gu, " ").toLowerCase();
}

// The project's own links first, so one of the same name replaces the Settings one.
export function mergeLinks(
  settings: readonly ChannelLink[],
  project: readonly ChannelLink[],
): readonly ChannelLink[] {
  const seen = new Set<string>();
  const merged: ChannelLink[] = [];
  for (const link of [...project, ...settings]) {
    const key = linkKey(link.name);
    if (seen.has(key) || link.url.trim() === "") continue;
    seen.add(key);
    merged.push(link);
  }
  return merged;
}

export function placeholderParts(
  text: string,
  links: readonly ChannelLink[],
): readonly PlaceholderPart[] {
  const byName = new Map(links.map((link) => [linkKey(link.name), link.url]));
  const parts: PlaceholderPart[] = [];
  let at = 0;
  for (const match of text.matchAll(placeholder)) {
    const index = match.index;
    if (index > at) parts.push({ kind: "text", text: text.slice(at, index) });
    const name = (match[1] ?? "").trim();
    parts.push({ kind: "placeholder", raw: match[0], name, url: byName.get(linkKey(name)) });
    at = index + match[0].length;
  }
  if (at < text.length) parts.push({ kind: "text", text: text.slice(at) });
  return parts;
}

export interface FilledText {
  readonly text: string;
  // The placeholders no link fills, each once, as typed between the braces.
  readonly unknown: readonly string[];
}

export function fillPlaceholders(text: string, links: readonly ChannelLink[]): FilledText {
  const unknown: string[] = [];
  const filled = placeholderParts(text, links)
    .map((part) => {
      if (part.kind === "text") return part.text;
      if (part.url !== undefined) return part.url;
      if (!unknown.some((name) => linkKey(name) === linkKey(part.name))) unknown.push(part.name);
      return part.raw;
    })
    .join("");
  return { text: filled, unknown };
}

// Why a list of links cannot be saved, in the words Settings shows; undefined when it can.
export function channelLinksProblem(links: readonly ChannelLink[]): string | undefined {
  if (links.length > channelLinksMax)
    return `Keep at most ${String(channelLinksMax)} channel links. Remove some in Settings → Channel links.`;
  const seen = new Set<string>();
  for (const [index, link] of links.entries()) {
    const row = `Link ${String(index + 1)}`;
    const name = link.name.trim();
    if (name === "") return `${row} has no name. Give it one, such as Patreon.`;
    if (name.length > channelLinkNameMax)
      return `${row}'s name is over ${String(channelLinkNameMax)} characters. Shorten it.`;
    if (/[{}]/u.test(name))
      return `${row}'s name contains { or }. Use the name alone; the description writes it as {{${name.replace(/[{}]/gu, "")}}}.`;
    if (seen.has(linkKey(name)))
      return `Two links are named "${name}". Rename one, since {{${name}}} can only fill with one.`;
    seen.add(linkKey(name));
    const url = link.url.trim();
    if (url.length > channelLinkUrlMax)
      return `The "${name}" link is over ${String(channelLinkUrlMax)} characters. Use a shorter address.`;
    if (url === "") return `The "${name}" link has no address. Paste it, starting with https://.`;
    if (!isWebAddress(url))
      return `The "${name}" link is not a web address. Paste the full address, starting with https://.`;
  }
  return undefined;
}

function isWebAddress(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}
