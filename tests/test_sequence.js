/**
 * TEST: Sequence Verification (Clean)
 * 
 * Goal: Ensure that folder sorting (enforceFolderStructure) ONLY happens
 * after all bookmark processing (organizeBookmark) is complete.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

global.window = global;

// --- 1. Event Log ---
const events = [];
function logEvent(name) {
    events.push(name);
}

// --- 2. Mocks ---
global.browser = {
    runtime: {
        onInstalled: { addListener: () => { } },
        onMessage: {
            addListener: (fn) => {
                console.log("[Mock] onMessage registered");
                global.onMessageListener = fn;
            }
        },
        onStartup: { addListener: () => { } },
        sendMessage: async (msg) => {
            if (msg.action === "scan-status-update") {
                // console.log(`[Status] ${msg.progress.stage}`);
                if (global.onTaskComplete && (msg.progress.detail === "Done." || msg.progress.stage === "Complete")) {
                    global.onTaskComplete();
                }
            }
        }
    },
    bookmarks: {
        onCreated: { addListener: () => { } },
        getTree: async () => [{ id: "root", children: [] }],
        getChildren: async () => [],
        search: async () => [],
        remove: async () => { },
        move: async () => { },
        update: async () => { }
    },
    storage: {
        local: { get: async () => ({ sorterConfig: [] }), set: async () => { } },
        sync: { get: async () => ({ sorterConfig: [] }), set: async () => { } },
        onChanged: { addListener: () => { } }
    },
    menus: { create: () => { }, onClicked: { addListener: () => { } } },
    notifications: { create: () => { }, clear: () => { } },
    tabs: { query: async () => [] }
};

global.TagDB = { getTags: async () => ({}), setTags: async () => { }, removeTags: async () => { } };

// --- 3. Script Loader ---
function loadScript(filename) {
    const src = fs.readFileSync(path.resolve(__dirname, '..', filename), 'utf8');
    vm.runInThisContext(src, { filename: filename });
}

// --- 4. Execution ---
async function runTest() {
    console.log("=== TEST: Execution Sequence ===");

    // Load Dependencies
    loadScript('db.js');
    loadScript('utils.js');
    loadScript('folder_manager.js');
    loadScript('ai_manager.js');

    // OVERRIDE SPIES NOW (Before background.js loads)
    console.log("Injecting Spies...");

    global.deduplicateBookmarks = async (list) => {
        console.log("[Spy] deduplicate");
        logEvent('deduplicate');
        return list;
    };

    global.getAllBookmarks = async () => {
        return [
            { id: "1", title: "B1", url: "http://a.com" },
            { id: "2", title: "B2", url: "http://b.com" }
        ];
    };

    global.buildFolderMap = () => new Map();

    global.consolidateFolders = async () => logEvent('consolidate');

    global.enforceFolderStructure = async () => {
        console.log("[Spy] enforceFolderStructure");
        logEvent('enforceStructure');
    };

    global.pruneEmptyFolders = async () => logEvent('prune');

    // NOTE: organizeBookmark is defined in background.js, NOT separate.
    // So we can't override it easily here BEFORE loading background.js because it's IN background.js.
    // However, organizeBookmark is likely NOT exported.
    // But `background.js` defines it in the global scope (vm.runInThisContext).
    // So AFTER loading background.js, we can override it!

    loadScript('background.js');

    // Now override organizeBookmark
    const originalOrganize = global.organizeBookmark;
    global.organizeBookmark = async (b, map) => {
        console.log(`[Spy] organize: ${b.title}`);
        await new Promise(r => setTimeout(r, 50)); // Delay to simulate work
        logEvent(`organize:${b.title}`);
    };

    // Verify Listener
    if (!global.onMessageListener) {
        throw new Error("FAIL: onMessageListener was not registered by background.js");
    }

    // Prepare Waiter
    const completionPromise = new Promise(resolve => {
        global.onTaskComplete = resolve;
    });

    // Trigger Action
    console.log("Triggering organize-all...");
    global.onMessageListener({ action: "organize-all" });

    // Wait for completion (via broadcast)
    console.log("Waiting for task completion...");
    await completionPromise;

    // Assertions
    console.log("Events captured:", events);

    const dupIdx = events.indexOf('deduplicate');
    const org1Idx = events.indexOf('organize:B1');
    const enfIdx = events.indexOf('enforceStructure');

    if (dupIdx === -1) throw new Error("FAIL: deduplicateBookmarks not called");
    if (org1Idx === -1) throw new Error("FAIL: organizeBookmark not called");
    if (enfIdx === -1) throw new Error("FAIL: enforceFolderStructure not called");

    if (enfIdx < org1Idx) {
        throw new Error("FAIL: Folder sorting happened BEFORE bookmark organization!");
    }

    console.log("✅ PASS: Sequence verified correctly.");
}

runTest().catch(e => {
    console.error(e);
    process.exit(1);
});
