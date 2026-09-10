import type { AppUpdater } from "./model.js";

export function watchActivation(
  updater: AppUpdater,
  token: string,
  expired: () => Promise<void>,
  report: (message: string) => void,
): () => void {
  let checking = false;
  const until = Date.now() + 120_000;
  const timer = setInterval(() => {
    if (checking) return;
    checking = true;
    void updater
      .activate(token)
      .then(async (activated) => {
        if (activated) clearInterval(timer);
        else if (Date.now() >= until) {
          clearInterval(timer);
          report("The update was not committed; stopping the candidate server.");
          await expired();
        }
      })
      .catch(() => {
        report("The update activation marker could not be checked.");
      })
      .finally(() => {
        checking = false;
      });
  }, 250);
  timer.unref();
  return () => clearInterval(timer);
}
