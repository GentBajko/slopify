import { formBody, type RouteTool } from "./route-tool.js";

const description: readonly RouteTool[] = [
  {
    name: "get_description_edits",
    route: "GET /api/projects/:id/youtube-edits",
    title: "Read description edits",
    description:
      "The YouTube description, tags, pinned comment and titles as written, with the person's hand edits.",
  },
  {
    name: "get_project_channel_links",
    route: "GET /api/projects/:id/channel-links",
    title: "Read the project's channel links",
    description: "The links the description's {{Name}} placeholders fill from for this project.",
  },
  {
    name: "edit_description_field",
    route: "PUT /api/projects/:id/youtube-edits/fields/:field",
    title: "Edit a description field",
    description:
      "Hand-edits one field (field: a name get_description_edits lists). Body: {text: the new text, base: the text you edited from}.",
  },
  {
    name: "reset_description_field",
    route: "DELETE /api/projects/:id/youtube-edits/fields/:field",
    title: "Drop a description edit",
    description: "Drops the hand edit of one field; the written text comes back.",
    confirm: "This drops your hand edit of this field for good; the text Slopify wrote comes back.",
  },
  {
    name: "set_description_links",
    route: "PUT /api/projects/:id/youtube-edits/links",
    title: "Set the description's links",
    description:
      "The links this project's description fills its {{Name}} placeholders from. Body: {links: [{name, url}]}.",
  },
];

const uploadPrep: readonly RouteTool[] = [
  {
    name: "get_upload_pack",
    route: "GET /api/studio/packs/:projectId",
    title: "Read the upload pack",
    description:
      "Copy for YouTube Studio: the title, description, tags, thumbnails, playlists and release time of each upload (the video and each short), and the plan's free slots. The agent's work ends here, at Ready to upload: uploading is the person's.",
  },
  {
    name: "set_pack_slot",
    route: "PUT /api/studio/packs/:projectId/slot",
    title: "Choose the release slot",
    description:
      "Copy for YouTube Studio's release picker: one of the free slots get_upload_pack lists, or none. Body: {slot: {row, longAt} | null}.",
  },
  {
    name: "set_pack_real_footage",
    route: "PUT /api/studio/packs/:projectId/real-footage",
    title: "Set the altered-content answer",
    description:
      "Copy for YouTube Studio's AI use tick: the project's uploaded clips are real footage. Body: {realFootage: true | false}.",
  },
  {
    name: "set_pack_pick",
    route: "PUT /api/studio/packs/:projectId/pick",
    title: "Pick the title and thumbnail",
    description:
      "Copy for YouTube Studio's pick: which title and thumbnail the upload carries (the A/B test tries the others once the video is public). Body: {title: 0-9, thumbnail: 0-9}.",
  },
  {
    name: "set_pack_playlists",
    route: "PUT /api/studio/packs/:projectId/playlists",
    title: "Set the pack's playlists",
    description:
      "Copy for YouTube Studio's playlist ticks. Body: {playlists: [names] | null for the channel's defaults}.",
  },
  {
    name: "get_fill_queue",
    route: "GET /api/studio/queue",
    title: "Read the Studio fill queue",
    description: "What waits for the person's Slopify Studio extension, oldest first.",
  },
  {
    name: "remove_from_fill_queue",
    route: "POST /api/studio/queue/remove",
    title: "Remove from the fill queue",
    description:
      "Takes an upload off the extension's queue (agents never add one). Body: {projectId, short: a short's number or null for the video}.",
  },
];

const releases: readonly RouteTool[] = [
  {
    name: "get_releases",
    route: "GET /api/studio/releases",
    title: "Read Calendar → Releases",
    description:
      "The coming weeks' long videos and shorts with their release time, upload-by time and state (not-ready, ready, late = \"Late · upload now\", filled, scheduled), the posting plan's free times and the finished projects that could fill them. Query: {weeks?: 1-8}.",
  },
  {
    name: "get_project_releases",
    route: "GET /api/studio/releases/:projectId",
    title: "Read a project's release times",
    description:
      "The project page's Release block: the release time and upload-by time of the video and each short, and the plan's free times for its series.",
  },
  {
    name: "swap_releases",
    route: "POST /api/studio/releases/:projectId/swap",
    title: "Swap with…",
    description:
      "Swap with…: two videos trade their release times; their shorts follow each. Body: {with: the other project's id}.",
  },
  {
    name: "set_release",
    route: "PUT /api/studio/releases/:projectId",
    title: "Set a release time",
    description:
      "Moves one release (short 0 is the long video), sets it to Not scheduled (at: null), or Take this time: puts the project into a free time of the plan (short 0 with that time's line). Body: {short, at: an ISO time | null, line?}.",
  },
  {
    name: "get_posting_plan",
    route: "GET /api/studio/plan",
    title: "Read the posting plan",
    description: "The posting plan's lines, its lead time and the series the projects use.",
  },
  {
    name: "set_posting_plan",
    route: "PUT /api/studio/plan",
    title: "Save the posting plan",
    description: formBody("Calendar → Releases' posting plan"),
  },
  {
    name: "set_lead_time",
    route: "PUT /api/studio/settings/lead-hours",
    title: "Set the lead time",
    description: "How many hours before its release a video must be uploaded. Body: {hours}.",
  },
];

const youtube: readonly RouteTool[] = [
  {
    name: "get_youtube_videos",
    route: "GET /api/studio/videos/:projectId",
    title: "Read On YouTube",
    description:
      "The YouTube videos a project's uploads became: upload state, checks, the A/B test and the finishing touches (end screen, captions, related video, pinned comment) with any failure message.",
  },
  {
    name: "set_youtube_link",
    route: "PUT /api/studio/videos/:projectId",
    title: "Set or forget a YouTube link",
    description:
      "Records the YouTube link of an upload made without the extension, or with an empty link is Deleted on YouTube: Slopify forgets the video so it can be uploaded again. Body: {short: a short's number or null for the video, link}.",
  },
  {
    name: "get_ab_results",
    route: "GET /api/studio/ab-results",
    title: "Read A/B results",
    description: "Library → A/B results: every finished title and thumbnail test.",
  },
];

export const publishingTools: readonly RouteTool[] = [
  ...description,
  ...uploadPrep,
  ...releases,
  ...youtube,
];
