/**
 * REPRODUCTION: Top Level Sorting V2 (User Scenario)
 * 
 * User Report: "Sysadmin is now in the far left. Home is 6 to the right."
 * 
 * Config:
 * - Home: Index 0 (Ignore: true)
 * - SysAdmin: Index 6
 * - SysAdmin/Web Programming: (No Explicit Index?)
 * 
 * Expected: Home (0) -> ... -> SysAdmin (6).
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
loadScript('background.js');

async function testUserScenario() {
    console.log("=== TEST: User Scenario Sorting ===\n");

    const toolbarId = "toolbar_____";

    // 1. Setup Mock Browser
    browser.bookmarks.setTree([
        {
            id: "root________", title: "Root", children: [
                {
                    id: toolbarId, title: "Bookmarks Toolbar", children: [
                        { id: "f_sys", title: "SysAdmin", index: 0, parentId: toolbarId },
                        { id: "f_home", title: "Home", index: 1, parentId: toolbarId }
                    ]
                }
            ]
        }
    ]);

    // 2. Setup Config (User Provided Snippet)
    // Note: User says "Home is 6 to the right", implying Home is NOT at 0 visibly, or SysAdmin is WAY before it.
    // If SysAdmin is far left, it means SysAdmin is 0.
    const testConfig = [
        {
            folder: "Home",
            index: 0,
            config: { ignore: true }
        },
        {
            folder: "SysAdmin",
            index: 6,
            config: { ignore: false }
        },
        // Child rule that might poison the parent?
        {
            folder: "SysAdmin/Web Programming",
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

    const homeIdx = children.findIndex(c => c.title === "Home");
    const sysIdx = children.findIndex(c => c.title === "SysAdmin");

    console.log(`Indices: Home=${homeIdx}, SysAdmin=${sysIdx}`);

    if (homeIdx < sysIdx) {
        console.log("✅ PASS: Home is before SysAdmin.");
    } else {
        console.error("❌ FAIL: SysAdmin is before Home (Poisoned?).");
        process.exit(1);
    }
}

testUserScenario().catch(e => {
    console.error(e);
    process.exit(1);
});
