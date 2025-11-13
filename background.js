/* --- Default Configuration (NEW ARRAY-BASED STRUCTURE) --- */
const DEFAULT_CONFIG = [
  {
    "folder": "Programming/Web",
    "index": [0, 0],
    "config": {
      "keywords": ["javascript", "react", "css", "html", "node"],
      "regex": [],
      "comment": "Web development projects and articles."
    }
  },
  {
    "folder": "Programming",
    "index": 0,
    "config": {
      "keywords": ["python", "github", "stackoverflow", "dev"],
      "regex": [
        {
          "pattern": "github\\.com\\/[^\\/]+\\/[^\\/]+",
          "comment": "Matches a specific GitHub repository"
        },
        {
          "pattern": "stackoverflow\\.com\\/questions\\/\\d+",
          "comment": "Matches a Stack Overflow question page"
        }
      ],
      "comment": "A catch-all for other programming links."
    }
  },
  {
    "folder": "Cooking",
    "config": {
      "keywords": ["recipe", "kitchen", "ingredient", "baking", "cook", "chef"],
      "regex": [
        {
          "pattern": "\\/recipe\\/",
          "comment": "Matches any URL containing '/recipe/'"
        },
        {
          "pattern": "(allrecipes|bonappetit|foodnetwork)\\.com",
          "comment": "Matches popular cooking websites"
        }
      ],
      "comment": "All about food, baking, and culinary arts."
    }
  },
  {
    "folder": "Gaming",
    "config": {
      "keywords": ["gaming", "ign", "gamespot", "steam", "playstation", "xbox", "nintendo"],
      "regex": [
        {
          "pattern": "store\\.steampowered\\.com\\/app\\/",
          "comment": "Matches Steam store game pages"
        }
      ],
      "comment": "Video games, news, and reviews."
    }
  }
];


/* --- On Install: Set Up Default Config --- */
browser.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === "install") {
    await browser.storage.local.set({ sorterConfig: DEFAULT_CONFIG });
    console.log("Default sorter configuration set.");
  }
});

/* --- Bookmark Created Listener --- */
browser.bookmarks.onCreated.addListener(handleBookmarkCreated);

async function handleBookmarkCreated(id, bookmark) {
  // 1. --- Duplicate Detection ---
  // Search for bookmarks with the exact same URL
  const searchResults = await browser.bookmarks.search({ url: bookmark.url });

  // onCreated fires *after* creation, so 1 result is the new one.
  // If > 1, a duplicate already existed.
  if (searchResults.length > 1) {
    console.log(`Duplicate bookmark found for: ${bookmark.url}. Removing new one.`);
    // Remove the bookmark that was just added
    try {
      await browser.bookmarks.remove(id);
    } catch (e) {
      console.error("Error removing duplicate bookmark:", e);
    }
    return; // Stop processing
  }

  // 2. --- Categorization ---
  console.log(`New bookmark: ${bookmark.title}. Categorizing...`);
  await categorizeBookmark(bookmark);
}

