import { useId } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Upload } from "@/play/state";

// What a stage set to Provide draws instead of its generation controls:
// a paste area for the text stages and a file pick for the rest, with the staging
// progress of each picked file under it.

const fileInput =
  "text-small text-ink2 file:mr-3 file:h-8 file:rounded-control file:border file:border-line2 file:bg-panel2 file:px-3 file:text-ink";

export function PasteArea({
  label,
  field,
  value,
  placeholder,
  problem,
  onChange,
}: {
  readonly label: string;
  readonly field?: string | undefined;
  readonly value: string;
  readonly placeholder: string;
  readonly problem: string | undefined;
  readonly onChange: (next: string) => void;
}) {
  const fieldId = useId();
  const noteId = useId();

  return (
    <div>
      <Label htmlFor={fieldId} className="mb-[5px]">
        {label}
      </Label>
      <Textarea
        id={fieldId}
        data-play-field={field}
        rows={6}
        value={value}
        placeholder={placeholder}
        aria-invalid={problem !== undefined}
        aria-describedby={problem === undefined ? undefined : noteId}
        onChange={(event) => {
          onChange(event.target.value);
        }}
      />
      {problem === undefined ? null : (
        <p id={noteId} className="mt-1 text-label text-red">
          {problem}
        </p>
      )}
    </div>
  );
}

export function FilePick({
  label,
  field,
  accept,
  multiple = false,
  uploads,
  problem,
  numbered = false,
  onPick,
  onRemove,
  onReattach,
}: {
  readonly label: string;
  readonly field?: string | undefined;
  readonly accept: string;
  readonly multiple?: boolean | undefined;
  readonly uploads: readonly Upload[];
  readonly problem: string | undefined;
  // Slideshow order is selection order, so the images say where they sit.
  readonly numbered?: boolean | undefined;
  readonly onPick: (files: readonly File[]) => void;
  readonly onReattach?: ((key: string, file: File) => void) | undefined;
  readonly onRemove: ((key: string) => void) | undefined;
}) {
  const fieldId = useId();
  const noteId = useId();

  return (
    <div>
      <Label htmlFor={fieldId} className="mb-[5px]">
        {label}
      </Label>
      <input
        id={fieldId}
        data-play-field={field}
        type="file"
        accept={accept}
        multiple={multiple}
        aria-invalid={problem !== undefined}
        aria-describedby={problem === undefined ? undefined : noteId}
        className={fileInput}
        onChange={(event) => {
          onPick([...(event.target.files ?? [])]);
          event.target.value = "";
        }}
      />
      {problem === undefined ? null : (
        <p id={noteId} className="mt-1 text-label text-red">
          {problem}
        </p>
      )}
      {uploads.length === 0 ? null : (
        <ul className="mt-2 flex flex-col gap-1">
          {uploads.map((upload, at) => (
            <li key={upload.key} className="flex flex-wrap items-center gap-3">
              {numbered ? <span className="engraved w-6 text-ink3">{String(at + 1)}</span> : null}
              <UploadRow upload={upload} />
              {upload.error !== undefined && onReattach ? (
                <label className="text-small text-ink2">
                  Reattach
                  <input
                    aria-label={`Reattach ${upload.name}`}
                    className="max-w-full"
                    type="file"
                    accept={accept}
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      event.target.value = "";
                      if (file) onReattach(upload.key, file);
                    }}
                  />
                </label>
              ) : null}
              {onRemove === undefined ? null : (
                <Button
                  variant="ghost"
                  className="ml-auto"
                  aria-label={`Remove ${upload.name}`}
                  onClick={() => {
                    onRemove(upload.key);
                  }}
                >
                  Remove
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function UploadRow({ upload }: { readonly upload: Upload }) {
  return (
    <span className="flex min-w-0 flex-wrap items-center gap-3 text-small [overflow-wrap:anywhere]">
      <span className={upload.error === undefined ? "text-ink" : "text-red"}>{upload.name}</span>
      {upload.error === undefined ? (
        <span className="engraved text-ink3">
          {upload.file === undefined ? "Copying" : "Staged"}
        </span>
      ) : (
        <span className="text-small text-red">{upload.error}</span>
      )}
    </span>
  );
}
