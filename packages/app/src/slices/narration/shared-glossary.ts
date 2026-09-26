import { readFileSync } from "node:fs";
import type { DatabaseSync } from "node:sqlite";
import type { Paths } from "../../kernel/paths.js";
import { outputPath } from "../storage/layout.js";
import { type GlossaryEntry, parsePronunciationGlossary } from "./pronunciation.js";

// Pronunciations shared between projects: the Pronunciation Glossary of every other
// project's current article, merged. A project takes a copy when it starts (and again when
// Edit project refreshes it), so a later project never changes the narration of an earlier
// one behind its back. The newest project's IPA wins where two disagree.

export interface SharedGlossary {
  readonly entries: readonly GlossaryEntry[];
  // How many projects contributed at least one entry.
  readonly projects: number;
}

export function collectSharedGlossary(
  deps: { readonly db: DatabaseSync; readonly paths: Paths },
  exceptProjectId?: string,
): SharedGlossary {
  const rows = deps.db
    .prepare(
      `SELECT o.project_id AS projectId, a.path AS path FROM revision_outputs o
       JOIN project_heads h ON h.project_id=o.project_id AND h.revision_id=o.revision_id
       JOIN project_assets a ON a.id=o.asset_id
       WHERE o.slot='article:glossary' AND o.selected=1 AND o.state='ready' AND o.project_id<>?
       ORDER BY o.created_at DESC`,
    )
    .all(exceptProjectId ?? "");
  const merged = new Map<string, GlossaryEntry>();
  const contributors = new Set<string>();
  for (const row of rows) {
    const projectId = String(row.projectId);
    let text: string;
    try {
      text = readFileSync(outputPath(deps.paths, projectId, String(row.path)), "utf8");
    } catch {
      // A glossary file removed by hand or by a cleanup has nothing to share.
      continue;
    }
    const parsed = parsePronunciationGlossary(text);
    // A glossary that doesn't parse can't be trusted in someone else's narration either.
    if (!parsed.ok) continue;
    for (const entry of parsed.entries) {
      const key = glossaryKey(entry.term);
      if (merged.has(key)) continue;
      merged.set(key, { term: entry.term, ipa: [...entry.ipa] });
      contributors.add(projectId);
    }
  }
  return {
    entries: [...merged.values()].sort((a, b) => a.term.localeCompare(b.term)),
    projects: contributors.size,
  };
}

// A project's own glossary comes first; a shared term it already defines is left out, so
// there is never a conflict for the parser to refuse.
export function withSharedGlossary(
  own: readonly GlossaryEntry[],
  shared: readonly GlossaryEntry[] | undefined,
): readonly GlossaryEntry[] {
  if (shared === undefined || shared.length === 0) return own;
  const taken = new Set(own.map((entry) => glossaryKey(entry.term)));
  return [...own, ...shared.filter((entry) => !taken.has(glossaryKey(entry.term)))];
}

function glossaryKey(term: string): string {
  return term.normalize("NFC").toLocaleLowerCase("en").replace(/\s+/gu, " ").trim();
}
