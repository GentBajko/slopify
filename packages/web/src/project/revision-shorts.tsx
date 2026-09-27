import type { Prompt, PromptKind } from "@app/slices/library/model.js";
import type { RevisionEdit, RevisionView } from "@app/slices/revisions/model.js";
import {
  type PickedShorts,
  pickedShortsOf,
  rangeProblem,
  type ShortRange,
} from "@app/slices/shorts/clips.js";
import {
  defaultShorts,
  type ShortsSettings,
  shortsExtrasForm,
  shortsExtrasOf,
} from "@app/slices/shorts/model.js";
import { clipBounds, type ShortPick } from "@app/slices/shorts/pick.js";
import { type ReactElement, useId, useState } from "react";
import { Button } from "@/components/kit/button";
import { Field, Select } from "@/components/kit/field";
import { InfoTip } from "@/components/kit/info-tip";
import { Shorts, shortsPreviewOf } from "@/play/shorts";
import type { ShortsForm } from "@/play/state";
import { StylePreview } from "@/video/style-preview";
import { editOfForm, setPrompt } from "./revision-form-state";
import { RevisionUpload } from "./revision-upload.js";

// The pick: asking for it again picks the moments again. A clip whose sentences come back
// keeps its images and render (`slices/rebuild/recipe-shorts.ts`).
export const pickKey = "shorts:pick";
// "Make this short again" renews short N's own token: its prompts, images and render.
export const remakeKey = (number: number): string => `shorts:${String(number)}`;

// Asks for the moments to be picked again. Ranges set by hand belong to the current pick
// and would not apply to the next one, so they go with it.
export function pickAgain(edit: RevisionEdit): RevisionEdit {
  const { shortsRanges: _ranges, ...content } = edit.content;
  return { ...edit, content, regenerate: [...new Set([...(edit.regenerate ?? []), pickKey])] };
}

export function remakeShort(edit: RevisionEdit, number: number): RevisionEdit {
  return { ...edit, regenerate: [...new Set([...(edit.regenerate ?? []), remakeKey(number)])] };
}

// The pick the project has now, with the clips it chose.
export function currentPick(
  view: RevisionView,
): { readonly fingerprint: string; readonly picked: PickedShorts } | undefined {
  const row = view.pieces.find(
    (one) => one.key === pickKey && one.selected && one.piece.state === "done",
  );
  const picked = pickedShortsOf(row?.piece.payload);
  return row === undefined || picked === undefined
    ? undefined
    : { fingerprint: row.fingerprint, picked };
}

// Edit project → Shorts: the Video stage's Shorts settings, the background music, and each
// picked clip, which can be made again or moved by hand. A Library prompt is frozen into
// the project like the others; Built-in drops the frozen copy, so the step uses the wording
// that ships with Slopify.
export function RevisionShorts({
  edit,
  view,
  prompts,
  problem,
  onChange,
  onPending,
}: {
  readonly edit: RevisionEdit;
  readonly view: RevisionView;
  readonly prompts: readonly Prompt[];
  readonly problem: (field: string) => string | undefined;
  readonly onChange: (edit: RevisionEdit) => void;
  readonly onPending: (pending: boolean) => void;
}): ReactElement {
  const settings: ShortsSettings = edit.config.shorts ?? defaultShorts;
  // What was typed in the numbers and the link, so a half-typed one is not rewritten under
  // the caret.
  const [typed, setTyped] = useState<
    Pick<
      ShortsForm,
      "count" | "minSeconds" | "maxSeconds" | "musicVolume" | "speed" | "fullVideoLink"
    >
  >({
    count: String(settings.count),
    minSeconds: String(settings.minSeconds),
    maxSeconds: String(settings.maxSeconds),
    ...shortsExtrasForm(settings),
  });
  const choices = [
    ...prompts,
    ...saved(view, "shorts", "shorts", view.revision.config.shorts?.prompt, prompts),
    ...saved(view, "image", "shortsImage", view.revision.config.shorts?.imagePrompt, prompts),
  ];
  const value: ShortsForm = {
    enabled: settings.enabled,
    ...typed,
    prompt: settings.prompt ?? "",
    imagePrompt: settings.imagePrompt ?? "",
    ...(settings.titleOnScreen === undefined ? {} : { titleOnScreen: settings.titleOnScreen }),
  };
  const again = edit.regenerate?.includes(pickKey) === true;
  const pick = currentPick(view);
  return (
    <div className="space-y-4">
      <Shorts
        value={value}
        prompts={choices}
        narrated={edit.config.sources.audio !== "off"}
        problem={problem}
        music={
          <Music
            edit={edit}
            disabled={!settings.enabled}
            onChange={onChange}
            onPending={onPending}
          />
        }
        preview={
          <StylePreview
            settings={shortsPreviewOf(value, edit.config.subtitles?.fontId ?? "default")}
          />
        }
        onChange={(next) => {
          setTyped({
            count: next.count,
            minSeconds: next.minSeconds,
            maxSeconds: next.maxSeconds,
            ...(next.musicVolume === undefined ? {} : { musicVolume: next.musicVolume }),
            ...(next.speed === undefined ? {} : { speed: next.speed }),
            ...(next.fullVideoLink === undefined ? {} : { fullVideoLink: next.fullVideoLink }),
          });
          let changed = edit;
          for (const [key, kind, before, after] of [
            ["shorts", "shorts", value.prompt, next.prompt],
            ["shortsImage", "image", value.imagePrompt, next.imagePrompt],
          ] as const) {
            if (before === after) continue;
            const picked = choices.find((prompt) => prompt.kind === kind && prompt.name === after);
            changed =
              picked === undefined
                ? withoutPrompt(changed, key)
                : setPrompt(changed, key, picked.body);
          }
          const whole = (raw: string): number => {
            const number = Number(raw);
            return raw.trim() === "" || !Number.isFinite(number) ? 0 : number;
          };
          const extras = shortsExtrasOf(next);
          onChange({
            ...changed,
            config: {
              ...changed.config,
              shorts: {
                enabled: next.enabled,
                count: whole(next.count),
                minSeconds: whole(next.minSeconds),
                maxSeconds: whole(next.maxSeconds),
                ...(next.prompt === "" ? {} : { prompt: next.prompt }),
                ...(next.imagePrompt === "" ? {} : { imagePrompt: next.imagePrompt }),
                ...extras,
                // Kept as typed so the save refuses it in the shared rule's words.
                ...(extras.musicVolume !== undefined && !Number.isFinite(extras.musicVolume)
                  ? { musicVolume: -1 }
                  : {}),
                ...(extras.speed !== undefined && !Number.isFinite(extras.speed)
                  ? { speed: 0 }
                  : {}),
              },
            },
          });
        }}
      />
      {pick !== undefined && settings.enabled ? (
        <PickedClips
          edit={edit}
          view={view}
          pick={pick}
          settings={settings}
          again={again}
          problem={problem}
          onChange={onChange}
        />
      ) : null}
    </div>
  );
}

