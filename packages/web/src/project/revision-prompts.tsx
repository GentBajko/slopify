import type { ImagePromptChoice } from "@app/slices/admission/model.js";
import {
  usesNarrationPreparation,
  usesReference,
  usesShorts,
  usesYoutubeDescription,
} from "@app/slices/admission/rules.js";
import { detectSlots, filledKeywords } from "@app/slices/admission/substitute.js";
import type { RevisionEdit } from "@app/slices/revisions/model.js";
import { usesScriptPrompt } from "@app/slices/voices/model.js";
import { useId, useState } from "react";
import type { Entry, Prompt } from "@/api";
import { KeywordList } from "@/components/keyword-list";
import { Button } from "@/components/kit/button";
import { Callout } from "@/components/kit/callout";
import { Field, Select, Textarea } from "@/components/kit/field";
import { editOfForm, setPrompt } from "./revision-form-state.js";
export function RevisionPrompts({
  edit,
  saved = edit.config.imagePrompts,
  prompts,
  entries,
  onChange,
}: {
  readonly edit: RevisionEdit;
  // The image prompts the project was saved with. Until saving, the image prompts' wording is
  // kept under their saved numbering (`imagePrompts.N`), whatever Images → Image prompts has
  // ticked since (`slices/revisions/image-plan.ts`).
  readonly saved?: readonly ImagePromptChoice[];
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
      ...(usesYoutubeDescription(edit.config) && edit.config.descriptionPrompt
        ? ["description"]
        : []),
      ...(usesShorts(edit.config) && edit.config.shorts?.prompt ? ["shorts"] : []),
      ...(usesShorts(edit.config) && edit.config.shorts?.imagePrompt ? ["shortsImage"] : []),
      ...(["from_prompt", "prompt_by_llm"].includes(edit.config.sources.thumbnail)
        ? ["thumbnailPrompt"]
        : []),
      ...(usesReference(edit.config) && edit.config.reference?.source === "prompt"
        ? ["referencePrompt"]
        : []),
      ...(edit.config.intro === undefined ? [] : ["intro"]),
      ...(edit.config.outro === undefined ? [] : ["outro"]),
    ]),
  ].filter((key) => {
    // An image prompt unticked under Images goes when the change is saved.
    const index = imageIndex(key);
    if (index === undefined) return true;
    const name = saved[index]?.name;
    return name === undefined || edit.config.imagePrompts.some((one) => one.name === name);
  });
  const added = edit.config.imagePrompts.filter(
    (one) => !saved.some((prompt) => prompt.name === one.name),
  );
  const label = (key: string) => promptLabel(key, saved);
  const slots = [
    ...new Set([
      ...Object.keys(edit.config.values),
      ...Object.values(edit.content.promptTemplates).flatMap((raw) =>
        raw === null ? [] : detectSlots(raw).names,
      ),
    ]),
    // Slopify writes each image's scene; it is not a keyword to fill in.
  ].filter((name) => !filledKeywords.includes(name));
  // What each keyword feeds, in the project's own copies of its prompts: the same list Play
  // and templates show.
  const feeds = (name: string): readonly string[] => [
    ...(detectSlots(edit.config.title).names.includes(name) ? ["Project title"] : []),
    ...Object.entries(edit.content.promptTemplates).flatMap(([key, raw]) =>
      raw !== null && detectSlots(raw).names.includes(name) ? [label(key)] : [],
    ),
  ];
  const topics = detectSlots(edit.config.title).names;
  return (
    <section aria-label="Prompt snapshots" className="space-y-6">
      {keys.map((key) => {
        const name = label(key);
        const raw = edit.content.promptTemplates[key] ?? null;
        const options =
          key === "intro" || key === "outro"
            ? entries.filter((entry) => entry.category === key)
            : prompts.filter(
                (prompt) =>
                  prompt.kind ===
                  (key === "article"
                    ? usesScriptPrompt(edit.config)
                      ? "script"
                      : "article"
                    : key === "narration"
                      ? "narration"
                      : key === "description"
                        ? "description"
                        : key === "shorts"
                          ? "shorts"
                          : key === "thumbnailPrompt"
                            ? "thumbnail"
                            : "image"),
              );
        return (
          <div
            key={key}
            className="min-w-0 space-y-4 border-t border-line pt-6 first:border-t-0 first:pt-0"
          >
            <h3 className="m-0 text-title-3">{name}</h3>
            {raw === null ? (
              <Callout
                tone="info"
                title="Original template unavailable"
                actions={
                  <Button
                    aria-label={`Use saved wording as template for ${name}`}
                    onClick={() => onChange(setPrompt(edit, key, edit.config.rendered[key] ?? ""))}
                  >
                    Use saved wording as template
                  </Button>
                }
              >
                The saved prompt below stays as it is until you choose or write a template.
              </Callout>
            ) : null}
            <LibraryChanged
              label={name}
              raw={raw}
              library={libraryPrompt(edit, key, options, saved)}
              onUse={(body) => onChange(setPrompt(edit, key, body))}
            />
            <Field
              label={`Use saved template for ${name}`}
              id={`${formId}-library-${key}`}
              tip="project.prompts.template"
            >
              <Select
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
                          : key === "description"
                            ? { ...next.config, descriptionPrompt: picked.name }
                            : (key === "shorts" || key === "shortsImage") &&
                                next.config.shorts !== undefined
                              ? {
                                  ...next.config,
                                  shorts: {
                                    ...next.config.shorts,
                                    [key === "shorts" ? "prompt" : "imagePrompt"]: picked.name,
                                  },
                                }
                              : key === "thumbnailPrompt"
                                ? { ...next.config, thumbnailPrompt: picked.name }
                                : key === "referencePrompt" && next.config.reference !== undefined
                                  ? {
                                      ...next.config,
                                      reference: { ...next.config.reference, prompt: picked.name },
                                    }
                                  : next.config;
                  onChange({ ...next, config });
                }}
              >
                <option value="">Choose a saved template</option>
                {options.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field
              label={`Raw prompt for ${name}`}
              id={`${formId}-raw-${key}`}
              tip="project.prompts.raw"
            >
              <Textarea
                rows={4}
                value={raw ?? ""}
                onChange={(event) => onChange(setPrompt(edit, key, event.target.value))}
              />
            </Field>
            <details>
              <summary className="text-small text-ink-2">Saved rendered prompt</summary>
              <pre className="m-0 mt-2 whitespace-pre-wrap break-words text-small">
                {edit.config.rendered[key] ?? ""}
              </pre>
            </details>
          </div>
        );
      })}
      {added.length === 0 ? null : (
        <p className="m-0 text-small text-ink-2">
          {added.map((one) => `"${one.name}"`).join(", ")}{" "}
          {added.length === 1 ? "uses its" : "use their"} Library wording. Save, then change it
          here.
        </p>
      )}
      {slots.length ? (
        <section aria-label="Keywords" className="space-y-3 pt-3">
          <h3 className="m-0 text-title-3">Keywords</h3>
          <KeywordList
            fieldPrefix="config.values"
            keywords={slots.map((name) => ({
              name,
              value: edit.config.values[name] ?? "",
              feeds: feeds(name),
              topic: topics.includes(name),
            }))}
            onChange={(name, value) =>
              onChange(
                editOfForm({
                  ...edit,
                  config: { ...edit.config, values: { ...edit.config.values, [name]: value } },
                }),
              )
            }
          />
        </section>
      ) : null}
    </section>
  );
}

