export const playSections = [
  { id: "content", label: "Content", description: "Article and keywords" },
  { id: "outputs", label: "Outputs", description: "Voice and images" },
  { id: "style", label: "Style", description: "Frame and captions" },
  { id: "review", label: "Review", description: "Cost and start" },
] as const;
export type PlaySection = (typeof playSections)[number]["id"];
