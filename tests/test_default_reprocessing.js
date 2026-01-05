/**
 * UNIT TEST: Default Folder Reprocessing
 * 
 * Objective:
 * Verify that bookmarks in the Configured Default Folder are ALWAYS re-processed 
 * by the AI, even if they already have tags (to allow "emptying" the folder).
 * 
 * Scenarios:
 * 1. Bookmark in "Miscellaneous" (Default) -> Should call AI.
 * 2. Bookmark in "Code" (Normal) -> Should SKIP AI if already tagged.
 */

const fs = require('fs');
const path = require('path');

// --- Mocking Extension Environment ---
const mockBrowser = require('./mock_browser');
global.browser = mockBrowser.browser;
global.window = global;

function loadScript(filename) {
    let script = fs.readFileSync(path.resolve(__dirname, '..', filename), 'utf8');
    script = script.replace(/^const /gm, 'var ').replace(/^let /gm, 'var ');
    eval.call(global, script);
}

loadScript('db.js');
loadScript('utils.js');
loadScript('folder_manager.js');
loadScript('ai_manager.js');

// Mock broadcastState (background.js calls this)
global.broadcastState = () => { };
global.scanProgress = { current: 0, total: 0, detail: "", stage: "Ready" };
global.delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
loadScript('background.js');

async function testDefaultReprocessing() {
    console.log("=== DEFAULT REPROCESSING VERIFICATION SUITE ===\n");

    const rootId = "root________";
    const toolbarId = "toolbar_____";
    const miscId = "misc_folder_id";
    const codeId = "code_folder_id";

    // 1. Setup Config
    const mockConfig = [
        { folder: "Miscellaneous", config: { default: true } },
        { folder: "Code", config: { keywords: ["code"] } }
    ];
    await browser.storage.local.set({ sorterConfig: mockConfig });
    await browser.storage.local.set({
        aiConfig: { provider: "gemini", speed: 0 },
        geminiApiKey: "fake-key-for-testing"
    });

    // 2. Setup Tree
    browser.bookmarks.setTree([
        {
            id: rootId, title: "root", children: [
                {
                    id: toolbarId, title: "Bookmarks Toolbar", children: [
                        {
                            id: miscId, title: "Miscellaneous", children: [
                                { id: "bm_misc", title: "Unsorted Item", url: "https://example.com/unsorted", parentId: miscId }
                            ]
                        },
                        {
                            id: codeId, title: "Code", children: [
                                { id: "bm_code", title: "Sorted Code", url: "https://example.com/code", parentId: codeId }
                            ]
                        }
                    ]
                }
            ]
        }
    ]);

    // 3. Seed TagDB (Both appear "Already Processed")
    await TagDB.setTags("https://example.com/unsorted/", { aiFolder: "Miscellaneous" }, "bm_misc");
    await TagDB.setTags("https://example.com/code/", { aiFolder: "Code" }, "bm_code");

    // 4. Mock fetchAI to spy on calls
    const processedUrls = [];
    const originalFetchAI = global.fetchAI;
    global.fetchAI = async (promptData) => {
        console.log("[Test] Mock fetchAI called for prompt length:", promptData.prompt.length);
        // extract URL from prompt logic (it's embedded in prompt string, hard to parse reliably, 
        // but we can check the prompt content)
        // OR we can rely on proper flow execution which calls fetchAI.
        // Let's assume if it's called, it processed a bookmark.
        // The prompt contains "Analyze this URL: <url>"
        const match = promptData.prompt.match(/Analyze this URL: (.*)/);
        if (match) {
            processedUrls.push(match[1].trim());
        } else {
            console.log("[Test] Regex failed to match URL in prompt:", promptData.prompt.substring(0, 100));
        }

        return { folder: "Code", wordSoup: "code, test" }; // dummy return
    };

    // 5. Trigger classify-all
    console.log("> Triggering classify-all...");
    const listeners = browser.runtime.onMessage._listeners || [];
    const classifyHandler = listeners.find(l => l.name === "" || l.toString().includes("classify-all"));

    if (classifyHandler) {
        await classifyHandler({ action: "classify-all" });

        // Wait for async (it uses delays in background.js)
        // We mocked delay? No. background.js has `await delay(aiDelay)`.
        // We set aiConfig speed default? 
        // background.js: `const aiDelay = (aiConfig && aiConfig.speed) ? aiConfig.speed : 1500;`
        // We didn't set speed. It will wait 1.5s per item.
        // We should set speed to 0 for test.
        await browser.storage.local.set({ aiConfig: { provider: "mock", speed: 0 } });

        // Re-run to use new speed? No, config read inside handler.
        // We should have set it before. Rerun?
        // Let's just wait enough time. Or better, update config BEFORE calling handler.
    } else {
        console.error("❌ FAIL: No classify handler found.");
        process.exit(1);
    }

    // 6. Verify Results
    // allow time for processing
    await new Promise(r => setTimeout(r, 100)); // fast mode

    console.log("Processed URLs:", processedUrls);

    const processedMisc = processedUrls.some(u => u.includes("unsorted"));
    const processedCode = processedUrls.some(u => u.includes("code"));

    if (processedMisc) {
        console.log("✅ PASS: Bookmark in Default (Miscellaneous) was processed.");
    } else {
        console.error("❌ FAIL: Bookmark in Default was SKIPPED.");
    }

    if (!processedCode) {
        console.log("✅ PASS: Bookmark in 'Code' (already tagged) was SKIPPED.");
    } else {
        console.error("❌ FAIL: Bookmark in 'Code' was PROCESSED (Should have been skipped).");
    }

    if (processedMisc && !processedCode) {
        console.log("\n=== SUITE PASSED ===");
    } else {
        console.error("\n=== SUITE FAILED ===");
        process.exit(1);
    }
}

testDefaultReprocessing().catch(e => {
    console.error(e);
    process.exit(1);
});
