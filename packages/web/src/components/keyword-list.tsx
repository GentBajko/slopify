import { valueMax } from "@app/slices/admission/rules.js";
import type { ReactElement, ReactNode } from "react";
import { Field, Input } from "@/components/kit/field";
import { List, ListRow } from "@/components/kit/list-row";

// One keyword the setup asks for: its name, what was typed for it, and every place it is
// filled in (the project title, the article prompt, an image prompt).
export interface KeywordItem {
  readonly name: string;
  readonly value: string;
  readonly feeds: readonly string[];
  // A keyword the project title names: the topic of one video, left empty in templates.
  readonly topic?: boolean;
}

// Keywords behave the same everywhere: Play, Edit project and templates draw this one list,
// each keyword with what it feeds. With `onChange` each is a field; without it the list only
// reads (a saved template).
export function KeywordList({
  keywords,
  onChange,
  problem,
  fieldPrefix = "values",
  empty,
}: {
  readonly keywords: readonly KeywordItem[];
  readonly onChange?: (name: string, value: string) => void;
  // The sentence to put under a keyword the rule refused, by its dotted field name.
  readonly problem?: (field: string) => string | undefined;
  // What `data-play-field` names each input: `values.<name>` on Play.
  readonly fieldPrefix?: string;
  readonly empty?: ReactNode;
}): ReactElement | null {
  if (keywords.length === 0)
    return empty === undefined ? null : <p className="m-0 text-small text-ink-2">{empty}</p>;
  const feeds = (keyword: KeywordItem): string =>
    [
      keyword.feeds.length === 0
        ? "Not used by any picked prompt"
        : `Feeds ${keyword.feeds.join(" · ")}`,
      ...(keyword.topic ? ["left empty in templates"] : []),
    ].join(" · ");
  if (onChange === undefined)
    return (
      <List label="Keywords">
        {keywords.map((keyword) => (
          <ListRow
            key={keyword.name}
            title={
              <>
                <code className="sl-code">{`{{${keyword.name}}}`}</code>{" "}
                {keyword.value === "" ? (
                  <span className="text-ink-3">{keyword.topic ? "the topic" : "empty"}</span>
                ) : (
                  keyword.value
                )}
              </>
            }
            meta={feeds(keyword)}
          />
        ))}
      </List>
    );
  return (
    <div
      data-tour="play-keywords"
      className="grid min-w-0 grid-cols-1 gap-4 min-[700px]:grid-cols-2"
    >
      {keywords.map((keyword) => (
        <Field
          key={keyword.name}
          label={keyword.name}
          help={feeds(keyword)}
          error={problem?.(`${fieldPrefix}.${keyword.name}`)}
        >
          <Input
            data-play-field={`${fieldPrefix}.${keyword.name}`}
            value={keyword.value}
            maxLength={valueMax}
            spellCheck={false}
            aria-invalid={problem?.(`${fieldPrefix}.${keyword.name}`) !== undefined}
            onChange={(event) => onChange(keyword.name, event.target.value)}
          />
        </Field>
      ))}
    </div>
  );
}
