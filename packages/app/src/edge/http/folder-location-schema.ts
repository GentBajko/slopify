import { z } from "zod";

export const folderReplySchema = z.discriminatedUnion("opened", [
  z.object({ opened: z.literal(true) }).strict(),
  z
    .object({
      opened: z.literal(false),
      location: z.literal("docker-host"),
      path: z.string().min(1),
    })
    .strict(),
]);
export type FolderReply = z.infer<typeof folderReplySchema>;
