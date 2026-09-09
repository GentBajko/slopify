## 2026-09-10 - implement: local subtitles and fonts
key: implement/2026-09-10-subtitles-fonts@Q1
- What: Slopify0.6.0 adds free local English subtitles for new and existing narrated projects; the user chose to keep this release local after automatic approval review blocked publishing to an unnamed public destination.
- Approach: one local alignment port with a pinned MIT WASM runtime and lazy95MB Apache-2.0 wav2vec2 model;12second inference windows and bounded CTC preserve original word spelling and actual speech times. No paid caption API, Python or compiler required.
- Alternatives: native ONNX runtime rejected because default Linux CUDA downloads and IntelMac coverage weaken portability; heuristic text-duration allocation rejected because it cannot provide actual speech timing; paid subtitle services excluded by the request.
- Out of scope: languages beyond English, arbitrary transcript certainty, speech generation changes, subtitle editing/translation, model training, and a new timeline editor.
- Task1: website controls already deployed independently; package-generated zoom increased100→122.5% over unchanged slots in dd854de. Approved website footage unchanged.
- Task2: verified lazy model cache, abortable child inference, English normalization, mismatch detection and real narration proof.
- Task3: bundled Barlow/OFL, bounded system font discovery,32MiBTTF/OTF uploads, TTC face previews and per-export font snapshots.
- Task4: SRT/VTT/ASS artifacts, intro/body/outro timing and gaps, content-hash cache reuse, local final-stage rerender, paused saves, admission validation and rollback-safe export metadata commits.
- Task5: Play/project subtitle controls, font size/preview/upload, unsaved-change protection, actual-output-mode native VTT gating and interactive tutorial spotlight.
- Task6: version0.6.0, packaged worker/font/license/guide, website release copy and affected reference updates. Publication canceled by user; local branch retained.
- Diff: c4529f6..a3bf858; .github/workflows/ci.yml; package manifests/lock; app alignment/font/subtitle modules, admission/storage/video/API integration and tests; web Play/project/subtitle/tutorial surfaces; site index copy.
- Chapters refreshed:00-index,01-architecture,02-models,04-data-flow,05-dependencies,06-testing,07-operations.
- Scenarios absorbed:logic04-run-admission,11-video-assembly,14-storage-and-downloads,new17-subtitles; mockup01-marketing-page,06-play,08-project; uiux03-experience and README.
- Review: seven confirmed findings fixed (rendered mode metadata, async edit recheck, early missing-font refusal, hidden invalid styles, relative ffmpeg path, metadata-commit rollback and backup retention). Two subsequent independent review rounds reported no new material findings.
- Verification: canonical npmci,1662tests, lint, typecheck, production build, package contents and zero audit vulnerabilities. Actual68.3s/120word audio aligned17.7s;205s/360words aligned53.3s with728MiBpeakRSS. Real browser validates burned captions, system/uploaded fonts, SRT downloads and native VTT;1024px layout has no overflow. Whole-file media route's existing seek limitation remains; native captions work during ordinary playback.
- Remote status: no0.6push/tag/npm publication/site deployment, per user choice. Linux/Windows CI additions remain locally prepared.
