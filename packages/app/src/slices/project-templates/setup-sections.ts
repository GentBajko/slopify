// One setup, three editors: Create, Edit template and a project's Edit settings show the same
// setup, so they name its sections alike and list them in this order, the order a run makes
// them. Each editor keeps its own data model and its own ids; only the names and the order
// come from here. Browser-safe: the web app imports it too.
export const setupSectionNames = {
  topic: "Topic & title",
  article: "Article",
  narration: "Narration",
  images: "Images",
  video: "Video & captions",
  thumbnail: "Thumbnail",
  shorts: "Shorts",
  pdf: "PDF",
  checks: "Pauses and checks",
  youtube: "YouTube description & posts",
  schedule: "Schedule",
} as const;

export type SetupSection = keyof typeof setupSectionNames;

// In run order.
export const setupSections = Object.keys(setupSectionNames) as readonly SetupSection[];
