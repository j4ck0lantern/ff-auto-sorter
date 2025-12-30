/**
 * UNIT TEST: Performance Caching (Folder Map)
 * 
 * Objective:
 * Verify that 'buildFolderMap' correctly creates a flat Map from a Tree,
 * and that we can use this Map to trace ancestry synchronously (avoiding API calls).
 */

// --- LOGIC UNDER TEST (Copied from background.js) ---

function buildFolderMap(node, map = new Map(), parentId = null) {
    // Augment node with parentId (crucial for reverse traversal)
    if (node.id) {
        if (!node.parentId && parentId) node.parentId = parentId;
        map.set(node.id, node);
    }
    if (node.children) {
        for (const child of node.children) {
            buildFolderMap(child, map, node.id);
        }
    }
    return map;
}

// --- TEST SCENARIOS ---

function testMapBuilding() {
    console.log("\n--- Test: Build Folder Map ---");

    // Mock Tree
    // Root -> Menu -> Programming -> Web
    const mockTree = {
        id: "root________",
        title: "Root",
        children: [
            {
                id: "menu________",
                title: "Bookmarks Menu",
                children: [
                    {
                        id: "prog_id",
                        title: "Programming",
                        children: [
                            {
                                id: "web_id",
                                title: "Web",
                                children: []
                            }
                        ]
                    }
                ]
            }
        ]
    };

    // Build Map
    const map = buildFolderMap(mockTree);

    // Assertions
    if (map.size === 4) {
        console.log("PASS: Map has correct size (4).");
    } else {
        console.error(`FAIL: Map size is ${map.size}, expected 4.`);
    }

    const webNode = map.get("web_id");
    if (webNode && webNode.parentId === "prog_id") {
        console.log("PASS: Web node has correct parentId (prog_id).");
    } else {
        console.error(`FAIL: Web node parent incorrect. Got: ${webNode?.parentId}`);
    }
}

function testSyncAncestryTrace() {
    console.log("\n--- Test: Synchronous Ancestry Trace (The Speed Boost) ---");

    // Setup Map
    const mockTree = {
        id: "root",
        children: [{
            id: "menu", title: "Menu", children: [{
                id: "A", title: "Parent", children: [{
                    id: "B", title: "Child", children: []
                }]
            }]
        }]
    };
    const map = buildFolderMap(mockTree);
    const startNode = map.get("B");

    // Simulate the Logic used in organiseBookmark loops
    let current = startNode;
    let path = [current.title];
    let steps = 0;

    // Tracing up WITHOUT Async API
    while (current.parentId && current.parentId !== "root") {
        const parent = map.get(current.parentId);
        if (!parent) break;
        current = parent;
        path.unshift(current.title);
        steps++;
    }

    // Verify Path
    const pathStr = path.join("/");
    if (pathStr === "Menu/Parent/Child") {
        console.log(`PASS: Traced path synchronously: '${pathStr}'`);
    } else {
        console.error(`FAIL: Path trace wrong. Got: '${pathStr}'`);
    }

    if (steps > 0) {
        console.log("PASS: Traversal happened without errors.");
    }
}

// RUNNER
console.log("=== PERFORMANCE CACHE SUITE ===");
testMapBuilding();
testSyncAncestryTrace();
console.log("=== SUITE COMPLETE ===");
