// Every selector the filler uses to find YouTube Studio's upload dialog fields, in one place.
//
// Checked against the live Studio page on 2026-09-27 (read-only, on a video's Details editor,
// which uses the same components as the upload dialog's Details step): the title and
// description boxes, the thumbnail input, the playlist trigger and the list it opens, the
// audience, Show more, the "AI use" radios, the Tags chip bar, the A/B Testing button and the
// dialog it opens are the ids, classes and aria-labels seen there, listed first. Studio's
// overlays (the playlist list, the A/B Testing dialog) did NOT carry an `opened` attribute
// while showing, so the filler goes by whether they are laid out, never by `[opened]`.
// Not inspected: the upload dialog itself, and anything past the A/B dialog's "Set test".
// `test/fixtures/studio-upload.html` mirrors the same structure. When a field stops filling,
// inspect it and put the new selector in front of the field's list (each field lists several,
// tried in order). See docs/studio-extension.md.
//
// The filler never touches Studio's Next, Save, Schedule or Publish buttons, the playlist
// list's Save, or the A/B dialog's Set test; `forbidden` and `forbiddenLabels` list them so the
// filler refuses them and the tests can check it.

export interface FieldSelectors {
  // What the toast calls the field when it can't be found: "the Tags field".
  readonly label: string;
  readonly selectors: readonly string[];
  // An element inside this is never the field, whichever selector found it.
  readonly exclude?: string;
}

// The dialog the details are filled in. Its title box only appears once a video file is in.
export const uploadDialog: FieldSelectors = {
  label: "the upload dialog",
  selectors: ["ytcp-uploads-dialog", "#dialog.ytcp-uploads-dialog", "tp-yt-paper-dialog#dialog"],
};

