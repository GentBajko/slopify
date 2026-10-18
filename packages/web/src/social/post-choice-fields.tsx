import type { Prompt } from "@app/slices/library/model.js";
import { limitsFor } from "@app/slices/social/limits.js";
import {
  type PostChoice,
  type PostMediaChoice,
  type PostTextSource,
  platformLabels,
  postTextSources,
  type SocialPlatform,
  type XTier,
} from "@app/slices/social/model.js";
import { type ReactElement, useEffect, useState } from "react";
import { Field, Select, Textarea } from "@/components/kit/field";
import { Switch } from "@/components/kit/switch";
import { textSourceOptions } from "./words";

// One site's post settings: where the words come from, what it carries, its hashtags and the
// YouTube link. Prepare upload, Play and Template Studio use it with the same names; `compact`
// shows only the text and the main media, for Template Studio's few visible controls.
export function PostChoiceFields({
  platform,
  choice,
  onChange,
  withPrompt,
  prompts = [],
  shorts = 3,
  tier = "free",
  compact = false,
  disabled = false,
}: {
  readonly platform: SocialPlatform;
  readonly choice: PostChoice;
  readonly onChange: (next: PostChoice) => void;
  // Whether a post prompt may be picked here (a paid call, priced where Save is).
  readonly withPrompt: boolean;
  // The Library's prompts of kind "post", for the prompt picker.
  readonly prompts?: readonly Prompt[];
  // How many shorts the video has, for the video picker.
  readonly shorts?: number;
  readonly tier?: XTier;
  readonly compact?: boolean;
  readonly disabled?: boolean;
}): ReactElement {
  const site = platformLabels[platform];
  const limits = limitsFor(platform, tier);
  const set = (patch: Partial<PostChoice>) => onChange({ ...choice, ...patch });
  const media = (patch: Partial<PostMediaChoice>) => set({ media: { ...choice.media, ...patch } });
  const sources = textSourceOptions(withPrompt || choice.text === "prompt");
  const postPrompts = prompts.filter((one) => one.kind === "post");
  const video =
    choice.media.video === "short"
      ? `short:${String(choice.media.short ?? 1)}`
      : (choice.media.video ?? "none");
  const shortCount = Math.max(shorts, choice.media.short ?? 0, 1);
  return (
    <div className="grid min-w-0 grid-cols-1 gap-4 min-[560px]:grid-cols-2">
      <Field label={`${site} text`} tip="social.text">
        <Select
          value={choice.text}
          disabled={disabled}
          options={sources}
          onChange={(event) => {
            const text = postTextSources.find((one) => one === event.currentTarget.value);
            if (text !== undefined) set({ text });
          }}
        />
      </Field>
      <Field label={`${site} video`} tip="social.video">
        <Select
          value={video}
          disabled={disabled}
          onChange={(event) => {
            const value = event.currentTarget.value;
            if (value === "none") media({ video: undefined, short: undefined });
            else if (value === "long") media({ video: "long", short: undefined });
            else media({ video: "short", short: Number(value.slice("short:".length)) });
          }}
        >
          <option value="none">No video</option>
          <option value="long">The video</option>
          {Array.from({ length: shortCount }, (_, index) => `short:${String(index + 1)}`).map(
            (value, index) => (
              <option key={value} value={value}>
                {`Short ${String(index + 1)}`}
              </option>
            ),
          )}
        </Select>
      </Field>
      {choice.text === "prompt" ? (
        <Field
          label="Post prompt"
          tip="social.prompt"
          help="A paid call to the project's text model; Save shows its price."
        >
          <Select
            value={choice.prompt ?? ""}
            disabled={disabled || !withPrompt}
            onChange={(event) => {
              const name = event.currentTarget.value;
              const { prompt: _old, ...rest } = choice;
              onChange(name === "" ? rest : { ...rest, prompt: name });
            }}
          >
            <option value="">Built-in</option>
            {choice.prompt !== undefined &&
            choice.prompt !== "" &&
            !postPrompts.some((one) => one.name === choice.prompt) ? (
              <option value={choice.prompt}>{`${choice.prompt} (saved choice)`}</option>
            ) : null}
            {postPrompts.map((one) => (
              <option key={one.id} value={one.name}>
                {one.name}
              </option>
            ))}
          </Select>
        </Field>
      ) : null}
      {choice.text === "custom" ? (
        <CustomText
          value={choice.custom ?? ""}
          disabled={disabled}
          onCommit={(custom) => set({ custom })}
        />
      ) : null}
      <Field label={`${site} pictures`} tip="social.pictures">
        <Select
          value={String(choice.media.pictures ?? 0)}
          disabled={disabled}
          onChange={(event) => {
            const count = Number(event.currentTarget.value);
            media({ pictures: count === 0 ? undefined : count });
          }}
          options={pictureCounts(limits.pictures, choice.media.pictures ?? 0).map((count) => ({
            value: String(count),
            label:
              count === 0 ? "None" : `${String(count)} ${count === 1 ? "picture" : "pictures"}`,
          }))}
        />
      </Field>
      {compact ? null : (
        <>
          <Field label={`${site} hashtags`} tip="social.hashtags">
            <Select
              value={String(choice.hashtags)}
              disabled={disabled || limits.hashtags === 0}
              onChange={(event) => set({ hashtags: Number(event.currentTarget.value) })}
              options={Array.from(
                { length: Math.max(limits.hashtags, choice.hashtags) + 1 },
                (_, count) => ({
                  value: String(count),
                  label: count === 0 ? "None" : String(count),
                }),
              )}
            />
          </Field>
          <div className="flex flex-col justify-end gap-2">
            <Switch
              label="The thumbnail"
              tip="social.thumbnail"
              tipLabel={`${site} thumbnail`}
              checked={choice.media.thumbnail === true}
              disabled={disabled}
              onChange={(thumbnail) => media({ thumbnail: thumbnail ? true : undefined })}
            />
            <Switch
              label="The YouTube link"
              tip="social.link"
              tipLabel={`${site} YouTube link`}
              checked={choice.link}
              disabled={disabled}
              onChange={(link) => set({ link })}
            />
          </div>
        </>
      )}
    </div>
  );
}

// 0, 1, 2, … up to the site's limit (at most 10, then the limit itself), and the current count.
function pictureCounts(limit: number, current: number): readonly number[] {
  const counts = new Set<number>([0]);
  for (let count = 1; count <= Math.min(limit, 10); count += 1) counts.add(count);
  counts.add(limit);
  counts.add(current);
  return [...counts].sort((a, b) => a - b);
}

// The post's own text with {{Slopify_…}} keywords: saved when the box loses focus, so a site's
// settings change once per edit rather than per key.
function CustomText({
  value,
  disabled,
  onCommit,
}: {
  readonly value: string;
  readonly disabled: boolean;
  readonly onCommit: (text: string) => void;
}): ReactElement {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <Field
      label="Your text"
      tip="social.custom"
      help="{{Slopify_Summary}} and the other keywords Slopify fills work here."
      className="min-[560px]:col-span-2"
    >
      <Textarea
        rows={3}
        maxLength={5000}
        value={draft}
        disabled={disabled}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => {
          if (draft !== value) onCommit(draft);
        }}
      />
    </Field>
  );
}

export function isTextSource(value: string): value is PostTextSource {
  return (postTextSources as readonly string[]).includes(value);
}
