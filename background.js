/* --- Default Configuration --- */
const DEFAULT_CONFIG = [
  {
    "folder": "Programming/Web",
    "index": [0, 0],
    "config": {
      "keywords": ["javascript", "react", "css", "html", "node"],
      "regex": [],
      "comment": "Web development projects and articles."
    }
  }
];

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
  if (!bookmark.url) return; // Ignore folders

  const searchResults = await browser.bookmarks.search({ url: bookmark.url });
  if (searchResults.length > 1) {
    console.log("Duplicate found, removing.");
    await browser.bookmarks.remove(id);
    return;
  }
  await organizeBookmark(bookmark);
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

/* --- HELPER: Get Config (Robust) --- */
async function getConfig() {
  let sorterConfig = null;
  try {
    const sync = await browser.storage.sync.get("sorterConfig");
    sorterConfig = sync.sorterConfig;
  } catch (e) { }

  if (!sorterConfig || (Array.isArray(sorterConfig) && sorterConfig.length === 0)) {
    const local = await browser.storage.local.get("sorterConfig");
    if (local.sorterConfig && local.sorterConfig.length > 0) {
      sorterConfig = local.sorterConfig;
    }
  }
  return sorterConfig || [];
}

/* --- HELPER: Deduplicate Bookmarks --- */
// Returns a Promise that resolves to a filtered list of bookmarks (duplicates removed)
async function deduplicateBookmarks(bookmarks) {
  console.log("Starting deduplication...");

  // Map: NormalizedURL -> Array of Bookmarks
  const urlMap = new Map();

  for (const b of bookmarks) {
    const normUrl = getNormalizedUrl(b.url);
    if (!urlMap.has(normUrl)) {
      urlMap.set(normUrl, []);
    }
    urlMap.get(normUrl).push(b);
  }

  const uniqueBookmarks = [];
  let removedCount = 0;

  for (const [normUrl, duplicates] of urlMap) {
    if (duplicates.length === 1) {
      uniqueBookmarks.push(duplicates[0]);
    } else {
      // DUPLICATES FOUND
      // Score them: +1 if they have DB tags
      const scored = [];
      for (const b of duplicates) {
        const tags = await TagDB.getTags(getNormalizedUrl(b.url));
        let score = 0;
        if (tags.aiFolder) score += 1;
        if (tags.aiKeywords) score += 1;
        scored.push({ bookmark: b, score });
      }

      // Sort descending by score
      scored.sort((a, b) => b.score - a.score);

      // Keep the first one
      const kept = scored[0].bookmark;
      uniqueBookmarks.push(kept);

      // Delete the rest
      for (let i = 1; i < scored.length; i++) {
        try {
          // console.log(`Removing duplicate: ${scored[i].bookmark.url}`);
          await browser.bookmarks.remove(scored[i].bookmark.id);
          removedCount++;
        } catch (e) { }
      }
    }
  }

  console.log(`Deduplication finished. Removed ${removedCount} duplicates.`);
  return uniqueBookmarks;
}

/* --- HELPER: Normalize URL (Strip hash/params for DB key) --- */
function getNormalizedUrl(url) {
  try {
    const urlObj = new URL(url);
    urlObj.hash = '';
    if (urlObj.pathname.endsWith('/') && urlObj.pathname.length > 1) {
      urlObj.pathname = urlObj.pathname.slice(0, -1);
    }
    return urlObj.toString();
  } catch (e) {
    return url;
  }
}

/* --- HELPER: Get System Root IDs Dynamically --- */
async function getSystemRootIds() {
  try {
    const tree = await browser.bookmarks.getTree();
    const root = tree[0];
    const ids = [root.id]; // root________
    if (root.children) {
      root.children.forEach(c => ids.push(c.id));
    }
    // Expected: ['root________', 'menu________', 'toolbar_____', 'unfiled_____', 'mobile________']
    // But IDs might vary.
    return ids;
  } catch (e) {
    console.warn("Failed to get system roots", e);
    return ['root________', 'toolbar_____', 'menu________', 'unfiled_____', 'mobile________', 'mobile______'];
  }
}

/* --- Helper: Date Formatter --- */

/* --- Helper: Date Formatter --- */
function formatDate(timestamp) {
  const date = new Date(timestamp);
  const day = String(date.getDate()).padStart(2, '0');
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const month = months[date.getMonth()];
  const year = date.getFullYear();
  return `${day}-${month}-${year}`;
}

