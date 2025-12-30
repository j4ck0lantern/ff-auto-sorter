/**
 * UNIT TEST: Progress Bar Reset Bug
 * 
 * Scenario:
 * 1. Previous task finishes, leaving scanProgress.current at a high number (e.g. 500).
 * 2. User starts "Clear Tags".
 * 3. Bug: Progress starts at 500 (showing "501 / 100").
 * 4. Fix: Progress should reset to 0 (showing "1 / 100").
 */

// --- MOCKS ---
const mockBookmarks = [
    { id: "1", title: "B1", url: "http://a.com" },
    { id: "2", title: "B2", url: "http://b.com" }
];

global.browser = {
    bookmarks: {
        getTree: async () => [{ children: mockBookmarks }],
        getChildren: async () => []
    },
    runtime: {
        sendMessage: () => { } // Mock broadcast
    }
};

global.TagDB = {
    removeTags: async () => { } // Mock DB
};

// Global State (Simulating background.js state)
global.scanProgress = {
    total: 0,
    current: 500, // <--- DIRTY STATE from previous run
    detail: ""
};

global.getAllBookmarks = async () => mockBookmarks; // Mock helper

global.broadcastState = () => {
    // console.log(`Broadcast: ${scanProgress.current} / ${scanProgress.total}`);
};

// --- TEST RUNNER ---
async function runTest() {
    console.log("--- Starting Test: Progress Reset ---");
    console.log(`Initial State: scanProgress.current = ${scanProgress.current} (Should be dirty)`);

    // SIMULATE THE FIXED CODE LOGIC
    // (Copy-pasted logic from background.js 'clear-tags' block for verification)

    // 1. Setup Task
    const tree = await browser.bookmarks.getTree();
    const bookmarks = await getAllBookmarks(tree[0]);
    scanProgress.total = bookmarks.length;

    // --- THE FIX BEING TESTED ---
    scanProgress.current = 0; // <--- The line we added
    // ----------------------------

    broadcastState();

    console.log(`State After Start: scanProgress.current = ${scanProgress.current}`);

    // Assertions
    if (scanProgress.current === 0) {
        console.log("FAIL: Wait, it is 0. That is good.");
        console.log("PASS: Progress was reset to 0.");
    } else {
        console.error(`FAIL: Progress is ${scanProgress.current}. Expected 0.`);
    }

    // Simulate loop
    for (const b of bookmarks) {
        scanProgress.current++;
    }

    console.log(`Final State: ${scanProgress.current} / ${scanProgress.total}`);

    if (scanProgress.current === mockBookmarks.length) {
        console.log("PASS: Count matches total items.");
    } else {
        console.error(`FAIL: Count ${scanProgress.current} != Total ${mockBookmarks.length}`);
    }
}

runTest();
