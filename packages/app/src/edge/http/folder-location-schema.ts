import { z } from "zod";

const dockerHost = { location: z.literal("docker-host"), path: z.string().min(1) };
// In Docker the host helper may open the folder itself; the host path is sent either way.
export const folderReplySchema = z.union([
  z.object({ opened: z.literal(true) }).strict(),
  z.object({ opened: z.literal(true), ...dockerHost }).strict(),
  z.object({ opened: z.literal(false), ...dockerHost }).strict(),
]);
export type FolderReply = z.infer<typeof folderReplySchema>;
