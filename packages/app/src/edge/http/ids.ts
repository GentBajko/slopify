import { z } from "zod";

export const idString = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[0-9A-Za-z_-]+$/);

export const idParam = z.object({ id: idString });
export const projectIdParam = z.object({ projectId: idString });
