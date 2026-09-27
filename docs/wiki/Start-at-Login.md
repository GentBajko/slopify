# Start at Login

One switch makes Slopify start quietly in the background when you log in to your computer, so it is ready whenever you open your bookmark. It needs no administrator password, and turning it off removes exactly what it added.

**Where to find it:** Settings → **General** → **Start Slopify when I log in**. It is also offered once on the first-run screen and in the terminal.

## Turn it on

1. Open Settings → **General**.
2. Turn on **Start Slopify when I log in**.
3. The line under the switch confirms it and names the login entry it added.

From the next login, Slopify starts without opening a browser tab. Open it from your bookmark (`http://127.0.0.1:6969`) as usual.

Default: off.

## Turn it off

1. Open Settings → **General**.
2. Turn off **Start Slopify when I log in**.

The login entry is removed. The Slopify you are using keeps running until you stop it.

## Where you are asked

You are asked once, in whichever place comes first:

| Place | Question | Answers |
| --- | --- | --- |
| The terminal, the first time `npx @gentbajko/slopify` starts on an interactive terminal | `Start Slopify when you log in? (Y/n)` | Enter or `y` means yes; `n` means no. It is asked after Slopify is already running, so it never holds it up. |
| The first-run screen (step 3) | **Start Slopify when I log in** | **Start when I log in** or **No thanks** |
| After an update, when neither of those asked (an update started from the app has no terminal, and the first-run screen is only for new installs) | A one-time dialog, **Start Slopify when you log in?** | **Start when I log in** or **No thanks**. Closing it counts as No thanks. |

Answering in any of these places, or using the switch in Settings, ends the question for good.

### In scripts

Without an interactive terminal nothing is asked. Use a flag instead:

| Flag | What it does |
| --- | --- |
| `--autostart` | Turns the switch on. |
| `--no-autostart` | Turns the switch off. |

Unlike the question, the flags set the switch every time you give them.

## What it adds on each system

Two things: a small launcher in Slopify's data folder, and one login entry in your own account's start-up list that runs it.

| System | Login entry | Launcher |
| --- | --- | --- |
| Linux | `~/.config/autostart/slopify.desktop` (or `$XDG_CONFIG_HOME/autostart`) | `<data folder>/autostart/start-slopify.sh` |
| macOS | `~/Library/LaunchAgents/stream.slopify.app.plist` | `<data folder>/autostart/start-slopify.sh` |
| Windows | Registry `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`, value `Slopify` | `<data folder>\autostart\start-slopify.cmd` |

### Linux

A standard desktop autostart entry, which GNOME, KDE, Xfce, Cinnamon and most other desktops run at login. No systemd unit is used.

### macOS

A per-user LaunchAgent that runs at load. It takes effect at your next login; turning the switch on doesn't start a second Slopify beside the one you are using. Turning it off deletes the file. There is no keep-alive: if you quit Slopify, it stays quit until the next login.

### Windows

A value in your user's Run list. At login it opens Slopify in a minimised window in the taskbar; closing that window stops Slopify. A data folder whose path contains `%` can't be used, because Windows would read it as a variable. Start Slopify with another folder (for example `--data-dir C:\Slopify`) and turn the switch on there.

### WSL

Not available. Windows doesn't start Linux programs when you log in. Start Slopify from a Windows terminal instead and turn the switch on there.

### An entry you made yourself

If an entry with the same name exists and Slopify didn't write it, Slopify leaves it alone. Turning the switch on says so and names the file (on Windows, see Task Manager → Startup apps).

## How the launcher starts Slopify

`npx` keeps packages in a cache it may clean or move, so the login entry never points into it. It runs the launcher in the data folder, which starts, in this order:

1. your installed Slopify (`npm install -g`), when you don't run it through `npx`;
2. `npx` beside the Node you were using, asking for the exact version you were running. A pinned version starts offline once it is cached, and never jumps to a new release by itself;
3. `npx` from your `PATH`, the same way.

It starts Slopify with `--no-open`, and with the data folder, port and (when it isn't `127.0.0.1`) host that were in use when you turned the switch on, since no terminal passes them at login.

- If the Node it recorded is gone (after an nvm or Homebrew upgrade), it uses the `node` on your `PATH`.
- In-app updates still apply: the started version hands over to the newest one installed in the data folder. See [Updating and Patch Notes](Updating-and-Patch-Notes).
- Every start with the switch on rewrites the launcher, so it follows the Node, the install and the version you actually use.
- A Slopify started with a different `--data-dir` leaves the entry pointing where it was.

Output from login starts is added to `<data folder>/logs/autostart.log`. Look there if Slopify didn't come up after a login.

## Docker

In Docker the switch isn't used. The container restarts with Docker (`restart: unless-stopped`), so Slopify starts at login exactly when Docker does. Slopify never changes Docker's own settings.

1. The `--docker` installer asks `Start Slopify when you log in? (Y/n)` once (or takes `--autostart` / `--no-autostart`).
2. It reads, without changing, whether Docker starts by itself. With Docker Desktop (always on macOS and Windows, and on Linux when its settings file is there), that is Docker Desktop's own setting **Start Docker Desktop when you sign in**, read from its settings file. Otherwise it asks `systemctl is-enabled docker.service` for the system Docker, or `systemctl --user is-enabled docker.service` for rootless Docker.
3. If Docker doesn't start by itself, it prints how to turn that on: with Docker Desktop, "Turn on Docker Desktop → Settings → General → Start Docker Desktop when you sign in to your computer."; with Docker Engine, `sudo systemctl enable docker`, or `systemctl --user enable docker` for rootless Docker.

Settings → **General** and the first-run screen then show (the first-run screen only informs; there is nothing to switch):

| Line | Meaning |
| --- | --- |
| **Starts with Docker: yes** | Docker starts at boot or login, so Slopify does too. |
| **Starts with Docker: no** | Docker doesn't start by itself. The screen says where to change that. |
| **Starts with Docker: unknown** | The installer couldn't check, or you run the compose file yourself. |
| **Checked by the installer on …** | When it last looked. |

After changing Docker's setting, run `npx @gentbajko/slopify@latest --docker` again so it checks again. A compose file you run by hand has no record, so the screen says it can't know and points to Docker Desktop → Settings → General → Start Docker Desktop when you sign in, or `sudo systemctl enable docker` for Docker Engine.

## Tips

- Bookmark `http://127.0.0.1:6969` so you can open Slopify after login without a terminal.
- If you uninstall Slopify, turn the switch off first so no login entry is left behind. See [Uninstalling and Moving](Uninstalling-and-Moving).
- If you usually start Slopify with `--port` or `--data-dir`, turn the switch on from a Slopify started with those options; the launcher remembers them.

## Related pages

- [Install](Install)
- [Docker](Docker)
- [First Launch and Welcome](First-Launch-and-Welcome)
- [Updating and Patch Notes](Updating-and-Patch-Notes)
- [Settings Reference](Settings-Reference)
- [Troubleshooting](Troubleshooting)
