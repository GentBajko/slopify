import type { Field } from "@app/slices/admission/substitute.js";
import type { ReactElement } from "react";
import { KeywordList } from "@/components/keyword-list";

// Play's keywords: the shared list, fed from the fields the picked prompts ask for. `topics`
// are the keywords the project title names; `hide` leaves out the ones drawn elsewhere (the
// Topic field at the top of Play).
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
    <section className="min-w-0 py-2">
      <h3 className="m-0 mb-1 text-title-3">Keywords</h3>
      <p className="m-0 mb-4 text-small text-ink-2">
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
