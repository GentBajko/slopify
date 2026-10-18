import type { ModelKey } from "@app/slices/model-checks/model.js";
import type { TemplateSection } from "@app/slices/template-studio/model.js";
import { useQuery } from "@tanstack/react-query";
import { type ReactElement, useState } from "react";
import { useApp } from "@/app-context";
import { Button } from "@/components/kit/button";
import { Drawer } from "@/components/kit/drawer";
import { ButtonLink } from "@/components/kit/link";
import { List, ListRow } from "@/components/kit/list-row";
import { templatesQuery } from "@/templates/api";

// Settings → Models → New for you → Compare on a sample: pick a template, and its studio opens
// with Compare models ready for this model in the section the model makes.

const sectionOf: Readonly<Record<ModelKey["family"], TemplateSection>> = {
  llm: "script",
  tts: "voice",
  image: "pictures",
};

export function CompareOnSample({
  model,
}: {
  readonly model: ModelKey & { readonly name: string };
}): ReactElement {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        size="small"
        variant="secondary"
        aria-label={`Compare ${model.name} on a sample`}
        onClick={() => setOpen(true)}
      >
        Compare on a sample
      </Button>
      {open ? <PickTemplate model={model} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function PickTemplate({
  model,
  onClose,
}: {
  readonly model: ModelKey & { readonly name: string };
  readonly onClose: () => void;
}): ReactElement {
  const { api } = useApp();
  const templates = useQuery(templatesQuery(api));
  const section = sectionOf[model.family];
  return (
    <Drawer open onClose={onClose} title={`Compare ${model.name} on a sample`} width="narrow">
      <div className="flex flex-col gap-3">
        <p className="m-0 text-small text-ink-2">
          {`Pick the template whose sample to compare it on. Its studio opens with Compare models ready, beside the model the template uses now; nothing is spent until you press Compare there.${model.family === "tts" ? " Voice models are compared within the template's voice provider." : ""}`}
        </p>
        {templates.error ? (
          <p role="alert" className="m-0 text-body text-danger">
            {`Your templates didn't load: ${templates.error.message} Close this and press Compare on a sample again.`}
          </p>
        ) : templates.data === undefined ? (
          <p className="m-0 text-small text-ink-2">Loading your templates…</p>
        ) : templates.data.length === 0 ? (
          <p className="m-0 text-small text-ink-2">
            No templates yet. Save a setup in Library → Templates, make its sample, then compare.
          </p>
        ) : (
          <List label="Templates to compare on">
            {templates.data.map((template) => (
              <ListRow
                key={template.id}
                title={template.name}
                meta={`Version ${String(template.version)}`}
                actions={
                  <ButtonLink
                    to="/templates/$templateId"
                    params={{ templateId: template.id }}
                    search={{ section, compareProvider: model.provider, compareModel: model.model }}
                    size="small"
                    aria-label={`Compare on ${template.name}`}
                  >
                    Compare here
                  </ButtonLink>
                }
              />
            ))}
          </List>
        )}
      </div>
    </Drawer>
  );
}
