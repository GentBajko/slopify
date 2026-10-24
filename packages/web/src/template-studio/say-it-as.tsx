import { useQuery, useQueryClient } from "@tanstack/react-query";
import { type ReactElement, useEffect, useState } from "react";
import { quoteAuditions, speakAudition } from "@/api";
import { useApp } from "@/app-context";
import { Button } from "@/components/kit/button";
import { Field, HelpLine, Input } from "@/components/kit/field";
import { helpScope } from "@/components/kit/info-tip";
import { usd } from "@/lib/format";
import {
  type PronunciationsView,
  pronunciationsQuery,
  quoteSayItAs,
  saveSayItAs,
  templateStudioKey,
} from "./api";

type Name = PronunciationsView["names"][number];
type Voice = NonNullable<PronunciationsView["voice"]>;

// A price too small to say in cents.
export function priceWords(high: number): string {
  return high > 0 && high < 0.005 ? "under $0.01" : `about ${usd(high)}`;
}

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");

// The line as the voice gets it: the word said the new way.
function spokenLine(line: string, term: string, spoken: string | null): string {
  if (spoken === null || spoken.trim() === "") return line;
  return line.replace(
    new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(term)}(?![\\p{L}\\p{N}])`, "giu"),
    spoken.trim(),
  );
}

// Narration → names the voice may say wrong: the names the sample's article says. Each plays its
// line in the template's voice, and a way to say it is kept in your pronunciations and re-voices
// only the sample's lines that say it, at the price on its Save. Shown only once the sample's
// article names someone or something; before that there is nothing to check.
export function SayItAs({
  templateId,
  revisionId,
  aliasesOn,
  onAliasesOn,
}: {
  readonly templateId: string;
  // The sample's revision: a new one may say other names.
  readonly revisionId: string | null;
  // Whether the template being edited says names the way your pronunciations list them, and
  // how to turn that on (Save then keeps it).
  readonly aliasesOn: boolean;
  readonly onAliasesOn: () => void;
}): ReactElement | null {
  const { api } = useApp();
  const list = useQuery(pronunciationsQuery(api, templateId, revisionId));
  const [another, setAnother] = useState("");
  if (list.error)
    return (
      <p role="alert" className="m-0 text-small text-danger">
        {`The names to check didn't load: ${list.error.message} Reload the page to try again.`}
      </p>
    );
  const data = list.data;
  if (data === undefined || data.names.length === 0) return null;
  const extra = another.trim();
  const names: readonly Name[] =
    data === undefined
      ? []
      : extra === "" || data.names.some((one) => one.term.toLowerCase() === extra.toLowerCase())
        ? data.names
        : [...data.names, { term: extra, ipa: [], line: null, spokenAs: null }];
  return (
    <section aria-label="Say it as" className="flex flex-col gap-3">
      <h4 className="m-0 text-small font-semibold text-ink">Names the voice may say wrong</h4>
      {data.problem === null ? null : <p className="m-0 text-small text-ink-2">{data.problem}</p>}
      {data.aliasesOn ? null : aliasesOn ? (
        <p className="m-0 text-small text-ink-2">
          Save to have the narration use your pronunciations, then say a name another way.
        </p>
      ) : (
        <p className="m-0 flex flex-wrap items-center gap-x-2 text-small text-ink-2">
          The narration doesn't use your pronunciations yet.
          <Button size="small" onClick={onAliasesOn}>
            Use them
          </Button>
        </p>
      )}
      {names.length === 0 ? null : (
        <ul aria-label="Names to check" className="m-0 flex list-none flex-col gap-3 p-0">
          {names.map((name) => (
            <NameRow
              key={name.term}
              templateId={templateId}
              name={name}
              voice={data.voice}
              enabled={data.aliasesOn}
            />
          ))}
        </ul>
      )}
      {revisionId === null ? null : (
        <Field
          label="Another word to check"
          help="Type a name the article says to hear it in the template's voice."
        >
          <Input
            value={another}
            maxLength={100}
            placeholder="A name the script says"
            onChange={(event) => setAnother(event.target.value)}
          />
        </Field>
      )}
    </section>
  );
}

