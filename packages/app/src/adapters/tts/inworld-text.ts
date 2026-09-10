// Inworld's streaming endpoint accepts 4,000 characters. Split inside the
// adapter so whole-text narration and long intros/outros all remain usable.
// UTF-16 length is conservative for Unicode; never cut a surrogate pair.
export function inworldTextParts(text: string): readonly string[] {
  const parts: string[] = [];
  let current = "";
  for (const sentence of new Intl.Segmenter("en", { granularity: "sentence" }).segment(text)) {
    if (current.length + sentence.segment.length <= 4000) {
      current += sentence.segment;
      continue;
    }
    if (current.trim()) parts.push(current.trim());
    let remaining = sentence.segment;
    while (remaining.length > 4000) {
      const window = remaining.slice(0, 4000);
      const boundary = Math.max(
        window.lastIndexOf(" "),
        window.lastIndexOf("\n"),
        window.lastIndexOf("\t"),
      );
      let cut = boundary > 0 ? boundary : 4000;
      const last = remaining.charCodeAt(cut - 1);
      if (last >= 0xd800 && last <= 0xdbff) cut--;
      const piece = remaining.slice(0, cut).trim();
      if (piece) parts.push(piece);
      remaining = remaining.slice(cut).trimStart();
    }
    current = remaining;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}
