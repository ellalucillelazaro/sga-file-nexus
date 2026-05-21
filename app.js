const SYSTEM_FILE_NAMES = new Set([".ds_store", "thumbs.db", "desktop.ini"]);
const PREVIEW_RENDER_LIMIT = 1000;
const REPORT_MIME = "text/csv;charset=utf-8";
const QUARANTINE_FOLDER = "SGA_FILE_NEXUS_QUARANTINE";
const BACKEND_URL_STORAGE_KEY = "sgaFileNexusBackendUrl";

const DEFAULT_PROTECTED_RULES = [
  "Archive",
  "Templates",
  "DO NOT DELETE",
  "_Active",
  "Client Root",
  QUARANTINE_FOLDER
].join("\n");

const PRESETS = {
  daily: {
    emptyDefinition: "ignored",
    ageFilter: "0",
    protectedRules: DEFAULT_PROTECTED_RULES
  },
  weekly: {
    emptyDefinition: "ignored",
    ageFilter: "30",
    protectedRules: DEFAULT_PROTECTED_RULES
  },
  archive: {
    emptyDefinition: "ignored",
    ageFilter: "90",
    protectedRules: ["DO NOT DELETE", "_Active", "Legal Hold", "Client Root", QUARANTINE_FOLDER].join("\n")
  },
  clientSafe: {
    emptyDefinition: "strict",
    ageFilter: "60",
    protectedRules: ["Archive", "Templates", "DO NOT DELETE", "_Active", "Legal Hold", "Client Root", QUARANTINE_FOLDER].join("\n")
  }
};

const state = {
  sourceKind: "",
  sourceLabel: "",
  mainFolderName: "",
  scannedFolders: 0,
  rootHandle: null,
  hasWriteAccess: false,
  directories: new Map(),
  files: [],
  parentFolders: new Map(),
  selectedParents: new Set(),
  allReviewRows: [],
  reviewRows: [],
  filteredRows: [],
  selectedFolders: new Set(),
  processedRows: new Set(),
  discardedRows: [],
  failures: [],
  reportBlob: null,
  reportUrl: "",
  reportName: "",
  backendRootPath: "",
  processing: false,
  metrics: {
    total: 0,
    completed: 0,
    startTime: 0
  }
};

const els = {
  dropZone: document.getElementById("dropZone"),
  chooseFolderButton: document.getElementById("chooseFolderButton"),
  folderInput: document.getElementById("folderInput"),
  clearButton: document.getElementById("clearButton"),
  selectAllButton: document.getElementById("selectAllButton"),
  deselectAllButton: document.getElementById("deselectAllButton"),
  renameButton: document.getElementById("renameButton"),
  discardButton: document.getElementById("discardButton"),
  downloadButton: document.getElementById("downloadButton"),
  clearLogButton: document.getElementById("clearLogButton"),
  parentList: document.getElementById("parentList"),
  folderSummary: document.getElementById("folderSummary"),
  previewBody: document.getElementById("previewBody"),
  previewCount: document.getElementById("previewCount"),
  messageLog: document.getElementById("messageLog"),
  statusText: document.getElementById("statusText"),
  percentText: document.getElementById("percentText"),
  progressBar: document.getElementById("progressBar"),
  totalFiles: document.getElementById("totalFiles"),
  completedFiles: document.getElementById("completedFiles"),
  remainingFiles: document.getElementById("remainingFiles"),
  elapsedTime: document.getElementById("elapsedTime"),
  etaTime: document.getElementById("etaTime"),
  filesPerSecond: document.getElementById("filesPerSecond"),
  heicSpeed: document.getElementById("heicSpeed"),
  zipInfo: document.getElementById("zipInfo"),
  libraryStatus: document.getElementById("libraryStatus"),
  presetSelect: document.getElementById("presetSelect"),
  emptyDefinition: document.getElementById("emptyDefinition"),
  ageFilter: document.getElementById("ageFilter"),
  includeUnknownDates: document.getElementById("includeUnknownDates"),
  protectedRules: document.getElementById("protectedRules"),
  quarantineOption: document.getElementById("quarantineOption"),
  approvalCheck: document.getElementById("approvalCheck"),
  searchInput: document.getElementById("searchInput"),
  statusFilter: document.getElementById("statusFilter"),
  selectVisibleButton: document.getElementById("selectVisibleButton"),
  clearVisibleButton: document.getElementById("clearVisibleButton"),
  backendUrl: document.getElementById("backendUrl"),
  backendKey: document.getElementById("backendKey"),
  serverPathInput: document.getElementById("serverPathInput"),
  checkBackendButton: document.getElementById("checkBackendButton"),
  scanBackendButton: document.getElementById("scanBackendButton"),
  backendStatus: document.getElementById("backendStatus")
};

document.addEventListener("DOMContentLoaded", () => {
  initBackendFields();
  bindEvents();
  updateLibraryStatus();
  applyPreset("daily", false);
  resetUi();
});

function bindEvents() {
  els.chooseFolderButton.addEventListener("click", async event => {
    event.preventDefault();
    event.stopPropagation();
    if (state.processing) return;

    if (window.showDirectoryPicker) {
      await chooseServerFolder();
      return;
    }

    els.folderInput.value = "";
    els.folderInput.click();
  });

  els.folderInput.addEventListener("change", event => {
    const files = Array.from(event.target.files || []);
    if (!files.length) {
      addLog("Folder selection canceled.");
      return;
    }
    loadFileList(files);
  });

  els.dropZone.addEventListener("dragover", event => {
    event.preventDefault();
    els.dropZone.classList.add("dragging");
  });

  els.dropZone.addEventListener("dragleave", () => {
    els.dropZone.classList.remove("dragging");
  });

  els.dropZone.addEventListener("drop", async event => {
    event.preventDefault();
    els.dropZone.classList.remove("dragging");
    if (state.processing) return;
    const entries = entriesFromDrop(event.dataTransfer);
    if (entries.length) {
      await loadDroppedEntries(entries);
      return;
    }
    loadFileList(Array.from(event.dataTransfer.files || []));
  });

  els.clearButton.addEventListener("click", clearAll);
  els.selectAllButton.addEventListener("click", () => setAllParents(true));
  els.deselectAllButton.addEventListener("click", () => setAllParents(false));
  els.renameButton.addEventListener("click", applyScanRules);
  els.discardButton.addEventListener("click", discardSelectedFolders);
  els.downloadButton.addEventListener("click", downloadReport);
  els.checkBackendButton.addEventListener("click", checkBackend);
  els.scanBackendButton.addEventListener("click", () => scanBackendFolder(true));
  els.backendUrl.addEventListener("change", () => {
    localStorage.setItem(BACKEND_URL_STORAGE_KEY, els.backendUrl.value.trim());
  });
  els.clearLogButton.addEventListener("click", () => {
    els.messageLog.innerHTML = "";
  });

  els.presetSelect.addEventListener("change", () => applyPreset(els.presetSelect.value, true));
  els.emptyDefinition.addEventListener("change", handleRuleChange);
  els.ageFilter.addEventListener("change", handleRuleChange);
  els.includeUnknownDates.addEventListener("change", handleRuleChange);
  els.protectedRules.addEventListener("input", debounce(handleRuleChange, 250));
  els.quarantineOption.addEventListener("change", updateControls);
  els.approvalCheck.addEventListener("change", updateControls);
  els.searchInput.addEventListener("input", renderPreview);
  els.statusFilter.addEventListener("change", renderPreview);
  els.selectVisibleButton.addEventListener("click", () => setVisibleRowsSelected(true));
  els.clearVisibleButton.addEventListener("click", () => setVisibleRowsSelected(false));
}

