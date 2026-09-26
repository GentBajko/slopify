import type { FieldError } from "../admission/rules.js";
import type { DocumentTheme } from "./theme.js";

// The built-in looks a project's PDF can take. Browser-safe: Play, Edit project and the
// server all offer and accept the same names from here.
export const documentThemes = ["dicemaster", "plain"] as const;
export type DocumentThemeName = (typeof documentThemes)[number];

export const defaultDocumentTheme: DocumentThemeName = "dicemaster";

export const documentThemeLabels: Readonly<Record<DocumentThemeName, string>> = {
  dicemaster: "DiceMaster",
  plain: "Plain",
};

// A theme saved in Library → Documents. A project keeps a copy of the values it was given,
// as it keeps its prompts' text, so editing or deleting the Library theme later never
// changes a document already made or queued.
export interface CustomDocumentTheme {
  readonly id: string;
  readonly name: string;
  readonly values: DocumentTheme;
}

// What a project says about its document. A config saved before the Document stage existed
// has none and reads as the default theme. With `custom`, the custom values are used and
// `theme` is ignored.
export interface DocumentSettings {
  readonly theme: DocumentThemeName;
  readonly custom?: CustomDocumentTheme | undefined;
}

export function documentThemeOf(settings: DocumentSettings | undefined): DocumentThemeName {
  return settings?.theme ?? defaultDocumentTheme;
}

// The name a project's theme is shown by: the Library theme's own, or the built-in's label.
export function documentThemeLabel(settings: DocumentSettings | undefined): string {
  return settings?.custom?.name ?? documentThemeLabels[documentThemeOf(settings)];
}

// A saved Library theme, as the list endpoint returns it.
export interface SavedDocumentTheme {
  readonly id: string;
  readonly name: string;
  readonly values: DocumentTheme;
  readonly updatedAt: string;
}

export const documentThemeNameMax = 80;

// The editor's sentences for a name, shared so the page refuses what the server would.
export function documentThemeNameProblems(name: string): readonly FieldError[] {
  const trimmed = name.trim();
  if (trimmed === "") return [{ field: "name", message: "Give the theme a name." }];
  if (trimmed.length > documentThemeNameMax)
    return [
      {
        field: "name",
        message: `Keep the name under ${String(documentThemeNameMax)} characters.`,
      },
    ];
  return [];
}
