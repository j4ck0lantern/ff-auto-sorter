/* --- HELPER: Consolidate Folders (Global Smart Merge) --- */
async function consolidateFolders() {
    const sorterConfig = await getConfig();
    if (!sorterConfig || sorterConfig.length === 0) return;

    console.log("Consolidating folders (Smart Merge)...");

    // 1. Map Leaf Names to Rules to detect uniqueness
    // Leaf "Web" -> count 2 (Programming/Web, Design/Web) -> Skip
    // Leaf "Miscellaneous" -> count 1 -> Safe to merge all "Miscellaneous" into this one
    const leafCounts = {};
    sorterConfig.forEach(rule => {
        const parts = rule.folder.split('/');
        const leaf = parts[parts.length - 1];
        if (!leafCounts[leaf]) leafCounts[leaf] = [];
        leafCounts[leaf].push(rule);
    });

    // 2. Get All Current Folders in Browser
    const tree = await browser.bookmarks.getTree();
    const allFolders = await getAllFolders(tree[0]);

    // 3. Process Unique Rules
    for (const [leafName, rules] of Object.entries(leafCounts)) {
        if (rules.length !== 1) continue; // Ambiguous, skip

        const rule = rules[0];
        const targetPath = rule.folder;

        // Resolve Canonical ID (Target)
        const toolbarId = "toolbar_____";
        // We assume this already exists or we create it now to be the target
        const targetId = await findOrCreateFolderPath(targetPath, toolbarId);

        // Find strays (Same Name, Different ID)
        const strays = allFolders.filter(f =>
            f.title.toLowerCase() === leafName.toLowerCase() &&
            f.id !== targetId &&
            f.id !== "root________" &&
            f.id !== "menu________" &&
            f.id !== "toolbar_____" &&
            f.id !== "unfiled_____" &&
            f.id !== "mobile________"
        );

        for (const stray of strays) {
            console.log(`Smart Merge: Merging '${stray.title}' (nested in ${stray.parentId}) into '${targetPath}'`);

            // Move all children
            const children = await browser.bookmarks.getChildren(stray.id);
            for (const child of children) {
                await browser.bookmarks.move(child.id, { parentId: targetId });
            }

            // Delete empty stray
            try { await browser.bookmarks.remove(stray.id); } catch (e) { }
        }
    }
}

/* --- HELPER: Enforce Folder Structure (Create & Sort by Config) --- */
async function enforceFolderStructure() {
    const sorterConfig = await getConfig();
    if (!sorterConfig || sorterConfig.length === 0) return;

    console.log("Enforcing folder structure...");

    // 1. Build a Tree from Config to understand hierarchy and desired indices
    // Node: { name: "Name", index: 0, children: { "SubName": Node } }
    const configTree = { name: "ROOT", children: {} };

    sorterConfig.forEach(rule => {
        const parts = rule.folder.split('/').filter(p => p.length > 0);
        let currentNode = configTree;

        parts.forEach((partName, depth) => {
            if (!currentNode.children[partName]) {
                currentNode.children[partName] = {
                    name: partName,
                    // Extract index for this depth from the rule's index array or number
                    // If rule has index: [1, 2], then depth 0 is 1, depth 1 is 2.
                    // If rule has index: 1 (number), assume it applies to the LEAF? Or the root?
                    // Convention: index is likely [rootIdx, childIdx].
                    index: 999, // specific index found later
                    children: {}
                };
            }
            currentNode = currentNode.children[partName];

            // If this is the specific target of the rule (leaf of the rule path), set its explicit index
            if (depth === parts.length - 1) {
                let ruleIdx = 999;
                if (Array.isArray(rule.index)) {
                    ruleIdx = rule.index[depth] ?? 999;
                } else {
                    const rIdx = parseInt(rule.index, 10);
                    if (!isNaN(rIdx)) ruleIdx = rIdx;
                }
                currentNode.index = ruleIdx;
            } else {
                // Intermediate node (e.g. "Work" in "Work/Tools")
                // Only update if it was 999 to avoid overwriting a better index from another rule.
                if (currentNode.index === 999) {
                    if (Array.isArray(rule.index)) {
                        currentNode.index = rule.index[depth] ?? 999;
                    }
                }
            }
        });
    });

    await traverseAndEnforce("toolbar_____", configTree);
}

async function traverseAndEnforce(parentId, treeNode) {
    // Convert children map to sorted array with robust fallbacks
    const siblings = Object.values(treeNode.children).sort((a, b) => {
        const idxA = a.index !== undefined ? a.index : 999;
        const idxB = b.index !== undefined ? b.index : 999;
        if (idxA !== idxB) {
            return idxA - idxB;
        }
        return a.name.localeCompare(b.name);
    });

    if (siblings.length === 0) return;

    console.log(`[Organize] Enforcing order for: ${siblings.map(s => `${s.name}(${s.index})`).join(', ')}`);

    // Apply to Browser
    for (let i = 0; i < siblings.length; i++) {
        const sib = siblings[i];
        // Use configured index if available (and not default 999), otherwise rely on current position (undefined)
        const targetIndex = (sib.index !== undefined && sib.index !== 999) ? sib.index : undefined;

        const folderId = await findOrCreateSingleFolder(sib.name, parentId, targetIndex);
        // Recursion
        await traverseAndEnforce(folderId, sib);
    }
}

