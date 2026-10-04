import { valueMax } from "@app/slices/admission/rules.js";
import type { ReactElement, ReactNode } from "react";
import { Field, Input } from "@/components/kit/field";
import { List, ListRow } from "@/components/kit/list-row";
import type { HelpId } from "@/help/catalog";

// One keyword the setup asks for: its name, what was typed for it, and every place it is
// filled in (the project title, the article prompt, an image prompt).
export interface KeywordItem {
  readonly name: string;
  readonly value: string;
  readonly feeds: readonly string[];
  // A keyword the project title names: the topic of one video, left empty in templates.
  readonly topic?: boolean;
  // One more sentence for the line under the field, such as a schedule's "Unless a topic sets
  // its own."
  readonly note?: string;
}

// The line under a keyword: every place it fills, the same words on every screen.
export function keywordFeeds(keyword: Pick<KeywordItem, "feeds" | "topic" | "note">): string {
  const line = [
    keyword.feeds.length === 0
      ? "Not used by any picked prompt"
      : `Feeds ${keyword.feeds.join(" · ")}`,
    ...(keyword.topic ? ["left empty in templates"] : []),
  ].join(" · ");
  return keyword.note === undefined ? line : `${line}. ${keyword.note}`;
}

// Keywords behave the same everywhere: Play, Edit project, templates and schedules draw this one
// list, each keyword with what it feeds. With `onChange` each is a field; without it the list only
// reads (a saved template).
export function KeywordList({
  keywords,
  onChange,
  problem,
  fieldPrefix = "values",
  empty,
  label = (name) => name,
  inputLabel,
  tip = "play.keyword",
  maxLength = valueMax,
}: {
  readonly keywords: readonly KeywordItem[];
  readonly onChange?: (name: string, value: string) => void;
  // The sentence to put under a keyword the rule refused, by its dotted field name.
  readonly problem?: (field: string) => string | undefined;
  // What `data-play-field` names each input: `values.<name>` on Play.
  readonly fieldPrefix?: string;
  readonly empty?: ReactNode;
  // A schedule's fields read "<name> (every run)", with their own help and a longer bound.
  readonly label?: (name: string) => string;
  readonly inputLabel?: (name: string) => string;
  readonly tip?: HelpId;
  readonly maxLength?: number;
}): ReactElement | null {
  if (keywords.length === 0)
    return empty === undefined ? null : <p className="m-0 text-small text-ink-2">{empty}</p>;
  const feeds = keywordFeeds;
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
          label={label(keyword.name)}
          tip={tip}
          help={feeds(keyword)}
          error={problem?.(`${fieldPrefix}.${keyword.name}`)}
        >
          <Input
            data-play-field={`${fieldPrefix}.${keyword.name}`}
            value={keyword.value}
            maxLength={maxLength}
            {...(inputLabel === undefined ? {} : { "aria-label": inputLabel(keyword.name) })}
            // A topic is words to check; any other value is a token (a count, a name, a code).
            spellCheck={keyword.topic === true}
            aria-invalid={problem?.(`${fieldPrefix}.${keyword.name}`) !== undefined}
            onChange={(event) => onChange(keyword.name, event.target.value)}
          />
        </Field>
      ))}
    </div>
  );
}
