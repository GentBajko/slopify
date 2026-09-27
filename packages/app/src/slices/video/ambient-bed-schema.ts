import { z } from "zod";
import { ambientBedSources, builtInBeds } from "./ambient-bed.js";

// The ambient bed as a run's config and a channel's brand kit hold it. The ranges are
// `ambient-bed.ts`'s, checked by admission and the channel page, not the schema's.
const numbers = {
  levelDb: z.number(),
  fadeInSeconds: z.number(),
  tailSeconds: z.number(),
};
export const ambientBedSchema = z
  .object({ source: z.enum(ambientBedSources), ...numbers })
  .strict();
export const channelAmbientBedSchema = z
  .object({ source: z.enum(builtInBeds), ...numbers })
  .strict();
