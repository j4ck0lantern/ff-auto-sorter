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

// --- LOGIC UNDER TEST ---
// Note: accurate reflection of options.js logic 
// ...

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
    // 1. Process Metadata for this Node (if not root)
    if (!node.isRoot) {
        // If Rule doesn't exist (Implicit Parent), CREATE IT.
        if (!node.rule) {
            console.log(`[Rebuild] (Test) Auto-creating rule for orphan: ${node.fullPath}`);
            node.rule = {
                folder: node.fullPath,
                index: 0,
                config: {
                    keywords: [],
                    regex: [],
                    comment: "Auto-managed container"
                }
            };
        }

        // Update Index based on current position in parent
        if (node.parent) {
            const myIndex = node.parent.children.indexOf(node);
            node.rule.index = myIndex;
        }

        // Ensure path is consistent
        node.rule.folder = node.fullPath;

        list.push(node.rule);
    }

    // 2. Recurse Children
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

function testOrphanAdoption() {
    console.log("\n--- Test: Orphan (Implicit Parent) Adoption ---");
    // Scenario: User configures "A/B", but "A" is missing from config.
    // The parser creates "A" as a container. Rebuild should turn "A" into a rule.

    const partialConfig = [
        { folder: "Parent/Child", index: 0, config: {} }
    ];

    // 1. Parse creates 'Parent' node (implicit)
    const tree = parseConfigToTree(partialConfig);
    const parentNode = tree.children.find(c => c.name === "Parent");

    if (parentNode && !parentNode.rule) {
        console.log("PASS: Parser created implicit parent node without rule.");
    } else {
        console.error("FAIL: Parser state unexpected.");
    }

    // 2. Rebuild should create rule for 'Parent'
    const rebuilt = rebuildConfigFromTree(tree);
    const parentRule = rebuilt.find(r => r.folder === "Parent");

    if (parentRule) {
        console.log("PASS: Rebuild auto-created rule for 'Parent'.");
    } else {
        console.error("FAIL: Rebuild failed to create rule for orphan parent.");
    }

    // Check index of child
    const childRule = rebuilt.find(r => r.folder === "Parent/Child");
    if (childRule && parentRule) {
        // Parent is root's child, index 0 (if sorted)
        // Child is Parent's child, index 0
        console.log("PASS: Child preserved.");
    }
}

// RUNNER
console.log("=== STARTING OPTIONS LOGIC SUITE ===");
testRoundTrip();
testReorderUpdate();
testMixedOrderImport();
testOrphanAdoption();
console.log("=== SUITE COMPLETE ===");
