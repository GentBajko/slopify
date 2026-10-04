import type { DocumentTheme } from "@app/slices/document/theme.js";
import { type ReactElement, useCallback, useEffect, useRef, useState } from "react";
import { previewDocumentTheme } from "@/api";
import { useApp } from "@/app-context";
import { Drawer } from "@/components/kit/drawer";
import { PdfPages } from "@/components/pdf-pages";

// A theme seen before it is picked: the sample article the theme editor shows, laid out by the
// same renderer a project's PDF uses, with its page count. It runs on this computer and costs
// nothing, so it is made each time the drawer opens.
export function DocumentThemePreview({
  open,
  name,
  values,
  onClose,
}: {
  readonly open: boolean;
  readonly name: string;
  readonly values: DocumentTheme | undefined;
  readonly onClose: () => void;
}): ReactElement | null {
  const { api } = useApp();
  const [pdf, setPdf] = useState<Uint8Array | undefined>(undefined);
  const [state, setState] = useState<"busy" | "idle" | "failed">("busy");
  const [failure, setFailure] = useState<string | undefined>(undefined);
  const [pages, setPages] = useState<number | undefined>(undefined);
  const holder = useRef<HTMLDivElement>(null);
  const key = open && values !== undefined ? JSON.stringify(values) : undefined;

  useEffect(() => {
    if (key === undefined) return;
    const controller = new AbortController();
    setState("busy");
    setPages(undefined);
    previewDocumentTheme(api, JSON.parse(key) as DocumentTheme, controller.signal)
      .then(async (blob) => new Uint8Array(await blob.arrayBuffer()))
      .then(
        (bytes) => {
          if (!controller.signal.aborted) setPdf(bytes);
        },
        (error: unknown) => {
          if (controller.signal.aborted) return;
          setFailure(error instanceof Error ? error.message : String(error));
          setState("failed");
        },
      );
    return () => controller.abort();
  }, [api, key]);

  const drawn = useCallback((error: Error | undefined) => {
    if (error !== undefined) {
      setFailure(error.message);
      setState("failed");
      return;
    }
    setPages(holder.current?.querySelectorAll("canvas").length);
    setState("idle");
  }, []);

  const status =
    values === undefined
      ? "This theme has no preview: it is retired. Pick another theme to see it."
      : state === "busy"
        ? "Laying out the sample article…"
        : state === "failed"
          ? `The preview couldn't be made: ${failure ?? "unknown error"}. Close and press Preview again.`
          : `The sample article takes ${String(pages ?? 0)} page${pages === 1 ? "" : "s"} with this theme. Your project uses its own text, so its count differs.`;

  return (
    <Drawer open={open} title={`Preview: ${name}`} onClose={onClose}>
      <p
        role="status"
        className={
          state === "failed" ? "m-0 mb-3 text-small text-danger" : "m-0 mb-3 text-small text-ink-2"
        }
      >
        {status}
      </p>
      <div ref={holder} className="rounded-media bg-sunken p-3">
        <PdfPages data={pdf} label={`The sample article laid out with ${name}`} onDrawn={drawn} />
      </div>
    </Drawer>
  );
}
