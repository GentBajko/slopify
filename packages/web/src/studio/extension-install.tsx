import type { StudioExtensionBrowser } from "@app/slices/studio/model.js";
import { DownloadIcon } from "lucide-react";
import { type ReactElement, useState } from "react";
import { studioExtensionUrl } from "@/api";
import { useApp } from "@/app-context";
import { buttonClass } from "@/components/kit/button";
import { Code } from "@/components/kit/field";
import { Segmented } from "@/components/kit/switch";

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
  const [browser, setBrowser] = useState<StudioExtensionBrowser>(thisBrowser);
  const filename = `slopify-studio-${browser}.zip`;
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
        <a
          href={studioExtensionUrl(api, browser)}
          download={filename}
          className={buttonClass({ variant: "secondary" })}
        >
          <DownloadIcon aria-hidden="true" className="size-4 shrink-0" strokeWidth={1.75} />
          {`Download for ${browser === "chrome" ? "Chrome" : "Firefox"}`}
        </a>
      </div>
      <ol aria-label="Install steps" className="m-0 flex list-decimal flex-col gap-1 pl-5">
        {browser === "chrome" ? (
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
