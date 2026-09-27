import { useId } from "react";
import { helpScope, InfoTip } from "@/components/kit/info-tip";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { HelpId } from "@/help/catalog";
import type { Upload } from "@/play/state";

// What a stage set to Provide draws instead of its generation controls:
// a paste area for the text stages and a file pick for the rest, with the staging
// progress of each picked file under it.

const fileInput =
  "text-small text-ink-2 file:mr-3 file:h-8 file:rounded-control file:border file:border-line-strong file:bg-raised file:px-3 file:text-ink";

export function PasteArea({
  label,
  field,
  value,
  placeholder,
  problem,
  tip,
  onChange,
}: {
  readonly label: string;
  readonly field?: string | undefined;
  readonly value: string;
  readonly placeholder: string;
  readonly problem: string | undefined;
  // The info button beside the label, from the help catalogue.
  readonly tip?: HelpId | undefined;
  readonly onChange: (next: string) => void;
}) {
  const fieldId = useId();
  const noteId = useId();

  return (
    <div {...(tip === undefined ? {} : helpScope)}>
      <span className="mb-1 flex items-center gap-1">
        <Label htmlFor={fieldId}>{label}</Label>
        {tip === undefined ? null : <InfoTip id={tip} label={label} className="-my-1" />}
      </span>
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
        <p id={noteId} className="mt-1 text-label text-danger">
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
  disabled = false,
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
  // Kept on screen but not pickable while the step it belongs to is off.
  readonly disabled?: boolean | undefined;
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
      <Label htmlFor={fieldId} className="mb-1">
        {label}
      </Label>
      <input
        id={fieldId}
        data-play-field={field}
        type="file"
        accept={accept}
        multiple={multiple}
        disabled={disabled}
        aria-invalid={problem !== undefined}
        aria-describedby={problem === undefined ? undefined : noteId}
        className={fileInput}
        onChange={(event) => {
          onPick([...(event.target.files ?? [])]);
          event.target.value = "";
        }}
      />
      {problem === undefined ? null : (
        <p id={noteId} className="mt-1 text-label text-danger">
          {problem}
        </p>
      )}
      {uploads.length === 0 ? null : (
        <ul className="mt-2 flex flex-col gap-1">
          {uploads.map((upload, at) => (
            <li key={upload.key} className="flex flex-wrap items-center gap-3">
              {numbered ? <span className="engraved w-6 text-ink-3">{String(at + 1)}</span> : null}
              <UploadRow upload={upload} />
              {upload.error !== undefined && onReattach ? (
                <label className="text-small text-ink-2">
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
      <span className={upload.error === undefined ? "text-ink" : "text-danger"}>{upload.name}</span>
      {upload.error === undefined ? (
        <span className="engraved text-ink-3">
          {upload.file === undefined ? "Copying" : "Staged"}
        </span>
      ) : (
        <span className="text-small text-danger">{upload.error}</span>
      )}
    </span>
  );
}
