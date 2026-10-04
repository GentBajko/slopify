# Where your files are

Slopify keeps two kinds of files apart:

- **Your files**: project folders (videos, images, narration, captions, documents), scheduled
  backups and anything Slopify saves for you. A new install keeps them in your Documents folder:

  ```
  <Documents>/Slopify/
    Projects/   one folder per project, and a hidden .render-cache with each project's last
                video clips (at most 30 GB in all), so a render after an edit only makes
                the clips that changed; safe to delete
    Backups/    scheduled backups (Settings → Backups), unless you pick another folder
    Exports/    files Slopify saves for you; downloads today go through the browser, so it
                stays empty and Slopify never cleans it
  ```

- **Slopify's own data**: the database, settings, provider keys, caption models, logs and
  uploads in progress stay in the hidden data folder (`~/.slopify`, or `--data-dir` /
  `SLOPIFY_DATA_DIR`).

Settings → Backup & storage → **Your files** shows the folders, with **Open folder**.

## Which Documents folder

| System | Documents is |
| --- | --- |
| Windows | The Documents known folder (`[Environment]::GetFolderPath('MyDocuments')`), so a Documents folder moved by OneDrive or in its Properties is followed. Falls back to `%USERPROFILE%\Documents`. |
| macOS | `~/Documents` |
| Linux | `xdg-user-dir DOCUMENTS`, then `XDG_DOCUMENTS_DIR` in `~/.config/user-dirs.dirs` (`$XDG_CONFIG_HOME`), then `~/Documents`. An answer that is the home folder itself counts as unset. |

The folder is created if it is missing.

## New and existing installs

The first 3.0 start decides once and remembers it (the `files.location` setting):

- **A new install** (no database yet) uses `<Documents>/Slopify`. If its `Projects` folder already
  holds another install's projects, it uses `Slopify 2`, `Slopify 3`… instead, because storage
  cleanup removes project folders its own database doesn't know.
- **A new install with its own data folder** (`--data-dir` or `SLOPIFY_DATA_DIR`) keeps its files
  inside that folder, so a second or throwaway install never shares Documents with the main one.
- **An existing install** keeps its files where they were: `<data dir>/projects`, with backups in
  `projects/Backups`.
- **Docker** uses the folders the installer mounted (see [docker.md](docker.md)); they are not
  stored in settings.

## Moving your files

**Move to Documents/Slopify** and **Choose another folder** (a full path) move your files while
Slopify runs:

1. It refuses while a project is being made, and during an update.
2. It copies every file, then checks each copy's size and SHA-256 against the original.
3. It switches to the new folder in one step, after checking once more that no project started
   and no file changed during the copy. Otherwise it keeps using the old folder and says why.
4. The old folder is left as it was; the screen names it so you can delete it once your projects
   open fine.

If Slopify stops halfway, the screen shows **Continue moving**: files already copied (same size
and time) are only checked, not copied again.

A chosen folder must be a full path, must not be a system or shared folder (`/`, `/usr`, your home
folder itself, `C:\Windows`…), must not be inside the data folder or overlap the current files
folder, must be writable, and must have room for everything that still has to be copied. Its
`Projects` and `Backups` must be empty or new.

A Docker install can't move its own mount: the screen shows
`npx @gentbajko/slopify@latest update --docker --projects-dir documents` to run on the computer
running Docker.

## What cleanup touches

Storage cleanup (at start, and Clear leftover files) only looks inside `Projects`: it removes files
no project records and folders of projects that no longer exist. It leaves `Backups` (pruned only
by its own `slopify-backup-*.tar` rules), hidden entries (`.DS_Store`) and `desktop.ini` alone, and
in a `Projects` folder outside the data folder it never removes loose files. `Exports` and anything
else in the files folder are never touched.
