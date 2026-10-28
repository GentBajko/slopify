import { auditionLineMax } from "@app/slices/voices/audition.js";
import { useMutation, useQuery } from "@tanstack/react-query";
import { type ReactElement, useEffect, useId, useState } from "react";
import { quoteAuditions, speakAudition } from "@/api";
import { useApp } from "@/app-context";
import { Button } from "@/components/kit/button";
import { HelpLine, Textarea } from "@/components/kit/field";
import { Fold } from "@/components/kit/fold";
import { helpScope } from "@/components/kit/info-tip";
import { usd } from "@/lib/format";
import { narrationAliasesQuery } from "@/queries";
import { spokenText } from "./article-task";
import type { PlayFormState } from "./state";

// The first sentences of the text, cut at a sentence end that fits one audition.
export function samplePassage(text: string, limit = 280): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length <= limit) return flat;
  const cut = flat.slice(0, limit);
  const end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("? "), cut.lastIndexOf("! "));
  return end > 40 ? cut.slice(0, end + 1) : cut.slice(0, cut.lastIndexOf(" "));
}

// A short sample of the actual material before a long run: a passage of the person's own text in
// the chosen voice, with their aliases, priced before it is asked for. It uses the speakers'
// audition endpoint, so it costs one short request and nothing of it is kept for the run.
export function VoiceSample({ form }: { readonly form: PlayFormState }): ReactElement {
  const { api } = useApp();
  const id = useId();
  const { provider, model, voice } = form.audio;
  const ready = provider !== "" && model !== "" && voice !== "";
  const useAliases = form.audio.useNarrationAliases === true;
  const aliases = useQuery({ ...narrationAliasesQuery(api), enabled: useAliases });
  const [typed, setTyped] = useState<string | undefined>(undefined);
  const suggested =
    form.sources.article === "provide" && form.provided.article.trim() !== ""
      ? samplePassage(spokenText(form.provided.article, undefined).text)
      : "";
  const passage = (typed ?? suggested).slice(0, auditionLineMax);
  const said = spokenText(passage, useAliases ? aliases.data?.aliases : undefined).text.trim();
  const quote = useQuery({
    queryKey: ["audition-quote", provider, model, said],
    queryFn: () => quoteAuditions(api, [{ speaker: "Sample", provider, model, text: said }]),
    enabled: ready && said !== "",
    staleTime: 60_000,
  });
  const [url, setUrl] = useState<string | undefined>(undefined);
  useEffect(
    () => () => {
      if (url !== undefined) URL.revokeObjectURL(url);
    },
    [url],
  );
  const speak = useMutation({
    mutationFn: () => speakAudition(api, { provider, model, voice, text: said }),
    onSuccess: (blob) => {
      const next = URL.createObjectURL(blob);
      setUrl(next);
      void new Audio(next).play().catch(() => {});
    },
  });
  const estimate = quote.data?.estimate;
  const price =
    estimate === undefined || estimate === null
      ? undefined
      : estimate.unknown > 0
        ? "price unknown"
        : `about ${usd(estimate.high)}`;
  return (
    <Fold className="col-span-full" summary="Sample of your text in this voice">
      <div className="flex flex-col gap-3 pt-2 pb-3">
        <div className="flex flex-col gap-1" {...helpScope}>
          <label htmlFor={id} className="sl-field__label">
            Passage
          </label>
          <HelpLine>
            Up to {String(auditionLineMax)} characters, read in this voice
            {useAliases ? " with your pronunciation list" : ""}. The article's pronunciation
            glossary and narration preparation are not applied, and the sample is not reused in the
            run.
          </HelpLine>
          <Textarea
            id={id}
            rows={3}
            maxLength={auditionLineMax}
            value={passage}
            placeholder="Paste a passage with the names you want to hear."
            onChange={(event) => setTyped(event.target.value)}
          />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            disabled={!ready || said === "" || speak.isPending}
            disabledReason={
              !ready ? "Pick a voice service, model and voice first" : "Type a passage first"
            }
            onClick={() => speak.mutate()}
          >
            {speak.isPending
              ? "Speaking…"
              : `Hear the sample${price === undefined ? "" : ` · ${price}`}`}
          </Button>
          <span className="min-h-5 text-label text-ink-2" aria-live="polite">
            {speak.error !== null
              ? `The sample wasn't spoken. ${speak.error.message}`
              : url !== undefined
                ? "Playing the sample."
                : !ready
                  ? "Pick a voice service, model and voice first."
                  : said === ""
                    ? "Type a passage first."
                    : null}
          </span>
        </div>
      </div>
    </Fold>
  );
}
