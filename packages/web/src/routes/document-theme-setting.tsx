import type { DocumentTheme } from "@app/slices/document/theme.js";
import { RotateCcwIcon } from "lucide-react";
import { type ReactNode, useId } from "react";
import type { FieldError } from "@/api";
import { ColourInput } from "@/components/colour-input";
import { IconButton } from "@/components/kit/button";
import { Checkbox, HelpLine, Input, Select, Textarea } from "@/components/kit/field";
import { helpScope } from "@/components/kit/info-tip";
import {
  type FieldPath,
  faceFamilies,
  faceStyles,
  fieldKey,
  rangeOf,
  type ThemeField,
  valueAt,
  withValue,
} from "@/lib/document-theme-fields";
import { contrastWarning } from "@/lib/hex-colour";

// One setting of the PDF look editor: its control, its own help line when its label needs one
// (the section's line covers the rest), its error, and, once it differs from the look it
// started from, a Reset back to that value. No setting carries an info button: none has a cost
// or a side effect a line can't say.

export function problemFor(problems: readonly FieldError[], path: FieldPath): string | undefined {
  const key = fieldKey(path);
  const found = problems.filter(
    (problem) => problem.field === key || problem.field.startsWith(`${key}.`),
  );
  return found.length === 0 ? undefined : found.map((problem) => problem.message).join(" ");
}

export function Setting({
  field,
  theme,
  original,
  problem,
  onChange,
}: {
  readonly field: ThemeField;
  readonly theme: DocumentTheme;
  // The theme the editor started from; a setting that differs from it offers Reset.
  readonly original: DocumentTheme;
  readonly problem: string | undefined;
  readonly onChange: (values: DocumentTheme) => void;
}) {
  const id = useId();
  const value = valueAt(theme, field.path);
  const before = valueAt(original, field.path);
  const changed = settingChanged(theme, original, field.path);
  // A setting with its own line is its own help scope; the others are explained by their
  // section's line (document-theme-editor.tsx).
  const scope = field.help === undefined ? {} : helpScope;
  const set = (next: unknown): void => {
    onChange(withValue(theme, field.path, next));
  };
  const info = (
    <>
      {changed ? (
        <IconButton
          label={`Reset ${field.label} to ${shownValue(before)}`}
          tip={`Changed. Reset to ${shownValue(before)}`}
          className="-my-1 size-6"
          onClick={() => set(before)}
        >
          <RotateCcwIcon aria-hidden="true" className="size-[13px]" />
        </IconButton>
      ) : null}
    </>
  );
  const contrast =
    field.kind === "color" && problem === undefined ? textContrast(theme, field.path) : undefined;
  const described = [
    field.help === undefined ? "" : `${id}-help`,
    problem === undefined ? "" : `${id}-error`,
    contrast === undefined ? "" : `${id}-contrast`,
  ]
    .filter((one) => one !== "")
    .join(" ");
  const notes = (
    <>
      {field.help === undefined ? null : <HelpLine id={`${id}-help`}>{field.help}</HelpLine>}
      {problem === undefined ? null : (
        <p id={`${id}-error`} className="sl-field__error m-0">
          {problem}
        </p>
      )}
      {contrast === undefined ? null : (
        <p id={`${id}-contrast`} className="m-0 text-small text-waiting">
          {contrast}
        </p>
      )}
    </>
  );
  const common = {
    id,
    "aria-invalid": problem !== undefined,
    "aria-describedby": described === "" ? undefined : described,
  };

  switch (field.kind) {
    case "toggle":
      return (
        <div className="flex flex-col gap-1 sm:col-span-2" {...scope}>
          <span className="flex items-center gap-1">
            <label
              htmlFor={id}
              className="flex min-h-8 items-center gap-3 text-small font-semibold"
            >
              <Checkbox
                {...common}
                checked={value === true}
                onChange={(event) => {
                  set(event.currentTarget.checked);
                }}
              />
              {field.label}
            </label>
            {info}
          </span>
          {notes}
        </div>
      );
    case "number": {
      const { min, max } = rangeOf(field.path);
      return (
        <Labelled id={id} label={field.label} notes={notes} info={info} scope={scope}>
          <span className="flex items-center gap-2">
            <Input
              {...common}
              type="number"
              inputMode="decimal"
              min={min}
              max={max}
              step={field.step}
              className="w-28"
              value={typeof value === "number" && Number.isFinite(value) ? value : ""}
              onChange={(event) => {
                set(event.target.value === "" ? Number.NaN : Number(event.target.value));
              }}
            />
            <span className="text-small text-ink-2">{field.unit}</span>
          </span>
        </Labelled>
      );
    }
    case "color":
      return (
        <Labelled id={id} label={field.label} notes={notes} info={info} scope={scope}>
          <ColourInput
            {...common}
            pickerLabel={`${field.label}${/color$/iu.test(field.label) ? "" : " color"} picker`}
            value={typeof value === "string" ? value : ""}
            onChange={set}
          />
        </Labelled>
      );
    case "text":
      return (
        <Labelled id={id} label={field.label} notes={notes} info={info} scope={scope}>
          <Input
            {...common}
            value={typeof value === "string" ? value : ""}
            onChange={(event) => {
              set(event.target.value);
            }}
          />
        </Labelled>
      );
    case "optional-text":
      return (
        <Labelled id={id} label={field.label} notes={notes} info={info} scope={scope}>
          <Input
            {...common}
            value={typeof value === "string" ? value : ""}
            onChange={(event) => {
              set(event.target.value === "" ? null : event.target.value);
            }}
          />
        </Labelled>
      );
    case "choice": {
      const index = field.options.findIndex((option) => option.value === value);
      return (
        <Labelled id={id} label={field.label} notes={notes} info={info} scope={scope}>
          <Select
            {...common}
            value={String(index)}
            onChange={(event) => {
              const picked = field.options[Number(event.target.value)];
              if (picked !== undefined) set(picked.value);
            }}
          >
            {field.options.map((option, at) => (
              <option key={option.label} value={String(at)}>
                {option.label}
              </option>
            ))}
          </Select>
        </Labelled>
      );
    }
    case "face": {
      const face = value as DocumentTheme["fonts"]["body"];
      const styles = faceStyles(face.family);
      return (
        <Labelled id={id} label={field.label} notes={notes} info={info} scope={scope}>
          <span className="flex flex-wrap items-center gap-2">
            <Select
              {...common}
              aria-label={`${field.label} font`}
              value={face.family}
              onChange={(event) => {
                const family = faceFamilies.find((one) => one.value === event.target.value);
                if (family === undefined) return;
                const keep = faceStyles(family.value).some((one) => one.value === face.style);
                set({ ...face, family: family.value, style: keep ? face.style : "normal" });
              }}
            >
              {faceFamilies.map((family) => (
                <option key={family.value} value={family.value}>
                  {family.label}
                </option>
              ))}
            </Select>
            <Select
              aria-label={`${field.label} style`}
              value={face.style}
              onChange={(event) => {
                set({ ...face, style: event.target.value });
              }}
            >
              {styles.map((style) => (
                <option key={style.value} value={style.value}>
                  {style.label}
                </option>
              ))}
            </Select>
            {/* The third box is said in words beside it, not only to a screen reader. */}
            <span className="flex items-center gap-2">
              <Input
                type="number"
                aria-label={`${field.label} letter spacing in millimeters`}
                step={0.01}
                className="w-20"
                value={Number.isFinite(face.letterSpacing) ? face.letterSpacing : ""}
                onChange={(event) => {
                  set({
                    ...face,
                    letterSpacing:
                      event.target.value === "" ? Number.NaN : Number(event.target.value),
                  });
                }}
              />
              <span aria-hidden="true" className="text-small text-ink-2">
                mm between letters
              </span>
            </span>
          </span>
        </Labelled>
      );
    }
    case "lines":
      return (
        <div className="flex flex-col gap-1 sm:col-span-2" {...scope}>
          <span className="flex items-center gap-1">
            <label htmlFor={id} className="sl-field__label">
              {field.label}
            </label>
            {info}
          </span>
          <Textarea
            {...common}
            rows={8}
            value={Array.isArray(value) ? value.join("\n") : ""}
            onChange={(event) => {
              set(event.target.value.split("\n"));
            }}
          />
          {notes}
        </div>
      );
    case "link": {
      const link = value as DocumentTheme["endPage"]["link"];
      return (
        <div className="flex flex-col gap-1 sm:col-span-2" {...scope}>
          <span className="flex items-center gap-1">
            <label
              htmlFor={id}
              className="flex min-h-8 items-center gap-3 text-small font-semibold"
            >
              <Checkbox
                id={id}
                checked={link !== null}
                onChange={(event) => {
                  set(
                    event.currentTarget.checked ? { text: "Visit the website", url: null } : null,
                  );
                }}
              />
              {field.label}
            </label>
            {info}
          </span>
          {link === null ? null : (
            <span className="grid grid-cols-[minmax(0,1fr)] gap-2 sm:grid-cols-2">
              <Input
                aria-label="Link text"
                placeholder="Link text"
                value={link.text}
                onChange={(event) => {
                  set({ ...link, text: event.target.value });
                }}
              />
              <Input
                aria-label="Link address"
                placeholder="https://"
                value={link.url ?? ""}
                onChange={(event) => {
                  set({ ...link, url: event.target.value === "" ? null : event.target.value });
                }}
              />
            </span>
          )}
          {notes}
        </div>
      );
    }
  }
}

