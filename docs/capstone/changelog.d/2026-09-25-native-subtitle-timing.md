# Faster subtitle timing

- Subtitle timing now runs the speech model on the native ONNX Runtime (`onnxruntime-node` 1.24.3, CPU) instead of single-threaded WebAssembly. A 109-minute narration took 3.6 minutes on a 32-thread machine, down from 24.3 minutes. All 15,370 words aligned the same way with no skipped passages; 85% of word times are identical and almost all others moved by one 20 ms frame, because the native engine computes the quantized model's numbers slightly differently from WebAssembly. Its results do not depend on the thread count.
- It uses one session per job with 8 threads, or one less than the computer's CPU count when that is smaller. On the benchmark clip that ran 37× realtime; 16 threads ran 31× and 32 threads 20×, so it never goes above 8. Set `SLOPIFY_SUBTITLE_THREADS` to try a different count.
- If the speech engine cannot load, subtitle timing says so and asks you to reinstall Slopify. Intel Macs have no build of the engine; there it asks you to turn subtitles off.
- `onnxruntime-web` is no longer a dependency. The Docker image still installs with `--ignore-scripts`: the engine's CPU files ship inside the npm package for Linux x64 and arm64.