/* --- NEW: Gemini API Integration --- */
async function getGeminiSuggestion(bookmark, sorterConfig) {
  // 1. --- Check Bookmark Title for Existing Data ---
  const title = bookmark.title || "";
  const tagRegex = / \[gemini-folder:(.*?)\] \[gemini-wordsoup:(.*?)\] \[gemini-timestamp:(\d+)\]/;
  const match = title.match(tagRegex);
  const oneYearAgo = Date.now() - (365 * 24 * 60 * 60 * 1000);

  if (match) {
    const [, folder, wordSoup, timestampStr] = match;
    const timestamp = parseInt(timestampStr, 10);

    if (timestamp > oneYearAgo) {
      console.log(`Using fresh Gemini data from bookmark title for: ${bookmark.url}`);
      // The description is the title minus the tags.
      const description = title.replace(tagRegex, "").trim();
      return { folder, description, wordSoup, timestamp };
    } else {
      console.log(`Stale Gemini data found in title for: ${bookmark.url}. Re-fetching.`);
    }
  }

  // 2. --- Proceed with API Call if No Valid Data in Title ---
  const { geminiApiKey } = await browser.storage.local.get('geminiApiKey');
  if (!geminiApiKey) {
    console.log("Gemini API key not found. Skipping AI suggestion.");
    return null;
  }

  const folderList = sorterConfig.map(rule => rule.folder).join(', ');

  const prompt = `
    Analyze the content of the webpage at this URL: ${bookmark.url}

    Here is a list of available bookmark folders:
    ${folderList}

    Based on the content of the page, please perform three tasks:
    1. Choose the single most relevant folder from the list provided.
    2. Write a concise, descriptive new name for the bookmark, exactly 8 words long.
    3. Create a "word soup" of the top 15-20 most relevant keywords and topics from the article.

    Return your answer as a single JSON object with three keys: "folder", "description", and "wordSoup".
    For example:
    {
      "folder": "Programming/Web",
      "description": "A comprehensive guide to modern CSS techniques and layouts",
      "wordSoup": "css, flexbox, grid, layout, frontend, web development, responsive design"
    }
  `;

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${geminiApiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`Gemini API request failed with status ${response.status}:`, errorBody);
      return null;
    }

    const data = await response.json();
    const text = data.candidates[0].content.parts[0].text;

    // Clean the response text to extract the JSON object
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const suggestion = JSON.parse(jsonMatch[0]);

      const timestamp = Date.now();

      // --- 3. Update Bookmark Title with Gemini Data ---
      const geminiTags = ` [gemini-folder:${suggestion.folder}] [gemini-wordsoup:${suggestion.wordSoup}] [gemini-timestamp:${timestamp}]`;
      const newTitle = `${suggestion.description}${geminiTags}`;

      try {
        await browser.bookmarks.update(bookmark.id, { title: newTitle });
        console.log(`Updated bookmark title for: ${bookmark.url}`);
      } catch (e) {
        console.error("Error updating bookmark title:", e);
      }

      // Return the suggestion object, including the new timestamp, for the next step.
      return { ...suggestion, timestamp };
    } else {
      console.error("Could not parse JSON from Gemini response:", text);
      return null;
    }

  } catch (error) {
    console.error("Error calling Gemini API:", error);
    return null;
  }
}

