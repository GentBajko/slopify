import type { DocumentTheme } from "@app/slices/document/theme.js";
import { RotateCcwIcon } from "lucide-react";
import { type ReactNode, useId } from "react";
import type { FieldError } from "@/api";
import { ColourInput } from "@/components/colour-input";
import { IconButton } from "@/components/kit/button";
import { Input, Select, Textarea } from "@/components/kit/field";
import { helpScope, InfoTip } from "@/components/kit/info-tip";
import type { HelpId } from "@/help/catalog";
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

// One setting of the document theme editor: its control, its info button, its help and error,
// and, once it differs from the theme it started from, a Reset back to that value.

// Each setting's info button, by the key a refused save names it with. A setting missing here
// shows none, which the Library walk test (help/walk/library.test.tsx) catches.
export const settingTips: Readonly<Record<string, HelpId>> = {
  "values.page.format": "library.theme.page.format",
  "values.page.margin": "library.theme.page.margin",
  "values.page.contentTop": "library.theme.page.content-top",
  "values.background.image": "library.theme.background.image",
  "values.background.color": "library.theme.background.color",
  "values.colors.heading": "library.theme.colors.heading",
  "values.colors.text": "library.theme.colors.text",
  "values.colors.muted": "library.theme.colors.muted",
  "values.colors.faint": "library.theme.colors.faint",
  "values.fonts.body": "library.theme.fonts.body",
  "values.fonts.strong": "library.theme.fonts.strong",
  "values.fonts.emphasis": "library.theme.fonts.emphasis",
  "values.fonts.heading": "library.theme.fonts.heading",
  "values.fonts.dramatic": "library.theme.fonts.dramatic",
  "values.fonts.decorative": "library.theme.fonts.decorative",
  "values.fonts.dropCap": "library.theme.fonts.drop-cap",
  "values.fonts.footer": "library.theme.fonts.footer",
  "values.sizes.title": "library.theme.sizes.title",
  "values.sizes.brand": "library.theme.sizes.brand",
  "values.sizes.section": "library.theme.sizes.section",
  "values.sizes.heading": "library.theme.sizes.heading",
  "values.sizes.subheading": "library.theme.sizes.subheading",
  "values.sizes.body": "library.theme.sizes.body",
  "values.sizes.meta": "library.theme.sizes.meta",
  "values.sizes.footer": "library.theme.sizes.footer",
  "values.spacing.bodyLine": "library.theme.spacing.body-line",
  "values.spacing.headingLine": "library.theme.spacing.heading-line",
  "values.spacing.subheadingLine": "library.theme.spacing.subheading-line",
  "values.spacing.paragraphGap": "library.theme.spacing.paragraph-gap",
  "values.spacing.headingGap": "library.theme.spacing.heading-gap",
  "values.spacing.itemGap": "library.theme.spacing.item-gap",
  "values.spacing.listIndent": "library.theme.spacing.list-indent",
  "values.spacing.quoteIndent": "library.theme.spacing.quote-indent",
  "values.spacing.ruleWidth": "library.theme.spacing.rule-width",
  "values.dropCap.enabled": "library.theme.drop-cap.enabled",
  "values.dropCap.lines": "library.theme.drop-cap.lines",
  "values.dropCap.scale": "library.theme.drop-cap.scale",
  "values.dropCap.gap": "library.theme.drop-cap.gap",
  "values.dropCap.minLength": "library.theme.drop-cap.min-length",
  "values.dropCap.minRoom": "library.theme.drop-cap.min-room",
  "values.titlePage.brandY": "library.theme.title-page.brand-y",
  "values.titlePage.taglineOffset": "library.theme.title-page.tagline-offset",
  "values.titlePage.titleY": "library.theme.title-page.title-y",
  "values.titlePage.titleLine": "library.theme.title-page.title-line",
  "values.titlePage.metaOffset": "library.theme.title-page.meta-offset",
  "values.titlePage.metaLine": "library.theme.title-page.meta-line",
  "values.titlePage.showDate": "library.theme.title-page.show-date",
  "values.titlePage.showWordCount": "library.theme.title-page.show-word-count",
  "values.titlePage.cover.enabled": "library.theme.title-page.cover",
  "values.titlePage.cover.gap": "library.theme.title-page.cover-gap",
  "values.titlePage.cover.maxHeight": "library.theme.title-page.cover-height",
  "values.brand.name": "library.theme.brand.name",
  "values.brand.tagline": "library.theme.brand.tagline",
  "values.brand.url": "library.theme.brand.url",
  "values.brand.linkLabel": "library.theme.brand.link-label",
  "values.contents.enabled": "library.theme.contents.enabled",
  "values.contents.title": "library.theme.contents.title",
  "values.contents.depth": "library.theme.contents.depth",
  "values.contents.titleOffset": "library.theme.contents.title-offset",
  "values.contents.firstEntryOffset": "library.theme.contents.first-entry-offset",
  "values.contents.line": "library.theme.contents.line",
  "values.contents.indent": "library.theme.contents.indent",
  "values.header.enabled": "library.theme.header.enabled",
  "values.header.top": "library.theme.header.top",
  "values.header.maxTitleCharacters": "library.theme.header.max-title",
  "values.footer.enabled": "library.theme.footer.enabled",
  "values.footer.text": "library.theme.footer.text",
  "values.footer.bottom": "library.theme.footer.bottom",
  "values.footer.reserve": "library.theme.footer.reserve",
  "values.sources.enabled": "library.theme.sources.enabled",
  "values.sources.title": "library.theme.sources.title",
  "values.sources.titleOffset": "library.theme.sources.title-offset",
  "values.sources.bodyOffset": "library.theme.sources.body-offset",
  "values.sources.line": "library.theme.sources.line",
  "values.sources.gap": "library.theme.sources.gap",
  "values.endPage.enabled": "library.theme.end-page.enabled",
  "values.endPage.title": "library.theme.end-page.title",
  "values.endPage.lines": "library.theme.end-page.lines",
  "values.endPage.showDocumentDetails": "library.theme.end-page.details",
  "values.endPage.link": "library.theme.end-page.link",
  "values.endPage.closing": "library.theme.end-page.closing",
  "values.endPage.titleOffset": "library.theme.end-page.title-offset",
  "values.endPage.bodyOffset": "library.theme.end-page.body-offset",
  "values.metadata.author": "library.theme.metadata.author",
  "values.metadata.subject": "library.theme.metadata.subject",
  "values.metadata.keywords": "library.theme.metadata.keywords",
  "values.metadata.creator": "library.theme.metadata.creator",
};

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
  const tip = settingTips[fieldKey(field.path)];
  const set = (next: unknown): void => {
    onChange(withValue(theme, field.path, next));
  };
  const info = (
    <>
      {tip === undefined ? null : <InfoTip id={tip} label={field.label} className="-my-1" />}
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
      {field.help === undefined ? null : (
        <p id={`${id}-help`} className="sl-field__help m-0">
          {field.help}
        </p>
      )}
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
        <div className="flex flex-col gap-1 sm:col-span-2" {...helpScope}>
          <span className="flex items-center gap-1">
            <label
              htmlFor={id}
              className="flex min-h-8 items-center gap-3 text-small font-semibold"
            >
              <input
                {...common}
                type="checkbox"
                checked={value === true}
                className="size-4 accent-accent"
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
        <Labelled id={id} label={field.label} notes={notes} info={info}>
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
        <Labelled id={id} label={field.label} notes={notes} info={info}>
          <ColourInput
            {...common}
            pickerLabel={`${field.label} colour`}
            value={typeof value === "string" ? value : ""}
            onChange={set}
          />
        </Labelled>
      );
    case "text":
      return (
        <Labelled id={id} label={field.label} notes={notes} info={info}>
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
        <Labelled id={id} label={field.label} notes={notes} info={info}>
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
        <Labelled id={id} label={field.label} notes={notes} info={info}>
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
        <Labelled id={id} label={field.label} notes={notes} info={info}>
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
            <Input
              type="number"
              aria-label={`${field.label} letter spacing in millimetres`}
              title="Letter spacing (mm)"
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
          </span>
        </Labelled>
      );
    }
    case "lines":
      return (
        <div className="flex flex-col gap-1 sm:col-span-2" {...helpScope}>
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
        <div className="flex flex-col gap-1 sm:col-span-2" {...helpScope}>
          <span className="flex items-center gap-1">
            <label
              htmlFor={id}
              className="flex min-h-8 items-center gap-3 text-small font-semibold"
            >
              <input
                id={id}
                type="checkbox"
                checked={link !== null}
                className="size-4 accent-accent"
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
  children,
}: {
  readonly id: string;
  readonly label: string;
  readonly notes: ReactNode;
  readonly info: ReactNode;
  readonly children: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1" {...helpScope}>
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
  return contrastWarning(colour, theme.background.color, "the page colour", minimum);
}
