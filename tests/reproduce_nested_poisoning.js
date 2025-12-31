/**
 * REPRODUCTION: Top Level Sorting V2 (Scenario)
 * 
 * Scenario: "Work is now in the far left. Personal is 6 to the right."
 * 
 * Config:
 * - Personal: Index 0 (Ignore: true)
 * - Work: Index 6
 * - Work/Projects: (No Explicit Index?)
 * 
 * Expected: Personal (0) -> ... -> Work (6).
 */

const fs = require('fs');
const path = require('path');
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
loadScript('background.js');

async function testUserScenario() {
    console.log("=== TEST: Scenario Sorting ===\n");

    const toolbarId = "toolbar_____";

    // 1. Setup Mock Browser
    browser.bookmarks.setTree([
        {
            id: "root________", title: "Root", children: [
                {
                    id: toolbarId, title: "Bookmarks Toolbar", children: [
                        { id: "f_work", title: "Work", index: 0, parentId: toolbarId },
                        { id: "f_personal", title: "Personal", index: 1, parentId: toolbarId }
                    ]
                }
            ]
        }
    ]);

    // 2. Setup Config
    const testConfig = [
        {
            folder: "Personal",
            index: 0,
            config: { ignore: true }
        },
        {
            folder: "Work",
            index: 6,
            config: { ignore: false }
        },
        // Child rule that might poison the parent?
        {
            folder: "Work/Projects",
            config: { keywords: ["react"] } // No index specified
        }
    ];

    await browser.storage.local.set({ sorterConfig: testConfig });

    // 3. Run Enforcement
    console.log("Running enforceFolderStructure...");
    await enforceFolderStructure();

    // 4. Verify Result
    const children = await browser.bookmarks.getChildren(toolbarId);
    console.log("Final Order:", children.map(c => `${c.title}(${c.index})`).join(', '));

    const homeIdx = children.findIndex(c => c.title === "Personal");
    const sysIdx = children.findIndex(c => c.title === "Work");

    console.log(`Indices: Personal=${homeIdx}, Work=${sysIdx}`);

    if (homeIdx < sysIdx) {
        console.log("✅ PASS: Personal is before Work.");
    } else {
        console.error("❌ FAIL: Work is before Personal (Poisoned?).");
        process.exit(1);
    }
}

testUserScenario().catch(e => {
    console.error(e);
    process.exit(1);
});