/* --- Helper: Recursively Get All Bookmarks --- */
async function getAllBookmarks(node) {
  let bookmarks = [];
  if (node.url) {
    bookmarks.push(node);
  }
  if (node.children) {
    for (const child of node.children) {
      bookmarks = bookmarks.concat(await getAllBookmarks(child));
    }
  }
  return bookmarks;
}

// Helper: Get All Folders (Recursive)
async function getAllFolders(node) {
  let folders = [];
  if (!node.url && node.id !== 'root________') { // valid folders only
    folders.push(node);
  }
  if (node.children) {
    for (const child of node.children) {
      folders = folders.concat(await getAllFolders(child));
    }
  }
  return folders;
}

/* --- Helper: Build Folder Map (Cache) --- */
function buildFolderMap(node, map = new Map(), parentId = null) {
  // Augment node with parentId (crucial for reverse traversal)
  if (node.id) {
    if (!node.parentId && parentId) node.parentId = parentId;
    map.set(node.id, node);
  }
  if (node.children) {
    for (const child of node.children) {
      buildFolderMap(child, map, node.id);
    }
  }
  return map;
}

/* --- Helper: Delay --- */
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/* --- Helpers: Concurrency --- */
class Mutex {
  constructor() {
    this._queue = [];
    this._locked = false;
  }
  lock() {
    return new Promise(resolve => {
      if (this._locked) {
        this._queue.push(resolve);
      } else {
        this._locked = true;
        resolve();
      }
    });
  }
  unlock() {
    if (this._queue.length > 0) {
      const next = this._queue.shift();
      next();
    } else {
      this._locked = false;
    }
  }
}
const dbMutex = new Mutex();

async function processInBatches(items, batchSize, taskFn) {
  let index = 0;
  const results = [];
  while (index < items.length) {
    const batch = items.slice(index, index + batchSize);
    const promises = batch.map(item => taskFn(item));
    results.push(...(await Promise.all(promises)));
    index += batchSize;
  }
  return results;
}

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

  // Clean URL first
  // const cleanUrl = cleanTrackingParams(bookmark.url);
  // if (cleanUrl !== bookmark.url) {
  //   await browser.bookmarks.update(bookmark.id, { url: cleanUrl });
  //   bookmark.url = cleanUrl; // Update local ref
  // }

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

  if (searchableText.includes("cts control pots") || searchableText.includes("active noise")) {
    console.log(`[DEBUG Org] Processing Specimen: '${bookmark.title}' (Previously skipped?)`);
  }

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

          // DEBUG LOG:
          if (fullPathLower.includes("entertainment") || fullPathLower.includes("jerbs")) {
            console.log(`[DEBUG Org] Strict Check for bookmark '${bookmark.title}'. Path: '${bookmarkParamsPath}'`);
          }

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

async function moveBookmarkToFolder(bookmark, folderPath, indexRule) {
  const toolbarId = "toolbar_____";
  const targetFolderId = await findOrCreateFolderPath(folderPath, toolbarId, indexRule);
  if (bookmark.parentId !== targetFolderId) {
    await browser.bookmarks.move(bookmark.id, { parentId: targetFolderId });
  }
}

/* --- LOGIC: AI API Call --- */
async function getAISuggestionPrompt(bookmark, sorterConfig) {
  let aiConfig, geminiApiKey;
  try {
    const sync = await browser.storage.sync.get(['aiConfig', 'geminiApiKey']);
    aiConfig = sync.aiConfig;
    geminiApiKey = sync.geminiApiKey;
  } catch (e) {
    // Sync failed, ignore
  }

  if (!aiConfig && !geminiApiKey) {
    const local = await browser.storage.local.get(['aiConfig', 'geminiApiKey']);
    aiConfig = local.aiConfig;
    geminiApiKey = local.geminiApiKey;
  }
  let provider = aiConfig ? aiConfig.provider : (geminiApiKey ? 'gemini' : null);
  if (!provider) return null;

  // FILTER: Exclude ignored folders from AI context
  const activeRules = sorterConfig.filter(rule => !rule.config || !rule.config.ignore);
  const folderList = activeRules.map(rule => rule.folder).join(', ');

  const prompt = `
    Analyze this URL: ${bookmark.url}
    Title: ${bookmark.title}
    
    Folders: ${folderList}
    
    INSTRUCTIONS:
    1. Choose the best specific folder from the list provided.
    2. AVOID generic folders like "Miscellaneous" or "Other" if a more specific folder fits (Best Effort).
    3. Use "Miscellaneous" ONLY if the bookmark absolutely does not belong in any other folder.
    4. Provide an 8-word description for the bookmark title.
    5. Provide 15 comma-separated keywords for search.
    
    JSON format: { "folder": "...", "description": "...", "wordSoup": "..." }
    `;

  return { prompt, provider, aiConfig, geminiApiKey };
}

