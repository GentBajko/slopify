import type { ProviderChoice } from "@app/slices/admission/model.js";
import { useQuery } from "@tanstack/react-query";
import { useApp } from "@/app-context";
import type { HelpId } from "@/help/catalog";
import { modelsQuery } from "@/lib/models";
import { OptionPicker } from "./pickers";

// A thinking level in words: "Extra high" rather than the service's "xhigh".
const levelWords: Readonly<Record<string, string>> = {
  off: "Off",
  low: "Low",
  medium: "Medium",
  high: "High",
  xhigh: "Extra high",
  max: "Maximum",
  ultra: "Ultra",
};

export function thinkingLabel(mode: string): string {
  return levelWords[mode] ?? `${mode.charAt(0).toUpperCase()}${mode.slice(1)}`;
}

// The text model's Thinking, and the same control for images as Effort: the Codex CLI's
// reasoning effort for the image agent. Drawn only when the chosen model lists modes, so an
// image model without an effort setting shows nothing.
export function ThinkingPicker({
  choice,
  onChange,
  field = "llm.thinking",
  label = "Thinking",
  tip = "play.llm.thinking",
  problem,
}: {
  readonly choice: ProviderChoice;
  readonly onChange: (choice: ProviderChoice) => void;
  readonly field?: string;
  readonly label?: string;
  readonly tip?: HelpId;
  // A sentence the rule or the server said about this control.
  readonly problem?: string | undefined;
}) {
  const { api } = useApp();
  const models = useQuery(modelsQuery(api, choice.provider));
  const modes = models.data?.models.find((m) => m.id === choice.model)?.thinkingModes ?? [];
  if (!modes.length && !choice.thinking) return null;
  const noun = label === "Thinking" ? "thinking level" : label.toLowerCase();
  return (
    <div className="min-w-0">
      <OptionPicker
        field={field}
        label={label}
        tip={tip}
        // The empty first entry is the model's own default: no second "default" entry.
        value={choice.thinking ?? ""}
        placeholder="Model default"
        problem={
          choice.thinking && !modes.includes(choice.thinking)
            ? `Choose a supported ${noun}.`
            : problem
        }
        options={[
          ...(choice.thinking && !modes.includes(choice.thinking)
            ? [
                {
                  value: choice.thinking,
                  label: `${thinkingLabel(choice.thinking)} (saved level)`,
                },
              ]
            : []),
          ...modes.map((mode) => ({ value: mode, label: thinkingLabel(mode) })),
        ]}
        onPick={(value) => {
          const thinking = modes.find((mode) => mode === value);
          const { thinking: _old, ...rest } = choice;
          onChange(thinking === undefined ? rest : { ...rest, thinking });
        }}
      />
    </div>
  );
}
