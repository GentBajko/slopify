import { tagsLength } from "@app/slices/youtube/answer.js";
import { chapterNotice, fitChapters } from "@app/slices/youtube/chapters.js";
import {
  composeDescription,
  type DescriptionField,
  type DescriptionFields,
  resolveFields,
  shownFields,
  splitDescription,
} from "@app/slices/youtube/edits.js";
import {
  descriptionMaxCharacters,
  hashtagNote,
  pinnedCommentMaxCharacters,
  tagsMaxCharacters,
  titleMaxCharacters,
  youtubeDescriptionProblem,
  youtubeTitleProblem,
} from "@app/slices/youtube/model.js";
import {
  fillPlaceholders,
  linkKey,
  mergeLinks,
  previousVideoLink,
} from "@app/slices/youtube/placeholders.js";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { RefreshCwIcon } from "lucide-react";
import { type ReactElement, type ReactNode, use, useId, useRef, useState } from "react";
import {
  type ProjectDescriptionEdits,
  readDescriptionEdits,
  readProjectChannelLinks,
  saveDescriptionEdit,
} from "@/api";
import { useApp } from "@/app-context";
import { Button } from "@/components/kit/button";
import { ariaKeyShortcuts, useCommand } from "@/components/kit/command-palette";
import { ConfirmDialog } from "@/components/kit/dialog";
import { HelpLine } from "@/components/kit/field";
import { helpScope } from "@/components/kit/info-tip";
import { useToast } from "@/components/kit/toast";
import { shortcuts } from "@/lib/shortcuts";
import { cn } from "@/lib/utils";
import { keys } from "@/queries";
import type { BodyProps } from "./body.js";
import { outputsOf, roleOf } from "./body.js";
import { OnYoutube } from "./on-youtube.js";
import { useOutputText } from "./parts.js";
import { ReleaseTimes } from "./release-times.js";
import { RegenerateNowContext } from "./revision-action-context.js";
import { YoutubeCopyContext } from "./section-copy.js";
import {
  CopyButton,
  EditButton,
  FieldEditor,
  Filled,
  PartHead,
  splitTags,
  TagChips,
} from "./youtube-field.js";
import { SampleNote, useSampleProject } from "./youtube-sample.js";

const labels: Readonly<Record<DescriptionField, string>> = {
  summary: "Summary",
  chapters: "Chapters",
  hashtags: "Hashtags",
  tags: "Tags",
  pinnedComment: "Pinned comment",
  titles: "Other titles",
};

