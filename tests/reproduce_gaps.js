/**
 * REPRODUCTION TEST 2: Gaps and Mixed Managed/Unmanaged
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

loadScript('background.js');

async function testSortingGaps() {
    console.log("=== TEST: Sorting with Gaps ===\n");

    const toolbarId = "toolbar_____";

    // Initialize Tree with Toolbar
    browser.bookmarks.setTree([
        {
            id: "root________", title: "Root", children: [
                { id: toolbarId, title: "Bookmarks Toolbar", children: [] }
            ]
        }
    ]);

    // Initial State: [U1, U2, Home, Security]
    // Desired: Home at 0, Security at 2.
    // Result should preserve U1 at 1 (if possible) or push things down.

    console.log("Pre-creating folders: U1, U2, Home, Security");
    await browser.bookmarks.create({ parentId: toolbarId, title: "U1", id: "u1" });
    await browser.bookmarks.create({ parentId: toolbarId, title: "U2", id: "u2" });
    await browser.bookmarks.create({ parentId: toolbarId, title: "Home", id: "home" });
    await browser.bookmarks.create({ parentId: toolbarId, title: "Security", id: "security" });

    // Config: Home: 0, Security: 2
    const testConfig = [
        { folder: "Home", index: 0, config: { keywords: [] } },
        { folder: "Security", index: 2, config: { keywords: [] } }
    ];

    await browser.storage.local.set({ sorterConfig: testConfig });

    console.log("Running enforceFolderStructure...");
    await enforceFolderStructure();

    const children = await browser.bookmarks.getChildren(toolbarId);
    const order = children.map(c => c.title);

    console.log("Resulting order:", order);

    // Current Logic (using loop index i):
    // i=0: Home -> 0. [Home, U1, U2, Security]
    // i=1: Security -> 1. [Home, Security, U1, U2]
    // Because 'Security' is the 2nd sibling, it gets index 1.

    // Desired (User Intent): Security -> 2.
    // [Home, U1, Security, U2]

    const expectedCurrentLogic = ["Home", "Security", "U1", "U2"];
    const expectedDesired = ["Home", "U1", "Security", "U2"];

    if (JSON.stringify(order) === JSON.stringify(expectedCurrentLogic)) {
        console.log("⚠️ BEHAVIOR: Code compacts indices (Security forced to 1). This confirms the 'bug' regarding absolute indexing.");
    } else if (JSON.stringify(order) === JSON.stringify(expectedDesired)) {
        console.log("✅ BEHAVIOR: Code respects absolute indices.");
    } else {
        console.log("❓ BEHAVIOR: Something else happened.");
    }
}

testSortingGaps().catch(e => {
    console.error(e);
    process.exit(1);
});
