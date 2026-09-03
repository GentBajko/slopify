import type { Format } from "@app/slices/admission/model.js";
import { titleMax } from "@app/slices/admission/rules.js";
import type { Field } from "@app/slices/admission/substitute.js";
import type { Entry } from "@app/slices/library/model.js";
import type { ProviderStatus } from "@app/slices/settings/model.js";
import { useId } from "react";
import { Mark } from "@/components/glyph";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { soleModelOf } from "@/lib/models";
import type { Blocker } from "@/play/admission";
import { KeywordBlock } from "@/play/keywords";
import { ModelPicker, OptionPicker, ProviderPicker } from "@/play/pickers";
import type { PlayFormState } from "@/play/state";
import { needsLlm } from "@/play/state";
import { InlineSwitch } from "@/play/switches";

// The sticky right column (uiux/screens/06-play.md): the run's title and frame, the
// entries narrated around it, the LLM row when something asks for one, the keywords the
// picked prompts want, and the Play key the whole screen exists to serve.

export interface CueSheetProps {
  readonly form: PlayFormState;
  readonly providers: readonly ProviderStatus[];
  readonly entries: readonly Entry[];
  readonly fields: readonly Field[];
  readonly problem: (field: string) => string | undefined;
  readonly blocker: Blocker | undefined;
  readonly failure: string | undefined;
  readonly pending: boolean;
  readonly update: (patch: Partial<PlayFormState>) => void;
  readonly onPlay: () => void;
}

export function CueSheet({
  form,
  providers,
  entries,
  fields,
  problem,
  blocker,
  failure,
  pending,
  update,
  onPlay,
}: CueSheetProps) {
  const titleId = useId();
  const hintId = useId();
  const held = blocker !== undefined || pending;

  return (
    <aside
      data-play-cue="true"
      className="flex h-fit min-w-0 flex-col gap-[14px] rounded-panel border border-line bg-panel p-[18px] min-[1180px]:sticky min-[1180px]:top-6"
    >
      <h2 className="engraved text-ink3">Cue sheet</h2>

      <div>
        <Label htmlFor={titleId} className="mb-[5px]">
          Video title
        </Label>
        <Input
          id={titleId}
          value={form.title}
          maxLength={titleMax}
          aria-invalid={problem("title") !== undefined}
          onChange={(event) => {
            update({ title: event.target.value });
          }}
        />
        <FieldNote message={problem("title")} />
      </div>

      <div className="flex flex-wrap gap-[10px]">
        <InlineSwitch<Format>
          label="Format"
          className="flex-col items-start gap-[5px]"
          value={form.format}
          options={[
            { value: "16:9", label: "16:9" },
            { value: "9:16", label: "9:16" },
          ]}
          onPick={(format) => {
            update({ format });
          }}
        />
        <div className="min-w-[120px] flex-1">
          <EntryPicker
            label="Intro"
            category="intro"
            entries={entries}
            value={form.intro}
            problem={problem("intro")}
            onPick={(intro) => {
              update({ intro });
            }}
          />
        </div>
        <div className="min-w-[120px] flex-1">
          <EntryPicker
            label="Outro"
            category="outro"
            entries={entries}
            value={form.outro}
            problem={problem("outro")}
            onPick={(outro) => {
              update({ outro });
            }}
          />
        </div>
      </div>

      {/* `logic/04` §Q28: the row exists only while something in the run asks an LLM for
          text - research, the article, a thumbnail written by the LLM, or an LLM-mode
          intro or outro. */}
      {needsLlm(form, entries) ? (
        <div className="flex gap-[10px]">
          <div className="min-w-0 flex-1">
            <ProviderPicker
              label="LLM"
              family="llm"
              providers={providers}
              value={form.llm.provider}
              problem={problem("llm")}
              onPick={(provider) => {
                update({ llm: { provider, model: soleModelOf(provider) } });
              }}
            />
          </div>
          <div className="min-w-0 flex-1">
            <ModelPicker
              label="Model"
              provider={form.llm.provider}
              value={form.llm.model}
              problem={undefined}
              onPick={(model) => {
                update({ llm: { ...form.llm, model } });
              }}
            />
          </div>
        </div>
      ) : null}

      <KeywordBlock
        fields={fields}
        values={form.values}
        problem={problem}
        onChange={(name, value) => {
          update({ values: { ...form.values, [name]: value } });
        }}
      />

      {failure === undefined ? null : (
        <p className="text-small text-red" role="alert">
          {failure}
        </p>
      )}

      {blocker === undefined ? null : (
        <p id={hintId} className="mt-1 text-center text-small text-ink2">
          {blocker.hint}
        </p>
      )}

      <Button
        variant="play"
        size="play"
        // `aria-disabled` rather than `disabled`: a key nobody can focus cannot announce
        // the reason it is refusing, and the reason is the point (uiux/03-experience.md).
        aria-disabled={held}
        aria-describedby={blocker === undefined ? undefined : hintId}
        onClick={() => {
          if (!held) {
            onPlay();
          }
        }}
      >
        <Mark className="relative top-[2px] size-[22px]" />
        PLAY
      </Button>
    </aside>
  );
}

// `logic/04` §Q91: Off, or one saved entry.
function EntryPicker({
  label,
  category,
  entries,
  value,
  problem,
  onPick,
}: {
  readonly label: string;
  readonly category: Entry["category"];
  readonly entries: readonly Entry[];
  readonly value: string;
  readonly problem: string | undefined;
  readonly onPick: (next: string) => void;
}) {
  return (
    <OptionPicker
      label={label}
      value={value}
      placeholder="Off"
      options={entries
        .filter((entry) => entry.category === category)
        .map((entry) => ({ value: entry.name, label: entry.name }))}
      problem={problem}
      onPick={onPick}
    />
  );
}

function FieldNote({ message }: { readonly message: string | undefined }) {
  if (message === undefined) {
    return null;
  }
  return <p className="mt-1 text-label text-red">{message}</p>;
}
