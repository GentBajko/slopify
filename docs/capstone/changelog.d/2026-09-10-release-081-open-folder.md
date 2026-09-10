## 2026-09-10 - release: 0.8.1 output folders
key: release/0.8.1/open-folder
- Added Open folder beside every shared chapter download, including image collections and subtitle exports.
- POST /api/projects/:id/open-folder resolves a recorded asset to its containing directory; invalid and missing assets do not invoke the native launcher. Cross-origin requests are refused.
- Native launch uses argument arrays with no shell. WSL translates the path through wslpath before invoking Windows Explorer; macOS uses open and Linux uses xdg-open.
- The frontend reports launcher failures inline and retains the download action.
- Coverage includes folder resolution, invalid assets, origin refusal, launcher failures, platform command arguments, and download UI interactions. Windows CI includes folder command and file route tests.
- uiux/screens/03-project.md absorbs the new download action.
- Verification: 1,909 tests pass with one platform skip; lint, type checking and production build pass. Native file managers were not launched by automated tests.
