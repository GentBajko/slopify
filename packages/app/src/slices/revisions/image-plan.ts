// Image prompts and their Numbers changed in Edit project. A project's images were planned per
// prompt when its run was adopted (`adopt-content.ts`): each image is a definition under
// `imagePrompts.N`, Number times per prompt. Changing which prompts are used, or a Number,
// re-derives those definitions here, the way Play's plan lays them out (prompts in selection
// order, Number images each), while keeping every definition a prompt already has: an image
// keeps its key and its wording, so its fingerprint - and the image made for it - stays.
//
// The edit's content is read in the numbering of `from` (the prompts the revision was saved
// with); the result is in the numbering of `to`. The browser calls this too, with stand-in
// keys, to say what saving will add and remove.

import type { ImagePromptChoice } from "../admission/model.js";
import { type FieldError, imagesPerRunMax, numberPerPromptMax } from "../admission/rules.js";
import { render } from "../admission/substitute.js";
import type { RevisionContent } from "./model.js";

type Definition = RevisionContent["imageDefinitions"][string];

export interface ImagePromptPlan {
  readonly content: RevisionContent;
  readonly rendered: Readonly<Record<string, string>>;
  // The definitions made for new images and the ones dropped, by key.
  readonly added: readonly string[];
  readonly removed: readonly string[];
}

export function imagePromptKey(index: number): string {
  return `imagePrompts.${String(index)}`;
}

function promptIndex(key: string | null | undefined): number | undefined {
  const match = /^imagePrompts\.(\d+)$/.exec(key ?? "");
  return match?.[1] === undefined ? undefined : Number(match[1]);
}

export function sameImagePrompts(
  from: readonly ImagePromptChoice[],
  to: readonly ImagePromptChoice[],
): boolean {
  return (
    from.length === to.length &&
    from.every((one, index) => one.name === to[index]?.name && one.number === to[index]?.number)
  );
}

// The same bounds Play's admission holds a run to.
export function imagePromptFields(to: readonly ImagePromptChoice[]): readonly FieldError[] {
  const fields: FieldError[] = [];
  if (to.length === 0)
    fields.push({
      field: "imagePrompts",
      message:
        "Tick at least one image prompt under Images, or set Images to Off or Provide on Inputs.",
    });
  const names = new Set<string>();
  for (const [index, prompt] of to.entries()) {
    if (prompt.name.trim() === "")
      fields.push({
        field: `imagePrompts.${String(index)}.name`,
        message: "Pick an image prompt.",
      });
    else if (names.has(prompt.name))
      fields.push({
        field: `imagePrompts.${String(index)}.name`,
        message: `The image prompt "${prompt.name}" is ticked twice. Untick one under Images.`,
      });
    names.add(prompt.name);
    if (!Number.isInteger(prompt.number) || prompt.number < 1 || prompt.number > numberPerPromptMax)
      fields.push({
        field: `imagePrompts.${String(index)}.number`,
        message: `Enter a whole number between 1 and ${String(numberPerPromptMax)} for "${prompt.name}" under Images.`,
      });
  }
  const total = to.reduce((sum, prompt) => sum + prompt.number, 0);
  if (total > imagesPerRunMax)
    fields.push({
      field: "imagePrompts",
      message: `A video can have at most ${String(imagesPerRunMax)} images; these prompts ask for ${String(total)}. Lower the Numbers under Images.`,
    });
  return fields;
}

