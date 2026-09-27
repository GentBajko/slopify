import type { RevisionEdit } from "@app/slices/revisions/model.js";
import type { ReactElement } from "react";
import { LanguageSelect } from "./language-select";

// Edit project's language control. Changing it re-writes and re-times what depends on it
// (the rebuild preview lists which), and English leaves the key out, as Play does.
export function RevisionLanguage({
  edit,
  error,
  onChange,
}: {
  readonly edit: RevisionEdit;
  readonly error?: string | undefined;
  readonly onChange: (next: RevisionEdit) => void;
}): ReactElement {
  return (
    <div className="mb-5">
      <LanguageSelect
        value={edit.config.language}
        error={error}
        onChange={(language) => {
          const { language: _previous, ...config } = edit.config;
          onChange({
            ...edit,
            config: language === undefined || language === "en" ? config : { ...config, language },
          });
        }}
      />
    </div>
  );
}
