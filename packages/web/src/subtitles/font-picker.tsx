import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useId, useRef } from "react";
import { useApp } from "@/app-context";
import { Label } from "@/components/ui/label";
import { type FontSummary, fontsKey, listFonts, uploadFont } from "./api";

export function FontPicker({
  value,
  onPick,
  onUploading,
}: {
  readonly value: string;
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
        <div className="min-w-0 basis-full">
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
        <div className="min-w-0 basis-full">
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
    </div>
  );
}
