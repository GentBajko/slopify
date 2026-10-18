import type { Catalogue } from "../../catalog/schema.js";

// A small model list with every pricing shape a check meets.
const row = { enabled: true, deprecated: false, source: "https://example.com", keywords: [] };
export const catalogue: Catalogue = {
  schemaVersion: 1,
  updatedAt: "2026-10-18",
  providers: {
    openrouter: { maxConcurrent: 3 },
    elevenlabs: { maxConcurrent: 2 },
    cartesia: { maxConcurrent: 2 },
    fal: { maxConcurrent: 2 },
  },
  llm: [
    {
      ...row,
      provider: "openrouter",
      id: "cheap",
      name: "Cheap",
      pricing: { inputPerMillionTokens: 1, outputPerMillionTokens: 4 },
      llm: { webSearch: false },
    },
    {
      ...row,
      provider: "openrouter",
      id: "dear",
      name: "Dear",
      pricing: { inputPerMillionTokens: 15, outputPerMillionTokens: 75 },
      llm: { webSearch: false },
    },
    {
      ...row,
      provider: "openrouter",
      id: "unpriced",
      name: "Unpriced",
      pricing: {},
      llm: { webSearch: false },
    },
  ],
  tts: [
    {
      ...row,
      provider: "elevenlabs",
      id: "v1",
      name: "Voice",
      pricing: { perMillionCharacters: 30 },
      tts: { maxCharacters: 5000, streaming: true },
    },
    {
      ...row,
      provider: "cartesia",
      id: "sonic",
      name: "Sonic",
      pricing: { perMinute: 0.03 },
      tts: { maxCharacters: 5000, streaming: true },
    },
  ],
  image: [
    {
      ...row,
      provider: "fal",
      id: "flux",
      name: "Flux",
      pricing: { perImage: 0.0005 },
      image: { aspectRatios: ["1:1"] },
    },
    {
      ...row,
      provider: "fal",
      id: "clip",
      name: "Clip",
      keywords: ["video"],
      pricing: { perImage: 0.3 },
      image: { aspectRatios: ["16:9"] },
    },
  ],
};
