# GitHub Pages Hosting

SGA FILE NEXUS can be hosted on GitHub Pages as the shared website link for the firm.

## What GitHub Hosts

GitHub Pages hosts the static website in `website-deploy`.

This gives the team a normal link, usually like:

```text
https://HF-SGA-2026.github.io/SGA-FILE-RENAME/
```

## What GitHub Does Not Host

GitHub Pages does not run the folder cleanup backend. The backend must run on a firm computer, firm server, or internal IT-managed machine that can access the firm's shared folders.

## Backend URL Requirement

Because GitHub Pages uses `https://`, the firm backend should also have an `https://` URL.

Good:

```text
https://sga-file-nexus.firm.local:8787
```

Likely blocked by browsers from GitHub Pages:

```text
http://sga-file-nexus.firm.local:8787
```

If IT cannot give the backend HTTPS, host the website internally beside the backend instead of using GitHub Pages.

## Configure the Website Backend URL

Edit:

```text
website-deploy/config.js
```

Set:

```js
window.SGA_FILE_NEXUS_CONFIG = {
  backendUrl: "https://sga-file-nexus.firm.local:8787"
};
```

Do not put the backend key in `config.js`. Users can enter the key in the website, or IT can protect the backend with firm network access and single sign-on.

## GitHub Pages Setup

This repo includes:

```text
.github/workflows/deploy-pages.yml
```

After the repo is pushed to GitHub:

1. Open the repository on GitHub.
2. Go to **Settings**.
3. Go to **Pages**.
4. Set **Build and deployment** to **GitHub Actions**.
5. Push changes to the `main` branch.
6. Open the Pages deployment link after the workflow finishes.

The workflow publishes the `website-deploy` folder.