function initBackendFields() {
  const configuredUrl = window.SGA_FILE_NEXUS_CONFIG?.backendUrl || "";
  const savedUrl = localStorage.getItem(BACKEND_URL_STORAGE_KEY) || "";
  const sameOrigin = window.location.port === "8787";
  els.backendUrl.value = savedUrl || configuredUrl || (sameOrigin ? window.location.origin : "http://127.0.0.1:8787");
}

function updateLibraryStatus() {
  if (window.showDirectoryPicker && window.isSecureContext) {
    els.libraryStatus.textContent = "SERVER FOLDER ACCESS READY";
    els.libraryStatus.className = "library-status ok";
  } else {
    els.libraryStatus.textContent = "SCAN-ONLY FALLBACK READY";
    els.libraryStatus.className = "library-status warn";
  }
}

async function checkBackend() {
  try {
    els.backendStatus.textContent = "Checking backend...";
    const health = await backendRequest("/api/health", { method: "GET" });
    els.backendStatus.textContent = health.cleanupEnabled
      ? `Backend ready with ${health.allowedRootCount} approved root${health.allowedRootCount === 1 ? "" : "s"}.`
      : "Backend is running, but no approved server roots are configured.";
    addLog("Firm server backend connection checked.");
  } catch (error) {
    els.backendStatus.textContent = `Backend unavailable: ${error.message}`;
    addLog(`Backend unavailable: ${error.message}`, "warn");
  }
}

async function scanBackendFolder(announceMissingPath) {
  const rootPath = els.serverPathInput.value.trim();
  if (!rootPath) {
    if (announceMissingPath) addLog("Enter an approved server folder path first.", "warn");
    return;
  }

  state.processing = true;
  updateControls();
  setStatus("Scanning server backend...");
  els.backendStatus.textContent = "Scanning server path...";
  addLog(`Backend scanning "${rootPath}"...`);

  try {
    const scan = await backendRequest("/api/scan", {
      method: "POST",
      body: {
        rootPath,
        settings: settingsPayload()
      }
    });
    loadBackendScan(scan);
    els.backendStatus.textContent = `${scan.scannedFolders} folders scanned through the backend.`;
    addLog(`Backend scan loaded ${scan.rows.length} review rows.`);
  } catch (error) {
    els.backendStatus.textContent = `Backend scan failed: ${error.message}`;
    addLog(`Backend scan failed: ${error.message}`, "error");
    setStatus("Finished");
  } finally {
    state.processing = false;
    updateControls();
  }
}

function loadBackendScan(scan) {
  clearWorkingState();
  state.sourceKind = "backend";
  state.sourceLabel = scan.sourceLabel || "Firm server backend";
  state.mainFolderName = scan.mainFolderName || "Server Folder";
  state.scannedFolders = scan.scannedFolders || 0;
  state.backendRootPath = scan.rootPath || els.serverPathInput.value.trim();
  state.hasWriteAccess = Boolean(scan.hasWriteAccess);
  state.directories = new Map([["backend", { path: "backend" }]]);
  state.parentFolders = new Map((scan.parentFolders || []).map(parent => [parent.name, parent]));
  state.selectedParents = new Set(state.parentFolders.keys());
  state.allReviewRows = (scan.rows || []).map(row => ({
    ...row,
    lastModified: row.lastModified || 0,
    canDiscard: row.status === "ready"
  }));
  state.reviewRows = state.allReviewRows.filter(row => state.selectedParents.has(row.parent));
  state.selectedFolders = new Set(state.reviewRows.filter(row => row.status === "ready").map(row => row.path));
  renderParentList();
  renderPreview();
  resetRunMetrics();
  buildReport();
  updateFolderSummary();
  setStatus("Finished");
}

function handleRuleChange() {
  if (state.sourceKind === "backend") {
    state.processedRows.clear();
    state.discardedRows = [];
    state.failures = [];
    setStatus("Scan rules changed.");
    addLog("Scan rules changed. Apply scan rules to refresh the server review list.");
    buildReport();
    updateControls();
    return;
  }
  applyScanRules();
}

function settingsPayload() {
  return {
    emptyDefinition: els.emptyDefinition.value,
    ageFilter: Number(els.ageFilter.value || 0),
    includeUnknownDates: els.includeUnknownDates.checked,
    protectedRules: protectedPatterns()
  };
}