// The project's YouTube section: on the left, what goes into YouTube Studio - the description
// exactly as it is pasted (placeholders filled, chapters fitted), the tags, the comment to pin
// and the other titles, all in view at once, each with its Copy and Edit; on the right, when
// each one goes public (Release) and the links once they are up (YouTube links).
//
// An edit is kept as the person's own and survives the next writing: when the description is
// written again, a part they changed keeps their text and offers the new one beside it
// (`slices/youtube/edits.ts`). `{{Name}}` placeholders fill from the project's channel's links
// (its Name and look tab) and this project's own Previous episode. Everything stays mounted
// while the step runs or waits, so nothing moves when the text lands.
export function YoutubeBlock({ stage, project, outputs }: Omit<BodyProps, "actions" | "busy">) {
  const id = useId();
  const { api } = useApp();
  const queryClient = useQueryClient();
  const own = outputsOf(outputs, stage);
  const description = roleOf(own, "youtube_description");
  const tags = roleOf(own, "youtube_tags");
  const pinned = roleOf(own, "youtube_pinned_comment");
  const otherTitles = roleOf(own, "youtube_titles");
  const descriptionText = useOutputText(description).data;
  const tagsText = useOutputText(tags).data;
  const pinnedText = useOutputText(pinned).data;
  const titlesText = useOutputText(otherTitles).data;
  // Writing it again remakes only this step, at once: it saves a version with it marked.
  const regenerateNow = use(RegenerateNowContext);
  const shared = use(YoutubeCopyContext);
  const sample = useSampleProject(project.id);
  const [rewriting, setRewriting] = useState(false);
  const edits = useQuery({
    queryKey: keys.youtubeEdits(project.id),
    queryFn: () => readDescriptionEdits(api, project.id),
  });
  const channelLinks = useQuery({
    queryKey: keys.projectChannelLinks(project.id),
    queryFn: () => readProjectChannelLinks(api, project.id),
  });
  // What is being typed in each open editor, so the counts, the composed description and
  // YouTube's checks follow the typing rather than the last save.
  const [drafts, setDrafts] = useState<Partial<Record<DescriptionField, string>>>({});
  const setDraft = (name: DescriptionField) => (text: string | undefined) =>
    setDrafts((now) => {
      const { [name]: _closed, ...rest } = now;
      return text === undefined ? rest : { ...rest, [name]: text };
    });
  const notify = useToast();
  const saved = (next: ProjectDescriptionEdits) =>
    queryClient.setQueryData(keys.youtubeEdits(project.id), next);
  const save = useMutation({
    mutationFn: (change: {
      readonly field: DescriptionField;
      readonly edit: { readonly text: string; readonly base: string } | null;
      readonly done: string;
    }) => saveDescriptionEdit(api, project.id, change.field, change.edit),
    onSuccess: (next, change) => {
      saved(next);
      notify(change.done, "success");
    },
    onError: (error) => notify(`Couldn't save the change: ${error.message}`, "error"),
  });
  // Copy description and Copy tags are palette commands too; they copy what is shown here,
  // placeholders filled, so they read the latest text when run.
  const copyLatest = useRef<{
    description?: () => void;
    tags?: () => void;
    pinnedComment?: () => void;
  }>({});
  useCommand({
    id: "project.copy-description",
    title: "Copy description",
    group: "This project",
    context: project.title,
    keywords: ["youtube", "description", "chapters", "clipboard"],
    shortcut: shortcuts.copyDescription,
    run: () =>
      copyLatest.current.description === undefined
        ? notify("The description has not been written yet.", "info")
        : copyLatest.current.description(),
  });
  useCommand({
    id: "project.copy-tags",
    title: "Copy tags",
    group: "This project",
    context: project.title,
    keywords: ["youtube", "tags", "clipboard"],
    run: () =>
      copyLatest.current.tags === undefined
        ? notify("The tags have not been written yet.", "info")
        : copyLatest.current.tags(),
  });
  useCommand({
    id: "project.copy-pinned-comment",
    title: "Copy pinned comment",
    group: "This project",
    context: project.title,
    keywords: ["youtube", "comment", "pin", "clipboard"],
    run: () =>
      copyLatest.current.pinnedComment === undefined
        ? notify("The pinned comment has not been written yet.", "info")
        : copyLatest.current.pinnedComment(),
  });
  if (project.config.youtubeDescription !== true && description === undefined) return null;

  const generated: DescriptionFields | undefined =
    descriptionText === undefined
      ? undefined
      : splitDescription(descriptionText, tagsText ?? "", {
          pinnedComment: pinnedText,
          titles: titlesText,
        });
  const resolved = resolveFields(generated, edits.data?.fields ?? {});
  const shown = { ...shownFields(resolved), ...drafts };
  const links = mergeLinks(channelLinks.data?.links ?? [], edits.data?.links ?? []);
  // The chapters as YouTube will take them (`slices/youtube/chapters.ts`): shown and copied
  // fitted, with a note saying what changed; the stored text and the person's edit stay as
  // they are, so editing starts from what was written.
  const video = roleOf(own, "video");
  const fitted = fitChapters(
    shown.chapters,
    video?.durationMs === null || video?.durationMs === undefined
      ? undefined
      : video.durationMs / 1000,
  );
  const adjusted = chapterNotice(fitted.adjustments);
  const composed = composeDescription({ ...shown, chapters: fitted.text });
  const filledDescription = fillPlaceholders(composed, links);
  const filledTags = fillPlaceholders(shown.tags, links);
  const filledComment = fillPlaceholders(shown.pinnedComment, links);
  const unknown = [
    ...filledDescription.unknown,
    ...filledTags.unknown,
    ...filledComment.unknown,
  ].filter((name, index, all) => all.findIndex((one) => linkKey(one) === linkKey(name)) === index);
  const tagList = splitTags(filledTags.text);
  const written = generated !== undefined;
  // A description written before pinned comments existed has none until it is written again.
  const commented = filledComment.text.trim() !== "";
  const titleList = shown.titles
    .split("\n")
    .map((one) => one.trim())
    .filter((one) => one !== "");
  const titleProblem = titleList.map(youtubeTitleProblem).find((one) => one !== undefined);
  const descriptionProblem = written
    ? youtubeDescriptionProblem(filledDescription.text)
    : undefined;
  const hashtagLine = hashtagNote(shown.hashtags);
  // The sample reads only: its text is copied, never edited or written again.
  const editable = written && !sample;
  // Use the written text drops the saved edit; its toast puts it back.
  const followGenerated = (name: DescriptionField) => {
    const before = edits.data?.fields[name];
    const what = labels[name].toLowerCase();
    save.mutate(
      { field: name, edit: null, done: `The ${what} follows the written text again.` },
      {
        onSuccess: () => {
          if (before === undefined) return;
          notify(`The ${what} follows the written text again.`, "success", {
            label: "Undo",
            run: () =>
              save.mutate({
                field: name,
                edit: { text: before.text, base: before.base },
                done: `Put your ${what} back.`,
              }),
          });
        },
      },
    );
  };

  // Writing the description again: one AI call writes every part anew.
  const again =
    editable && regenerateNow !== undefined && stage.state !== "running"
      ? () => setRewriting(true)
      : undefined;
  const copy = (text: string, what: string) => {
    const failed = `Couldn't copy the ${what}. Select the text in the YouTube section and copy it.`;
    if (!navigator.clipboard) {
      notify(failed, "error");
      return;
    }
    void navigator.clipboard.writeText(text).then(
      () => notify(`Copied the ${what}.`, "success"),
      () => notify(failed, "error"),
    );
  };
  copyLatest.current = written
    ? {
        description: () => copy(filledDescription.text, "description"),
        tags: () => copy(filledTags.text, "tags"),
        ...(commented ? { pinnedComment: () => copy(filledComment.text, "pinned comment") } : {}),
      }
    : {};
  if (shared !== undefined) shared.current = copyLatest.current;
  const waiting =
    stage.state === "running"
      ? "Written once the captions are timed."
      : "Not written yet. It is made with the video.";
  const edit = (name: DescriptionField) =>
    editable && drafts[name] === undefined ? (
      <EditButton
        what={labels[name].toLowerCase()}
        onEdit={() => setDraft(name)(resolved[name].text)}
      />
    ) : null;
  const editor = (name: DescriptionField, rows?: number) => (
    <FieldEditor
      key={name}
      label={labels[name]}
      value={resolved[name]}
      draft={drafts[name]}
      onDraft={setDraft(name)}
      // The description's own checks sit under the composed text, which follows the typing.
      note={
        name === "titles" && titleProblem !== undefined
          ? { text: titleProblem, warn: true }
          : undefined
      }
      disabled={!editable || save.isPending}
      multiline={name !== "hashtags"}
      {...(rows === undefined ? {} : { rows })}
      onSave={(text) =>
        save.mutate({
          field: name,
          edit: { text, base: generated?.[name] ?? "" },
          done: `Saved your ${labels[name].toLowerCase()}.`,
        })
      }
      onUseGenerated={() => followGenerated(name)}
      onKeepMine={(text, next) =>
        save.mutate({
          field: name,
          edit: { text, base: next },
          done: `Kept your ${labels[name].toLowerCase()}.`,
        })
      }
    />
  );
  // A part this description was written without: what to press to have one.
  const missing = (name: DescriptionField) =>
    `None yet. Write the description again to have ${name === "titles" ? "them" : "one"} written, or press Edit ${labels[name].toLowerCase()} to write your own.`;

  return (
    <div className="@container min-w-0">
      <div className="grid min-w-0 grid-cols-1 gap-x-8 gap-y-4 @min-[860px]:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-4">
          <section aria-labelledby={`${id}-description`} className="flex min-w-0 flex-col gap-2">
            <PartHead
              id={`${id}-description`}
              label="Description"
              count={
                written
                  ? `${String(filledDescription.text.length)} / ${String(descriptionMaxCharacters)} characters`
                  : undefined
              }
              over={filledDescription.text.length > descriptionMaxCharacters}
            >
              {written ? (
                <CopyButton
                  what="description"
                  keyshortcuts={ariaKeyShortcuts(shortcuts.copyDescription)}
                  onCopy={() => copy(filledDescription.text, "description")}
                />
              ) : null}
            </PartHead>
            <Pasted label="The description as it is pasted" empty={!written}>
              {written ? <Filled text={filledDescription.text} links={links} /> : waiting}
            </Pasted>
            {descriptionProblem === undefined ? null : (
              <p className="m-0 text-small text-danger">{descriptionProblem}</p>
            )}
            {adjusted === undefined ? null : (
              <p className="m-0 text-small text-waiting">{adjusted}</p>
            )}
            {hashtagLine === undefined ? null : (
              <p
                className={cn(
                  "m-0 text-small",
                  hashtagLine.includes("ignores") ? "text-danger" : "text-ink-2",
                )}
              >
                {hashtagLine}
              </p>
            )}
            {unknown.length === 0 ? null : (
              <p className="m-0 text-small text-waiting">
                {`No link is saved for ${unknown.map((name) => `{{${name}}}`).join(", ")}, so it stays as typed. Add it under Channel links on `}
                {channelLinks.data === undefined ? (
                  "the channel's Name and look tab"
                ) : (
                  <Link
                    to="/channels/$channelId"
                    params={{ channelId: channelLinks.data.channelId }}
                    className="underline"
                  >
                    the channel's Name and look tab
                  </Link>
                )}
                {`${unknown.some((name) => linkKey(name) === linkKey(previousVideoLink)) ? ", or give this project's Previous episode under YouTube links" : ""}.`}
              </p>
            )}
            {editable ? (
              <div className="flex flex-wrap gap-2">
                {edit("summary")}
                {edit("chapters")}
                {edit("hashtags")}
              </div>
            ) : null}
            {editor("summary")}
            {editor("chapters", 8)}
            {editor("hashtags")}
          </section>
          <section aria-labelledby={`${id}-tags`} className="flex min-w-0 flex-col gap-2">
            <PartHead
              id={`${id}-tags`}
              label="Tags"
              count={
                written
                  ? `${String(tagsLength(tagList))} / ${String(tagsMaxCharacters)} characters`
                  : undefined
              }
              over={tagsLength(tagList) > tagsMaxCharacters}
            >
              {written ? (
                <CopyButton what="tags" onCopy={() => copy(filledTags.text, "tags")} />
              ) : null}
              {edit("tags")}
            </PartHead>
            {written && shown.tags.trim() !== "" ? (
              <TagChips text={shown.tags} links={links} />
            ) : (
              <p className="m-0 text-small text-ink-2">{written ? "No tags." : waiting}</p>
            )}
            {editor("tags")}
          </section>
          {sample && written && !commented ? null : (
            <section aria-labelledby={`${id}-pinned`} className="flex min-w-0 flex-col gap-2">
              <PartHead
                id={`${id}-pinned`}
                label="Pinned comment"
                count={
                  written && commented
                    ? `${String(filledComment.text.length)} / ${String(pinnedCommentMaxCharacters)} characters`
                    : undefined
                }
                over={filledComment.text.length > pinnedCommentMaxCharacters}
              >
                {written && commented ? (
                  <CopyButton
                    what="pinned comment"
                    onCopy={() => copy(filledComment.text, "pinned comment")}
                  />
                ) : null}
                {edit("pinnedComment")}
              </PartHead>
              {commented ? (
                <Pasted label="The pinned comment">
                  <Filled text={filledComment.text} links={links} />
                </Pasted>
              ) : (
                <p className="m-0 text-small text-ink-2">
                  {written ? missing("pinnedComment") : waiting}
                </p>
              )}
              {commented ? (
                <p className="m-0 text-small text-ink-2">
                  Post it under the video once it is published, then choose Pin in the comment's
                  menu.
                </p>
              ) : null}
              {editor("pinnedComment")}
            </section>
          )}
          {sample && written && titleList.length === 0 ? null : (
            <section aria-labelledby={`${id}-titles`} className="flex min-w-0 flex-col gap-2">
              <PartHead
                id={`${id}-titles`}
                label="Other titles"
                count={
                  written && titleList.length > 0
                    ? `${String(titleList.length + 1)} titles to test`
                    : undefined
                }
                over={titleList.some((one) => one.length > titleMaxCharacters)}
              >
                {written && titleList.length > 0 ? (
                  <CopyButton
                    what="other titles"
                    onCopy={() => copy(titleList.join("\n"), "other titles")}
                  />
                ) : null}
                {edit("titles")}
              </PartHead>
              {titleList.length > 0 ? (
                <Pasted label="The other titles">{titleList.join("\n")}</Pasted>
              ) : (
                <p className="m-0 text-small text-ink-2">{written ? missing("titles") : waiting}</p>
              )}
              {titleList.length > 0 ? (
                <p className="m-0 text-small text-ink-2">
                  {`For YouTube's A/B Testing beside the title, with this project's own title "${project.title}".`}
                </p>
              ) : null}
              {titleProblem === undefined || drafts.titles !== undefined ? null : (
                <p className="m-0 text-small text-danger">{titleProblem}</p>
              )}
              {editor("titles")}
            </section>
          )}
          {again === undefined ? null : (
            <div className="flex flex-col items-start gap-1" {...helpScope}>
              <Button type="button" onClick={again}>
                <RefreshCwIcon aria-hidden="true" strokeWidth={1.75} />
                Write the description again · 1 AI call
              </Button>
              <HelpLine>
                Rewrites every part above. A part you edited keeps your text, with the new one
                offered beside it.
              </HelpLine>
            </div>
          )}
        </div>
        <div className="flex min-w-0 flex-col gap-4">
          {sample ? (
            <SampleNote projectId={project.id} />
          ) : (
            <>
              <ReleaseTimes projectId={project.id} />
              <OnYoutube
                projectId={project.id}
                shorts={outputs.filter((output) => output.role === "short_video").length}
              />
            </>
          )}
        </div>
      </div>
      <ConfirmDialog
        open={rewriting}
        title="Write the description again?"
        consequence="The AI writes a new summary, chapters, hashtags, tags, pinned comment and other titles. It is one AI call, billed like the first. A part you edited keeps your text and offers the new one beside it."
        confirmLabel="Write it again · 1 AI call"
        cancelLabel="Keep what is there"
        tone="primary"
        onConfirm={() => {
          setRewriting(false);
          regenerateNow?.(["youtube:description"]);
          notify("Writing the description again.", "info");
        }}
        onCancel={() => setRewriting(false)}
      />
    </div>
  );
}

// A part's text as it goes into YouTube, in a well so it reads as the thing to paste.
function Pasted({
  label,
  empty = false,
  children,
}: {
  readonly label: string;
  // Not written yet: the well holds the sentence saying so.
  readonly empty?: boolean;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <section
      aria-label={label}
      className={cn(
        "min-w-0 whitespace-pre-wrap break-words rounded-control border border-line bg-raised px-3 py-2",
        empty ? "text-small text-ink-2" : "text-ink",
      )}
    >
      {children}
    </section>
  );
}
