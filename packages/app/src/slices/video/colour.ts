// Every picture Slopify encodes is BT.709 at limited range, and says so: players and YouTube
// read an untagged HD stream as BT.709, while ffmpeg's own RGB to YUV conversion defaults to
// BT.601, which shifted every still's colours.

// The `scale` options that convert RGB to BT.709 YUV at limited range. ffmpeg 7.0 (the bundled
// one) does not carry colour properties between filters, so the conversion is asked for where
// it happens rather than left to the encoder's settings.
export const bt709Scale = "out_color_matrix=bt709:out_range=tv";

// The frames' own tags, set as they reach the encoder: ffmpeg 7.1 and later take the stream's
// primaries and transfer from the frames and ignore the encoder options for them. Tags only,
// no conversion.
export const bt709Frames =
  "setparams=colorspace=bt709:color_primaries=bt709:color_trc=bt709:range=tv";

// The encoder's stream tags.
export const bt709Tags: readonly string[] = [
  "-colorspace",
  "bt709",
  "-color_primaries",
  "bt709",
  "-color_trc",
  "bt709",
  "-color_range",
  "tv",
];