async function backendRequest(pathname, options = {}) {
  const baseUrl = els.backendUrl.value.trim().replace(/\/+$/, "");
  if (!baseUrl) {
    throw new Error("Backend URL is required.");
  }
  if (window.location.protocol === "https:" && baseUrl.startsWith("http://") && !baseUrl.startsWith("http://127.0.0.1") && !baseUrl.startsWith("http://localhost")) {
    throw new Error("GitHub Pages uses HTTPS, so the firm backend also needs an HTTPS URL.");
  }
  localStorage.setItem(BACKEND_URL_STORAGE_KEY, baseUrl);

  const headers = {
    "Content-Type": "application/json"
  };
  const backendKey = els.backendKey.value.trim();
  if (backendKey) {
    headers["X-SGA-Nexus-Key"] = backendKey;
  }

  const response = await fetch(`${baseUrl}${pathname}`, {
    method: options.method || "POST",
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  let payload = {};
  try {
    payload = await response.json();
  } catch {
    payload = {};
  }

  if (!response.ok || payload.ok === false) {
    throw new Error(payload.error || `Backend request failed (${response.status})`);
  }

  return payload;
}

function applyPreset(name, shouldApplyRules) {
  const preset = PRESETS[name] || PRESETS.daily;
  els.emptyDefinition.value = preset.emptyDefinition;
  els.ageFilter.value = preset.ageFilter;
  els.protectedRules.value = preset.protectedRules;
  if (shouldApplyRules) {
    applyScanRules();
    addLog(`${els.presetSelect.options[els.presetSelect.selectedIndex].text} preset applied.`);
  }
}

async function chooseServerFolder() {
  try {
    const handle = await window.showDirectoryPicker({ mode: "readwrite" });
    const permission = await requestFolderPermission(handle);
    await loadDirectoryHandle(handle, permission === "granted");
  } catch (error) {
    if (error.name === "AbortError") {
      addLog("Folder selection canceled.");
      return;
    }
    addLog(`Folder access failed: ${error.message}`, "error");
  }
}

async function requestFolderPermission(handle) {
  if (!handle.queryPermission || !handle.requestPermission) {
    return "prompt";
  }

  const options = { mode: "readwrite" };
  const current = await handle.queryPermission(options);
  if (current === "granted") return current;
  return handle.requestPermission(options);
}

async function loadDirectoryHandle(rootHandle, hasWriteAccess) {
  clearWorkingState();
  state.sourceKind = "server";
  state.sourceLabel = hasWriteAccess ? "Server folder with cleanup access" : "Server folder scan only";
  state.mainFolderName = rootHandle.name || "Selected Server Folder";
  state.rootHandle = rootHandle;
  state.hasWriteAccess = hasWriteAccess;
  state.metrics.startTime = performance.now();

  setStatus("Scanning folders...");
  addLog(`Scanning "${state.mainFolderName}"...`);

  try {
    await scanDirectoryHandle(rootHandle, state.mainFolderName, "", null);
    finishScan();
    if (!hasWriteAccess) {
      addLog("Write access was not granted. The scan and report are available, but discard is disabled.", "warn");
    }
  } catch (error) {
    addLog(`Scan failed: ${error.message}`, "error");
    setStatus("Finished");
    updateControls();
  }
}

async function scanDirectoryHandle(dirHandle, currentPath, parentPath, parentHandle) {
  const directory = ensureDirectory(currentPath, { handle: dirHandle, parentPath, parentHandle });
  let scanned = 0;

  for await (const [name, handle] of dirHandle.entries()) {
    const childPath = pathJoin(currentPath, name);
    if (handle.kind === "directory") {
      directory.childDirs.add(childPath);
      await scanDirectoryHandle(handle, childPath, currentPath, dirHandle);
    } else if (handle.kind === "file") {
      const file = await handle.getFile();
      addScannedFile(file, childPath, { handle, parentHandle: dirHandle });
    }
    scanned += 1;
    if (scanned % 40 === 0) {
      setStatus(`Scanning folders... ${state.directories.size} folders`);
      await yieldToBrowser();
    }
  }
}

async function loadDroppedEntries(entries) {
  clearWorkingState();
  state.sourceKind = "drop";
  state.sourceLabel = "Dropped folder scan only";
  state.metrics.startTime = performance.now();
  setStatus("Scanning folders...");
  addLog("Scanning dropped folder...");

  try {
    for (const entry of entries) {
      await readDroppedEntry(entry, "");
    }
    finishScan();
    addLog("Dropped folders are scan-only in this browser. Use Choose Server Folder for direct cleanup access.", "warn");
  } catch (error) {
    addLog(`Dropped folder scan failed: ${error.message}`, "error");
    setStatus("Finished");
    updateControls();
  }
}

function entriesFromDrop(dataTransfer) {
  return Array.from(dataTransfer.items || [])
    .map(item => item.webkitGetAsEntry ? item.webkitGetAsEntry() : null)
    .filter(Boolean);
}

function readDroppedEntry(entry, prefix) {
  return new Promise(resolve => {
    const currentPath = normalizePath(pathJoin(prefix, entry.name));

    if (entry.isFile) {
      entry.file(file => {
        addScannedFile(file, currentPath);
        resolve();
      }, () => resolve());
      return;
    }

    if (entry.isDirectory) {
      const parentPath = normalizePath(prefix).replace(/\/$/, "");
      ensureDirectory(currentPath, { parentPath });
      if (parentPath) {
        ensureDirectory(parentPath).childDirs.add(currentPath);
      }

      const reader = entry.createReader();
      const readBatch = () => {
        reader.readEntries(async children => {
          if (!children.length) {
            resolve();
            return;
          }
          for (const child of children) {
            await readDroppedEntry(child, currentPath);
          }
          readBatch();
        }, () => resolve());
      };
      readBatch();
      return;
    }

    resolve();
  });
}

function loadFileList(files) {
  clearWorkingState();
  state.sourceKind = "file";
  state.sourceLabel = "Folder upload scan only";
  state.metrics.startTime = performance.now();
  setStatus("Scanning folders...");
  addLog("Scanning selected folder...");

  const normalized = files
    .map(file => ({ file, path: normalizePath(file.webkitRelativePath || file.relativePath || file.name) }))
    .filter(item => item.path);

  if (!normalized.length) {
    addLog("No usable files were found.", "warn");
    resetUi();
    return;
  }

  for (const item of normalized) {
    addScannedFile(item.file, item.path);
  }

  finishScan();
  addLog("Folder uploads are scan-only and may not include completely empty folders. Use Choose Server Folder for direct cleanup access.", "warn");
}

function addScannedFile(file, filePath, options = {}) {
  const path = normalizePath(filePath);
  const parts = path.split("/").filter(Boolean);
  if (parts.length < 2) return;

  for (let index = 1; index < parts.length; index += 1) {
    const dirPath = parts.slice(0, index).join("/");
    const parentPath = index > 1 ? parts.slice(0, index - 1).join("/") : "";
    const directory = ensureDirectory(dirPath, { parentPath });
    if (parentPath) {
      ensureDirectory(parentPath).childDirs.add(dirPath);
    }
  }

  const parentPath = parts.slice(0, -1).join("/");
  const fileName = parts[parts.length - 1];
  const record = {
    file,
    handle: options.handle || null,
    parentHandle: options.parentHandle || null,
    path,
    parentPath,
    name: fileName,
    size: file.size || 0,
    lastModified: file.lastModified || 0,
    isSystem: isSystemFileName(fileName)
  };

  ensureDirectory(parentPath).files.push(record);
  state.files.push(record);
}

function ensureDirectory(path, options = {}) {
  const normalized = normalizePath(path);
  if (!normalized) {
    return null;
  }

  if (!state.directories.has(normalized)) {
    state.directories.set(normalized, {
      path: normalized,
      name: normalized.split("/").pop(),
      parentPath: options.parentPath || "",
      handle: options.handle || null,
      parentHandle: options.parentHandle || null,
      childDirs: new Set(),
      files: [],
      depth: normalized.split("/").filter(Boolean).length,
      subtreeFileCount: 0,
      subtreeSystemFileCount: 0,
      subtreeUsableFileCount: 0,
      subtreeDirectoryCount: 0,
      lastModified: 0
    });
  }

  const directory = state.directories.get(normalized);
  if (options.handle) directory.handle = options.handle;
  if (options.parentHandle) directory.parentHandle = options.parentHandle;
  if (options.parentPath) directory.parentPath = options.parentPath;
  return directory;
}

function finishScan() {
  const firstPath = [...state.directories.keys()][0] || state.files[0]?.path || "";
  state.mainFolderName = state.mainFolderName || commonMainFolder(firstPath) || "Selected Server Folder";
  state.scannedFolders = state.directories.size;
  rebuildParentFolders();
  state.selectedParents = new Set(state.parentFolders.keys());
  applyScanRules();

  updateFolderSummary();
  setStatus("Finished");
  addLog(`Loaded "${state.mainFolderName}" with ${state.directories.size} folders scanned.`);
}

function rebuildParentFolders() {
  state.parentFolders = new Map();

  for (const directory of state.directories.values()) {
    const parts = directory.path.split("/").filter(Boolean);
    if (parts.length < 2) continue;
    const parent = parts[1];
    if (!state.parentFolders.has(parent)) {
      state.parentFolders.set(parent, {
        name: parent,
        folderCount: 0,
        emptyCount: 0,
        protectedCount: 0
      });
    }
    state.parentFolders.get(parent).folderCount += 1;
  }
}

function applyScanRules() {
  if (state.sourceKind === "backend") {
    scanBackendFolder(false);
    return;
  }

  if (!state.directories.size) {
    updateControls();
    return;
  }

  const previouslySelected = new Set(state.selectedFolders);
  computeDirectoryAggregates();
  state.allReviewRows = buildReviewRows();
  syncParentCounts();
  state.reviewRows = state.allReviewRows.filter(row => state.selectedParents.has(row.parent));

  const readyRows = state.reviewRows.filter(row => row.status === "ready");
  state.selectedFolders = new Set(
    readyRows
      .filter(row => !previouslySelected.size || previouslySelected.has(row.path))
      .map(row => row.path)
  );
  if (!previouslySelected.size) {
    state.selectedFolders = new Set(readyRows.map(row => row.path));
  }

  state.processedRows.clear();
  state.discardedRows = [];
  state.failures = [];
  renderParentList();
  renderPreview();
  resetRunMetrics();
  updateFolderSummary();
  buildReport();
  updateControls();
}

function computeDirectoryAggregates() {
  for (const directory of state.directories.values()) {
    directory.subtreeFileCount = directory.files.length;
    directory.subtreeSystemFileCount = directory.files.filter(file => file.isSystem).length;
    directory.subtreeUsableFileCount = directory.files.filter(file => !file.isSystem).length;
    directory.subtreeDirectoryCount = directory.childDirs.size;
    directory.lastModified = directory.files.reduce((latest, file) => Math.max(latest, file.lastModified || 0), 0);
  }

  const directories = [...state.directories.values()].sort((a, b) => b.depth - a.depth);
  for (const directory of directories) {
    const parent = directory.parentPath ? state.directories.get(directory.parentPath) : null;
    if (!parent) continue;
    parent.subtreeFileCount += directory.subtreeFileCount;
    parent.subtreeSystemFileCount += directory.subtreeSystemFileCount;
    parent.subtreeUsableFileCount += directory.subtreeUsableFileCount;
    parent.subtreeDirectoryCount += directory.subtreeDirectoryCount;
    parent.lastModified = Math.max(parent.lastModified, directory.lastModified);
  }
}

function buildReviewRows() {
  const rows = [];
  const patterns = protectedPatterns();
  const strictMode = els.emptyDefinition.value === "strict";
  const minAgeDays = Number(els.ageFilter.value || 0);
  const includeUnknownDates = els.includeUnknownDates.checked;

  for (const directory of state.directories.values()) {
    const parts = directory.path.split("/").filter(Boolean);
    if (parts.length < 2) continue;

    const parent = parts[1];
    const protectedReason = protectedReasonForPath(directory.path, patterns);
    const strictEmpty = directory.files.length === 0 && directory.childDirs.size === 0;
    const ignoredEmpty = directory.subtreeUsableFileCount === 0;
    const qualifies = strictMode ? strictEmpty : ignoredEmpty;
    if (!qualifies) continue;

    const age = ageStatus(directory.lastModified, minAgeDays, includeUnknownDates);
    const status = protectedReason || !age.ok ? "protected" : "ready";
    const reason = protectedReason || age.reason || emptyReason(directory, strictMode);

    rows.push({
      path: directory.path,
      name: directory.name,
      parent,
      secondary: parts[2] || "",
      depth: directory.depth,
      lastModified: directory.lastModified,
      status,
      reason,
      canDiscard: status === "ready",
      handle: directory.handle,
      parentHandle: directory.parentHandle,
      subtreeFileCount: directory.subtreeFileCount,
      subtreeSystemFileCount: directory.subtreeSystemFileCount,
      subtreeDirectoryCount: directory.subtreeDirectoryCount
    });
  }

  return rows.sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true, sensitivity: "base" }));
}

