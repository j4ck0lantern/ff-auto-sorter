/* --- Default Configuration (NEW ARRAY-BASED STRUCTURE) --- */
const DEFAULT_CONFIG = [
  {
    "folder": "Programming/Web",
    "static": true,
    "config": {
      "keywords": ["javascript", "react", "css", "html", "node"],
      "regex": [],
      "comment": "Web development projects and articles."
    }
  },
  {
    "folder": "Programming",
    "static": true,
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

  // Combine title and URL for a better keyword match
  const searchableText = `${bookmark.title.toLowerCase()} ${bookmark.url.toLowerCase()}`;
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
      isStatic: item.static === true, // NEW: Check for the static flag
      baseIndex: i // NEW: Store the original index for static positioning
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

  if (matchedRule) {
    console.log(`Bookmark matches rule for folder: ${matchedRule.folderPath}`);
    try {
      // --- CHANGE: Use the Bookmark Toolbar as the base ---
      const baseFolderId = "toolbar_____";
      
      // --- CHANGE: Find or create the *entire folder path* ---
      const sorterFolderId = await findOrCreateFolderPath(
        matchedRule.folderPath,
        baseFolderId,
        matchedRule.isStatic, // Pass isStatic flag
        matchedRule.baseIndex   // Pass the base index
      );
      
      // Move the bookmark
      // --- CHANGE: Check if bookmark is already in the correct folder ---
      if (bookmark.parentId !== sorterFolderId) {
        await browser.bookmarks.move(bookmark.id, { parentId: sorterFolderId });
        console.log(`Moved '${bookmark.title}' to '${matchedFolder}' folder.`);
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
async function findOrCreateFolderPath(path, baseParentId, isStatic, baseIndex) {
  // This prevents errors if the path is "Programming/" (with a trailing slash)
  const parts = path.split('/').filter(p => p.length > 0);
  let currentParentId = baseParentId;

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    let desiredIndex;

    // --- NEW: Static Logic ---
    // Top-level folders (i=0) can be static.
    // Sub-folders (i>0) are always placed at the top of their parent.
    if (i === 0) { // Top-level folder
      desiredIndex = isStatic ? baseIndex : 0;
    } else { // Sub-folder
      desiredIndex = 0;
    }

    const createOptions = { index: desiredIndex };
    
    // Pass the isStatic flag ONLY to the top-level folder
    const passIsStatic = (i === 0) ? isStatic : false;

    currentParentId = await findOrCreateSingleFolder(part, currentParentId, createOptions, passIsStatic);
  }
  return currentParentId; // Return the ID of the final folder in the path
}


/* --- Renamed Helper: Find or Create a Single Folder --- */
async function findOrCreateSingleFolder(folderName, parentId, createOptions = {}, isStatic = false) {
  // Get all children of the parent
  const children = await browser.bookmarks.getChildren(parentId);
  
  // Check if folder already exists
  const existingFolder = children.find(child => 
    !child.url && child.title.toLowerCase() === folderName.toLowerCase()
  );

  if (existingFolder) {
    // --- NEW: If folder is NOT static, move it to the desired index ---
    // This handles the "re-assessment" part of your request.
    if (!isStatic && existingFolder.index !== createOptions.index) {
      try {
        // For non-static folders, always move to the top.
        await browser.bookmarks.move(existingFolder.id, { index: 0 });
      } catch (e) {
        console.warn(`Could not move folder '${folderName}' to top:`, e.message);
      }
    }
    // If it's static, we DON'T move it. Its position is fixed.
    return existingFolder.id;
  }

  // If not, create it
  console.log(`Creating new folder: ${folderName}`);
  const newFolder = await browser.bookmarks.create({
    parentId: parentId,
    title: folderName,
    ...createOptions // This will set the index correctly on creation
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
  console.log("Re-sorting top-level folders...");
  try {
    const { sorterConfig } = await browser.storage.local.get("sorterConfig");
    if (!sorterConfig || !Array.isArray(sorterConfig)) {
      console.warn("Cannot re-sort folders: sorterConfig is missing or not an array.");
      return;
    }

    const toolbarChildren = await browser.bookmarks.getChildren("toolbar_____");
    const toolbarFoldersMap = new Map();
    toolbarChildren.forEach(child => {
      if (!child.url) {
        toolbarFoldersMap.set(child.title, child);
      }
    });

    // --- FIX: Create a unique, ordered list of top-level folders ---
    const uniqueTopLevelFolders = [];
    const seenFolders = new Set();
    sorterConfig.forEach(rule => {
      const topLevelName = rule.folder.split('/')[0];
      if (!seenFolders.has(topLevelName)) {
        seenFolders.add(topLevelName);
        uniqueTopLevelFolders.push(topLevelName);
      }
    });

    // Now iterate through the *unique* list to move folders
    for (let i = 0; i < uniqueTopLevelFolders.length; i++) {
      const folderName = uniqueTopLevelFolders[i];
      const folderToMove = toolbarFoldersMap.get(folderName);

      if (folderToMove && folderToMove.index !== i) {
        try {
          await browser.bookmarks.move(folderToMove.id, { index: i });
          console.log(`Moved '${folderName}' to position ${i}.`);
        } catch (e) {
          // Log error but continue trying to sort other folders
          console.error(`Failed to move folder '${folderName}':`, e);
        }
      }
    }
  } catch (e) {
    console.error("Error during folder re-sorting:", e);
  }
}
