import { formBody, type RouteTool } from "./route-tool.js";

export const libraryTools: readonly RouteTool[] = [
  {
    name: "list_prompts",
    route: "GET /api/prompts",
    title: "List prompts",
    description: "Library prompts of every kind.",
  },
  {
    name: "create_prompt",
    route: "POST /api/prompts",
    title: "Create a prompt",
    description:
      "Body: {kind: article | image | thumbnail | narration | description | shorts | review | script, name, body}.",
  },
  {
    name: "update_prompt",
    route: "PUT /api/prompts/:id",
    title: "Save a prompt",
    description:
      "Body: {kind, name, body}. Saving adds a history version; a rename follows into templates and Play drafts.",
  },
  {
    name: "set_prompt_photorealistic",
    route: "PUT /api/prompts/:id/photorealistic",
    title: "Mark a prompt photorealistic",
    description: "Body: {photorealistic: true | false}.",
  },
  {
    name: "prompt_history",
    route: "GET /api/prompts/:id/history",
    title: "Read a prompt's history",
    description: "Every saved version of the prompt.",
  },
  {
    name: "restore_prompt_version",
    route: "POST /api/prompts/:id/history/:version/restore",
    title: "Restore a prompt version",
    description: "Makes an earlier version the prompt's text again, as a new version.",
  },
  {
    name: "prompt_used_by",
    route: "GET /api/prompts/:id/used-by",
    title: "Where a prompt is used",
    description: "Templates, drafts and schedules that use the prompt.",
  },
  {
    name: "delete_prompt",
    route: "DELETE /api/prompts/:id",
    title: "Delete a prompt",
    description: "Moves the prompt to the trash.",
    confirm:
      "Moves it to the trash for 30 days (Settings → Trash). Projects that used it keep their text.",
  },
  {
    name: "list_entries",
    route: "GET /api/entries",
    title: "List intros and outros",
    description: "Library intros and outros.",
  },
  {
    name: "create_entry",
    route: "POST /api/entries",
    title: "Create an intro or outro",
    description: "Body: {category: intro | outro, mode: text | llm, name, body}.",
  },
  {
    name: "update_entry",
    route: "PUT /api/entries/:id",
    title: "Save an intro or outro",
    description: "Body: {category, mode, name, body}. Saving adds a history version.",
  },
  {
    name: "entry_history",
    route: "GET /api/entries/:id/history",
    title: "Read an entry's history",
    description: "Every saved version of the intro or outro.",
  },
  {
    name: "restore_entry_version",
    route: "POST /api/entries/:id/history/:version/restore",
    title: "Restore an entry version",
    description: "Makes an earlier version current again, as a new version.",
  },
  {
    name: "entry_used_by",
    route: "GET /api/entries/:id/used-by",
    title: "Where an entry is used",
    description: "Templates and drafts that use the intro or outro.",
  },
  {
    name: "delete_entry",
    route: "DELETE /api/entries/:id",
    title: "Delete an intro or outro",
    description: "Moves it to the trash.",
    confirm:
      "Moves it to the trash for 30 days (Settings → Trash). Projects that used it keep their text.",
  },
  {
    name: "list_document_themes",
    route: "GET /api/document-themes",
    title: "List PDF themes",
    description: "The built-in PDF themes and the ones saved in the Library.",
  },
  {
    name: "create_document_theme",
    route: "POST /api/document-themes",
    title: "Create a PDF theme",
    description: formBody("the PDF theme editor"),
  },
  {
    name: "update_document_theme",
    route: "PUT /api/document-themes/:id",
    title: "Save a PDF theme",
    description: formBody("the PDF theme editor"),
  },
  {
    name: "delete_document_theme",
    route: "DELETE /api/document-themes/:id",
    title: "Delete a PDF theme",
    description: "Deletes the theme.",
    confirm:
      "It is deleted permanently: PDF themes do not go to Settings → Trash, so it cannot be restored. Projects that used it keep their own copy of the settings.",
  },
  {
    name: "list_fonts",
    route: "GET /api/fonts",
    title: "List fonts",
    description: "Caption and document fonts, bundled and uploaded.",
  },
  {
    name: "upload_font",
    route: "POST /api/fonts",
    title: "Upload a font",
    description: "Adds a TTF or OTF font file.",
    upload: "multipart",
  },
  {
    name: "get_shared_glossary",
    route: "GET /api/pronunciations/shared",
    title: "Read the shared glossary",
    description: "The pronunciation glossary shared by every project.",
  },
  {
    name: "get_narration_aliases",
    route: "GET /api/pronunciations/aliases",
    title: "Read narration aliases",
    description:
      "Library → Narration aliases: words the narration says differently from how they are written.",
  },
  {
    name: "set_narration_aliases",
    route: "PUT /api/pronunciations/aliases",
    title: "Save narration aliases",
    description:
      "Saves the whole ordered list, like Save aliases. Body: {aliases: [{written, spoken, wholeWord, caseSensitive}]}.",
  },
];
