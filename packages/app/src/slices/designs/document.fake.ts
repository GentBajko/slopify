import type { DesignDocument } from "./schema.js";

// Test support, not shipped: a gig poster with four fields.
export function poster(overrides: Partial<DesignDocument> = {}): DesignDocument {
  return {
    version: 1,
    picture: {
      source: "generate",
      prompt: "A jazz club stage for {{Event}}, warm light",
      castMemberIds: [],
      provider: "fal",
      model: "fal-ai/flux-2",
      aiText: false,
    },
    text: {
      preset: "bottom-band",
      scrim: "band",
      blocks: [
        { id: "b1", role: "headline", text: "{{Event}}", fontId: "default", color: "#FFFFFF" },
        {
          id: "b2",
          role: "details",
          text: "{{Date}} · {{Venue}} · {{Price}}",
          fontId: "default",
          color: "#FFEEDD",
        },
      ],
    },
    formats: [{ format: "a4", focus: { x: 0.5, y: 0.5 } }],
    samples: { Event: "Late Set", Date: "2026-11-14", Venue: "The Cellar", Price: "€12" },
    ...overrides,
  };
}
