import type { DatabaseSync } from "node:sqlite";
import type { Clock } from "../../kernel/clock.js";

// Every install has this channel (migration 0032). A template or project whose channel is
// NULL, or names a channel this install does not have, belongs to it.
export const defaultChannelId = "00000000-0000-4000-8000-000000000001";
export const defaultChannelName = "My channel";

export const castKinds = ["character", "creature", "place", "object"] as const;
export type CastKind = (typeof castKinds)[number];

// Everything optional: a field left out adds nothing to a run, so a channel with an empty kit
// starts exactly the runs its templates always started. Colours are #RRGGBB.
export interface BrandKit {
  // Captions: a font from the fonts list (Settings → Fonts), text and outline colour.
  readonly captionFontId?: string | undefined;
  readonly captionColor?: string | undefined;
  readonly captionOutlineColor?: string | undefined;
  // Chapter cards and the end screen: their font and text colour.
  readonly titleFontId?: string | undefined;
  readonly titleColor?: string | undefined;
  // Library → Intros & Outros entry names.
  readonly intro?: string | undefined;
  readonly outro?: string | undefined;
  // Shown over the video's last seconds.
  readonly endScreenText?: string | undefined;
  // A saved theme's id or a built-in theme's name (Library → Documents).
  readonly documentTheme?: string | undefined;
  // A built-in ambient bed under the long video (`video/ambient-bed.ts`), for a setup that
  // leaves its own unset.
  readonly ambientBed?: import("../video/ambient-bed.js").ChannelAmbientBed | undefined;
  // The language new projects in this channel are made in (`kernel/ports/languages.ts`),
  // unless Play picks one. Absent is English.
  readonly language?: string | undefined;
}

export interface Channel {
  readonly id: string;
  readonly name: string;
  readonly isDefault: boolean;
  readonly brand: BrandKit;
  // What the channel covers and what "view-worthy" means for it; schedules read it through
  // their template's channel.
  readonly seriesBrief: string;
  // YouTube's "Altered or synthetic content" answer for the channel's uploads: 'auto' follows
  // the rule in `slices/studio/disclosure.ts`, 'yes' and 'no' override it.
  readonly aiDisclosure: import("../studio/disclosure.js").AiDisclosureSetting;
  readonly version: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ChannelSummary extends Channel {
  readonly templates: number;
  readonly cast: number;
}

export interface CastImage {
  readonly id: string;
  readonly source: "upload" | "generate";
  readonly prompt: string | null;
  readonly state: "ready" | "generating" | "failed";
  readonly error: string | null;
  readonly sha256: string | null;
  readonly createdAt: string;
}

// How a cast member speaks when a multi-voice run casts them (`slices/voices`), so a character
// or a channel's host sounds the same in every episode. Absent: they have no voice yet.
export interface CastVoice {
  readonly provider: string;
  readonly model: string;
  readonly voice: string;
  readonly pace?: number | undefined;
  // `Term: /IPA/` lines, the Pronunciation Glossary's format.
  readonly pronunciations?: string | undefined;
}

export interface CastMember {
  readonly id: string;
  readonly channelId: string;
  readonly kind: CastKind;
  readonly name: string;
  readonly aliases: readonly string[];
  readonly description: string;
  readonly voice?: CastVoice | undefined;
  readonly version: number;
  readonly images: readonly CastImage[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

// A cast member as a run is started with it: only what the images need, the pictures named by
// content hash. Copied into the project's config, so editing the channel later changes no
// project already made.
export interface CastSnapshot {
  readonly name: string;
  readonly aliases: readonly string[];
  readonly description: string;
  readonly images: readonly string[];
}

export interface ChannelDeps {
  readonly db: DatabaseSync;
  readonly clock: Clock;
  readonly uuid: () => string;
}

export type ChannelResult<T> =
  | { readonly ok: true; readonly value: T }
  | {
      readonly ok: false;
      readonly reason:
        | "not-found"
        | "conflict"
        | "invalid-input"
        | "default-channel"
        | "has-templates"
        | "not-an-image"
        | "too-many-images"
        | "no-image-provider";
      readonly message?: string | undefined;
    };
