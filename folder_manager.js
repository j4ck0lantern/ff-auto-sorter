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
    console.error(`COMPARING ${a.name}(${idxA}) vs ${b.name}(${idxB})`);
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
    // Capture Old State
    let oldFolderName = "Unknown";
    try {
      const [oldParent] = await browser.bookmarks.get(bookmark.parentId);
      oldFolderName = oldParent ? oldParent.title : "Unknown";
    } catch (e) { }

    await browser.bookmarks.move(bookmark.id, { parentId: targetFolderId });

    // LOG MOVE
    if (window.reportManager) {
      window.reportManager.logMove(bookmark, oldFolderName, folderPath, "Rule/AI Match");
    }
  }
}

/* --- LOGIC: Organize (Rules Based) --- */
async function organizeBookmark(bookmark, folderMap = null) {
  const sorterConfig = await getConfig();
  if (!sorterConfig || sorterConfig.length === 0) return;

  // 0. SAFEGUARD: Check if Source Folder is Ignored
  // We must prevent moving bookmarks OUT of ignored folders
  if (bookmark.parentId) {
    try {
      const ignoredPaths = new Set(
        sorterConfig
          .filter(r => r.config && r.config.ignore)
          .map(r => r.folder.trim().toLowerCase())
      );

      if (ignoredPaths.size > 0) {
        // Resolve Parent Path
        let pathParts = [];
        let currentId = bookmark.parentId;
        const systemRoots = await getSystemRootIds();

        // Climb up max 8 levels
        for (let i = 0; i < 8; i++) {
          if (systemRoots.includes(currentId)) break;

          let parentNode;
          if (folderMap && folderMap.has(currentId)) {
            parentNode = folderMap.get(currentId);
          } else {
            const res = await browser.bookmarks.get(currentId);
            parentNode = res[0];
          }

          if (!parentNode) break;
          pathParts.unshift(parentNode.title);
          currentId = parentNode.parentId;
        }

        const fullPath = pathParts.join('/');
        const lowerPath = fullPath.toLowerCase();

        // Check Exact or Ancestor Match
        const isIgnored = Array.from(ignoredPaths).some(ignored =>
          lowerPath === ignored || lowerPath.startsWith(ignored + '/')
        );

        if (isIgnored) {
          // console.log(`[Organize] Skipping ignored source: ${fullPath}`);
          return;
        }
      }
    } catch (e) {
      console.warn('Ignore check failed', e);
    }
  }

  /* 
   * SMART AI TAG CHECK
   */
  const dbTags = await TagDB.getTags(getNormalizedUrl(bookmark.url));
  if (dbTags.aiFolder) {
    // Check if this folder rule still exists
    const isRuleActive = sorterConfig.some(rule => {
      const ruleLower = rule.folder.trim().toLowerCase();
      const tagLower = dbTags.aiFolder.trim().toLowerCase();
      // Relaxed Check: 
      // 1. Exact Match
      if (ruleLower === tagLower) return true;
      // 2. Rule ends with Tag (Taxonomy shift: "Job Hunting" -> "My Life/Job Hunting")
      if (ruleLower.endsWith("/" + tagLower)) return true;
      // 3. Tag ends with Rule (Reverse shift)
      if (tagLower.endsWith("/" + ruleLower)) return true;
      return false;
    });

    if (isRuleActive) {
      // Rule exists -> Trust the AI tag -> Skip processing (Leave it alone)
      return;
    } else {
      console.log(`[Organize] AI Tag '${dbTags.aiFolder}' invalid/inactive. Re-evaluating '${bookmark.title}'.`);
      // Fall through to standard matching (Regex/Keywords/Ancestry)
    }
  }

  // Ignore Folders/Separators
  if (!bookmark.url) return;

  const searchableText = (bookmark.title + " " + bookmark.url).toLowerCase();

  let matchedRule = null;

  for (const item of sorterConfig) {
    const config = item.config;
    if (!config) continue;
    if (config.ignore) continue; // Skip ignored folders (Destination)

    if (config.regex) {
      for (const rx of config.regex) {
        try {
          if (new RegExp(rx.pattern, 'i').test(searchableText)) {
            matchedRule = item;
            break;
          }
        } catch (e) { }
      }
    }
    if (matchedRule) break;

    if (config.keywords) {
      for (const kw of config.keywords) {
        if (searchableText.includes(kw.toLowerCase())) {
          matchedRule = item;
          break;
        }
      }
    }
    if (matchedRule) break;
  }

  if (matchedRule) {
    console.log(`Matched '${bookmark.title}' to '${matchedRule.folder}'`);
    await moveBookmarkToFolder(bookmark, matchedRule.folder, matchedRule.index);
    return; // Done
  }

  // --- DEFAULT FOLDER LOGIC ---
  if (!matchedRule) {
    // Check for Default Folder
    let defaultRule = sorterConfig.find(r => r.config && r.config.default);

    // FALLBACK: If no default is SET, assume "Miscellaneous"
    if (!defaultRule) {
      // console.log(`[DEBUG Org] No Default Rule configured. Using Implicit Default: 'Miscellaneous'.`);
      defaultRule = {
        folder: "Miscellaneous",
        index: [999], // End
        config: { default: true }
      };
    }

    if (defaultRule) {
      // "Parent" is the folder holding the bookmark.
      const parentArr = await browser.bookmarks.get(bookmark.parentId);
      const parent = parentArr[0];
      const sysRoots = await getSystemRootIds();

      // console.log(`[Organize] Checking default for '${bookmark.title}' (Parent: '${parent.title}' | ID: ${parent.id})`);

      if (!sysRoots.includes(parent.id)) {
        // STRICT PATH ENFORCEMENT
        // 1. Build the full path of the current parent (e.g., "Programming/Web/React")
        let pathParts = [parent.title];
        let current = parent;
        let isValidHierarchy = true;

        // Safety depth cap
        for (let i = 0; i < 8; i++) { // Max depth 8 safety
          if (sysRoots.includes(current.parentId)) break; // Reached Root's child (Top Level)

          let ups;
          if (folderMap) {
            ups = folderMap.get(current.parentId); // Sync Lookup (Fast)
            if (ups) ups = [ups]; // Mimic API array format
          } else {
            ups = await browser.bookmarks.get(current.parentId); // Async API (Slow)
          }

          if (!ups || !ups[0]) {
            isValidHierarchy = false; // Orphaned?
            break;
          }
          current = ups[0];
          pathParts.unshift(current.title); // Prepend parent name
        }

        if (isValidHierarchy) {
          const bookmarkParamsPath = pathParts.join('/');
          const fullPathLower = bookmarkParamsPath.toLowerCase();

          // 2. Build Set of Valid Configured Paths (and their ancestors)
          const validPaths = new Set();
          const validRoots = []; // Array for prefix checking

          sorterConfig.forEach(rule => {
            if (rule.folder) {
              const lower = rule.folder.trim().toLowerCase();
              validPaths.add(lower);
              validRoots.push(lower);
            }
            // Ancestors are valid too (e.g., "Programming" is valid if "Programming/Web" exists)
            const parts = rule.folder.split('/');
            let acc = "";
            parts.forEach(p => {
              acc = acc ? `${acc}/${p}` : p;
              const lowerAncest = acc.toLowerCase();
              validPaths.add(lowerAncest);
              validRoots.push(lowerAncest);
            });
          });

          // 3. Strict Check with Subfolder Support
          // Logic: Valid if Exact Match OR if it is a child of a Valid Path
          let isProtected = false;

          if (validPaths.has(fullPathLower)) {
            isProtected = true;
          } else {
            // Prefix Check: "Interests/Carpentry" starts with "interests/" ?
            isProtected = validRoots.some(root => fullPathLower.startsWith(root + '/'));
          }

          if (isProtected) {
            // console.log(`[Organize] Valid: '${bookmarkParamsPath}' (Configured/Child).`);
            return; // Allowed to stay
          } else {
            // console.log(`[Organize] Stray: '${bookmarkParamsPath}' -> Default.`);
            // Fall through to move
          }
        } else {
          // console.log(`[Organize] Hierarchy broken for '${parent.title}'. Moving to Default.`);
        }
      }

      // console.log(`[Organize] applying Default Rule. Moving '${bookmark.title}' to '${defaultRule.folder}'`);
      await moveBookmarkToFolder(bookmark, defaultRule.folder, defaultRule.index);
    } else {
      // console.log(`[Organize] No Default Rule found. Skipping '${bookmark.title}'.`);
    }
  }
}

