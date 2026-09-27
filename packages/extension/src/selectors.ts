// Every selector the filler uses to find YouTube Studio's upload dialog fields, in one place.
//
// Checked against the live Studio page on 2026-09-27 (read-only, on a video's Details editor,
// which uses the same components as the upload dialog's Details step): the title and
// description boxes, the thumbnail input, the playlist trigger, the audience, Show more, the
// "AI use" radios, the Tags chip bar and the A/B Testing button are the ids, names and
// aria-labels seen there, listed first. What was NOT inspected: the list the playlist trigger
// opens and the dialog A/B Testing opens; their selectors are still educated guesses.
// `test/fixtures/studio-upload.html` mirrors the same structure. When a field stops filling,
// inspect it and put the new selector in front of the field's list (each field lists several,
// tried in order). See docs/studio-extension.md.
//
// The filler never touches Studio's Next, Save, Schedule or Publish buttons; `forbidden` lists
// them so the tests can check that nothing the filler clicks is one of them.

export interface FieldSelectors {
  // What the toast calls the field when it can't be found: "the Tags field".
  readonly label: string;
  readonly selectors: readonly string[];
}

// The dialog the details are filled in. Its title box only appears once a video file is in.
export const uploadDialog: FieldSelectors = {
  label: "the upload dialog",
  selectors: ["ytcp-uploads-dialog", "#dialog.ytcp-uploads-dialog", "tp-yt-paper-dialog#dialog"],
};

// Title and description are contenteditable `div#textbox`es inside Studio's
// `ytcp-social-suggestions-textbox`, not inputs.
export const title: FieldSelectors = {
  label: "the Title field",
  selectors: [
    "ytcp-social-suggestions-textbox#title-textarea div#textbox[contenteditable]",
    "#title-textarea #textbox[contenteditable]",
    '#textbox[contenteditable][aria-label^="Add a title"]',
  ],
};

export const description: FieldSelectors = {
  label: "the Description field",
  selectors: [
    "ytcp-social-suggestions-textbox#description-textarea div#textbox[contenteditable]",
    "#description-textarea #textbox[contenteditable]",
    '#textbox[contenteditable][aria-label^="Tell viewers about your video"]',
  ],
};

// The single thumbnail's file input ("Upload file" under Thumbnail).
export const thumbnailInput: FieldSelectors = {
  label: "the Thumbnail upload",
  selectors: [
    "ytcp-video-custom-still-editor ytcp-thumbnail-uploader input#file-loader[type=file]",
    "ytcp-thumbnail-uploader input#file-loader[type=file]",
    "ytcp-thumbnails-compact-editor-uploader input#file-loader[type=file]",
    'ytcp-video-metadata-editor input[type=file][accept*="image"]',
  ],
};

// A/B Testing (what Studio shows where "Test & compare" was): the button beside the title that
// opens Studio's title and thumbnail test. Its dialog was not inspected, so the inputs below are
// guesses: an image file input in a known test dialog, else in any open dialog other than the
// thumbnail's own input.
export const abTestButton: FieldSelectors = {
  label: "A/B Testing",
  selectors: [
    "ytcp-button#ab-test-button",
    'button#preview-button[aria-label="A/B Testing"]',
    "ytcp-button#test-and-compare-button",
  ],
};
export const abTestInputs: FieldSelectors = {
  label: "the A/B Testing thumbnail uploads",
  selectors: [
    'ytcp-ab-test-dialog input[type=file][accept*="image"]',
    'ytcp-thumbnails-test-and-compare-dialog input[type=file][accept*="image"]',
    'tp-yt-paper-dialog[opened] input[type=file][accept*="image"]:not(#file-loader)',
  ],
};

