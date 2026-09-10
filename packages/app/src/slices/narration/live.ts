import type { AudioPreviewSink, AudioPreviewStore } from "../../kernel/audio-preview.js";
import type { ObserveTts } from "../../kernel/runner/providers.js";

export function observeNarration(
  store: AudioPreviewStore | undefined,
  projectId: string,
  key: string,
  label: string,
): ObserveTts | undefined {
  if (store === undefined) return undefined;
  let sink: AudioPreviewSink | undefined;
  return (event) => {
    switch (event.type) {
      case "start":
        sink = store.begin(projectId, key, label);
        break;
      case "chunk":
        sink?.append(event.bytes);
        break;
      case "complete":
        sink?.complete();
        break;
      case "interrupted":
        sink?.interrupt();
        break;
    }
  };
}
