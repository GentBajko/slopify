import type { PlayDraftDocument, PlayDraftForm } from "../play-drafts/schema.js";
import { type TemplateSection, templateSections } from "./model.js";

// Where each setting of a template lives in the studio. Typed as a full record, so a field
// added to Play's form fails the typecheck until it is given a section here.
type Home = TemplateSection | null;
type FormHomes = { readonly [K in keyof PlayDraftForm]-?: Home };
type DocumentHomes = { readonly [K in Exclude<keyof PlayDraftDocument, "form">]-?: Home };

export const sourceSections: {
  readonly [K in keyof PlayDraftForm["sources"]]-?: TemplateSection;
} = {
  research: "subject",
  article: "script",
  audio: "voice",
  images: "pictures",
  thumbnail: "thumbnail",
  video: "video",
  document: "document",
};

const providedSections: {
  readonly [K in keyof PlayDraftForm["provided"]]-?: TemplateSection;
} = {
  research: "subject",
  article: "script",
  audio: "voice",
  thumbnail: "thumbnail",
  images: "pictures",
  reference: "pictures",
  shortsMusic: "shorts",
  ambientBed: "video",
};

export const formSections: FormHomes = {
  title: "subject",
  language: "subject",
  values: "subject",
  checkpoints: "reviews",
  reviews: "reviews",
  format: "video",
  sources: null,
  provided: null,
  llm: "script",
  articlePrompt: "script",
  intro: "script",
  outro: "script",
  audio: "voice",
  narrationPrompt: "voice",
  loudness: "voice",
  sentencePause: "voice",
  paragraphPause: "voice",
  removeBreaths: "voice",
  deEss: "voice",
  levelSentences: "voice",
  chunking: "voice",
  voices: "voice",
  images: "pictures",
  reference: "pictures",
  imagePrompts: "pictures",
  imageScale: "pictures",
  imageScenes: "pictures",
  subtitles: "video",
  imageSeconds: "video",
  edgeSilenceSeconds: "video",
  zoomPercent: "video",
  motionStyle: "video",
  silenceGapSeconds: "video",
  videoEdit: "video",
  ambientBed: "video",
  showFigures: "video",
  useBrandKit: "video",
  thumbnailPrompt: "thumbnail",
  thumbnailCount: "thumbnail",
  shorts: "shorts",
  document: "document",
  youtubeDescription: "upload",
  descriptionPrompt: "upload",
};

export const documentSections: DocumentHomes = {
  schemaVersion: null,
  librarySnapshot: null,
  templateSource: null,
  section: null,
  channelId: "subject",
  variants: "subject",
  queue: "schedule",
  expectedWords: "script",
  previewText: "voice",
  fontUpload: "video",
};

// The section a setting belongs to, by its path in the template document (`form.audio.voice`).
// Null for what no section shows (the schema version, Play's open tab).
export function sectionOfField(path: readonly string[]): TemplateSection | null {
  const [top, field, key] = path;
  if (top !== "form") return top === undefined ? null : (lookup(documentSections, top) ?? null);
  if (field === "sources") return key === undefined ? null : (lookup(sourceSections, key) ?? null);
  if (field === "provided")
    return key === undefined ? null : (lookup(providedSections, key) ?? null);
  return field === undefined ? null : (lookup(formSections, field) ?? null);
}

function lookup<T extends object>(table: T, key: string): T[keyof T] | undefined {
  return Object.hasOwn(table, key) ? (table as Record<string, T[keyof T]>)[key] : undefined;
}

// The section a piece of rebuild work shows its sample in, by its work key (`article:body`,
// `image:harbor`, `review:article:body`). Undefined for a key no section shows.
export function sectionOfWork(key: string): TemplateSection | undefined {
  if (key.startsWith("review:")) return "reviews";
  const prefix = key.split(":")[0] ?? "";
  return workPrefixes[prefix];
}

const workPrefixes: Readonly<Record<string, TemplateSection>> = {
  research: "subject",
  article: "script",
  entry: "script",
  script: "script",
  audio: "voice",
  narration: "voice",
  level: "voice",
  voices: "voice",
  image: "pictures",
  images: "pictures",
  reference: "pictures",
  figure: "pictures",
  thumbnail: "thumbnail",
  export: "video",
  subtitles: "video",
  video: "video",
  animate: "video",
  shorts: "shorts",
  youtube: "upload",
  document: "document",
};

// What a section's sample is made from: a change in a section outdates the samples after it.
// Reviews judge the script, voice, pictures and thumbnail, so a change there outdates reviews;
// the schedule depends on nothing but itself and the subject (titles come from the topics).
const dependents: Readonly<Record<TemplateSection, readonly TemplateSection[]>> = {
  subject: ["script", "schedule"],
  script: ["voice", "pictures", "thumbnail", "document", "upload", "reviews"],
  voice: ["video", "reviews"],
  pictures: ["video", "thumbnail", "reviews"],
  video: ["shorts", "upload"],
  thumbnail: ["reviews"],
  shorts: [],
  document: [],
  reviews: [],
  upload: [],
  schedule: [],
};

// Every section whose sample a change from `before` to `after` outdates, in pipeline order.
export function affectedSections(
  before: PlayDraftDocument,
  after: PlayDraftDocument,
): readonly TemplateSection[] {
  const changed = new Set<TemplateSection>();
  for (const path of changedPaths(before, after, [])) {
    const section = sectionOfField(path);
    if (section !== null) changed.add(section);
  }
  const affected = new Set<TemplateSection>();
  const visit = (section: TemplateSection): void => {
    if (affected.has(section)) return;
    affected.add(section);
    for (const next of dependents[section]) visit(next);
  };
  for (const section of changed) visit(section);
  return templateSections.filter((section) => affected.has(section));
}

// Paths go down to the third level (`form.sources.audio`), where every section boundary lies.
function changedPaths(
  before: unknown,
  after: unknown,
  path: readonly string[],
): readonly (readonly string[])[] {
  if (JSON.stringify(before) === JSON.stringify(after)) return [];
  if (path.length >= 3 || !isRecord(before) || !isRecord(after)) return [path];
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  return [...keys].flatMap((key) => changedPaths(before[key], after[key], [...path, key]));
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
