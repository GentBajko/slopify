import { CopyIcon, DownloadIcon } from "lucide-react";
import { type ReactElement, useState } from "react";
import { useApp } from "@/app-context";
import { Button } from "@/components/kit/button";
import { FileLink } from "@/components/kit/link";
import { copyText } from "@/fixes/fix-actions";

// A failed step's own words, folded, with what support needs one press away: the words on the
// clipboard, and the app's diagnostics file.
export function ErrorDetails({ text }: { readonly text: string }): ReactElement {
  const { api } = useApp();
  const [copied, setCopied] = useState<boolean | undefined>();
  return (
    <details className="mt-1">
      <summary className="cursor-pointer">Error details</summary>
      <pre className="m-0 mt-1 max-h-48 overflow-auto whitespace-pre-wrap break-words font-mono text-small">
        {text}
      </pre>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Button
          size="small"
          variant="secondary"
          onClick={() => {
            void copyText(text).then(setCopied);
          }}
        >
          <CopyIcon aria-hidden="true" strokeWidth={1.75} />
          Copy details
        </Button>
        <FileLink
          href={`${api.origin}/api/diagnostics`}
          download="slopify-diagnostics.json"
          variant="secondary"
          size="small"
        >
          <DownloadIcon aria-hidden="true" strokeWidth={1.75} />
          Download diagnostics
        </FileLink>
        <span role="status" className="text-small text-ink-2">
          {copied === undefined
            ? ""
            : copied
              ? "Copied."
              : "Couldn't copy: the browser blocked the clipboard. Select the text above and copy it."}
        </span>
      </div>
    </details>
  );
}
