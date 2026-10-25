import type { PlayDraftDocument } from "@app/slices/play-drafts/model.js";
import { templateNameMax } from "@app/slices/project-templates/schema.js";
import type { TemplateSection } from "@app/slices/template-studio/model.js";
import type { ReactElement } from "react";
import { Field, Input } from "@/components/kit/field";

// What only a template has, beside Create's own editors (fine-tune.tsx): its name and the title
// every video fills, first in Title and keywords, and how long each article is planned to be,
// after the Article editor (Create asks it beside its Make button, in the same words).
export function TemplateFields({
  section,
  document,
  name,
  onEdit,
  onName,
}: {
  readonly section: TemplateSection;
  readonly document: PlayDraftDocument;
  // The template's name as typed, saved with the next Save.
  readonly name: string;
  readonly onEdit: (document: PlayDraftDocument) => void;
  readonly onName: (name: string) => void;
}): ReactElement | null {
  const { form } = document;
  if (section === "subject")
    return (
      <div data-slot="studio-controls" className="sl-fields">
        <Field label="Template name">
          <Input
            value={name}
            maxLength={templateNameMax}
            onChange={(event) => onName(event.target.value)}
          />
        </Field>
        <Field label="Video title" help="{{Topic}} is filled with each video's topic.">
          <Input
            value={form.title}
            maxLength={200}
            onChange={(event) =>
              onEdit({ ...document, form: { ...form, title: event.target.value } })
            }
          />
        </Field>
      </div>
    );
  if (section === "script" && form.sources.article === "generate")
    return (
      <div data-slot="studio-controls" className="sl-fields">
        <Field
          label="Words per video"
          help="About 150 words is one minute. The article prompt decides the real length."
        >
          <Input
            inputMode="numeric"
            className="sl-input--number"
            value={document.expectedWords}
            onChange={(event) => onEdit({ ...document, expectedWords: event.target.value })}
          />
        </Field>
      </div>
    );
  return null;
}
