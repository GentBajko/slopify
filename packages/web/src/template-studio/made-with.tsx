import type { PlayDraftDocument } from "@app/slices/play-drafts/model.js";
import type { ProviderChoices } from "@app/slices/project-templates/provider-defaults.js";
import { sectionLabel, type TemplateSection } from "@app/slices/template-studio/model.js";
import { useQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useApp } from "@/app-context";
import { TextLink } from "@/components/kit/link";
import { readFirstRun, upkeepKeys } from "@/components/provider-upkeep-api";
import { modelsQuery } from "@/lib/models";
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

// A service and its model by the names its pickers show, the way Create says them:
// "fal.ai (FLUX.2)", "Claude Code CLI (Sonnet 5.5)". Ids only until the lists answer.
function useServiceName(choice: { readonly provider: string; readonly model: string }): {
  readonly name: string;
  readonly service: string;
  readonly unusable: string | undefined;
} {
  const { api } = useApp();
  const providers = useQuery(providersQuery(api));
  const models = useQuery({
    ...modelsQuery(api, choice.provider),
    enabled: choice.provider !== "",
  });
  const status = providers.data?.providers.find((one) => one.id === choice.provider);
  const service = status?.displayName ?? choice.provider;
  const model =
    choice.model === ""
      ? undefined
      : (models.data?.models.find((one) => one.id === choice.model)?.name ?? choice.model);
  return {
    name: model === undefined ? service : `${service} (${model})`,
    service,
    unusable: status === undefined ? undefined : providerUnavailableLabel(status.readiness),
  };
}

// The writer or image service nobody saved with the template, shown by its pickers as this
// computer's default: one line says so, since the pickers alone would read as saved.
export function StandIn({
  section,
  document,
}: {
  readonly section: TemplateSection;
  readonly document: PlayDraftDocument;
}): ReactElement | null {
  const defaults = useProviderDefaults();
  const { form } = document;
  const kind =
    section === "script" && form.sources.article === "generate" && form.llm.provider === ""
      ? "llm"
      : section === "pictures" && form.sources.images === "generate" && form.images.provider === ""
        ? "images"
        : undefined;
  const choice = kind === undefined ? undefined : defaults[kind];
  const { name } = useServiceName(choice ?? { provider: "", model: "" });
  if (kind === undefined || choice === undefined) return null;
  return (
    <p className="m-0 text-small text-ink-2">
      {kind === "llm"
        ? `Each video is written by your default, ${name}: no writer is saved with this template yet.`
        : `Each video's images are made by your default, ${name}: no image service is saved with this template yet.`}
    </p>
  );
}

// "Thumbnail by fal.ai (FLUX.2) · Change it in Images": a thumbnail drawn while the video has
// images of its own is drawn by the images' service, which is changed in Images. Nothing chosen
// is said in red, in the words the checks use, so the section and the list agree.
export function MadeWith({
  templateId,
  document,
}: {
  readonly templateId: string;
  readonly document: PlayDraftDocument;
}): ReactElement | null {
  const defaults = useProviderDefaults();
  const { form } = document;
  const own = form.images;
  const choice = own.provider === "" ? (defaults.images ?? own) : own;
  const { name, service, unusable } = useServiceName(choice);
  const drawn =
    form.sources.thumbnail === "from_prompt" || form.sources.thumbnail === "prompt_by_llm";
  if (!drawn || form.sources.images !== "generate") return null;
  const none = choice.provider === "";
  return (
    <p
      className={cn(
        "m-0 flex flex-wrap items-center gap-x-2 text-small",
        none || unusable !== undefined ? "text-danger" : "text-ink-2",
      )}
    >
      {none
        ? "No image service is chosen, so a run can't start."
        : `Thumbnail by ${name}${own.provider === "" ? " (your default)" : ""}${unusable === undefined ? "" : ` (${service}: ${unusable.toLowerCase()})`}`}
      <TextLink
        to="/templates/$templateId"
        params={{ templateId }}
        search={{ section: "pictures" }}
        className="text-small"
      >
        {`${none ? "Choose one" : "Change it"} in ${sectionLabel.pictures}`}
      </TextLink>
    </p>
  );
}
