import type { PlayDraftDocument } from "@app/slices/play-drafts/model.js";
import type { TemplateSection } from "@app/slices/template-studio/model.js";
import { useQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useApp } from "@/app-context";
import { Button } from "@/components/kit/button";
import { providersQuery } from "@/queries";

// "Made with OpenRouter · claude-sonnet · change": the provider behind a section in one line,
// its change in Fine-tune.
export function MadeWith({
  section,
  document,
  onChange,
}: {
  readonly section: TemplateSection;
  readonly document: PlayDraftDocument;
  readonly onChange: () => void;
}): ReactElement | null {
  const { api } = useApp();
  const providers = useQuery(providersQuery(api));
  const choice = choiceOf(section, document.form);
  if (choice === undefined) return null;
  const name =
    providers.data?.providers.find((one) => one.id === choice.provider)?.displayName ??
    choice.provider;
  const parts = [name, choice.model, choice.voice].filter(
    (part): part is string => part !== undefined && part !== "",
  );
  return (
    <p className="m-0 flex flex-wrap items-center gap-x-2 text-small text-ink-2">
      {parts.length === 0 ? "Nothing chosen to make it with yet" : `Made with ${parts.join(" · ")}`}
      <Button variant="quiet" size="small" onClick={onChange}>
        {parts.length === 0 ? "Choose" : "Change"}
      </Button>
    </p>
  );
}

function choiceOf(
  section: TemplateSection,
  form: PlayDraftDocument["form"],
): { readonly provider: string; readonly model: string; readonly voice?: string } | undefined {
  switch (section) {
    case "subject":
      return form.sources.research === "off" ? undefined : form.llm;
    case "script":
      return form.sources.article === "generate" ? form.llm : undefined;
    case "voice":
      return form.sources.audio === "generate" ? form.audio : undefined;
    case "pictures":
      return form.sources.images === "generate" ? form.images : undefined;
    case "thumbnail":
      return form.sources.thumbnail === "from_prompt" || form.sources.thumbnail === "prompt_by_llm"
        ? form.images
        : undefined;
    case "reviews":
      return form.reviews === undefined || form.reviews.reviewer === "agent"
        ? undefined
        : form.reviews;
    default:
      return undefined;
  }
}
