import { useQuery } from "@tanstack/react-query";
import { type ReactElement, useState } from "react";
import { useApp } from "@/app-context";
import { Button } from "@/components/kit/button";
import { Drawer } from "@/components/kit/drawer";
import { TextLink } from "@/components/kit/link";
import { modelsQuery } from "@/lib/models";
import { providerUnavailableLabel } from "@/lib/provider-status";
import { ModelPicker, ProviderPicker } from "@/play/pickers";
import { providersQuery } from "@/queries";

// "Made with FLUX.2 on fal.ai · Change": the image service and model a paid picture uses, one
// line, with the pickers behind it in a drawer. A service this computer can't use yet says so
// on the line, with the way to its key, before anything is pressed.
export function MadeWith({
  provider,
  model,
  onChange,
  disabled = false,
}: {
  readonly provider: string;
  readonly model: string;
  readonly onChange: (next: { readonly provider: string; readonly model: string }) => void;
  readonly disabled?: boolean;
}): ReactElement {
  const { api } = useApp();
  const [open, setOpen] = useState(false);
  const providers = useQuery(providersQuery(api));
  const models = useQuery(modelsQuery(api, provider));
  const status = providers.data?.providers.find((one) => one.id === provider);
  const providerName = status?.displayName ?? provider;
  const modelName = models.data?.models.find((one) => one.id === model)?.name ?? model;
  const refusal = status === undefined ? undefined : providerUnavailableLabel(status.readiness);
  return (
    <>
      <span
        data-setting="made-with"
        className="inline-flex min-w-0 flex-wrap items-center gap-x-1 text-small text-ink-2"
      >
        <span className="min-w-0 truncate">{`Made with ${modelName} on ${providerName}`}</span>
        <span aria-hidden="true">·</span>
        <Button variant="quiet" size="small" disabled={disabled} onClick={() => setOpen(true)}>
          Change
        </Button>
      </span>
      {refusal === undefined ? null : (
        <span className="text-small text-danger">
          {refusal === "No key" ? `${providerName} has no key yet` : `${providerName}: ${refusal}`}
          {" · "}
          <TextLink to="/settings" search={{ section: "providers", family: "image" }}>
            Add an image key ↗
          </TextLink>
        </span>
      )}
      <Drawer
        open={open}
        title="Image service and model"
        width="narrow"
        onClose={() => setOpen(false)}
        footer={
          <Button variant="primary" onClick={() => setOpen(false)}>
            Done
          </Button>
        }
      >
        <div className="flex flex-col gap-4">
          <ProviderPicker
            label="Service"
            family="image"
            providers={providers.data?.providers ?? []}
            value={provider}
            problem={undefined}
            onPick={(next) => onChange({ provider: next, model: "" })}
          />
          <ModelPicker
            label="Model"
            provider={provider}
            value={model}
            problem={model === "" ? "Choose a model." : undefined}
            onPick={(next) => onChange({ provider, model: next })}
          />
          <p className="m-0 text-small text-ink-2">
            To change a picture you upload, choose a model that can edit pictures: Codex CLI,
            OpenAI, Google, or FLUX.2 or Nano Banana 2 on fal.ai.
          </p>
        </div>
      </Drawer>
    </>
  );
}
