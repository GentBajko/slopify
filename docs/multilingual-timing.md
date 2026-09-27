# Word timing for languages other than English

Status: investigated 2026-09-27, **not implemented**. Word timing (forced alignment) stays
English-only. This page records why, what the options are, and what the work would take, so
the next attempt starts from facts rather than from the obvious-but-wrong candidate.

Everything that needs word timing is English-only today: word-by-word captions, SRT/VTT cues,
narration cuts and Shorts.

## How timing works today

- **Model:** `Xenova/wav2vec2-base-960h` (Apache-2.0), quantized ONNX, 95,286,046 bytes,
  pinned revision `a19f851`, SHA256-verified (`packages/app/src/adapters/alignment/cache.ts`).
  Downloaded lazily into `<data-dir>/models/english-subtitles/`, with three retries and
  progress mapped to 0–20 % of the job. The Docker image seeds it from
  `SLOPIFY_SUBTITLE_MODEL_SEED`, and `prefetch.ts` warms it at start-up under the worker lock.
- **Runtime:** `onnxruntime-node` (native CPU) in a forked worker (`worker.ts`, `runner.ts`),
  falling back to single-threaded `onnxruntime-web` WASM where there is no native build. Audio is
  decoded by ffmpeg to 16 kHz mono f32, then cut into 12 s windows with 2 s overlap. Each window
  is mean/variance normalised and run once.
- **Vocabulary:** 32 CTC labels (`vocabulary.ts`): blank, specials, `|` and upper-case `A–Z`
  plus `'`. That size is hard-coded, not read from the vocabulary: `logits.dims[2] !== 32`
  in `worker.ts`, `* 32` in `ctc.ts`, the loop over 32 labels in `window.ts#greedy`, and
  `[^A-Z]` / `[^A-Z']` filters in `worker.ts`, `window.ts` and `quality.ts`.
