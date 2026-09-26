import type { FieldError } from "../admission/rules.js";
import type { DocumentTheme } from "./theme.js";

// The built-in looks a project's PDF can be given. Browser-safe: Play, Edit project and the
// server all offer the same names from here.
export const documentThemes = ["plain"] as const;
export type BuiltInDocumentThemeName = (typeof documentThemes)[number];

// DiceMaster was built in before 2.3.0 and is one brand's look, not Slopify's. A project
// saved with it keeps it (see legacy-dicemaster.ts), so the name is still read everywhere a
// config is parsed, but it is never offered.
export const legacyDocumentTheme = "dicemaster";

// Every name a saved config may carry.
export const documentThemeNames = [...documentThemes, legacyDocumentTheme] as const;
export type DocumentThemeName = (typeof documentThemeNames)[number];

// What a new project, a fresh Play draft and a draft saved before the Document stage get.
export const defaultDocumentTheme: BuiltInDocumentThemeName = "plain";

export const documentThemeLabels: Readonly<Record<DocumentThemeName, string>> = {
  plain: "Plain",
  dicemaster: "DiceMaster",
};

// A theme saved in Library → Documents. A project keeps a copy of the values it was given,
// as it keeps its prompts' text, so editing or deleting the Library theme later never
// changes a document already made or queued.
export interface CustomDocumentTheme {
  readonly id: string;
  readonly name: string;
  readonly values: DocumentTheme;
}

// What a project says about its document. With `custom`, the custom values are used and
// `theme` is ignored.
export interface DocumentSettings {
  readonly theme: DocumentThemeName;
  readonly custom?: CustomDocumentTheme | undefined;
}

// The built-in a saved project config is drawn with. A project saved before the Document stage
// had a theme setting has none, and was drawn with DiceMaster, the default of the day; it still
// is, so the PDFs it already made stay current. New projects always save their theme, so this
// fallback never reaches one.
export function documentThemeOf(settings: DocumentSettings | undefined): DocumentThemeName {
  return settings?.theme ?? legacyDocumentTheme;
}

// The built-in a Play draft or template form stands for. A draft is not a project yet, so an
// absent setting is the current default rather than the old one.
export function draftDocumentThemeOf(settings: DocumentSettings | undefined): DocumentThemeName {
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
