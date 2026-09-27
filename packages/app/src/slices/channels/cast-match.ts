import type { CastSnapshot } from "./model.js";

// Which cast members a text mentions: a member's name or one of its aliases as a whole word,
// ignoring case. A word boundary is anything that is not a letter or digit in any script, so
// "Tiamat's lair" and "(Tiamat)" mention Tiamat and "Tiamatic" or "Tiamats" do not; a plural
// is an alias to add. Spaces inside a name match any run of whitespace. The members come back
// in the order the text first mentions them, then in cast order.
export function castMentions(
  text: string,
  cast: readonly CastSnapshot[] | undefined,
): readonly CastSnapshot[] {
  if (cast === undefined || cast.length === 0 || text.trim() === "") return [];
  const found: { readonly member: CastSnapshot; readonly at: number; readonly order: number }[] =
    [];
  for (const [order, member] of cast.entries()) {
    let first = Number.POSITIVE_INFINITY;
    for (const term of [member.name, ...member.aliases]) {
      const at = mentionAt(text, term);
      if (at !== undefined && at < first) first = at;
    }
    if (Number.isFinite(first)) found.push({ member, at: first, order });
  }
  return found.sort((a, b) => a.at - b.at || a.order - b.order).map((row) => row.member);
}

function mentionAt(text: string, term: string): number | undefined {
  const words = term.trim().split(/\s+/u).filter(Boolean);
  if (words.length === 0) return undefined;
  const pattern = new RegExp(
    `(?<![\\p{L}\\p{N}])${words.map(escapeRegExp).join("\\s+")}(?![\\p{L}\\p{N}])`,
    "iu",
  );
  const match = pattern.exec(text);
  return match === null ? undefined : match.index;
}

function escapeRegExp(word: string): string {
  return word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