function NameRow({
  templateId,
  name,
  voice,
  enabled,
}: {
  readonly templateId: string;
  readonly name: Name;
  readonly voice: Voice | null;
  readonly enabled: boolean;
}): ReactElement {
  const { api } = useApp();
  const client = useQueryClient();
  const [typed, setTyped] = useState("");
  const [settled, setSettled] = useState("");
  const [note, setNote] = useState<{ readonly error: boolean; readonly text: string }>();
  const [saving, setSaving] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [url, setUrl] = useState<string>();
  useEffect(
    () => () => {
      if (url !== undefined) URL.revokeObjectURL(url);
    },
    [url],
  );
  // Priced once typing pauses, so each key press isn't a request.
  useEffect(() => {
    const timer = setTimeout(() => setSettled(typed.trim()), 300);
    return () => clearTimeout(timer);
  }, [typed]);
  const heard = spokenLine(name.line ?? name.term, name.term, typed.trim() || name.spokenAs);
  const playPrice = useQuery({
    queryKey: ["audition-quote", voice?.provider ?? "", voice?.model ?? "", heard],
    queryFn: () =>
      quoteAuditions(api, [
        {
          speaker: "Sample",
          provider: voice?.provider ?? "",
          model: voice?.model ?? "",
          text: heard,
        },
      ]),
    enabled: voice !== null,
    staleTime: 60_000,
  });
  const quote = useQuery({
    queryKey: [...templateStudioKey(templateId), "say-it-as", name.term, settled],
    queryFn: () => quoteSayItAs(api, templateId, { written: name.term, spoken: settled }),
    enabled: enabled && settled !== "",
  });
  async function play(): Promise<void> {
    if (voice === null) return;
    setPlaying(true);
    try {
      const blob = await speakAudition(api, { ...voice, text: heard });
      const next = URL.createObjectURL(blob);
      setUrl(next);
      void new Audio(next).play().catch(() => undefined);
    } catch (error) {
      setNote({
        error: true,
        text: `The line wasn't spoken: ${error instanceof Error ? error.message : String(error)} Press Play again.`,
      });
    } finally {
      setPlaying(false);
    }
  }
  async function save(): Promise<void> {
    const priced = quote.data;
    if (priced === undefined) return;
    setSaving(true);
    try {
      const reply = await saveSayItAs(api, templateId, {
        written: name.term,
        spoken: settled,
        acknowledgedHigh: priced.high,
        acknowledgedUnknown: priced.unknown > 0,
      });
      if (!reply.ok) {
        setNote({ error: true, text: reply.message });
        return;
      }
      setNote({
        error: false,
        text: `Saved in your pronunciations: “${name.term}” is said “${settled}”.${reply.value.queued ? " Re-voicing the sample's lines that say it." : " The sample's article doesn't say it, so nothing is re-voiced."}`,
      });
      setTyped("");
      await client.invalidateQueries({ queryKey: templateStudioKey(templateId) });
    } catch (error) {
      setNote({
        error: true,
        text: `“Say it as” wasn't saved: ${error instanceof Error ? error.message : String(error)} Press Save again.`,
      });
    } finally {
      setSaving(false);
    }
  }
  const estimate = playPrice.data?.estimate;
  const playLabel =
    estimate === undefined || estimate === null
      ? `Play ${name.term}`
      : `Play ${name.term} · ${estimate.unknown > 0 ? "price unknown" : priceWords(estimate.high)}`;
  const lines = quote.data?.lines ?? 0;
  const saveLabel =
    quote.data === undefined
      ? "Save"
      : lines === 0
        ? "Save · nothing to re-voice"
        : `Save · re-voice ${String(lines)} ${lines === 1 ? "line" : "lines"} · ${priceWords(quote.data.high)}`;
  const saveReason = !enabled
    ? "Use your pronunciations first"
    : settled === ""
      ? "Type how to say it first"
      : quote.data === undefined
        ? "Pricing the re-voicing"
        : quote.data.problem !== null
          ? quote.data.problem
          : saving
            ? "Saving"
            : undefined;
  return (
    <li aria-label={name.term} className="flex flex-col gap-2 border-line border-b pb-3">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-body font-semibold text-ink">{name.term}</span>
        {name.ipa.length === 0 ? null : (
          <span className="text-small text-ink-2">{`/${name.ipa.join(" ")}/`}</span>
        )}
        {name.spokenAs === null ? null : (
          <span className="text-small text-ink-2">{`Said as “${name.spokenAs}”`}</span>
        )}
      </div>
      {name.line === null ? null : <p className="m-0 text-small text-ink-2">{name.line}</p>}
      <div className="flex flex-col gap-1" {...helpScope}>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="small"
            variant="quiet"
            disabled={voice === null || playing}
            disabledReason={voice === null ? "Choose a voice in Narration first" : "Speaking"}
            onClick={() => void play()}
          >
            {playLabel}
          </Button>
          <Input
            aria-label={`Say ${name.term} as`}
            className="min-w-0 flex-1 basis-40"
            value={typed}
            maxLength={200}
            placeholder="Say it as…"
            disabled={!enabled}
            onChange={(event) => setTyped(event.target.value)}
          />
          <Button
            size="small"
            disabled={saveReason !== undefined}
            disabledReason={saveReason}
            focusableWhenDisabled
            onClick={() => void save()}
          >
            {saveLabel}
          </Button>
        </div>
        <HelpLine>
          Save keeps it for every video and re-voices only the sample's lines with it.
        </HelpLine>
      </div>
      {note === undefined ? null : (
        <p
          role={note.error ? "alert" : "status"}
          className={note.error ? "m-0 text-small text-danger" : "m-0 text-small text-ink-2"}
        >
          {note.text}
        </p>
      )}
    </li>
  );
}
