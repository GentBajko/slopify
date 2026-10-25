import { designFields } from "@app/slices/designs/fields.js";
import type { DesignView } from "@app/slices/designs/model.js";
import type { DesignDocument } from "@app/slices/designs/schema.js";
import { useQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useApp } from "@/app-context";
import { Button } from "@/components/kit/button";
import { Callout } from "@/components/kit/callout";
import { Field, Select } from "@/components/kit/field";
import { FileLink } from "@/components/kit/link";
import { SectionHead } from "@/components/kit/section-head";
import { Switch } from "@/components/kit/switch";
import { projectsQuery } from "@/queries";
import { designFileUrl, stepPictureUrl } from "./api";
import { headStep } from "./design-picture";
import { formatName, pdfFormats } from "./document";
import { FormatsFields } from "./formats-fields";
import { TextLayoutFields, ValueFields } from "./text-fields";

// The design page's Text and Formats tabs. A picture edit has neither until it is turned into
// a designed piece, which gives it Slopify's text layer and formats; nothing about the picture
// changes.

export const aiTextWarning =
  "The AI may misspell names, dates and prices. Check every word before you print.";

export function TextPanel({
  design,
  doc,
  values,
  onDoc,
  onValues,
  onTurnIntoDesign,
}: {
  readonly design: DesignView;
  readonly doc: DesignDocument | undefined;
  readonly values: Readonly<Record<string, string>>;
  readonly onDoc: (next: DesignDocument) => void;
  readonly onValues: (next: Readonly<Record<string, string>>) => void;
  readonly onTurnIntoDesign: () => void;
}): ReactElement {
  if (doc === undefined)
    return (
      <Callout
        title="Add your own text on top"
        actions={
          <Button onClick={onTurnIntoDesign} disabled={headStep(design) === undefined}>
            Turn into a designed piece
          </Button>
        }
      >
        Slopify lays out your words on this picture in real fonts, in every format you choose.
      </Callout>
    );
  const fields = designFields(doc);
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <Switch
        label="Let the AI draw the text"
        tip="library.design.ai-text"
        checked={doc.picture.aiText}
        onChange={(aiText) => onDoc({ ...doc, picture: { ...doc.picture, aiText } })}
      />
      {doc.picture.aiText ? (
        <Callout tone="waiting" title={aiTextWarning}>
          Slopify's own text is off while the AI draws it. Write the words into the picture's
          description, then make the artwork again.
        </Callout>
      ) : null}
      <TextLayoutFields
        text={doc.text}
        disabled={doc.picture.aiText}
        onChange={(text) => onDoc({ ...doc, text })}
      />
      <ValueFields
        label="Keywords"
        tip="library.design.values"
        fields={fields}
        values={values}
        dateField={doc.schedule?.dateField}
        onChange={onValues}
      />
    </div>
  );
}

export function FormatsPanel({
  design,
  doc,
  dirty,
  onDoc,
  onProject,
  onTurnIntoDesign,
}: {
  readonly design: DesignView;
  readonly doc: DesignDocument | undefined;
  // Unsaved changes: the downloads wait for them, so a file is never of an older version.
  readonly dirty: boolean;
  readonly onDoc: (next: DesignDocument) => void;
  readonly onProject: (projectId: string | null) => void;
  readonly onTurnIntoDesign: () => void;
}): ReactElement {
  const { api } = useApp();
  const projects = useQuery(projectsQuery(api));
  const head = headStep(design);
  const ready = head?.state === "ready";
  return (
    <div className="flex min-w-0 flex-col gap-5">
      {doc === undefined ? (
        <>
          <div className="flex flex-wrap gap-2">
            {head?.sha256 == null ? null : (
              <FileLink href={stepPictureUrl(api, design.id, head.id)} download variant="primary">
                Download this version
              </FileLink>
            )}
          </div>
          <Callout
            title="Posters, flyers and social sizes"
            actions={<Button onClick={onTurnIntoDesign}>Turn into a designed piece</Button>}
          >
            A designed piece is drawn in A4, A3, A5 and the social sizes from this one picture.
          </Callout>
        </>
      ) : (
        <>
          <FormatsFields doc={doc} onChange={onDoc} />
          <div className="flex min-w-0 flex-col gap-2">
            <SectionHead as="h3" size="small" title="Download" />
            {doc.formats.map((one) => (
              <div key={one.format} className="flex min-w-0 flex-wrap items-center gap-2">
                <span className="min-w-[8rem] text-small font-semibold">
                  {formatName(one.format)}
                </span>
                {one.format === "brochure" ? null : (
                  <DownloadLink
                    href={designFileUrl(api, design.id, one.format, "png", design.updatedAt)}
                    label={`Download ${formatName(one.format)} PNG`}
                    disabled={!ready || dirty}
                  >
                    PNG
                  </DownloadLink>
                )}
                {pdfFormats.includes(one.format) ? (
                  <DownloadLink
                    href={designFileUrl(api, design.id, one.format, "pdf", design.updatedAt)}
                    label={`Download ${formatName(one.format)} PDF`}
                    disabled={!ready || dirty}
                  >
                    PDF
                  </DownloadLink>
                ) : null}
              </div>
            ))}
            {ready ? null : (
              <p className="m-0 text-small text-ink-2">The downloads wait for the picture.</p>
            )}
          </div>
        </>
      )}
      <Field
        label="Keep in project"
        help="Linked only: nothing is added to the project's video."
        tip="library.design.project"
      >
        <Select
          value={design.projectId ?? ""}
          onChange={(event) => onProject(event.target.value === "" ? null : event.target.value)}
          options={[
            { value: "", label: "No project" },
            ...(projects.data?.projects ?? []).map((project) => ({
              value: project.id,
              label: project.title,
            })),
            ...(design.projectId !== null &&
            !(projects.data?.projects ?? []).some((project) => project.id === design.projectId)
              ? [{ value: design.projectId, label: "A project not listed" }]
              : []),
          ]}
        />
      </Field>
    </div>
  );
}

// A download is a link; while the picture or a change is still on its way it shows as a
// button that says why it waits.
function DownloadLink({
  href,
  label,
  disabled,
  children,
}: {
  readonly href: string;
  readonly label: string;
  readonly disabled: boolean;
  readonly children: string;
}): ReactElement {
  return disabled ? (
    <Button
      size="small"
      disabled
      focusableWhenDisabled
      disabledReason="Wait for the picture and your last change to be saved."
      aria-label={label}
    >
      {children}
    </Button>
  ) : (
    <FileLink href={href} download size="small" aria-label={label}>
      {children}
    </FileLink>
  );
}
