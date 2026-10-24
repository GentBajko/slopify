import type { PlayDraftDocument } from "@app/slices/play-drafts/model.js";
import {
  type ProviderChoices,
  withProviderDefaults,
} from "@app/slices/project-templates/provider-defaults.js";
import { sectionLabel, type TemplateSection } from "@app/slices/template-studio/model.js";
import { useQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useApp } from "@/app-context";
import { Button } from "@/components/kit/button";
import { TextLink } from "@/components/kit/link";
import { readFirstRun, upkeepKeys } from "@/components/provider-upkeep-api";
import { providerUnavailableLabel } from "@/lib/provider-status";
import { cn } from "@/lib/utils";
import { providersQuery } from "@/queries";

// The writer and image service this computer picks for a setup nobody chose them in, the same
// ones every run of the template gets (`project-templates/provider-defaults.ts`). Empty until
// read, and on a computer where the first launch found nothing.
export function useProviderDefaults(): ProviderChoices {
  const { api } = useApp();
  const status = useQuery({
    queryKey: upkeepKeys.firstRun,
    queryFn: () => readFirstRun(api),
    retry: false,
    staleTime: Number.POSITIVE_INFINITY,
  });
  return status.data?.defaults ?? {};
}

const lead: Partial<Readonly<Record<TemplateSection, string>>> = {
  script: "Written by",
  voice: "Read by",
  pictures: "Images by",
  thumbnail: "Thumbnail by",
};

const missingWhat: Partial<Readonly<Record<TemplateSection, string>>> = {
  script: "writing service",
  voice: "voice service",
  pictures: "image service",
  thumbnail: "image service",
};

// "Written by Claude Code CLI · sonnet (your default) · Change": who makes a section, in one
// line, its change under All … settings. Nothing chosen is said in red, in the words the
// checks use, so the section and the list agree. The thumbnail is drawn by the images' service
// while the video has images of its own: that one is changed in Images, so the line links there.
export function MadeWith({
  templateId,
  section,
  document,
  onChange,
}: {
  readonly templateId: string;
  readonly section: TemplateSection;
  readonly document: PlayDraftDocument;
  readonly onChange: () => void;
}): ReactElement | null {
  const { api } = useApp();
  const providers = useQuery(providersQuery(api));
  const defaults = useProviderDefaults();
  const filled = withProviderDefaults(document, defaults);
  const choice = choiceOf(section, filled.form);
  if (choice === undefined) return null;
  const own = choiceOf(section, document.form);
  const byDefault = own !== undefined && own.provider === "" && choice.provider !== "";
  const service = providers.data?.providers.find((one) => one.id === choice.provider);
  const name = service?.displayName ?? choice.provider;
  // A service this computer can't use yet says so in the line, as the checks do.
  const unusable = service === undefined ? undefined : providerUnavailableLabel(service.readiness);
  const parts = [choice.voice, name, choice.model].filter(
    (part): part is string => part !== undefined && part !== "",
  );
  const none = choice.provider === "";
  const inImages = section === "thumbnail" && document.form.sources.images === "generate";
  return (
    <p
      className={cn(
        "m-0 flex flex-wrap items-center gap-x-2 text-small",
        none || unusable !== undefined ? "text-danger" : "text-ink-2",
      )}
    >
      {none
        ? `No ${missingWhat[section] ?? "service"} is chosen, so a run can't start.`
        : `${lead[section] ?? "Made with"} ${parts.join(" · ")}${byDefault ? " (your default)" : ""}${unusable === undefined ? "" : ` (${name}: ${unusable.toLowerCase()})`}`}
      {inImages ? (
        <TextLink
          to="/templates/$templateId"
          params={{ templateId }}
          search={{ section: "pictures" }}
          className="text-small"
        >
          {`${none ? "Choose one" : "Change it"} in ${sectionLabel.pictures}`}
        </TextLink>
      ) : (
        <Button variant="quiet" size="small" onClick={onChange}>
          {none ? "Choose one" : "Change"}
        </Button>
      )}
    </p>
  );
}

function choiceOf(
  section: TemplateSection,
  form: PlayDraftDocument["form"],
): { readonly provider: string; readonly model: string; readonly voice?: string } | undefined {
  switch (section) {
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
    default:
      return undefined;
  }
}
