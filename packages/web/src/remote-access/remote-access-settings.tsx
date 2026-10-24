import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CopyIcon } from "lucide-react";
import type { ReactElement } from "react";
import { useApp } from "@/app-context";
import { CommandText } from "@/components/command-text";
import { Button } from "@/components/kit/button";
import { Callout, type CalloutTone } from "@/components/kit/callout";
import { FileLink } from "@/components/kit/link";
import { Switch } from "@/components/kit/switch";
import { useToast } from "@/components/kit/toast";
import { copyText } from "@/fixes/fix-actions";
import { type RemoteAccessView, readRemoteAccess, remoteAccessKey, setRemoteAccess } from "./api";
import { QrCode } from "./qr-code";

const title = "Open on my other devices (Tailscale)";

const tones: Partial<Record<RemoteAccessView["state"], CalloutTone>> = {
  failed: "danger",
  denied: "danger",
  funnel: "danger",
};

const linkLabel = (link: string): string =>
  link.includes("admin") ? "Open the Tailscale admin console" : "Download Tailscale";

// Settings → Remote access: one switch that has Tailscale serve Slopify's page on the
// person's tailnet, the address with a copy button and a QR code, and each problem with its fix.
export function RemoteAccessSettings(): ReactElement {
  const { api } = useApp();
  const notify = useToast();
  const client = useQueryClient();
  const view = useQuery({ queryKey: remoteAccessKey, queryFn: () => readRemoteAccess(api) });
  const change = useMutation({
    mutationFn: (next: { readonly enabled: boolean; readonly httpsPort?: number }) =>
      setRemoteAccess(api, next),
    onSuccess: (next) => client.setQueryData(remoteAccessKey, next),
  });
  const data = view.data;
  const copy = async (address: string): Promise<void> => {
    if (await copyText(address)) notify("Address copied.", "success");
    else
      notify(
        "The address wasn't copied: this browser blocked the clipboard. Select it and copy it yourself.",
        "error",
      );
  };
  const busy = change.isPending;
  const problem = data !== undefined && data.fix !== null && data.state !== "docker";
  return (
    <section className="flex max-w-prose flex-col gap-3">
      {view.error === null ? null : (
        <p role="alert" className="m-0 text-body text-danger">
          Remote access couldn't be checked: {view.error.message}
        </p>
      )}
      {data === undefined ? (
        view.error === null ? (
          <p role="status" className="m-0 text-ink-2">
            Checking Tailscale…
          </p>
        ) : null
      ) : (
        <>
          <Switch
            label={title}
            tip="settings.remote-access"
            checked={data.enabled}
            disabled={!data.available || !data.changeable || busy}
            describedBy="remote-access-summary"
            onChange={(enabled) => change.mutate({ enabled })}
          />
          <p id="remote-access-summary" role="status" className="m-0 text-small text-ink-2">
            {busy ? "Asking Tailscale…" : problem ? "" : <CommandText text={data.summary} />}
            {!data.changeable && data.available
              ? " Turn it on or off on the computer Slopify runs on."
              : ""}
          </p>
          {data.state === "docker" && data.fix !== null ? (
            <p className="m-0 text-small text-ink-2">
              <CommandText text={data.fix} />
            </p>
          ) : null}
          {data.address === null ? null : (
            <div className="flex flex-wrap items-start gap-4">
              <QrCode text={data.address} label={`QR code for ${data.address}`} />
              <div className="flex min-w-0 flex-1 basis-[220px] flex-col gap-2">
                <code className="sl-code py-2 break-all select-all">{data.address}</code>
                <div>
                  <Button
                    variant="secondary"
                    aria-label="Copy the remote address"
                    onClick={() => void copy(data.address ?? "")}
                  >
                    <CopyIcon aria-hidden="true" className="size-[14px] shrink-0" />
                    Copy address
                  </Button>
                </div>
                <p className="m-0 text-small text-ink-2">
                  Scan it with your phone's camera. The device must be signed in to the same
                  tailnet.
                </p>
              </div>
            </div>
          )}
          {problem ? (
            <Callout
              tone={tones[data.state] ?? "waiting"}
              title={<CommandText text={data.summary} />}
              actions={
                data.changeable ? (
                  <>
                    {data.suggestedPort === null ? null : (
                      <Button
                        variant="primary"
                        disabled={busy}
                        onClick={() =>
                          change.mutate({ enabled: true, httpsPort: data.suggestedPort ?? 443 })
                        }
                      >
                        Use port {data.suggestedPort}
                      </Button>
                    )}
                    {data.link === null ? null : (
                      <FileLink href={data.link} target="_blank" rel="noreferrer">
                        {linkLabel(data.link)}
                      </FileLink>
                    )}
                    <Button
                      variant={data.suggestedPort === null ? "primary" : "secondary"}
                      disabled={busy}
                      onClick={() => change.mutate({ enabled: data.enabled })}
                    >
                      Check again
                    </Button>
                  </>
                ) : undefined
              }
            >
              {data.fix === null ? null : <CommandText text={data.fix} />}
            </Callout>
          ) : null}
          {change.error === null ? null : (
            <p role="alert" className="m-0 text-small text-danger">
              {change.error.message}
            </p>
          )}
        </>
      )}
    </section>
  );
}
