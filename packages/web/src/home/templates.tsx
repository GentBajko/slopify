import { type ReactElement, useState } from "react";
import { Button } from "@/components/kit/button";
import { TextLink } from "@/components/kit/link";
import { SectionHead } from "@/components/kit/section-head";
import { useToast } from "@/components/kit/toast";
import { shortDate } from "@/lib/utils";
import type { TemplateSummary } from "@/templates/api";
import { useTemplateActions } from "@/templates/use-template-actions";

// How Home hands a template to Create: the open draft is saved first, the template becomes a
// fresh draft, and Create opens on it with the template picked. The router passes the Play
// session's own hooks, as Templates does.
export interface TemplateStart {
  readonly onApplied: (draftId: string, isCurrent: () => boolean) => unknown | Promise<unknown>;
  readonly beforeApply?: () => Promise<boolean>;
  readonly getGeneration?: () => number;
  readonly blocked: boolean;
}

const shownTemplates = 4;

// Home's "Start from a template": the templates changed most recently, each with Make a video,
// which opens Create with it picked so a topic is all that is left to type.
export function StartFromTemplate({
  templates,
  start,
}: {
  // The channel's templates.
  readonly templates: readonly TemplateSummary[];
  readonly start: TemplateStart;
}): ReactElement | null {
  const notify = useToast();
  const [opening, setOpening] = useState<string | undefined>(undefined);
  const { apply } = useTemplateActions(start);
  if (templates.length === 0) return null;
  const shown = templates
    .toSorted((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, shownTemplates);
  const make = async (template: TemplateSummary): Promise<void> => {
    if (opening !== undefined) return;
    setOpening(template.id);
    try {
      await apply(template);
    } catch (error) {
      notify(
        `${template.name} didn't open in Create: ${error instanceof Error ? error.message : String(error)}`,
        "error",
      );
    } finally {
      setOpening(undefined);
    }
  };
  return (
    <section aria-label="Start from a template" className="flex flex-col gap-2">
      <SectionHead title="Start from a template">
        {templates.length > shown.length ? (
          <TextLink to="/templates">{`See all ${String(templates.length)}`}</TextLink>
        ) : null}
      </SectionHead>
      <ul aria-label="Templates" className="sl-home-list m-0 list-none p-0">
        {shown.map((template) => (
          <li key={template.id} className="sl-home-item sl-home-item--plain">
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="sl-row__title">{template.name}</span>
              {Number.isNaN(Date.parse(template.updatedAt)) ? null : (
                <span className="text-small text-ink-2">{`Changed ${shortDate(template.updatedAt)}`}</span>
              )}
            </div>
            <Button
              size="small"
              aria-label={`Make a video with ${template.name}`}
              disabled={start.blocked || opening !== undefined}
              disabledReason={
                start.blocked ? "Create is starting a run. Wait for it to start." : "Opening…"
              }
              onClick={() => void make(template)}
            >
              {opening === template.id ? "Opening…" : "Make a video"}
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
