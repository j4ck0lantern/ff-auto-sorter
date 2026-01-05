/* --- Constants --- */


/* --- On Install --- */
browser.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === "install") {
    const { sorterConfig } = await browser.storage.local.get("sorterConfig");
    if (!sorterConfig) {
      await browser.storage.local.set({ sorterConfig: [] });
    }
  }

  // Create Context Menu
  try {
    browser.menus.create({
      id: "classify-single-bookmark",
      title: "Classify with AI",
      contexts: ["bookmark"],
    });

    // NEW: Sort Selected Tabs
    browser.menus.create({
      id: "sort-selected-tabs",
      title: "Bookmark and AI Sort Tabs 🤖",
      contexts: ["tab"]
    });
  } catch (e) {
    console.warn("Context menu creation failed (likely duplicate):", e);
  }
});

/* --- Context Menu Listener --- */
browser.menus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === "classify-single-bookmark") {
    await browser.notifications.create("classify-start", {
      type: "basic",
      iconUrl: "icons/icon-48.png",
      title: "Auto Sorter",
      message: "Classifying bookmark with AI..."
    });

    try {
      const [bookmark] = await browser.bookmarks.get(info.bookmarkId);
      if (bookmark.url) {
        console.log(`Context menu classify for: ${bookmark.title}`);
        const result = await processSingleBookmarkAI(bookmark);

        if (result && result.success) {
          await browser.notifications.clear("classify-start");
          await browser.notifications.create("classify-success", {
            type: "basic",
            iconUrl: "icons/icon-48.png",
            title: "Auto Sorter",
            message: `Moved to: ${result.folder}`
          });
        } else {
          throw new Error(result?.error || "AI check failed");
        }
      }
    } catch (e) {
      console.error("Single bookmark classify error:", e);
      await browser.notifications.clear("classify-start");
      await browser.notifications.create("classify-error", {
        type: "basic",
        iconUrl: "icons/icon-48.png",
        title: "Auto Sorter",
        message: `Error: ${e.message}`
      });
    }
  } else if (info.menuItemId === "sort-selected-tabs") {
    await handleSortSelectedTabs();
  }
});

/* --- Bookmark Created Listener --- */
browser.bookmarks.onCreated.addListener(async (id, bookmark) => {
  // SEMAPHORE LOCK: Prevent interference during bulk operations
  if (isScanning) {
    console.log("Skipping onCreated (Scanning in progress)");
    return;
  }

  if (!bookmark.url) return; // Ignore folders

  const searchResults = await browser.bookmarks.search({ url: bookmark.url });
  if (searchResults.length > 1) {
    console.log("Duplicate found, removing.");
    await browser.bookmarks.remove(id);
    return;
  }
  await organizeBookmark(bookmark);
});

/* --- Config Change Listener --- */
browser.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' || area === 'local') {
    if (changes.sorterConfig) {
      console.log("[Background] Configuration changed in storage.");
      // No action needed; getConfig() fetches fresh data on usage.
    }
    if (changes.aiConfig) {
      // reload AI config if needed, or just let functions fetch it fresh
    }
  }
});

/* --- State Management --- */
let isScanning = false;
let scanProgress = { current: 0, total: 0, detail: "", stage: "Ready" };

function broadcastState() {
  browser.runtime.sendMessage({
    action: "scan-status-update",
    isScanning,
    progress: scanProgress
  }).catch(() => { });
}

/* --- LOGIC: Organize (Rules Based) --- */


// HELPER: Broadcast Progress
let lastBroadcast = 0;
function updateProgress(current, total) {
  if (Date.now() - lastBroadcast < 100 && current < total) return;
  lastBroadcast = Date.now();

  // Calculate percentage
  if (total === 0) total = 1;
  scanProgress = {
    current: current,
    total: total,
    percentage: Math.round((current / total) * 100)
  };

  broadcastState();
}

