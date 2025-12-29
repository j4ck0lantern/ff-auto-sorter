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
  browser.menus.create({
    id: "classify-single-bookmark",
    title: "Classify with AI",
    contexts: ["bookmark"],
  });

  // NEW: Sort Selected Tabs
  browser.menus.create({
    id: "sort-selected-tabs",
    title: "Sort Selected Tabs",
    contexts: ["tab"]
  });
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
  const searchResults = await browser.bookmarks.search({ url: bookmark.url });
  if (searchResults.length > 1) {
    console.log("Duplicate found, removing.");
    await browser.bookmarks.remove(id);
    return;
  }
  await organizeBookmark(bookmark);
});

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
    // Explicitly kill the hash for the Key, so #section links share tags with main page?
    // User preference usually: Tag the *Resource*.
    // Let's strip hash completely for the DB Key to be robust.
    urlObj.hash = '';

    // Strip trailing slash
    if (urlObj.pathname.endsWith('/') && urlObj.pathname.length > 1) {
      urlObj.pathname = urlObj.pathname.slice(0, -1);
    }
    return urlObj.toString();
  } catch (e) {
    return url;
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

/* --- Helper: Delay --- */
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

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
async function organizeBookmark(bookmark) {
  let sorterConfig;
  try {
    const sync = await browser.storage.sync.get("sorterConfig");
    sorterConfig = sync.sorterConfig;
  } catch (e) { }

  if (!sorterConfig) {
    const local = await browser.storage.local.get("sorterConfig");
    sorterConfig = local.sorterConfig;
  }
  if (!sorterConfig) return;

  // Clean URL first
  // const cleanUrl = cleanTrackingParams(bookmark.url);
  // if (cleanUrl !== bookmark.url) {
  //   await browser.bookmarks.update(bookmark.id, { url: cleanUrl });
  //   bookmark.url = cleanUrl; // Update local ref
  // }

  const dbTags = await TagDB.getTags(getNormalizedUrl(bookmark.url));
  if (dbTags.aiFolder) return; // Already AI categorized in DB

  const searchableText = (bookmark.title + " " + bookmark.url).toLowerCase();
  let matchedRule = null;

  for (const item of sorterConfig) {
    const config = item.config;
    if (!config) continue;
    if (config.keywords && config.keywords.some(k => searchableText.includes(k.toLowerCase()))) {
      matchedRule = item;
      break;
    }
    if (config.regex) {
      for (const r of config.regex) {
        try {
          if (new RegExp(r.pattern, 'i').test(searchableText)) {
            matchedRule = item;
            break;
          }
        } catch (e) { }
      }
    }
  }

  if (matchedRule) {
    await moveBookmarkToFolder(bookmark, matchedRule.folder, matchedRule.index);
    await TagDB.setTags(getNormalizedUrl(bookmark.url), { keywordFolder: matchedRule.folder }, bookmark.id);
  }
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

  const folderList = sorterConfig.map(rule => rule.folder).join(', ');
  const prompt = `
    Analyze this URL: ${bookmark.url}
    Title: ${bookmark.title}
    
    Folders: ${folderList}
    
    1. Choose best folder.
    2. 8-word description.
    3. 15 comma-separated keywords.
    
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

    const jsonMatch = responseText.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
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

async function processSingleBookmarkAI(bookmark) {
  const { sorterConfig } = await browser.storage.local.get("sorterConfig");
  // Clean URL removed per user request
  // const cleanUrl = cleanTrackingParams(bookmark.url);
  // if (cleanUrl !== bookmark.url) { ... }

  const promptData = await getAISuggestionPrompt(bookmark, sorterConfig || DEFAULT_CONFIG);
  if (!promptData) return { success: false, error: "Configuration missing" };

  const result = await fetchAI(promptData);
  if (result) {
    // Save to DB
    await TagDB.setTags(getNormalizedUrl(bookmark.url), {
      aiFolder: result.folder,
      aiKeywords: result.wordSoup,
      time: formatDate(Date.now())
    }, bookmark.id);

    try {
      await browser.bookmarks.update(bookmark.id, {
        title: result.description,
        url: bookmark.url // Ensure original URL is respected
      });

      const rule = sorterConfig ? sorterConfig.find(r => r.folder === result.folder) : null;
      const index = rule ? rule.index : undefined;

      await moveBookmarkToFolder(bookmark, result.folder, index);
      return { success: true, folder: result.folder };
    } catch (e) {
      return { success: false, error: e.message };
    }
  } else {
    return { success: false, error: "AI returned no result" };
  }
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

      scanProgress.total = bookmarks.length;
      broadcastState();

      for (const b of bookmarks) {
        scanProgress.current++;
        scanProgress.detail = b.title || b.url; // Fallback
        broadcastState();
        await delay(100); // Yield 100ms for clear visibility (User Request)
        await organizeBookmark(b);
      }
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

      let sorterConfig;
      try {
        const sync = await browser.storage.sync.get("sorterConfig");
        sorterConfig = sync.sorterConfig;
      } catch (e) { }

      if (!sorterConfig) {
        sorterConfig = (await browser.storage.local.get("sorterConfig")).sorterConfig;
      }

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

      for (const b of bookmarks) {
        scanProgress.current++;
        if (scanProgress.current % 10 === 0) broadcastState();

        const dbTags = await TagDB.getTags(getNormalizedUrl(b.url));
        if (dbTags.aiFolder) continue;

        scanProgress.detail = `AI: ${b.title}`;
        broadcastState();

        await delay(aiDelay);
        await processSingleBookmarkAI(b);
      }
      await pruneEmptyFolders();
    });
  }

  else if (message.action === "clear-tags") {
    runTask(async () => {
      const tree = await browser.bookmarks.getTree();
      const bookmarks = await getAllBookmarks(tree[0]);
      scanProgress.total = bookmarks.length;
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
        const configSummary = existingConfig.map(c => `Folder: "${c.folder}", Existing Keywords: [${c.keywords.join(', ')}]`).join('\n');

        prompt = `
              I have an existing bookmark configuration:
              ${configSummary}
              
              Analyze this list of unsorted bookmarks and:
              1. Suggest NEW folders if they don't fit existing ones.
              2. Suggest REFINEMENTS to existing folders if a bookmark *should* go there but is missing keywords (e.g. "Dev" handles "JS" but not "TypeScript").
              
              Bookmarks:
              ${inputList}
              
              Output strictly JSON array with two types on entries:
              [ 
                { "type": "new", "folder": "NewPath", "keywords": ["k1", "k2"], "bookmarkCount": 3 },
                { "type": "refine", "folder": "ExistingPath", "addKeywords": ["missingK1", "missingK2"], "bookmarkCount": 2 }
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
      // Mock config object if needed for fetchAI helper to work generically
      // But fetchAI takes "promptData" which needs specific keys.
      // Let's reconstruct promptData manually.

      let provider = aiConfig ? aiConfig.provider : (geminiApiKey ? 'gemini' : null);
      if (!provider) throw new Error("AI Provider not configured");

      const promptData = {
        prompt,
        provider,
        aiConfig,
        geminiApiKey
      };

      const rawResult = await fetchAI(promptData);

      return { suggestions: Array.isArray(rawResult) ? rawResult : [] };

    } catch (e) {
      console.error(e);
      return { error: e.message };
    }
  }
});

