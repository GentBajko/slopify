# Subtitles in Slopify

1. In Play, enable narration or provide matching English audio and article text.
2. In Subtitles, choose **Subtitle files (.srt + .vtt)** or **Burn into video + files**.
3. For burned captions, select a bundled or system font, or upload a `.ttf` or `.otf` file (up to 32 MiB). Choose a size from 16 to 120 and a position: top, upper-middle, center, lower-middle or bottom. The side preview shows the selected font, size and position in a 16:9 or 9:16 frame.
4. Start the run. Slopify times the article against the actual narration on your computer. The first use downloads an approximately 95 MB English speech model; later runs work offline with the cached model. Allow roughly 1 GB of available memory during alignment. No extra API key, Python, or compiler is needed.
5. Download SRT/VTT beside the final export. Files mode adds an optional native caption track to the in-app video preview. Burned captions remain visible in the downloaded MP4.

For a completed project, open its final Video or Audio export section, set subtitles, and click **Save subtitles**. This rebuilds only the local export from saved narration and images. Changing font, size or position reuses word timing when the audio and spoken text are unchanged. A paused run saves these choices until Resume; pause an active run before editing. Failed alignment or rendering keeps the previous finished export.

Audio Off disables subtitles. Video Off produces WAV audio with separate subtitle files. Uploaded audio must match the article; substantial mismatches fail with a message to correct the transcript. Review timing and spelling before publishing. English is supported first; unusual pronunciations and non-English passages can fail alignment.

Fonts are copied into the completed project's caption assets, so an existing export can reuse its chosen font even after the original system font is removed. Installed fonts and uploaded fonts stay local. SRT/VTT are portable text/timing files and do not embed a font; the chosen font is used in burned video captions.

## Local model and licenses

Speech inference uses MIT-licensed `onnxruntime-web@1.24.3` in a separate WASM process. The runtime is installed with the package (about 138 MB on disk); model weights are downloaded lazily into `<data-dir>/models/english-subtitles/`.

Model: [Xenova/wav2vec2-base-960h](https://huggingface.co/Xenova/wav2vec2-base-960h/tree/a19f851b3d42865797e410752b4c570c871e4825), an ONNX conversion of [facebook/wav2vec2-base-960h](https://huggingface.co/facebook/wav2vec2-base-960h), licensed Apache-2.0. Pinned revision: `a19f851b3d42865797e410752b4c570c871e4825`. The quantized model is 95,286,046 bytes, SHA256 `cd5040c147381580ed73258143dd8e0c28e800a09e74ee42ee2b3e8cb4d760a3`; every cached/downloaded model is verified before use.

The bundled Barlow font uses the SIL Open Font License; its license and source record ship in `dist/assets/fonts/`. Uploaded/system font licensing remains with its author.
