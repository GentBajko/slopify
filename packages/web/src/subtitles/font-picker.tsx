import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useId, useRef, useState } from "react";
import { useApp } from "@/app-context";
import { Label } from "@/components/ui/label";
import { type FontSummary, fontsKey, fontUrl, listFonts, uploadFont } from "./api";

export function FontPicker({
  value,
  fontSize,
  onPick,
  onUploading,
}: {
  readonly value: string;
  readonly fontSize: number;
  readonly onPick: (id: string) => void;
  readonly onUploading: (pending: boolean) => void;
}) {
  const { api } = useApp();
  const queryClient = useQueryClient();
  const id = useId();
  const uploadId = useId();
  const fonts = useQuery({ queryKey: fontsKey, queryFn: () => listFonts(api), staleTime: 60_000 });
  const uploaded = useMutation({
    mutationFn: (file: File) => uploadFont(api, file),
    onSuccess: ({ font }) => {
      queryClient.setQueryData<{ readonly fonts: readonly FontSummary[] }>(fontsKey, (before) => ({
        fonts: [...(before?.fonts ?? []).filter((one) => one.id !== font.id), font],
      }));
      void queryClient.invalidateQueries({ queryKey: fontsKey });
    },
  });
  const pick = useRef(onPick);
  pick.current = onPick;
  const notify = useRef(onUploading);
  notify.current = onUploading;
  useEffect(() => {
    notify.current(uploaded.isPending);
  }, [uploaded.isPending]);
  useEffect(() => () => notify.current(false), []);
  const listed = fonts.data?.fonts ?? [];
  const unknown = value !== "default" && !listed.some((font) => font.id === value);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[180px] flex-1">
          <Label htmlFor={id} className="mb-1">
            Subtitle font
          </Label>
          <select
            id={id}
            value={value}
            disabled={uploaded.isPending}
            onChange={(event) => onPick(event.target.value)}
            className="h-8 w-full rounded-control border border-line2 bg-panel2 px-[10px] text-small text-ink"
          >
            {!listed.some((font) => font.id === "default") ? (
              <option value="default">Default font · bundled</option>
            ) : null}
            {unknown ? <option value={value}>{value} · saved font</option> : null}
            {listed.map((font) => (
              <option key={font.id} value={font.id}>
                {font.name} · {font.source}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-[180px] flex-1">
          <Label htmlFor={uploadId} className="mb-1">
            Upload font (.ttf or .otf)
          </Label>
          <input
            id={uploadId}
            type="file"
            accept=".ttf,.otf,font/ttf,font/otf"
            disabled={uploaded.isPending}
            className="w-full text-small text-ink2 file:mr-2 file:rounded-control file:border file:border-line2 file:bg-panel2 file:px-2 file:py-1 file:text-ink"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) uploaded.mutate(file, { onSuccess: ({ font }) => pick.current(font.id) });
            }}
          />
        </div>
      </div>
      {uploaded.isPending ? (
        <p role="status" className="text-small text-ink2">
          Uploading font…
        </p>
      ) : null}
      {uploaded.error ? (
        <p role="alert" className="text-small text-red">
          {uploaded.error.message}
        </p>
      ) : null}
      {fonts.error ? (
        <p role="alert" className="text-small text-red">
          Could not load fonts. {fonts.error.message}
        </p>
      ) : null}
      <FontPreview url={fontUrl(api, value)} fontSize={fontSize} />
    </div>
  );
}

function FontPreview({ url, fontSize }: { readonly url: string; readonly fontSize: number }) {
  const family = `subtitle-preview-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (typeof FontFace === "undefined" || !document.fonts) return;
    let active = true;
    const font = new FontFace(family, `url(${JSON.stringify(url)})`);
    setFailed(false);
    void font
      .load()
      .then((loaded) => {
        if (active) document.fonts.add(loaded);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
      document.fonts.delete(font);
    };
  }, [family, url]);
  return (
    <div>
      <div
        role="img"
        aria-label="Subtitle style preview"
        className="flex min-h-[110px] items-end justify-center overflow-hidden rounded-control border border-line bg-screen px-5 pt-8 pb-4 text-center text-white"
        style={{ fontFamily: `"${family}", sans-serif` }}
      >
        <span
          style={{
            fontSize: `${Math.max(8, Math.min(60, Number.isFinite(fontSize) ? fontSize / 2 : 24))}px`,
            lineHeight: 1.25,
            textShadow:
              "-1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000, 0 2px 3px #000",
          }}
        >
          Every story begins with a word.
        </span>
      </div>
      <p className="mt-1 text-label text-ink3">
        Style preview at reduced scale.
        {failed ? " Font preview unavailable; showing a fallback." : ""}
      </p>
    </div>
  );
}
