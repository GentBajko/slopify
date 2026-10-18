import { detectSlots } from "@app/slices/admission/substitute.js";
import type { KeywordPlace } from "@app/slices/keywords/model.js";
import { keywordProblems, placeOfKey, textEntryProblems } from "@app/slices/keywords/rules.js";
import { lintEntry, lintPrompt } from "@app/slices/library/lint.js";
import { bodyMax, type PromptKind } from "@app/slices/library/model.js";
import type { ReactElement } from "react";
import { Field } from "@/components/kit/field";
import { OldKeywordNames } from "@/components/old-keyword-names";
import { SlotBody } from "@/components/slot-body";

// A project's own copy of a prompt, edited the way Library edits a prompt: the same large
// field, no spellcheck on `{{keywords}}`, and every malformed `{{` marked where it stands and
// said in words under the field, with its line and column. The prompt's key says where it runs,
// so a keyword Slopify fills is judged there as a saved version is: one where it can't be filled
// is refused on save, and an old name gets Update to new names under the field.
export function RawPromptField({
  id,
  name,
  promptKey,
  script,
  textEntry,
  value,
  onChange,
}: {
  readonly id: string;
  readonly name: string;
  // The key of the rendered prompt (`article`, `imagePrompts.0`, `review.images`…).
  readonly promptKey: string;
  // Whether the article key holds a Script prompt.
  readonly script?: boolean | undefined;
  // Whether this is a Text intro or outro that narration reads as written.
  readonly textEntry?: boolean | undefined;
  readonly value: string;
  readonly onChange: (next: string) => void;
}): ReactElement {
  const place = placeOfKey(promptKey, { script: script === true });
  const checked = value.trim() !== "" && value.length <= bodyMax;
  const misplaced =
    !checked || place === undefined
      ? []
      : keywordProblems(value, place)
          .filter((problem) => problem.kind === "wrong-place")
          .map((problem) => problem.message);
  const narrated =
    checked && textEntry === true && (place === "intro" || place === "outro")
      ? textEntryProblems(value, place).map((problem) => problem.message)
      : [];
  const problems = [...syntaxProblems(value, name, place, checked), ...misplaced, ...narrated];
  const error = problems.length === 0 ? undefined : problems.join(" ");
  return (
    <div className="flex flex-col gap-3">
      <Field label={`Raw prompt for ${name}`} id={id} tip="project.prompts.raw" error={error}>
        <SlotBody
          id={id}
          value={value}
          place={place}
          invalid={error !== undefined}
          describedBy={error === undefined ? undefined : `${id}-error`}
          onChange={onChange}
        />
      </Field>
      {place === undefined ? null : (
        <OldKeywordNames body={value} place={place} onChange={onChange} />
      )}
    </div>
  );
}

// The malformed braces, in the Library's own sentences. The rest of the save lint (a name, an
// unknown `Slopify_` name) is the Library's to refuse, not a saved version's.
function syntaxProblems(
  value: string,
  name: string,
  place: KeywordPlace | undefined,
  checked: boolean,
): readonly string[] {
  if (!checked || detectSlots(value).errors.length === 0) return [];
  const unknown = new Set(
    keywordProblems(value, place ?? "article")
      .filter((problem) => problem.kind === "unknown")
      .map((problem) => problem.message),
  );
  const lint =
    place === "intro" || place === "outro"
      ? lintEntry({ category: place, mode: "text", name, body: value })
      : lintPrompt({ kind: promptKindOf(place), name, body: value });
  return lint
    .filter((problem) => problem.field === "body" && !unknown.has(problem.message))
    .map((problem) => problem.message);
}

function promptKindOf(place: KeywordPlace | undefined): PromptKind {
  return place === undefined || place === "title" || place === "intro" || place === "outro"
    ? "article"
    : place;
}
