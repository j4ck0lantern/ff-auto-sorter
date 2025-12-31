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
let scanProgress = { current: 0, total: 0, detail: "" };

function broadcastState() {
  browser.runtime.sendMessage({
    action: "scan-status-update",
    isScanning,
    progress: scanProgress
  }).catch(() => { });
}

/* --- LOGIC: Organize (Rules Based) --- */
async function organizeBookmark(bookmark, folderMap = null) {
  const sorterConfig = await getConfig();
  if (!sorterConfig || sorterConfig.length === 0) return;

  /* 
   * SMART AI TAG CHECK
   */
  const dbTags = await TagDB.getTags(getNormalizedUrl(bookmark.url));
  if (dbTags.aiFolder) {
    // Check if this folder rule still exists
    const isRuleActive = sorterConfig.some(rule => {
      const ruleLower = rule.folder.trim().toLowerCase();
      const tagLower = dbTags.aiFolder.trim().toLowerCase();
      // Relaxed Check: 
      // 1. Exact Match
      if (ruleLower === tagLower) return true;
      // 2. Rule ends with Tag (Taxonomy shift: "Job Hunting" -> "My Life/Job Hunting")
      if (ruleLower.endsWith("/" + tagLower)) return true;
      // 3. Tag ends with Rule (Reverse shift)
      if (tagLower.endsWith("/" + ruleLower)) return true;
      return false;
    });

    if (isRuleActive) {
      // Rule exists -> Trust the AI tag -> Skip processing (Leave it alone)
      return;
    } else {
      console.log(`[Organize] AI Tag '${dbTags.aiFolder}' invalid/inactive. Re-evaluating '${bookmark.title}'.`);
      // Fall through to standard matching (Regex/Keywords/Ancestry)
    }
  }

  // Ignore Folders/Separators
  if (!bookmark.url) return;

  const searchableText = (bookmark.title + " " + bookmark.url).toLowerCase();



  let matchedRule = null;

  for (const item of sorterConfig) {
    const config = item.config;
    if (!config) continue;
    if (config.ignore) continue; // Skip ignored folders

    if (config.regex) {
      for (const rx of config.regex) {
        try {
          if (new RegExp(rx.pattern, 'i').test(searchableText)) {
            matchedRule = item;
            break;
          }
        } catch (e) { }
      }
    }
    if (matchedRule) break;

    if (config.keywords) {
      for (const kw of config.keywords) {
        if (searchableText.includes(kw.toLowerCase())) {
          matchedRule = item;
          break;
        }
      }
    }
    if (matchedRule) break;
  }

  if (matchedRule) {
    console.log(`Matched '${bookmark.title}' to '${matchedRule.folder}'`);
    await moveBookmarkToFolder(bookmark, matchedRule.folder, matchedRule.index);
    return; // Done
  }

  // --- DEFAULT FOLDER LOGIC ---
  if (!matchedRule) {
    // Check for Default Folder
    let defaultRule = sorterConfig.find(r => r.config && r.config.default);

    // FALLBACK: If no default is SET, assume "Miscellaneous"
    if (!defaultRule) {
      console.log(`[DEBUG Org] No Default Rule configured. Using Implicit Default: 'Miscellaneous'.`);
      defaultRule = {
        folder: "Miscellaneous",
        index: [999], // End
        config: { default: true }
      };
    }

    if (defaultRule) {
      // "Parent" is the folder holding the bookmark.
      const parentArr = await browser.bookmarks.get(bookmark.parentId);
      const parent = parentArr[0];
      const sysRoots = await getSystemRootIds();

      console.log(`[Organize] Checking default for '${bookmark.title}' (Parent: '${parent.title}' | ID: ${parent.id})`);

      if (!sysRoots.includes(parent.id)) {
        // STRICT PATH ENFORCEMENT
        // 1. Build the full path of the current parent (e.g., "Programming/Web/React")
        let pathParts = [parent.title];
        let current = parent;
        let isValidHierarchy = true;

        // Safety depth cap
        for (let i = 0; i < 8; i++) { // Max depth 8 safety
          if (sysRoots.includes(current.parentId)) break; // Reached Root's child (Top Level)

          let ups;
          if (folderMap) {
            ups = folderMap.get(current.parentId); // Sync Lookup (Fast)
            if (ups) ups = [ups]; // Mimic API array format
          } else {
            ups = await browser.bookmarks.get(current.parentId); // Async API (Slow)
          }

          if (!ups || !ups[0]) {
            isValidHierarchy = false; // Orphaned?
            break;
          }
          current = ups[0];
          pathParts.unshift(current.title); // Prepend parent name
        }

        if (isValidHierarchy) {
          const bookmarkParamsPath = pathParts.join('/');
          const fullPathLower = bookmarkParamsPath.toLowerCase();



          // 2. Build Set of Valid Configured Paths (and their ancestors)
          const validPaths = new Set();
          const validRoots = []; // Array for prefix checking

          sorterConfig.forEach(rule => {
            if (rule.folder) {
              const lower = rule.folder.trim().toLowerCase();
              validPaths.add(lower);
              validRoots.push(lower);
            }
            // Ancestors are valid too (e.g., "Programming" is valid if "Programming/Web" exists)
            const parts = rule.folder.split('/');
            let acc = "";
            parts.forEach(p => {
              acc = acc ? `${acc}/${p}` : p;
              const lowerAncest = acc.toLowerCase();
              validPaths.add(lowerAncest);
              validRoots.push(lowerAncest);
            });
          });

          // 3. Strict Check with Subfolder Support
          // Logic: Valid if Exact Match OR if it is a child of a Valid Path
          let isProtected = false;

          if (validPaths.has(fullPathLower)) {
            isProtected = true;
          } else {
            // Prefix Check: "Interests/Carpentry" starts with "interests/" ?
            isProtected = validRoots.some(root => fullPathLower.startsWith(root + '/'));
          }

          if (isProtected) {
            console.log(`[Organize] Valid: '${bookmarkParamsPath}' (Configured/Child).`);
            return; // Allowed to stay
          } else {
            console.log(`[Organize] Stray: '${bookmarkParamsPath}' -> Default.`);
            // Fall through to move
          }
        } else {
          console.log(`[Organize] Hierarchy broken for '${parent.title}'. Moving to Default.`);
        }
      }

      console.log(`[Organize] applying Default Rule. Moving '${bookmark.title}' to '${defaultRule.folder}'`);
      await moveBookmarkToFolder(bookmark, defaultRule.folder, defaultRule.index);
    } else {
      console.log(`[Organize] No Default Rule found. Skipping '${bookmark.title}'.`);
    }
  }
}

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
      const tree = await browser.bookmarks.getTree();
      let bookmarks = await getAllBookmarks(tree[0]);

      // 1. Deduplicate
      scanProgress.detail = "Removing duplicates...";
      broadcastState();
      bookmarks = await deduplicateBookmarks(bookmarks);

      // PRE-CALCULATE FOLDER MAP (Speed Boost)
      scanProgress.detail = "Building folder cache...";
      broadcastState();
      // Re-fetch tree to be safe after dedupe
      const freshTree = await browser.bookmarks.getTree();
      const folderMap = buildFolderMap(freshTree[0]);

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
      scanProgress.detail = "Consolidating folders...";
      broadcastState();
      await consolidateFolders();

      // 4. Enforce Structure (Create Missing & Sort)
      scanProgress.detail = "Enforcing folder order...";
      broadcastState();
      await enforceFolderStructure();

      // 5. Prune Empty Folders (safe)
      scanProgress.detail = "Cleaning empty folders...";
      broadcastState();
      await pruneEmptyFolders();
    });
  }

  else if (message.action === "classify-all") {
    runTask(async () => {
      const tree = await browser.bookmarks.getTree();
      let bookmarks = await getAllBookmarks(tree[0]);

      // 1. Deduplicate
      scanProgress.detail = "Removing duplicates...";
      broadcastState();
      bookmarks = await deduplicateBookmarks(bookmarks);

      scanProgress.total = bookmarks.length;
      scanProgress.current = 0; // Fix: Reset progress
      broadcastState();

      const sorterConfig = await getConfig();

      // Load AI Config for Speed
      let aiConfig;
      try {
        const sync = await browser.storage.sync.get("aiConfig");
        aiConfig = sync.aiConfig;
      } catch (e) { }
      if (!aiConfig) {
        const local = await browser.storage.local.get("aiConfig");
        aiConfig = local.aiConfig;
      }

      const aiDelay = (aiConfig && aiConfig.speed) ? aiConfig.speed : 1500;

      // Determine Concurrency
      const isFastMode = aiDelay <= 200;
      const batchSize = isFastMode ? 5 : 1;

      await processInBatches(bookmarks, batchSize, async (b) => {
        scanProgress.current++;
        if (scanProgress.current % (isFastMode ? 5 : 1) === 0) broadcastState();

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
      scanProgress.detail = "Enforcing folder order...";
      broadcastState();
      await enforceFolderStructure();

      // 4. Prune Empty
      scanProgress.detail = "Cleaning empty folders...";
      broadcastState();
      await pruneEmptyFolders();
    });
  }

  else if (message.action === "clear-tags") {
    runTask(async () => {
      const tree = await browser.bookmarks.getTree();
      const bookmarks = await getAllBookmarks(tree[0]);
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
  scanProgress = { current: 0, total: 0, detail: "Starting..." };
  broadcastState();

  try {
    await taskFn();
  } catch (e) {
    console.error("Task failed:", e);
    scanProgress.detail = `Error: ${e.message}`;
  } finally {
    isScanning = false;
    scanProgress.detail = "Done.";
    broadcastState();
    setTimeout(() => {
      scanProgress = { current: 0, total: 0, detail: "" };
      broadcastState();
    }, 3000);
  }
}