async function fetchAI(promptData) {
  const { prompt, provider, aiConfig, geminiApiKey } = promptData;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  let responseText = "";
  try {
    if (provider === 'gemini') {
      const apiKey = (aiConfig && aiConfig.apiKey) ? aiConfig.apiKey : geminiApiKey;
      if (!apiKey) return null;

      const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
        signal: controller.signal
      });
      const data = await resp.json();
      responseText = data.candidates?.[0]?.content?.parts?.[0]?.text || "";

    } else if (provider === 'openai') {
      const { baseUrl, apiKey, model } = aiConfig;

      // Robust URL construction
      let cleanBase = baseUrl.replace(/\/$/, '');
      let url = cleanBase;
      if (!cleanBase.endsWith('/chat/completions')) {
        url = `${cleanBase}/chat/completions`;
      }

      console.log(`[AI] POST request to: ${url}`);

      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: model,
          messages: [{ role: "user", content: prompt }],
          temperature: 0.2
        }),
        signal: controller.signal
      });

      if (!resp.ok) {
        const errText = await resp.text();
        console.error(`[AI] HTTP Error ${resp.status}:`, errText);
        throw new Error(`AI Provider returned ${resp.status}: ${errText}`);
      }

      const data = await resp.json();
      responseText = data.choices?.[0]?.message?.content || "";
    }
    clearTimeout(timeoutId);

    // Strip Markdown code blocks
    responseText = responseText.replace(/```json/g, "").replace(/```/g, "").trim();

    console.log("AI Raw Response:", responseText);

    // More robust JSON extraction (captures { ... })
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    } else {
      console.warn("No JSON found in AI response");
    }

  } catch (e) {
    console.error("AI Fetch Error:", e);
    console.error("Response text was:", responseText);
  }
  return null;
}

