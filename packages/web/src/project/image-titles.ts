// A name for each image in a grid. The images share one prompt and differ only in their scene,
// so the prompt's opening is the same on every tile. A prompt that labels its scene ("Scene: …",
// as Slopify writes it, on its own line or inline) is named by that scene, up to the next label
// such as "Composition:". Otherwise the name is what the image's prompt says that the others'
// don't: the lines between the ones every prompt starts and ends with, so a scene is never cut
// mid-sentence.
const labelled = /\bScene:\s*([\s\S]+?)(?=\s+[A-Z][A-Za-z ]{2,30}:\s|\n\n|$)/u;

export function imageTitles(
  prompts: readonly (string | undefined)[],
): readonly (string | undefined)[] {
  const scenes = prompts.map((prompt) =>
    prompt === undefined ? undefined : labelled.exec(prompt)?.[1]?.trim(),
  );
  const byLines = differingLines(prompts);
  return prompts.map((prompt, index) => {
    const scene = scenes[index];
    if (scene !== undefined && scene !== "") return scene;
    return byLines[index] ?? prompt;
  });
}

function differingLines(prompts: readonly (string | undefined)[]): readonly (string | undefined)[] {
  const lines = prompts.map((prompt) => prompt?.split("\n"));
  const known = lines.filter((each): each is string[] => each !== undefined);
  if (known.length < 2) return prompts.map(() => undefined);
  const shortest = Math.min(...known.map((each) => each.length));
  let head = 0;
  while (head < shortest && known.every((each) => each[head] === known[0]?.[head])) head += 1;
  let tail = 0;
  while (
    tail < shortest - head &&
    known.every((each) => each[each.length - 1 - tail] === known[0]?.[known[0].length - 1 - tail])
  )
    tail += 1;
  return lines.map((each) => {
    const own = each
      ?.slice(head, each.length - tail)
      .join(" ")
      .trim();
    return own === undefined || own === "" ? undefined : own;
  });
}
