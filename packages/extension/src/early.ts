// Runs on every Studio page before Studio's own scripts (`run_at: document_start`). A page the
// extension opened for a task carries it after "#" ("#slopify-stats=1&p=…&s=0"); Studio's
// router turns an unknown "#…" into a path and shows "Oops, something went wrong". So the task
// is kept in this tab's session storage and the "#…" removed before Studio reads the address;
// `content.ts` reads it from there (`taskParams`).

const hash = location.hash.replace(/^#/, "");
if (hash.startsWith("slopify-")) {
  try {
    sessionStorage.setItem("slopify.task", hash);
  } catch {
    // Without session storage the task can't be kept; the page loads as usual.
  }
  history.replaceState(history.state, "", `${location.pathname}${location.search}`);
}