/* --- Bookmark Categorization Logic (HEAVILY UPDATED) --- */
async function categorizeBookmark(bookmark) {
  // Ignore folders
  if (!bookmark.url) {
    return;
  }

  const { sorterConfig } = await browser.storage.local.get("sorterConfig");
  if (!sorterConfig) {
    console.warn("Sorter config not found. Skipping categorization.");
    return;
  }

  // --- NEW: Gemini API Integration ---
  const geminiSuggestion = await getGeminiSuggestion(bookmark, sorterConfig);

  // Use the description from Gemini if available, otherwise the original title.
  // The original title is cleaned of any pre-existing gemini tags.
  const cleanTitle = bookmark.title.replace(/ \[gemini-folder:.*?\] \[gemini-wordsoup:.*?\] \[gemini-timestamp:\d+\]$/, "").trim();
  const searchableText = `${cleanTitle.toLowerCase()} ${bookmark.url.toLowerCase()} ${geminiSuggestion ? geminiSuggestion.wordSoup : ''}`;
  let matchedRule = null;

  // --- CHANGE: Iterate over the array to respect priority order ---
  sorterLoop:
  for (let i = 0; i < sorterConfig.length; i++) {
    const item = sorterConfig[i];
    const config = item.config; // Get the config object
    const folderPath = item.folder; // Get the folder path (e.g., "Programming/Web")

    if (!config || !folderPath) continue; // Skip malformed entries

    // Rule found, store the whole item
    const rule = {
      folderPath,
      index: item.index // Pass the index (could be number, array, or undefined)
    };

    // 1. Check Exact URLs
    if (config.exactUrls && config.exactUrls.includes(bookmark.url)) {
      matchedRule = rule;
      break sorterLoop;
    }

    // 2. Check Exact Titles
    if (config.exactTitles && config.exactTitles.includes(bookmark.title)) {
      matchedRule = rule;
      break sorterLoop;
    }

    // 3. Check Keywords
    if (config.keywords && config.keywords.length > 0) {
      if (config.keywords.some(keyword => searchableText.includes(keyword.toLowerCase()))) {
        matchedRule = rule;
        break sorterLoop; // Found a match, stop searching
      }
    }
    
    // 4. Check Regex
    if (config.regex && config.regex.length > 0) {
      // Loop through the new array of regex objects
      for (const regexObject of config.regex) {
        // Ensure the object has a 'pattern' property and it's a string
        if (regexObject && typeof regexObject.pattern === 'string') {
          try {
            // Create RegExp object from the 'pattern' property
            // 'i' flag makes it case-insensitive
            const re = new RegExp(regexObject.pattern, 'i'); 
            if (re.test(searchableText)) {
              matchedRule = rule;
              break sorterLoop; // Found a match, stop searching
            }
          } catch (e) {
            // Log an error if the user provides an invalid regex, but don't crash
            console.warn(`Invalid regex for folder '${folderPath}': ${regexObject.pattern}`, e.message);
          }
        }
      }
    }
  }

  // --- Start Gemini Integration ---
  if (geminiSuggestion && geminiSuggestion.folder) {
    const matchedFolder = geminiSuggestion.folder;

    console.log(`Gemini suggested folder: ${matchedFolder}`);

    // Find the rule that corresponds to the Gemini-suggested folder
    const geminiMatchedRule = sorterConfig.find(rule => rule.folder === matchedFolder);

    try {
      const baseFolderId = "toolbar_____";
      const sorterFolderId = await findOrCreateFolderPath(
        matchedFolder,
        baseFolderId,
        geminiMatchedRule ? geminiMatchedRule.index : undefined
      );

      // Move the bookmark if it's not already in the correct folder
      if (bookmark.parentId !== sorterFolderId) {
        await browser.bookmarks.move(bookmark.id, { parentId: sorterFolderId });
        console.log(`Moved bookmark to '${matchedFolder}' based on Gemini suggestion.`);
      }
    } catch (e) {
      console.error("Error processing Gemini suggestion:", e);
    }
    return; // Stop further processing, as Gemini suggestion takes precedence
  }
  // --- End Gemini Integration ---


  if (matchedRule) {
    console.log(`Bookmark matches rule for folder: ${matchedRule.folderPath}`);
    try {
      // --- CHANGE: Use the Bookmark Toolbar as the base ---
      const baseFolderId = "toolbar_____";
      
      // --- CHANGE: Find or create the *entire folder path* ---
      const sorterFolderId = await findOrCreateFolderPath(
        matchedRule.folderPath,
        baseFolderId,
        matchedRule.index
      );
      
      // Move the bookmark
      // --- CHANGE: Check if bookmark is already in the correct folder ---
      if (bookmark.parentId !== sorterFolderId) {
        await browser.bookmarks.move(bookmark.id, { parentId: sorterFolderId });
        console.log(`Moved '${bookmark.title}' to '${matchedRule.folderPath}' folder.`);
      } else {
        console.log(`'${bookmark.title}' is already in the correct folder.`);
      }

    } catch (e) {
      console.error("Error moving bookmark:", e);
    }
  } else {
    console.log(`No sorter match for: ${bookmark.title}`);
  }
}

/* --- NEW HELPER: Find or Create a Full Folder Path (e.g., "A/B/C") --- */
async function findOrCreateFolderPath(path, baseParentId, ruleIndex) {
  const parts = path.split('/').filter(p => p.length > 0);
  let currentParentId = baseParentId;

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    let desiredIndex;

    // --- NEW INDEXING LOGIC ---
    const isIndexed = ruleIndex !== undefined;

    if (isIndexed) {
      // If index is an array, use the element corresponding to the folder depth.
      // Otherwise, use the index for the top-level and 0 for subfolders.
      desiredIndex = Array.isArray(ruleIndex) ? (ruleIndex[i] ?? 0) : (i === 0 ? ruleIndex : 0);
    } else {
      // Default for non-indexed folders is to be moved to the top.
      desiredIndex = 0;
    }

    currentParentId = await findOrCreateSingleFolder(part, currentParentId, desiredIndex, isIndexed);
  }
  return currentParentId;
}

