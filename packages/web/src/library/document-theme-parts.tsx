import type { DocumentTheme } from "@app/slices/document/theme.js";
import type { ReactElement, ReactNode } from "react";
import { SectionHead } from "@/components/kit/section-head";
import { faceFamilies } from "@/lib/document-theme-fields";

// Library → Documents' pieces: a theme's one-line summary, its swatches on the row and the
// selected theme's colours, fonts and page beside the list.

export function themeMeta(values: DocumentTheme): string {
  return `${values.page.format === "a4" ? "A4" : "Letter"} · ${familyLabel(values.fonts.body.family)} body`;
}

function familyLabel(family: string): string {
  return faceFamilies.find((one) => one.value === family)?.label ?? family;
}

function hex(color: string): string {
  return color.startsWith("#") ? color : `#${color}`;
}

// The selected theme at a glance: its colours, its fonts and its page.
export function ThemeDetail({
  name,
  kicker,
  meta,
  values,
  action,
}: {
  readonly name: string;
  readonly kicker: string;
  readonly meta: ReactNode;
  readonly values: DocumentTheme;
  readonly action: ReactNode;
}): ReactElement {
  const colors: readonly (readonly [string, string])[] = [
    ["Headings", values.colors.heading],
    ["Text", values.colors.text],
    ["Muted", values.colors.muted],
    ["Header and page numbers", values.colors.faint],
  ];
  const fonts: readonly (readonly [string, DocumentTheme["fonts"]["body"]])[] = [
    ["Body", values.fonts.body],
    ["Headings", values.fonts.heading],
    ["Drop cap", values.fonts.dropCap],
  ];
  return (
    <section aria-label={`${name} details`} className="flex min-w-0 flex-col gap-6">
      <SectionHead title={name} kicker={kicker} meta={meta} className="pb-0">
        {action}
      </SectionHead>
      <dl className="m-0 grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-[max-content_minmax(0,1fr)]">
        {colors.map(([label, color]) => (
          <Pair key={label} label={label}>
            <span className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className="size-4 rounded-full border border-line"
                style={{ backgroundColor: hex(color) }}
              />
              <span className="font-mono text-small">{hex(color)}</span>
            </span>
          </Pair>
        ))}
        {fonts.map(([label, face]) => (
          <Pair key={`font-${label}`} label={`${label} font`}>
            {`${familyLabel(face.family)}, ${face.style}`}
          </Pair>
        ))}
        <Pair label="Page">
          {`${values.page.format === "a4" ? "A4" : "Letter"}, ${
            values.background.image === "parchment"
              ? "parchment"
              : `flat ${hex(values.background.color)}`
          } background`}
        </Pair>
      </dl>
    </section>
  );
}

function Pair({ label, children }: { readonly label: string; readonly children: ReactNode }) {
  return (
    <>
      <dt className="text-small text-ink-2">{label}</dt>
      <dd className="m-0 min-w-0 text-body text-ink">{children}</dd>
    </>
  );
}

export function Swatches({
  colors,
}: {
  readonly colors: { readonly heading: string; readonly text: string; readonly muted: string };
}) {
  return (
    <span aria-hidden="true" className="flex shrink-0 gap-1">
      {[colors.heading, colors.text, colors.muted].map((color, index) => (
        <span
          // biome-ignore lint/suspicious/noArrayIndexKey: three fixed swatches
          key={index}
          className="size-3 rounded-full border border-line"
          style={{ backgroundColor: hex(color) }}
        />
      ))}
    </span>
  );
}