// The upload dialog's first step, "Drag and drop video files to upload" with Select files: its
// file input, which takes the video. Not inspected on the live page yet (see the header);
// `ytcp-uploads-file-picker` holds Studio's one video input, named Filedata. Thumbnail inputs
// take images, so an input for images is never this one.
export const videoInput: FieldSelectors = {
  label: "the video file picker",
  selectors: [
    "ytcp-uploads-file-picker input[type=file]",
    'input[type=file][name="Filedata"]',
    'ytcp-uploads-dialog input[type=file]:not([accept*="image"])',
  ],
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

// The single thumbnail's file input ("Upload file" under Thumbnail), in the metadata editor.
// The A/B Testing dialog holds three more `ytcp-thumbnail-uploader input#file-loader`s, so
// anything inside it is excluded.
export const thumbnailInput: FieldSelectors = {
  label: "the Thumbnail upload",
  selectors: [
    "ytcp-video-metadata-editor ytcp-video-custom-still-editor ytcp-thumbnail-uploader input#file-loader[type=file]",
    "ytcp-video-custom-still-editor ytcp-thumbnail-uploader input#file-loader[type=file]",
    "ytcp-video-metadata-editor ytcp-thumbnails-compact-editor-uploader input#file-loader[type=file]",
    'ytcp-video-metadata-editor input[type=file][accept*="image"]',
  ],
  exclude: "ytcp-creator-experiment-create-dialog",
};

// A/B Testing (what Studio shows where "Test & compare" was): the button beside the title.
// Checked live: `.click()` from a script did NOT open the dialog, a real pointer click did, so
// the filler sends the whole pointer sequence to the inner button.
export const abTestButton: FieldSelectors = {
  label: "A/B Testing",
  selectors: [
    'ytcp-button#ab-test-button button#preview-button[aria-label="A/B Testing"]',
    'button#preview-button[aria-label="A/B Testing"]',
    "ytcp-button#ab-test-button",
    "ytcp-button#test-and-compare-button",
  ],
};
// The dialog it opens (titled "A/B Testing", headed "Test and compare your thumbnails and
// titles"). Checked live; its paper-dialog has no `opened` attribute while showing. The host
// element may stay on the page while the dialog is closed, so only the paper-dialog, which is
// laid out just while it shows, tells whether it opened.
export const abTestDialog: FieldSelectors = {
  label: "the A/B Testing dialog",
  selectors: [
    "ytcp-creator-experiment-create-dialog ytcp-dialog tp-yt-paper-dialog#dialog",
    "ytcp-creator-experiment-create-dialog tp-yt-paper-dialog",
  ],
};
// Its mode chips: #chip-0 "Title only" (the default), #chip-1 "Thumbnail only", #chip-2 "Title
// and thumbnail". They carry no aria-selected. The filler picks "Thumbnail only" by its text
// (`abThumbnailOnlyText`), with the id as the fallback.
export const abTestChips: FieldSelectors = {
  label: "the A/B Testing modes",
  selectors: ["ytcp-static-chip-bar ytcp-chip", "ytcp-chip"],
};
export const abThumbnailOnlyText = "Thumbnail only";
export const abThumbnailOnlyChip: FieldSelectors = {
  label: 'the A/B Testing "Thumbnail only" choice',
  selectors: ["ytcp-static-chip-bar ytcp-chip#chip-1", "ytcp-chip#chip-1"],
};
// Checked live on 2026-10-02 (a video's Details editor): the chips are `role=radio` with
// `aria-checked`, and every mode shows three rows (`.ytcpCreatorExperimentCreateDialogExperimentOption`),
// each with its title box ("Add title 1", 2, 3; row 1 holds the video's title) and, with
// thumbnails in the test, its `ytcp-thumbnail-uploader`.
export const abTitleOnlyText = "Title only";
export const abTitleOnlyChip: FieldSelectors = {
  label: 'the A/B Testing "Title only" choice',
  selectors: ["ytcp-static-chip-bar ytcp-chip#chip-0", "ytcp-chip#chip-0"],
};
export const abBothText = "Title and thumbnail";
export const abBothChip: FieldSelectors = {
  label: 'the A/B Testing "Title and thumbnail" choice',
  selectors: ["ytcp-static-chip-bar ytcp-chip#chip-2", "ytcp-chip#chip-2"],
};
// The three title boxes, in row order: contenteditable `div#textbox`es like the Details title.
export const abTestTitles: FieldSelectors = {
  label: "the A/B Testing titles",
  selectors: [
    "ytcp-creator-experiment-create-dialog .ytcpCreatorExperimentCreateDialogTitleField div#textbox[contenteditable]",
    'ytcp-creator-experiment-create-dialog #textbox[contenteditable][aria-label^="Add title"]',
  ],
};
// With Thumbnail only chosen: three uploaders, "Thumbnail 1 (required)", "Thumbnail 2
// (required)" and "Thumbnail 3", each a `ytcp-thumbnail-uploader` holding an
// `input#file-loader[type=file]` (the same id three times, not multiple). Taken in document
// order: thumbnails 1, 2 and 3 go into slots 1, 2 and 3.
export const abTestInputs: FieldSelectors = {
  label: "the A/B Testing thumbnail uploads",
  selectors: [
    "ytcp-creator-experiment-create-dialog ytcp-thumbnail-uploader input[type=file]",
    'ytcp-creator-experiment-create-dialog input[type=file][accept*="image"]',
  ],
};

// `ytcp-video-metadata-playlists` holds a `ytcp-dropdown-trigger` that opens the playlist list.
// All checked live: the list is `ytcp-playlist-dialog` > `tp-yt-paper-dialog` (no `opened`
// attribute while showing) holding `ytcp-checkbox-group#playlists-list` > `div#checkbox-group`
// > `ul` > `tp-yt-iron-list` > `div#items[role=list]`, one `ytcp-ve` per playlist. The
// iron-list renders its rows lazily, only once the list shows, so the filler waits for them.
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
  // The paper-dialog, not its host, which may stay on the page while the list is closed.
  selectors: ["ytcp-playlist-dialog tp-yt-paper-dialog", "ytcp-playlist-dialog [role=dialog]"],
};
// One row per playlist: `ytcp-ve` > `li.row` > `label.ytcp-checkbox-label`, which holds the
// checkbox and the name.
export const playlistItems: FieldSelectors = {
  label: "the playlists",
  selectors: ["#items li.row", "#items > ytcp-ve", '[role="list"] li.row'],
};
// `span.checkbox-label#checkbox-label-N` > `span.label.label-text` holds the playlist's name.
export const playlistItemName: FieldSelectors = {
  label: "a playlist's name",
  selectors: [".checkbox-label .label-text", ".label-text", ".checkbox-label"],
};
// `ytcp-checkbox-lit#checkbox-N` wraps `div#checkbox[role=checkbox]`, whose aria-checked is
// "true" once ticked, and a hidden `input[type=checkbox]`.
export const playlistItemCheckbox: FieldSelectors = {
  label: "a playlist's checkbox",
  selectors: [
    'ytcp-checkbox-lit #checkbox[role="checkbox"]',
    '[role="checkbox"][aria-checked]',
    "ytcp-checkbox-lit",
  ],
};
// The playlist list's own Done, searched inside the list only. Not the upload's. The list also
// has a Save (`ytcp-button.save-button`), which the filler never presses (see `forbidden`), a
// New playlist (`ytcp-button.new-playlist-button`) and a search bar (`ytcp-search-bar`).
export const playlistDone: FieldSelectors = {
  label: "the playlist list's Done button",
  selectors: [
    "ytcp-button.done-button",
    ".done-button",
    'ytcp-button[label="Done"]',
    'ytcp-button[aria-label="Done"]',
  ],
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

// Buttons the filler must never press: the upload's own Next, Back, Save, Schedule and Publish,
// and the playlist list's Save (checked live: `ytcp-button.save-button`, disabled until
// something changes; the list is closed with its Done instead).
export const forbidden: readonly string[] = [
  "#next-button",
  "#back-button",
  "#done-button",
  "#save-button",
  "#schedule-button",
  "#publish-button",
  "ytcp-button.save-button",
];
// Buttons refused by their text or aria-label, where no id or class was read: the A/B Testing
// dialog's "Set test" (bottom right), which the person presses after checking the pictures.
export const forbiddenLabels: readonly string[] = ["Set test"];

const allowed = (field: FieldSelectors) => (element: Element) =>
  field.exclude === undefined || element.closest(field.exclude) === null;

// The first element any of a field's selectors finds, searched in `root`.
export function findField(root: ParentNode, field: FieldSelectors): Element | null {
  for (const selector of field.selectors) {
    const found = [...root.querySelectorAll(selector)].find(allowed(field));
    if (found !== undefined) return found;
  }
  return null;
}

export function findAll(root: ParentNode, field: FieldSelectors): readonly Element[] {
  for (const selector of field.selectors) {
    const found = [...root.querySelectorAll(selector)].filter(allowed(field));
    if (found.length > 0) return found;
  }
  return [];
}