/* --- Renamed Helper: Find or Create a Single Folder --- */
async function findOrCreateSingleFolder(folderName, parentId, desiredIndex, isIndexed) {
  const children = await browser.bookmarks.getChildren(parentId);
  const existingFolder = children.find(child =>
    !child.url && child.title.toLowerCase() === folderName.toLowerCase()
  );

  if (existingFolder) {
    // If the folder's position should be managed and it's not in the right place, move it.
    if (existingFolder.index !== desiredIndex) {
       try {
        await browser.bookmarks.move(existingFolder.id, { index: desiredIndex });
      } catch (e) {
        console.warn(`Could not move folder '${folderName}' to index ${desiredIndex}:`, e.message);
      }
    }
    return existingFolder.id;
  }

  // If not, create it at the desired index.
  console.log(`Creating new folder: ${folderName} at index ${desiredIndex}`);
  const newFolder = await browser.bookmarks.create({
    parentId: parentId,
    title: folderName,
    index: desiredIndex
  });
  return newFolder.id;
}


/* --- State Management --- */
let isScanning = false;
let scanProgress = { current: 0, total: 0, detail: "" }; // NEW: track progress & detail

function broadcastScanState() {
  browser.runtime.sendMessage({
    action: "scan-status-update",
    isScanning: isScanning,
    progress: scanProgress // Send progress along with state
  }).catch(e => console.log("Error broadcasting scan state:", e.message));
}

// NEW: Function to specifically broadcast progress updates
function broadcastScanProgress() {
  browser.runtime.sendMessage({
    action: "scan-progress-update",
    progress: scanProgress
  }).catch(e => console.log("Error broadcasting progress:", e.message));
}

/* --- Message Listener for Popup (REWRITTEN) --- */
browser.runtime.onMessage.addListener(async (message) => {
  if (message.action === "get-scan-status") {
    return { isScanning, progress: scanProgress }; // Return progress too
  }

  if (message.action === "scan-existing") {
    if (isScanning) {
      console.warn("Scan request ignored: A scan is already in progress.");
      return { success: false, error: "Scan already in progress" };
    }

    console.log("Scan requested. Starting...");
    try {
      isScanning = true;
      scanProgress = { current: 0, total: 0, detail: "" }; // Reset progress
      broadcastScanState();

      // --- NEW: Re-sort top-level folders based on config order ---
      await resortTopLevelFolders();

      // --- REFACTORED SCAN LOGIC ---
      const tree = await browser.bookmarks.getTree();
      const allBookmarks = await getAllBookmarks(tree[0]);

      // --- Pass 1: Identify unique and duplicate bookmarks ---
      console.log("Pass 1: Identifying duplicates...");
      scanProgress.detail = "Identifying duplicates...";
      broadcastScanProgress();

      const seenUrls = new Map();
      const duplicatesToRemove = [];
      const uniqueBookmarks = [];

      for (const bookmark of allBookmarks) {
        // Only process actual bookmarks with URLs
        if (bookmark.url) {
          if (seenUrls.has(bookmark.url)) {
            duplicatesToRemove.push(bookmark.id);
          } else {
            seenUrls.set(bookmark.url, true); // Keep track of seen URLs
            uniqueBookmarks.push(bookmark);
          }
        }
      }
      console.log(`Found ${duplicatesToRemove.length} duplicates and ${uniqueBookmarks.length} unique bookmarks to process.`);

      // The total for the progress bar is all the work we have to do:
      // removing duplicates + categorizing unique bookmarks.
      scanProgress.total = duplicatesToRemove.length + uniqueBookmarks.length;
      scanProgress.current = 0;
      broadcastScanProgress(); // Send initial total

      // --- Pass 2: Remove duplicates in parallel ---
      if (duplicatesToRemove.length > 0) {
        console.log(`Pass 2: Removing ${duplicatesToRemove.length} duplicates in parallel...`);
        scanProgress.detail = `Removing duplicates...`;
        broadcastScanProgress();

        // Create an array of promises for removing bookmarks
        const removePromises = duplicatesToRemove.map(id =>
          browser.bookmarks.remove(id).then(() => {
            scanProgress.current++;
            // Throttled progress updates
            if (scanProgress.current % 10 === 0 || scanProgress.current === duplicatesToRemove.length) {
              broadcastScanProgress();
            }
          }).catch(e => {
            // Don't let a single failure stop the whole batch
            console.warn(`Could not remove duplicate bookmark ${id}:`, e.message);
          })
        );
        await Promise.all(removePromises);
        console.log("Duplicate removal complete.");
      }

      // --- Pass 3: Process unique bookmarks in concurrent chunks ---
      if (uniqueBookmarks.length > 0) {
        console.log(`Pass 3: Categorizing ${uniqueBookmarks.length} unique bookmarks in chunks...`);
        scanProgress.detail = `Categorizing bookmarks...`;
        broadcastScanProgress();

        const CHUNK_SIZE = 50;
        for (let i = 0; i < uniqueBookmarks.length; i += CHUNK_SIZE) {
          const chunk = uniqueBookmarks.slice(i, i + CHUNK_SIZE);
          console.log(`Processing chunk starting at index ${i}, size ${chunk.length}`);

          const categorizePromises = chunk.map(bookmark =>
            categorizeBookmark(bookmark).then(() => {
              scanProgress.current++;
              scanProgress.detail = bookmark.title || bookmark.url; // Update detail
              // Throttled progress updates
              if (scanProgress.current % 10 === 0 || scanProgress.current === scanProgress.total) {
                broadcastScanProgress();
              }
            }).catch(e => {
              console.error(`Error categorizing bookmark '${bookmark.title}':`, e.message);
            })
          );
          await Promise.all(categorizePromises);
        }
      }
      
      console.log("Scan finished.");
      return { success: true };
    } catch (e) {
      console.error("Error during scan:", e);
      return { success: false, error: e.message };
    } finally {
      isScanning = false;
      broadcastScanState();
      console.log("Scan status reset.");
    }
  }
});

