import { designFields } from "@app/slices/designs/fields.js";
import { daysBeforeMax } from "@app/slices/designs/model.js";
import type { DesignDocument } from "@app/slices/designs/schema.js";
import { type ReactElement, useState } from "react";
import { useApp } from "@/app-context";
import { Callout } from "@/components/kit/callout";
import { Field, Input, Select, Textarea } from "@/components/kit/field";
import { Fold } from "@/components/kit/fold";
import { Switch } from "@/components/kit/switch";
import { uploadPicture } from "../api";
import { aiTextWarning } from "../design-panels";
import { FormatsFields } from "../formats-fields";
import { MadeWith } from "../made-with";
import { NamedChoice, TextLayoutFields, ValueFields } from "../text-fields";

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
      <NamedChoice
        label="Artwork"
        help="The AI draws a new paid picture for each poster; your own picture costs nothing."
        value={picture.source}
        options={[
          { value: "generate", label: "The AI draws it for each poster" },
          { value: "picture", label: "My own picture" },
        ]}
        onChange={(source) => onChange({ ...doc, picture: { ...picture, source } })}
      />
      {picture.source === "generate" ? (
        <>
          <Field
            label="Describe the artwork"
            help="Keywords such as {{Event}} are filled for each poster. Describe the picture only: Slopify adds the words."
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
          label="The picture every poster uses"
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
        help="They draw the sample. A schedule fills each poster from its own row."
        fields={fields}
        values={doc.samples}
        dateField={doc.schedule?.dateField}
        onChange={(samples) => onChange({ ...doc, samples })}
      />
      <Fold summary="Text drawn by the AI" state={doc.picture.aiText ? "On" : "Off"}>
        <div className="flex flex-col gap-3">
          <Switch
            label="Let the AI draw the text"
            help="The AI paints your lines into the picture, instead of Slopify setting them in real fonts."
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
  // Days ahead and At set when a schedule makes each poster: with No schedule they are left out.
  return (
    <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-3">
      <Field
        label="Each poster's date is in"
        help="A schedule makes each row's poster ahead of that date. No schedule: you make them by hand."
      >
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
      {schedule === undefined ? null : (
        <>
          <Field label="Days ahead" help="0 makes each poster on its date.">
            <Input
              type="number"
              min={0}
              max={daysBeforeMax}
              value={schedule.daysBefore}
              onChange={(event) =>
                onChange({
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
          <Field label="At" help="This computer's time, while Slopify is open.">
            <Input
              type="time"
              value={schedule.time}
              onChange={(event) =>
                /^\d{2}:\d{2}$/.test(event.target.value)
                  ? onChange({ ...doc, schedule: { ...schedule, time: event.target.value } })
                  : undefined
              }
            />
          </Field>
        </>
      )}
    </div>
  );
}
