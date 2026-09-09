import type { ReactNode } from "react";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export function External({
  href,
  children,
}: {
  readonly href: string;
  readonly children: ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="text-ink underline underline-offset-2"
    >
      {children}
    </a>
  );
}

export function Example({ text }: { readonly text: string }) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  return (
    <div className="space-y-2">
      <p className="select-text rounded-control border border-line2 bg-panel2 p-3 text-small leading-relaxed">
        {text}
      </p>
      <Button
        onClick={() => {
          setFailed(false);
          if (!navigator.clipboard) {
            setFailed(true);
            return;
          }
          void navigator.clipboard.writeText(text).then(
            () => setCopied(true),
            () => setFailed(true),
          );
        }}
      >
        {copied ? "Copied" : "Copy example"}
      </Button>
      {failed ? <p role="status">Select the example above and copy it manually.</p> : null}
    </div>
  );
}
