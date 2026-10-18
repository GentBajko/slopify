import {
  type BlockRole,
  blockRoles,
  blocksMax,
  type LayoutPreset,
  type Scrim,
} from "@app/slices/designs/model.js";
import type { DesignText, TextBlock } from "@app/slices/designs/schema.js";
import { useQuery } from "@tanstack/react-query";
import { PlusIcon, Trash2Icon } from "lucide-react";
import type { ReactElement } from "react";
import { useApp } from "@/app-context";
import { Button, IconButton } from "@/components/kit/button";
import { Field, Input, Select } from "@/components/kit/field";
import { Fold } from "@/components/kit/fold";
import { helpScope, InfoTip } from "@/components/kit/info-tip";
import { Segmented } from "@/components/kit/switch";
import type { HelpId } from "@/help/catalog";
import { fontsKey, listFonts } from "@/subtitles/api";
import { nextBlockId } from "./document";

// The text Slopify lays out on the artwork, the same on a design and a design template:
// where it sits, what is behind it, and its lines. A line's size, font and colour are
// occasional settings, folded under Fine-tune.

const presets: readonly { readonly value: LayoutPreset; readonly label: string }[] = [
  { value: "top-title", label: "Top" },
  { value: "bottom-band", label: "Bottom" },
  { value: "centered", label: "Centre" },
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
      <Field label="Where the text sits" tip="library.design.text-position">
        <Segmented
          label="Where the text sits"
          value={text.preset}
          options={presets}
          onChange={(preset) => onChange({ ...text, preset })}
        />
      </Field>
      <Field label="Behind the text" tip="library.design.scrim">
        <Segmented
          label="Behind the text"
          value={text.scrim}
          options={scrimOptions}
          onChange={(scrim) => onChange({ ...text, scrim })}
        />
      </Field>
      <fieldset
        className="m-0 flex min-w-0 flex-col gap-2 border-0 p-0"
        disabled={disabled}
        {...helpScope}
      >
        <legend className="sl-field__label mb-1 flex items-center gap-1">
          Lines
          <InfoTip id="library.design.lines" className="-my-1" />
        </legend>
        {text.blocks.map((block, index) => (
          <div key={block.id} className="flex min-w-0 items-center gap-2">
            <Input
              aria-label={`Line ${String(index + 1)} (${roleLabels[block.role]})`}
              value={block.text}
              maxLength={500}
              onChange={(event) => setBlock(index, { text: event.target.value })}
              className="min-w-0 flex-1"
            />
            <IconButton
              label={`Remove line ${String(index + 1)}`}
              onClick={() =>
                onChange({ ...text, blocks: text.blocks.filter((_one, at) => at !== index) })
              }
            >
              <Trash2Icon aria-hidden="true" className="size-4" />
            </IconButton>
          </div>
        ))}
        <div>
          <Button
            variant="quiet"
            size="small"
            disabled={text.blocks.length >= blocksMax}
            disabledReason={`A piece has at most ${String(blocksMax)} lines.`}
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
        <Fold summary="Fine-tune lines · size, font and colour">
          <div className="flex min-w-0 flex-col gap-3">
            {text.blocks.map((block, index) => (
              <div
                key={block.id}
                className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]"
              >
                <Field label={`Line ${String(index + 1)} size`} tip="library.design.line-style">
                  <Select
                    value={block.role}
                    options={blockRoles.map((role) => ({ value: role, label: roleLabels[role] }))}
                    onChange={(event) => setBlock(index, { role: event.target.value as BlockRole })}
                  />
                </Field>
                <Field label={`Line ${String(index + 1)} font`} tip="library.design.line-style">
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
                <Field label={`Line ${String(index + 1)} colour`} tip="library.design.line-style">
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

// A value for each {{field}}: a design's own words, or a template's sample values. A date
// field takes a date.
export function ValueFields({
  fields,
  values,
  dateField,
  onChange,
  label,
  tip,
}: {
  readonly fields: readonly string[];
  readonly values: Readonly<Record<string, string>>;
  readonly dateField?: string | undefined;
  readonly onChange: (next: Readonly<Record<string, string>>) => void;
  readonly label: string;
  // The info button beside each field: what the values are for here.
  readonly tip: HelpId;
}): ReactElement | null {
  if (fields.length === 0) return null;
  return (
    <fieldset className="m-0 grid min-w-0 grid-cols-1 gap-3 border-0 p-0 sm:grid-cols-2">
      <legend className="sl-field__label mb-1">{label}</legend>
      {fields.map((name) => (
        <Field key={name} label={name} tip={tip} tipLabel={`${label}: ${name}`}>
          <Input
            type={name === dateField ? "date" : "text"}
            value={values[name] ?? ""}
            onChange={(event) => onChange({ ...values, [name]: event.target.value })}
          />
        </Field>
      ))}
    </fieldset>
  );
}
