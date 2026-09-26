# Backup import is no longer cut off after 5 minutes

- A large Import everything over a slow network could be cut off by Node's 5-minute request limit, which covers the whole upload. The server now switches that limit off and keeps it for every other request itself (408 after 5 minutes if the request still has not fully arrived); the backup import runs as long as bytes keep coming and is dropped only after 5 minutes without any.
- `07-operations.md`: Portable backup and diagnostics describes the limits.