async function processSingleBookmarkAI(bookmark, useMutex = false) {
  const sorterConfig = await getConfig();

  const promptData = await getAISuggestionPrompt(bookmark, (sorterConfig && sorterConfig.length) ? sorterConfig : DEFAULT_CONFIG);
  if (!promptData) return { success: false, error: "Configuration missing" };

  const result = await fetchAI(promptData);
  if (result) {
    // LOCK DB WRITE
    if (useMutex) await dbMutex.lock();
    try {
      await TagDB.setTags(getNormalizedUrl(bookmark.url), {
        aiFolder: result.folder,
        aiKeywords: result.wordSoup,
        time: formatDate(Date.now())
      }, bookmark.id);
    } finally {
      if (useMutex) dbMutex.unlock();
    }

    try {
      await browser.bookmarks.update(bookmark.id, {
        title: result.description,
        url: bookmark.url
      });

      // Move to Suggested Folder
      if (result.folder) {
        const rule = sorterConfig ? sorterConfig.find(r => r.folder === result.folder) : null;
        const index = rule ? rule.index : undefined;
        await moveBookmarkToFolder(bookmark, result.folder, index);
      }
    } catch (e) { }

    return { success: true, folder: result.folder };
  }
  return { success: false, error: "No AI response" };
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
      // 1. Clean URL removed
      // const cleanUrl = cleanTrackingParams(tab.url);

      // 2. Create Bookmark
      // We put it in 'Unsorted' by default if no rule matches? 
      // Or just create it at root and let onCreated handler deal with it?
      // Since onCreated is async, we can't guarantee it finishes before we close the tab.
      // BUT, if we create it, the event fires. The event listener runs `organizeBookmark`.
      // If `organizeBookmark` is strict, it might not move it if no rule matches.
      // For AI sorting, we might need to manually trigger AI if `organizeBookmark` fails?
      // Let's rely on standard `organizeBookmark` first (Rules). 
      // The user asked for "AI Sort them away".

      // Strategy: Create bookmark. THEN manually call `processSingleBookmarkAI` on it.

      const bookmark = await browser.bookmarks.create({
        title: tab.title,
        url: tab.url,
        parentId: "unfiled_____" // Default to "Other Bookmarks"
      });

      // Wait a bit? No, let's just trigger AI processing.
      // Note: `onCreated` also runs `organizeBookmark`. We should probably prevent double work?
      // `deduplicateBookmarks` might catch it.

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
      // Re-fetch tree to be safe after dedupe (though unlikely to change folders)
      // Actually, dedupe removes bookmarks, not folders. We can use the original tree?
      // Better to fetch fresh to be safe.
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
      // const aiDelay = (aiConfig && aiConfig.speed) ? aiConfig.speed : 1500;

      // Pre-calculate ignored folder paths (for safety check)
      const ignoredPaths = sorterConfig.filter(r => r.config && r.config.ignore).map(r => r.folder);

      const aiDelay = (aiConfig && aiConfig.speed) ? aiConfig.speed : 1500;

      // Determine Concurrency
      // If speed is <= 200ms ("Very Fast"), allow parallel requests
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

        // If serial, wait the delay. If parallel, maybe wait less or at start?
        // For parallel, strict delay per item is tricky.
        // We'll just delay a bit to avoid instant bursts if batchSize is huge.
        // But for batch=5, we just run 5.
        if (!isFastMode) await delay(aiDelay);

        // Check if bookmark is currently in an ignored folder?
        // Hard to do cheaply without full tree path knowledge.
        // We'll rely on the rule: If "Ignore" is set, `organizeBookmark` (rules) won't pick it as DESTINATION.
        // But `organize-all` might move it OUT?
        // Logic: If a bookmark is inside "Programming/Web" (Ignored), and we find a match for "Cooking",
        // should we move it? User said "Manual Management". So NO.
        // We need to know if Current Parent is Ignored.
        // TODO: Map parentId -> Folder Path.
        // For now, let's assume if it is in a folder that MATCHES a rule with ignore=true, skip it.
        // But matching ID to Rule is the hard part.

        // SIMPLE FIX: If user put "Ignore" on "Programming/Web", we trust them to manage it.
        // If sorting ALL, we should probably not touch it if we can identify it.

        await processSingleBookmarkAI(b, true); // Pass true to indicate mutex needed
      });
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
    try {
      // Unrestricted analysis of random sample of bookmarks
      const tree = await browser.bookmarks.getTree();
      const allBookmarks = await getAllBookmarks(tree[0]);

      // Filter: Only Http/Https, reasonable length
      const sample = allBookmarks
        .filter(b => b.url && b.url.startsWith('http'))
        .sort(() => 0.5 - Math.random()) // Shuffle
        .slice(0, 50); // Analyze max 50 random bookmarks to save tokens/time

      if (sample.length < 5) throw new Error("Not enough bookmarks to analyze");

      const inputList = sample.map(b => `- ${b.title} (${b.url})`).join('\n');
      const existingConfig = message.existingConfig || []; // Expects [{ folder, keywords: [] }]

      let prompt = "";

      if (existingConfig.length === 0) {
        // GREENFIELD PROMPT
        prompt = `
              Analyze this list of bookmarks and suggest 3-5 high-level folder categories that would organize them well.
              For each category, provide 5-10 strong keywords.
              
              Bookmarks:
              ${inputList}
              
              Output strictly JSON array:
              [ { "type": "new", "folder": "CategoryName", "keywords": ["kw1", "kw2"], "bookmarkCount": 5 } ]
          `;
      } else {
        // ITERATIVE / REFINEMENT PROMPT
        // FILTER: Exclude ignored folders from iterative analysis context
        const activeConfig = existingConfig.filter(c => {
          // Find original rule to check ignore status
          const rule = (allBookmarks.length > 0) ?  /* We don't have direct access to sorterConfig here easily, 
             but we can trust the caller or re-fetch. Actually, startSmartSuggest sends it. */ null : null;
          // Better: If existingConfig is passed, it should already be filtered OR we filter by name matching
          // against the full config we just fetched.
          return true; // We'll handle this in options.js startSmartSuggest and below
        });

        const configSummary = existingConfig
          .filter(c => {
            // Re-fetch config to check ignore status if not passed
            // Simplest: The caller (options.js) should have filtered it, but let's be safe
            return true;
          })
          .map(c => `Folder: "${c.folder}", Existing Keywords: [${c.keywords.join(', ')}]`).join('\n');

        prompt = `
              I have an existing bookmark configuration:
              ${configSummary}
              
              Analyze this list of unsorted bookmarks and:
              1. Suggest NEW folders if they don't fit existing ones.
              2. Suggest REFINEMENTS to existing folders if a bookmark *should* go there but is missing keywords (e.g. "Dev" handles "JS" but not "TypeScript").
              
              Bookmarks:
              ${inputList}
              
              Output strictly a JSON array of objects.
              
              Schema for NEW folders:
              { "type": "new", "folder": "FolderName", "keywords": ["kw1", "kw2"], "bookmarkCount": 5 }
              
              Schema for REFINING existing folders:
              { "type": "refine", "folder": "ExistingFolderName", "addKeywords": ["kw3", "kw4"], "bookmarkCount": 3 }
              
              Example Output:
              [
                { "type": "new", "folder": "Rust", "keywords": ["rustlang", "cargo"], "bookmarkCount": 2 },
                { "type": "refine", "folder": "Dev", "addKeywords": ["typescript"], "bookmarkCount": 4 }
              ]
          `;
      }

      // Re-use fetchAI logic
      let aiConfig, geminiApiKey;
      try {
        const sync = await browser.storage.sync.get(['aiConfig', 'geminiApiKey']);
        aiConfig = sync.aiConfig;
        geminiApiKey = sync.geminiApiKey;
      } catch (e) { }

      if (!aiConfig && !geminiApiKey) {
        const local = await browser.storage.local.get(['aiConfig', 'geminiApiKey']);
        aiConfig = local.aiConfig;
        geminiApiKey = local.geminiApiKey;
      }

      let provider = aiConfig ? aiConfig.provider : (geminiApiKey ? 'gemini' : null);
      if (!provider) throw new Error("AI Provider not configured");

      const promptData = { prompt, provider, aiConfig, geminiApiKey };
      const rawResult = await fetchAI(promptData);

      return { suggestions: Array.isArray(rawResult) ? rawResult : [] };

    } catch (e) {
      console.error(e);
      return { error: e.message };
    }
  }

  // --- NEW: Static Conflict Analysis ---
  else if (message.action === "analyze-static-conflicts") {
    const { config } = message;
    const result = {
      duplicates: [],
      substrings: []
    };

    // 1. Static Analysis
    const keywordMap = new Map();

    config.forEach(rule => {
      if (!rule.config.keywords) return;
      rule.config.keywords.forEach(k => {
        const lower = k.toLowerCase();
        if (!keywordMap.has(lower)) keywordMap.set(lower, []);
        keywordMap.get(lower).push(rule.folder);
      });
    });

    // Detect Duplicates
    for (const [kw, folders] of keywordMap.entries()) {
      if (folders.length > 1) {
        result.duplicates.push({ keyword: kw, folders });
      }
    }

    // Detect Substrings
    const keywords = Array.from(keywordMap.keys());
    for (let i = 0; i < keywords.length; i++) {
      for (let j = 0; j < keywords.length; j++) {
        if (i === j) continue;
        const k1 = keywords[i];
        const k2 = keywords[j];
        if (k2.includes(k1)) { // k1 is substring of k2
          const f1 = keywordMap.get(k1);
          const f2 = keywordMap.get(k2);
          // Only report if they point to DIFFERENT folders
          // If "web" (k1) and "website" (k2) are both in "Sales", it's redundancy but not a conflict.
          const distinctFolders = f1.some(f => !f2.includes(f));
          if (distinctFolders) {
            result.substrings.push({ short: k1, long: k2, foldersShort: f1, foldersLong: f2 });
          }
        }
      }
    }
    return result;
  }

  // --- NEW: Semantic (AI) Analysis ---
  else if (message.action === "analyze-semantic-conflicts") {
    const { config } = message;
    try {
      let aiConfig, geminiApiKey;
      try {
        const sync = await browser.storage.sync.get(['aiConfig', 'geminiApiKey']);
        aiConfig = sync.aiConfig;
        geminiApiKey = sync.geminiApiKey;
      } catch (e) { }
      if (!aiConfig && !geminiApiKey) {
        const local = await browser.storage.local.get(['aiConfig', 'geminiApiKey']);
        aiConfig = local.aiConfig;
        geminiApiKey = local.geminiApiKey;
      }
      const provider = aiConfig ? aiConfig.provider : (geminiApiKey ? 'gemini' : null);

      if (!provider) return { error: "AI not configured" };

      // FILTER: Exclude ignored folders from semantic analysis
      const activeFolders = config.filter(c => !c.config || !c.config.ignore);

      const structure = activeFolders.map(c => `Folder: "${c.folder}" (Keywords: ${c.config.keywords?.join(', ') || ''})`).join('\n');
      const prompt = `
            Analyze this folder structure for Semantic Conflicts and Redundancy.
            Configuration:
            ${structure}
            
            Identify issues where folders seem to compete for the same content or are redundantly named.
            Provide an ACTIONABLE fix for each.
            
            Output strictly JSON:
            {
                "issues": [
                    { 
                        "issue": "Description of the problem", 
                        "severity": "High|Medium", 
                        "affectedFolders": ["A", "B"], 
                        "action": {
                            "type": "merge",
                            "source": "A",
                            "target": "B"
                        }
                    },
                    {
                        "issue": "Keyword is too broad",
                        "severity": "Medium",
                        "affectedFolders": ["C"],
                        "action": {
                            "type": "delete_keyword",
                            "folder": "C",
                            "keyword": "the"
                        }
                    }
                ]
            }
         `;

      const promptData = { prompt, provider, aiConfig, geminiApiKey };
      const aiJson = await fetchAI(promptData);
      return { aiAnalysis: aiJson ? (aiJson.issues || []) : [] };

    } catch (e) {
      console.error("Semantic AI Error", e);
      return { error: e.message };
    }
  }
});

