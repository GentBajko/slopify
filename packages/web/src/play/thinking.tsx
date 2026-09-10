import type { ProviderChoice } from "@app/slices/admission/model.js";
import { useQuery } from "@tanstack/react-query";
import { useApp } from "@/app-context";
import { modelsQuery } from "@/lib/models";
import { OptionPicker } from "./pickers";
export function ThinkingPicker({
  choice,
  onChange,
}: {
  readonly choice: ProviderChoice;
  readonly onChange: (choice: ProviderChoice) => void;
}) {
  const { api } = useApp();
  const models = useQuery(modelsQuery(api, choice.provider));
  const modes = models.data?.models.find((m) => m.id === choice.model)?.thinkingModes ?? [];
  if (!modes.length && !choice.thinking) return null;
  return (
    <div className="min-w-0">
      <OptionPicker
        label="Thinking"
        value={choice.thinking ?? "default"}
        placeholder="Model default"
        problem={
          choice.thinking && !modes.includes(choice.thinking)
            ? "Choose a supported thinking level."
            : undefined
        }
        options={[
          { value: "default", label: "Model default" },
          ...modes.map((mode) => ({
            value: mode,
            label: mode === "off" ? "Off" : mode.charAt(0).toUpperCase() + mode.slice(1),
          })),
        ]}
        onPick={(value) => {
          const thinking = modes.find((mode) => mode === value);
          onChange({ ...choice, thinking });
        }}
      />
      {modes.length && !modes.includes("off") ? (
        <p className="mt-1 text-small text-ink3">
          This model does not support turning thinking off.
        </p>
      ) : null}
    </div>
  );
}