/* --- HELPER: Prune Empty Folders --- */
async function pruneEmptyFolders() {
    console.log("Starting empty folder pruning...");

    const sorterConfig = await getConfig();
    // 1. Build Protected Set (Lowercase)
    const protectedPaths = new Set();
    if (sorterConfig) {
        sorterConfig.forEach(rule => {
            // Add Exact Path
            if (rule.folder) protectedPaths.add(rule.folder.trim().toLowerCase());

            // Add Ancestors ("Programming/Web" -> protects "Programming")
            const parts = rule.folder.split('/');
            let acc = "";
            parts.forEach(p => {
                acc = acc ? `${acc}/${p}` : p;
                protectedPaths.add(acc.trim().toLowerCase());
            });
        });
    }

    // Optimize: Get System IDs ONCE
    const systemIds = await getSystemRootIds();

    // Recursive Pruner
    async function traverseAndPrune(node, currentPath) {
        // 1. Process children first (Bottom-Up)
        if (node.children) {
            const children = [...node.children];
            for (const child of children) {
                if (!child.url) { // Folder
                    const childPath = currentPath ? `${currentPath}/${child.title}` : child.title;
                    await traverseAndPrune(child, childPath);
                }
            }
        }

        // 2. Check if current node is empty and not protected
        if (node.id && !systemIds.includes(node.id)) {
            try {
                const updatedChildren = await browser.bookmarks.getChildren(node.id);

                // Filter out SEPARATORS (type: separator)
                const realContent = updatedChildren.filter(c => c.type !== "separator" && c.type !== "mode_separator");

                const fullPathLower = currentPath.toLowerCase();

                if (realContent.length === 0) {
                    const rootPrefixes = [
                        "bookmarks toolbar/",
                        "bookmarks menu/",
                        "other bookmarks/",
                        "mobile bookmarks/"
                    ];

                    let relativePath = fullPathLower;
                    for (const prefix of rootPrefixes) {
                        if (relativePath.startsWith(prefix)) {
                            relativePath = relativePath.substring(prefix.length);
                            break;
                        }
                    }

                    if (protectedPaths.has(fullPathLower) || protectedPaths.has(relativePath)) {
                        // Protected
                    } else {
                        console.log(`Pruning empty (or separator-only) folder: ${currentPath} (ID: ${node.id})`);
                        await browser.bookmarks.removeTree(node.id);
                    }
                }
            } catch (e) {
                console.warn(`Prune failed for '${currentPath}':`, e);
            }
        }
    }

    // Start from the real root
    const tree = await browser.bookmarks.getTree();
    if (tree && tree[0]) {
        await traverseAndPrune(tree[0], "");
    }
    console.log("Pruning complete.");
}

/* --- Helpers (findOrCreateFolderPath) --- */
async function findOrCreateFolderPath(path, baseParentId, ruleIndex) {
    const parts = path.split('/').filter(p => p.length > 0);
    let currentParentId = baseParentId;

    for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        // FIX (Applied previously): Default to undefined (Append)
        let desiredIndex = (ruleIndex !== undefined) ?
            (Array.isArray(ruleIndex) ? (ruleIndex[i] ?? undefined) : (i === 0 ? ruleIndex : undefined))
            : undefined;

        currentParentId = await findOrCreateSingleFolder(part, currentParentId, desiredIndex);
    }
    return currentParentId;
}

async function findOrCreateSingleFolder(folderName, parentId, desiredIndex) {
    const children = await browser.bookmarks.getChildren(parentId);

    // Find case-insensitive match
    const existingFolder = children.find(child => !child.url && child.title.toLowerCase() === folderName.toLowerCase());

    if (existingFolder) {
        // 1. Fix Casing if mismatched (e.g. "web" -> "Web")
        if (existingFolder.title !== folderName) {
            try { await browser.bookmarks.update(existingFolder.id, { title: folderName }); } catch (e) { }
        }

        // 2. Fix Index if mismatched
        if (desiredIndex !== undefined && existingFolder.index !== desiredIndex) {
            console.log(`[Organize] Moving folder "${folderName}" (ID:${existingFolder.id}) from current index ${existingFolder.index} to desired index ${desiredIndex}`);
            try {
                await browser.bookmarks.move(existingFolder.id, { index: desiredIndex });
            } catch (e) {
                console.warn(`[Organize] Failed to move folder "${folderName}":`, e);
            }
        }
        return existingFolder.id;
    }

    // 3. Create New
    const createProps = {
        parentId: parentId,
        title: folderName
    };
    if (desiredIndex !== undefined) createProps.index = desiredIndex;

    try {
        const newFolder = await browser.bookmarks.create(createProps);
        return newFolder.id;
    } catch (e) {
        // Retry without index if it failed (maybe index out of bounds)
        delete createProps.index;
        const fallback = await browser.bookmarks.create(createProps);
        return fallback.id;
    }
}

async function moveBookmarkToFolder(bookmark, folderPath, indexRule) {
    const toolbarId = "toolbar_____";
    const targetFolderId = await findOrCreateFolderPath(folderPath, toolbarId, indexRule);
    if (bookmark.parentId !== targetFolderId) {
        await browser.bookmarks.move(bookmark.id, { parentId: targetFolderId });
    }
}
