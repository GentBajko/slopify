// The app's keyboard shortcuts, in one place so a key is never given twice. Each is bound
// through the command that shows it (`useCommand`'s `shortcut`), and the buttons that do the
// same thing carry it as `aria-keyshortcuts`. Letters without Ctrl wait while a field has
// focus; "G" then a letter goes somewhere. The list a person sees is the "?" sheet, and
// docs/design-system.md (Keyboard shortcuts).
export const shortcuts = {
  newVideo: ["C"],
  goHome: ["G", "H"],
  goProjects: ["G", "P"],
  goCalendar: ["G", "C"],
  goSchedules: ["G", "S"],
  goLibrary: ["G", "L"],
  goChannels: ["G", "K"],
  goSettings: ["G", ","],
  // A project's next action (Approve, Retry, Prepare upload…).
  nextAction: ["Shift", "N"],
  copyDescription: ["Shift", "D"],
  // Play: review the whole setup.
  reviewSetup: ["Ctrl", "Enter"],
  // Library editors.
  save: ["Ctrl", "S"],
} as const satisfies Record<string, readonly string[]>;
