import { valueMax } from "@app/slices/admission/rules.js";
import type { Field } from "@app/slices/admission/substitute.js";
import { useId } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function KeywordBlock({
  fields,
  values,
  origins,
  problem,
  onChange,
}: {
  readonly fields: readonly Field[];
  readonly values: Readonly<Record<string, string>>;
  readonly origins?: ReadonlyMap<string, readonly string[]>;
  readonly problem: (field: string) => string | undefined;
  readonly onChange: (name: string, value: string) => void;
}) {
  if (!fields.length) return null;
  return (
    <section data-tour="play-keywords" className="min-w-0 py-6">
      <h3 className="mb-2 text-lg font-semibold">Keywords</h3>
      <p className="mb-5 text-small text-ink3">
        Each keyword is entered once. For example, {"{{topic}}"} becomes the topic you enter below.
      </p>
      <div className="flex flex-col gap-4">
        {fields.map((field) => (
          <KeywordField
            key={field.name}
            name={field.name}
            value={Object.hasOwn(values, field.name) ? (values[field.name] ?? "") : ""}
            origins={origins?.get(field.name)}
            problem={problem(`values.${field.name}`)}
            onChange={onChange}
          />
        ))}
      </div>
    </section>
  );
}

function KeywordField({
  name,
  origins,
  value,
  problem,
  onChange,
}: {
  readonly name: string;
  readonly origins?: readonly string[] | undefined;
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
        data-play-field={`values.${name}`}
        value={value}
        maxLength={valueMax}
        spellCheck={false}
        aria-invalid={problem !== undefined}
        aria-describedby={problem === undefined ? undefined : noteId}
        onChange={(event) => {
          onChange(name, event.target.value);
        }}
      />
      {origins?.length ? <p className="mt-1 text-small text-ink3">{origins.join(" · ")}</p> : null}
      {problem === undefined ? null : (
        <p id={noteId} className="mt-1 text-label text-red">
          {problem}
        </p>
      )}
    </div>
  );
}