function syncParentCounts() {
  for (const parent of state.parentFolders.values()) {
    parent.emptyCount = 0;
    parent.protectedCount = 0;
  }

  for (const row of state.allReviewRows) {
    const parent = state.parentFolders.get(row.parent);
    if (!parent) continue;
    if (row.status === "ready") parent.emptyCount += 1;
    if (row.status === "protected") parent.protectedCount += 1;
  }
}

function renderParentList() {
  els.parentList.innerHTML = "";

  const visibleParents = [...state.parentFolders.values()]
    .filter(parent => parent.emptyCount || parent.protectedCount)
    .sort((a, b) => a.name.localeCompare(b.name));

  if (!visibleParents.length) {
    els.parentList.innerHTML = '<div class="empty-state">No parent folders have matching empty folders.</div>';
    return;
  }

  for (const parent of visibleParents) {
    const id = `parent-${slug(parent.name)}`;
    const label = document.createElement("label");
    label.className = "parent-item";
    label.title = "Select or clear every reviewed empty folder under this parent folder.";
    label.innerHTML = `
      <input type="checkbox" id="${id}" ${state.selectedParents.has(parent.name) ? "checked" : ""}>
      <span class="parent-name"></span>
      <span class="parent-meta">${parent.folderCount} folders, ${parent.emptyCount} ready, ${parent.protectedCount} protected</span>
    `;
    label.querySelector(".parent-name").textContent = parent.name;
    label.querySelector("input").addEventListener("change", event => {
      if (event.target.checked) {
        state.selectedParents.add(parent.name);
      } else {
        state.selectedParents.delete(parent.name);
      }
      state.reviewRows = state.allReviewRows.filter(row => state.selectedParents.has(row.parent));
      state.selectedFolders = new Set(
        [...state.selectedFolders].filter(path => state.reviewRows.some(row => row.path === path))
      );
      renderPreview();
      resetRunMetrics();
      buildReport();
      updateControls();
    });
    els.parentList.appendChild(label);
  }
}

