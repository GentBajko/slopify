import { useQuery } from "@tanstack/react-query";
import type { ComponentProps, ReactElement } from "react";
import { z } from "zod";
import { useApp } from "@/app-context";
import { AudioPlayer } from "@/components/kit/audio-player";
import { errorOf, understood } from "@/http";

// The audio player's waveform (`components/kit/audio-player.tsx`): a Slopify audio file's
// loudness, asked of the file's own URL with `?waveform=N` (`edge/http/waveform.ts`) and scaled
// so its loudest bar fills the track. Anything else plays with the thin rail.

// ceiling: bars drawn; the strip is at most 720 pixels wide, so about three pixels a bar.
const bars = 200;

const waveformSchema = z.object({ seconds: z.number(), peaks: z.array(z.number()) });

// The file's waveform URL, or undefined for audio that is not one of Slopify's files.
export function waveformUrl(src: string | undefined): string | undefined {
  if (src === undefined) return undefined;
  let url: URL;
  try {
    url = new URL(src, window.location.href);
  } catch {
    return undefined;
  }
  if (!url.pathname.startsWith("/files/")) return undefined;
  url.searchParams.set("waveform", String(bars));
  return url.toString();
}

export function useWaveform(src: string | undefined): readonly number[] | undefined {
  const { api } = useApp();
  const url = waveformUrl(src);
  const waveform = useQuery({
    queryKey: ["waveform", url],
    enabled: url !== undefined,
    // A file's loudness does not change; a replaced file comes with a new URL or a reload.
    staleTime: Number.POSITIVE_INFINITY,
    // No bars is no loss: the player keeps its thin rail.
    retry: false,
    queryFn: async () => {
      if (url === undefined) return [];
      const response = await api.fetch(url);
      if (!response.ok) throw errorOf(response, undefined);
      const { peaks } = understood(waveformSchema, await response.json());
      const loudest = Math.max(0, ...peaks);
      return loudest === 0 ? [] : peaks.map((peak) => peak / loudest);
    },
  });
  return waveform.data;
}

// The audio player with its file's waveform on the track once it has loaded.
export function WaveAudioPlayer(
  props: Omit<ComponentProps<typeof AudioPlayer>, "waveform">,
): ReactElement {
  return <AudioPlayer {...props} waveform={useWaveform(props.src)} />;
}
