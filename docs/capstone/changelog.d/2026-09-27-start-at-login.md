# Start Slopify when I log in

- Settings → General has a "Start Slopify when I log in" switch. It uses your account's own start-up list, with no administrator password or systemctl: an XDG autostart entry on Linux, a LaunchAgent on macOS, a Run registry value on Windows. Slopify starts quietly, without a browser tab, and turning the switch off removes exactly what it added.
- The login entry runs a small launcher in the data folder, never the npx cache: the installed Slopify when there is one, otherwise the version that was running, through npx. It is rewritten on every start, so it follows Node and Slopify upgrades.
- The first-run screen and the terminal (`Start Slopify when you log in? (Y/n)`) ask once; `--autostart` and `--no-autostart` answer without asking.
- In Docker the screen says whether Docker itself starts at login, as the `--docker` installer found it, and where to turn that on. Slopify never changes Docker's settings.
