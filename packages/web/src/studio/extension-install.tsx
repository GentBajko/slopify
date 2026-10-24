import type { StudioExtensionBrowser } from "@app/slices/studio/model.js";
import { useQuery } from "@tanstack/react-query";
import { CopyIcon, DownloadIcon } from "lucide-react";
import { type ReactElement, useState } from "react";
import { readStudioSettings, studioExtensionUrl } from "@/api";
import { useApp } from "@/app-context";
import { Button } from "@/components/kit/button";
import { Code } from "@/components/kit/field";
import { FileLink } from "@/components/kit/link";
import { Segmented } from "@/components/kit/switch";
import { useToast } from "@/components/kit/toast";

const browserLabels: Readonly<Record<StudioExtensionBrowser, string>> = {
  chrome: "Chrome, Edge, Brave",
  firefox: "Firefox",
};

function thisBrowser(): StudioExtensionBrowser {
  return typeof navigator !== "undefined" && /firefox/i.test(navigator.userAgent)
    ? "firefox"
    : "chrome";
}

// The extension's install steps for the browser picked (this one at first). Chrome, Edge and
// Brave load it from the folder Slopify keeps current, so there is nothing to download; Firefox
// (or a Chrome without that folder) loads the zip that ships inside Slopify. The last step is
// the pairing, done with the token on this page.
export function ExtensionInstall(): ReactElement {
  const { api } = useApp();
  const notify = useToast();
  const [browser, setBrowser] = useState<StudioExtensionBrowser>(thisBrowser);
  const filename = `slopify-studio-${browser}.zip`;
  // The folder Slopify keeps the Chrome extension in, current with every update.
  const unpacked = useQuery({
    queryKey: ["studio", "settings"],
    queryFn: () => readStudioSettings(api),
  }).data?.unpacked;
  const folder = browser === "chrome" ? unpacked?.path : undefined;
  const copy = (text: string, what: string): void => {
    void navigator.clipboard
      .writeText(text)
      .then(() => notify(`${what} copied.`, "success"))
      .catch(() =>
        notify(`Couldn't copy the ${what.toLowerCase()}. Select it and copy it.`, "error"),
      );
  };
  return (
    <div className="flex flex-col gap-3">
      <Segmented
        label="Browser"
        help="The browser you open YouTube Studio in."
        value={browser}
        onChange={setBrowser}
        options={(["chrome", "firefox"] as const).map((value) => ({
          value,
          label: browserLabels[value],
        }))}
      />
      <ol aria-label="Install steps" className="m-0 flex list-decimal flex-col gap-2 pl-5">
        {folder !== undefined ? (
          <>
            <li>
              Open <Code>chrome://extensions</Code> (Edge: <Code>edge://extensions</Code>) and turn
              on Developer mode.
            </li>
            <li>
              Press Load unpacked and pick this folder:
              <span className="mt-1 flex flex-wrap items-center gap-2">
                <Code className="min-w-0 break-all">{folder}</Code>
                <Button variant="quiet" size="small" onClick={() => copy(folder, "Folder path")}>
                  <CopyIcon aria-hidden="true" className="size-4" strokeWidth={1.75} />
                  Copy folder path
                </Button>
              </span>
            </li>
          </>
        ) : browser === "chrome" ? (
          <>
            <li className="flex flex-wrap items-center gap-2">
              <span>Download the extension and unzip it into a folder you keep.</span>
              <FileLink href={studioExtensionUrl(api, browser)} download={filename} size="small">
                <DownloadIcon aria-hidden="true" className="size-4 shrink-0" strokeWidth={1.75} />
                Download the zip
              </FileLink>
            </li>
            <li>
              Open <Code>chrome://extensions</Code> (Edge: <Code>edge://extensions</Code>), turn on
              Developer mode, press Load unpacked and pick that folder.
            </li>
          </>
        ) : (
          <>
            <li className="flex flex-wrap items-center gap-2">
              <span>Download the extension (Firefox 128 or newer) and keep the zip.</span>
              <FileLink href={studioExtensionUrl(api, browser)} download={filename} size="small">
                <DownloadIcon aria-hidden="true" className="size-4 shrink-0" strokeWidth={1.75} />
                Download the zip
              </FileLink>
            </li>
            <li>
              Open <Code>about:debugging#/runtime/this-firefox</Code>, press Load Temporary Add-on
              and pick <Code>{filename}</Code>. Firefox forgets it when it restarts; load it again
              then.
            </li>
          </>
        )}
        <li>
          Pair it: press Copy beside the pairing token on this page, click the Slopify extension's
          toolbar button, paste the token and press Pair.
        </li>
      </ol>
      {folder !== undefined ? (
        <p className="m-0 text-small text-ink-2">
          Updates arrive in that folder by themselves; the extension switches to a new version once
          you haven't used it for 45 minutes.
        </p>
      ) : null}
    </div>
  );
}