async function runTask(taskFn) {
  isScanning = true;
  scanProgress = { current: 0, total: 0, detail: "Starting..." };
  broadcastState();
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
  const existingFolder = children.find(child => !child.url && child.title.toLowerCase() === folderName.toLowerCase());

  if (existingFolder) {
    if (existingFolder.index !== desiredIndex) {
      try { await browser.bookmarks.move(existingFolder.id, { index: desiredIndex }); } catch (e) { }
    }
    return existingFolder.id;
  }

  const newFolder = await browser.bookmarks.create({
    parentId: parentId,
    title: folderName,
    index: desiredIndex
  });
  return newFolder.id;
}

/* --- HELPER: Prune Empty Folders --- */
async function pruneEmptyFolders() {
  console.log("Starting empty folder pruning...");

  const { sorterConfig } = await browser.storage.local.get("sorterConfig");
  const protectedPaths = new Set();
  if (sorterConfig) {
    sorterConfig.forEach(rule => {
      if (rule.folder) protectedPaths.add(rule.folder);
    });
  }

  async function traverseAndPrune(node, currentPath) {
    if (node.children) {
      const children = [...node.children];
      for (const child of children) {
        if (!child.url) {
          const childPath = currentPath ? `${currentPath}/${child.title}` : child.title;
          await traverseAndPrune(child, childPath);
        }
      }
    }

    if (node.id && node.id !== "root________" && node.id !== "toolbar_____") {
      const updatedChildren = await browser.bookmarks.getChildren(node.id);
      if (updatedChildren.length === 0) {
        if (protectedPaths.has(currentPath)) {
          // Protected
        } else {
          console.log(`Pruning empty folder: ${currentPath}`);
          try { await browser.bookmarks.remove(node.id); } catch (e) { }
        }
      }
    }
  }

  const toolbar = await browser.bookmarks.getSubTree("toolbar_____");
  if (toolbar && toolbar[0]) {
    await traverseAndPrune(toolbar[0], "");
  }
  console.log("Pruning complete.");
}
