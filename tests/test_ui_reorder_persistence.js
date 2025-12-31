/**
 * UNIT TEST: UI Reorder Persistence
 * 
 * Verifies that moveNode in options.js correctly updates the rule indices 
 * in the global configTree array.
 */

const fs = require('fs');
const path = require('path');

// --- Mocking ---
global.configTree = [];
global.rootNode = null;
global.setDirty = () => { };
global.document = {
    getElementById: () => ({ innerHTML: '', addEventListener: () => { } }),
    querySelectorAll: () => []
};

function loadScript(filename) {
    let script = fs.readFileSync(path.resolve(__dirname, '..', filename), 'utf8');
    // Strip DOM manipulations and browser.storage calls for pure logic testing
    script = script.replace(/document\.getElementById/g, '(()=>({innerHTML:"",appendChild:()=>{},addEventListener:()=>{}}))');
    // Strip the bottom listeners block
    script = script.replace(/document\.addEventListener\('DOMContentLoaded'[\s\S]*\}\);/g, '');
    script = script.replace(/const /gm, 'var ').replace(/let /gm, 'var ');
    eval.call(global, script);
}

loadScript('options.js');

// Overwrite renderTree to prevent infinite recursion if it calls parseConfigToTree
global.renderTree = () => {
    global.rootNode = parseConfigToTree();
};

async function testArrowReorder() {
    console.log("=== TEST: Arrow Reorder Persistence ===\n");

    // 1. Setup Initial Config
    configTree = [
        { folder: "A", index: 0, config: { keywords: [] } },
        { folder: "B", index: 1, config: { keywords: [] } }
    ];

    // 2. Initial Render (Parses into rootNode)
    renderTree();

    console.log("Initial Tree Order:", rootNode.children.map(c => c.name));

    // 3. Move B Up (from index 1 to 0)
    console.log("Moving B Up...");
    const nodeB = rootNode.children[1];
    moveNode(nodeB, -1);

    // 4. Verify configTree was updated
    console.log("Updated configTree Indices:", configTree.map(r => `${r.folder}:${r.index}`));

    const ruleA = configTree.find(r => r.folder === "A");
    const ruleB = configTree.find(r => r.folder === "B");

    if (ruleB.index === 0 && ruleA.index === 1) {
        console.log("✅ PASS: B is now index 0, A is index 1.");
    } else {
        console.error(`❌ FAIL: Indices incorrect. B:${ruleB.index}, A:${ruleA.index}`);
        process.exit(1);
    }

    // 5. Verify Array Order in configTree (Important for Sync)
    const arrayOrder = configTree.map(r => r.folder);
    console.log("Array Order:", arrayOrder);
    if (arrayOrder[0] === "B" && arrayOrder[1] === "A") {
        console.log("✅ PASS: configTree array order matches visual order.");
    } else {
        console.error("❌ FAIL: Array order did not update.");
        process.exit(1);
    }

    console.log("\n=== PERSISTENCE VERIFIED ===");
}

testArrowReorder().catch(e => {
    console.error(e);
    process.exit(1);
});
