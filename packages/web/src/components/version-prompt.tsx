import { useSyncExternalStore } from "react";
import { useApp } from "@/app-context";
import { Button } from "@/components/kit/button";
import { Dialog } from "@/components/kit/dialog";

// The app was upgraded underneath this tab: `npx slopify@latest` replaced the process that
// served this bundle, and the version header on the last response no longer matches the one
// this tab loaded from. The tab is stale, so it says so instead of carrying on against an API
// it was not built for.
export function VersionPrompt({ reload }: { readonly reload: () => void }) {
  const { version } = useApp();
  const serving = useSyncExternalStore(version.subscribe, version.staleAt, version.staleAt);

  return (
    <Dialog
      open={serving !== undefined}
      dismissible={false}
      title="Slopify was updated"
      description={`This tab was loaded before the update. Version ${serving ?? ""} is running now; reload to catch up.`}
      footer={
        <Button
          // The tab is stale and this is its only control, as on the first-run notice.
          autoFocus
          variant="primary"
          onClick={reload}
        >
          Reload
        </Button>
      }
    />
  );
}