function renderPreview() {
  const search = els.searchInput.value.trim().toLowerCase();
  const statusFilter = els.statusFilter.value;
  state.filteredRows = state.reviewRows.filter(row => {
    const actualStatus = statusForRow(row);
    const matchesStatus = statusFilter === "all" || actualStatus === statusFilter;
    const matchesSearch = !search || `${row.parent} ${row.path} ${row.reason}`.toLowerCase().includes(search);
    return matchesStatus && matchesSearch;
  });

  els.previewCount.textContent = `${state.filteredRows.length} folders`;

  if (!state.reviewRows.length) {
    els.previewBody.innerHTML = state.discardedRows.length
      ? '<tr><td colspan="5" class="empty-state">No empty folders remain in the review list. Discarded folders are saved in the audit report.</td></tr>'
      : '<tr><td colspan="5" class="empty-state">No empty folders matched the current scan rules.</td></tr>';
    updateControls();
    return;
  }

  if (!state.filteredRows.length) {
    els.previewBody.innerHTML = '<tr><td colspan="5" class="empty-state">No folders match the current search or status filter.</td></tr>';
    updateControls();
    return;
  }

  const fragment = document.createDocumentFragment();
  for (const row of state.filteredRows.slice(0, PREVIEW_RENDER_LIMIT)) {
    const tr = document.createElement("tr");
    const actualStatus = statusForRow(row);
    const checkbox = document.createElement("input");
    checkbox.className = "table-check";
    checkbox.type = "checkbox";
    checkbox.dataset.path = row.path;
    checkbox.checked = state.selectedFolders.has(row.path) && row.canDiscard && actualStatus === "ready";
    checkbox.disabled = !row.canDiscard || actualStatus !== "ready" || state.processing;
    checkbox.addEventListener("change", event => {
      if (event.target.checked) {
        state.selectedFolders.add(row.path);
      } else {
        state.selectedFolders.delete(row.path);
      }
      resetRunMetrics();
      buildReport();
      updateControls();
    });

    const checkCell = document.createElement("td");
    checkCell.appendChild(checkbox);
    const pathCell = folderPathCell(row);
    tr.append(
      checkCell,
      cell(row.parent),
      pathCell,
      cell(formatDate(row.lastModified)),
      statusCell(actualStatus, row.reason)
    );
    fragment.appendChild(tr);
  }

  els.previewBody.innerHTML = "";
  els.previewBody.appendChild(fragment);

  if (state.filteredRows.length > PREVIEW_RENDER_LIMIT) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td colspan="5" class="empty-state">Preview limited to the first ${PREVIEW_RENDER_LIMIT} rows for speed. ${state.filteredRows.length} folders match the current filters.</td>`;
    els.previewBody.appendChild(tr);
  }

  updateControls();
}

function setAllParents(checked) {
  state.selectedParents = checked ? new Set(state.parentFolders.keys()) : new Set();
  state.reviewRows = state.allReviewRows.filter(row => state.selectedParents.has(row.parent));
  state.selectedFolders = checked
    ? new Set(state.reviewRows.filter(row => row.status === "ready").map(row => row.path))
    : new Set();
  renderParentList();
  renderPreview();
  resetRunMetrics();
  buildReport();
  updateControls();
}

function setVisibleRowsSelected(checked) {
  for (const row of state.filteredRows) {
    if (!row.canDiscard || statusForRow(row) !== "ready") continue;
    if (checked) {
      state.selectedFolders.add(row.path);
    } else {
      state.selectedFolders.delete(row.path);
    }
  }
  renderPreview();
  resetRunMetrics();
  buildReport();
  updateControls();
}

async function discardSelectedFolders() {
  const selectedRows = state.reviewRows
    .filter(row => state.selectedFolders.has(row.path) && row.canDiscard && statusForRow(row) === "ready");

  if (!selectedRows.length) {
    addLog("Select at least one ready empty folder.", "warn");
    return;
  }

  if (!state.hasWriteAccess || !state.rootHandle) {
    addLog("This source is scan-only. Choose Server Folder and grant cleanup access to discard folders.", "warn");
    return;
  }

  if (!els.approvalCheck.checked) {
    addLog("Review approval is required before discarding folders.", "warn");
    return;
  }

  if (state.sourceKind === "backend") {
    await discardSelectedFoldersWithBackend(selectedRows);
    return;
  }

  const action = els.quarantineOption.checked ? "quarantine and discard" : "discard";
  const compressedTargets = compressTargets(selectedRows);
  const confirmed = window.confirm(`Confirm ${action} for ${compressedTargets.length} selected empty folder${compressedTargets.length === 1 ? "" : "s"}?`);
  if (!confirmed) {
    addLog("Cleanup canceled during confirmation.", "warn");
    return;
  }

  state.processing = true;
  state.metrics = {
    total: compressedTargets.length,
    completed: 0,
    startTime: performance.now()
  };
  updateMetrics();
  updateControls();
  setStatus(els.quarantineOption.checked ? "Quarantining folders..." : "Discarding folders...");
  addLog(`${els.quarantineOption.checked ? "Quarantine cleanup" : "Cleanup"} started for ${compressedTargets.length} folders.`);

  let quarantineHandle = null;
  if (els.quarantineOption.checked) {
    quarantineHandle = await createQuarantineHandle();
    addLog(`Quarantine folder created: ${QUARANTINE_FOLDER}.`);
  }

  for (const row of compressedTargets.sort((a, b) => b.depth - a.depth)) {
    try {
      if (!row.parentHandle || !row.handle) {
        throw new Error("Folder handle unavailable.");
      }
      const validation = await validateFolderStillDiscardable(row.handle, els.emptyDefinition.value);
      if (!validation.ok) {
        throw new Error(validation.reason);
      }
      if (quarantineHandle) {
        await mirrorFolderToQuarantine(row.handle, quarantineHandle, row.path.split("/").filter(Boolean));
      }
      await row.parentHandle.removeEntry(row.name, { recursive: true });
      markProcessed(row.path);
      addLog(`${quarantineHandle ? "Quarantined and discarded" : "Discarded"}: ${row.path}`);
    } catch (error) {
      state.failures.push({ path: row.path, message: error.message });
      addLog(`Failed: ${row.path} (${error.message})`, "error");
    } finally {
      state.metrics.completed += 1;
      updateMetrics();
      await yieldToBrowser();
    }
  }

  state.processing = false;
  setStatus("Finished");
  updateMetrics(true);
  syncParentCounts();
  renderParentList();
  updateFolderSummary();
  buildReport();
  renderPreview();
  resetRunMetrics();
  updateControls();

  if (quarantineHandle) {
    els.zipInfo.textContent = "Report ready. Quarantined folders can be restored from the quarantine path before final deletion.";
  }
  addLog(`Cleanup finished with ${state.failures.length} failed folder${state.failures.length === 1 ? "" : "s"}.`);
}

async function discardSelectedFoldersWithBackend(selectedRows) {
  const action = els.quarantineOption.checked ? "quarantine and discard" : "discard";
  const confirmed = window.confirm(`Confirm ${action} through the firm server backend for ${selectedRows.length} selected empty folder${selectedRows.length === 1 ? "" : "s"}?`);
  if (!confirmed) {
    addLog("Cleanup canceled during confirmation.", "warn");
    return;
  }

  state.processing = true;
  state.metrics = {
    total: selectedRows.length,
    completed: 0,
    startTime: performance.now()
  };
  updateMetrics();
  updateControls();
  setStatus(els.quarantineOption.checked ? "Backend quarantining..." : "Backend discarding...");
  addLog("Backend cleanup started.");

  try {
    const result = await backendRequest("/api/discard", {
      method: "POST",
      body: {
        rootPath: state.backendRootPath || els.serverPathInput.value.trim(),
        relativePaths: selectedRows.map(row => row.relativePath).filter(Boolean),
        settings: settingsPayload(),
        quarantine: els.quarantineOption.checked,
        approval: els.approvalCheck.checked
      }
    });

    for (const row of result.processed || []) {
      markProcessed(row.path);
      addLog(`Backend discarded: ${row.path}`);
    }

    for (const failure of result.failures || []) {
      state.failures.push(failure);
      addLog(`Backend failed: ${failure.path} (${failure.message})`, "error");
    }

    state.metrics.completed = selectedRows.length;
    updateMetrics(true);
    setStatus("Finished");
    if (result.quarantinePath) {
      els.zipInfo.textContent = `Report ready. Quarantine path: ${result.quarantinePath}`;
    }
    addLog(result.message || "Backend cleanup finished.");
  } catch (error) {
    addLog(`Backend cleanup failed: ${error.message}`, "error");
    setStatus("Finished");
  } finally {
    state.processing = false;
    syncParentCounts();
    renderParentList();
    updateFolderSummary();
    buildReport();
    renderPreview();
    resetRunMetrics();
    updateControls();
  }
}

function compressTargets(rows) {
  const selectedPaths = new Set(rows.map(row => row.path));
  return rows.filter(row => {
    const parts = row.path.split("/").filter(Boolean);
    for (let index = parts.length - 1; index > 0; index -= 1) {
      const ancestor = parts.slice(0, index).join("/");
      if (selectedPaths.has(ancestor)) return false;
    }
    return true;
  });
}

async function createQuarantineHandle() {
  const quarantineRoot = await state.rootHandle.getDirectoryHandle(QUARANTINE_FOLDER, { create: true });
  const date = new Date();
  const stamp = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
    "_",
    String(date.getHours()).padStart(2, "0"),
    String(date.getMinutes()).padStart(2, "0"),
    String(date.getSeconds()).padStart(2, "0")
  ].join("");
  return quarantineRoot.getDirectoryHandle(stamp, { create: true });
}

async function mirrorFolderToQuarantine(sourceHandle, quarantineHandle, pathParts) {
  let target = quarantineHandle;
  for (const part of pathParts) {
    target = await target.getDirectoryHandle(part, { create: true });
  }

  for await (const [name, childHandle] of sourceHandle.entries()) {
    if (childHandle.kind === "directory") {
      await mirrorFolderToQuarantine(childHandle, target, [name]);
    } else if (childHandle.kind === "file" && isSystemFileName(name)) {
      const sourceFile = await childHandle.getFile();
      const targetFile = await target.getFileHandle(name, { create: true });
      const writable = await targetFile.createWritable();
      await writable.write(sourceFile);
      await writable.close();
    }
  }
}

async function validateFolderStillDiscardable(folderHandle, mode) {
  for await (const [name, childHandle] of folderHandle.entries()) {
    if (childHandle.kind === "directory") {
      if (mode === "strict") {
        return { ok: false, reason: "Folder now contains a child folder." };
      }
      const childValidation = await validateFolderStillDiscardable(childHandle, mode);
      if (!childValidation.ok) {
        return childValidation;
      }
    } else if (childHandle.kind === "file") {
      if (mode === "strict" || !isSystemFileName(name)) {
        return { ok: false, reason: "Folder now contains a non-empty file." };
      }
    }
  }
  return { ok: true, reason: "" };
}

function markProcessed(path) {
  const matches = state.reviewRows.filter(row => isSameOrChildPath(row.path, path));
  if (!matches.length) return;

  const alreadyStored = new Set(state.discardedRows.map(row => row.path));
  for (const row of matches) {
    state.processedRows.add(row.path);
    state.selectedFolders.delete(row.path);
    if (!alreadyStored.has(row.path)) {
      state.discardedRows.push({
        ...row,
        reportStatus: "processed",
        canDiscard: false
      });
    }
  }

  state.allReviewRows = state.allReviewRows.filter(row => !isSameOrChildPath(row.path, path));
  state.reviewRows = state.reviewRows.filter(row => !isSameOrChildPath(row.path, path));
  state.filteredRows = state.filteredRows.filter(row => !isSameOrChildPath(row.path, path));
}

function isSameOrChildPath(candidatePath, selectedPath) {
  return candidatePath === selectedPath || candidatePath.startsWith(`${selectedPath}/`);
}

function buildReport() {
  revokeReportObjectUrl();
  if (!state.directories.size) {
    state.reportBlob = null;
    return;
  }

  const generatedAt = new Date().toISOString();
  const rows = [[
    "generated_at",
    "app",
    "source",
    "preset",
    "empty_definition",
    "age_filter_days",
    "quarantine_selected",
    "folder_path",
    "copyable_path",
    "parent_folder",
    "last_modified",
    "status",
    "selected",
    "reason"
  ]];

  const reportRows = [...state.reviewRows, ...state.discardedRows];
  for (const row of reportRows) {
    rows.push([
      generatedAt,
      "SGA FILE NEXUS",
      state.sourceLabel,
      els.presetSelect.options[els.presetSelect.selectedIndex].text,
      els.emptyDefinition.options[els.emptyDefinition.selectedIndex].text,
      els.ageFilter.value,
      els.quarantineOption.checked ? "yes" : "no",
      row.path,
      absolutePathForRow(row),
      row.parent,
      formatDate(row.lastModified),
      row.reportStatus || statusForRow(row),
      state.selectedFolders.has(row.path) ? "yes" : "no",
      failureForPath(row.path)?.message || row.reason
    ]);
  }

  const csv = rows.map(reportRow => reportRow.map(csvCell).join(",")).join("\n");
  state.reportBlob = new Blob([csv], { type: REPORT_MIME });
  state.reportName = `${safeFileName(state.mainFolderName || "SGA_FILE_NEXUS")}_empty_folder_audit.csv`;
  els.downloadButton.disabled = false;
  if (!els.quarantineOption.checked || !els.zipInfo.textContent.includes("Quarantined")) {
    els.zipInfo.textContent = `Audit report ready: ${reportRows.length} reviewed folders`;
  }
}

function downloadReport() {
  if (!state.reportBlob) {
    addLog("No report is ready yet. Scan a folder first.", "warn");
    return;
  }

  const url = ensureReportObjectUrl();
  const link = document.createElement("a");
  link.href = url;
  link.download = state.reportName || "SGA_FILE_NEXUS_empty_folder_audit.csv";
  link.style.display = "none";
  document.body.appendChild(link);
  link.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
  link.remove();
  addLog("Audit report download started.");
}

function resetRunMetrics() {
  const selectedReady = state.reviewRows.filter(row => state.selectedFolders.has(row.path) && row.canDiscard).length;
  const protectedCount = state.reviewRows.filter(row => row.status === "protected").length;
  state.metrics = {
    total: selectedReady,
    completed: 0,
    startTime: performance.now()
  };
  els.totalFiles.textContent = state.reviewRows.length;
  els.completedFiles.textContent = state.discardedRows.length;
  els.remainingFiles.textContent = selectedReady;
  els.elapsedTime.textContent = "00:00";
  els.etaTime.textContent = "--:--";
  els.filesPerSecond.textContent = "0.0";
  els.heicSpeed.textContent = protectedCount;
  setProgress(0);
}

function updateMetrics(done = false) {
  const elapsedSeconds = Math.max(0.001, (performance.now() - state.metrics.startTime) / 1000);
  const completed = state.metrics.completed;
  const remaining = Math.max(0, state.metrics.total - completed);
  const perSecond = completed / elapsedSeconds;
  const etaSeconds = perSecond > 0 ? remaining / perSecond : 0;

  els.totalFiles.textContent = state.reviewRows.length;
  els.completedFiles.textContent = state.discardedRows.length || completed;
  els.remainingFiles.textContent = remaining;
  els.elapsedTime.textContent = formatDuration(elapsedSeconds);
  els.etaTime.textContent = done ? "00:00" : (completed ? formatDuration(etaSeconds) : "--:--");
  els.filesPerSecond.textContent = perSecond.toFixed(1);
  els.heicSpeed.textContent = state.reviewRows.filter(row => row.status === "protected").length;
  setProgress(state.metrics.total ? (completed / state.metrics.total) * 100 : 0);
}

function updateControls() {
  const hasParents = state.parentFolders.size > 0 && state.allReviewRows.length > 0;
  const hasRows = state.reviewRows.length > 0;
  const selectedReady = state.reviewRows.filter(row => state.selectedFolders.has(row.path) && row.canDiscard && statusForRow(row) === "ready").length;
  const canDiscard = selectedReady > 0 && els.approvalCheck.checked && state.hasWriteAccess && !state.processing;

  els.selectAllButton.disabled = !hasParents || state.processing;
  els.deselectAllButton.disabled = !hasParents || state.processing;
  els.renameButton.disabled = !state.directories.size || state.processing;
  els.discardButton.disabled = !canDiscard;
  els.downloadButton.disabled = !state.reportBlob;
  els.selectVisibleButton.disabled = !state.filteredRows.length || state.processing;
  els.clearVisibleButton.disabled = !state.filteredRows.length || state.processing;
  els.checkBackendButton.disabled = state.processing;
  els.scanBackendButton.disabled = state.processing;

  if (!state.directories.size) {
    els.renameButton.textContent = "Apply Scan Rules";
    els.discardButton.textContent = "Discard Selected";
    els.downloadButton.textContent = "Download Report";
    return;
  }

  els.renameButton.textContent = "Apply Scan Rules";
  els.discardButton.textContent = selectedReady ? `Discard Selected (${selectedReady})` : "Discard Selected";
  els.downloadButton.textContent = "Download Report";

  if (!state.hasWriteAccess && hasRows) {
    els.zipInfo.textContent = "Scan-only source: download the audit report for server cleanup.";
  }
}

function updateFolderSummary() {
  if (!state.mainFolderName) {
    els.folderSummary.textContent = "No folder loaded.";
    return;
  }

  const activeParentCount = [...state.parentFolders.values()]
    .filter(parent => parent.emptyCount || parent.protectedCount)
    .length;
  const readyCount = state.allReviewRows.filter(row => row.status === "ready").length;
  const protectedCount = state.allReviewRows.filter(row => row.status === "protected").length;
  const discardedText = state.discardedRows.length ? `, ${state.discardedRows.length} discarded` : "";

  els.folderSummary.textContent = `${state.mainFolderName}: ${activeParentCount} parent folders, ${state.scannedFolders} folders scanned, ${readyCount} ready, ${protectedCount} protected${discardedText}.`;
}

function setProgress(percent) {
  const safe = Math.max(0, Math.min(100, percent));
  els.progressBar.style.width = `${safe}%`;
  els.percentText.textContent = `${Math.round(safe)}%`;
}

function setStatus(message) {
  els.statusText.textContent = message;
}

function addLog(message, type = "info") {
  const entry = document.createElement("div");
  entry.className = `log-entry ${type}`;
  const time = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  entry.innerHTML = `<span class="log-time">${time}</span>`;
  entry.append(document.createTextNode(message));
  els.messageLog.prepend(entry);
}

function clearAll() {
  els.folderInput.value = "";
  clearWorkingState();
  resetUi();
  addLog("Cleared current folder.");
}

function clearWorkingState() {
  state.sourceKind = "";
  state.sourceLabel = "";
  state.mainFolderName = "";
  state.scannedFolders = 0;
  state.rootHandle = null;
  state.hasWriteAccess = false;
  state.directories = new Map();
  state.files = [];
  state.parentFolders = new Map();
  state.selectedParents = new Set();
  state.allReviewRows = [];
  state.reviewRows = [];
  state.filteredRows = [];
  state.selectedFolders = new Set();
  state.processedRows = new Set();
  state.discardedRows = [];
  state.failures = [];
  state.reportBlob = null;
  revokeReportObjectUrl();
  state.reportName = "";
  state.backendRootPath = "";
  state.processing = false;
}

function resetUi() {
  els.parentList.innerHTML = "";
  els.folderSummary.textContent = "No folder loaded.";
  els.previewBody.innerHTML = '<tr><td colspan="5" class="empty-state">Load a folder to scan for empty folders.</td></tr>';
  els.previewCount.textContent = "0 folders";
  els.zipInfo.textContent = "Audit report will be available after scanning.";
  els.searchInput.value = "";
  els.statusFilter.value = "all";
  els.approvalCheck.checked = false;
  setStatus("Waiting for a folder.");
  setProgress(0);
  els.totalFiles.textContent = "0";
  els.completedFiles.textContent = "0";
  els.remainingFiles.textContent = "0";
  els.elapsedTime.textContent = "00:00";
  els.etaTime.textContent = "--:--";
  els.filesPerSecond.textContent = "0.0";
  els.heicSpeed.textContent = "0";
  updateControls();
}

function statusForRow(row) {
  if (state.processedRows.has(row.path)) return "processed";
  if (failureForPath(row.path)) return "failed";
  return row.status;
}

function failureForPath(path) {
  return state.failures.find(failure => failure.path === path);
}

function statusCell(status, reason) {
  const td = document.createElement("td");
  const span = document.createElement("span");
  span.className = `row-status ${status}`;
  span.title = reason;
  span.textContent = status;
  td.appendChild(span);
  return td;
}

function folderPathCell(row) {
  const td = document.createElement("td");
  td.className = "path-cell";

  const wrapper = document.createElement("div");
  wrapper.className = "path-cell-content";

  const pathText = document.createElement("span");
  pathText.className = "path-text";
  pathText.textContent = row.path;
  pathText.title = `Copyable path: ${absolutePathForRow(row)}`;

  const actions = document.createElement("div");
  actions.className = "path-actions";

  const copyButton = document.createElement("button");
  copyButton.className = "path-action";
  copyButton.type = "button";
  copyButton.textContent = "Copy";
  copyButton.title = "Copy this folder path so you can paste it into File Explorer or an email.";
  copyButton.addEventListener("click", () => copyPathForRow(row, copyButton));
  actions.appendChild(copyButton);

  if (canAttemptOpenPath(row)) {
    const openButton = document.createElement("button");
    openButton.className = "path-action";
    openButton.type = "button";
    openButton.textContent = "Open";
    openButton.title = "Try to open this folder in a new tab. Some browsers block local server folder links, so the path is copied too.";
    openButton.addEventListener("click", () => openPathForRow(row));
    actions.appendChild(openButton);
  }

  wrapper.append(pathText, actions);
  td.appendChild(wrapper);
  return td;
}

function cell(text) {
  const td = document.createElement("td");
  td.textContent = text;
  return td;
}

async function copyPathForRow(row, button) {
  const targetPath = absolutePathForRow(row);
  const copied = await copyTextToClipboard(targetPath);
  if (!copied) {
    addLog("Path could not be copied automatically. Select the folder path text and copy it manually.", "warn");
    return;
  }
  const original = button.textContent;
  button.textContent = "Copied";
  window.setTimeout(() => {
    button.textContent = original;
  }, 1200);
  addLog(`Copied folder path: ${targetPath}`);
}

async function openPathForRow(row) {
  const targetPath = absolutePathForRow(row);
  await copyTextToClipboard(targetPath);
  const opened = window.open(fileUrlForPath(targetPath), "_blank", "noopener");
  addLog(opened
    ? `Opening folder path. If the browser blocks it, paste the copied path into File Explorer: ${targetPath}`
    : `Browser blocked direct folder opening. The path was copied so you can paste it into File Explorer: ${targetPath}`,
    opened ? "info" : "warn");
}

function absolutePathForRow(row) {
  if (state.sourceKind === "backend" && state.backendRootPath && row.relativePath) {
    const root = state.backendRootPath.replace(/[\\/]+$/, "");
    const separator = root.includes("\\") || /^[a-z]:/i.test(root) ? "\\" : "/";
    return `${root}${separator}${row.relativePath.replaceAll("/", separator)}`;
  }
  return row.path;
}

function canAttemptOpenPath(row) {
  return state.sourceKind === "backend" && Boolean(state.backendRootPath && row.relativePath);
}

async function copyTextToClipboard(text) {
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall through to the textarea fallback.
    }
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();
  let copied = false;
  try {
    copied = document.execCommand("copy");
  } catch {
    copied = false;
  }
  textarea.remove();
  return copied;
}

function fileUrlForPath(folderPath) {
  if (folderPath.startsWith("\\\\")) {
    return `file:${folderPath.replaceAll("\\", "/")}`;
  }
  if (/^[a-z]:/i.test(folderPath)) {
    return `file:///${folderPath.replaceAll("\\", "/")}`;
  }
  return `file://${folderPath.replaceAll("\\", "/")}`;
}

