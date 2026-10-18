import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { draftDocumentThemeOf } from "../document/model.js";
import { renderSampleDocument } from "../document/sample.js";
import { type DocumentTheme, resolvedDocumentTheme } from "../document/theme.js";
import type { PlayDraftDocument } from "../play-drafts/schema.js";
import { stableJson } from "../style-preview/settings.js";

// The Document (PDF) sample: the Library theme editor's sample article laid out in the
// template's theme. Local and free.

export function documentThemeOfTemplate(document: PlayDraftDocument): DocumentTheme {
  const settings = document.form.document;
  return resolvedDocumentTheme({
    theme: draftDocumentThemeOf(settings),
    ...(settings?.custom === undefined ? {} : { custom: settings.custom }),
  });
}

export function documentHash(theme: DocumentTheme): string {
  return createHash("sha256")
    .update(stableJson({ version: 1, theme }))
    .digest("hex");
}

export interface DocumentSamples {
  readonly make: (theme: DocumentTheme) => void;
  readonly file: (hash: string) => { readonly path: string; readonly bytes: number } | undefined;
}

const hashPattern = /^[a-f0-9]{64}$/;

export function createDocumentSamples(deps: {
  readonly dir: string;
  readonly render?: (theme: DocumentTheme) => Uint8Array;
}): DocumentSamples {
  const render = deps.render ?? ((theme: DocumentTheme) => renderSampleDocument(theme).bytes);
  const pathOf = (hash: string): string => join(deps.dir, `${hash}.pdf`);
  const file = (hash: string) => {
    if (!hashPattern.test(hash)) return undefined;
    try {
      const stats = statSync(pathOf(hash));
      return stats.isFile() && stats.size > 0
        ? { path: pathOf(hash), bytes: stats.size }
        : undefined;
    } catch {
      return undefined;
    }
  };
  return {
    file,
    make: (theme) => {
      const hash = documentHash(theme);
      if (file(hash) !== undefined) return;
      mkdirSync(deps.dir, { recursive: true, mode: 0o700 });
      const part = join(deps.dir, `${hash}.${randomUUID()}.part`);
      try {
        writeFileSync(part, render(theme), { mode: 0o600 });
        renameSync(part, pathOf(hash));
      } finally {
        rmSync(part, { force: true });
      }
    },
  };
}
