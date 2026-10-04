import { detectSlots } from "@app/slices/admission/substitute.js";
import { lintPrompt } from "@app/slices/library/lint.js";
import { bodyMax } from "@app/slices/library/model.js";
import type { ReactElement } from "react";
import { Field } from "@/components/kit/field";
import { SlotBody } from "@/components/slot-body";

// A project's own copy of a prompt, edited the way Library edits a prompt: the same large
// field, no spellcheck on `{{keywords}}`, and every malformed `{{` marked where it stands and
// said in words under the field, with its line and column.
export function RawPromptField({
  id,
  name,
  value,
  onChange,
}: {
  readonly id: string;
  readonly name: string;
  readonly value: string;
  readonly onChange: (next: string) => void;
}): ReactElement {
  const problems =
    value.trim() === "" || value.length > bodyMax || detectSlots(value).errors.length === 0
      ? []
      : lintPrompt({ kind: "article", name, body: value })
          .filter((problem) => problem.field === "body")
          .map((problem) => problem.message);
  const error = problems.length === 0 ? undefined : problems.join(" ");
  return (
    <Field label={`Raw prompt for ${name}`} id={id} tip="project.prompts.raw" error={error}>
      <SlotBody
        id={id}
        value={value}
        invalid={error !== undefined}
        describedBy={error === undefined ? undefined : `${id}-error`}
        onChange={onChange}
      />
    </Field>
  );
}
