import { useEffect, useRef, useState } from "react";

// A PDF drawn page by page onto canvases with pdf.js, loaded only when a page shows one. The
// new pages are drawn off screen and put in place together, so an update never flashes
// empty, and the scroll position stays where the reader left it.
export function PdfPages({
  data,
  label,
  onDrawn,
}: {
  readonly data: Uint8Array | undefined;
  readonly label: string;
  readonly onDrawn?: (error: Error | undefined) => void;
}) {
  const holder = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const element = holder.current;
    if (element === null) return;
    const observer = new ResizeObserver(([entry]) => {
      setWidth(Math.floor(entry?.contentRect.width ?? 0));
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    const element = holder.current;
    if (element === null || data === undefined || width === 0) return;
    let stopped = false;
    void draw(data, width).then(
      (canvases) => {
        if (stopped) return;
        element.replaceChildren(...canvases);
        onDrawn?.(undefined);
      },
      (error: unknown) => {
        if (!stopped) onDrawn?.(error instanceof Error ? error : new Error(String(error)));
      },
    );
    return () => {
      stopped = true;
    };
  }, [data, width, onDrawn]);

  return (
    <div
      ref={holder}
      role="img"
      aria-label={label}
      className="flex flex-col gap-3 [&>canvas]:w-full [&>canvas]:shadow-[0_1px_4px_var(--color-shadow)]"
    />
  );
}

async function draw(data: Uint8Array, width: number): Promise<HTMLCanvasElement[]> {
  const pdfjs = await import("pdfjs-dist");
  const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  // pdf.js takes ownership of the buffer it is given, so it gets a copy.
  const task = pdfjs.getDocument({ data: data.slice() });
  const document = await task.promise;
  try {
    const ratio = window.devicePixelRatio || 1;
    const canvases: HTMLCanvasElement[] = [];
    for (let number = 1; number <= document.numPages; number += 1) {
      const page = await document.getPage(number);
      const viewport = page.getViewport({
        scale: (width * ratio) / page.getViewport({ scale: 1 }).width,
      });
      const canvas = window.document.createElement("canvas");
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      await page.render({ canvas, viewport }).promise;
      canvases.push(canvas);
    }
    return canvases;
  } finally {
    await task.destroy();
  }
}
