# Security

## Reporting a vulnerability

Please report security problems privately, not in a public issue:
[open a private report](https://github.com/GentBajko/slopify/security/advisories/new) on GitHub.
Say what you found, how to reproduce it, and which version you used. You'll get an answer,
and a fixed release where one is needed, as soon as it can be done.

## Supported versions

Only the latest release is supported. Update with the same command you installed with, using
`@latest`, or pull the latest Docker image.

## What Slopify expects

- It runs on your own machine and binds to `127.0.0.1` by default. It has no login, so
  whoever can reach its port controls the app and the provider keys stored in it. Keep it off
  shared networks.
- Provider keys are stored only in your local database and are never included in backups or
  telemetry.
- Releases are published from GitHub Actions only, with npm provenance, so each npm version
  can be traced to the commit and workflow that built it.