export function replanImagePrompts(input: {
  readonly from: readonly ImagePromptChoice[];
  readonly to: readonly ImagePromptChoice[];
  readonly content: RevisionContent;
  readonly rendered: Readonly<Record<string, string>>;
  readonly values: Readonly<Record<string, string>>;
  // The Library wording of a prompt the revision did not use yet; undefined when the Library
  // no longer has it.
  readonly body: (name: string) => string | undefined;
  // The key of a new image's definition.
  readonly key: () => string;
}):
  | ({ readonly ok: true } & ImagePromptPlan)
  | { readonly ok: false; readonly fields: readonly FieldError[] } {
  const { from, to, content } = input;
  // Where each prompt of `to` was in `from`, by name: a prompt is the same prompt while its
  // name is, wherever it now sits.
  const was = to.map((prompt) => from.findIndex((one) => one.name === prompt.name));
  const fields: FieldError[] = [];
  const templates: Record<string, string | null> = {};
  const rendered: Record<string, string> = {};
  for (const [key, value] of Object.entries(content.promptTemplates))
    if (promptIndex(key) === undefined) templates[key] = value;
  for (const [key, value] of Object.entries(input.rendered))
    if (promptIndex(key) === undefined) rendered[key] = value;
  for (const [index, prompt] of to.entries()) {
    const key = imagePromptKey(index);
    const old = was[index] ?? -1;
    if (old >= 0) {
      const oldKey = imagePromptKey(old);
      if (Object.hasOwn(content.promptTemplates, oldKey))
        templates[key] = content.promptTemplates[oldKey] ?? null;
      const text = input.rendered[oldKey];
      if (text !== undefined) rendered[key] = text;
      continue;
    }
    const body = input.body(prompt.name);
    if (body === undefined) {
      fields.push({
        field: `imagePrompts.${String(index)}.name`,
        message: `The image prompt "${prompt.name}" is not in the Library any more. Untick it under Images, or add it back on Library → Prompts.`,
      });
      continue;
    }
    templates[key] = body;
    rendered[key] = render(body, input.values);
  }
  if (fields.length > 0) return { ok: false, fields };

  // The definitions each prompt of `from` has now, in slideshow order.
  const groups = new Map<number, string[]>();
  for (const key of content.imageOrder) {
    const index = promptIndex(content.imageDefinitions[key]?.templateKey);
    if (index === undefined || index >= from.length) continue;
    groups.set(index, [...(groups.get(index) ?? []), key]);
  }
  const definitions: Record<string, Definition> = {};
  const added: string[] = [];
  const removed: string[] = [];
  // New images for a prompt: its first image's wording when it has one, else the prompt's own.
  const fresh = (index: number, like: Definition | undefined): Definition => {
    const key = imagePromptKey(index);
    const template = templates[key];
    return like === undefined
      ? {
          source: "generate",
          assetId: null,
          prompt: rendered[key] ?? null,
          templateKey: template === undefined || template === null ? null : key,
        }
      : { ...like, source: "generate", assetId: null, templateKey: like.templateKey ?? null };
  };
  const extra = (index: number, count: number, like: Definition | undefined): string[] =>
    Array.from({ length: Math.max(0, count) }, () => {
      const id = input.key();
      definitions[id] = fresh(index, like);
      added.push(id);
      return id;
    });
  const order: string[] = [];
  for (const key of content.imageOrder) {
    const definition = content.imageDefinitions[key];
    if (definition === undefined) continue;
    const old = promptIndex(definition.templateKey);
    if (old === undefined || old >= from.length) {
      // An image added on its own, or uploaded: not any prompt's, so it stays where it is.
      definitions[key] = definition;
      order.push(key);
      continue;
    }
    const index = was.indexOf(old);
    if (index === -1) {
      removed.push(key);
      continue;
    }
    const group = groups.get(old) ?? [];
    const changed = from[old]?.number !== to[index]?.number;
    const keep = changed ? (to[index]?.number ?? 0) : group.length;
    const at = group.indexOf(key);
    if (at >= keep) {
      removed.push(key);
      continue;
    }
    const moved =
      definition.templateKey === imagePromptKey(index)
        ? definition
        : { ...definition, templateKey: imagePromptKey(index) };
    definitions[key] = moved;
    order.push(key);
    // A raised Number adds its images right after the prompt's last one.
    if (changed && at === Math.min(group.length, keep) - 1)
      order.push(...extra(index, keep - group.length, moved));
  }
  for (const [index, prompt] of to.entries()) {
    const old = was[index] ?? -1;
    const group = old >= 0 ? (groups.get(old) ?? []) : [];
    // A prompt with no image left (every one removed by hand) makes its Number again only when
    // the Number changed; a prompt new to the project makes all of them, at the end.
    if (old >= 0 && (group.length > 0 || from[old]?.number === prompt.number)) continue;
    order.push(...extra(index, prompt.number, undefined));
  }
  return {
    ok: true,
    content: {
      ...content,
      imageOrder: order,
      imageDefinitions: definitions,
      promptTemplates: templates,
    },
    rendered,
    added,
    removed,
  };
}
