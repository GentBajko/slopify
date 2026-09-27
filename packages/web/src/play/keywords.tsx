import type { Field } from "@app/slices/admission/substitute.js";
import type { ReactElement } from "react";
import { KeywordList } from "@/components/keyword-list";

// Play's keywords: the shared list, fed from the fields the picked prompts ask for. `topics`
// are the keywords the project title names; `hide` leaves out the ones drawn elsewhere (the
// Topic field at the top of Play). It sits in the Title and keywords row, which names it, so it
// has no heading of its own.
export function KeywordBlock({
  fields,
  values,
  origins,
  topics = [],
  hide = [],
  problem,
  onChange,
}: {
  readonly fields: readonly Field[];
  readonly values: Readonly<Record<string, string>>;
  readonly origins?: ReadonlyMap<string, readonly string[]>;
  readonly topics?: readonly string[];
  readonly hide?: readonly string[];
  readonly problem: (field: string) => string | undefined;
  readonly onChange: (name: string, value: string) => void;
}): ReactElement | null {
  const shown = fields.filter((field) => !hide.includes(field.name));
  if (!shown.length) return null;
  return (
    <section aria-label="Keywords" className="min-w-0">
      <p className="m-0 mb-3 text-small text-ink-2">
        Each keyword is entered once and fills every place that names it.
      </p>
      <KeywordList
        keywords={shown.map((field) => ({
          name: field.name,
          value: Object.hasOwn(values, field.name) ? (values[field.name] ?? "") : "",
          feeds: origins?.get(field.name) ?? [],
          topic: topics.includes(field.name),
        }))}
        problem={problem}
        onChange={onChange}
      />
    </section>
  );
}
