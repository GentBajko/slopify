import type { PlaySection } from "./sections";
import type { PlayFormState } from "./state";
export function focusPlayField(root: HTMLElement, field: string): boolean {
  const target = [...root.querySelectorAll<HTMLElement>("[data-play-field]")].find(
    (element) => element.dataset.playField === field,
  );
  if (!target || target.hasAttribute("disabled")) return false;
  target.focus();
  target.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "instant" });
  return document.activeElement === target;
}
export function playFieldTarget(
  field: string,
  form: PlayFormState,
  items: readonly { readonly key: string }[],
): { section: PlaySection; field: string } {
  let target = field;
  if (field === "fontUpload") target = "subtitles.fontUpload";
  if (/^provided\.images\.\d+$/.test(field)) target = "provided.images";
  if (field === "subtitles") target = "subtitles.mode";
  if (field === "chunking") target = "chunking.mode";
  if (["audio", "llm", "images"].includes(field)) target = `${field}.provider`;
  if (field === "provided") {
    const slot = (["audio", "images", "thumbnail"] as const).find(
      (kind) =>
        form.sources[kind] === "provide" &&
        (kind === "images" ? form.provided.images : [form.provided[kind]]).some(
          (upload) => upload && (upload.error !== undefined || upload.file === undefined),
        ),
    );
    target = `provided.${slot ?? "audio"}`;
  }
  const image = /^imagePrompts\.(\d+)\.(.+)$/.exec(field);
  if (image) {
    const prompt = form.imagePrompts[Number(image[1])];
    if (prompt) target = `imagePrompts.${prompt.name}.${image[2]}`;
  }
  if (field === "imagePrompts")
    target = form.imagePrompts[0]
      ? `imagePrompts.${form.imagePrompts[0].name}.number`
      : "imagePrompts";
  const variant = /^variants\.(\d+)\.(.+)$/.exec(field);
  if (variant) target = `items.${items[Number(variant[1])]?.key ?? variant[1]}.${variant[2]}`;
  const item = /^items\.(\d+)\.(.+)$/.exec(field);
  if (item)
    target =
      Number(item[1]) === 0
        ? (item[2] ?? field)
        : `items.${items[Number(item[1]) - 1]?.key ?? item[1]}.${item[2]}`;
  const matches = (prefixes: readonly string[]) =>
    prefixes.some((prefix) => field === prefix || field.startsWith(`${prefix}.`));
  const section: PlaySection = matches([
    "title",
    "articlePrompt",
    "provided.article",
    "provided.research",
    "sources.article",
    "sources.research",
    "llm",
    "values",
  ])
    ? "content"
    : matches(["format", "subtitles", "fontUpload"])
      ? "style"
      : matches([
            "audio",
            "narrationPrompt",
            "provided.audio",
            "intro",
            "outro",
            "chunking",
            "images",
            "imagePrompts",
            "provided.images",
            "thumbnailPrompt",
            "provided.thumbnail",
            "provided",
            "sources",
            "imageSeconds",
            "zoomPercent",
            "motionStyle",
            "edgeSilenceSeconds",
            "document",
            "youtubeDescription",
            "descriptionPrompt",
          ])
        ? "outputs"
        : "review";
  return { section, field: target };
}
