/**
 * TEST: Synchronization Lock (Semaphore)
 * 
 * Verifies that 'onCreated' events are IGNORED while a bulk task (organize-all)
 * is in progress, preventing concurrency issues.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

global.window = global;

// --- 1. Mocks ---
global.browser = {
    runtime: {
        onInstalled: { addListener: () => { } },
        onMessage: { addListener: (fn) => { global.onMessageListener = fn; } },
        onStartup: { addListener: () => { } },
        sendMessage: async () => { }
    },
    bookmarks: {
        onCreated: { addListener: (fn) => { global.onCreatedListener = fn; } },
        getTree: async () => [{ id: "root", children: [] }],
        getChildren: async () => [],
        search: async () => [], // No duplicates found
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

global.TagDB = { getTags: async () => ({}), setTags: async () => { } };

// --- 2. Load Scripts ---
function loadScript(filename) {
    const src = fs.readFileSync(path.resolve(__dirname, '..', filename), 'utf8');
    vm.runInThisContext(src, { filename: filename });
}

loadScript('db.js');
loadScript('utils.js');
loadScript('folder_manager.js');
loadScript('ai_manager.js');
loadScript('background.js');

// --- 3. Test Logic ---
async function runTest() {
    console.log("=== TEST: Semaphore Lock ===");

    // Spy on organizeBookmark
    let organizeCallCount = 0;
    // We override the global function (if it exists on global)
    // background.js functions are in the same context, so overwriting works?
    // Let's wrap the original or just mock it.
    // Since we want to know if it's CALLED, we can just replace it.
    global.organizeBookmark = async () => {
        console.log("CALLED: organizeBookmark");
        organizeCallCount++;
    };

    // Spy on deduplicateBookmarks to simulate delay
    global.deduplicateBookmarks = async (list) => {
        console.log("Task is running (deduplicating)...");
        await new Promise(r => setTimeout(r, 500)); // Block for 500ms (simulate active task)
        return list;
    };
    global.getAllBookmarks = async () => []; // Return empty to finish fast after dedupe
    global.buildFolderMap = () => new Map();

    // 1. Trigger Bulk Task (Background)
    const taskPromise = global.onMessageListener({ action: "organize-all" });

    // 2. Immediately Trigger onCreated (Simulate user action during scan)
    // Wait a tiny bit to ensure isScanning = true
    await new Promise(r => setTimeout(r, 50));

    console.log("Triggering onCreated event...");
    await global.onCreatedListener("new-id", { url: "http://example.com", title: "Test" });

    // 3. Wait for task to finish
    await taskPromise;
    console.log("Task finished.");

    // 4. Assert
    if (organizeCallCount === 0) {
        console.log("✅ PASS: organizeBookmark was NOT called during scan.");
    } else {
        console.error(`❌ FAIL: organizeBookmark WAS called ${organizeCallCount} times during scan.`);
        process.exit(1);
    }
}

runTest().catch(e => {
    console.error(e);
    process.exit(1);
});