// The Library prompt (or, for the intro and outro, the Library entry) this snapshot was copied
// from, found by the name the project saved.
function libraryPrompt(
  edit: RevisionEdit,
  key: string,
  options: readonly (Prompt | Entry)[],
  saved: readonly ImagePromptChoice[],
): Prompt | Entry | undefined {
  const { config } = edit;
  const image = imageIndex(key);
  if (key === "intro" || key === "outro") {
    const entry = config[key]?.name;
    return entry === undefined || entry === ""
      ? undefined
      : options.find((option): option is Entry => "category" in option && option.name === entry);
  }
  const name =
    key === "article"
      ? config.articlePrompt
      : key === "narration"
        ? config.narrationPrompt
        : key === "description"
          ? config.descriptionPrompt
          : key === "shorts"
            ? config.shorts?.prompt
            : key === "shortsImage"
              ? config.shorts?.imagePrompt
              : key === "thumbnailPrompt"
                ? config.thumbnailPrompt
                : key === "referencePrompt"
                  ? config.reference?.prompt
                  : image !== undefined
                    ? saved[image]?.name
                    : undefined;
  if (name === undefined || name === "") return undefined;
  return options.find(
    (option): option is Prompt => !("category" in option) && option.name === name,
  );
}

// A project keeps the prompt text it was given. When the Library prompt (or intro or outro
// entry) of the same name has been edited since, say so here with both choices: take the
// Library's new wording, or keep the project's own and stop being asked. Keeping is remembered
// in this browser for exactly these two texts, so a later Library edit asks again.
const keptKey = "slopify.library-kept";