function emptyReason(directory, strictMode) {
  if (strictMode) return "No files or child folders.";
  if (directory.subtreeSystemFileCount) return "Only ignored system files and empty subfolders.";
  return "Empty folder tree.";
}

function ageStatus(lastModified, minAgeDays, includeUnknownDates) {
  if (!minAgeDays) {
    return { ok: true, reason: "" };
  }
  if (!lastModified) {
    return includeUnknownDates
      ? { ok: true, reason: "Folder date unknown." }
      : { ok: false, reason: "Unknown date excluded by age rule." };
  }
  const ageMs = Date.now() - lastModified;
  const minMs = minAgeDays * 24 * 60 * 60 * 1000;
  if (ageMs >= minMs) {
    return { ok: true, reason: "" };
  }
  return { ok: false, reason: `Newer than ${minAgeDays} days.` };
}

function protectedPatterns() {
  return els.protectedRules.value
    .split(/[\n,]+/)
    .map(rule => rule.trim())
    .filter(Boolean);
}

function protectedReasonForPath(path, patterns) {
  const lowerPath = path.toLowerCase();
  const match = patterns.find(rule => lowerPath.includes(rule.toLowerCase()));
  return match ? `Protected rule: ${match}` : "";
}

function isSystemFileName(fileName) {
  const name = String(fileName || "").toLowerCase();
  return SYSTEM_FILE_NAMES.has(name) || name.startsWith("._");
}

