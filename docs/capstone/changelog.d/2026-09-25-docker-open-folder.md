# Open folder in Docker

- In Docker, Open folder now opens the output folder in your file manager through the host helper (`POST /v1/open-folder`), as a native install does. The helper only opens folders inside a project folder the Docker launcher recorded, checks that folder is still the one it recorded, and refuses links, files and folders you don't own on the way down. It runs `xdg-open`; if that isn't installed, it says so and how to install it.
- Without the helper (API-only Docker, `--host-cli=off`) or with an older one, Open folder still shows the host path, and now explains why and that running the Docker launcher again (`npx @gentbajko/slopify@latest --docker`) sets the helper up.