function textHash(text: string): string {
  let hash = 5381;
  for (let at = 0; at < text.length; at += 1) hash = ((hash * 33) ^ text.charCodeAt(at)) >>> 0;
  return hash.toString(36);
}

function keptPairs(): readonly string[] {
  try {
    const raw = window.localStorage.getItem(keptKey);
    const parsed: unknown = raw === null ? [] : JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((one): one is string => typeof one === "string")
      : [];
  } catch {
    return [];
  }
}

export function LibraryChanged({
  label,
  raw,
  library,
  onUse,
}: {
  readonly label: string;
  readonly raw: string | null;
  readonly library: Pick<Prompt | Entry, "name" | "body"> | undefined;
  readonly onUse: (body: string) => void;
}) {
  const pair =
    library === undefined || raw === null
      ? ""
      : `${label}:${textHash(raw)}:${textHash(library.body)}`;
  const [kept, setKept] = useState(() => keptPairs().includes(pair));
  if (library === undefined || raw === null || library.body === raw || kept) return null;
  return (
    <Callout
      tone="info"
      title={`The Library's "${library.name}" has changed since this project copied it`}
      actions={
        <>
          <Button
            aria-label={`Use the Library version for ${label}`}
            onClick={() => {
              onUse(library.body);
            }}
          >
            Use the Library version
          </Button>
          <Button
            variant="quiet"
            aria-label={`Keep this project's version for ${label}`}
            onClick={() => {
              try {
                window.localStorage.setItem(
                  keptKey,
                  JSON.stringify([...keptPairs().filter((one) => one !== pair), pair].slice(-200)),
                );
              } catch {
                // Not remembered in this browser; it is still hidden until the page reloads.
              }
              setKept(true);
            }}
          >
            Keep this project's version
          </Button>
        </>
      }
    >
      The project uses its own copy below until you choose. Using the Library version marks what it
      wrote as outdated, to remake when you are ready.
    </Callout>
  );
}

function imageIndex(key: string): number | undefined {
  const image = /^imagePrompts\.(\d+)$/.exec(key);
  return image?.[1] === undefined ? undefined : Number(image[1]);
}

function promptLabel(key: string, saved: readonly ImagePromptChoice[]): string {
  if (key === "article") return "Article";
  if (key === "narration") return "Narration Preparation";
  if (key === "description") return "YouTube description";
  if (key === "shorts") return "Shorts";
  if (key === "shortsImage") return "Shorts image style";
  if (key === "thumbnailPrompt") return "Thumbnail";
  if (key === "referencePrompt") return "Establishing image";
  if (key === "intro") return "Intro";
  if (key === "outro") return "Outro";
  const image = imageIndex(key);
  if (image !== undefined) {
    const name = saved[image]?.name;
    return name === undefined || name === ""
      ? `Image prompt ${String(image + 1)}`
      : `Image prompt "${name}"`;
  }
  return key.replace(/[._-]/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2");
}
