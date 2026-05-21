# SGA FILE NEXUS

This is the website version of SGA FILE NEXUS. It runs as a local browser website using plain HTML, CSS, and JavaScript.

## Run the Website

Open `index.html` in a modern desktop browser, or run a small local website server from this folder:

```bash
python3 -m http.server 8080
```

Then open:

```text
http://localhost:8080
```

## Website Flow

1. Enter an approved server folder path in Firm Server Backend, or choose/drop a folder for browser-only scan mode.
2. Select the parent folders that should be scanned.
3. Apply scan rules for empty-folder definition, protected paths, and age.
4. Review the empty-folder checklist.
5. Optionally enable quarantine.
6. Confirm review approval and discard selected folders.
7. Download the audit report.

Folder paths in the review list include copy/open controls for quick verification. Browser security may block direct folder opening from a web page, but the copied path can be pasted into File Explorer.

After folders are discarded, they are removed from the review list and parent-folder sidebar. They remain recorded in the audit report.

## Folder Rules

Expected structure:

```text
Main Folder/
  Parent Folder A/
    Project One/
      Empty Subfolder/
    Project Two/
  Parent Folder B/
    Archive Review/
```

The website always preserves the main folder. Empty selected parent folders and empty folders inside selected parent folders can be reviewed and discarded.

System files such as `.DS_Store`, `Thumbs.db`, `desktop.ini`, and AppleDouble `._` files are ignored when the "Ignore system files" rule is active.

## Cleanup Access

For daily firm workflow, run the internal backend from the project root:

```powershell
$env:SGA_NEXUS_ALLOWED_ROOTS="S:\Clients;\\firm-server\share"
$env:SGA_NEXUS_API_KEY="choose-a-private-key"
npm run backend
```

Then open `http://127.0.0.1:8787`, enter the same backend key, and scan an approved server folder path.

Direct discard from browser folder access is still available where supported. Drag-and-drop and file-upload scans remain scan-only and can still export an audit report.

## Quarantine

Quarantine is optional. When enabled, SGA FILE NEXUS creates an `SGA_FILE_NEXUS_QUARANTINE` folder and mirrors the selected empty-folder paths before removing them from their original location.
