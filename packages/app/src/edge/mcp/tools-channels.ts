import { castGenerateSchema } from "../../slices/channels/schema.js";
import { formBody, type RouteTool } from "./route-tool.js";

export const channelTools: readonly RouteTool[] = [
  {
    name: "list_channels",
    route: "GET /api/channels",
    title: "List channels",
    description: "Channels with their brand kits.",
  },
  {
    name: "create_channel",
    route: "POST /api/channels",
    title: "Create a channel",
    description: formBody("New channel"),
  },
  {
    name: "get_channel",
    route: "GET /api/channels/:id",
    title: "Read a channel",
    description: "One channel with its cast in order, brand kit and settings.",
  },
  {
    name: "update_channel",
    route: "PUT /api/channels/:id",
    title: "Save a channel",
    description: formBody("the channel's tabs"),
  },
  {
    name: "set_ai_disclosure",
    route: "PUT /api/channels/:id/ai-disclosure",
    title: "Set the AI disclosure",
    description: formBody("the channel's AI disclosure"),
  },
  {
    name: "delete_channel",
    route: "DELETE /api/channels/:id",
    title: "Delete a channel",
    description: "Deletes the channel.",
    confirm:
      "It is deleted permanently: channels do not go to Settings → Trash, so it cannot be restored. Its cast and their reference pictures, its episode summaries, its video memory and its brand settings go with it. Its projects move to the default channel and keep what they were made with.",
  },
  {
    name: "add_cast_member",
    route: "POST /api/channels/:id/cast",
    title: "Add a cast member",
    description: formBody("the Cast tab's Add"),
  },
  {
    name: "move_cast_member",
    route: "POST /api/channels/:id/cast/move",
    title: "Move a cast member",
    description: `Cast order, or moving a cast member to another channel, like the Cast tab's move. ${formBody("the Cast tab's move")}`,
  },
  {
    name: "update_cast_member",
    route: "PUT /api/channels/cast/:memberId",
    title: "Save a cast member",
    description: formBody("the cast editor"),
  },
  {
    name: "delete_cast_member",
    route: "DELETE /api/channels/cast/:memberId",
    title: "Delete a cast member",
    description: "Deletes the cast member.",
    confirm:
      "It is deleted permanently: cast members do not go to Settings → Trash, so it cannot be restored. Its reference pictures go with it, and new videos stop using them. Videos already made keep the pictures they were started with.",
  },
  {
    name: "upload_cast_picture",
    route: "POST /api/channels/cast/:memberId/images",
    title: "Upload a cast picture",
    description: "Adds a picture of the cast member from an image file.",
    upload: "raw",
  },
  {
    name: "generate_cast_picture",
    route: "POST /api/channels/cast/:memberId/generate",
    body: castGenerateSchema,
    title: "Generate a cast picture",
    description:
      "Draws a cast picture with the image provider, a paid call, like Generate on the Cast tab.",
  },
  {
    name: "delete_cast_picture",
    route: "DELETE /api/channels/cast/:memberId/images/:imageId",
    title: "Delete a cast picture",
    description: "Removes one picture of the cast member.",
  },
  {
    name: "get_cast_picture",
    route: "GET /api/channels/pictures/:sha256",
    title: "Read a cast picture",
    description: "A cast or brand picture by its sha256, as an image.",
  },
  {
    name: "set_channel_template",
    route: "PUT /api/channels/templates/:templateId",
    title: "Set a template's channel",
    description: formBody("the template's channel choice"),
  },
  {
    name: "list_episode_memories",
    route: "GET /api/channels/:id/episodes",
    title: "Read episode memory",
    description: "The channel's summaries of finished episodes that later scripts may refer to.",
  },
  {
    name: "set_episode_memory",
    route: "PUT /api/channels/:id/episodes/setting",
    title: "Set episode memory",
    description: formBody("the channel's episode memory switch"),
  },
  {
    name: "update_episode_memory",
    route: "PUT /api/channels/:id/episodes/:memoryId",
    title: "Edit an episode summary",
    description: formBody("the episode summary editor"),
  },
  {
    name: "delete_episode_memory",
    route: "DELETE /api/channels/:id/episodes/:memoryId",
    title: "Delete an episode summary",
    description: "Deletes one summary.",
    confirm:
      "It is deleted permanently: episode summaries do not go to Settings → Trash, so it cannot be restored. New episodes stop being reminded of it. The video itself is not changed.",
  },
  {
    name: "list_channel_videos",
    route: "GET /api/channels/:id/videos",
    title: "Read the titles to avoid",
    description:
      "The channel's titles to avoid: titles of videos it made before Slopify, pasted or imported from YouTube Studio.",
  },
  {
    name: "preview_channel_videos",
    route: "POST /api/channels/:id/videos/preview",
    title: "Preview a titles-to-avoid import",
    description: formBody("the Titles to avoid tab's import"),
    unrecorded: true,
  },
  {
    name: "import_channel_videos",
    route: "POST /api/channels/:id/videos",
    title: "Import titles to avoid",
    description: formBody("the Titles to avoid tab's import"),
  },
  {
    name: "remove_channel_videos",
    route: "DELETE /api/channels/:id/videos",
    title: "Remove every title to avoid",
    description: "Removes every imported title.",
    confirm: "This removes every imported video title of the channel.",
  },
  {
    name: "remove_channel_video",
    route: "DELETE /api/channels/:id/videos/:videoId",
    title: "Remove a title to avoid",
    description: "Removes one imported title.",
  },
];
