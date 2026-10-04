import { languageInfo, languageList } from "@app/kernel/ports/languages.js";
import type { Voice } from "@app/slices/settings/model.js";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type ReactElement, useId, useState } from "react";
import { setVoiceLanguages } from "@/api";
import { useApp } from "@/app-context";
import { Button } from "@/components/kit/button";
import { Input } from "@/components/kit/field";
import { keys } from "@/queries";

// "es, de" typed in the box, as the list the server stores.
export function languagesOfText(text: string): readonly string[] {
  return text
    .split(/[\s,;]+/)
    .map((one) => one.trim().toLowerCase())
    .filter((one) => one !== "");
}

// What the typed codes read as, under the box: the names Slopify knows, and the codes it does
// not, so "es, dee" says at once that "dee" is not a language before Add voice is pressed.
export function languagesReading(text: string): string {
  const codes = languagesOfText(text);
  if (codes.length === 0) return "Codes such as es, de. Empty means any language.";
  const known = codes.filter((code) => languageList.some((one) => one.code === code));
  const unknown = codes.filter((code) => !known.includes(code));
  const names = known.map((code) => languageInfo(code).name).join(", ");
  if (unknown.length === 0) return `Reads as: ${names}.`;
  const list = languageList.map((one) => one.code).join(", ");
  return `${names === "" ? "" : `Reads as: ${names}. `}Not a language code Slopify knows: ${unknown.join(", ")}. Use one of ${list}.`;
}

// The languages a voice speaks, by name; unknown is offered for every language.
export function voiceLanguagesText(voice: Pick<Voice, "languages">): string {
  if (voice.languages === undefined) return "Any (not known)";
  return voice.languages
    .map((code) => (languageInfo(code).code === code ? languageInfo(code).name : code))
    .join(", ");
}

// Settings → Voices' Languages cell: what the voice speaks, and an Edit button that turns the
// cell into a box of codes with Save and Cancel.
export function VoiceLanguagesCell({ voice }: { readonly voice: Voice }): ReactElement {
  const { api } = useApp();
  const client = useQueryClient();
  const id = useId();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState((voice.languages ?? []).join(", "));
  const [refusal, setRefusal] = useState<string | undefined>(undefined);
  const save = useMutation({
    mutationFn: () => setVoiceLanguages(api, voice.id, languagesOfText(text)),
    onSuccess: async (refused) => {
      if (refused !== undefined) {
        setRefusal(refused.message);
        return;
      }
      setEditing(false);
      setRefusal(undefined);
      await client.invalidateQueries({ queryKey: keys.voices });
    },
  });
  if (!editing)
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-ink-2">{voiceLanguagesText(voice)}</span>
        <Button
          variant="quiet"
          size="small"
          aria-label={`Edit the languages of ${voice.name}`}
          onClick={() => setEditing(true)}
        >
          Edit
        </Button>
      </div>
    );
  return (
    // A form so Enter in the box saves, as Save does.
    <form
      className="grid gap-1"
      onSubmit={(event) => {
        event.preventDefault();
        if (!save.isPending) save.mutate();
      }}
    >
      <Input
        id={id}
        aria-label={`Languages of ${voice.name}`}
        value={text}
        placeholder="es, de"
        aria-invalid={refusal !== undefined}
        onChange={(event) => {
          setText(event.target.value);
          setRefusal(undefined);
        }}
      />
      <p className="m-0 text-small text-ink-2">{languagesReading(text)}</p>
      {refusal === undefined ? null : <p className="m-0 text-small text-danger">{refusal}</p>}
      {save.error === null ? null : (
        <p className="m-0 text-small text-danger">{save.error.message}</p>
      )}
      <div className="flex gap-2">
        <Button type="submit" size="small" disabled={save.isPending}>
          Save
        </Button>
        <Button
          variant="quiet"
          size="small"
          onClick={() => {
            setEditing(false);
            setRefusal(undefined);
            setText((voice.languages ?? []).join(", "));
          }}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
