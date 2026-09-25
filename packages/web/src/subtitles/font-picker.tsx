import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type ReactElement, useEffect, useId, useRef } from "react";
import { useApp } from "@/app-context";
import { Label } from "@/components/ui/label";
import { type FontSummary, fontsKey, listFonts, uploadFont } from "./api";

export interface ControlledFontUpload {
  readonly pending: boolean;
  readonly error: string | undefined;
  readonly pick: (file: File) => void;
}
interface FontPickerProps {
  readonly upload?: ControlledFontUpload;
  readonly value: string;
  readonly onPick: (id: string) => void;
  readonly onUploading: (pending: boolean) => void;
}
export function FontPicker(props: FontPickerProps): ReactElement {
  return props.upload ? (
    <FontPickerFields value={props.value} onPick={props.onPick} upload={props.upload} />
  ) : (
    <SelfManagedFontPicker {...props} />
  );
}
function SelfManagedFontPicker({ value, onPick, onUploading }: FontPickerProps): ReactElement {
  const { api } = useApp();
  const queryClient = useQueryClient();
  const uploaded = useMutation({
    mutationFn: (file: File) => uploadFont(api, file),
    onSuccess: ({ font }) => {
      queryClient.setQueryData<{ readonly fonts: readonly FontSummary[] }>(fontsKey, (before) => ({
        fonts: [...(before?.fonts ?? []).filter((one) => one.id !== font.id), font],
      }));
      void queryClient.invalidateQueries({ queryKey: fontsKey });
    },
  });
  const uploading = uploaded.isPending;
  const pick = useRef(onPick);
  pick.current = onPick;
  const notify = useRef(onUploading);
  notify.current = onUploading;
  useEffect(() => {
    notify.current(uploading);
  }, [uploading]);
  useEffect(() => () => notify.current(false), []);
  return (
    <FontPickerFields
      value={value}
      onPick={onPick}
      upload={{
        pending: uploading,
        error: uploaded.error?.message,
        pick: (file) => uploaded.mutate(file, { onSuccess: ({ font }) => pick.current(font.id) }),
      }}
    />
  );
}
function FontPickerFields({
  value,
  onPick,
  upload,
}: {
  readonly value: string;
  readonly onPick: (id: string) => void;
  readonly upload: ControlledFontUpload;
}): ReactElement {
  const { api } = useApp();
  const id = useId();
  const uploadId = useId();
  const fonts = useQuery({ queryKey: fontsKey, queryFn: () => listFonts(api), staleTime: 60_000 });
  const uploading = upload.pending;
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
            data-play-field="subtitles.fontId"
            value={value}
            disabled={uploading}
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
            data-play-field="subtitles.fontUpload"
            type="file"
            accept=".ttf,.otf,font/ttf,font/otf"
            disabled={uploading}
            className="w-full text-small text-ink2 file:mr-2 file:rounded-control file:border file:border-line2 file:bg-panel2 file:px-2 file:py-1 file:text-ink"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) upload.pick(file);
            }}
          />
        </div>
      </div>
      {uploading ? (
        <p role="status" className="text-small text-ink2">
          Uploading font…
        </p>
      ) : null}
      {upload.error ? (
        <p role="alert" className="text-small text-red">
          {upload.error}
        </p>
      ) : null}
      {unknown && fonts.data ? (
        <p role="alert">Saved font is unavailable. Choose another font or upload it again.</p>
      ) : null}
      {fonts.error ? (
        <p role="alert" className="text-small text-red">
          The font list couldn't be loaded. {fonts.error.message}
        </p>
      ) : null}
    </div>
  );
}
