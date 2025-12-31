/**
 * REPRODUCTION TEST: Folder Index Sorting with Gaps and Unmanaged Folders
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

async function testSortingReproduction() {
    console.log("=== TEST: Reproduction of User Issue ===\n");

    const toolbarId = "toolbar_____";

    // Initialize Tree with Toolbar
    browser.bookmarks.setTree([
        {
            id: "root________", title: "Root", children: [
                { id: toolbarId, title: "Bookmarks Toolbar", children: [] }
            ]
        }
    ]);

    // 0. Pre-create folders in "Random" order as reported by user
    // User: "latest was House, Security, News & Reading, Home"
    // We assume House is unmanaged.
    console.log("Pre-creating folders in user reported order...");
    await browser.bookmarks.create({ parentId: toolbarId, title: "House", id: "house_id" });
    await browser.bookmarks.create({ parentId: toolbarId, title: "Security", id: "security_id" });
    await browser.bookmarks.create({ parentId: toolbarId, title: "News & Reading", id: "news_id" });
    await browser.bookmarks.create({ parentId: toolbarId, title: "Home", id: "home_id" });

    // 1. Setup Config
    // User: "Home: 0, News & Reading: 1, Security: 2"
    const testConfig = [
        { folder: "Home", index: 0, config: { keywords: [] } },
        { folder: "News & Reading", index: 1, config: { keywords: [] } },
        { folder: "Security", index: 2, config: { keywords: [] } }
    ];

    await browser.storage.local.set({ sorterConfig: testConfig });

    // 2. Run enforcement
    console.log("Running enforceFolderStructure...");
    await enforceFolderStructure();

    // 3. Verify order in browser (mock)
    const children = await browser.bookmarks.getChildren(toolbarId);
    const order = children.map(c => c.title);

    console.log("Resulting order:", order);

    const expected = ["Home", "News & Reading", "Security", "House"];
    // House should be pushed to end if managed folders take 0, 1, 2.
    // If House was at 0, Home moves to 0 (pushing House to 1).
    // News moves to 1 (pushing House to 2).
    // Security moves to 2 (pushing House to 3).

    if (JSON.stringify(order) === JSON.stringify(expected)) {
        console.log("✅ PASS: Order matches expectation.");
    } else {
        console.error(`❌ FAIL: Order mismatch. Expected ${JSON.stringify(expected)}, got ${JSON.stringify(order)}`);
    }
}

testSortingReproduction().catch(e => {
    console.error(e);
    process.exit(1);
});