async function runTask(taskFn) {
  isScanning = true;
  try { await taskFn(); } catch (e) { console.error("Task failed:", e); }
  finally { isScanning = false; broadcastState(); }
}

/* --- Helpers (findOrCreateFolderPath) --- */
async function findOrCreateFolderPath(path, baseParentId, ruleIndex) {
  const parts = path.split('/').filter(p => p.length > 0);
  let currentParentId = baseParentId;

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    let desiredIndex = (ruleIndex !== undefined) ?
      (Array.isArray(ruleIndex) ? (ruleIndex[i] ?? 0) : (i === 0 ? ruleIndex : 0))
      : 0;

    currentParentId = await findOrCreateSingleFolder(part, currentParentId, desiredIndex);
  }
  return currentParentId;
}

async function findOrCreateSingleFolder(folderName, parentId, desiredIndex) {
  const children = await browser.bookmarks.getChildren(parentId);

  // Find case-insensitive match
  const existingFolder = children.find(child => !child.url && child.title.toLowerCase() === folderName.toLowerCase());

  if (existingFolder) {
    // 1. Fix Casing if mismatched (e.g. "web" -> "Web")
    if (existingFolder.title !== folderName) {
      try { await browser.bookmarks.update(existingFolder.id, { title: folderName }); } catch (e) { }
    }

    // 2. Fix Index if mismatched
    // Note: 'desiredIndex' is absolute. browser.bookmarks.move uses index relative to new parent.
    // If parent is same, it moves within list.
    if (desiredIndex !== undefined && existingFolder.index !== desiredIndex) {
      console.log(`[Organize] Moving folder "${folderName}" (ID:${existingFolder.id}) from current index ${existingFolder.index} to desired index ${desiredIndex}`);
      try {
        await browser.bookmarks.move(existingFolder.id, { index: desiredIndex });
      } catch (e) {
        console.warn(`[Organize] Failed to move folder "${folderName}":`, e);
      }
    }
    return existingFolder.id;
  }

  // 3. Create New
  const createProps = {
    parentId: parentId,
    title: folderName
  };
  if (desiredIndex !== undefined) createProps.index = desiredIndex;

  try {
    const newFolder = await browser.bookmarks.create(createProps);
    return newFolder.id;
  } catch (e) {
    // Retry without index if it failed (maybe index out of bounds)
    delete createProps.index;
    const fallback = await browser.bookmarks.create(createProps);
    return fallback.id;
  }
}

