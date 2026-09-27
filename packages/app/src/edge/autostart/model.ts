// What Settings → General's "Start Slopify when I log in" switch shows, for both kinds of
// installation. The web client imports this type, so it stays free of Node imports.
export interface AutostartView {
  // "native": Slopify itself registers a per-user login entry. "docker": the container starts
  // whenever Docker does, so the switch only reports whether Docker starts at login.
  readonly kind: "native" | "docker";
  // False when the switch can't be used here; `summary` says why.
  readonly available: boolean;
  // Native: whether the login entry is there. Docker: whether Docker starts at login, or null
  // when that can't be known from inside the container.
  readonly enabled: boolean | null;
  // One plain sentence of the current state.
  readonly summary: string;
  // Native: the login entry this switch adds and removes (a file, or the registry value).
  readonly where: string | null;
  // Docker: where to turn Docker's own start at login on or off.
  readonly howTo: string | null;
  // Docker: when the installer last looked (ISO time), or null.
  readonly checkedAt: string | null;
  // The first-run screen offers the switch once, until it is answered here or in the terminal.
  readonly offer: boolean;
}

export interface AutostartBody {
  readonly enabled: boolean;
}

// The settings row that remembers the question was answered (on the first-run screen, in
// Settings or in the terminal), so it is never offered again.
export const autostartAnsweredKey = "autostart.answered";
