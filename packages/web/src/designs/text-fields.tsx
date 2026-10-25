import {
  type BlockRole,
  blockRoles,
  blocksMax,
  type LayoutPreset,
  type Scrim,
} from "@app/slices/designs/model.js";
import type { DesignText, TextBlock } from "@app/slices/designs/schema.js";
import { useQuery } from "@tanstack/react-query";
import { PlusIcon } from "lucide-react";
import type { ReactElement } from "react";
import { useApp } from "@/app-context";
import { Button } from "@/components/kit/button";
import { Field, HelpLine, Input, Select } from "@/components/kit/field";
import { Fold } from "@/components/kit/fold";
import { helpScope } from "@/components/kit/info-tip";
import { Segmented, type SegmentedOption } from "@/components/kit/switch";
import { fontsKey, listFonts } from "@/subtitles/api";
import { nextBlockId } from "./document";

// The text Slopify lays out on the artwork, the same on a design and a design template:
// where it sits, what is behind it, and its lines. A line's size, font and color are
// occasional settings, folded away.

const presets: readonly { readonly value: LayoutPreset; readonly label: string }[] = [
  { value: "top-title", label: "Top" },
  { value: "bottom-band", label: "Bottom" },
  { value: "centered", label: "Center" },
  { value: "left-column", label: "Left" },
];
const scrimOptions: readonly { readonly value: Scrim; readonly label: string }[] = [
  { value: "band", label: "Band" },
  { value: "soft", label: "Soft" },
  { value: "none", label: "None" },
];
const roleLabels: Readonly<Record<BlockRole, string>> = {
  headline: "Headline",
  subhead: "Subhead",
  details: "Details",
  small: "Small print",
};

export function TextLayoutFields({
  text,
  onChange,
  disabled = false,
}: {
  readonly text: DesignText;
  readonly onChange: (next: DesignText) => void;
  readonly disabled?: boolean;
}): ReactElement {
  const { api } = useApp();
  const fonts = useQuery({ queryKey: fontsKey, queryFn: () => listFonts(api) });
  const setBlock = (index: number, patch: Partial<TextBlock>) =>
    onChange({
      ...text,
      blocks: text.blocks.map((block, at) => (at === index ? { ...block, ...patch } : block)),
    });
  const fontOptions = [
    { value: "default", label: "Barlow (default)" },
    ...(fonts.data?.fonts ?? [])
      .filter((font) => font.id !== "default")
      .map((font) => ({ value: font.id, label: font.name })),
  ];
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <NamedChoice
        label="Where the text sits"
        help="Every format puts it in the same place, fitted to its shape."
        value={text.preset}
        options={presets}
        onChange={(preset) => onChange({ ...text, preset })}
      />
      <NamedChoice
        label="Behind the text"
        help="Band is a dark strip across the picture; Soft darkens only behind the lines."
        value={text.scrim}
        options={scrimOptions}
        onChange={(scrim) => onChange({ ...text, scrim })}
      />
      <fieldset
        className="m-0 flex min-w-0 flex-col gap-2 border-0 p-0"
        disabled={disabled}
        {...helpScope}
      >
        <legend className="sl-field__label mb-1">Lines</legend>
        <HelpLine>
          The first line is the largest. Keywords such as {"{{Event}}"} are filled for each poster.
        </HelpLine>
        {text.blocks.map((block, index) => (
          <div key={block.id} className="flex min-w-0 items-center gap-2">
            <Input
              aria-label={`Line ${String(index + 1)} (${roleLabels[block.role]})`}
              value={block.text}
              maxLength={500}
              onChange={(event) => setBlock(index, { text: event.target.value })}
              className="min-w-0 flex-1"
            />
            <Button
              size="small"
              variant="quiet"
              aria-label={`Remove line ${String(index + 1)}`}
              onClick={() =>
                onChange({ ...text, blocks: text.blocks.filter((_one, at) => at !== index) })
              }
            >
              Remove
            </Button>
          </div>
        ))}
        <div>
          <Button
            variant="quiet"
            size="small"
            disabled={text.blocks.length >= blocksMax}
            disabledReason={`A poster has at most ${String(blocksMax)} lines.`}
            onClick={() =>
              onChange({
                ...text,
                blocks: [
                  ...text.blocks,
                  {
                    id: nextBlockId(text.blocks),
                    role: text.blocks.length === 0 ? "headline" : "details",
                    text: "",
                    fontId: "default",
                    color: "#FFFFFF",
                  },
                ],
              })
            }
          >
            <PlusIcon aria-hidden="true" className="size-4" />
            Add a line
          </Button>
        </div>
      </fieldset>
      {text.blocks.length === 0 ? null : (
        <Fold summary="Size, font and color of each line">
          <div className="flex min-w-0 flex-col gap-3">
            {text.blocks.map((block, index) => (
              <div
                key={block.id}
                className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]"
              >
                <Field label={`Line ${String(index + 1)} size`}>
                  <Select
                    value={block.role}
                    options={blockRoles.map((role) => ({ value: role, label: roleLabels[role] }))}
                    onChange={(event) => setBlock(index, { role: event.target.value as BlockRole })}
                  />
                </Field>
                <Field label={`Line ${String(index + 1)} font`}>
                  <Select
                    value={block.fontId}
                    options={
                      fontOptions.some((option) => option.value === block.fontId)
                        ? fontOptions
                        : [...fontOptions, { value: block.fontId, label: "Saved font" }]
                    }
                    onChange={(event) => setBlock(index, { fontId: event.target.value })}
                  />
                </Field>
                <Field label={`Line ${String(index + 1)} color`}>
                  <Input
                    type="color"
                    value={block.color}
                    onChange={(event) =>
                      setBlock(index, { color: event.target.value.toUpperCase() })
                    }
                    className="h-9 w-16 p-1"
                  />
                </Field>
              </div>
            ))}
          </div>
        </Fold>
      )}
    </div>
  );
}

// A value for each {{keyword}}: a design's own words, or a template's sample values. A date
// keyword takes a date. One line under them says what they are for here.
export function ValueFields({
  fields,
  values,
  dateField,
  onChange,
  label,
  help,
}: {
  readonly fields: readonly string[];
  readonly values: Readonly<Record<string, string>>;
  readonly dateField?: string | undefined;
  readonly onChange: (next: Readonly<Record<string, string>>) => void;
  readonly label: string;
  readonly help: string;
}): ReactElement | null {
  if (fields.length === 0) return null;
  return (
    <fieldset className="m-0 flex min-w-0 flex-col gap-2 border-0 p-0" {...helpScope}>
      <legend className="sl-field__label mb-1">{label}</legend>
      <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
        {fields.map((name) => (
          <div key={name} className="sl-field">
            <span className="sl-field__label" aria-hidden="true">
              {name}
            </span>
            <Input
              aria-label={name}
              type={name === dateField ? "date" : "text"}
              value={values[name] ?? ""}
              onChange={(event) => onChange({ ...values, [name]: event.target.value })}
            />
          </div>
        ))}
      </div>
      <HelpLine>{help}</HelpLine>
    </fieldset>
  );
}

// A row of choices with its name shown above it, as a field's label is, and one line under it.
export function NamedChoice<T extends string>({
  label,
  ...rest
}: {
  readonly label: string;
  readonly help: string;
  readonly value: T;
  readonly options: readonly SegmentedOption<T>[];
  readonly onChange: (next: T) => void;
}): ReactElement {
  return (
    <div className="sl-field">
      <span className="sl-field__label" aria-hidden="true">
        {label}
      </span>
      <Segmented label={label} {...rest} />
    </div>
  );
}
