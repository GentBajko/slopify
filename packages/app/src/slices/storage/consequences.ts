// What a storage action removes and what it costs later, in the words its confirm dialog
// uses: shared by the web page (Settings → Backup & storage, a project's Free up space) and
// the agent's tool, so both state the same count and size.

// "512 B", "3.4 MB", "12 GB": binary units, one decimal under ten.
export function fileSize(bytes: number): string {
  if (bytes < 1024) return `${String(bytes)} B`;
  const units = ["KB", "MB", "GB", "TB"] as const;
  let value = bytes;
  let unit: string = units[0];
  for (const candidate of units) {
    value /= 1024;
    unit = candidate;
    if (value < 1024 || candidate === units.at(-1)) break;
  }
  return `${value >= 10 ? value.toFixed(0) : value.toFixed(1).replace(/\.0$/, "")} ${unit}`;
}

// What Delete old versions removes and what it costs later; without the numbers when they
// can't be read.
export function oldVersionsConsequence(size?: {
  readonly files: number;
  readonly bytes: number;
}): string {
  const what =
    size === undefined
      ? "the older versions"
      : `${String(size.files)} file(s) of older versions and frees ${fileSize(size.bytes)}`;
  return `This deletes ${what}: what is in the projects' History folders (earlier renders, narration before a change). The current video, shorts, thumbnails and everything in Upload stay, and so does anything you uploaded or put there yourself. Going back to one of those older versions makes its files again, which takes time and uses provider credits.`;
}
