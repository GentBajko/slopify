import type { ReactElement } from "react";
import { Field, Textarea } from "@/components/kit/field";

// The server's limit for an edited article (`slices/revisions/schema.ts`).
export const articleLimit = 500_000;
const counted = new Intl.NumberFormat("en");

// The article's text in Edit project, with its length against the limit always in view. No
// native maxLength: a paste past the limit would be cut silently, so the whole text stays and
// the field says how much to remove before Save changes is accepted.
export function ArticleTextField({
  value,
  error,
  help,
  onChange,
}: {
  readonly value: string;
  readonly error: string | undefined;
  readonly help: string | undefined;
  readonly onChange: (next: string) => void;
}): ReactElement {
  const over = value.length - articleLimit;
  return (
    <div className="flex flex-col gap-1">
      <Field
        label="Article text"
        tip="project.edit.article-text"
        error={
          error ??
          (over > 0
            ? `The article is ${counted.format(over)} characters over the ${counted.format(articleLimit)} limit. Shorten it, then press Save changes; nothing was cut.`
            : undefined)
        }
        help={help}
      >
        <Textarea rows={12} value={value} onChange={(event) => onChange(event.target.value)} />
      </Field>
      <p
        className={`m-0 text-small tabular-nums ${over > 0 ? "text-danger" : "text-ink-2"}`}
      >{`${counted.format(value.length)} of ${counted.format(articleLimit)} characters`}</p>
    </div>
  );
}