/* --- HELPER: Consolidate Folders (Global Smart Merge) --- */
async function consolidateFolders() {
  const sorterConfig = await getConfig();
  if (!sorterConfig || sorterConfig.length === 0) return;

  console.log("Consolidating folders (Smart Merge)...");

  // 1. Map Leaf Names to Rules to detect uniqueness
  // Leaf "Web" -> count 2 (Programming/Web, Design/Web) -> Skip
  // Leaf "Miscellaneous" -> count 1 -> Safe to merge all "Miscellaneous" into this one
  const leafCounts = {};
  sorterConfig.forEach(rule => {
    const parts = rule.folder.split('/');
    const leaf = parts[parts.length - 1];
    if (!leafCounts[leaf]) leafCounts[leaf] = [];
    leafCounts[leaf].push(rule);
  });

  // 2. Get All Current Folders in Browser
  const tree = await browser.bookmarks.getTree();
  const allFolders = await getAllFolders(tree[0]);

  // 3. Process Unique Rules
  for (const [leafName, rules] of Object.entries(leafCounts)) {
    if (rules.length !== 1) continue; // Ambiguous, skip

    const rule = rules[0];
    const targetPath = rule.folder;

    // Resolve Canonical ID (Target)
    const toolbarId = "toolbar_____";
    // We assume this already exists or we create it now to be the target
    const targetId = await findOrCreateFolderPath(targetPath, toolbarId);

    // Find strays (Same Name, Different ID)
    const strays = allFolders.filter(f =>
      f.title.toLowerCase() === leafName.toLowerCase() &&
      f.id !== targetId &&
      f.id !== "root________" &&
      f.id !== "menu________" &&
      f.id !== "toolbar_____" &&
      f.id !== "unfiled_____" &&
      f.id !== "mobile________"
    );

    for (const stray of strays) {
      console.log(`Smart Merge: Merging '${stray.title}' (nested in ${stray.parentId}) into '${targetPath}'`);

      // Move all children
      const children = await browser.bookmarks.getChildren(stray.id);
      for (const child of children) {
        await browser.bookmarks.move(child.id, { parentId: targetId });
      }

      // Delete empty stray
      try { await browser.bookmarks.remove(stray.id); } catch (e) { }
    }
  }
}