// `ytcp-video-metadata-playlists` holds a `ytcp-dropdown-trigger` that opens a checkbox list.
// The list itself was not inspected: its dialog, row, name, checkbox and Done selectors are
// guesses, which is why a row is also matched by its whole text.
export const playlistTrigger: FieldSelectors = {
  label: "the Playlists field",
  selectors: [
    'ytcp-video-metadata-playlists ytcp-dropdown-trigger[aria-label="Select playlists"]',
    "ytcp-video-metadata-playlists ytcp-dropdown-trigger",
    '[aria-label="Select playlists"]',
  ],
};
export const playlistDialog: FieldSelectors = {
  label: "the playlist list",
  selectors: ["ytcp-playlist-dialog", "#playlists-dialog", "ytcp-playlist-dialog-lit"],
};
// One row per playlist inside the list: a checkbox whose label is the playlist's name.
export const playlistItems: FieldSelectors = {
  label: "the playlists",
  selectors: ["ytcp-checkbox-group", "#items li", "li"],
};
export const playlistItemName: FieldSelectors = {
  label: "a playlist's name",
  selectors: [".checkbox-label", "span.label", "label"],
};
export const playlistItemCheckbox: FieldSelectors = {
  label: "a playlist's checkbox",
  selectors: ["ytcp-checkbox-lit", "tp-yt-paper-checkbox", '[role="checkbox"]'],
};
// The playlist list's own Done, searched inside the list only. Not the upload's.
export const playlistDone: FieldSelectors = {
  label: "the playlist list's Done button",
  selectors: [".done-button", 'ytcp-button[label="Done"]', 'ytcp-button[aria-label="Done"]'],
};

// Radios are `tp-yt-paper-radio-button`s told apart by their `name`; the chosen one gets the
// class `iron-selected` and the `checked` attribute.
export const notForKids: FieldSelectors = {
  label: 'the "No, it\'s not made for kids" choice',
  selectors: [
    '#audience tp-yt-paper-radio-button[name="VIDEO_MADE_FOR_KIDS_NOT_MFK"]',
    'tp-yt-paper-radio-button[name="VIDEO_MADE_FOR_KIDS_NOT_MFK"]',
    '[name="VIDEO_MADE_FOR_KIDS_NOT_MFK"]',
  ],
};

// "AI use" (it was "Altered content"), behind Show more, in `div#altered-content`.
export const alteredYes: FieldSelectors = {
  label: 'the "Yes" answer to AI use',
  selectors: [
    '#altered-content tp-yt-paper-radio-button[name="VIDEO_HAS_ALTERED_CONTENT_YES"]',
    'tp-yt-paper-radio-button[name="VIDEO_HAS_ALTERED_CONTENT_YES"]',
    'tp-yt-paper-radio-button[aria-label="Yes, AI was used"]',
  ],
};
export const alteredNo: FieldSelectors = {
  label: 'the "No" answer to AI use',
  selectors: [
    '#altered-content tp-yt-paper-radio-button[name="VIDEO_HAS_ALTERED_CONTENT_NO"]',
    'tp-yt-paper-radio-button[name="VIDEO_HAS_ALTERED_CONTENT_NO"]',
    `tp-yt-paper-radio-button[aria-label="No, AI wasn't used"]`,
  ],
};

// "Show more", which reveals AI use, Tags and the other advanced fields. It is a toggle; its
// aria-label says which way it goes ("Show advanced settings" while they are hidden).
export const showMore: FieldSelectors = {
  label: "the Show more button",
  selectors: [
    'ytcp-button#toggle-button[aria-label="Show advanced settings"]',
    "ytcp-video-metadata-editor ytcp-button#toggle-button",
    "ytcp-button#toggle-button",
  ],
};

// Tags are chips in a `ytcp-chip-bar`: typing a tag, then a comma or Enter, makes a chip.
export const tags: FieldSelectors = {
  label: "the Tags field",
  selectors: [
    "ytcp-form-input-container#tags-container ytcp-chip-bar#chip-bar input#text-input",
    "#tags-container input#text-input",
    'input#text-input[aria-label="Tags"]',
    'input[aria-label="Tags"]',
  ],
};
// The chips already in the bar, so a second fill doesn't type a tag twice.
export const tagChips: FieldSelectors = {
  label: "the tags already added",
  selectors: [
    "ytcp-chip-bar#chip-bar ytcp-chip",
    "#tags-container ytcp-chip",
    "#chip-bar [role=listitem]",
  ],
};

// Buttons the filler must never press: the upload's own Next, Back, Save, Schedule and Publish.
export const forbidden: readonly string[] = [
  "#next-button",
  "#back-button",
  "#done-button",
  "#save-button",
  "#schedule-button",
  "#publish-button",
];

// The first element any of a field's selectors finds, searched in `root`.
export function findField(root: ParentNode, field: FieldSelectors): Element | null {
  for (const selector of field.selectors) {
    const found = root.querySelector(selector);
    if (found !== null) return found;
  }
  return null;
}

export function findAll(root: ParentNode, field: FieldSelectors): readonly Element[] {
  for (const selector of field.selectors) {
    const found = [...root.querySelectorAll(selector)];
    if (found.length > 0) return found;
  }
  return [];
}
