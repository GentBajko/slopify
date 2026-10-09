# Where Your Files Live

Slopify keeps two kinds of files apart: your files (projects, backups, exports), in a normal folder you can open, and Slopify's own data (database, settings, keys, logs), in a hidden folder. This page says where each is, how to move your files, and how to free disk space.

**Where to find it:** Settings → **Backup & storage** → **Your files**, **Export and import**, **Disk space** and **Sample projects**.

## The two places

| What | Where (new install) | Contains |
| --- | --- | --- |
| Your files | `<Documents>/Slopify/` | `Projects/`: one folder per project, with its video, images, narration, captions and documents. `Backups/`: scheduled backups, unless you choose another folder. `Exports/`: files Slopify saves for you; downloads go through the browser today, so it stays empty, and Slopify never cleans it. |
| Slopify's data | `~/.slopify` (or `--data-dir` / `SLOPIFY_DATA_DIR`) | The database (`slopify.db`) with your library, settings and provider keys, `logs/`, `staging/` (uploads in progress), `models/` (caption models), and depending on use `fonts/`, `cache/`, `autostart/`, `updates/` (in-app updates) and `bin/` (a downloaded ffmpeg). |

The data folder is readable by your user only, because it holds your provider keys. Never share it; share an export instead (keys are never in one).

The terminal prints both places when Slopify starts (`Slopify data directory:` and `Projects:`).

### Which Documents folder

| System | Documents is |
| --- | --- |
| Windows | Your Documents folder as Windows knows it, so a Documents folder moved by OneDrive or in its Properties is followed. Otherwise `%USERPROFILE%\Documents`. |
| macOS | `~/Documents` |
| Linux | `xdg-user-dir DOCUMENTS`, then `XDG_DOCUMENTS_DIR` in `~/.config/user-dirs.dirs`, then `~/Documents`. An answer that is your home folder itself counts as unset. |

The folder is created if it is missing.

## Inside a project folder

Each project has one folder in `Projects/`, named after its title (`Lolth | D&D Lore To Sleep To` becomes `Lolth - D&D Lore To Sleep To`). Inside it:

