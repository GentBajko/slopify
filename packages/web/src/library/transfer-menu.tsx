import { ArrowDownUpIcon, DownloadIcon, UploadIcon } from "lucide-react";
import { type ReactElement, useRef } from "react";
import { Button } from "@/components/kit/button";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/kit/menu";

export interface TransferExport {
  readonly label: string;
  readonly run: () => void;
  readonly disabled?: boolean;
}

// Import or export: an occasional pair, so one quiet button in the tab's toolbar opens both
// rather than two more buttons beside New. Export selected sits in the selection bar instead.
export function TransferMenu({
  what,
  exports,
  accept,
  onFile,
  disabled = false,
}: {
  // "prompts": "Import prompts from a file".
  readonly what: string;
  readonly exports: readonly TransferExport[];
  readonly accept: string;
  readonly onFile: (file: File) => void;
  readonly disabled?: boolean;
}): ReactElement {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <Menu>
        <MenuTrigger asChild>
          <Button variant="quiet" disabled={disabled} disabledReason="Still loading">
            <ArrowDownUpIcon aria-hidden="true" className="size-[14px]" />
            Import or export
          </Button>
        </MenuTrigger>
        <MenuContent>
          {exports.map((one) => (
            <MenuItem key={one.label} disabled={one.disabled === true} onSelect={one.run}>
              <DownloadIcon aria-hidden="true" className="size-4" />
              {one.label}
            </MenuItem>
          ))}
          <MenuSeparator />
          <MenuItem onSelect={() => input.current?.click()}>
            <UploadIcon aria-hidden="true" className="size-4" />
            Import from a file…
          </MenuItem>
        </MenuContent>
      </Menu>
      <input
        ref={input}
        type="file"
        hidden
        accept={accept}
        aria-label={`Import ${what} from a file`}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file !== undefined) onFile(file);
        }}
      />
    </>
  );
}
