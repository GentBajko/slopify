import { useSyncExternalStore } from "react";
import { useApp } from "@/app-context";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";

// The app was upgraded underneath this tab: `npx slopify@latest` replaced the process that
// served this bundle, and the version header on the last response no longer matches the one
// this tab loaded from. The tab is stale, so it says so instead of carrying on against an API
// it was not built for.
export function VersionPrompt({ reload }: { readonly reload: () => void }) {
  const { version } = useApp();
  const serving = useSyncExternalStore(version.subscribe, version.staleAt, version.staleAt);

  return (
    <Dialog open={serving !== undefined}>
      <DialogContent
        onEscapeKeyDown={(event) => {
          event.preventDefault();
        }}
        onInteractOutside={(event) => {
          event.preventDefault();
        }}
      >
        <DialogTitle>Slopify was updated</DialogTitle>
        <DialogDescription>
          {`This tab was loaded before the update. Version ${serving ?? ""} is running now; reload to catch up.`}
        </DialogDescription>
        <Button
          // The tab is stale and this is its only control, as on the first-run notice.
          autoFocus
          variant="play"
          size="play"
          onClick={reload}
        >
          Reload
        </Button>
      </DialogContent>
    </Dialog>
  );
}
