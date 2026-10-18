import { formBody, type RouteTool } from "./route-tool.js";

// Library → Designs: pictures edited step by step and designed pieces (posters, flyers,
// brochures, social images), and the design templates they are made from. Every paid step
// starts only with the acknowledgedHigh its quote gave.

const paid =
  "a paid call: send acknowledgedHigh as the quote's high (refused with the new quote when the price rose)";

export const designTools: readonly RouteTool[] = [
  {
    name: "list_designs",
    route: "GET /api/designs",
    title: "List designs",
    description:
      "Every design with its versions, newest first. Query: projectId to list one project's.",
  },
  {
    name: "upload_design_picture",
    route: "POST /api/designs/pictures",
    title: "Upload a picture to design with",
    description:
      "Keeps a PNG or JPEG (at most 10 MB) and answers its sha256, which create_design takes as fromStepSha.",
    upload: "raw",
  },
  {
    name: "create_design",
    route: "POST /api/designs",
    title: "Start a design",
    description: `Starts an edit from a picture (kind "edit" with fromStepSha or stagedFileId) or a designed piece (kind "design" with its document). Body: {id: a new id of letters, digits, - and _, mutationId: a new UUID, kind, name, channelId?, projectId?, stagedFileId? | fromStepSha?, document?, values?}.`,
  },
  {
    name: "get_design",
    route: "GET /api/designs/:id",
    title: "Read a design",
    description:
      "One design: its settings, values, current version (headStepId) and every version.",
  },
  {
    name: "update_design",
    route: "PUT /api/designs/:id",
    title: "Save a design",
    description: `Renames it, links it to a project (projectId, or null to unlink), saves its settings (document; an edit with a document becomes a designed piece) and values. Body: {baseUpdatedAt: the updatedAt get_design returns, name?, projectId?, document?, values?}. ${formBody("the design's Text and Formats tabs")}`,
  },
  {
    name: "delete_design",
    route: "DELETE /api/designs/:id",
    title: "Delete a design",
    description: "Moves the design to Settings → Trash, where it stays 30 days.",
    confirm:
      "It moves to Settings → Trash. After 30 days it is removed for good with every version and every file drawn from it.",
  },
  {
    name: "quote_design_edit",
    route: "POST /api/designs/:id/quote",
    title: "Price a picture edit",
    description:
      "What one edit costs with this model. Body: {provider, model, castMemberIds?}. Records nothing.",
    unrecorded: true,
  },
  {
    name: "quote_design_artwork",
    route: "POST /api/designs/:id/artwork/quote",
    title: "Price a design's artwork",
    description: "What drawing the designed piece's artwork costs. Records nothing.",
    unrecorded: true,
  },
  {
    name: "edit_design_picture",
    route: "POST /api/designs/:id/edit",
    title: "Edit the picture",
    description: `Changes a version of the picture as the instruction says; the result lands as the next version (read get_design until it is ready or failed). This is ${paid}. Body: {mutationId: a new UUID, fromStepId, instruction, provider, model, castMemberIds?, acknowledgedHigh}.`,
  },
  {
    name: "make_design_artwork",
    route: "POST /api/designs/:id/artwork",
    title: "Make the artwork",
    description: `Draws the designed piece's artwork from its picture prompt with its fields filled. This is ${paid}. Body: {mutationId: a new UUID, acknowledgedHigh}.`,
  },
  {
    name: "retry_design_step",
    route: "POST /api/designs/:id/steps/:stepId/retry",
    title: "Try a failed version again",
    description: "Asks the provider again for a version that failed, as Try again does.",
  },
  {
    name: "set_design_version",
    route: "PUT /api/designs/:id/head",
    title: "Continue from a version",
    description:
      "Makes a ready version the one the next edit starts from and the files are drawn from. Free. Body: {stepId}.",
  },
  {
    name: "get_design_picture",
    route: "GET /api/designs/:id/steps/:stepId/picture",
    title: "See a version",
    description: "One version of the design's picture, as an image.",
  },
  {
    name: "get_design_file",
    route: "GET /api/designs/:id/files/:file",
    title: "Draw a finished piece",
    description:
      "Draws the piece in one format with Slopify's text layer, as the design page's Download does: file is <format>.png (a4, a3, flyer, square, portrait, story, wide) or <format>.pdf (a4, a3, flyer, brochure). A PNG comes back as an image; a PDF is drawn and its size reported.",
  },
  {
    name: "list_design_templates",
    route: "GET /api/design-templates",
    title: "List design templates",
    description: "Every design template with its versions and the version marked ready.",
  },
  {
    name: "create_design_template",
    route: "POST /api/design-templates",
    title: "Create a design template",
    description: "Body: {id: a new id, mutationId: a new UUID, name, document, channelId?}.",
  },
  {
    name: "get_design_template",
    route: "GET /api/design-templates/:id",
    title: "Read a design template",
    description: "One design template: its newest version, its checks and every version.",
  },
  {
    name: "save_design_template",
    route: "PUT /api/design-templates/:id",
    title: "Save a design template",
    description: `Saves a new version. Body: {baseVersion: the headVersion get_design_template returns, name, document, sample?: "make" | "skip", acknowledgedHigh?}. ${formBody("the template editor")}`,
  },
  {
    name: "delete_design_template",
    route: "DELETE /api/design-templates/:id",
    title: "Delete a design template",
    description: "Moves the template to Settings → Trash, where it stays 30 days.",
    confirm:
      "It moves to Settings → Trash, and schedules that make from it stop making pieces. After 30 days it is removed for good with its versions and its sample.",
  },
  {
    name: "quote_design_template",
    route: "POST /api/design-templates/:id/quote",
    title: "Price a piece from a template",
    description: "What one piece made from the template's newest version costs. Records nothing.",
    unrecorded: true,
  },
  {
    name: "mark_design_template_ready",
    route: "POST /api/design-templates/:id/ready",
    title: "Mark a template version ready",
    description:
      "Runs the version's checks and marks it ready when they pass; refused with the checks that failed. Body: {version}.",
    confirm: "Schedules start making pieces from this version.",
  },
  {
    name: "make_design_from_template",
    route: "POST /api/design-templates/:id/make",
    title: "Make a piece from a template",
    description: `Makes one designed piece from a template version with these values and starts its artwork. This is ${paid}. Body: {mutationId: a new UUID, values, acknowledgedHigh, version?, name?, projectId?}.`,
  },
];