function Labelled({
  id,
  label,
  notes,
  info,
  scope,
  children,
}: {
  readonly id: string;
  readonly label: string;
  readonly notes: ReactNode;
  readonly info: ReactNode;
  readonly scope: Partial<typeof helpScope>;
  readonly children: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1" {...scope}>
      <span className="flex items-center gap-1">
        <label htmlFor={id} className="sl-field__label">
          {label}
        </label>
        {info}
      </span>
      {children}
      {notes}
    </div>
  );
}

// Whether a setting differs from the theme the editor started from.
export function settingChanged(
  theme: DocumentTheme,
  original: DocumentTheme,
  path: FieldPath,
): boolean {
  return JSON.stringify(valueAt(theme, path)) !== JSON.stringify(valueAt(original, path));
}

function shownValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "empty";
  if (typeof value === "boolean") return value ? "on" : "off";
  if (typeof value === "string" || typeof value === "number") return String(value);
  return "the starting value";
}

// Text colours read on the page colour when the page is flat; the minimum is WCAG's 4.5:1 for
// body text and 3:1 for headings and the smaller marks.
const textMinimum: Readonly<Record<string, number>> = {
  "colors.text": 4.5,
  "colors.heading": 3,
  "colors.muted": 3,
  "colors.faint": 3,
};

function textContrast(theme: DocumentTheme, path: FieldPath): string | undefined {
  const minimum = textMinimum[path.join(".")];
  if (minimum === undefined || theme.background.image !== null) return undefined;
  const colour = valueAt(theme, path);
  if (typeof colour !== "string") return undefined;
  return contrastWarning(colour, theme.background.color, "the page color", minimum);
}
