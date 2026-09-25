// The built-in looks a project's PDF can take. Browser-safe: Play, Edit project and the
// server all offer and accept the same names from here.
export const documentThemes = ["dicemaster", "plain"] as const;
export type DocumentThemeName = (typeof documentThemes)[number];

export const defaultDocumentTheme: DocumentThemeName = "dicemaster";

export const documentThemeLabels: Readonly<Record<DocumentThemeName, string>> = {
  dicemaster: "DiceMaster",
  plain: "Plain",
};

// What a project says about its document. A config saved before the Document stage existed
// has none and reads as the default theme.
export interface DocumentSettings {
  readonly theme: DocumentThemeName;
}

export function documentThemeOf(settings: DocumentSettings | undefined): DocumentThemeName {
  return settings?.theme ?? defaultDocumentTheme;
}
