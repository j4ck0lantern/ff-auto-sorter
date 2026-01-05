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

/* --- HELPER: Get Config (Robust) --- */
/* --- HELPER: Get Config (Robust) --- */
async function getConfig() {
    let sorterConfig = null;
    try {
        const local = await browser.storage.local.get("sorterConfig");
        sorterConfig = local.sorterConfig;
    } catch (e) {
        console.warn("Local storage access failed", e);
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
function formatDate(timestamp) {
    const date = new Date(timestamp);
    const day = String(date.getDate()).padStart(2, '0');
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const month = months[date.getMonth()];
    const year = date.getFullYear();
    return `${day}-${month}-${year}`;
}

/* --- Helper: Recursively Get All Bookmarks --- */
async function getAllBookmarks(node, ignoredIds = new Set()) {
    // If this folder is ignored, skip it AND its children
    if (node.id && ignoredIds.has(node.id)) {
        // console.log(`[Utils] Skipping ignored folder: ${node.title} (ID: ${node.id})`);
        return [];
    }

    let bookmarks = [];
    if (node.url) {
        bookmarks.push(node);
    }
    if (node.children) {
        for (const child of node.children) {
            bookmarks = bookmarks.concat(await getAllBookmarks(child, ignoredIds));
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
const dbMutex = new Mutex(); // Global mutex instance

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

function analyzeStaticConflicts(config) {
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
                const distinctFolders = f1.some(f => !f2.includes(f));
                if (distinctFolders) {
                    result.substrings.push({ short: k1, long: k2, foldersShort: f1, foldersLong: f2 });
                }
            }
        }
    }
    return result;
}
