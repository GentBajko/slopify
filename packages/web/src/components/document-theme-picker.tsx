import {
  type DocumentSettings,
  documentThemeLabels,
  documentThemeOf,
  documentThemes,
  legacyDocumentTheme,
} from "@app/slices/document/model.js";
import { useQuery } from "@tanstack/react-query";
import { useApp } from "@/app-context";
import { Picker } from "@/components/ui/picker";
import { documentThemesQuery } from "@/queries";

// The theme a project's PDF is drawn with: a built-in or a theme from Library → Documents.
// Picking a Library theme copies its values into the project, as a prompt's text is copied,
// so editing the theme later leaves this project alone until it is picked again. A project
// whose copy no longer matches the Library (or whose theme was deleted) keeps an option for
// the copy it has. Likewise a project saved with the retired DiceMaster built-in keeps an option
// for it while it is the current choice; it is never offered otherwise.
export function DocumentThemePicker({
  id,
  value,
  disabled,
  className,
  field,
  onChange,
}: {
  readonly id: string;
  readonly value: DocumentSettings | undefined;
  readonly disabled: boolean;
  readonly className?: string;
  // The Play field the readiness rail points at, when there is one.
  readonly field?: string;
  readonly onChange: (next: DocumentSettings) => void;
}) {
  const { api } = useApp();
  const listing = useQuery(documentThemesQuery(api));
  const saved = listing.data?.themes ?? [];
  const custom = value?.custom;
  const library = custom === undefined ? undefined : saved.find((one) => one.id === custom.id);
  const kept =
    custom !== undefined &&
    (library === undefined ||
      library.name !== custom.name ||
      JSON.stringify(library.values) !== JSON.stringify(custom.values));
  const legacy = custom === undefined && documentThemeOf(value) === legacyDocumentTheme;
  const selected =
    custom === undefined
      ? `builtin:${documentThemeOf(value)}`
      : kept
        ? "kept"
        : `custom:${custom.id}`;

  return (
    <Picker
      id={id}
      data-play-field={field}
      className={className}
      disabled={disabled}
      value={selected}
      onChange={(event) => {
        const picked = event.target.value;
        if (picked === "kept") return;
        if (picked.startsWith("builtin:")) {
          const theme = documentThemes.find((one) => `builtin:${one}` === picked);
          if (theme !== undefined) onChange({ theme });
          return;
        }
        const theme = saved.find((one) => `custom:${one.id}` === picked);
        if (theme !== undefined)
          onChange({
            theme: documentThemeOf(value),
            custom: { id: theme.id, name: theme.name, values: theme.values },
          });
      }}
    >
      <optgroup label="Built in">
        {documentThemes.map((theme) => (
          <option key={theme} value={`builtin:${theme}`}>
            {documentThemeLabels[theme]}
          </option>
        ))}
        {legacy ? (
          <option value={`builtin:${legacyDocumentTheme}`}>
            {`${documentThemeLabels[legacyDocumentTheme]} (retired, this project's look)`}
          </option>
        ) : null}
      </optgroup>
      {saved.length === 0 && !kept ? null : (
        <optgroup label="Your themes">
          {kept ? <option value="kept">{`${custom.name} (this project's copy)`}</option> : null}
          {saved.map((theme) => (
            <option key={theme.id} value={`custom:${theme.id}`}>
              {kept && library?.id === theme.id ? `${theme.name} (current version)` : theme.name}
            </option>
          ))}
        </optgroup>
      )}
    </Picker>
  );
}
