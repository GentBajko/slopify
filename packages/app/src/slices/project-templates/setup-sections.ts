// One setup, three editors: Create, Edit template and a project's Edit settings show the same
// setup, so they name its sections alike and list them in this order, the order a run makes
// them. Each editor keeps its own data model and its own ids; only the names and the order
// come from here. Browser-safe: the web app imports it too.
export const setupSectionNames = {
  topic: "Title and keywords",
  article: "Article",
  narration: "Narration",
  images: "Images",
  video: "Video and style",
  thumbnail: "Thumbnail",
  shorts: "Shorts",
  pdf: "PDF",
  checks: "Pauses and checks",
  youtube: "YouTube description and posts",
  schedule: "Schedule",
} as const;

export type SetupSection = keyof typeof setupSectionNames;

// In run order.
export const setupSections = Object.keys(setupSectionNames) as readonly SetupSection[];

// Create and a project's Edit settings keep the optional outputs together in one section, where
// Edit template gives each its own: the thumbnail, the shorts, the PDF and the YouTube
// description and posts.
export const extrasName = "Extras";

// Last in Create and a project's Edit settings: the channel the video is for. A template has no
// section for it; its schedules and Create pick the channel.
export const channelName = "Channel";