/* --- NEW HELPER: Recursively get all bookmarks in a flat list --- */
async function getAllBookmarks(node) {
  let bookmarks = [];

  // If it's a bookmark (has a URL), add it to the list
  if (node.url) {
    bookmarks.push(node);
  }

  // If it has children, recurse into them
  if (node.children) {
    for (const child of node.children) {
      // Await the results of the recursion and concatenate
      const childBookmarks = await getAllBookmarks(child);
      bookmarks = bookmarks.concat(childBookmarks);
    }
  }
  
  return bookmarks;
}

// --- The old 'scanNode' function is no longer needed and has been removed ---

/* --- NEW: Re-sorts Top-Level Folders on Toolbar (REFACTORED) --- */
async function resortTopLevelFolders() {
  console.log("Re-sorting top-level folders based on 'index' property...");
  try {
    const { sorterConfig } = await browser.storage.local.get("sorterConfig");
    if (!sorterConfig || !Array.isArray(sorterConfig)) {
      console.warn("Cannot re-sort folders: sorterConfig is missing or not an array.");
      return;
    }

    const toolbarChildren = await browser.bookmarks.getChildren("toolbar_____");
    const toolbarFoldersMap = new Map();
    toolbarChildren.forEach(child => {
      if (!child.url) { // It's a folder
        toolbarFoldersMap.set(child.title, child);
      }
    });

    // Create a unique set of folder rules to process.
    const folderRules = new Map();
    sorterConfig.forEach(rule => {
      const topLevelName = rule.folder.split('/')[0];
      // Only process rules that have a defined index for the top-level folder.
      if (rule.index !== undefined && !folderRules.has(topLevelName)) {
        const topLevelIndex = Array.isArray(rule.index) ? rule.index[0] : rule.index;
        if (typeof topLevelIndex === 'number') {
          folderRules.set(topLevelName, {
            name: topLevelName,
            desiredIndex: topLevelIndex
          });
        }
      }
    });

    // Move each folder to its desired index.
    for (const [name, rule] of folderRules) {
      const folderToMove = toolbarFoldersMap.get(name);
      if (folderToMove && folderToMove.index !== rule.desiredIndex) {
        try {
          // Ensure we don't try to move to an out-of-bounds index
          const maxIndex = toolbarChildren.length - 1;
          const targetIndex = Math.min(rule.desiredIndex, maxIndex);

          await browser.bookmarks.move(folderToMove.id, { index: targetIndex });
          console.log(`Moved '${name}' to position ${targetIndex}.`);
        } catch (e) {
          console.error(`Failed to move folder '${name}' to index ${rule.desiredIndex}:`, e);
        }
      }
    }
  } catch (e) {
    console.error("Error during folder re-sorting:", e);
  }
}
