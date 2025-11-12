/* --- Default Configuration (NEW ARRAY-BASED STRUCTURE) --- */
const DEFAULT_CONFIG = [
  {
    "folder": "Programming/Web",
    "config": {
      "keywords": ["javascript", "react", "css", "html", "node"],
      "regex": [],
      "comment": "Web development projects and articles."
    }
  },
  {
    "folder": "Programming",
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
  let matchedFolder = null;

  // --- CHANGE: Iterate over the array to respect priority order ---
  sorterLoop:
  for (const item of sorterConfig) {
    const config = item.config; // Get the config object
    const folderPath = item.folder; // Get the folder path (e.g., "Programming/Web")

    if (!config || !folderPath) continue; // Skip malformed entries

    // 1. Check Keywords
    if (config.keywords && config.keywords.length > 0) {
      if (config.keywords.some(keyword => searchableText.includes(keyword.toLowerCase()))) {
        matchedFolder = folderPath;
        break sorterLoop; // Found a match, stop searching
      }
    }
    
    // 2. Check Regex
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
              matchedFolder = folderPath;
              break sorterLoop; // Found a match, stop searching
            }
          } catch (e) {
            // Log an error if the user provides an invalid regex, but don't crash
            // --- FIX: Replaced undefined 'hobbyName' with 'folderPath' ---
            console.warn(`Invalid regex for folder '${folderPath}': ${regexObject.pattern}`, e.message);
          }
        }
      }
    }
  }

  if (matchedFolder) {
    console.log(`Bookmark matches rule for folder: ${matchedFolder}`);
    try {
      // --- CHANGE: Use the Bookmark Toolbar as the base ---
      const baseFolderId = "toolbar_____";
      
      // --- CHANGE: Find or create the *entire folder path* ---
      const sorterFolderId = await findOrCreateFolderPath(matchedFolder, baseFolderId);
      
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
async function findOrCreateFolderPath(path, baseParentId) {
  // --- FIX: Added .filter(p => p.length > 0) to remove empty parts ---
  // This prevents errors if the path is "Programming/" (with a trailing slash)
  const parts = path.split('/').filter(p => p.length > 0);
  let currentParentId = baseParentId;

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    
    // --- CHANGE: Always set index: 0. ---
    // This ensures both top-level folders AND subfolders
    // are created at the top of their parent.
    const createOptions = { index: 0 };

    currentParentId = await findOrCreateSingleFolder(part, currentParentId, createOptions);
  }
  return currentParentId; // Return the ID of the final folder in the path
}


/* --- Renamed Helper: Find or Create a Single Folder --- */
async function findOrCreateSingleFolder(folderName, parentId, createOptions = {}) {
  // Get all children of the parent
  const children = await browser.bookmarks.getChildren(parentId);
  
  // Check if folder already exists
  const existingFolder = children.find(child => 
    !child.url && child.title.toLowerCase() === folderName.toLowerCase()
  );

  if (existingFolder) {
    // --- CHANGE: If folder exists, move it to the top (index: 0) ---
    // This handles the "re-assessment" part of your request.
    if (existingFolder.index !== 0) {
      try {
        await browser.bookmarks.move(existingFolder.id, { index: 0 });
      } catch (e) {
        // Log a warning but don't stop the whole process
        console.warn(`Could not move folder '${folderName}' to top:`, e.message);
      }
    }
    return existingFolder.id;
  }

  // If not, create it
  console.log(`Creating new folder: ${folderName}`);
  // --- CHANGE: Spread createOptions to include { index: 0 } ---
  const newFolder = await browser.bookmarks.create({
    parentId: parentId,
    title: folderName,
    ...createOptions
  });
  return newFolder.id;
}


/* --- State Management --- */
let isScanning = false;

function broadcastScanState() {
  browser.runtime.sendMessage({
    action: "scan-status-update",
    isScanning: isScanning
  }).catch(e => console.log("Error broadcasting scan state:", e.message));
}

/* --- Message Listener for Popup (REWRITTEN) --- */
browser.runtime.onMessage.addListener(async (message) => {
  if (message.action === "get-scan-status") {
    return { isScanning };
  }

  if (message.action === "scan-existing") {
    if (isScanning) {
      console.warn("Scan request ignored: A scan is already in progress.");
      return { success: false, error: "Scan already in progress" };
    }

    console.log("Scan requested. Starting...");
    try {
      isScanning = true;
      broadcastScanState();
      const tree = await browser.bookmarks.getTree();
      
      // 1. Get a flat list of *all* bookmarks, regardless of folder
      const allBookmarks = await getAllBookmarks(tree[0]);
      console.log(`Found ${allBookmarks.length} total bookmarks to process.`);
      
      // 2. Iterate and categorize every single one
      for (const bookmark of allBookmarks) {
        await categorizeBookmark(bookmark);
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
