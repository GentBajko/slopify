import type { DatabaseSync } from "node:sqlite";
import type { Clock } from "../../kernel/clock.js";
import { isUniqueConstraint } from "../../kernel/db/index.js";
import type { Ids } from "../../kernel/ids.js";
import type { FieldError } from "../admission/rules.js";
import { documentThemeNameProblems, type SavedDocumentTheme } from "./model.js";
import type { DocumentTheme } from "./theme.js";
import { documentThemeSchema } from "./theme-schema.js";

// Library → Documents: named themes a project can take a copy of. Every value is checked
// against the same schema a project config is, so a saved theme always renders.

export interface DocumentThemeDeps {
  readonly db: DatabaseSync;
  readonly ids: Ids;
  readonly clock: Clock;
}

// `values` is checked here, not trusted: it arrives straight from the editor.
export interface DocumentThemeDraft {
  readonly name: string;
  readonly values: unknown;
}

export type DocumentThemeResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly reason: "invalid"; readonly fields: readonly FieldError[] }
  | { readonly ok: false; readonly reason: "duplicate-name" }
  | { readonly ok: false; readonly reason: "not-found" };

export function listDocumentThemes(db: DatabaseSync): readonly SavedDocumentTheme[] {
  return db
    .prepare("SELECT id,name,values_json,updated_at FROM document_themes ORDER BY lower(name),id")
    .all()
    .flatMap((row) => {
      // A row whose values no longer parse (hand-edited, or from a newer Slopify) is left
      // out rather than breaking the whole list.
      const values = documentThemeSchema.safeParse(JSON.parse(String(row.values_json)));
      return values.success
        ? [
            {
              id: String(row.id),
              name: String(row.name),
              values: values.data,
              updatedAt: String(row.updated_at),
            },
          ]
        : [];
    });
}

export function createDocumentTheme(
  deps: DocumentThemeDeps,
  draft: DocumentThemeDraft,
): DocumentThemeResult<SavedDocumentTheme> {
  const checked = check(draft);
  if (!checked.ok) return checked;
  const now = deps.clock.now().toISOString();
  const theme: SavedDocumentTheme = { id: deps.ids.next(), ...checked.value, updatedAt: now };
  return written(() => {
    deps.db
      .prepare(
        "INSERT INTO document_themes(id,name,values_json,created_at,updated_at) VALUES (?,?,?,?,?)",
      )
      .run(theme.id, theme.name, JSON.stringify(theme.values), now, now);
    return true;
  }, theme);
}

export function updateDocumentTheme(
  deps: DocumentThemeDeps,
  id: string,
  draft: DocumentThemeDraft,
): DocumentThemeResult<SavedDocumentTheme> {
  const checked = check(draft);
  if (!checked.ok) return checked;
  const now = deps.clock.now().toISOString();
  const theme: SavedDocumentTheme = { id, ...checked.value, updatedAt: now };
  return written(
    () =>
      deps.db
        .prepare("UPDATE document_themes SET name=?,values_json=?,updated_at=? WHERE id=?")
        .run(theme.name, JSON.stringify(theme.values), now, id).changes > 0,
    theme,
  );
}

export function removeDocumentTheme(
  deps: DocumentThemeDeps,
  id: string,
): DocumentThemeResult<null> {
  return deps.db.prepare("DELETE FROM document_themes WHERE id=?").run(id).changes > 0
    ? { ok: true, value: null }
    : { ok: false, reason: "not-found" };
}

function check(
  draft: DocumentThemeDraft,
): DocumentThemeResult<{ readonly name: string; readonly values: DocumentTheme }> {
  const named = documentThemeNameProblems(draft.name);
  const values = documentThemeSchema.safeParse(draft.values);
  const fields = [
    ...named,
    ...(values.success
      ? []
      : values.error.issues.map((issue) => ({
          field: `values.${issue.path.join(".")}`,
          message: issue.message,
        }))),
  ];
  if (fields.length > 0 || !values.success) return { ok: false, reason: "invalid", fields };
  return { ok: true, value: { name: draft.name.trim(), values: values.data } };
}

function written<T>(write: () => boolean, value: T): DocumentThemeResult<T> {
  try {
    return write() ? { ok: true, value } : { ok: false, reason: "not-found" };
  } catch (error) {
    if (isUniqueConstraint(error)) return { ok: false, reason: "duplicate-name" };
    throw error;
  }
}