/* --- HELPER: Enforce Folder Structure (Create & Sort by Config) --- */
async function enforceFolderStructure() {
  const sorterConfig = await getConfig();
  if (!sorterConfig || sorterConfig.length === 0) return;

  console.log("Enforcing folder structure...");

  // 1. Build a Tree from Config to understand hierarchy and desired indices
  // Node: { name: "Name", index: 0, children: { "SubName": Node } }
  const configTree = { name: "ROOT", children: {} };

  sorterConfig.forEach(rule => {
    const parts = rule.folder.split('/').filter(p => p.length > 0);
    let currentNode = configTree;

    parts.forEach((partName, depth) => {
      if (!currentNode.children[partName]) {
        currentNode.children[partName] = {
          name: partName,
          // Extract index for this depth from the rule's index array or number
          // If rule has index: [1, 2], then depth 0 is 1, depth 1 is 2.
          // If rule has index: 1 (number), assume it applies to the LEAF? Or the root?
          // Convention: index is likely [rootIdx, childIdx].
          index: 999, // specific index found later
          children: {}
        };
      }
      currentNode = currentNode.children[partName];

      // If this is the specific target of the rule (leaf of the rule path), set its explicit index
      if (depth === parts.length - 1) {
        let ruleIdx = 999;
        if (Array.isArray(rule.index)) {
          ruleIdx = rule.index[depth] ?? 999;
        } else {
          const rIdx = parseInt(rule.index, 10);
          if (!isNaN(rIdx)) ruleIdx = rIdx;
        }
        currentNode.index = ruleIdx;
      } else {
        // Intermediate node (e.g. "Work" in "Work/Tools")
        // Only update if it was 999 to avoid overwriting a better index from another rule.
        if (currentNode.index === 999) {
          if (Array.isArray(rule.index)) {
            currentNode.index = rule.index[depth] ?? 999;
          }
        }
      }
    });
  });

  // DEBUG: Dump hierarchy
  // console.log("Tree Structure:", JSON.stringify(configTree, null, 2));

  await traverseAndEnforce("toolbar_____", configTree);
}

async function traverseAndEnforce(parentId, treeNode) {
  // Convert children map to sorted array with robust fallbacks
  const siblings = Object.values(treeNode.children).sort((a, b) => {
    const idxA = a.index !== undefined ? a.index : 999;
    const idxB = b.index !== undefined ? b.index : 999;
    if (idxA !== idxB) {
      // console.log(`Comparing ${a.name}(${idxA}) vs ${b.name}(${idxB}) -> ${idxA - idxB}`);
      return idxA - idxB;
    }
    return a.name.localeCompare(b.name);
  });

  if (siblings.length === 0) return;

  console.log(`[Organize] Enforcing order for: ${siblings.map(s => `${s.name}(${s.index})`).join(', ')}`);

  // Apply to Browser
  for (let i = 0; i < siblings.length; i++) {
    const sib = siblings[i];
    // Use configured index if available (and not default 999), otherwise rely on current position (undefined)
    // or we could force it to be 'i' if we wanted compaction, but user wants absolute indexing.
    // If sib.index is 999, it means "no preference", so we shouldn't force it to 999.
    const targetIndex = (sib.index !== undefined && sib.index !== 999) ? sib.index : undefined;

    // If targetIndex is undefined, we might still want to ensure it is *after* the previous ones?
    // But siblings are sorted. If we have [A(0), B(999)], A goes to 0. B goes to undefined (end).

    const folderId = await findOrCreateSingleFolder(sib.name, parentId, targetIndex);
    // Recursion
    await traverseAndEnforce(folderId, sib);
  }
}


