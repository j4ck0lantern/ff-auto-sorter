/**
 * UNIT TEST: Ignore Safeguards
 * 
 * Objective:
 * Verify that bookmarks in folders marked as "ignore: true" are:
 * 1. NOT moved by `organizeBookmark` (Rule-based or AI tag based).
 * 2. NOT processed by `classify-all` (AI Batch).
 */

const fs = require('fs');
const path = require('path');

// --- Mocking Extension Environment ---
const mockBrowser = require('./mock_browser');
global.browser = mockBrowser.browser;
global.window = global; // Mock window

// Load dependencies with 'const' -> 'var' transformation 
function loadScript(filename) {
    let script = fs.readFileSync(path.resolve(__dirname, '..', filename), 'utf8');
    script = script.replace(/^const /gm, 'var ').replace(/^let /gm, 'var ');
    eval.call(global, script);
}

loadScript('db.js');
loadScript('utils.js');
loadScript('folder_manager.js');
loadScript('ai_manager.js');
loadScript('background.js');

async function testIgnoreSafeguards() {
    console.log("=== IGNORE SAFEGUARDS VERIFICATION SUITE ===\n");

    const rootId = "root________";
    const unfiledId = "unfiled_____";
    const toolbarId = "toolbar_____";

    // 1. Setup Config with Ignored Folder
    const ignoredFolder = "Home";
    const ignoredId = "home_folder_id";

    // Config: Ignore "Home", but have a rule for "Social" that matches "facebook"
    const mockConfig = [
        {
            folder: ignoredFolder,
            index: 0,
            config: { ignore: true, keywords: [] }
        },
        {
            folder: "Social",
            index: 1,
            config: { keywords: ["facebook"] }
        }
    ];

    await browser.storage.local.set({ sorterConfig: mockConfig });

    // 2. Setup Bookmarks Tree
    // Root -> Toolbar -> Home (Ignored) -> Facebook Bookmark
    browser.bookmarks.setTree([
        {
            id: rootId, title: "root", children: [
                {
                    id: toolbarId, title: "Bookmarks Toolbar", children: [
                        {
                            id: ignoredId, title: ignoredFolder, children: [
                                {
                                    id: "bm1",
                                    title: "Facebook - Login",
                                    url: "https://www.facebook.com",
                                    parentId: ignoredId
                                }
                            ]
                        }
                    ]
                }
            ]
        }
    ]);

    // Reset spies - Mocking manually since mock_browser is functional
    const originalMove = browser.bookmarks.move;
    let moveCallCount = 0;
    const moveCalls = [];
    browser.bookmarks.move = async (id, dest) => {
        moveCallCount++;
        moveCalls.push({ id, dest });
        return originalMove(id, dest);
    };

    console.log("> TEST 1: organizeBookmark (Single Item Logic)");
    const [bm] = await browser.bookmarks.get("bm1");

    // Build Folder Map (mocking what background does generally, or let it fetch)
    // organizeBookmark fetches parent linkage dynamically if map not provided.
    await organizeBookmark(bm);

    if (moveCallCount === 0) {
        console.log("✅ PASS: Bookmark in ignored folder was NOT moved.");
    } else {
        console.error("❌ FAIL: Bookmark in ignored folder WAS moved!");
        console.error(moveCalls);
        process.exit(1);
    }

    console.log("\n> TEST 2: classify-all (Batch AI Logic)");

    // Reset manual spy
    moveCallCount = 0;
    moveCalls.length = 0; // clear array

    // We mock fetchAI to fail if called
    const originalFetchAI = global.fetchAI;
    let aiCalled = false;
    global.fetchAI = async () => {
        aiCalled = true;
        return { folder: "Social", wordSoup: "social, network" };
    };

    // Trigger Classify All via message listener
    // We need to find the listener. Background.js adds it.
    // In this eval environment, the listeners are registered to mockBrowser.

    // We'll manually invoke the logic if we can't easily trigger the listener, 
    // BUT we loaded background.js so the listener IS registered.
    // In mock_browser.js, listeners are stored in _listeners
    const listeners = browser.runtime.onMessage._listeners || [];
    const classifyHandler = listeners.find(l => l.name === "" || l.toString().includes("classify-all"));

    if (classifyHandler) {
        // Run it
        await classifyHandler({ action: "classify-all" });

        // Wait for async
        await new Promise(r => setTimeout(r, 100)); // processing

        if (aiCalled) {
            console.error("❌ FAIL: AI was called for bookmark in ignored folder!");
            process.exit(1);
        } else {
            console.log("✅ PASS: AI was NOT called for bookmark in ignored folder.");
        }

    } else {
        console.warn("⚠️ SKIP: Could not find classify-all handler in mocks.");
    }

    // cleanup
    global.fetchAI = originalFetchAI;
    console.log("\n=== SUITE COMPLETE ===");
}

testIgnoreSafeguards().catch(e => {
    console.error(e);
    process.exit(1);
});