- **Text:** `text.ts` strips diacritics with NFKD, refuses any non-Latin letter ("Local
  subtitles currently support English speech and Latin-script names only."), upper-cases,
  and expands numbers, currency, `%`, `&`, `+` and acronyms with the English-only
  `numbers.ts`. Display words keep their original spelling.
- **Acceptance gates** were tuned on the English model: a window's mean word posterior must
  be at least 0.48, no more than 30 % of its words may score below 0.2, greedy-decoded speech must
  be within 42 % edit distance of the transcript (`quality.ts`), and the omission recovery
  needs anchors of 20 or more letters with confidence 0.75 or higher.
- **Fingerprints:** the operation id `wav2vec2-en-a19f851-v2-omissions` appears in
  `slices/rebuild/recipe-model.ts` (`localOperations`), in `recipe-exports.ts`
  (`subtitles:timing`, whose values already include `config.subtitles?.language ?? "en"`)
  and in the timing cache key in `slices/subtitles/prepare.ts#timingKey`.
- **Language of a project:** there is none. `subtitles.language` is `z.literal("en")`
  (`slices/subtitles/model.ts`, `play-drafts/schema.ts`, templates, fakes). TTS voices carry
  no language (the Cartesia adapter deliberately omits it), and `narration/chunk.ts`
  notes that a run has no language either.

## Candidate models

| Model | Licence | ONNX available | Size (download) | Coverage | Verdict |
|---|---|---|---|---|---|
| MMS_FA / `MahmoudAshraf/mms-300m-1130-forced-aligner` (and its ONNX ports, for example `onnx-community/mms-300m-1130-forced-aligner-ONNX`) | **CC-BY-NC-4.0** (torchaudio: "published … under CC-BY-NC 4.0"; HF card agrees) | yes: q4 241 MB, int8 317 MB, fp32 1.26 GB | 241 MB+ | 1,130 languages via uroman romanisation | **Ruled out:** non-commercial licence; Slopify is MIT and its output goes to monetisable YouTube channels |
| `facebook/mms-1b-all`, `mms-300m` | CC-BY-NC-4.0 | – | – | 1,100+ | Ruled out, same reason |
| torchaudio `VOXPOPULI_ASR_BASE_10K_{DE,FR,ES,IT}` | CC-BY-NC-4.0 | no | – | 4 | Ruled out |
| `voidful/wav2vec2-xlsr-multilingual-56`, ONNX port `NewComer00/wav2vec2-xlsr-multilingual-56-ONNX` @ `2d48b01` | Apache-2.0 (base `facebook/wav2vec2-large-xlsr-53` Apache-2.0; Common Voice CC0) | yes, but a community conversion (24 downloads) | q4 247,576,761 B; q4f16 202 MB; fp16 652 MB; fp32 1.30 GB | 56 Common Voice languages, a single model | **Best permissive fit**, not validated (see below) |
| `jonatasgrosman/wav2vec2-large-xlsr-53-<lang>` (what WhisperX uses per language) | Apache-2.0 | onnx-community q4/int8 ports for pt, ru, zh-CN; FinDIT-Studio fp32-only ports for de, fr, es, it, ja, ko (no licence field, 1.26 GB each) | about 240 MB per language (q4), 1.26 GB where only fp32 exists | one model per language | Good quality per language, but each language is a separate download of 240 MB to 1.26 GB, and the de/fr/es/it ports are fp32-only from an unknown uploader |
| `facebook/wav2vec2-xlsr-53-espeak-cv-ft` (phonemes), ONNX `qnighy/...-ONNX` | Apache-2.0 | yes: q4 241 MB | 241 MB | Any language espeak-ng can phonemise | Needs espeak-ng (GPL-3) for grapheme-to-phoneme, a native install on every platform; too heavy a dependency |
| Whisper (`onnx-community/whisper-*_timestamped`) | MIT | yes: base q4 about 140 MB total | 140 MB (base) to 300 MB+ (small) | 99 languages | Not CTC. Word times come from cross-attention DTW in a full encoder/decoder generation loop: a second pipeline, and coarser timing than forced CTC |

Romanisation (uroman) is only needed by MMS_FA, which is excluded anyway. The permissive
wav2vec2 candidates emit native characters, so Latin-script languages need no romanisation.
The multilingual-56 vocabulary has 9,913 labels, including 311 Latin letters with
their accented forms (`é`, `ß`, `ą`, `ř`, `ő`, `ș`, …) in both cases, the digits and a large CJK set.

## Why this was not shipped

1. **Unvalidated accuracy.** The multilingual-56 model reports Common Voice CER of 5.4 %
   (es), 6.5 % (de), 8.7 % (it), 10.4 % (ca), 12.1 % (pl), 12.6 % (cs), 13.9 % (fr), 16.3 %
   (pt) and 19.0 % (nl). Its English CER is 14.8 %, far worse than base-960h. The acceptance
   gates above (0.48 mean posterior, 42 % edit distance, 0.75 anchors) were tuned on the English
   model and a 32-way softmax. Over 9,913 labels the posteriors behave differently, and the q4
   quantization's effect on alignment is unknown. The English release was accepted only after
   real-narration proof (68 s / 120 words and 205 s / 360 words, 728 MiB peak RSS). An
   equivalent proof needs the 248 MB model downloaded and real non-English narration, which this
   session did not have permission to fetch or produce. Shipping untuned gates would give
   non-English users either false "audio does not match" failures or badly placed captions.
2. **Cost is 3 to 4 times higher.** XLSR-large has about 315 M parameters against 95 M for the base
   model. Expect roughly 3× the inference time (about 2.5 min for 3.5 min of audio) and
   an estimated 1.5–2.5 GB peak memory, against about 0.7 GB now. The SUBTITLES.md "allow 1 GB"
   guidance and the Docker memory sizing would change. All of this is estimated, not measured.
3. **Numbers are English-only.** `numbers.ts` verbalises digits in English. A German
   narration of "1990" says "neunzehnhundertneunzig", so any numeral would fail alignment unless
   each language gets its own number verbaliser, or a wildcard token that the CTC graph does not
   have today.
4. **There is no language to select by.** The feature needs a real language choice. That
   means widening `subtitles.language` from `z.literal("en")` in the model, the Play draft schema,
   templates and fakes, plus a picker in the Play and project subtitle controls. Every
   existing value stays `"en"`, so English fingerprints are unaffected. That part is safe but
   it is real UI work.

## Plan if this is picked up

1. **Validation first, and only with the user's go-ahead to download.** Fetch
   `onnx/model_q4.onnx` (and `model_fp16.onnx` for comparison) from the pinned revision above.
   Check that `onnxruntime-node` 1.30 and the WASM fallback both load `MatMulNBits`. Align 3–5
   real narrations each in de, es, fr, it and pt (TTS voices in those languages), measure time,
   RSS and caption placement, and re-tune the gates for this model only. Also compare
   `jonatasgrosman` per-language q4 where it exists. If quality at q4 is poor, use fp16
   (652 MB) or drop the plan.
2. **Parametrise the aligner** by an `AlignmentModel` descriptor: file (url, bytes, sha256),
   vocabulary, label count, text normaliser and gate thresholds. English passes today's
   constants unchanged. Replace the `32` and `[^A-Z]` literals with descriptor fields, and mask
   the multilingual logits to the chosen language's letters (as voidful's `lang_ids` does)
   before the log-softmax.
3. **Keep models apart.** Cache the new model in `<data-dir>/models/multilingual-subtitles/`
   (English path, seed and prefetch unchanged), downloaded on first non-English use with the same
   verification, retries and progress. Do not prefetch or seed it in Docker by default (248 MB+).
4. **Fingerprints:** keep `wav2vec2-en-a19f851-v2-omissions` for `language === "en"`. Add
   a new operation such as `wav2vec2-xlsr56-2d48b01-v1` to `localOperations`, and choose it in
   `recipe-exports.ts` and `prepare.ts#timingKey` by language. English recipes then hash
   byte-identically, and a test should pin that.
5. **Text:** a per-language normaliser (NFC, lower-case to match the vocabulary, keep
   in-vocabulary accented letters, drop punctuation), plus number verbalisers for the first
   languages (de, es, fr, it, pt). Otherwise refuse numerals with a plain error that names
   the word and says to write it out in words in the article.
6. **Languages:** start with the Latin-script languages that have low CER: es, de, it, ca,
   pl, cs, fr, pt, nl. Other languages keep today's behaviour, with an explanation that word
   timing supports English plus the listed languages.

Rough effort: about 1 day to validate, 2–3 days to parametrise the aligner and add tests, 1 day
for the language picker, schema and fingerprints, and 1–2 days for number verbalisers and docs.
