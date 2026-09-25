import { spawn } from "node:child_process";
import { lstat, readdir } from "node:fs/promises";
import { isAbsolute, join, relative, sep } from "node:path";
import { readState, receiptSchema } from "../edge/docker-projects/state.js";
import { HostFolderRefused } from "../kernel/ports/host-cli.js";
import { hasCode } from "./paths.js";

export interface HostFolderDeps {
  /** The Docker launcher's state folder, `<XDG_DATA_HOME>/slopify/docker`. */
  readonly root: string;
  readonly uid: number;
  readonly launch: (directory: string) => Promise<void>;
}

const again = "run the Docker launcher again (npx @gentbajko/slopify@latest --docker)";

/** Starts the desktop's opener and returns once it is running; the file manager is not awaited. */
export function launchXdgOpen(directory: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("xdg-open", [directory], {
      detached: true,
      shell: false,
      stdio: "ignore",
    });
    child.once("error", (error) => {
      reject(
        new Error(
          hasCode(error, "ENOENT")
            ? "xdg-open isn't installed on this machine, so the Slopify host helper can't open a file manager. Install xdg-utils (for example sudo pacman -S xdg-utils or sudo apt install xdg-utils), then use Open folder again."
            : `The Slopify host helper could not start xdg-open to open ${directory}. Check that you are signed in to this computer's desktop, then use Open folder again.`,
        ),
      );
    });
    child.once("spawn", () => {
      child.unref();
      resolve();
    });
  });
}

/** Only folders inside a launcher receipt's project folder, reached through real folders you own, are opened. */
export function createHostFolderOpener(deps: HostFolderDeps): (path: string) => Promise<void> {
  async function receipts() {
    const found = [];
    let entries: import("node:fs").Dirent[];
    try {
      const root = await lstat(deps.root);
      if (!root.isDirectory() || root.isSymbolicLink() || root.uid !== deps.uid) return [];
      entries = await readdir(deps.root, { withFileTypes: true });
    } catch {
      return [];
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      try {
        const receipt = await readState(
          join(deps.root, entry.name, "receipt.json"),
          receiptSchema,
          deps.uid,
        );
        if (receipt) found.push(receipt);
      } catch {
        // An unreadable or damaged receipt grants nothing; the others still count.
      }
    }
    return found;
  }
  async function verify(projects: string, identity: { dev: string; ino: string }, r: string) {
    const root = await lstat(projects, { bigint: true }).catch(() => undefined);
    if (
      !root?.isDirectory() ||
      root.isSymbolicLink() ||
      root.uid !== BigInt(deps.uid) ||
      String(root.dev) !== identity.dev ||
      String(root.ino) !== identity.ino
    )
      throw new HostFolderRefused(
        `The Slopify host helper did not open this folder because the project folder ${projects} was moved or replaced since the Docker launcher set it up. Put the original folder back, or ${again}.`,
      );
    let current = projects;
    for (const part of r === "" ? [] : r.split(sep)) {
      current = join(current, part);
      const s = await lstat(current).catch(() => undefined);
      if (!s?.isDirectory() || s.isSymbolicLink() || s.uid !== deps.uid)
        throw new HostFolderRefused(
          `The Slopify host helper did not open ${current} because it is missing, a link or a file, or isn't owned by you. Use Re-run section on the project page to make the file again, or copy the path into your file manager.`,
        );
    }
  }
  return async (path) => {
    if (!isAbsolute(path) || /[\p{Cc}]/u.test(path))
      throw new HostFolderRefused(
        `The Slopify host helper did not open this folder because Slopify sent a path it can't use. Update Slopify: ${again}.`,
      );
    let refusal: HostFolderRefused | undefined;
    for (const receipt of await receipts()) {
      const r = relative(receipt.projects, path);
      if (r === ".." || r.startsWith(`..${sep}`) || isAbsolute(r)) continue;
      try {
        await verify(receipt.projects, receipt.directoryIdentity, r);
      } catch (error) {
        if (!(error instanceof HostFolderRefused)) throw error;
        refusal = error;
        continue;
      }
      // Open the normalised path that was checked, never the caller's spelling of it.
      await deps.launch(join(receipt.projects, r));
      return;
    }
    throw (
      refusal ??
      new HostFolderRefused(
        `The Slopify host helper did not open ${path} because it isn't inside a project folder set up by the Docker launcher. Copy the path into your file manager, or if you moved your project folder, ${again}.`,
      )
    );
  };
}