function commonMainFolder(path) {
  const first = path.split("/").filter(Boolean)[0];
  return first || "";
}

function normalizePath(path) {
  return String(path || "").replaceAll("\\", "/").replace(/^\/+|\/+$/g, "");
}

function pathJoin(...parts) {
  return parts.map(part => String(part).replace(/^\/+|\/+$/g, "")).filter(Boolean).join("/");
}

function slug(value) {
  return String(value).replace(/[^a-z0-9_-]+/gi, "-");
}

function formatDuration(seconds) {
  const total = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(total / 60);
  const secs = total % 60;
  return `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function formatDate(timestamp) {
  if (!timestamp) return "Unknown";
  return new Date(timestamp).toLocaleDateString([], { year: "numeric", month: "short", day: "2-digit" });
}

function csvCell(value) {
  const text = String(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}

function safeFileName(value) {
  return String(value || "SGA_FILE_NEXUS").replace(/[^a-z0-9_-]+/gi, "_").replace(/^_+|_+$/g, "");
}

function ensureReportObjectUrl() {
  if (!state.reportUrl && state.reportBlob) {
    state.reportUrl = URL.createObjectURL(state.reportBlob);
  }
  return state.reportUrl;
}

function revokeReportObjectUrl() {
  if (state.reportUrl) {
    URL.revokeObjectURL(state.reportUrl);
    state.reportUrl = "";
  }
}

function yieldToBrowser() {
  return new Promise(resolve => setTimeout(resolve, 0));
}

function debounce(callback, delay) {
  let timer = 0;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => callback(...args), delay);
  };
}
