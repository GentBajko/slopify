import type { DatabaseSync } from "node:sqlite";
import type { RunDraft } from "../admission/model.js";
import { listDocumentThemes } from "../document/library.js";
import { documentThemes } from "../document/model.js";
import type { Entry } from "../library/model.js";
import type { PlayDraftDocument, PlayDraftForm } from "../play-drafts/schema.js";
import { ambientBedFormOf } from "../video/ambient-bed.js";
import type { BrandKit, CastSnapshot, Channel } from "./model.js";
import { castOfChannel, channelById, resolveChannelId, templateChannelId } from "./repo.js";

// The channel a Play draft runs in: the one picked on Play, else its template's, else the
// default channel.
export function draftChannel(db: DatabaseSync, document: PlayDraftDocument): Channel {
  const id =
    document.channelId !== undefined
      ? resolveChannelId(db, document.channelId)
      : document.templateSource !== undefined
        ? templateChannelId(db, document.templateSource.id)
        : resolveChannelId(db, undefined);
  const channel = channelById(db, id);
  if (channel === undefined) throw new Error("The default channel is missing");
  return channel;
}

// The brand kit fills what the draft leaves at its default: the "default" caption font, no
// intro or outro, no document theme chosen, no ambient sound chosen. A template that sets its own keeps it, and one
// with "Use the channel's brand kit" off takes nothing from it. An intro, outro or theme the
// kit names that no longer exists is skipped, not refused: the draft never named it.
export function brandedForm(
  db: DatabaseSync,
  form: PlayDraftForm,
  brand: BrandKit,
  entries: readonly Entry[],
): PlayDraftForm {
  if (form.useBrandKit === false) return form;
  const entry = (category: "intro" | "outro", name: string | undefined): string | undefined =>
    name === undefined
      ? undefined
      : entries.find(
          (row) => row.category === category && row.name.toLowerCase() === name.toLowerCase(),
        )?.name;
  const intro = form.intro === "" ? entry("intro", brand.intro) : undefined;
  const outro = form.outro === "" ? entry("outro", brand.outro) : undefined;
  const document = form.document === undefined ? brandDocument(db, brand) : undefined;
  return {
    ...form,
    ...(form.subtitles.fontId === "default" && brand.captionFontId !== undefined
      ? { subtitles: { ...form.subtitles, fontId: brand.captionFontId } }
      : {}),
    ...(intro === undefined ? {} : { intro }),
    ...(outro === undefined ? {} : { outro }),
    ...(document === undefined ? {} : { document }),
    // A setup that never touched its ambient sound takes the channel's; one set to None keeps
    // none.
    ...(form.ambientBed === undefined && brand.ambientBed !== undefined
      ? { ambientBed: ambientBedFormOf(brand.ambientBed) }
      : {}),
  };
}

function brandDocument(db: DatabaseSync, brand: BrandKit): PlayDraftForm["document"] {
  const name = brand.documentTheme;
  if (name === undefined) return undefined;
  const builtIn = documentThemes.find((theme) => theme === name);
  if (builtIn !== undefined) return { theme: builtIn };
  const saved = listDocumentThemes(db).find((theme) => theme.id === name);
  return saved === undefined
    ? undefined
    : { theme: "plain", custom: { id: saved.id, name: saved.name, values: saved.values } };
}

// What the run carries from its channel beyond the form: the channel itself, the caption and
// title colours, the end screen, and the cast. Each only when set, so a run from a channel
// with an empty kit and no cast is the run it always was.
export function brandedRun(
  draft: RunDraft,
  channel: Channel,
  cast: readonly CastSnapshot[],
  useBrandKit: boolean,
): RunDraft {
  const brand = useBrandKit ? channel.brand : {};
  const colours =
    brand.captionColor === undefined && brand.captionOutlineColor === undefined
      ? {}
      : {
          ...(brand.captionColor === undefined ? {} : { color: brand.captionColor }),
          ...(brand.captionOutlineColor === undefined
            ? {}
            : { outlineColor: brand.captionOutlineColor }),
        };
  const titleStyle = {
    ...(brand.titleFontId === undefined ? {} : { fontId: brand.titleFontId }),
    ...(brand.titleColor === undefined ? {} : { color: brand.titleColor }),
  };
  return {
    ...draft,
    channelId: channel.id,
    ...(draft.subtitles !== undefined && Object.keys(colours).length > 0
      ? { subtitles: { ...colours, ...draft.subtitles } }
      : {}),
    ...(Object.keys(titleStyle).length === 0 || draft.titleStyle !== undefined
      ? {}
      : { titleStyle }),
    ...(brand.endScreenText === undefined || draft.endScreen !== undefined
      ? {}
      : { endScreen: { text: brand.endScreenText } }),
    ...(cast.length === 0 ? {} : { cast }),
  };
}

// The channel's cast as a run is started with it: members with at least one finished picture.
export function castSnapshot(db: DatabaseSync, channelId: string): readonly CastSnapshot[] {
  return castOfChannel(db, channelId).flatMap((member) => {
    const images = member.images.flatMap((image) =>
      image.state === "ready" && image.sha256 !== null ? [image.sha256] : [],
    );
    return images.length === 0
      ? []
      : [
          {
            name: member.name,
            aliases: member.aliases,
            description: member.description,
            images,
          },
        ];
  });
}
