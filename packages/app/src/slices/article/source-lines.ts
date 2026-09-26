// The entries of an article's "Sources Consulted" section, one per source. Models write the
// list as bullets, as numbered lines, or as plain lines with no blank line between them;
// markdown would join the last kind into one paragraph, so the section is read line by line
// instead. A line indented under an entry continues it. The section starts with its own
// heading (`splitEndMatter` cuts it there), which is not an entry. Browser-safe: the project
// page lists the same entries the PDF prints.
const marker = /^(?:[-*+]|\d+[.)])\s+/u;

export function sourceEntries(section: string): readonly string[] {
  const lines = section.split(/\r?\n/u).filter((line) => line.trim() !== "");
  const entries: string[] = [];
  for (const raw of lines.slice(1)) {
    const line = raw.trim().replace(marker, "").trim();
    const last = entries.length - 1;
    if (/^\s/u.test(raw) && !marker.test(raw.trim()) && last >= 0)
      entries[last] = `${entries[last] ?? ""} ${line}`;
    else if (line !== "") entries.push(line);
  }
  return entries;
}
