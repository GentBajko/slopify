import { useNavigate } from "@tanstack/react-router";
import type { ToastAction } from "@/components/kit/toast";

// A toast can't hold a link, so one that sends the person to the trash carries this button:
// Open Trash, which opens Settings → Trash.
export function useOpenTrash(): ToastAction {
  const navigate = useNavigate();
  return {
    label: "Open Trash",
    run: () => void navigate({ to: "/settings", search: { section: "trash" } }),
  };
}
