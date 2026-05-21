# Sharing SGA FILE NEXUS

There are two ways to share this tool.

## Website-Only Link

Use this when people only need to open the page, scan folders, review results, and download audit reports.

Upload the contents of `website-deploy` to a static host such as:

- Netlify Drop
- GitHub Pages
- an internal firm website

Important: a website-only deployment cannot directly delete folders from the firm server unless browser folder permissions allow it.

For GitHub Pages, this repo includes `.github/workflows/deploy-pages.yml`. See `GITHUB-PAGES.md`.

## Firm Cleanup Version

Use this when the tool needs to actually discard or quarantine folders on the firm server.

Run the backend on a firm desktop, firm laptop, or internal server that can already access the server folders.

Example PowerShell setup:

```powershell
$env:SGA_NEXUS_ALLOWED_ROOTS="S:\Clients;\\firm-server\share"
$env:SGA_NEXUS_API_KEY="choose-a-private-key"
npm run backend
```

Then open:

```text
http://127.0.0.1:8787
```

For a GitHub Pages website, IT should expose the backend with HTTPS, for example:

```text
https://sga-file-nexus.firm.local:8787
```

For other desktops to use it, host the backend on an internal machine and share that machine's network URL, such as:

```text
http://192.168.1.208:8787
```

Only folders inside `SGA_NEXUS_ALLOWED_ROOTS` can be scanned or cleaned.
