import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type ReactElement, useEffect, useId, useRef, useState } from "react";
import { useApp } from "@/app-context";
import { Input, Select } from "@/components/kit/field";
import { helpScope, InfoTip } from "@/components/kit/info-tip";
import { Label } from "@/components/ui/label";
import { type FontSummary, fontsKey, fontUrl, listFonts, uploadFont } from "./api";
import { usePreviewFont } from "./use-preview-font";

// More fonts than this and the filter box shows above the list.
const filterFrom = 12;

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
  // A computer can hold hundreds of system fonts; past a short list a filter box narrows the
  // select to the names typed, keeping the picked font in it.
  const [filter, setFilter] = useState("");
  const words = filter.trim().toLowerCase();
  const matches = (font: FontSummary): boolean =>
    `${font.name} ${font.family} ${font.source}`.toLowerCase().includes(words);
  const shown = words === "" ? listed : listed.filter((font) => font.id === value || matches(font));
  const noMatch = words !== "" && !listed.some(matches);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-0 basis-full" {...helpScope}>
          <div className="mb-1 flex items-center gap-1">
            <Label htmlFor={id}>Subtitle font</Label>
            <InfoTip id="project.subtitles.font" className="-my-1" />
          </div>
          {listed.length > filterFrom ? (
            <Input
              type="search"
              aria-label="Filter fonts"
              placeholder={`Filter ${String(listed.length)} fonts by name`}
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              className="mb-2 text-small"
            />
          ) : null}
          <Select
            id={id}
            data-play-field="subtitles.fontId"
            value={value}
            disabled={uploading}
            onChange={(event) => onPick(event.target.value)}
            className="text-small"
          >
            {!listed.some((font) => font.id === "default") ? (
              <option value="default">Default font · bundled</option>
            ) : null}
            {unknown ? <option value={value}>{value} · saved font</option> : null}
            {shown.map((font) => (
              <option key={font.id} value={font.id}>
                {font.name} · {font.source}
              </option>
            ))}
          </Select>
          {noMatch ? (
            <p className="m-0 mt-1 text-small text-ink-2">{`No font name contains "${filter.trim()}".`}</p>
          ) : null}
          <FontSample url={fontUrl(api, value)} />
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
            className="w-full text-small text-ink-2 file:mr-2 file:rounded-control file:border file:border-line-strong file:bg-sunken file:px-2 file:py-1 file:text-ink"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) upload.pick(file);
            }}
          />
        </div>
      </div>
      {uploading ? (
        <p role="status" className="text-small text-ink-2">
          Uploading font…
        </p>
      ) : null}
      {upload.error ? (
        <p role="alert" className="text-small text-danger">
          {upload.error}
        </p>
      ) : null}
      {unknown && fonts.data ? (
        <p role="alert">Saved font is unavailable. Choose another font or upload it again.</p>
      ) : null}
      {fonts.error ? (
        <p role="alert" className="text-small text-danger">
          The font list couldn't be loaded. {fonts.error.message}
        </p>
      ) : null}
    </div>
  );
}

// One line in the picked font, beside the list, so a font is seen before a render uses it.
function FontSample({ url }: { readonly url: string }): ReactElement {
  const { family, failed } = usePreviewFont(url);
  return (
    <figure aria-label="Font sample" className="m-0 mt-2">
      <span
        className="block truncate rounded-control bg-[var(--color-screen)] px-3 py-2 text-[20px] leading-tight text-white"
        style={{ fontFamily: `"${family}", sans-serif` }}
      >
        {failed
          ? "This font can't be shown here; a fallback is drawn."
          : "Every story begins with a word. 0123"}
      </span>
    </figure>
  );
}
