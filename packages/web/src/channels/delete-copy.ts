// What the delete confirmations for a channel, a cast member and an episode summary say. None
// of them goes to Settings → Trash: the server deletes them for good, so each says so plainly
// (Trash holds projects, prompts, intros and outros, templates and schedules).

const permanent = (what: string): string =>
  `It is deleted permanently: ${what} do not go to Settings → Trash, so it cannot be restored.`;

export const channelDeleteTitle = (name: string | undefined): string =>
  name === undefined ? "Delete this channel?" : `Delete the channel “${name}”?`;

export const channelDeleteConsequence = `${permanent("channels")} Its cast and their reference pictures, its episode summaries, its video memory and its brand settings go with it. Its projects move to the default channel and keep what they were made with.`;

export const castDeleteTitle = (name: string | undefined): string =>
  name === undefined ? "Delete this cast member?" : `Delete “${name}” from the cast?`;

export const castDeleteConsequence = `${permanent("cast members")} Its reference pictures go with it, and new videos stop using them. Videos already made keep the pictures they were started with.`;

export const episodeDeleteTitle = (title: string | undefined): string =>
  title === undefined
    ? "Delete this episode summary?"
    : `Delete the episode summary of “${title}”?`;

export const episodeDeleteConsequence = `${permanent("episode summaries")} New episodes stop being reminded of it. The video itself is not changed.`;
