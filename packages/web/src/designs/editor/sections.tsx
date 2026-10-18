import { designFields } from "@app/slices/designs/fields.js";
import { daysBeforeMax } from "@app/slices/designs/model.js";
import type { DesignDocument } from "@app/slices/designs/schema.js";
import { type ReactElement, useState } from "react";
import { useApp } from "@/app-context";
import { Callout } from "@/components/kit/callout";
import { Field, Input, Select, Textarea } from "@/components/kit/field";
import { Fold } from "@/components/kit/fold";
import { Segmented, Switch } from "@/components/kit/switch";
import { uploadPicture } from "../api";
import { aiTextWarning } from "../design-panels";
import { FormatsFields } from "../formats-fields";
import { MadeWith } from "../made-with";
import { TextLayoutFields, ValueFields } from "../text-fields";

// The design template editor's sections, each at most four settings on show: Picture, Text
// layout, Formats and Schedule (its settings; the rows are `schedule-rows.tsx`). Anything
// occasional is folded away.

export interface SectionProps {
  readonly doc: DesignDocument;
  readonly onChange: (next: DesignDocument) => void;
}

export function PictureSection({
  doc,
  onChange,
  name,
  onName,
}: SectionProps & {
  readonly name: string;
  readonly onName: (next: string) => void;
}): ReactElement {
  const { api } = useApp();
  const [problem, setProblem] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const picture = doc.picture;
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <Field label="Template name">
        <Input value={name} maxLength={200} onChange={(event) => onName(event.target.value)} />
      </Field>
      <Field label="Artwork">
        <Segmented
          label="Artwork"
          value={picture.source}
          options={[
            { value: "generate", label: "The AI draws it for each piece" },
            { value: "picture", label: "My own picture" },
          ]}
          onChange={(source) => onChange({ ...doc, picture: { ...picture, source } })}
        />
      </Field>
      {picture.source === "generate" ? (
        <>
          <Field
            label="Describe the artwork"
            help="Fields such as {{Event}} are filled for each piece. No words: Slopify adds the text."
          >
            <Textarea
              rows={4}
              maxLength={4000}
              value={picture.prompt}
              onChange={(event) =>
                onChange({ ...doc, picture: { ...picture, prompt: event.target.value } })
              }
            />
          </Field>
          <MadeWith
            provider={picture.provider}
            model={picture.model}
            onChange={(next) => onChange({ ...doc, picture: { ...picture, ...next } })}
          />
        </>
      ) : (
        <Field
          label="The picture every piece uses"
          help={picture.sha256 === undefined ? "None yet." : "Saved with the template."}
          error={problem ?? undefined}
        >
          <Input
            type="file"
            accept="image/png,image/jpeg"
            disabled={uploading}
            onChange={async (event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file === undefined) return;
              setUploading(true);
              setProblem(null);
              try {
                const uploaded = await uploadPicture(api, file);
                if (!uploaded.ok) setProblem(uploaded.message);
                else onChange({ ...doc, picture: { ...picture, sha256: uploaded.value.sha256 } });
              } finally {
                setUploading(false);
              }
            }}
          />
        </Field>
      )}
    </div>
  );
}

export function TextSection({ doc, onChange }: SectionProps): ReactElement {
  const fields = designFields(doc);
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <TextLayoutFields
        text={doc.text}
        disabled={doc.picture.aiText}
        onChange={(text) => onChange({ ...doc, text })}
      />
      <ValueFields
        label="Sample values"
        fields={fields}
        values={doc.samples}
        dateField={doc.schedule?.dateField}
        onChange={(samples) => onChange({ ...doc, samples })}
      />
      <Fold summary={`More · the AI draws the text: ${doc.picture.aiText ? "on" : "off"}`}>
        <div className="flex flex-col gap-3">
          <Switch
            label="Let the AI draw the text"
            checked={doc.picture.aiText}
            onChange={(aiText) => onChange({ ...doc, picture: { ...doc.picture, aiText } })}
          />
          {doc.picture.aiText ? <Callout tone="waiting" title={aiTextWarning} /> : null}
        </div>
      </Fold>
    </div>
  );
}

export function FormatsSection({ doc, onChange }: SectionProps): ReactElement {
  return <FormatsFields doc={doc} onChange={onChange} />;
}

export function ScheduleSettings({ doc, onChange }: SectionProps): ReactElement {
  const fields = designFields(doc);
  const schedule = doc.schedule;
  const { schedule: _off, ...withoutSchedule } = doc;
  return (
    <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-3">
      <Field label="Each piece's date is in">
        <Select
          value={schedule?.dateField ?? ""}
          onChange={(event) =>
            onChange(
              event.target.value === ""
                ? withoutSchedule
                : {
                    ...doc,
                    schedule: {
                      dateField: event.target.value,
                      daysBefore: schedule?.daysBefore ?? 7,
                      time: schedule?.time ?? "09:00",
                    },
                  },
            )
          }
          options={[
            { value: "", label: "No schedule" },
            ...fields.map((name) => ({ value: name, label: `{{${name}}}` })),
          ]}
        />
      </Field>
      <Field label="Days ahead">
        <Input
          type="number"
          min={0}
          max={daysBeforeMax}
          disabled={schedule === undefined}
          value={schedule?.daysBefore ?? 7}
          onChange={(event) =>
            schedule === undefined
              ? undefined
              : onChange({
                  ...doc,
                  schedule: {
                    ...schedule,
                    daysBefore: Math.max(
                      0,
                      Math.min(daysBeforeMax, Math.trunc(Number(event.target.value) || 0)),
                    ),
                  },
                })
          }
        />
      </Field>
      <Field label="At">
        <Input
          type="time"
          disabled={schedule === undefined}
          value={schedule?.time ?? "09:00"}
          onChange={(event) =>
            schedule === undefined || !/^\d{2}:\d{2}$/.test(event.target.value)
              ? undefined
              : onChange({ ...doc, schedule: { ...schedule, time: event.target.value } })
          }
        />
      </Field>
    </div>
  );
}
