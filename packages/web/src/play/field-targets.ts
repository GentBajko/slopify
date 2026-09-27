import type { PlaySection } from "./sections";
import { ambientUploadOn, type PlayFormState, shortsOn } from "./state";
export function focusPlayField(root: HTMLElement, field: string): boolean {
  const target = [...root.querySelectorAll<HTMLElement>("[data-play-field]")].find(
    (element) => element.dataset.playField === field,
  );
  if (!target || target.hasAttribute("disabled")) return false;
  // A field inside a closed disclosure (More shorts options) is shown before it is focused.
  const disclosure = target.closest("details");
  if (disclosure !== null && !disclosure.open) disclosure.open = true;
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
    const music = form.provided.shortsMusic;
    target =
      slot === undefined &&
      shortsOn(form) &&
      music !== undefined &&
      (music.error !== undefined || music.file === undefined)
        ? "shorts.music"
        : form.reference?.source === "provide" &&
            form.provided.reference !== undefined &&
            (form.provided.reference.error !== undefined ||
              form.provided.reference.file === undefined)
          ? "provided.reference"
          : `provided.${slot ?? "audio"}`;
    const bed = form.provided.ambientBed;
    if (
      slot === undefined &&
      ambientUploadOn(form) &&
      bed !== undefined &&
      (bed.error !== undefined || bed.file === undefined)
    )
      target = "ambientBed.file";
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
            "voices",
            "provided.audio",
            "intro",
            "outro",
            "chunking",
            "images",
            "imagePrompts",
            "imageScale",
            "provided.images",
            "thumbnailPrompt",
            "provided.thumbnail",
            "provided.reference",
            "reference",
            "provided",
            "sources",
            "imageSeconds",
            "zoomPercent",
            "motionStyle",
            "edgeSilenceSeconds",
            "document",
            "youtubeDescription",
            "descriptionPrompt",
            "shorts",
            "videoEdit",
            "ambientBed",
          ])
        ? "outputs"
        : "review";
  return { section, field: target };
}
