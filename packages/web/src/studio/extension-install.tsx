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

// The extension's Download and its three install steps, for the browser picked (this one at
// first). The zips ship inside Slopify, so nothing is fetched from anywhere else. The last step
// is the pairing, done with the token in Settings → YouTube Studio.
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
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <Segmented
          label="Browser"
          value={browser}
          onChange={setBrowser}
          tip="settings.studio.install"
          options={(["chrome", "firefox"] as const).map((value) => ({
            value,
            label: browserLabels[value],
          }))}
        />
        <FileLink href={studioExtensionUrl(api, browser)} download={filename}>
          <DownloadIcon aria-hidden="true" className="size-4 shrink-0" strokeWidth={1.75} />
          {`Download for ${browser === "chrome" ? "Chrome" : "Firefox"}`}
        </FileLink>
      </div>
      <ol aria-label="Install steps" className="m-0 flex list-decimal flex-col gap-1 pl-5">
        {browser === "chrome" && unpacked !== undefined && unpacked !== null ? (
          <>
            <li>
              Open <Code>chrome://extensions</Code> (Edge: <Code>edge://extensions</Code>), turn on
              Developer mode, press Load unpacked and pick this folder:{" "}
              <span className="inline-flex flex-wrap items-center gap-2">
                <Code>{unpacked.path}</Code>
                <Button
                  variant="quiet"
                  size="small"
                  onClick={() => {
                    void navigator.clipboard
                      .writeText(unpacked.path)
                      .then(() => notify("Folder path copied.", "success"))
                      .catch(() =>
                        notify("Couldn't copy the folder path. Select it and copy it.", "error"),
                      );
                  }}
                >
                  <CopyIcon aria-hidden="true" className="size-4" strokeWidth={1.75} />
                  Copy
                </Button>
              </span>
            </li>
            <li>
              Nothing to download: Slopify puts each new version of the extension in that folder
              when it updates, and the extension switches to it by itself once you haven't used it
              for 45 minutes.
            </li>
          </>
        ) : browser === "chrome" ? (
          <>
            <li>
              Press Download for Chrome, then unzip <Code>{filename}</Code> into a folder you keep:
              the browser loads the extension from there.
            </li>
            <li>
              Open <Code>chrome://extensions</Code> (Edge: <Code>edge://extensions</Code>), turn on
              Developer mode, press Load unpacked and pick that folder.
            </li>
          </>
        ) : (
          <>
            <li>
              Press Download for Firefox. It needs Firefox 128 or newer; keep the zip, you pick it
              in the next step.
            </li>
            <li>
              Open <Code>about:debugging#/runtime/this-firefox</Code>, press Load Temporary Add-on
              and pick <Code>{filename}</Code>. Firefox removes it when it restarts; load it again
              then.
            </li>
          </>
        )}
        <li>
          Pair it: press Copy beside the pairing token in Settings → YouTube Studio, click the
          Slopify extension's toolbar button, paste the token and press Pair.
        </li>
      </ol>
    </div>
  );
}
