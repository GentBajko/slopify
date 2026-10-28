import { languageInfo, languageList } from "@app/kernel/ports/languages.js";
import type { Voice } from "@app/slices/settings/model.js";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { XIcon } from "lucide-react";
import type { ReactElement } from "react";
import { setVoiceLanguages } from "@/api";
import { useApp } from "@/app-context";
import { IconButton } from "@/components/kit/button";
import { Select } from "@/components/kit/field";
import { keys } from "@/queries";

// A language's name as the lists say it ("Spanish"); a code Slopify does not know stays a code.
function nameOf(code: string): string {
  return languageInfo(code).code === code ? languageInfo(code).name : code;
}

// A voice's languages, picked by name rather than typed as codes: each picked one is a chip
// with its own Remove, and the select adds another. With none picked the select reads "Any
// language", which is what an empty list means to Create's voice lists.
export function VoiceLanguagesPicker({
  value,
  onChange,
  label,
  disabled = false,
}: {
  readonly value: readonly string[];
  readonly onChange: (codes: readonly string[]) => void;
  // The select's accessible name ("Languages Narrator M speaks").
  readonly label: string;
  readonly disabled?: boolean;
}): ReactElement {
  const left = languageList.filter((language) => !value.includes(language.code));
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
      {value.map((code) => (
        <span key={code} className="sl-chip h-8 gap-1 pr-1">
          {nameOf(code)}
          <IconButton
            label={`Remove ${nameOf(code)}`}
            size="small"
            tip={false}
            disabled={disabled}
            onClick={() => onChange(value.filter((one) => one !== code))}
          >
            <XIcon aria-hidden="true" className="size-3.5" strokeWidth={2} />
          </IconButton>
        </span>
      ))}
      {left.length === 0 ? null : (
        <Select
          aria-label={label}
          className="sl-select--compact"
          value=""
          disabled={disabled}
          options={[
            { value: "", label: value.length === 0 ? "Any language" : "Add a language" },
            ...left.map((language) => ({ value: language.code, label: language.name })),
          ]}
          onChange={(event) => {
            if (event.target.value !== "") onChange([...value, event.target.value]);
          }}
        />
      )}
    </div>
  );
}

// Settings → Voices: what a saved voice speaks, changed in place; each change is saved at once.
export function VoiceLanguagesCell({ voice }: { readonly voice: Voice }): ReactElement {
  const { api } = useApp();
  const client = useQueryClient();
  const save = useMutation({
    mutationFn: (codes: readonly string[]) => setVoiceLanguages(api, voice.id, codes),
    onSettled: async () => {
      await client.invalidateQueries({ queryKey: keys.voices });
    },
  });
  const shown =
    save.isPending && save.variables !== undefined ? save.variables : (voice.languages ?? []);
  const problem = save.error?.message ?? save.data?.message;
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <VoiceLanguagesPicker
        value={shown}
        label={`Languages ${voice.name} speaks`}
        disabled={save.isPending}
        onChange={(codes) => save.mutate(codes)}
      />
      {problem === undefined ? null : (
        <p role="alert" className="m-0 text-small text-danger">
          {problem}
        </p>
      )}
    </div>
  );
}