| Folder | What is in it | Safe to delete? |
| --- | --- | --- |
| `Upload/` | The current version, ready to publish: `video.mp4`, `thumbnail.png` (and `thumbnail 2.png`…), `subtitles.srt` and `.vtt`, `description.txt`, `tags.txt`, `titles.txt`, `pinned comment.txt`, `document.pdf`, `article.md`, and `Shorts/1 - <title>.mp4`… | No: it is what you upload. |
| `Working/` | What the current version was made from: `Images/`, `Narration/` (each chunk, the joined and levelled narration), `Research/`, `Article/`, `Subtitles/`, `Render/`, `Shorts/` (each short's images). | Only to free space on a finished video: changing that project later makes these again, which takes time and provider credits. **Keep outputs only** does it for you. |
| `History/<date>/` | Files of older versions, by the day they were made (an earlier render, the narration before a voice change). | Yes. Delete a day's folder, or all of `History/`, to free its space. Going back to that version in History makes its files again. |

A hidden `.slopify-project` file tells Slopify which project the folder holds and where its files went. Leave it there.

Slopify sorts a project's files into these folders when nothing of it is running, so a project shows them a little after it finishes (or after an edit). While a run is going, its new files sit in `assets/` until then. Renaming a project renames its folder the same way.

Files you add yourself to `Upload/`, `Working/` or `History/` (a note, a reworked thumbnail) are never removed by Slopify. A folder in `Projects/` that Slopify did not make is left alone.

**After this change, don't go back to a Slopify older than 3.14:** older versions only know folders named by project id, and remove the readable ones when they start.

## New and existing installs

Slopify decides once, the first time 3.0 starts, and remembers it:

| Install | Your files are in |
| --- | --- |
| A new install | `<Documents>/Slopify`. If its `Projects` folder already holds another install's projects, it uses `Slopify 2`, `Slopify 3` and so on instead. |
| A new install with its own data folder (`--data-dir` or `SLOPIFY_DATA_DIR`) | Inside that data folder (`projects/`, with backups in `projects/Backups`), so a second or test install never shares Documents with your main one. |
| An install from before 3.0 | Where they were: `<data folder>/projects`, with backups in `projects/Backups`. Use **Move to Documents/Slopify** to move them. |
| Docker | The folders the installer mounted. See [Docker](Docker#where-your-files-go). |

## See your files

1. Open Settings → **Backup & storage**.
2. **Your files** shows the folder, then **Projects**, **Automatic backups** and **Exports** with their full paths.
3. Press **Open folder** to open it in your file manager. If Slopify can't open it, a message says where it is.

Each project page also has **Open folder** next to its downloads.

## Move your files to Documents/Slopify

The button shows only when your files are not in Documents yet (an install from before 3.0).

1. Make sure no project is being made. The move refuses to start during a run or an update.
2. Open Settings → **Backup & storage**.
3. Press **Move to Documents/Slopify**.
4. Keep Slopify running. The screen shows **Copying** and then **Checking the copy of** your files, with a count of files and bytes.
5. When it is done, **Your files are now in …** names the old folder, which still has a copy.
6. Open a few projects. Once they open fine, delete the old folder to free the space.

## Move your files to another folder

Use this for another disk or a synced folder.

1. Open Settings → **Backup & storage**.
2. Press **Choose another folder**.
3. In **New folder**, type the full path, for example `/home/you/Videos/Slopify` or `D:\Slopify`. Slopify makes `Projects` and `Backups` inside it.
4. Press **Move here**.
5. Wait for the copy and the check, as above. Then delete the old folder when you are sure.

The new folder must:

- be a full path;
- not be a system or shared folder (`/`, `/usr`, your home folder itself, `C:\Windows` and similar);
- not be inside Slopify's data folder or overlap the current files folder;
- be writable, with room for everything that still has to be copied;
- have empty or new `Projects` and `Backups` folders.

If one of these fails, the move doesn't start and the message says why.

### How a move keeps your files safe

1. It copies every file.
2. It checks each copy's size and checksum (SHA-256) against the original.
3. It switches to the new folder in one step, after checking once more that no project started and no file changed during the copy. Otherwise it keeps using the old folder and says why.
4. The old folder is left as it was.

It takes as long as copying your projects. If Slopify stops halfway, the screen shows **Moving your files to … didn't finish** (or **… stopped** with the error) and **Continue moving**. Files already copied are only checked again, not copied again. Until the move finishes, Slopify keeps using the old folder.

## Move files in Docker

A container can't move its own mounted folder. **Your files** shows the command to run on the computer running Docker, with **Copy command**:

```sh
npx @gentbajko/slopify@latest update --docker --projects-dir documents
```

Use `--projects-dir <folder>` for another folder. The installer waits for running work, copies your projects, checks the copy and remounts the new folder. See [Docker](Docker#move-your-projects-into-documents).

## Export and import

| Button | What it does |
| --- | --- |
| **Export everything** | Downloads one `.tar` file with every project and its files and history, your library, templates, schedules, Play drafts, fonts, settings and usage. Never provider keys. Keep Slopify running until your browser's download finishes. |
| **Import a backup** | Adds a `.tar` (or `.zip`) backup to this install and replaces nothing. Projects already here are skipped, taken names arrive as "(imported)" and schedules arrive paused. Running projects must finish or pause first. Afterwards a summary lists what was added and skipped. |
| **Clear leftover files** | See below. |

After an import, enter your provider keys again in Settings → **Providers**. For daily automatic copies, see [Backups](Backups).

## Free disk space

### Disk space

**Disk space** shows what Slopify stores on this computer: the total, project files (outputs plus the working files they were made from), staged uploads, and deleted projects still in the trash, for example "· 2.1 GB in the trash (3 deleted projects), freed when removed for good". Below it, every project is listed by size with its outputs and working files.

Deleted projects free their space when the trash removes them after 30 days, or when you choose **Delete now** in Settings → **Backup & storage** → **Trash**. See [Trash](Trash).

### Keep outputs only

On a finished project, **Keep outputs only** deletes the working files it was made from (images, narration parts, subtitle timing, render settings) and keeps the video, shorts, thumbnail, article, description, document and your uploads.

1. Find the project in the **Disk space** list. The button says how much it frees.
2. Press **Keep outputs only**.
3. Read the confirmation and press **Keep outputs only** again.

If you change that project later (edit an image, a caption style or the narration, or re-render), Slopify has to make those files again first, which takes time and provider credits. The button is disabled until the project has finished, or when nothing is left to remove.

A finished project's own page offers the same in its right rail: **Free space** with **Free 1.2 GB: keep the outputs, drop the working files** (see [Project Page](Project-Page#free-space)).

### Delete old versions and Clean up everything

**Delete old versions** removes a project's `History/` folder: the files of earlier versions, such as a previous render or the narration before a voice change. The current version in `Upload/` and `Working/`, your uploads and anything you put in History yourself stay. Going back to one of those versions makes its files again, which takes time and provider credits.

- **One project:** the **Delete old versions** button on its row in **Disk space**, or under **Free space** on its project page. It says how much it frees.
- **Every project:** **Delete all old versions** above the **Disk space** list.
- **Clean up everything** does Delete old versions for every project and **Keep outputs only** for every finished one. Projects that are running or not finished keep everything.

Each asks first. Deleting the files in your file manager works the same way.

### Clear leftover files

**Clear leftover files** deletes files in the projects folder that no project records any more (never anything in a project's `Upload/`, `Working/` or `History/`, and never a folder Slopify did not make), and uploaded files that no draft, template or project uses. Your projects, outputs and library are never touched. Slopify also does this each time it starts; use it after a crash or to free space now.

Cleanup only looks inside `Projects`. It leaves `Backups` alone (only Slopify's own `slopify-backup-*.tar` files there are ever pruned, by the backup rules), leaves hidden files such as `.DS_Store` and `desktop.ini`, never removes loose files in a `Projects` folder outside the data folder, and never touches `Exports` or anything else in your files folder.

## Sample projects

**Sample projects** lists the three bundled samples and whether each is in your projects, with **Open**. **Restore samples** adds back any that were deleted and replaces the others with the originals. Your own copies of them are not touched. See [First Launch and Welcome](First-Launch-and-Welcome#explore-the-samples).

## Tips

- Videos and images take most of the space. Put them on a larger disk with **Choose another folder**; the database stays in the data folder.
- To use a different data folder, start Slopify with `--data-dir <folder>`. That is a different install with its own database, not a move. To take your projects there, export and import. See [Uninstalling and Moving](Uninstalling-and-Moving).

## Related pages

- [Backups](Backups)
- [Trash](Trash)
- [Docker](Docker)
- [Install](Install)
- [Uninstalling and Moving](Uninstalling-and-Moving)
- [Settings Reference](Settings-Reference)
