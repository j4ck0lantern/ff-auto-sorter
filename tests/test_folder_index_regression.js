/**
 * REGRESSION TEST: Folder Index Sorting
 * 
 * Objective: Verify that folders are arranged by their 'index' property, 
 * not array order or alphabetical order.
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

async function testFolderOrdering() {
    console.log("=== TEST: Folder Index Sorting Regression ===\n");

    const toolbarId = "toolbar_____";

    // Initialize Tree with Toolbar
    browser.bookmarks.setTree([
        {
            id: "root________", title: "Root", children: [
                { id: toolbarId, title: "Bookmarks Toolbar", children: [] }
            ]
        }
    ]);

    // 0. Pre-create folders in WRONG order
    console.log("Pre-creating folders in wrong order (Zebra, Apple, Banana)...");
    await browser.bookmarks.create({ parentId: toolbarId, title: "Zebra", id: "z" });
    await browser.bookmarks.create({ parentId: toolbarId, title: "Apple", id: "a" });
    await browser.bookmarks.create({ parentId: toolbarId, title: "Banana", id: "b" });

    // 1. Setup Config with specific indices
    // Order in array is scrambled, indices define the real order.
    const testConfig = [
        { folder: "Zebra", index: 2, config: { keywords: [] } },
        { folder: "Apple", index: 1, config: { keywords: [] } },
        { folder: "Banana", index: 0, config: { keywords: [] } }
    ];

    await browser.storage.local.set({ sorterConfig: testConfig });

    // 2. Run enforcement
    console.log("Running enforceFolderStructure...");
    await enforceFolderStructure();

    // 3. Verify order in browser (mock)
    const children = await browser.bookmarks.getChildren(toolbarId);
    const order = children.map(c => c.title);

    console.log("Resulting order:", order);

    const expected = ["Banana", "Apple", "Zebra"];
    if (JSON.stringify(order) === JSON.stringify(expected)) {
        console.log("✅ PASS: Folders arranged by index [0, 1, 2].");
    } else {
        console.error(`❌ FAIL: Order mismatch. Expected ${expected}, got ${order}`);
        process.exit(1);
    }

    // 4. Test Nested Ordering
    console.log("\nTesting Nested Ordering...");
    const nestedConfig = [
        { folder: "Work", index: 0, config: {} },
        { folder: "Work/B", index: 1, config: {} },
        { folder: "Work/A", index: 0, config: {} }
    ];
    await browser.storage.local.set({ sorterConfig: nestedConfig });
    await enforceFolderStructure();

    // Refresh children
    const newChildren = await browser.bookmarks.getChildren(toolbarId);
    const workFolder = newChildren.find(c => c.title === "Work");
    const subChildren = await browser.bookmarks.getChildren(workFolder.id);
    const subOrder = subChildren.map(c => c.title);

    console.log("Sub-folder order:", subOrder);
    if (subOrder[0] === "A" && subOrder[1] === "B") {
        console.log("✅ PASS: Nested folders arranged by index.");
    } else {
        console.error(`❌ FAIL: Nested order mismatch. Got ${subOrder}`);
        process.exit(1);
    }

    console.log("\n=== FOLDER ORDERING VERIFIED ===");
}

testFolderOrdering().catch(e => {
    console.error(e);
    process.exit(1);
});