/* --- Feature: Sort Selected Tabs --- */
async function handleSortSelectedTabs() {
  try {
    const tabs = await browser.tabs.query({ highlighted: true, currentWindow: true });
    let processed = 0;

    await browser.notifications.create("tabs-sort-start", {
      type: "basic",
      iconUrl: "icons/icon-48.png",
      title: "Auto Sorter",
      message: `Processing ${tabs.length} tabs...`
    });

    for (const tab of tabs) {
      // Strategy: Create bookmark. THEN manually call `processSingleBookmarkAI` on it.
      const bookmark = await browser.bookmarks.create({
        title: tab.title,
        url: tab.url,
        parentId: "unfiled_____" // Default to "Other Bookmarks"
      });

      // Let's trust `navigate` or `organizeBookmark` first. 
      // IF we want AI immediately for tabs, we should call `processSingleBookmarkAI`.

      processed++;

      // 3. Close Tab
      await browser.tabs.remove(tab.id);
    }

  } catch (e) {
    console.error("Tab sort error:", e);
  }
}


/* --- Message Listener --- */
browser.runtime.onMessage.addListener(async (message) => {
  if (message.action === "get-scan-status") {
    // console.log("Background: Received get-scan-status"); 
    return { isScanning, progress: scanProgress };
  }

  if (isScanning && (message.action.includes('all') || message.action.includes('clear'))) {
    return { error: "Task in progress" };
  }

  if (message.action === "organize-all") {
    runTask(async () => {
      // START REPORT
      if (window.reportManager) window.reportManager.start('Organize');

      const tree = await browser.bookmarks.getTree();
      let bookmarks = await getAllBookmarks(tree[0]);

      // 1. Deduplicate
      scanProgress.stage = "Deduplicating";
      scanProgress.detail = "Removing duplicates...";
      broadcastState();
      bookmarks = await deduplicateBookmarks(bookmarks);

      // PRE-CALCULATE FOLDER MAP (Speed Boost)
      scanProgress.stage = "Indexing";
      scanProgress.detail = "Building folder cache...";
      broadcastState();
      // Re-fetch tree to be safe after dedupe
      const freshTree = await browser.bookmarks.getTree();
      const folderMap = buildFolderMap(freshTree[0]);

      scanProgress.stage = "Organizing";
      scanProgress.total = bookmarks.length;
      broadcastState();

      // 2. Organize Bookmarks
      for (const b of bookmarks) {
        scanProgress.current++;
        scanProgress.detail = b.title || b.url; // Fallback
        broadcastState();
        // Pass the cached map
        await organizeBookmark(b, folderMap);
      }

      // 3. Consolidate Folders
      scanProgress.stage = "Consolidating";
      scanProgress.detail = "Consolidating folders...";
      broadcastState();
      await consolidateFolders();

      // 4. Enforce Structure (Create Missing & Sort)
      scanProgress.stage = "Sorting Folders";
      scanProgress.detail = "Enforcing folder order...";
      broadcastState();
      await enforceFolderStructure();

      // 5. Prune Empty Folders (safe)
      scanProgress.stage = "Pruning";
      scanProgress.detail = "Cleaning empty folders...";
      broadcastState();
      await pruneEmptyFolders();
    });
  }

  else if (message.action === "classify-all") {
    runTask(async () => {
      // START REPORT
      if (window.reportManager) window.reportManager.start('AI Classify');

      // 0. PRE-FILTER: Identify Ignored Folder IDs
      const sorterConfig = await getConfig();
      const ignoredPaths = new Set(
        sorterConfig
          .filter(r => r.config && r.config.ignore)
          .map(r => r.folder.trim().toLowerCase())
      );

      const tree = await browser.bookmarks.getTree();
      const ignoredIds = new Set();

      if (ignoredPaths.size > 0) {
        // Resolve Paths to IDs
        // We reuse the folder map logic or simple traversal
        const mapIds = (node, currentPath) => {
          if (!node.url && node.id) { // Folder
            // Match?
            if (ignoredPaths.has(currentPath.toLowerCase())) {
              ignoredIds.add(node.id);
            }
            if (node.children) {
              node.children.forEach(c => mapIds(c, currentPath ? `${currentPath}/${c.title}` : c.title));
            }
          }
        };
        // Root children are top level
        if (tree[0].children) {
          tree[0].children.forEach(c => mapIds(c, c.title));
        }
      }

      let bookmarks = await getAllBookmarks(tree[0], ignoredIds);

      // 1. Deduplicate
      scanProgress.stage = "Deduplicating";
      scanProgress.detail = "Removing duplicates...";
      broadcastState();
      bookmarks = await deduplicateBookmarks(bookmarks);

      scanProgress.total = bookmarks.length;
      scanProgress.current = 0; // Fix: Reset progress
      scanProgress.stage = "AI Classifying";
      broadcastState();

      // Load AI Config for Speed
      let aiConfig;
      try {
        const local = await browser.storage.local.get("aiConfig");
        aiConfig = local.aiConfig;
      } catch (e) { }

      const aiDelay = (aiConfig && aiConfig.speed) ? aiConfig.speed : 1500;

      // Determine Concurrency
      const isFastMode = aiDelay <= 200;
      const batchSize = isFastMode ? 5 : 1;

      await processInBatches(bookmarks, batchSize, async (b) => {
        scanProgress.current++;
        if (scanProgress.current % (isFastMode ? 5 : 1) === 0) broadcastState();

        // Log Scan
        if (window.reportManager) window.reportManager.logScan();

        const normUrl = getNormalizedUrl(b.url);
        const dbTags = await TagDB.getTags(normUrl);
        // console.log(`[AI-Scan] Checking ${b.title}: Tags=${JSON.stringify(dbTags)}`);

        if (dbTags && dbTags.aiFolder && dbTags.aiFolder.toLowerCase() !== "miscellaneous") {
          // console.log(`[AI-Scan] Skipping ${b.title} (already tagged: ${dbTags.aiFolder})`);
          return;
        }

        scanProgress.detail = `AI: ${b.title}`;
        broadcastState();

        if (!isFastMode) await delay(aiDelay);

        // Check if bookmark is currently in an ignored folder?
        // Hard to cheaply without full tree path knowledge.
        // We'll trust the rules to ignore if configured.

        await processSingleBookmarkAI(b, true); // Pass true to indicate mutex needed
      });

      // 3. Enforce Folder Structure (Sort 0-N)
      // FIX: Ensure folders are sorted after AI moves
      scanProgress.stage = "Sorting Folders";
      scanProgress.detail = "Enforcing folder order...";
      broadcastState();
      await enforceFolderStructure();

      // 4. Prune Empty
      scanProgress.stage = "Pruning";
      scanProgress.detail = "Cleaning empty folders...";
      broadcastState();
      await pruneEmptyFolders();
    });
  }

  else if (message.action === "clear-tags") {
    runTask(async () => {
      const tree = await browser.bookmarks.getTree();
      const bookmarks = await getAllBookmarks(tree[0]);
      scanProgress.stage = "Clearing Tags";
      scanProgress.total = bookmarks.length;
      scanProgress.current = 0; // Fix: Reset progress
      broadcastState();

      for (const b of bookmarks) {
        scanProgress.current++;
        if (scanProgress.current % 50 === 0) broadcastState();

        // ONLY clear from DB now
        await TagDB.removeTags(getNormalizedUrl(b.url), b.id);
      }
    });
  }

  else if (message.action === "analyze-for-suggestions") {
    console.log("Received analyze-for-suggestions request");
    const result = await analyzeBookmarksForSuggestions(message.existingConfig);
    return result;
  }

  else if (message.action === "analyze-static-conflicts") {
    const { config } = message;
    return analyzeStaticConflicts(config);
  }

  else if (message.action === "analyze-semantic-conflicts") {
    const { config } = message;
    return await analyzeSemanticConflicts(config);
  }
});

async function runTask(taskFn) {
  if (isScanning) return;
  isScanning = true;
  scanProgress = { current: 0, total: 0, detail: "Starting...", stage: "Initializing" };
  broadcastState();

  try {
    await taskFn();
  } catch (e) {
    console.error("Task failed:", e);
    scanProgress.detail = `Error: ${e.message}`;
    scanProgress.stage = "Error";
  } finally {
    isScanning = false;
    scanProgress.detail = "Done.";
    scanProgress.stage = "Complete";

    // FINISH REPORT
    let reportLink = null;
    if (window.reportManager && window.reportManager.currentReport) {
      const reportId = await window.reportManager.finish();
      if (reportId) {
        reportLink = `reports.html?id=${reportId}`;
        // Optional: Notify user
        await browser.notifications.create("report-ready-" + reportId, {
          type: "basic",
          iconUrl: "icons/icon-48.png",
          title: "Run Completed",
          message: "Click to view the detailed report.",
          priority: 2
        });
      }
    }
    scanProgress.reportLink = reportLink; // Send link to UI

    broadcastState();
    setTimeout(() => {
      scanProgress = { current: 0, total: 0, detail: "", stage: "Ready" };
      broadcastState();
    }, 3000);
  }
}
