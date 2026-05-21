# SGA FILE NEXUS
SGA FILE NEXUS is a browser-based firm folder cleanup tool. It scans selected server or shared-drive folders, detects empty folders inside parent folders, applies protected-folder and age rules, supports optional quarantine before discard, requires local confirmation, and exports a clean audit report for daily workflow tracking.

## Firm Backend Mode

For real server cleanup, run the internal backend and open the website from it:

```powershell
$env:SGA_NEXUS_ALLOWED_ROOTS="S:\Clients;\\firm-server\share"
$env:SGA_NEXUS_API_KEY="choose-a-private-key"
npm run backend
```

Then open `http://127.0.0.1:8787`.

The backend only scans and discards folders inside `SGA_NEXUS_ALLOWED_ROOTS`.

## GitHub Pages

The website can be hosted on GitHub Pages for a normal firm link. See `GITHUB-PAGES.md`.

If GitHub Pages is used, the firm backend should use an `https://` internal URL so browsers allow the hosted website to connect to it.
