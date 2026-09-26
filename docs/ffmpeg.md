# ffmpeg and its licence


No separate FFmpeg installation is required. Native Slopify installs it through
[`ffmpeg-static`](https://www.npmjs.com/package/ffmpeg-static), which fetches a
platform binary at `npm install` time, and never falls back to an ffmpeg on your
`PATH`: the binary that ships is the binary that is tested. Point `SLOPIFY_FFMPEG` at
another build to override it.

Slopify checks that ffmpeg runs before starting. If the install-time download is
missing, it downloads the same platform build into `<data-dir>/bin/`, keeping the
licence and source notice beside it. Later launches reuse that copy. If recovery
fails, check your connection and antivirus quarantine, or choose your own executable.
Docker includes the same platform build, licence and source notice in the image;
it is downloaded and checked when the image is built, not on first launch.

```sh
SLOPIFY_FFMPEG=/usr/bin/ffmpeg npx @gentbajko/slopify@latest
```

In Windows PowerShell:

```powershell
$env:SLOPIFY_FFMPEG = 'C:\tools\ffmpeg\bin\ffmpeg.exe'
npx @gentbajko/slopify@latest
```

That binary is a separate program, run as a child process with an argument array. It
is licensed under the **GPL-3.0-or-later**. Slopify does not link against it, does not
embed it, and does not distribute it inside the `slopify` package; `ffmpeg-static`
downloads it to `node_modules/ffmpeg-static/` at install time, and its licence text and
the location of its corresponding source ship there beside it. Slopify's own code is
MIT and stays MIT. Anyone redistributing the downloaded binary takes on the GPL's
obligations for it, including offering that corresponding source.