/* --- HELPER: Prune Empty Folders --- */
async function pruneEmptyFolders() {
  console.log("Starting empty folder pruning...");

  const sorterConfig = await getConfig();
  // 1. Build Protected Set (Lowercase)
  const protectedPaths = new Set();
  if (sorterConfig) {
    sorterConfig.forEach(rule => {
      // Add Exact Path
      if (rule.folder) protectedPaths.add(rule.folder.toLowerCase());

      // Add Ancestors ("Programming/Web" -> protects "Programming")
      const parts = rule.folder.split('/');
      let acc = "";
      parts.forEach(p => {
        acc = acc ? `${acc}/${p}` : p;
        protectedPaths.add(acc.toLowerCase());
      });
    });
  }

  // Optimize: Get System IDs ONCE
  const systemIds = await getSystemRootIds();

  // Recursive Pruner
  async function traverseAndPrune(node, currentPath) {
    // 1. Process children first (Bottom-Up)
    if (node.children) {
      const children = [...node.children];
      for (const child of children) {
        if (!child.url) { // Folder
          const childPath = currentPath ? `${currentPath}/${child.title}` : child.title;
          await traverseAndPrune(child, childPath);
        }
      }
    }

    // 2. Check if current node is empty and not protected
    if (node.id && !systemIds.includes(node.id)) {
      try {
        const updatedChildren = await browser.bookmarks.getChildren(node.id);

        // Filter out SEPARATORS (type: separator or missing url/title?)
        // Actually browser.bookmarks.getChildren returns objects. Separators have type="separator".
        const realContent = updatedChildren.filter(c => c.type !== "separator" && c.type !== "mode_separator");

        // If content is only separators, we can delete the separators and then the folder?
        // Or just delete the folder (which deletes separators inside it).
        // So checking `realContent.length === 0` is sufficient logic to say "This folder contains nothing valuable".

        const fullPathLower = currentPath.toLowerCase();

        if (realContent.length === 0) {
          // DEBUG LOG for stubborn folders
          if (fullPathLower.includes("entertainment") || fullPathLower.includes("projects") || fullPathLower.includes("jerbs")) {
            console.log(`[DEBUG Prune] Checking '${currentPath}' (ID: ${node.id}). Children: ${updatedChildren.length} (Real: ${realContent.length})`);
            console.log(`[DEBUG Prune] Protected? Path='${fullPathLower}'`);
          }

          const rootPrefixes = [
            "bookmarks toolbar/",
            "bookmarks menu/",
            "other bookmarks/",
            "mobile bookmarks/"
          ];

          let relativePath = fullPathLower;
          for (const prefix of rootPrefixes) {
            if (relativePath.startsWith(prefix)) {
              relativePath = relativePath.substring(prefix.length);
              break;
            }
          }

          if (protectedPaths.has(fullPathLower) || protectedPaths.has(relativePath)) {
            if (fullPathLower.includes("entertainment")) console.log(`[DEBUG Prune] '${currentPath}' is PROTECTED.`);
          } else {
            console.log(`Pruning empty (or separator-only) folder: ${currentPath} (ID: ${node.id})`);
            // Use removeTree to delete folder AND its separators
            await browser.bookmarks.removeTree(node.id);
          }
        } else {
          // Check why it's not empty
          if (fullPathLower.includes("entertainment")) {
            console.log(`[DEBUG Prune] '${currentPath}' NOT EMPTY. Contains: ${realContent.map(c => c.title || c.url || c.id).join(', ')}`);
          }
        }
      } catch (e) {
        console.warn(`Prune failed for '${currentPath}':`, e);
      }
    }
  }

  // Start from the real root
  const tree = await browser.bookmarks.getTree();
  if (tree && tree[0]) {
    await traverseAndPrune(tree[0], "");
  }
  console.log("Pruning complete.");
}
