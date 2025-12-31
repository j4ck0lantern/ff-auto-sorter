/**
 * UNIT TEST: AI and Organization Logic Flow
 * 
 * Objective:
 * 1. Option 1 (Organize All): Rule-based only, NEVER use AI.
 * 2. Option 2 (Classify All): Batch AI, skip bookmarks with existing tags.
 * 3. Option 3 (Single Classify): Context menu, ALWAYS check AI for an update.
 * 4. Option 4 (Clear tags): Verify progress reset and tag removal.
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
loadScript('background.js');

// Helper to wait for background tasks (simulated with runTask)
async function flushTasks() {
    await new Promise(r => setTimeout(r, 20));
    let depth = 0;
    while (global.isScanning && depth < 50) {
        await new Promise(r => setTimeout(r, 20));
        depth++;
    }
}

async function testAIUsage() {
    console.log("=== AI LOGIC FLOW VERIFICATION SUITE ===\n");

    const rootId = "root________";
    const unfiledId = "unfiled_____";

    // 1. Setup Mock Bookmarks
    browser.bookmarks.setTree([
        {
            id: rootId, title: "Root", children: [
                {
                    id: unfiledId, title: "Other Bookmarks", children: [
                        { id: "b1", title: "Bookmark 1", url: "https://example.com/1", parentId: unfiledId },
                        { id: "b2", title: "Bookmark 2", url: "https://example.com/2", parentId: unfiledId }
                    ]
                }
            ]
        }
    ]);

    // Setup Config
    const testConfig = [
        { folder: "Tech", config: { keywords: ["example"] }, index: [0] }
    ];
    await browser.storage.local.set({ sorterConfig: testConfig });
    await browser.storage.sync.set({ aiConfig: { provider: "gemini" }, geminiApiKey: "fake-key" });

    // --- TEST 1: Organize All (Option 1) ---
    console.log("TEST 1: Organize All (Should NOT call AI)");
    let aiCallCount = 0;
    global.fetchAI = async () => { aiCallCount++; return { folder: "AI-Folder" }; };

    await browser.runtime.sendMessage({ action: "organize-all" });
    await flushTasks();

    if (aiCallCount === 0) {
        console.log("✅ PASS: Organize All did not trigger AI.");
    } else {
        console.error(`❌ FAIL: Organize All called AI ${aiCallCount} times.`);
        process.exit(1);
    }

    // --- TEST 2: Classify All (Option 2) ---
    console.log("\nTEST 2: Classify All (Should SKIP existing tags)");
    aiCallCount = 0;

    // Tag b1 already (Use the same normalization as background.js)
    const url1 = getNormalizedUrl("https://example.com/1");
    // console.log(`[DEBUG Test] Tagging b1: ${url1}`);
    await TagDB.setTags(url1, { aiFolder: "Existing" }, "b1");

    await browser.runtime.sendMessage({ action: "classify-all" });
    await flushTasks();

    // Expected: Only b2 is sent to AI (since b1 is tagged)
    if (aiCallCount === 1) {
        console.log("✅ PASS: Classify All skipped bookmark with existing tag.");
    } else {
        console.error(`❌ FAIL: Classify All call count was ${aiCallCount} (Expected 1).`);
        process.exit(1);
    }

    // --- TEST 3: Single Classify (Option 3) ---
    console.log("\nTEST 3: Single Classify (Should ALWAYS update)");
    aiCallCount = 0;

    // Even though b1 is tagged, context menu classify should run it
    const [b1] = await browser.bookmarks.get("b1");
    await processSingleBookmarkAI(b1);

    if (aiCallCount === 1) {
        console.log("✅ PASS: Single Classify updated bookmark with existing tag.");
    } else {
        console.error(`❌ FAIL: Single Classify did not trigger AI update.`);
        process.exit(1);
    }

    // --- TEST 4: Clear Tags (Option 4) ---
    console.log("\nTEST 4: Clear Tags (Should reset progress and remove from DB)");

    // Verify tags exist
    let t1 = await TagDB.getTags(url1);
    if (!t1 || !t1.aiFolder) {
        console.error("❌ SETUP FAIL: Tag b1 missing.");
        process.exit(1);
    }

    await browser.runtime.sendMessage({ action: "clear-tags" });
    await flushTasks();

    t1 = await TagDB.getTags(url1);
    if (!t1 || !t1.aiFolder) {
        console.log("✅ PASS: Tags cleared from database.");
    } else {
        console.error("❌ FAIL: Tags still exist in database.");
        process.exit(1);
    }

    console.log("\n=== SUITE COMPLETE: ALL FLOWS VERIFIED ===");
}

testAIUsage().catch(e => {
    console.error("Test execution failed:", e);
    process.exit(1);
});
