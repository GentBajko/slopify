import { redditTitleMax, subredditPattern } from "@app/slices/social/limits.js";
import {
  type RedditFields,
  type RedditPostKind,
  redditPostKinds,
} from "@app/slices/social/model.js";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type ReactElement, useEffect, useState } from "react";
import { useApp } from "@/app-context";
import { Field, Input } from "@/components/kit/field";
import { InfoTip } from "@/components/kit/info-tip";
import { SectionHead } from "@/components/kit/section-head";
import { Segmented } from "@/components/kit/switch";
import { limitCount } from "@/lib/limit-count";
import { saveRedditFields, socialPacksKey } from "./api";
import type { Say } from "./post-panel";

const kindLabels: Readonly<Record<RedditPostKind, string>> = {
  link: "Link",
  text: "Text",
  media: "Media",
};

// A Reddit post's own fields. Reddit's submit page wasn't seen yet, so the extension's part of
// it needs a live check; the fields themselves are saved when each box loses focus.
export function RedditFieldsEditor({
  projectId,
  fields,
  say,
}: {
  readonly projectId: string;
  readonly fields: RedditFields;
  readonly say: Say;
}): ReactElement {
  const { api } = useApp();
  const client = useQueryClient();
  const [draft, setDraft] = useState(fields);
  useEffect(() => setDraft(fields), [fields]);
  const save = useMutation({
    mutationFn: (next: RedditFields) => saveRedditFields(api, projectId, next),
    onSuccess: (packs) => {
      client.setQueryData(socialPacksKey(projectId), packs);
      say("Saved the Reddit post's fields.", "success");
    },
    onError: (error) => say(`Couldn't save the Reddit fields: ${error.message}`, "error"),
  });
  const commit = (next: RedditFields) => {
    if (JSON.stringify(next) !== JSON.stringify(fields)) save.mutate(next);
  };
  const subreddit = draft.subreddit.trim().replace(/^\/?r\//u, "");
  const badSubreddit = subreddit !== "" && !subredditPattern.test(subreddit);
  return (
    <section aria-label="Reddit post" className="flex flex-col gap-3 border-t border-line pt-4">
      <SectionHead
        as="h3"
        title="Reddit"
        meta={
          <span className="inline-flex items-center gap-1">
            Needs a live check
            <InfoTip id="social.reddit.live-check" label="Reddit needs a live check" />
          </span>
        }
      />
      <div className="grid min-w-0 grid-cols-1 gap-4 min-[560px]:grid-cols-2">
        <Field
          label="Subreddit"
          tip="social.reddit.subreddit"
          {...(badSubreddit
            ? {
                error:
                  "A subreddit name is 2 to 21 letters, digits or underscores, like r/history.",
              }
            : {})}
        >
          <Input
            value={draft.subreddit}
            placeholder="r/history"
            maxLength={23}
            onChange={(event) => setDraft({ ...draft, subreddit: event.target.value })}
            onBlur={() => commit(draft)}
          />
        </Field>
        <Field label="Flair" tip="social.reddit.flair" help="Blank when the subreddit has none.">
          <Input
            value={draft.flair}
            maxLength={64}
            onChange={(event) => setDraft({ ...draft, flair: event.target.value })}
            onBlur={() => commit(draft)}
          />
        </Field>
        <Field
          label="Title"
          tip="social.reddit.title"
          help={limitCount(draft.title.length, redditTitleMax, "characters")}
          className="min-[560px]:col-span-2"
        >
          <Input
            value={draft.title}
            maxLength={redditTitleMax}
            onChange={(event) => setDraft({ ...draft, title: event.target.value })}
            onBlur={() => commit(draft)}
          />
        </Field>
        <Field label="Post type" tip="social.reddit.kind">
          <Segmented
            label="Reddit post type"
            value={draft.kind}
            options={redditPostKinds.map((value) => ({ value, label: kindLabels[value] }))}
            onChange={(kind) => {
              const next = { ...draft, kind };
              setDraft(next);
              commit(next);
            }}
            className="self-start"
          />
        </Field>
      </div>
    </section>
  );
}
