import type { Output } from "@app/slices/storage/model.js";
import { type ReactElement, type ReactNode, useEffect, useRef, useState } from "react";
import { useCommand } from "@/components/kit/command-palette";
import { ConfirmDialog } from "@/components/kit/dialog";
import { useToast } from "@/components/kit/toast";
import { intents, useIntent } from "@/lib/intents";
import type { BodyProps } from "./body.js";
import { confirmationFor } from "./confirmations.js";
import { useOutputChange } from "./output-change.js";

interface ChangeRequest {
  readonly image: Output;
  readonly name: string;
  readonly nonce: number;
}

// "Make image 3 again" and "Make on-screen card 2 again" from the palette, for every image
// whether or not its group is expanded, and "Regenerate image 3 in Cleopatra" run from another
// screen (`components/global-commands.tsx`). Both ask first, as the tile's "Make this image
// again" does. An image's number is its place in the slideshow, the "#3" on its frame.
export function useRegenerateByNumber(
  project: BodyProps["project"],
  images: readonly Output[],
  cards: readonly Output[],
  actions: BodyProps["actions"],
  busy: boolean,
): ReactNode {
  const notify = useToast();
  const [request, setRequest] = useState<ChangeRequest | undefined>();
  const pick = (kind: "image" | "card", count: number | undefined): void => {
    const list = kind === "image" ? images : cards;
    const noun = kind === "image" ? "image" : "on-screen card";
    if (count === undefined) {
      notify(`Type the ${noun}'s number with the command, for example "make ${noun} 3 again".`);
      return;
    }
    const image = list.find((one) => one.meta.index === count);
    if (image === undefined) {
      const numbers = list.flatMap((one) => (one.meta.index === undefined ? [] : [one.meta.index]));
      notify(
        numbers.length === 0
          ? `${project.title} has no ${noun}s yet, so there is no ${noun} ${String(count)} to make again. They appear under Images once the run makes them.`
          : `${project.title} has no ${noun} ${String(count)}: its ${noun}s are numbered ${String(Math.min(...numbers))} to ${String(Math.max(...numbers))}. Type one of those, or press Make this image again on it in Images.`,
        "error",
      );
      return;
    }
    setRequest((last) => ({
      image,
      name: `${noun[0]?.toUpperCase() ?? ""}${noun.slice(1)} ${String(count)}`,
      nonce: (last?.nonce ?? 0) + 1,
    }));
  };
  useCommand({
    id: "project.image.regenerate",
    title: "Make an image again",
    numbered: (count) => `Make image ${String(count)} again`,
    group: "This project",
    context: project.title,
    keywords: ["image", "picture", "regenerate", "redraw", "remake"],
    searchOnly: true,
    run: (count) => pick("image", count),
  });
  useCommand({
    id: "project.card.regenerate",
    title: "Make an on-screen card again",
    numbered: (count) => `Make on-screen card ${String(count)} again`,
    group: "This project",
    context: project.title,
    keywords: ["card", "figure", "table", "regenerate", "redraw", "remake"],
    searchOnly: true,
    run: (count) => pick("card", count),
  });
  useIntent(intents.regenerateImage(project.id), (count) => pick("image", count));
  return request === undefined ? null : (
    <RequestedChange key={request.nonce} request={request} actions={actions} busy={busy} />
  );
}

// Acts once the project's revision has loaded: opens the confirm (or Edit project, for a
// project with revisions), or says why it cannot yet.
function RequestedChange({
  request,
  actions,
  busy,
}: {
  readonly request: ChangeRequest;
  readonly actions: BodyProps["actions"];
  readonly busy: boolean;
}): ReactElement {
  const notify = useToast();
  const change = useOutputChange(request.image, actions, busy);
  const acted = useRef(false);
  useEffect(() => {
    if (acted.current || !change.ready) return;
    acted.current = true;
    if (change.unavailable)
      notify(
        `${request.name} can't be made again while work on this project is running. Wait until it finishes, then run the command again or press Make this image again on it in Images.`,
        "error",
      );
    else change.act("regenerate-image");
  }, [change, notify, request.name]);
  const copy =
    change.asking === undefined
      ? undefined
      : confirmationFor({
          kind: change.asking,
          outputId: request.image.id,
          now: change.now,
          price: change.price,
        });
  return (
    <ConfirmDialog
      open={change.asking !== undefined}
      tone="primary"
      title={copy?.title ?? ""}
      consequence={copy?.consequence ?? ""}
      confirmLabel={copy?.verb ?? ""}
      cancelLabel="Keep it"
      pending={actions.pending}
      onConfirm={change.confirm}
      onCancel={change.dismiss}
    />
  );
}
