import type { ImagePromptChoice } from "@app/slices/admission/model.js";
import { imagesPerRunMax, numberPerPromptMax } from "@app/slices/admission/rules.js";
import type { Prompt } from "@app/slices/library/model.js";
import { useId } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// mockup §Q12 and §Q13: several image prompts run in one run, each ticked and each with
// its own Number. `logic/04` §Q30 bounds it - 1 to 20 per prompt, 60 across the run -
// and the admission rule is what refuses a Number outside them; the inputs below carry
// the same bounds so the browser's own spinner cannot walk past one.

// The Number a prompt starts on when it is ticked: the smallest a ticked prompt may run.
const firstNumber = 1;

export function ImagePrompts({
  prompts,
  picked,
  problem,
  onPick,
}: {
  readonly prompts: readonly Prompt[];
  readonly picked: readonly ImagePromptChoice[];
  readonly problem: (field: string) => string | undefined;
  readonly onPick: (next: readonly ImagePromptChoice[]) => void;
}) {
  const listId = useId();
  const total = picked.reduce((sum, choice) => sum + choice.number, 0);

  if (prompts.length === 0) {
    return (
      <p className="basis-full text-right text-small text-ink3">
        No image prompts saved. Write one on Prompts.
      </p>
    );
  }

  return (
    <div className="flex basis-full flex-col items-end gap-[6px]">
      <span id={listId} className="engraved text-ink3">
        Image prompts
      </span>
      <ul aria-labelledby={listId} className="flex flex-wrap justify-end gap-x-4 gap-y-2">
        {prompts.map((prompt) => {
          const at = picked.findIndex((choice) => choice.name === prompt.name);
          const choice = at === -1 ? undefined : picked[at];
          return (
            <li key={prompt.id}>
              <PromptTick
                name={prompt.name}
                number={choice?.number}
                problem={at === -1 ? undefined : problem(`imagePrompts.${String(at)}.number`)}
                onTick={(ticked) => {
                  onPick(
                    ticked
                      ? // Selection order is the order the fields are collected in
                        // (`logic/03` §Q24), so a newly ticked prompt goes last.
                        [...picked, { name: prompt.name, number: firstNumber }]
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
      {picked.length === 0 ? null : (
        <span className="text-label text-ink3 tabular-nums">
          {`${String(total)} of ${String(imagesPerRunMax)} images`}
        </span>
      )}
    </div>
  );
}

function PromptTick({
  name,
  number,
  problem,
  onTick,
  onNumber,
}: {
  readonly name: string;
  readonly number: number | undefined;
  readonly problem: string | undefined;
  readonly onTick: (ticked: boolean) => void;
  readonly onNumber: (next: number) => void;
}) {
  const tickId = useId();
  const numberId = useId();
  const noteId = useId();

  return (
    <span className="inline-flex items-center gap-2 text-small">
      <input
        id={tickId}
        type="checkbox"
        checked={number !== undefined}
        className="size-[14px] shrink-0 accent-accent"
        onChange={(event) => {
          onTick(event.target.checked);
        }}
      />
      <label htmlFor={tickId} className={number === undefined ? "text-ink3" : "text-ink"}>
        {name}
      </label>
      <Label htmlFor={numberId} className="sr-only">
        {`Number for ${name}`}
      </Label>
      <Input
        id={numberId}
        type="number"
        min={firstNumber}
        max={numberPerPromptMax}
        inputMode="numeric"
        disabled={number === undefined}
        aria-invalid={problem !== undefined}
        aria-describedby={problem === undefined ? undefined : noteId}
        className="w-[64px] tabular-nums"
        // Nought is drawn as an empty box: it is what an emptied box reports, and
        // showing a 0 the user did not type would fight the next keystroke.
        value={number === undefined || number === 0 ? "" : String(number)}
        onChange={(event) => {
          const typed = Number.parseInt(event.target.value, 10);
          // An emptied box is a Number of nought, which the admission rule refuses by
          // name; nothing is silently corrected under the user's hands.
          onNumber(Number.isFinite(typed) ? typed : 0);
        }}
      />
      {problem === undefined ? null : (
        <span id={noteId} className="text-label text-red">
          {problem}
        </span>
      )}
    </span>
  );
}
