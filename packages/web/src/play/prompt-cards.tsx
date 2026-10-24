import type { Prompt, PromptKind } from "@app/slices/library/model.js";
import { type ReactElement, useId, useState } from "react";
import { HelpLine, Input } from "@/components/kit/field";
import { Fold } from "@/components/kit/fold";
import { helpScope } from "@/components/kit/info-tip";
import { TextLink } from "@/components/kit/link";
import { cn } from "@/lib/utils";

// What a prompt makes, read from its own text until prompts carry a description: its first
// sentence with each {{Keyword}} said as "the keyword", and how long a narration it asks for
// when its text names a word count ("Length: 2800-3200 words" is about 20 minutes).
export function promptGist(body: string): {
  readonly sentence: string;
  readonly length: string | undefined;
} {
  const first =
    body
      .split("\n")
      .map((line) => line.trim())
      .find((line) => line !== "") ?? "";
  const plain = first.replace(/^subject:\s*/i, "").replace(
    /\{\{\s*([^}]+?)\s*\}\}/g,
    (_match, name: string) =>
      `the ${name
        .replace(/^Slopify_/, "")
        .replace(/_/g, " ")
        .toLowerCase()}`,
  );
  const end = /[.!?](\s|$)/.exec(plain);
  const cut = end === null ? plain : plain.slice(0, end.index + 1);
  const sentence = cut.length > 160 ? `${cut.slice(0, cut.lastIndexOf(" ", 157))}…` : cut;
  return {
    sentence: sentence === "" ? "" : `${sentence.charAt(0).toUpperCase()}${sentence.slice(1)}`,
    length: lengthOf(body),
  };
}

// About 150 words is one minute of narration.
function lengthOf(body: string): string | undefined {
  const number = (text: string): number => Number(text.replace(/,/g, ""));
  const range = /(\d[\d,]*)\s*(?:-|–|to)\s*(\d[\d,]*)\s*words/i.exec(body);
  const single = /(\d[\d,]*)\s*words/i.exec(body);
  const words =
    range !== null
      ? (number(range[1] ?? "") + number(range[2] ?? "")) / 2
      : single !== null
        ? number(single[1] ?? "")
        : undefined;
  if (words === undefined || !Number.isFinite(words) || words <= 0) return undefined;
  const minutes = Math.max(1, Math.round(words / 150));
  const counted = range === null ? single?.[0] : range[0];
  return `About ${String(minutes)} min · ${counted ?? ""}`;
}

// More prompts than this and the list scrolls in its own box; more than `filterFrom` and a
// filter box narrows it.
const scrollFrom = 6;
const filterFrom = 8;

// The article (or script) prompt, the heart of a run: every prompt of the kind as a card with
// what it makes and how long, so the choice is made on what each writes, not on its name. The
// picked one's whole text folds open under the cards; New prompt opens the prompt editor.
export function PromptCards({
  field,
  label,
  kind,
  prompts,
  value,
  problem,
  onPick,
}: {
  readonly field: string;
  readonly label: string;
  readonly kind: PromptKind;
  readonly prompts: readonly Prompt[];
  readonly value: string;
  readonly problem: string | undefined;
  readonly onPick: (name: string) => void;
}): ReactElement {
  const labelId = useId();
  const name = useId();
  const [filter, setFilter] = useState("");
  const mine = prompts.filter((prompt) => prompt.kind === kind);
  const picked = mine.find((prompt) => prompt.name === value);
  const words = filter.trim().toLowerCase();
  const cards = [
    ...(value !== "" && picked === undefined ? [{ name: value, body: undefined }] : []),
    ...mine
      .filter(
        (prompt) =>
          words === "" ||
          prompt.name === value ||
          `${prompt.name} ${prompt.body}`.toLowerCase().includes(words),
      )
      .map((prompt) => ({ name: prompt.name, body: prompt.body })),
  ];
  // The radio a refusal focuses: the picked one, else the first.
  const focusName = cards.some((card) => card.name === value) ? value : cards[0]?.name;
  const kindWord = kind === "script" ? "script" : "article";
  const newPrompt = (
    <TextLink to="/prompts/new" search={{ kind }}>
      New prompt ↗ (opens Prompts)
    </TextLink>
  );
  return (
    <div className="flex min-w-0 flex-col gap-2" {...helpScope}>
      <span id={labelId} className="sl-field__label">
        {label}
      </span>
      {mine.length > filterFrom ? (
        <Input
          type="search"
          aria-label={`Filter ${kindWord} prompts`}
          placeholder={`Filter ${String(mine.length)} prompts`}
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          className="max-w-[24rem] text-small"
        />
      ) : null}
      {cards.length === 0 ? (
        <HelpLine>
          {mine.length === 0
            ? `No ${kindWord} prompts yet. A prompt tells the AI what to write.`
            : `No prompt contains "${filter.trim()}".`}{" "}
          {newPrompt}
        </HelpLine>
      ) : (
        <>
          <div
            role="radiogroup"
            aria-labelledby={labelId}
            aria-invalid={problem !== undefined}
            className={cn(
              "grid gap-2 grid-cols-[repeat(auto-fill,minmax(min(100%,15rem),1fr))]",
              cards.length > scrollFrom && "max-h-[19rem] overflow-y-auto pr-1",
            )}
          >
            {cards.map((card) => {
              const checked = card.name === value;
              const gist =
                card.body === undefined
                  ? {
                      sentence: "A copy kept here; it is no longer in Prompts.",
                      length: undefined,
                    }
                  : promptGist(card.body);
              return (
                <label
                  key={card.name}
                  className={cn(
                    "flex min-w-0 cursor-pointer items-start gap-3 rounded-control border px-3 py-2",
                    checked ? "border-focus bg-raised" : "border-line-strong hover:bg-raised",
                  )}
                >
                  <input
                    type="radio"
                    name={name}
                    value={card.name}
                    checked={checked}
                    data-play-field={card.name === focusName ? field : undefined}
                    className="mt-0.5 size-4 shrink-0 accent-accent"
                    onChange={() => onPick(card.name)}
                  />
                  <span className="flex min-w-0 flex-col">
                    <span className="text-small font-semibold text-ink">{card.name}</span>
                    {gist.sentence === "" ? null : (
                      <span className="line-clamp-2 text-small text-ink-2">{gist.sentence}</span>
                    )}
                    {gist.length === undefined ? null : (
                      <span className="text-label text-ink-3">{gist.length}</span>
                    )}
                  </span>
                </label>
              );
            })}
          </div>
          {problem === undefined ? null : <p className="sl-field__error m-0">{problem}</p>}
          <HelpLine>A prompt tells the AI what to write, and at what length. {newPrompt}</HelpLine>
        </>
      )}
      {picked === undefined ? null : (
        <Fold summary="Text of the prompt" state={picked.name}>
          <pre
            data-play-field={`${field}.preview`}
            className="m-0 whitespace-pre-wrap break-words pb-3 font-sans text-small text-ink-2"
          >
            {picked.body}
          </pre>
        </Fold>
      )}
    </div>
  );
}
