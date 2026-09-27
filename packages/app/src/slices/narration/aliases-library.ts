import type { DatabaseSync } from "node:sqlite";
import type { Clock } from "../../kernel/clock.js";
import { transact } from "../../kernel/db/tx.js";
import type { Ids } from "../../kernel/ids.js";
import type { NarrationAlias } from "../../kernel/ports/narration-aliases.js";
import { type AliasProblem, aliasProblems, narrationAliasSchema } from "./aliases-schema.js";

// Library → Aliases: one ordered list, saved as a whole from its editor. A project takes a copy
// when it starts (and again when Edit project refreshes it), so a change here never alters a
// project's narration behind its back.

export interface AliasLibraryDeps {
  readonly db: DatabaseSync;
  readonly ids: Ids;
  readonly clock: Clock;
}

export function listNarrationAliases(db: DatabaseSync): readonly NarrationAlias[] {
  return db
    .prepare(
      "SELECT written,spoken,whole_word,case_sensitive FROM narration_aliases ORDER BY position,id",
    )
    .all()
    .flatMap((row) => {
      // A row edited by hand into something the editor can't save is left out, not fatal.
      const parsed = narrationAliasSchema.safeParse({
        written: row.written,
        spoken: row.spoken,
        wholeWord: row.whole_word === 1,
        caseSensitive: row.case_sensitive === 1,
      });
      return parsed.success ? [parsed.data] : [];
    });
}

export type SaveAliasesResult =
  | { readonly ok: true; readonly aliases: readonly NarrationAlias[] }
  | { readonly ok: false; readonly fields: readonly AliasProblem[] };

export function saveNarrationAliases(
  deps: AliasLibraryDeps,
  rows: readonly unknown[],
): SaveAliasesResult {
  const fields = aliasProblems(rows);
  if (fields.length > 0) return { ok: false, fields };
  const aliases = rows.map((row) => narrationAliasSchema.parse(row));
  const now = deps.clock.now().toISOString();
  transact(deps.db, () => {
    deps.db.prepare("DELETE FROM narration_aliases").run();
    const insert = deps.db.prepare(
      "INSERT INTO narration_aliases(id,position,written,spoken,whole_word,case_sensitive,updated_at) VALUES (?,?,?,?,?,?,?)",
    );
    for (const [position, alias] of aliases.entries())
      insert.run(
        deps.ids.next(),
        position,
        alias.written,
        alias.spoken,
        alias.wholeWord ? 1 : 0,
        alias.caseSensitive ? 1 : 0,
        now,
      );
  });
  return { ok: true, aliases };
}
