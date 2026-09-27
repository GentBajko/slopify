// Every selector the filler uses to find YouTube Studio's upload dialog fields, in one place.
//
// UNVERIFIED AGAINST THE LIVE PAGE. Studio is a Polymer app whose markup changes from time to
// time, and these were written from knowledge of its upload dialog, not from the live page;
// `test/fixtures/studio-upload.html` is a hand-made copy of the same assumptions. When a field
// stops filling, open the upload dialog, inspect the field, and fix its entry here (and the
// fixture): each field lists several selectors, tried in order, so a new one can be added in
// front without losing the old ones. See docs/studio-extension.md.
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

export const title: FieldSelectors = {
  label: "the Title field",
  selectors: [
    "#title-textarea #textbox[contenteditable]",
    "ytcp-video-title #textbox[contenteditable]",
    '#textbox[contenteditable][aria-label^="Add a title"]',
  ],
};

export const description: FieldSelectors = {
  label: "the Description field",
  selectors: [
    "#description-textarea #textbox[contenteditable]",
    "ytcp-video-description #textbox[contenteditable]",
    '#textbox[contenteditable][aria-label^="Tell viewers about your video"]',
  ],
};

// The single thumbnail's file input ("Upload file" under Thumbnail).
export const thumbnailInput: FieldSelectors = {
  label: "the Thumbnail upload",
  selectors: [
    "ytcp-thumbnails-compact-editor-uploader input#file-loader[type=file]",
    "ytcp-thumbnail-uploader input#file-loader[type=file]",
    '#still-picker input[type=file][accept*="image"]',
    'ytcp-video-metadata-editor input[type=file][accept*="image"]',
  ],
};

// Test & Compare: the button under Thumbnail that opens a dialog taking up to three images.
export const testAndCompareButton: FieldSelectors = {
  label: "Test & compare",
  selectors: [
    "ytcp-button#test-and-compare-button",
    'ytcp-button[aria-label="Test & compare"]',
    'button[aria-label="Test & compare"]',
  ],
};
export const testAndCompareInputs: FieldSelectors = {
  label: "the Test & compare uploads",
  selectors: [
    'ytcp-thumbnails-test-and-compare-dialog input[type=file][accept*="image"]',
    'ytcp-test-and-compare-dialog input[type=file][accept*="image"]',
  ],
};

export const playlistTrigger: FieldSelectors = {
  label: "the Playlists field",
  selectors: [
    "ytcp-video-metadata-playlists ytcp-dropdown-trigger",
    "ytcp-video-metadata-playlists ytcp-text-dropdown-trigger",
    '[aria-label="Select playlists"]',
  ],
};
export const playlistDialog: FieldSelectors = {
  label: "the playlist list",
  selectors: ["ytcp-playlist-dialog", "#playlists-dialog"],
};
// One row per playlist inside the dialog: a checkbox whose label is the playlist's name.
export const playlistItems: FieldSelectors = {
  label: "the playlists",
  selectors: ["ytcp-playlist-dialog #items ytcp-checkbox-group", "ytcp-playlist-dialog li"],
};
export const playlistItemName: FieldSelectors = {
  label: "a playlist's name",
  selectors: [".checkbox-label", "span.label", "label"],
};
export const playlistItemCheckbox: FieldSelectors = {
  label: "a playlist's checkbox",
  selectors: ["ytcp-checkbox-lit", "tp-yt-paper-checkbox", '[role="checkbox"]'],
};
// The playlist dialog's own Done, which closes the list. Not the upload's.
export const playlistDone: FieldSelectors = {
  label: "the playlist list's Done button",
  selectors: [
    "ytcp-playlist-dialog .done-button",
    'ytcp-playlist-dialog ytcp-button[label="Done"]',
  ],
};

export const notForKids: FieldSelectors = {
  label: 'the "No, it\'s not made for kids" choice',
  selectors: [
    'tp-yt-paper-radio-button[name="VIDEO_MADE_FOR_KIDS_NOT_MFK"]',
    '[name="VIDEO_MADE_FOR_KIDS_NOT_MFK"]',
    "#audience [role=radio]:nth-of-type(2)",
  ],
};

// "Altered or synthetic content" (YouTube's help now calls it "AI use"): a Yes/No radio pair,
// assumed to sit among the fields Show more reveals. The least certain selectors here.
export const alteredYes: FieldSelectors = {
  label: 'the "Yes" answer to Altered content',
  selectors: [
    'tp-yt-paper-radio-button[name="VIDEO_HAS_ALTERED_CONTENT_YES"]',
    '[name="VIDEO_HAS_ALTERED_CONTENT_YES"]',
    "#altered-content [role=radio]:nth-of-type(1)",
  ],
};
export const alteredNo: FieldSelectors = {
  label: 'the "No" answer to Altered content',
  selectors: [
    'tp-yt-paper-radio-button[name="VIDEO_HAS_ALTERED_CONTENT_NO"]',
    '[name="VIDEO_HAS_ALTERED_CONTENT_NO"]',
    "#altered-content [role=radio]:nth-of-type(2)",
  ],
};

// "Show more", which reveals Tags among the other advanced fields.
export const showMore: FieldSelectors = {
  label: "the Show more button",
  selectors: [
    "ytcp-video-metadata-editor #toggle-button",
    'ytcp-button#toggle-button[aria-label="Show more"]',
  ],
};

export const tags: FieldSelectors = {
  label: "the Tags field",
  selectors: [
    "#tags-container input#text-input",
    "ytcp-form-input-container#tags-container input",
    'input[aria-label="Tags"]',
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
