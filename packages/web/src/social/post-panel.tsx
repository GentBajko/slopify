import { readyNow } from "@app/slices/social/due.js";
import { fillUrl, linkExamples, linkPatterns, nativeSchedule } from "@app/slices/social/limits.js";
import {
  type PostChoice,
  type PostingExtension,
  type PostPack,
  platformLabels,
  type SocialPacksResponse,
} from "@app/slices/social/model.js";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type ReactElement, useEffect, useState } from "react";
import { useApp } from "@/app-context";
import type { StatusTone } from "@/components/kit/action-bar";
import { Button } from "@/components/kit/button";
import { Field, Input, Textarea } from "@/components/kit/field";
import { helpScope, InfoTip } from "@/components/kit/info-tip";
import { FileLink } from "@/components/kit/link";
import { SectionHead } from "@/components/kit/section-head";
import { Status } from "@/components/kit/status";
import {
  fillPost,
  resetPostText,
  savePostChoice,
  savePostLink,
  savePostText,
  socialPacksKey,
} from "./api";
import { PostChoiceFields } from "./post-choice-fields";
import { PostPreview } from "./post-preview";
import { PostWarnings } from "./post-warnings";
import { RedditFieldsEditor } from "./reddit-fields";
import { fillBlocked, releaseLine, stateLine } from "./words";

export type Say = (text: string, tone: StatusTone) => void;

// "Sun 5 Oct, 20:00" in this browser's time zone.
export function postTime(iso: string): string {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

function usePacksMutation<T>(
  projectId: string,
  say: Say,
  run: (input: T) => Promise<SocialPacksResponse>,
  done: string,
  failed: string,
) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: run,
    onSuccess: (packs) => {
      client.setQueryData(socialPacksKey(projectId), packs);
      if (done !== "") say(done, "success");
    },
    onError: (error) => say(`${failed}: ${error.message}`, "error"),
  });
}

// One site's post in Prepare upload: where it stands, what doesn't fit, the post as the site
// shows it with its words editable, when it goes out, and its settings for this project.
export function PostPanel({
  pack,
  say,
}: {
  readonly pack: PostPack;
  readonly say: Say;
}): ReactElement {
  const { api } = useApp();
  const { projectId, platform } = pack;
  const site = platformLabels[platform];
  const text = usePacksMutation(
    projectId,
    say,
    (words: string) => savePostText(api, projectId, platform, words, pack.generated),
    "Saved the post's text.",
    "Couldn't save the post's text",
  );
  const reset = usePacksMutation(
    projectId,
    say,
    (_: undefined) => resetPostText(api, projectId, platform),
    "The post's text is back to the written one.",
    "Couldn't reset the text",
  );
  const choice = usePacksMutation(
    projectId,
    say,
    (next: PostChoice | null) => savePostChoice(api, projectId, platform, next),
    "Saved this post's settings.",
    "Couldn't save the settings",
  );
  const link = usePacksMutation(
    projectId,
    say,
    (url: string | null) => savePostLink(api, projectId, platform, url),
    "",
    "Couldn't save the link",
  );
  const [draft, setDraft] = useState(pack.text);
  useEffect(() => setDraft(pack.text), [pack.text]);
  const state = stateLine(pack.status, platform, postTime);
  return (
    <div className="flex flex-col gap-5">
      <section aria-label={`${site} post state`} className="flex flex-col gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <Status tone={state.tone}>{state.text}</Status>
          <span className="flex-1" />
          {pack.status.url === null ? null : (
            <>
              <FileLink
                href={pack.status.url}
                target="_blank"
                rel="noopener noreferrer"
                size="small"
              >
                Open the post
              </FileLink>
              <Button
                variant="quiet"
                size="small"
                disabled={link.isPending}
                onClick={() => link.mutate(null)}
              >
                Remove link
              </Button>
            </>
          )}
        </div>
      </section>
      <PostWarnings warnings={pack.warnings} />
      <PostPreview
        pack={pack}
        text={draft}
        editor={
          <div className="flex flex-col gap-1" {...helpScope}>
            <div className="flex min-h-8 items-center gap-1">
              <label htmlFor={`post-text-${platform}`} className="sl-field__label">
                {`${site} post`}
              </label>
              <InfoTip id="social.post-text" className="-my-1" />
              <span className="flex-1" />
              {pack.edited ? (
                <Button
                  variant="quiet"
                  size="small"
                  disabled={reset.isPending}
                  onClick={() => reset.mutate(undefined)}
                >
                  Reset to the written text
                </Button>
              ) : null}
            </div>
            <Textarea
              id={`post-text-${platform}`}
              rows={5}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onBlur={() => {
                if (draft !== pack.text) text.mutate(draft);
              }}
            />
          </div>
        }
      />
      <p className="m-0 flex items-center gap-1 text-small text-ink-2" {...helpScope}>
        {releaseLine(pack.schedule, platform, postTime)}
        <InfoTip id="social.release" className="-my-1" />
      </p>
      {pack.status.url === null ? (
        <PasteLink
          platform={pack.platform}
          pending={link.isPending}
          onSave={(url) => link.mutate(url)}
        />
      ) : null}
      {pack.reddit === undefined ? null : (
        <RedditFieldsEditor projectId={projectId} fields={pack.reddit} say={say} />
      )}
      <section aria-label={`${site} post settings`} className="border-t border-line pt-4">
        <SectionHead
          as="h3"
          title="Settings"
          meta={
            pack.chosenHere
              ? "This project's own; the template's stay as they are."
              : "From the template. A change here is this project's own."
          }
          className="mb-3"
        >
          {pack.chosenHere ? (
            <Button
              variant="quiet"
              size="small"
              disabled={choice.isPending}
              onClick={() => choice.mutate(null)}
            >
              Use the template's settings
            </Button>
          ) : null}
        </SectionHead>
        <PostChoiceFields
          platform={platform}
          choice={pack.choice}
          withPrompt={false}
          tier={pack.xTier ?? "free"}
          disabled={choice.isPending}
          onChange={(next) => choice.mutate(next)}
        />
      </section>
    </div>
  );
}

