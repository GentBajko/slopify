import type { ImagePromptChoice } from "@app/slices/admission/model.js";
import { imagesPerRunMax, numberPerPromptMax } from "@app/slices/admission/rules.js";
import type { Prompt } from "@app/slices/library/model.js";
import { useId } from "react";
import { Checkbox, HelpLine, Input } from "@/components/kit/field";
import { helpScope } from "@/components/kit/info-tip";
import { cn } from "@/lib/utils";
import { promptGist } from "./prompt-cards";

// Several image prompts run at once, each ticked and each with its own Number, bounded at
// 1 to 20 per prompt and 60 across the run. Admission refuses a Number outside them; the
// inputs below carry the same bounds so the browser's own spinner cannot walk past one.

// The smallest Number a ticked prompt may run.
const leastNumber = 1;

// How many images a freshly ticked prompt starts on: enough for a video (16), a few for a set
// of pictures with no video, never past the per-prompt cap or what the run has left.
export function freshImageCount(
  form: { readonly sources: { readonly video: string } },
  taken: number,
): number {
  const wanted = form.sources.video === "generate" ? 16 : 4;
  return Math.max(leastNumber, Math.min(wanted, numberPerPromptMax, imagesPerRunMax - taken));
}

export function ImagePrompts({
  prompts,
  picked,
  problem,
  onPick,
  rawNumbers,
  startAt = leastNumber,
}: {
  // The Number a newly ticked prompt starts on (`freshImageCount`).
  readonly startAt?: number;
  readonly rawNumbers?: {
    readonly values: readonly { readonly name: string; readonly number: string }[];
    readonly onChange: (name: string, number: string) => void;
  };
  readonly prompts: readonly Prompt[];
  readonly picked: readonly ImagePromptChoice[];
  readonly problem: (field: string) => string | undefined;
  readonly onPick: (next: readonly ImagePromptChoice[]) => void;
}) {
  const listId = useId();
  const total = picked.reduce((sum, choice) => sum + choice.number, 0);

  const missing = picked.filter((choice) => !prompts.some((prompt) => prompt.name === choice.name));
  const options = [
    ...prompts.map((prompt) => ({
      name: prompt.name,
      missing: false,
      gist: promptGist(prompt.body).sentence,
    })),
    ...missing.map((choice) => ({ name: choice.name, missing: true, gist: "" })),
  ];

  if (options.length === 0) {
    return (
      <p className="sl-fields__wide basis-full text-small text-ink-2">
        No image prompts yet. An image prompt describes the look every image is drawn in; write one
        on Prompts.
      </p>
    );
  }

  return (
    <div className="sl-fields__wide flex w-full basis-full flex-col gap-2" {...helpScope}>
      <span id={listId} className="sl-field__label">
        Image prompts
      </span>
      {/* The prompts in columns, each name with its Number at the end of its own row, so the
          boxes line up down every column. A column is wide enough for a name beside "How many
          images" and its box: at 15rem Create's wide column made three, and cut the names. */}
      <ul
        aria-labelledby={listId}
        className="m-0 grid w-full list-none grid-cols-[repeat(auto-fill,minmax(min(100%,20rem),1fr))] gap-x-6 gap-y-2 p-0"
      >
        {options.map((prompt) => {
          const at = picked.findIndex((choice) => choice.name === prompt.name);
          const choice = at === -1 ? undefined : picked[at];
          return (
            <li key={prompt.name}>
              {prompt.missing ? (
                <span className="block text-label text-danger">
                  No longer in Prompts · untick to remove
                </span>
              ) : null}
              <PromptTick
                name={prompt.name}
                gist={prompt.gist}
                number={choice?.number}
                rawNumber={
                  rawNumbers
                    ? {
                        value:
                          rawNumbers.values.find((entry) => entry.name === prompt.name)?.number ??
                          "",
                        onChange: (number) => rawNumbers.onChange(prompt.name, number),
                      }
                    : undefined
                }
                problem={at === -1 ? undefined : problem(`imagePrompts.${String(at)}.number`)}
                onTick={(ticked) => {
                  onPick(
                    ticked
                      ? // Selection order is the order the fields are collected in
                        //, so a newly ticked prompt goes last.
                        [...picked, { name: prompt.name, number: startAt }]
                      : picked.filter((entry) => entry.name !== prompt.name),
                  );
                }}
                onNumber={(number) => {
                  onPick(
                    picked.map((entry) =>
                      entry.name === prompt.name ? { name: entry.name, number } : entry,
                    ),
                  );
                }}
              />
            </li>
          );
        })}
      </ul>
      <HelpLine className="tabular-nums">
        {picked.length === 0
          ? `Tick one or more. Each image is one paid image call; a run makes at most ${String(imagesPerRunMax)}.`
          : Number.isFinite(total)
            ? `${String(total)} of at most ${String(imagesPerRunMax)} images · each is one paid image call.`
            : "Give each ticked prompt a number of images to see the total."}
      </HelpLine>
    </div>
  );
}

function PromptTick({
  name,
  gist,
  number,
  problem,
  onTick,
  onNumber,
  rawNumber,
}: {
  readonly rawNumber:
    | { readonly value: string; readonly onChange: (number: string) => void }
    | undefined;
  readonly name: string;
  // What the prompt draws, from its own first sentence, as the article cards say it.
  readonly gist: string;
  readonly number: number | undefined;
  readonly problem: string | undefined;
  readonly onTick: (ticked: boolean) => void;
  readonly onNumber: (next: number) => void;
}) {
  const tickId = useId();
  const numberId = useId();
  const noteId = useId();

  return (
    <span className="flex w-full min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-small">
      <Checkbox
        id={tickId}
        data-play-field="imagePrompts"
        checked={number !== undefined}
        className="shrink-0"
        onChange={(event) => {
          onTick(event.target.checked);
        }}
      />
      <label
        htmlFor={tickId}
        title={name}
        className={cn(
          "min-w-0 flex-1 truncate",
          number === undefined ? "text-ink-2" : "font-semibold text-ink",
        )}
      >
        {name}
      </label>
      {number === undefined ? null : (
        <>
          <label htmlFor={numberId} className="text-label text-ink-2">
            How many images
          </label>
          <Input
            id={numberId}
            data-play-field={`imagePrompts.${name}.number`}
            aria-label={`How many images for ${name}`}
            type={rawNumber ? "text" : "number"}
            min={leastNumber}
            max={numberPerPromptMax}
            inputMode="numeric"
            aria-invalid={problem !== undefined}
            aria-describedby={problem === undefined ? undefined : noteId}
            className="sl-input--number"
            // Nought is drawn as an empty box: it is what an emptied box reports, and
            // showing a 0 the user did not type would fight the next keystroke.
            value={rawNumber?.value ?? (number === 0 ? "" : String(number))}
            onChange={(event) => {
              if (rawNumber) {
                rawNumber.onChange(event.target.value);
                return;
              }
              const typed = Number.parseInt(event.target.value, 10);
              // An emptied box is a Number of nought, which the admission rule refuses by
              // name; nothing is silently corrected under the user's hands.
              onNumber(Number.isFinite(typed) ? typed : 0);
            }}
          />
        </>
      )}
      {gist === "" ? null : (
        <span className="line-clamp-2 basis-full pl-7 text-label text-ink-2">{gist}</span>
      )}
      {problem === undefined ? null : (
        <span id={noteId} className="basis-full text-label text-danger">
          {problem}
        </span>
      )}
    </span>
  );
}