// The background music: a file uploaded like provided narration, kept by the project and
// mixed under every short.
function Music({
  edit,
  disabled,
  onChange,
  onPending,
}: {
  readonly edit: RevisionEdit;
  readonly disabled: boolean;
  readonly onChange: (edit: RevisionEdit) => void;
  readonly onPending: (pending: boolean) => void;
}): ReactElement {
  const pending = (edit.uploads ?? []).some((upload) => upload.destination.kind === "shortsMusic");
  const set = edit.content.shortsMusic !== undefined;
  const remove = () => {
    const { shortsMusic: _music, ...content } = edit.content;
    onChange({
      ...edit,
      content,
      uploads: (edit.uploads ?? []).filter((upload) => upload.destination.kind !== "shortsMusic"),
    });
  };
  return (
    <div className="basis-full space-y-2">
      {pending || set ? (
        <p className="flex flex-wrap items-center gap-2 text-small text-ink-2">
          {pending
            ? "New background music chosen. It is mixed under every short after you save and press Remake."
            : "Background music plays quietly under every short and dips while the narrator speaks."}
          <Button type="button" variant="quiet" disabled={disabled} onClick={remove}>
            Remove the music
          </Button>
        </p>
      ) : null}
      <RevisionUpload
        label={
          pending || set
            ? "Replace the background music"
            : "Background music (optional): an audio file, looped if shorter than a short"
        }
        kind="audio"
        disabled={disabled}
        onPending={onPending}
        onReady={(file) =>
          onChange({
            ...edit,
            uploads: [
              ...(edit.uploads ?? []).filter((upload) => upload.destination.kind !== "shortsMusic"),
              { stagedFileId: file.id, destination: { kind: "shortsMusic" } },
            ],
          })
        }
      />
    </div>
  );
}

