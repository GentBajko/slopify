import { useQuery } from "@tanstack/react-query";
import {
  createContext,
  type ReactElement,
  type ReactNode,
  useCallback,
  useContext,
  useId,
  useMemo,
  useState,
} from "react";
import { useApp } from "@/app-context";
import { helpScope, InfoTip } from "@/components/kit/info-tip";
import { cn } from "@/lib/utils";
import { type ChannelSummary, channelsQuery } from "./api.js";

// The channel the person is looking at, picked in the rail. Home, the calendar and Projects
// show only its work; "All channels" (null) shows everything. The choice is this browser's
// own and survives a reload; storage can be missing or throw, and the picker still works.

const storageKey = "slopify.channel";

interface CurrentChannel {
  // null is every channel.
  readonly channelId: string | null;
  readonly channel: ChannelSummary | undefined;
  readonly channels: readonly ChannelSummary[];
  readonly setChannelId: (id: string | null) => void;
  // Whether a project, schedule or template of this channel is in view.
  readonly includes: (channelId: string | null | undefined) => boolean;
}

const Context = createContext<CurrentChannel | undefined>(undefined);

function stored(): string | null {
  try {
    const value = window.localStorage.getItem(storageKey);
    return value === null || value === "" ? null : value;
  } catch {
    return null;
  }
}

export function CurrentChannelProvider({ children }: { readonly children: ReactNode }) {
  const { api } = useApp();
  const channels = useQuery(channelsQuery(api));
  const [picked, setPicked] = useState<string | null>(stored);
  const list = channels.data ?? [];
  // A channel deleted elsewhere reads as All channels rather than an empty screen.
  const channelId =
    picked !== null && channels.data !== undefined && !list.some((one) => one.id === picked)
      ? null
      : picked;
  const setChannelId = useCallback((id: string | null) => {
    setPicked(id);
    try {
      if (id === null) window.localStorage.removeItem(storageKey);
      else window.localStorage.setItem(storageKey, id);
    } catch {
      // Without storage the choice lasts until the page reloads.
    }
  }, []);
  const value = useMemo<CurrentChannel>(
    () => ({
      channelId,
      channel: list.find((one) => one.id === channelId),
      channels: list,
      setChannelId,
      includes: (id) => channelId === null || id === channelId,
    }),
    [channelId, list, setChannelId],
  );
  return <Context value={value}>{children}</Context>;
}

// Outside the provider (a screen rendered alone in a test) everything is in view.
const everything: CurrentChannel = {
  channelId: null,
  channel: undefined,
  channels: [],
  setChannelId: () => {},
  includes: () => true,
};

export function useCurrentChannel(): CurrentChannel {
  return useContext(Context) ?? everything;
}

// The rail's channel picker (and the phone's, on Home). A native select: it is a choice of
// one from a short list, and the platform's own menu is the most reachable one on a phone.
export function ChannelPicker({ className }: { readonly className?: string }): ReactElement {
  const current = useCurrentChannel();
  const id = useId();
  return (
    <div className={cn("flex flex-col gap-1", className)} {...helpScope}>
      <span className="flex items-center gap-1 px-2">
        <label htmlFor={id} className="sl-kicker">
          Channel
        </label>
        <InfoTip id="planning.channel.current" className="-my-1" />
      </span>
      <select
        id={id}
        className="sl-select"
        value={current.channelId ?? ""}
        onChange={(event) =>
          current.setChannelId(event.target.value === "" ? null : event.target.value)
        }
      >
        <option value="">All channels</option>
        {current.channels.map((channel) => (
          <option key={channel.id} value={channel.id}>
            {channel.name}
          </option>
        ))}
      </select>
    </div>
  );
}
