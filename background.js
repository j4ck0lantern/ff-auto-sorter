/* --- Default Configuration (NEW ARRAY-BASED STRUCTURE) --- */
const DEFAULT_HOBBIES = [
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
    await browser.storage.local.set({ hobbyConfig: DEFAULT_HOBBIES });
    console.log("Default hobby configuration set.");
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

  const { hobbyConfig } = await browser.storage.local.get("hobbyConfig");
  if (!hobbyConfig) {
    console.warn("Hobby config not found. Skipping categorization.");
    return;
  }

  // Combine title and URL for a better keyword match
  const searchableText = `${bookmark.title.toLowerCase()} ${bookmark.url.toLowerCase()}`;
  let matchedFolder = null;

  // --- CHANGE: Iterate over the array to respect priority order ---
  hobbyLoop:
  for (const item of hobbyConfig) {
    const config = item.config; // Get the config object
    const folderPath = item.folder; // Get the folder path (e.g., "Programming/Web")

    if (!config || !folderPath) continue; // Skip malformed entries

    // 1. Check Keywords
    if (config.keywords && config.keywords.length > 0) {
      if (config.keywords.some(keyword => searchableText.includes(keyword.toLowerCase()))) {
        matchedFolder = folderPath;
        break hobbyLoop; // Found a match, stop searching
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
              break hobbyLoop; // Found a match, stop searching
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
      const hobbyFolderId = await findOrCreateFolderPath(matchedFolder, baseFolderId);
      
      // Move the bookmark
      // --- CHANGE: Check if bookmark is already in the correct folder ---
      if (bookmark.parentId !== hobbyFolderId) {
        await browser.bookmarks.move(bookmark.id, { parentId: hobbyFolderId });
        console.log(`Moved '${bookmark.title}' to '${matchedFolder}' folder.`);
      } else {
        console.log(`'${bookmark.title}' is already in the correct folder.`);
      }

    } catch (e) {
      console.error("Error moving bookmark:", e);
    }
  } else {
    console.log(`No hobby match for: ${bookmark.title}`);
  }
}

/* --- NEW HELPER: Find or Create a Full Folder Path (e.g., "A/B/C") --- */
async function findOrCreateFolderPath(path, baseParentId) {
  const parts = path.split('/');
  let currentParentId = baseParentId;

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    // --- CHANGE: Only apply { index: 0 } to the *first* level folder on the toolbar ---
    const isFirstLevel = (i === 0);
    const createOptions = isFirstLevel ? { index: 0 } : {};

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


/* --- Message Listener for Popup --- */
browser.runtime.onMessage.addListener(async (message) => {
  if (message.action === "scan-existing") {
    console.log("Scan requested. Starting...");
    try {
      const tree = await browser.bookmarks.getTree();
      // Start scanning from the root
      await scanNode(tree[0]);
      console.log("Scan finished.");
      return { success: true };
    } catch (e) {
      console.error("Error during scan:", e);
      return { success: false, error: e.message };
    }
  }
});

// Recursive function to scan all bookmark nodes (UPDATED)
async function scanNode(node) {
  // If it's a bookmark (has a URL), try to categorize it
  if (node.url) {
    // --- CHANGE: Removed logic that skips pre-categorized bookmarks ---
    // This now re-evaluates *every* bookmark when "Organize" is clicked,
    // allowing bookmarks to be "shuffled" if the logic changes.
    await categorizeBookmark(node);
  }

  // If it has children, scan them recursively
  if (node.children) {
    // --- CHANGE: Update logic to find top-level hobby folders ---
    const { hobbyConfig } = await browser.storage.local.get("hobbyConfig");
    if (!hobbyConfig) {
      // No config, just scan everything
      for (const child of node.children) {
        await scanNode(child);
      }
      return;
    }

    // Get all *top-level* folder names from the config
    // e.g., "Programming/Web" -> "Programming"
    // e.g., "Cooking" -> "Cooking"
    const topLevelHobbyFolders = [
      ...new Set(hobbyConfig.map(item => item.folder.split('/')[0].toLowerCase()))
    ];
    
    if (node.parentId === "toolbar_____" && topLevelHobbyFolders.includes(node.title.toLowerCase())) {
      // This is a top-level hobby folder, don't scan its children
      // We already process bookmarks and move them *into* here.
      // Scanning inside would be redundant and could cause issues.
    } else {
      // Not a hobby folder, scan children
      for (const child of node.children) {
        await scanNode(child);
      }
    }
  }
}