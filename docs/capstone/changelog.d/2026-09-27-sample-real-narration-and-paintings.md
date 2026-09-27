# The sample speaks and is painted

- "The Library of Alexandria" now has a real narration, spoken by Inworld's stock voice Tristan, with captions timed to it by the English aligner, in place of the ambient track.
- Its four scenes, their tall versions for the two shorts and the thumbnail are painterly documentary pictures made with the Codex CLI, in place of procedural art.
- Maintainers: `build-sample.mjs --assets <folder>` builds from a folder of pre-made narration and pictures, and `src/sample-build/paint.ts` paints the pictures with the Codex CLI. Without `--assets` the build stays free and local for CI.
