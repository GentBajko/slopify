import type { Output } from "@app/slices/storage/model.js";

// The slideshow order, which is also the order the grid draws in: "image prompts in selection
// order, then index within each prompt". The rows come back from the server in insert order,
// and a regenerated image is a new row, so neither the grouping nor the order can be read off
// the list itself.

export interface ImageGroup {
  readonly name: string;
  readonly images: readonly Output[];
}

// What an image made before its prompt name was recorded, or by a prompt deleted from the
// run's configuration since, is grouped under.
export const ungrouped = "Images";

export function groupImages(
  outputs: readonly Output[],
  order: readonly string[],
): readonly ImageGroup[] {
  const images = outputs.filter((output) => output.role === "image");
  const byName = new Map<string, Output[]>();
  for (const image of images) {
    const name = image.meta.promptName ?? ungrouped;
    byName.set(name, [...(byName.get(name) ?? []), image]);
  }
  const named = order.filter((name) => byName.has(name));
  const rest = [...byName.keys()].filter((name) => !named.includes(name)).sort();
  return [...named, ...rest].flatMap((name) => {
    const group = byName.get(name);
    return group === undefined ? [] : [{ name, images: [...group].sort(byIndex) }];
  });
}

function byIndex(left: Output, right: Output): number {
  return (left.meta.index ?? 0) - (right.meta.index ?? 0);
}
