import { type DesignFormat, designFormats } from "@app/slices/designs/model.js";
import type { DesignDocument } from "@app/slices/designs/schema.js";
import type { ReactElement } from "react";
import { Field, Input, Textarea } from "@/components/kit/field";
import { Fold } from "@/components/kit/fold";
import { formatName, toggleFormat } from "./document";

// Which formats a piece is drawn in, where each crops the one artwork (its focus), and a
// brochure's inside pages. The artwork is made once; every other format is a crop of it.

export function FormatsFields({
  doc,
  onChange,
}: {
  readonly doc: DesignDocument;
  readonly onChange: (next: DesignDocument) => void;
}): ReactElement {
  const chosen = new Set(doc.formats.map((one) => one.format));
  const setFocus = (format: DesignFormat, axis: "x" | "y", value: number) =>
    onChange({
      ...doc,
      formats: doc.formats.map((one) =>
        one.format === format ? { ...one, focus: { ...one.focus, [axis]: value } } : one,
      ),
    });
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <fieldset className="m-0 grid min-w-0 grid-cols-2 gap-x-4 gap-y-2 border-0 p-0 sm:grid-cols-3">
        <legend className="sl-field__label mb-1">Formats</legend>
        {designFormats.map((format) => (
          <label key={format} className="flex min-h-8 items-center gap-2 text-small">
            <input
              type="checkbox"
              checked={chosen.has(format)}
              // The last format can't be unticked: a piece is drawn in at least one.
              disabled={chosen.has(format) && chosen.size === 1}
              onChange={() => onChange(toggleFormat(doc, format))}
            />
            {formatName(format)}
          </label>
        ))}
      </fieldset>
      {doc.brochure === undefined ? null : (
        <div className="grid min-w-0 gap-3">
          <Field label="Brochure title">
            <Input
              value={doc.brochure.title}
              maxLength={200}
              onChange={(event) =>
                doc.brochure === undefined
                  ? undefined
                  : onChange({ ...doc, brochure: { ...doc.brochure, title: event.target.value } })
              }
            />
          </Field>
          <Field label="Brochure pages" help="Markdown; fields such as {{Event}} are filled in.">
            <Textarea
              rows={6}
              value={doc.brochure.body}
              onChange={(event) =>
                doc.brochure === undefined
                  ? undefined
                  : onChange({ ...doc, brochure: { ...doc.brochure, body: event.target.value } })
              }
            />
          </Field>
        </div>
      )}
      <Fold summary="Fine-tune crops · where each format centres the picture">
        <div className="grid min-w-0 gap-3">
          {doc.formats.map((one) => (
            <div key={one.format} className="grid min-w-0 grid-cols-[8rem_minmax(0,1fr)] gap-2">
              <span className="text-small font-semibold">{formatName(one.format)}</span>
              <div className="grid min-w-0 gap-1">
                <label className="flex items-center gap-2 text-small">
                  Across
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={one.focus.x}
                    aria-label={`${formatName(one.format)} focus across`}
                    onChange={(event) => setFocus(one.format, "x", Number(event.target.value))}
                    className="min-w-0 flex-1"
                  />
                </label>
                <label className="flex items-center gap-2 text-small">
                  Down
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={one.focus.y}
                    aria-label={`${formatName(one.format)} focus down`}
                    onChange={(event) => setFocus(one.format, "y", Number(event.target.value))}
                    className="min-w-0 flex-1"
                  />
                </label>
              </div>
            </div>
          ))}
        </div>
      </Fold>
    </div>
  );
}
