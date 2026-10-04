import { useEffect, useId, useState } from "react";

// Loads a font file into the page under a family name of its own, for a preview drawn in it.
// `failed` says the browser could not read it, so the preview can say it shows a fallback.
export function usePreviewFont(url: string): { readonly family: string; readonly failed: boolean } {
  const family = `subtitle-preview-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (typeof FontFace === "undefined" || !document.fonts) return;
    let active = true;
    const font = new FontFace(family, `url(${JSON.stringify(url)})`);
    setFailed(false);
    void font
      .load()
      .then((loaded) => {
        if (active) document.fonts.add(loaded);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
      document.fonts.delete(font);
    };
  }, [family, url]);
  return { family, failed };
}