function PasteLink({
  platform,
  pending,
  onSave,
}: {
  readonly platform: PostPack["platform"];
  readonly pending: boolean;
  readonly onSave: (url: string) => void;
}): ReactElement {
  const [url, setUrl] = useState("");
  const site = platformLabels[platform];
  const wrong = url.trim() !== "" && !linkPatterns[platform].test(url.trim());
  return (
    <form
      aria-label={`Paste the ${site} post's link`}
      className="flex min-w-0 flex-wrap items-end gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (!wrong && url.trim() !== "") onSave(url.trim());
      }}
    >
      <Field
        label="Posted it yourself? Paste its link"
        tip="social.paste-link"
        className="min-w-0 flex-[1_1_16rem]"
        {...(wrong
          ? {
              error: `That isn't ${/^[AEIOUX]/u.test(site) ? "an" : "a"} ${site} post's link. Copy it from the post's address bar (like ${linkExamples[platform]}).`,
            }
          : {})}
      >
        <Input
          type="url"
          value={url}
          placeholder={linkExamples[platform]}
          onChange={(event) => setUrl(event.target.value)}
        />
      </Field>
      <Button
        type="submit"
        size="small"
        disabled={pending || wrong || url.trim() === ""}
        disabledReason={wrong ? "Paste the post's own link" : "Paste the link first"}
      >
        Save link
      </Button>
    </form>
  );
}

// Fill in <site>: the drawer's one primary action while a site is chosen. It waits for the
// extension, and opens the site's post form unless the post waits for its release time.
export function PostFillButton({
  pack,
  extension,
  say,
}: {
  readonly pack: PostPack;
  readonly extension: PostingExtension;
  readonly say: Say;
}): ReactElement {
  const { api } = useApp();
  const client = useQueryClient();
  const site = platformLabels[pack.platform];
  const blocked = fillBlocked(extension, pack.platform);
  const fill = useMutation({
    mutationFn: () => fillPost(api, pack.projectId, pack.platform),
    onSuccess: async (filled) => {
      await client.invalidateQueries({ queryKey: socialPacksKey(pack.projectId) });
      say(
        filled.waitsForRelease
          ? `Waiting for the release time. About 2 minutes before it, the extension opens ${site} in a background tab and fills the post; you check it and press Post.`
          : nativeSchedule[pack.platform] === undefined
            ? `${site} is opening. The Slopify Studio extension fills the post; check it and press Post yourself.`
            : `${site} is opening. The Slopify Studio extension fills the post and sets the schedule; check it and press Post or Schedule yourself.`,
        "success",
      );
    },
    onError: (error) => say(`Couldn't hand the post to the extension: ${error.message}`, "error"),
  });
  return (
    <>
      <Button
        variant="primary"
        focusableWhenDisabled
        disabled={blocked !== undefined || fill.isPending || pack.status.state === "posted"}
        disabledReason={
          pack.status.state === "posted"
            ? `It is already on ${site}; remove its link to fill it again`
            : (blocked ?? "Handing it to the extension")
        }
        onClick={() => {
          // Opened inside the click, so the browser doesn't block the new tab.
          if (readyNow(pack.platform, pack.schedule.at, new Date()))
            window.open(
              fillUrl(pack.composeUrl, pack.projectId, pack.platform),
              "_blank",
              "noopener",
            );
          fill.mutate();
        }}
      >
        {`Fill in ${site}`}
      </Button>
      <InfoTip id="social.fill" />
    </>
  );
}