// Each clip the pick chose, with its first and last sentence, nudges for both, a range of
// one's own, and "Make this short again"; and "Pick different moments" for the whole pick.
function PickedClips({
  edit,
  view,
  pick,
  settings,
  again,
  problem,
  onChange,
}: {
  readonly edit: RevisionEdit;
  readonly view: RevisionView;
  readonly pick: { readonly fingerprint: string; readonly picked: PickedShorts };
  readonly settings: ShortsSettings;
  readonly again: boolean;
  readonly problem: (field: string) => string | undefined;
  readonly onChange: (edit: RevisionEdit) => void;
}): ReactElement {
  const id = useId();
  const saved = view.revision.config.shorts;
  // Another count, length or prompt picks the moments again as well.
  const repicking =
    again ||
    saved === undefined ||
    saved.count !== settings.count ||
    saved.minSeconds !== settings.minSeconds ||
    saved.maxSeconds !== settings.maxSeconds ||
    (saved.prompt ?? "") !== (settings.prompt ?? "");
  const ranges = Object.fromEntries(
    Object.entries(edit.content.shortsRanges ?? {}).filter(
      ([, range]) => range.pick === pick.fingerprint,
    ),
  );
  // Each clip as it will be cut: a range set by hand is shown even while it breaks a rule,
  // with the message saying what to change.
  const sentences = pick.picked.sentences ?? [];
  const duration = pick.picked.durationSeconds ?? sentences.at(-1)?.end ?? 0;
  const clips = pick.picked.shorts.map((clip) => {
    const range = ranges[String(clip.number)];
    const bounds =
      range === undefined ? undefined : clipBounds(sentences, range.first, range.last, duration);
    return range === undefined || bounds === undefined
      ? clip
      : { ...clip, first: range.first, last: range.last, ...bounds };
  });
  const setRange = (clip: ShortPick, first: number, last: number) => {
    const model = pick.picked.shorts.find((one) => one.number === clip.number);
    const { [String(clip.number)]: _old, ...rest } = ranges;
    const next: Record<string, ShortRange> =
      model !== undefined && model.first === first && model.last === last
        ? rest
        : { ...rest, [String(clip.number)]: { first, last, pick: pick.fingerprint } };
    const { shortsRanges: _ranges, ...content } = edit.content;
    onChange({
      ...edit,
      content: Object.keys(next).length === 0 ? content : { ...content, shortsRanges: next },
    });
  };
  return (
    <section aria-labelledby={`${id}-clips`} className="space-y-3 border-t border-line pt-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1">
          <h4 id={`${id}-clips`} className="sl-kicker m-0">
            Picked clips
          </h4>
          <InfoTip id="project.shorts.clips" />
        </span>
        {again ? (
          <p className="flex flex-wrap items-center gap-2 text-small text-accent-ink">
            The moments will be picked again after you save and press Remake; clips on the same
            sentences keep their images.
            <Button
              type="button"
              variant="quiet"
              onClick={() =>
                onChange({
                  ...edit,
                  regenerate: (edit.regenerate ?? []).filter((one) => one !== pickKey),
                })
              }
            >
              Keep the current moments
            </Button>
          </p>
        ) : (
          <span className="inline-flex items-center gap-1">
            <Button type="button" onClick={() => onChange(pickAgain(edit))}>
              Pick different moments
            </Button>
            <InfoTip id="project.shorts.pick-again" />
          </span>
        )}
      </div>
      {repicking && !again ? (
        <p className="text-small text-ink-2">
          These settings pick the moments again after you save and press Remake, so the clips below
          can be adjusted once the new ones are picked.
        </p>
      ) : null}
      <ol className="space-y-3">
        {clips.map((clip) => (
          <ClipRow
            key={clip.number}
            clip={clip}
            picked={pick.picked}
            adjusted={ranges[String(clip.number)] !== undefined}
            locked={repicking}
            remade={edit.regenerate?.includes(remakeKey(clip.number)) === true}
            problem={(() => {
              // Checked as it is typed, so a range put right stops showing the save's refusal.
              const range = ranges[String(clip.number)];
              return range === undefined
                ? problem(`content.shortsRanges.${String(clip.number)}`)
                : rangeProblem(pick.picked, clip.number, range.first, range.last, settings, clips);
            })()}
            onRange={(first, last) => setRange(clip, first, last)}
            onRemake={(remake) =>
              onChange(
                remake
                  ? remakeShort(edit, clip.number)
                  : {
                      ...edit,
                      regenerate: (edit.regenerate ?? []).filter(
                        (one) => one !== remakeKey(clip.number),
                      ),
                    },
              )
            }
          />
        ))}
      </ol>
    </section>
  );
}

