// Where a thumbnail goes: Slopify never uploads to YouTube itself. The Slopify extension (or
// the person) puts the file into YouTube Studio's Thumbnail field in a desktop browser, so the
// limit that applies is Studio's desktop one, 50 MB. (The 2 MB limit is the YouTube mobile
// app's, which Slopify's files never go through.)
export const studioThumbnailMaxBytes = 50 * 1024 * 1024;

const megabytes = (bytes: number): string => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

// What stops YouTube Studio taking a thumbnail of this size, in words that say what to do;
// undefined when it fits.
export function thumbnailProblem(
  bytes: number,
  fix = "Save it smaller (for example as a JPEG), then choose it again under Replace provided thumbnail.",
): string | undefined {
  return bytes > studioThumbnailMaxBytes
    ? `This thumbnail is ${megabytes(bytes)}, and YouTube Studio takes thumbnails up to 50 MB. ${fix}`
    : undefined;
}
