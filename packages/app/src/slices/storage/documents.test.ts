import { describe, expect, it } from "vitest";
import {
  type DocumentsHost,
  documentsDir,
  nodeDocumentsHost,
  userDirsDocuments,
  WINDOWS_DOCUMENTS_COMMAND,
} from "./documents.js";

function host(over: Partial<DocumentsHost>): DocumentsHost & { calls: string[] } {
  const calls: string[] = [];
  return {
    platform: "linux",
    env: {},
    home: "/home/you",
    run: async (command) => {
      calls.push(command);
      throw new Error("not installed");
    },
    read: async () => undefined,
    ...over,
    calls,
  };
}

describe("nodeDocumentsHost", () => {
  it("decodes PowerShell's answer as UTF-8, so a non-ASCII Documents path survives", async () => {
    const path = "C:\\Users\\Élodie\\OneDrive - Société\\Документы";
    const exec = async () => new TextEncoder().encode(`${path}\r\n`);
    const node = nodeDocumentsHost(exec);
    const windows: DocumentsHost = {
      ...node,
      platform: "win32",
      home: "C:\\Users\\Élodie",
      env: {},
    };
    expect(await documentsDir(windows)).toBe(path);
  });
});

describe("documentsDir", () => {
  it("asks Windows for the known folder, which follows OneDrive", async () => {
    const h = host({
      platform: "win32",
      home: "C:\\Users\\you",
      env: { USERPROFILE: "C:\\Users\\you" },
      run: async (command, args) => {
        expect(command).toBe("powershell.exe");
        expect(args.at(-1)).toBe(WINDOWS_DOCUMENTS_COMMAND);
        expect(args.at(-1)).toContain("[Console]::OutputEncoding = [Text.Encoding]::UTF8;");
        return "C:\\Users\\you\\OneDrive\\Documents\r\n";
      },
    });
    expect(await documentsDir(h)).toBe("C:\\Users\\you\\OneDrive\\Documents");
  });

  it("falls back to %USERPROFILE%\\Documents when PowerShell can't answer", async () => {
    const h = host({
      platform: "win32",
      home: "C:\\Users\\you",
      env: { USERPROFILE: "D:\\Profiles\\you" },
    });
    expect(await documentsDir(h)).toBe("D:\\Profiles\\you\\Documents");
  });

  it("ignores a Windows answer that is the profile folder itself", async () => {
    const h = host({
      platform: "win32",
      home: "C:\\Users\\you",
      env: { USERPROFILE: "C:\\Users\\you" },
      run: async () => "C:\\Users\\you\n",
    });
    expect(await documentsDir(h)).toBe("C:\\Users\\you\\Documents");
  });

  it("uses ~/Documents on macOS without asking anything", async () => {
    const h = host({ platform: "darwin", home: "/Users/you" });
    expect(await documentsDir(h)).toBe("/Users/you/Documents");
    expect(h.calls).toEqual([]);
  });

  it("asks xdg-user-dir on Linux", async () => {
    const h = host({ run: async () => "/home/you/Dokumente\n" });
    expect(await documentsDir(h)).toBe("/home/you/Dokumente");
  });

  it("reads user-dirs.dirs when xdg-user-dir is missing, honouring XDG_CONFIG_HOME", async () => {
    const reads: string[] = [];
    const h = host({
      env: { XDG_CONFIG_HOME: "/home/you/.cfg" },
      read: async (path) => {
        reads.push(path);
        return '# written by xdg-user-dirs-update\nXDG_DESKTOP_DIR="$HOME/Desktop"\nXDG_DOCUMENTS_DIR="$HOME/Papers"\n';
      },
    });
    expect(await documentsDir(h)).toBe("/home/you/Papers");
    expect(reads).toEqual(["/home/you/.cfg/user-dirs.dirs"]);
  });

  it("uses ~/Documents when Documents resolves to the home folder itself", async () => {
    // xdg-user-dir prints $HOME for an unset folder; user-dirs.dirs can say the same.
    const h = host({
      run: async () => "/home/you\n",
      read: async () => 'XDG_DOCUMENTS_DIR="$HOME/"\n',
    });
    expect(await documentsDir(h)).toBe("/home/you/Documents");
  });

  it("uses ~/Documents when nothing is configured", async () => {
    expect(await documentsDir(host({}))).toBe("/home/you/Documents");
  });
});

describe("userDirsDocuments", () => {
  it("expands $HOME, keeps absolute paths and rejects anything else", () => {
    expect(userDirsDocuments('XDG_DOCUMENTS_DIR="$HOME/Docs"', "/h")).toBe("/h/Docs");
    expect(userDirsDocuments('XDG_DOCUMENTS_DIR="/data/docs"', "/h")).toBe("/data/docs");
    expect(userDirsDocuments('XDG_DOCUMENTS_DIR="docs"', "/h")).toBeUndefined();
    expect(userDirsDocuments('XDG_MUSIC_DIR="$HOME/Music"', "/h")).toBeUndefined();
  });
});
