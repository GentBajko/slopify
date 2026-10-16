import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// The timed volume changes a levelling step sends ffmpeg's volume filter, as the commands file
// `asendcmd` reads. The filter graph names the file, and the graph's syntax reads some
// characters a project folder's name may hold (the apostrophe in "Drizzt Do'Urden" opens a
// quote), so the file is written to a folder of its own under the system's temporary folder,
// whose name has none of them. `dispose` removes it.
export function volumeCommands(text: string): {
  readonly filterPath: string;
  readonly dispose: () => void;
} {
  const directory = mkdtempSync(join(tmpdir(), "slopify-volume-"));
  const path = join(directory, "commands.txt");
  writeFileSync(path, text, { mode: 0o600 });
  return {
    filterPath: path.replaceAll("\\", "/").replaceAll(":", "\\\\:"),
    dispose: () => rmSync(directory, { recursive: true, force: true }),
  };
}
