import { useEffect, useState, useSyncExternalStore } from "react";
import { useApp } from "@/app-context";
import { Button } from "@/components/kit/button";
import { Dialog } from "@/components/kit/dialog";
import { flushDrafts, prepareReload } from "@/lib/draft-store";

// The app was upgraded underneath this tab: `npx slopify@latest` replaced the process that
// served this bundle, and the version header on the last response no longer matches the one
// this tab loaded from. The tab is stale, so it says so instead of carrying on against an API
// it was not built for. Unsaved edits are written to this browser the moment it opens and again
// on Reload, so the reload loses nothing: each editor offers its draft back when reopened.
export function VersionPrompt({ reload }: { readonly reload: () => void }) {
  const { version } = useApp();
  const serving = useSyncExternalStore(version.subscribe, version.staleAt, version.staleAt);
  const open = serving !== undefined;
  const [kept, setKept] = useState(0);
  useEffect(() => {
    if (open) setKept(flushDrafts());
  }, [open]);

  const caught = `This tab was loaded before the update. Version ${serving ?? ""} is running now; reload to catch up.`;
  return (
    <Dialog
      open={open}
      dismissible={false}
      title="Slopify was updated"
      description={
        kept === 0
          ? caught
          : `${caught} Your unsaved ${kept === 1 ? "edit is" : "edits are"} kept in this browser and offered back when you open ${kept === 1 ? "it" : "them"} again after the reload.`
      }
      footer={
        <Button
          // The tab is stale and this is its only control, as on the first-run notice.
          autoFocus
          variant="primary"
          onClick={() => {
            prepareReload();
            reload();
          }}
        >
          Reload
        </Button>
      }
    />
  );
}
