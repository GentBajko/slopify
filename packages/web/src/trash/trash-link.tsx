import type { TrashKind } from "@app/slices/trash/model.js";
import { useQuery } from "@tanstack/react-query";
import { Trash2Icon } from "lucide-react";
import type { ReactElement } from "react";
import { useApp } from "@/app-context";
import { ButtonLink } from "@/components/kit/link";
import { readTrash, trashKey } from "./api";

// "Trash (3)" in a page header: how many of this page's things wait in the trash, opening
// Settings → Trash. Nothing while there are none, so a page with an empty trash is not one
// button longer.
export function TrashLink({
  kinds,
}: {
  readonly kinds: readonly TrashKind[];
}): ReactElement | null {
  const { api } = useApp();
  const trash = useQuery({ queryKey: trashKey, queryFn: () => readTrash(api), retry: false });
  const count = (trash.data ?? []).filter((item) => kinds.includes(item.kind)).length;
  if (count === 0) return null;
  return (
    <ButtonLink variant="quiet" to="/settings" search={{ section: "trash" }}>
      <Trash2Icon aria-hidden="true" strokeWidth={1.75} />
      {`Trash (${String(count)})`}
    </ButtonLink>
  );
}
