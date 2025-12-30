/**
 * UNIT TEST: Options Page Data Logic
 * 
 * Focus:
 * 1. Verify 'parseConfigToTree' correctly builds hierarchy from flat paths.
 * 2. Verify 'rebuildConfigFromTree' correctly preserves/updates 'index' property.
 * 3. Ensure Round-Trip consistency (Export -> Import scenario).
 */

// --- MOCKED GLOBAL STATE ---
let configTree = [];

// --- LOGIC UNDER TEST (Copied from options.js to ensure algorithmic correctness) ---

function parseConfigToTree(inputConfig) {
    // Config passed as arg for testing purity
    const root = { name: 'Root', children: [], fullPath: '', isRoot: true };

    const findChild = (node, name) => node.children.find(c => c.name === name);

    inputConfig.forEach(rule => {
        const parts = rule.folder.split('/');
        let current = root;

        parts.forEach((part, partIdx) => {
            let child = findChild(current, part);
            if (!child) {
                child = {
                    name: part,
                    fullPath: parts.slice(0, partIdx + 1).join('/'),
                    children: [],
                    rule: null,
                    parent: current
                };
                current.children.push(child);
            }
            current = child;

            if (partIdx === parts.length - 1) {
                current.rule = rule;
            }
        });
    });

    // Sort children by index
    const sortNodes = (n) => {
        n.children.sort((a, b) => {
            const idxA = a.rule && a.rule.index !== undefined ? a.rule.index : 999;
            const idxB = b.rule && b.rule.index !== undefined ? b.rule.index : 999;
            return idxA - idxB;
        });
        n.children.forEach(sortNodes);
    };
    sortNodes(root);

    return root;
}

function rebuildConfigFromTree(node, list = []) {
    // If this node has a rule, update its index based on its position in parent
    if (node.rule && node.parent) {
        const myIndex = node.parent.children.indexOf(node);
        node.rule.index = myIndex;
    }

    if (node.rule) {
        list.push(node.rule);
    }
    node.children.forEach(child => rebuildConfigFromTree(child, list));
    return list;
}

// --- TEST SCENARIOS ---

function testRoundTrip() {
    console.log("\n--- Test: Round Trip & Index Safety ---");

    // 1. Initial Config (Flat)
    // Note: Order in array shouldn't matter if 'index' is respected? 
    // Actually parseConfigToTree uses 'index' to SORT children.
    const initialConfig = [
        { folder: "A", index: 0, config: {} },
        { folder: "B", index: 1, config: {} },
        { folder: "A/Sub1", index: 0, config: {} },
        { folder: "A/Sub2", index: 1, config: {} }
    ];

    // 2. Parse
    const tree = parseConfigToTree(initialConfig);

    // Assert 1: Structure
    const childNames = tree.children.map(c => c.name);
    if (childNames[0] === "A" && childNames[1] === "B") {
        console.log("PASS: Top level sorted correctly by index (A, B).");
    } else {
        console.error(`FAIL: Top level sort. Got [${childNames}]`);
    }

    const subNames = tree.children[0].children.map(c => c.name);
    if (subNames[0] === "Sub1" && subNames[1] === "Sub2") {
        console.log("PASS: Sub-level sorted correctly by index (Sub1, Sub2).");
    } else {
        console.error(`FAIL: Sub-level sort. Got [${subNames}]`);
    }

    // 3. Rebuild (Persistence)
    // rebuildConfigFromTree modifies the rules inside the tree nodes in-place (updating index), then pushes to list.
    const rebuilt = rebuildConfigFromTree(tree);

    // Check if lengths match
    if (rebuilt.length === initialConfig.length) {
        console.log("PASS: Rebuilt count matches.");
    } else {
        console.error("FAIL: Count mismatch.");
    }
}

function testReorderUpdate() {
    console.log("\n--- Test: Reorder Updates Index ---");

    const initialConfig = [
        { folder: "A", index: 0, config: {} },
        { folder: "B", index: 1, config: {} }
    ];

    const tree = parseConfigToTree(initialConfig);

    // Simulate Drag & Drop: Swap A and B in the tree children array
    // [A, B] -> [B, A]
    const temp = tree.children[0];
    tree.children[0] = tree.children[1];
    tree.children[1] = temp;

    // Rebuild
    const rebuilt = rebuildConfigFromTree(tree);

    // Find 'A' in the new output. Its index should now be 1.
    const newA = rebuilt.find(r => r.folder === "A");
    const newB = rebuilt.find(r => r.folder === "B");

    if (newA.index === 1 && newB.index === 0) {
        console.log("PASS: Indices updated correctly after swap (A:1, B:0).");
    } else {
        console.error(`FAIL: Indices incorrect. A:${newA.index}, B:${newB.index}`);
    }
}

function testMixedOrderImport() {
    console.log("\n--- Test: Import Order Detection ---");
    // Scenario: User imports a file where 'B' is listed before 'A', but indices say A=0, B=1.
    // The Tree Parser should verify 'index' is prioritized over array order.

    const messyConfig = [
        { folder: "B", index: 1, config: {} },
        { folder: "A", index: 0, config: {} }
    ];

    const tree = parseConfigToTree(messyConfig);
    const firstChild = tree.children[0];

    if (firstChild.name === "A") {
        console.log("PASS: Parser respected 'index' property over array order.");
    } else {
        console.error(`FAIL: Parser respected array order. First child is ${firstChild.name}`);
    }
}

// RUNNER
console.log("=== STARTING OPTIONS LOGIC SUITE ===");
testRoundTrip();
testReorderUpdate();
testMixedOrderImport();
console.log("=== SUITE COMPLETE ===");