function ClipRow({
  clip,
  picked,
  adjusted,
  locked,
  remade,
  problem,
  onRange,
  onRemake,
}: {
  readonly clip: ShortPick;
  readonly picked: PickedShorts;
  readonly adjusted: boolean;
  readonly locked: boolean;
  readonly remade: boolean;
  readonly problem: string | undefined;
  readonly onRange: (first: number, last: number) => void;
  readonly onRemake: (remake: boolean) => void;
}): ReactElement {
  const id = useId();
  const sentences = picked.sentences ?? [];
  const [own, setOwn] = useState(false);
  const number = String(clip.number);
  const text = (at: number) => sentences[at - 1]?.text ?? "";
  // A nudge that would break the length or overlap rules is still offered; the message
  // under the clip says what to change, and the save refuses it in the same words.
  const nudge = (label: string, first: number, last: number, enabled: boolean) => (
    <Button
      type="button"
      variant="quiet"
      aria-label={`${label} of short ${number}`}
      disabled={locked || !enabled}
      onClick={() => onRange(first, last)}
    >
      {label.split(" ")[0]}
    </Button>
  );
  const seconds = Math.round(clip.end - clip.start);
  return (
    <li
      aria-labelledby={`${id}-title`}
      className="space-y-2 border-t border-line pt-3 first:border-t-0 first:pt-0"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h5 id={`${id}-title`} className="min-w-0 text-small font-semibold text-ink">
          Short {number} · {clip.title}
        </h5>
        <span className="text-label text-ink-3">
          Sentences {String(clip.first)}-{String(clip.last)} · {String(seconds)} s
          {adjusted ? " · set by hand" : ""}
        </span>
      </div>
      {sentences.length === 0 ? (
        <p className="text-small text-ink-2">
          These shorts were picked before clips could be moved by hand. Use Pick different moments
          to adjust them.
        </p>
      ) : (
        <>
          <p className="flex flex-wrap items-center gap-x-2 text-small text-ink-2">
            <span className="min-w-0 flex-1">Starts: “{text(clip.first)}”</span>
            {nudge("Earlier start", clip.first - 1, clip.last, clip.first > 1)}
            {nudge("Later start", clip.first + 1, clip.last, clip.first < clip.last)}
          </p>
          <p className="flex flex-wrap items-center gap-x-2 text-small text-ink-2">
            <span className="min-w-0 flex-1">Ends: “{text(clip.last)}”</span>
            {nudge("Earlier end", clip.first, clip.last - 1, clip.last > clip.first)}
            {nudge("Later end", clip.first, clip.last + 1, clip.last < sentences.length)}
          </p>
          {own ? (
            <div className="grid gap-3 md:grid-cols-2">
              {(["first", "last"] as const).map((end) => (
                <Field
                  key={end}
                  id={`${id}-${end}`}
                  label={end === "first" ? "Start sentence" : "End sentence"}
                  tip="project.shorts.range"
                >
                  <Select
                    value={String(clip[end])}
                    disabled={locked}
                    onChange={(event) => {
                      const at = Number(event.target.value);
                      onRange(end === "first" ? at : clip.first, end === "last" ? at : clip.last);
                    }}
                  >
                    {sentences.map((sentence, at) => (
                      <option key={String(at + 1)} value={String(at + 1)}>
                        {String(at + 1)}.{" "}
                        {sentence.text.length > 70
                          ? `${sentence.text.slice(0, 69)}…`
                          : sentence.text}
                      </option>
                    ))}
                  </Select>
                </Field>
              ))}
            </div>
          ) : null}
        </>
      )}
      {problem !== undefined ? (
        <p role="alert" className="text-small text-danger">
          {problem}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        {sentences.length === 0 ? null : (
          <Button type="button" variant="quiet" disabled={locked} onClick={() => setOwn(!own)}>
            {own ? "Hide the sentence lists" : "Use my own range"}
          </Button>
        )}
        {adjusted ? (
          <Button
            type="button"
            variant="quiet"
            disabled={locked}
            onClick={() => {
              const model = picked.shorts.find((one) => one.number === clip.number);
              if (model !== undefined) onRange(model.first, model.last);
            }}
          >
            Back to the AI's choice
          </Button>
        ) : null}
        {remade ? (
          <p className="flex flex-wrap items-center gap-2 text-small text-accent-ink">
            Short {number} will be made again, with new images, after you save and press Remake.
            <Button type="button" variant="quiet" onClick={() => onRemake(false)}>
              Keep this short
            </Button>
          </p>
        ) : (
          <span className="inline-flex items-center gap-1">
            <Button type="button" disabled={locked} onClick={() => onRemake(true)}>
              Make this short again
            </Button>
            <InfoTip id="project.shorts.remake" />
          </span>
        )}
      </div>
    </li>
  );
}

// The prompt the project saved, offered even when the Library no longer holds it.
function saved(
  view: RevisionView,
  kind: PromptKind,
  key: string,
  name: string | undefined,
  prompts: readonly Prompt[],
): readonly Prompt[] {
  const body = view.revision.content.promptTemplates[key] ?? view.revision.config.rendered[key];
  if (!name || body === undefined || body === null) return [];
  if (prompts.some((prompt) => prompt.kind === kind && prompt.name === name)) return [];
  return [{ id: `saved-${key}`, kind, name, body, slots: [], updatedAt: view.revision.createdAt }];
}

function withoutPrompt(edit: RevisionEdit, key: string): RevisionEdit {
  const { [key]: _template, ...promptTemplates } = edit.content.promptTemplates;
  const { [key]: _rendered, ...rendered } = edit.config.rendered;
  return editOfForm({
    ...edit,
    config: { ...edit.config, rendered },
    content: { ...edit.content, promptTemplates },
  });
}
