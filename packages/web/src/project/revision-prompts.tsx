import { usesNarrationPreparation, valueMax } from "@app/slices/admission/rules.js";
import { detectSlots } from "@app/slices/admission/substitute.js";
import type { RevisionEdit } from "@app/slices/revisions/model.js";
import { useId } from "react";
import type { Entry, Prompt } from "@/api";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Picker } from "@/components/ui/picker";
import { editOfForm, setPrompt } from "./revision-form-state.js";
export function RevisionPrompts({
  edit,
  prompts,
  entries,
  onChange,
}: {
  readonly edit: RevisionEdit;
  readonly prompts: readonly Prompt[];
  readonly entries: readonly Entry[];
  readonly onChange: (edit: RevisionEdit) => void;
}): import("react").ReactElement {
  const formId = useId();
  const keys = [
    ...new Set([
      ...Object.keys(edit.config.rendered),
      ...Object.keys(edit.content.promptTemplates),
      ...(edit.config.sources.article === "generate" ? ["article"] : []),
      ...(usesNarrationPreparation(edit.config) ? ["narration"] : []),
      ...(["from_prompt", "prompt_by_llm"].includes(edit.config.sources.thumbnail)
        ? ["thumbnailPrompt"]
        : []),
      ...(edit.config.intro === undefined ? [] : ["intro"]),
      ...(edit.config.outro === undefined ? [] : ["outro"]),
    ]),
  ];
  const slots = [
    ...new Set([
      ...Object.keys(edit.config.values),
      ...Object.values(edit.content.promptTemplates).flatMap((raw) =>
        raw === null ? [] : detectSlots(raw).names,
      ),
    ]),
  ];
  return (
    <section aria-label="Prompt snapshots" className="space-y-3">
      {keys.map((key) => {
        const label = promptLabel(key);
        const raw = edit.content.promptTemplates[key] ?? null;
        const options =
          key === "intro" || key === "outro"
            ? entries.filter((entry) => entry.category === key)
            : prompts.filter(
                (prompt) =>
                  prompt.kind ===
                  (key === "article"
                    ? "article"
                    : key === "narration"
                      ? "narration"
                      : key === "thumbnailPrompt"
                        ? "thumbnail"
                        : "image"),
              );
        return (
          <fieldset key={key} className="min-w-0 space-y-3 rounded-control border border-line p-3">
            <legend className="px-1 text-small font-semibold">{label}</legend>
            {raw === null ? (
              <div className="space-y-2">
                <p>
                  Original template unavailable. The saved rendered prompt stays frozen until you
                  choose or write a template.
                </p>
                <Button
                  type="button"
                  aria-label={`Use saved wording as template for ${label}`}
                  onClick={() => onChange(setPrompt(edit, key, edit.config.rendered[key] ?? ""))}
                >
                  Use saved wording as template
                </Button>
              </div>
            ) : null}
            <label
              htmlFor={`${formId}-library-${key}`}
              className="flex min-w-0 flex-col gap-1 text-small"
            >
              Use saved template for {label}
              <Picker
                id={`${formId}-library-${key}`}
                value=""
                onChange={(event) => {
                  const picked = options.find((option) => option.id === event.target.value);
                  if (picked === undefined) return;
                  const next = setPrompt(edit, key, picked.body);
                  const config =
                    "category" in picked
                      ? {
                          ...next.config,
                          [picked.category]: { name: picked.name, mode: picked.mode },
                        }
                      : key === "article"
                        ? { ...next.config, articlePrompt: picked.name }
                        : key === "narration"
                          ? { ...next.config, narrationPrompt: picked.name }
                          : key === "thumbnailPrompt"
                            ? { ...next.config, thumbnailPrompt: picked.name }
                            : next.config;
                  onChange({ ...next, config });
                }}
              >
                <option value="">Choose explicitly</option>
                {options.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name}
                  </option>
                ))}
              </Picker>
            </label>
            <label htmlFor={`${formId}-raw-${key}`} className="block space-y-1 text-small">
              Raw prompt for {label}
              <Textarea
                id={`${formId}-raw-${key}`}
                rows={4}
                value={raw ?? ""}
                onChange={(event) => onChange(setPrompt(edit, key, event.target.value))}
              />
            </label>
            <details>
              <summary>Saved rendered prompt</summary>
              <pre className="whitespace-pre-wrap break-words">
                {edit.config.rendered[key] ?? ""}
              </pre>
            </details>
          </fieldset>
        );
      })}
      {slots.map((name) => (
        <label
          htmlFor={`${formId}-keyword-${name}`}
          key={name}
          className="block space-y-1 text-small"
        >
          Keyword {name}
          <Input
            id={`${formId}-keyword-${name}`}
            maxLength={valueMax}
            value={edit.config.values[name] ?? ""}
            onChange={(event) =>
              onChange(
                editOfForm({
                  ...edit,
                  config: {
                    ...edit.config,
                    values: { ...edit.config.values, [name]: event.target.value },
                  },
                }),
              )
            }
          />
        </label>
      ))}
    </section>
  );
}

function promptLabel(key: string): string {
  if (key === "article") return "Article";
  if (key === "narration") return "Narration Preparation";
  if (key === "thumbnailPrompt") return "Thumbnail";
  if (key === "intro") return "Intro";
  if (key === "outro") return "Outro";
  const image = /^imagePrompts\.(\d+)$/.exec(key);
  if (image?.[1] !== undefined) return `Image prompt ${Number(image[1]) + 1}`;
  return key.replace(/[._-]/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2");
}
