import { valueMax } from "@app/slices/admission/rules.js";
import type { Field, FieldGroup } from "@app/slices/admission/substitute.js";
import { useId } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// The keyword block of the cue sheet (uiux/screens/06-play.md, §Q14): a centred "Common"
// header with rules and its fields full width, then "Text" and "Image" side by side with
// a vertical divider between them. Three columns is not this layout and neither is one
// list; the reference sheet draws Common over a two-column grid and that is what this is.
//
// Which fields exist is `logic/03` step 3's: one per distinct slot name across the picked
// prompts and entries, Common when a name is used on both sides. They appear and
// disappear as prompts are ticked, because the group they belong to is recomputed from
// the picked bodies on every render.
export function KeywordBlock({
  fields,
  values,
  problem,
  onChange,
}: {
  readonly fields: readonly Field[];
  readonly values: Readonly<Record<string, string>>;
  readonly problem: (field: string) => string | undefined;
  readonly onChange: (name: string, value: string) => void;
}) {
  if (fields.length === 0) {
    return null;
  }
  const common = fields.filter((field) => field.group === "common");
  const text = fields.filter((field) => field.group === "text");
  const image = fields.filter((field) => field.group === "image");

  return (
    <>
      {common.length === 0 ? null : (
        <div data-keywords="common" className="mt-[6px]">
          <GroupHeading name="Common" />
          <div className="flex flex-col gap-2">
            {common.map((field) => (
              <KeywordField
                key={field.name}
                name={field.name}
                value={values[field.name] ?? ""}
                problem={problem(`values.${field.name}`)}
                onChange={onChange}
              />
            ))}
          </div>
        </div>
      )}

      {text.length === 0 && image.length === 0 ? null : (
        <div
          data-keywords="sides"
          className="mt-[6px] grid grid-cols-[minmax(0,1fr)_1px_minmax(0,1fr)] gap-x-4"
        >
          <KeywordColumn
            group="text"
            name="Text"
            fields={text}
            values={values}
            problem={problem}
            onChange={onChange}
          />
          <div aria-hidden="true" className="bg-line2" />
          <KeywordColumn
            group="image"
            name="Image"
            fields={image}
            values={values}
            problem={problem}
            onChange={onChange}
          />
        </div>
      )}
    </>
  );
}

function KeywordColumn({
  group,
  name,
  fields,
  values,
  problem,
  onChange,
}: {
  readonly group: FieldGroup;
  readonly name: string;
  readonly fields: readonly Field[];
  readonly values: Readonly<Record<string, string>>;
  readonly problem: (field: string) => string | undefined;
  readonly onChange: (name: string, value: string) => void;
}) {
  return (
    <div data-keywords={group} className="flex min-w-0 flex-col gap-2">
      <GroupHeading name={name} />
      {fields.map((field) => (
        <KeywordField
          key={field.name}
          name={field.name}
          value={values[field.name] ?? ""}
          problem={problem(`values.${field.name}`)}
          onChange={onChange}
        />
      ))}
    </div>
  );
}

// The header with a rule running out of it on both sides, as the reference draws it. The
// rules are spans rather than pseudo-elements so the heading stays one flex row and the
// text keeps its own colour and tracking.
function GroupHeading({ name }: { readonly name: string }) {
  return (
    <div className="mt-1 mb-[6px] flex items-center gap-3">
      <span aria-hidden="true" className="h-px flex-1 bg-line2" />
      <h3 className="font-condensed text-label font-bold text-ink uppercase tracking-[0.12em]">
        {name}
      </h3>
      <span aria-hidden="true" className="h-px flex-1 bg-line2" />
    </div>
  );
}

// `logic/03` step 4: a single line, trimmed, non-empty, at most 200 characters. The cap
// is on the input as well as in the rule, so the field cannot be typed past the width the
// column holds.
function KeywordField({
  name,
  value,
  problem,
  onChange,
}: {
  readonly name: string;
  readonly value: string;
  readonly problem: string | undefined;
  readonly onChange: (name: string, value: string) => void;
}) {
  const fieldId = useId();
  const noteId = useId();

  return (
    <div className="min-w-0">
      <Label htmlFor={fieldId} className="mb-[5px]">
        {name}
      </Label>
      <Input
        id={fieldId}
        value={value}
        maxLength={valueMax}
        spellCheck={false}
        aria-invalid={problem !== undefined}
        aria-describedby={problem === undefined ? undefined : noteId}
        onChange={(event) => {
          onChange(name, event.target.value);
        }}
      />
      {problem === undefined ? null : (
        <p id={noteId} className="mt-1 text-label text-red">
          {problem}
        </p>
      )}
    </div>
  );
}
