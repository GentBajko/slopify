// Where a server sentence sends a person to change something: a project's Edit settings and its
// sections (the web app's project/revision-form.tsx), and Create's rows (play/setup-rows.ts).
// Named once here, so every refusal and failure says the same path, and a section that is
// renamed on screen is renamed in its sentences by changing one line. Browser-safe.

export const editSettings = {
  open: "Edit settings",
  title: "Edit settings → Title and keywords",
  article: "Edit settings → Article",
  // The one text model a project's AI writing uses: the article, its research, the narration's
  // preparation, the image prompts, the description, the shorts' picks and the speaker split.
  writer: "Edit settings → Article → Written by",
  narration: "Edit settings → Narration",
  images: "Edit settings → Images",
  video: "Edit settings → Video and style",
  look: "Edit settings → Video and style → Look",
  sound: "Edit settings → Video and style → Sound polish",
  captions: "Edit settings → Captions",
  // The thumbnail, the YouTube description, the shorts and the PDF, together as in Create.
  extras: "Edit settings → Extras",
  shorts: "Edit settings → Extras → Shorts",
  checks: "Edit settings → Pauses and checks",
  channel: "Edit settings → Channel",
  language: "Edit settings → Channel → Language",
} as const;

export const createRows = {
  article: "Create → Article",
  narration: "Create → Narration",
  images: "Create → Images",
  video: "Create → Video and style",
  extras: "Create → Extras",
} as const;
