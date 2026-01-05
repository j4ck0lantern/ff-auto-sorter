/* --- STATE --- */
let configTree = []; // In-memory representation of sorterConfig
let editingNodeId = null; // ID (folder path) of node being edited
let tempConfigClone = null; // For verifying unique paths
let hasUnsavedChanges = false;

document.addEventListener('DOMContentLoaded', async () => {
  // 1. Load Initial Data
  await loadAIConfig();
  await loadMainConfig();

  // --- Theme Logic ---
  const { themePreference } = await browser.storage.local.get("themePreference");
  if (themePreference) {
    document.documentElement.setAttribute('data-theme', themePreference);
  } else {
    // If no preference check system? Or default to auto (no attr)
  }

  const toggleBtn = document.getElementById('themeToggle');
  if (toggleBtn) {
    toggleBtn.addEventListener('click', async () => {
      const current = document.documentElement.getAttribute('data-theme');
      // Simple toggle: If dark -> light. If light -> dark. If null (auto) -> assume system and flip it.
      const isSystemDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
      let newTheme = 'dark';

      if (current === 'dark') newTheme = 'light';
      else if (current === 'light') newTheme = 'dark';
      else {
        // Was auto. Flip system.
        newTheme = isSystemDark ? 'light' : 'dark';
      }

      document.documentElement.setAttribute('data-theme', newTheme);
      await browser.storage.local.set({ themePreference: newTheme });
    });
  }

  // 2. Setup Event Listeners
  setupAIListeners();
  setupMainListeners();
  setupModalListeners();

  // 3. Warn on close if unsaved
  window.addEventListener('beforeunload', (e) => {
    if (hasUnsavedChanges) {
      e.preventDefault();
      e.returnValue = '';
    }
  });
});

/* --- Helper to set dirty state --- */
function setDirty(isDirty) {
  hasUnsavedChanges = isDirty;
  const saveBtn = document.getElementById('saveMainsBtn');
  if (isDirty) {
    saveBtn.textContent = "Save All Changes *";
    saveBtn.style.backgroundColor = "#d9534f"; // Bootstrap danger/warning color
  } else {
    saveBtn.textContent = "Save All Changes";
    saveBtn.style.backgroundColor = ""; // Reset
  }
}


/* --- AI CONFIG SECTION --- */
async function loadAIConfig() {
  // Local Only
  let aiConfig, geminiApiKey;
  try {
    const local = await browser.storage.local.get(['aiConfig', 'geminiApiKey']);
    aiConfig = local.aiConfig;
    geminiApiKey = local.geminiApiKey;
  } catch (e) { console.error("Local load failed", e); }

  const providerSel = document.getElementById('aiProvider');
  const geminiDiv = document.getElementById('geminiConfig');
  const openaiDiv = document.getElementById('openaiConfig');

  // Defaults & Migration
  let provider = 'gemini';
  if (aiConfig && aiConfig.provider) provider = aiConfig.provider;
  else if (geminiApiKey) provider = 'gemini';

  providerSel.value = provider;

  // Populate Inputs
  if (aiConfig) {
    if (aiConfig.provider === 'openai') {
      document.getElementById('openaiBaseUrl').value = aiConfig.baseUrl || '';
      document.getElementById('openaiApiKey').value = aiConfig.apiKey || '';
      document.getElementById('openaiModel').value = aiConfig.model || '';
    } else {
      document.getElementById('geminiApiKey').value = aiConfig.apiKey || geminiApiKey || '';
    }
  } else if (geminiApiKey) {
    document.getElementById('geminiApiKey').value = geminiApiKey;
  }

  // Load Speed
  const speedEl = document.getElementById('aiSpeed');
  if (aiConfig && aiConfig.speed) {
    speedEl.value = aiConfig.speed;
  } else {
    speedEl.value = "1500"; // Default
  }

  // Toggle Visibility
  const updateVis = () => {
    if (providerSel.value === 'gemini') {
      geminiDiv.classList.remove('hidden');
      openaiDiv.classList.add('hidden');
    } else {
      geminiDiv.classList.add('hidden');
      openaiDiv.classList.remove('hidden');
    }
  };
  providerSel.addEventListener('change', updateVis);
  updateVis();
}

function setupAIListeners() {
  document.getElementById('saveAiConfig').addEventListener('click', async () => {
    const provider = document.getElementById('aiProvider').value;
    const speed = document.getElementById('aiSpeed').value;
    const newConfig = { provider, speed: parseInt(speed) };
    const statusEl = document.getElementById('aiStatus');

    if (provider === 'gemini') {
      const key = document.getElementById('geminiApiKey').value.trim();
      if (!key) return showStatus(statusEl, "API Key required", "red");
      newConfig.apiKey = key;
      await browser.storage.local.set({ geminiApiKey: key }); // Legacy sync
    } else {
      newConfig.baseUrl = document.getElementById('openaiBaseUrl').value.trim();
      newConfig.apiKey = document.getElementById('openaiApiKey').value.trim();
      newConfig.model = document.getElementById('openaiModel').value.trim();
      if (!newConfig.baseUrl || !newConfig.model) return showStatus(statusEl, "Base URL and Model required", "red");
    }

    await browser.storage.local.set({ aiConfig: newConfig });
    showStatus(statusEl, "Saved (Local)!", "green");
  });
}

/* --- MAIN CONFIG (TREE) SECTION --- */
/* --- MAIN CONFIG (TREE) SECTION --- */
async function loadMainConfig() {
  // Local Only
  let sorterConfig = null;
  try {
    const result = await browser.storage.local.get('sorterConfig');
    sorterConfig = result.sorterConfig;
  } catch (e) { console.warn("Local load failed (Main)", e); }

  configTree = sorterConfig || [];
  renderTree();
}

let rootNode = null; // Store the parsed tree structure

function parseConfigToTree(sortByIndex = true) {
  // Root container
  const root = { name: 'Root', children: [], fullPath: '', isRoot: true, parent: null };

  const findChild = (node, name) => node.children.find(c => c.name === name);

  configTree.forEach(rule => {
    const parts = rule.folder.split('/').filter(p => p.length > 0);
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

      // If this is the last part, assign the rule
      if (partIdx === parts.length - 1) {
        current.rule = rule;
      }
    });
  });

  // Sort children by index (if available) to ensure UI matches backend
  if (sortByIndex) {
    const sortNodes = (n) => {
      n.children.sort((a, b) => {
        const idxA = a.rule && a.rule.index !== undefined ? a.rule.index : 999;
        const idxB = b.rule && b.rule.index !== undefined ? b.rule.index : 999;
        if (idxA !== idxB) return idxA - idxB;
        return a.name.localeCompare(b.name);
      });
      n.children.forEach(sortNodes);
    };
    sortNodes(root);
  }

  return root;
}

function rebuildConfigFromTree(node, list = []) {
  // 1. Process Metadata for this Node (if not root)
  if (!node.isRoot) {
    // If Rule doesn't exist (Implicit Parent), CREATE IT.
    if (!node.rule) {
      console.log(`[Rebuild] Auto-creating rule for orphan: ${node.fullPath}`);
      node.rule = {
        folder: node.fullPath,
        index: 0, // Will be updated below
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

    // Ensure path is consistent (in case of renames/moves that didn't update rule yet)
    node.rule.folder = node.fullPath;

    list.push(node.rule);
  }

  // 2. Recurse Children
  node.children.forEach(child => rebuildConfigFromTree(child, list));
  return list;
}

// Ensure all folders in tree have a rule and correct index
// This should be called AFTER the tree structure is modified (drag-drop or arrows)
function syncConfigIndices(customTree) {
  const tree = customTree || rootNode;
  if (!tree) return;
  // Rebuild flat config, which updates indices and creates missing rules
  configTree = rebuildConfigFromTree(tree);
  console.log("[Sync] Updated rule indices:", configTree.map(r => `${r.folder}@${r.index}`).join(', '));
}

function renderTree() {
  const container = document.getElementById('tree-container');
  container.innerHTML = '';

  if (configTree.length === 0) {
    container.innerHTML = '<div style="padding:20px; text-align:center; color:#888;">No rules configured. Add a folder to start.</div>';
    return;
  }

  rootNode = parseConfigToTree();

  // Use the children of root
  rootNode.children.forEach((child, index) => {
    renderNode(child, container, index, rootNode.children.length);
  });
}

function renderNode(node, containerEl, index, totalSiblings) {
  const div = document.createElement('div');
  div.className = 'tree-node';

  // Drag Attributes
  div.draggable = true;
  div.addEventListener('dragstart', (e) => handleDragStart(e, node));
  div.addEventListener('dragover', (e) => handleDragOver(e, node));
  div.addEventListener('dragleave', (e) => handleDragLeave(e, node));
  div.addEventListener('drop', (e) => handleDrop(e, node));

  // Content Row
  const content = document.createElement('div');
  content.className = 'node-content';

  const icon = document.createElement('span');
  icon.className = 'folder-icon';
  icon.textContent = '📁';

  const title = document.createElement('span');
  title.className = 'node-title';
  title.textContent = node.name;

  // Metadata badges
  const badges = document.createElement('span');
  badges.style.fontSize = '0.8rem';
  badges.style.color = '#888';
  badges.style.marginRight = '10px';

  if (node.rule) {
    const kCount = node.rule.config.keywords ? node.rule.config.keywords.length : 0;
    const rCount = node.rule.config.regex ? node.rule.config.regex.length : 0;
    if (kCount + rCount > 0) badges.textContent = `${kCount} keys, ${rCount} regex`;
    else badges.textContent = '(Empty)';

    if (node.rule.config.ignore) {
      badges.textContent += " [IGNORED]";
      badges.style.color = "#d9534f";
    }
    if (node.rule.config.default) {
      badges.textContent += " ★ [DEFAULT]";
      badges.style.color = "#ffc107"; // Gold
      badges.style.fontWeight = "bold";
    }
  } else {
    badges.textContent = '(Container)';
  }

  const actions = document.createElement('div');
  actions.className = 'node-actions';

  // Move Up
  const upBtn = document.createElement('button');
  upBtn.className = 'btn-icon';
  upBtn.textContent = '⬆️';
  upBtn.title = 'Move Up';
  if (index === 0) upBtn.disabled = true;
  else upBtn.onclick = (e) => { e.stopPropagation(); moveNode(node, -1); };

  // Move Down
  const downBtn = document.createElement('button');
  downBtn.className = 'btn-icon';
  downBtn.textContent = '⬇️';
  downBtn.title = 'Move Down';
  if (index === totalSiblings - 1) downBtn.disabled = true;
  else downBtn.onclick = (e) => { e.stopPropagation(); moveNode(node, 1); };

  const addSubBtn = document.createElement('button');
  addSubBtn.className = 'btn-icon';
  addSubBtn.textContent = '➕';
  addSubBtn.title = 'Add Subfolder';
  addSubBtn.onclick = (e) => { e.stopPropagation(); openEditModal(null, null, node.fullPath + '/'); };

  const editBtn = document.createElement('button');
  editBtn.className = 'btn-icon';
  editBtn.textContent = '✏️';
  editBtn.title = 'Edit';
  editBtn.onclick = (e) => { e.stopPropagation(); openEditModal(node.rule, node.fullPath); };

  const delBtn = document.createElement('button');
  delBtn.className = 'btn-icon danger';
  delBtn.textContent = '🗑️';
  delBtn.title = 'Delete';
  delBtn.onclick = (e) => { e.stopPropagation(); deleteNode(node.rule, node.fullPath); };

  actions.appendChild(upBtn);
  actions.appendChild(downBtn);
  actions.appendChild(addSubBtn);
  actions.appendChild(editBtn);
  actions.appendChild(delBtn);

  content.appendChild(icon);
  content.appendChild(title);
  content.appendChild(badges);
  content.appendChild(actions);
  div.appendChild(content);

  // Children
  const childrenContainer = document.createElement('div');
  node.children.forEach((child, i) => {
    renderNode(child, childrenContainer, i, node.children.length);
  });

  if (node.children.length > 0) div.appendChild(childrenContainer);

  containerEl.appendChild(div);
}

function moveNode(node, direction) {
  if (!node.parent) return;

  const siblings = node.parent.children;
  const idx = siblings.indexOf(node);

  const targetIdx = idx + direction;
  if (targetIdx >= 0 && targetIdx < siblings.length) {
    // 1. Swap in parent's children array (modifies global rootNode indirectly)
    [siblings[idx], siblings[targetIdx]] = [siblings[targetIdx], siblings[idx]];

    // 2. Synchronize indices in configTree based on this new tree structure
    syncConfigIndices(rootNode);

    setDirty(true);
    // 3. Render (which re-parses from updated configTree)
    renderTree();
  }
}

function setupMainListeners() {
  document.getElementById('addRootBtn').addEventListener('click', () => {
    openEditModal(null, "");
  });

  document.getElementById('saveMainsBtn').addEventListener('click', async () => {
    // 1. Force a Rebuild from the current Tree state
    // This ensures any "Implicit" folders (e.g. parents created by parsing subfolders)
    // are converted into actual rules with indices.
    syncConfigIndices(rootNode);

    try {
      await browser.storage.local.set({ sorterConfig: configTree });
      setDirty(false);
      showStatus(document.getElementById('mainStatus'), "Configuration Saved (Local)!", "green");
    } catch (e) {
      console.warn("Save failed", e);
      showStatus(document.getElementById('mainStatus'), "Save Failed: " + e.message, "red");
    }
  });

  // Import/Export
  document.getElementById('exportBtn').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(configTree, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'auto-sorter-config.json';
    a.click();
  });

  document.getElementById('importBtn').addEventListener('click', () => {
    document.getElementById('importFile').click();
  });

  document.getElementById('importFile').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const imported = JSON.parse(ev.target.result);
        if (Array.isArray(imported)) {
          configTree = imported;
          configTree = imported;
          try {
            await browser.storage.local.set({ sorterConfig: configTree });
          } catch (e) {
            console.warn("Import save failed", e);
          }
          setDirty(false); // Saved immediately
          renderTree();
          showStatus(document.getElementById('mainStatus'), "Imported successfully (Local)!", "green");
        } else {
          alert("Invalid JSON format: Must be an array.");
        }
      } catch (err) {
        alert("Error parsing JSON");
      }
    };
    reader.readAsText(file);
    e.target.value = ''; // Reset
  });

  /* SMART SUGGEST */
  document.getElementById('smartSuggestBtn').addEventListener('click', startSmartSuggest);

  /* DATABASE MANAGEMENT */
  setupDatabaseListeners();
}

function setupDatabaseListeners() {
  const statusEl = document.getElementById('dbStatus');
  const modeSel = document.getElementById('storageMode');

  // Load Mode
  browser.storage.local.get('storageMode').then(({ storageMode }) => {
    modeSel.value = storageMode || 'local';
  });

  // Info Modal Logic
  const infoBtn = document.getElementById('storageInfoBtn');
  const infoModal = document.getElementById('storageInfoModal');
  const closeInfoBtn = document.getElementById('closeStorageInfoBtn');

  if (infoBtn && infoModal) {
    infoBtn.addEventListener('click', () => {
      infoModal.classList.add('active');
    });
    closeInfoBtn.addEventListener('click', () => {
      infoModal.classList.remove('active');
    });
    // Close on click outside
    infoModal.addEventListener('click', (e) => {
      if (e.target === infoModal) infoModal.classList.remove('active');
    });
  }

  // Save Mode
  modeSel.addEventListener('change', async () => {
    const mode = modeSel.value;
    await browser.storage.local.set({ storageMode: mode }); // sync to local too

    // Update global DB instance if possible via messsage or reload? 
    // Background page might need reload. 
    // Let's notify background? Or reload ext? 
    // Safest is to just set it. The DB abstraction reads init() on calls. 

    showStatus(statusEl, "Storage mode updated!", "green");
  });

  // Migrate Button
  document.getElementById('migrateBtn').addEventListener('click', async () => {
    const mode = modeSel.value;
    if (!confirm(`Are you sure you want to migrate all tags TO ${mode.toUpperCase()} mode ?\n\nThis will modify your bookmarks.`)) return;

    try {
      // Trigger scan UI in sidebar if possible? Accessing popup logic is hard.
      // We can just use the status text here.
      statusEl.textContent = "Starting migration... check browser notifications when done.";
      statusEl.style.color = "blue";

      await browser.runtime.sendMessage({
        action: 'migrate-storage',
        targetMode: mode
      });
    } catch (e) { console.error(e); }
  });

  // Backup
  document.getElementById('backupDbBtn').addEventListener('click', async () => {
    const msg = "Note: 'Backup/Restore' only affects the Local Database file.\nIf using URL Hash mode, your bookmarks are the backup (export them via browser).\n\nProceed with Backup?";
    if (!confirm(msg)) return;

    const { bookmarkTags } = await browser.storage.local.get('bookmarkTags');
    const blob = new Blob([JSON.stringify(bookmarkTags || {}, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'auto-sorter-tags-backup.json';
    a.click();
    showStatus(statusEl, "Database exported!", "green");
  });

  // Restore
  document.getElementById('restoreDbBtn').addEventListener('click', () => {
    const msg = "Note: 'Backup/Restore' only affects the Local Database file.\nIf using URL Hash mode, your bookmarks are the backup (export them via browser).\n\nProceed with Restore?";
    if (confirm(msg)) {
      document.getElementById('restoreDbFile').click();
    }
  });

  document.getElementById('restoreDbFile').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!confirm("WARNING: This will OVERWRITE your current tag database. Continue?")) return;

    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const imported = JSON.parse(ev.target.result);
        if (typeof imported === 'object' && imported !== null) {
          await browser.storage.local.set({ bookmarkTags: imported });
          showStatus(statusEl, "Database restored successfully!", "green");
        } else {
          alert("Invalid JSON format.");
        }
      } catch (err) {
        alert("Error parsing JSON");
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  });
}

/* --- DRAG AND DROP LOGIC --- */
let draggedNode = null;

function handleDragStart(e, node) {
  draggedNode = node;
  e.target.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
  // Prevent dragging root if we had one, but our root logic is internal
}

function handleDragOver(e, targetNode) {
  e.preventDefault(); // Necessary to allow dropping
  e.stopPropagation();

  if (!draggedNode || draggedNode === targetNode) return;

  // Prevent dropping parent into child
  if (targetNode.fullPath.startsWith(draggedNode.fullPath + '/')) return;

  const contentDiv = e.currentTarget.querySelector('.node-content');
  const rect = contentDiv.getBoundingClientRect();
  const offsetY = e.clientY - rect.top;
  const height = rect.height;

  // Cleanup classes
  contentDiv.classList.remove('drag-over-top', 'drag-over-bottom', 'drag-over-inside');

  // Zones: Top 25% (Above), Bottom 25% (Below), Middle (Inside)
  if (offsetY < height * 0.25) {
    contentDiv.classList.add('drag-over-top');
  } else if (offsetY > height * 0.75) {
    contentDiv.classList.add('drag-over-bottom');
  } else {
    contentDiv.classList.add('drag-over-inside');
  }
}

function handleDragLeave(e, node) {
  const contentDiv = e.currentTarget.querySelector('.node-content');
  contentDiv.classList.remove('drag-over-top', 'drag-over-bottom', 'drag-over-inside');
}

function handleDrop(e, targetNode) {
  e.preventDefault();
  e.stopPropagation();

  const contentDiv = e.currentTarget.querySelector('.node-content');
  const isTop = contentDiv.classList.contains('drag-over-top');
  const isBottom = contentDiv.classList.contains('drag-over-bottom');
  const isInside = contentDiv.classList.contains('drag-over-inside');

  contentDiv.classList.remove('drag-over-top', 'drag-over-bottom', 'drag-over-inside');
  document.querySelector('.dragging')?.classList.remove('dragging');

  if (!draggedNode || draggedNode === targetNode) return;
  if (targetNode.fullPath.startsWith(draggedNode.fullPath + '/')) {
    alert("Cannot move a folder into its own subfolder.");
    return;
  }

  // Capture state
  const draggedRule = draggedNode.rule;
  const draggedRules = getRulesForSubtree(draggedNode); // All rules in this block
  // Remove them from current position
  configTree = configTree.filter(r => !draggedRules.includes(r));

  if (isInside) {
    // RE-PARENT: Change paths
    const newParentPath = targetNode.fullPath;
    // Rename draggedNode and all its children
    draggedRules.forEach(rule => {
      // Replace old prefix with new prefix
      // Old prefix: draggedNode.fullPath
      // New prefix: newParentPath + '/' + draggedNode.name
      const relativePath = rule.folder.substring(draggedNode.fullPath.length); // e.g. "" or "/Child"
      rule.folder = newParentPath + "/" + draggedNode.name + relativePath;
    });

    // Append to end of config (or we could try to put it after parent?)
    // Simple approach: Push to end. User can reorder if needed.
    configTree.push(...draggedRules);

  } else {
    // RE-ORDER
    // We need to find where the target rule is in the array.

    // 1. Determine New Parent Path
    // If dropping Top/Bottom of a node, we become a sibling of that node.
    // So our new parent is targetNode.parent.
    const newParentPath = targetNode.parent ? targetNode.parent.fullPath : "";
    const oldParentPath = draggedNode.parent ? draggedNode.parent.fullPath : "";

    // 2. Rename if Parent Changed
    if (newParentPath !== oldParentPath) {
      // console.log(`Re-parenting from ${oldParentPath} to ${newParentPath}`);
      draggedRules.forEach(rule => {
        // Logic: newPrefix + suffix
        // Current Path: draggedNode.fullPath (e.g. A/B/C)
        // Suffix: /C (or just C if it was A/B/C) -> relative to Old Parent A/B

        // Wait, draggedRules includes children (A/B/C/D).
        // We need to replace limits.

        // Path relative to the dragged node's folder name?
        // draggedNode.fullPath = A/B/C.
        // rule.folder = A/B/C/D.
        // Suffix = /D. 

        // New base: newParentPath + '/' + draggedNode.name (e.g. X/C).
        const prefix = newParentPath ? (newParentPath + '/') : "";

        // If the rule IS the dragged node itself
        if (rule.folder === draggedNode.fullPath) {
          rule.folder = prefix + draggedNode.name;
        } else if (rule.folder.startsWith(draggedNode.fullPath + '/')) {
          // It's a child
          const suffix = rule.folder.substring(draggedNode.fullPath.length);
          rule.folder = prefix + draggedNode.name + suffix;
        }
      });
    }

    // 3. Find Insertion Point
    // Let's get "Target Block" roughly.
    let targetIndex = -1;
    if (targetNode.rule) {
      targetIndex = configTree.indexOf(targetNode.rule);
    } else {
      // Find first rule that starts with target path
      targetIndex = configTree.findIndex(r => r.folder.startsWith(targetNode.fullPath + '/'));
    }

    if (targetIndex === -1) targetIndex = configTree.length; // End

    if (isBottom) targetIndex++;

    // Insert draggedRules at targetIndex
    configTree.splice(targetIndex, 0, ...draggedRules);
  }

  // After drop, we must rebuild the tree WITHOUT sorting to capture new order, then sync indices
  const unsortedTree = parseConfigToTree(false);
  syncConfigIndices(unsortedTree);

  setDirty(true);
  renderTree();
}



function getRulesForSubtree(node) {
  let rules = [];
  if (node.rule) rules.push(node.rule);
  node.children.forEach(c => rules.push(...getRulesForSubtree(c)));
  return rules;
}

/* --- MODAL LOGIC (EDIT/ADD) --- */
let currentTags = [];
let originalFullPath = null;

function openEditModal(rule, fullPath, initialFolderValue) {
  const modal = document.getElementById('folderModal');
  const title = document.getElementById('modalTitle');

  originalFullPath = fullPath || null;
  currentTags = [];

  const folderInput = document.getElementById('editFolderInput');
  const regexInput = document.getElementById('regexInput');
  const indexInput = document.getElementById('indexInput');
  const ignoreChk = document.getElementById('ignoreFolderChk');
  const defaultChk = document.getElementById('defaultFolderChk');

  if (rule) {
    title.textContent = "Edit Folder";
    folderInput.value = rule.folder;
    currentTags = rule.config.keywords ? [...rule.config.keywords] : [];
    ignoreChk.checked = !!rule.config.ignore;
    defaultChk.checked = !!rule.config.default;
    const regexStr = rule.config.regex ? rule.config.regex.map(r => r.pattern).join('\n') : "";
    regexInput.value = regexStr;

    // Handle index (can be array or number)
    if (Array.isArray(rule.index)) indexInput.value = rule.index[rule.index.length - 1]; // Simplify for UI
    else indexInput.value = rule.index !== undefined ? rule.index : "";

  } else {
    title.textContent = "Add New Folder";
    folderInput.value = initialFolderValue || "";
    regexInput.value = "";
    indexInput.value = "";
    ignoreChk.checked = false;
    defaultChk.checked = false;
  }

  renderTags();
  modal.classList.add('active');
}

function setupModalListeners() {
  // Keywords Input
  const keyInput = document.getElementById('keywordInput');
  keyInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const val = keyInput.value.trim();
      if (val && !currentTags.includes(val)) {
        currentTags.push(val);
        renderTags();
      }
      keyInput.value = '';
    }
  });

  // Close Btns
  document.getElementById('cancelFolderBtn').addEventListener('click', closeModals);
  document.getElementById('cancelSuggestBtn').addEventListener('click', closeModals);

  // Save Folder
  document.getElementById('saveFolderBtn').addEventListener('click', () => {
    const folderPath = document.getElementById('editFolderInput').value.trim();
    if (!folderPath) return alert("Folder path is required");

    const regexLines = document.getElementById('regexInput').value.trim().split('\n').filter(l => l.trim().length > 0);
    const regexObjs = regexLines.map(pattern => ({ pattern, comment: "Created via GUI" }));

    const idxVal = document.getElementById('indexInput').value.trim();
    const index = idxVal !== "" ? parseInt(idxVal) : undefined;
    const isIgnored = document.getElementById('ignoreFolderChk').checked;
    const isDefault = document.getElementById('defaultFolderChk').checked;

    // Enforce Singleton Default
    if (isDefault) {
      configTree.forEach(r => {
        if (r.config) r.config.default = false;
      });
    }

    // Validation: Check for Duplicate Leaf Names (Case-Insensitive)
    // We want to avoid "Misc" and "Home/Misc" existing simultaneously
    const newLeaf = folderPath.split('/').pop().trim().toLowerCase();
    const duplicate = configTree.find(r => {
      // Skip if it's the rule we are currently editing (same FULL path)
      if (originalFullPath && r.folder === originalFullPath) return false;

      const rLeaf = r.folder.split('/').pop().trim().toLowerCase();
      return rLeaf === newLeaf;
    });

    if (duplicate) {
      alert(`Duplicate Folder Name Detected!\n\nFolder "${newLeaf}" is already used by:\n"${duplicate.folder}"\n\nPlease use unique names for all folders to ensure reliable sorting.`);
      return;
    }

    const newRule = {
      folder: folderPath,
      index: index,
      config: {
        keywords: currentTags,
        regex: regexObjs,
        comment: "Managed via GUI",
        ignore: isIgnored,
        default: isDefault
      }
    };

    // If editing existing, remove old one first (or update in place, but paths might change)
    // If editing existing, remove old one first (or update in place, but paths might change)
    if (originalFullPath) {
      if (originalFullPath !== folderPath) {
        // RECURSIVE RENAME
        // 1. Find all rules that start with old path + '/'
        configTree.forEach(r => {
          if (r.folder.startsWith(originalFullPath + '/')) {
            // Replace prefix
            r.folder = folderPath + r.folder.substring(originalFullPath.length);
          }
        });

        // Safety: Ensure we didn't just rename 'A' to 'A/B' in a way that creates circularity or weirdness?
        // Seems ok.
      }

      const existingIdx = configTree.findIndex(r => r.folder === originalFullPath);
      if (existingIdx > -1) configTree.splice(existingIdx, 1);
    } else {
      // Validation for New Folder: 
      // Ensure it doesn't conflict with existing container in a way that breaks tree?
      // e.g. if I have 'A/B', and I add rule 'A'. perfectly valid.
    }

    // Add new
    configTree.push(newRule);

    // Sync from fresh tree to ensure visual order matches indices
    const freshTree = parseConfigToTree(false); // Build tree in current array order
    syncConfigIndices(freshTree);

    setDirty(true);
    renderTree();
    closeModals();
  });

  // Apply suggestions
  document.getElementById('applySuggestBtn').addEventListener('click', applySuggestions);

  // Copy/Paste Keywords
  document.getElementById('copyKeywordsBtn').addEventListener('click', () => {
    const text = currentTags.join(', ');
    navigator.clipboard.writeText(text).then(() => {
      alert("Keywords copied to clipboard!");
    });
  });

  document.getElementById('pasteKeywordsBtn').addEventListener('click', async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (!text) return;
      const parts = text.split(/[,;\n]+/).map(s => s.trim()).filter(s => s.length > 0);
      parts.forEach(p => {
        if (!currentTags.includes(p)) currentTags.push(p);
      });
      renderTags();
    } catch (e) {
      alert("Failed to read clipboard: " + e);
    }
  });
}

function renderTags() {
  const container = document.getElementById('keywordsContainer');
  // Clear tags but keep input
  const input = document.getElementById('keywordInput');
  container.textContent = ''; // Clear container safely

  currentTags.forEach((tag, idx) => {
    const span = document.createElement('span');
    span.className = 'tag';

    // Tag Text
    span.appendChild(document.createTextNode(tag + ' '));

    // Close Button
    const closeBtn = document.createElement('span');
    closeBtn.className = 'tag-close';
    closeBtn.textContent = '×';
    closeBtn.onclick = () => {
      currentTags.splice(idx, 1);
      renderTags();
    };

    span.appendChild(closeBtn);
    container.appendChild(span);
  });
  container.appendChild(input);
}

function deleteNode(rule, fullPath) {
  if (!confirm(`Delete ${fullPath} and all settings ? `)) return;

  // If it's a specific rule, delete it.
  // If it's a container node (no rule, just implies folder structure), 
  // we might need to delete all children starting with this path?
  // The visual tree implies hierarchy. 
  // Let's filter out anything that STARTS with fullPath + "/"

  configTree = configTree.filter(r => r.folder !== fullPath && !r.folder.startsWith(fullPath + "/"));
  setDirty(true);
  renderTree();
}

function closeModals() {
  document.querySelectorAll('.modal').forEach(m => m.classList.remove('active'));
}

function showStatus(el, msg, color) {
  el.textContent = msg;
  el.style.color = color;
  setTimeout(() => el.textContent = '', 3000);
}

/* --- SMART SUGGEST LOGIC --- */
let suggestionData = [];

async function startSmartSuggest() {
  const modal = document.getElementById('suggestModal');
  const loading = document.getElementById('suggest-loading');
  const results = document.getElementById('suggest-results');

  modal.classList.add('active');
  loading.classList.remove('hidden');
  results.classList.add('hidden');
  results.innerHTML = '';

  try {
    // Call background to process
    // Note: background.js needs to handle 'analyze-for-suggestions'

    // Extract current config context (Folder + Keywords)
    // FILTER: Exclude IGNORED folders from suggestion context
    const currentConfigContext = configTree
      .filter(r => !r.config || !r.config.ignore)
      .map(r => ({
        folder: r.folder,
        keywords: r.config.keywords || []
      }));

    const response = await browser.runtime.sendMessage({
      action: 'analyze-for-suggestions',
      existingConfig: currentConfigContext
    });

    if (response && response.suggestions) {
      suggestionData = response.suggestions;
      renderSuggestions(suggestionData);
      loading.classList.add('hidden');
      results.classList.remove('hidden');
    } else {
      throw new Error(response.error || "No suggestions returned");
    }
  } catch (e) {
    loading.textContent = `Error: ${e.message} `;
    loading.style.color = "red";
  }
}

function renderSuggestions(suggestions) {
  const container = document.getElementById('suggest-results');
  container.innerHTML = '';

  if (suggestions.length === 0) {
    container.textContent = 'No patterns found.';
    return;
  }

  suggestions.forEach((item, idx) => {
    const div = document.createElement('div');
    div.className = 'suggestion-item';

    let badge = document.createElement('span');
    badge.style.padding = '2px 6px';
    badge.style.borderRadius = '4px';
    badge.style.fontSize = '0.7em';
    badge.style.marginRight = '5px';

    const contentDiv = document.createElement('div');
    const folderRow = document.createElement('div');
    folderRow.style.fontWeight = 'bold';

    // Badge & Color Logic
    if (item.type === 'refine') {
      div.style.borderLeft = "4px solid #2196F3";
      badge.style.background = '#e3f2fd';
      badge.style.color = '#1976d2';
      badge.textContent = 'UPDATE';

      folderRow.appendChild(badge);
      folderRow.appendChild(document.createTextNode(item.folder));

      const keywordsDiv = document.createElement('div');
      keywordsDiv.className = 'suggestion-keywords';
      const kws = item.addKeywords || item.keywords || [];
      keywordsDiv.textContent = `Add Keywords: ${kws.join(', ')} `;

      contentDiv.appendChild(folderRow);
      contentDiv.appendChild(keywordsDiv);

    } else {
      div.style.borderLeft = "4px solid #4CAF50";
      badge.style.background = '#e8f5e9';
      badge.style.color = '#2e7d32';
      badge.textContent = 'NEW';

      folderRow.appendChild(badge);
      folderRow.appendChild(document.createTextNode(item.folder));

      const keywordsDiv = document.createElement('div');
      keywordsDiv.className = 'suggestion-keywords';
      keywordsDiv.textContent = `Keywords: ${item.keywords.join(', ')} `;

      contentDiv.appendChild(folderRow);
      contentDiv.appendChild(keywordsDiv);
    }

    const subText = document.createElement('div');
    subText.style.fontSize = '0.75rem';
    subText.style.color = '#888';
    subText.style.marginTop = '2px';
    subText.textContent = `Based on ${item.bookmarkCount || '?'} bookmarks`;
    contentDiv.appendChild(subText);

    // Checkbox
    const chk = document.createElement('input');
    chk.type = 'checkbox';
    chk.className = 'suggestion-chk';
    chk.id = `sug - ${idx} `;
    chk.checked = true;

    const detailsDiv = document.createElement('div');
    detailsDiv.className = 'suggestion-details';
    detailsDiv.appendChild(contentDiv);

    div.appendChild(chk);
    div.appendChild(detailsDiv);
    container.appendChild(div);
  });
}

function applySuggestions() {
  const checkboxes = document.querySelectorAll('.suggestion-chk:checked');
  let addedCount = 0;
  let updatedCount = 0;

  checkboxes.forEach(chk => {
    const idx = parseInt(chk.id.split('-')[1]);
    const item = suggestionData[idx];

    if (item.type === 'refine') {
      // Find existing rule
      const rule = configTree.find(r => r.folder === item.folder);
      if (rule) {
        if (!rule.config.keywords) rule.config.keywords = [];
        // Merge unique
        item.addKeywords.forEach(kw => {
          if (!rule.config.keywords.includes(kw)) {
            rule.config.keywords.push(kw);
          }
        });
        updatedCount++;
      }
    } else {
      // Check if exists (duplicate safety)
      const exists = configTree.some(r => r.folder === item.folder);
      if (!exists) {
        configTree.push({
          folder: item.folder,
          config: {
            keywords: item.keywords,
            regex: [],
            comment: `Auto - suggested based on ${item.bookmarkCount} bookmarks`
          }
        });
        addedCount++;
      }
    }
  });

  renderTree();
  closeModals();
  setDirty(true);

  let msg = [];
  if (addedCount > 0) msg.push(`Added ${addedCount} folders`);
  if (updatedCount > 0) msg.push(`Updated ${updatedCount} folders`);

  showStatus(document.getElementById('mainStatus'), msg.length ? `${msg.join(' & ')} !` : "No changes applied", 'green');
}

/* --- CONFLICT ANALYSIS LOGIC --- */

// --- STATIC ---
async function startStaticAnalysis() {
  const modal = document.getElementById('conflictModal');
  const loading = document.getElementById('conflict-loading');
  const results = document.getElementById('conflict-results');

  modal.classList.add('active');
  loading.classList.remove('hidden');

  loading.textContent = '';
  const icon = document.createElement('div');
  icon.style.fontSize = '2rem';
  icon.textContent = '⚠️';
  const p = document.createElement('p');
  p.textContent = 'Checking duplicates & substrings...';
  loading.appendChild(icon);
  loading.appendChild(p);

  results.classList.add('hidden');
  results.textContent = ''; // clear using textContent since empty

  try {
    const response = await browser.runtime.sendMessage({
      action: 'analyze-static-conflicts',
      config: configTree
    });

    loading.classList.add('hidden');
    results.classList.remove('hidden');
    renderStaticResults(response);

  } catch (e) {
    loading.textContent = `Error: ${e.message} `;
    loading.style.color = 'red';
  }
}

function renderStaticResults(data) {
  const container = document.getElementById('conflict-results');
  container.textContent = ''; // clear safely

  if ((!data.duplicates || data.duplicates.length === 0) &&
    (!data.substrings || data.substrings.length === 0)) {
    const msg = document.createElement('div');
    msg.style.textAlign = 'center';
    msg.style.padding = '20px';
    msg.style.color = 'green';
    msg.textContent = '✅ No static conflicts found!';
    container.appendChild(msg);
    return;
  }

  // 1. Duplicates
  if (data.duplicates && data.duplicates.length > 0) {
    const section = document.createElement('div');
    const h4 = document.createElement('h4');
    h4.textContent = '⚠️ Exact Duplicate Keywords';
    section.appendChild(h4);

    data.duplicates.forEach(d => {
      const div = document.createElement('div');
      div.className = 'suggestion-item';
      div.style.borderLeft = '4px solid #f44336';

      const details = document.createElement('div');
      details.className = 'suggestion-details';

      const strong = document.createElement('strong');
      strong.textContent = `"${d.keyword}"`;
      details.appendChild(strong);
      details.appendChild(document.createTextNode(' in multiple folders:'));

      const actionContainer = document.createElement('div');
      actionContainer.style.marginTop = '5px';
      actionContainer.style.display = 'flex';
      actionContainer.style.gap = '5px';
      actionContainer.style.flexWrap = 'wrap';

      d.folders.forEach(f => {
        const btn = document.createElement('button');
        btn.className = 'secondary small-btn';
        btn.textContent = `Remove from "${f}"`;
        btn.onclick = () => window.applyRemoveKeyword(f, d.keyword);
        actionContainer.appendChild(btn);
      });

      details.appendChild(actionContainer);
      div.appendChild(details);
      section.appendChild(div);
    });
    container.appendChild(section);
  }

  // 2. Substrings
  if (data.substrings && data.substrings.length > 0) {
    const section = document.createElement('div');
    const h4 = document.createElement('h4');
    h4.textContent = '⚠️ Substring Conflicts';
    section.appendChild(h4);

    data.substrings.forEach(d => {
      const div = document.createElement('div');
      div.className = 'suggestion-item';
      div.style.borderLeft = '4px solid #ff9800';

      const details = document.createElement('div');
      details.className = 'suggestion-details';

      const strongShort = document.createElement('strong');
      strongShort.textContent = `"${d.short}"`;
      const strongLong = document.createElement('strong');
      strongLong.textContent = `"${d.long}"`;

      details.appendChild(strongShort);
      details.appendChild(document.createTextNode(' vs '));
      details.appendChild(strongLong);

      const subDiv = document.createElement('div');
      subDiv.style.fontSize = '0.9em';
      subDiv.style.marginTop = '5px';

      const em1 = document.createElement('em');
      em1.textContent = d.foldersShort.join(', ');
      const em2 = document.createElement('em');
      em2.textContent = d.foldersLong.join(', ');

      subDiv.appendChild(em1);
      subDiv.appendChild(document.createTextNode(' vs '));
      subDiv.appendChild(em2);
      details.appendChild(subDiv);

      const btnDiv = document.createElement('div');
      btnDiv.style.marginTop = '5px';

      const btn = document.createElement('button');
      btn.className = 'secondary small-btn';
      btn.textContent = `Delete "${d.short}" from all folders`;
      btn.onclick = () => window.applyRemoveKeyword(null, d.short, true);

      btnDiv.appendChild(btn);
      details.appendChild(btnDiv);
      div.appendChild(details);
      section.appendChild(div);
    });
    container.appendChild(section);
  }
}

// --- SEMANTIC ---
async function startSemanticAnalysis() {
  const modal = document.getElementById('conflictModal');
  const loading = document.getElementById('conflict-loading');
  const results = document.getElementById('conflict-results');

  modal.classList.add('active');
  loading.classList.remove('hidden');

  loading.textContent = '';
  const icon = document.createElement('div');
  icon.style.fontSize = '2rem';
  icon.textContent = '🤖';
  const p = document.createElement('p');
  p.textContent = 'Asking AI for structural advice...';
  loading.appendChild(icon);
  loading.appendChild(p);

  results.classList.add('hidden');
  results.textContent = '';

  try {
    const response = await browser.runtime.sendMessage({
      action: 'analyze-semantic-conflicts',
      config: configTree
    });

    loading.classList.add('hidden');
    results.classList.remove('hidden');
    renderSemanticResults(response);

  } catch (e) {
    loading.textContent = `Error: ${e.message} `;
    loading.style.color = "red";
  }
}

function renderSemanticResults(data) {
  const container = document.getElementById('conflict-results');
  container.textContent = ''; // safe clear

  if (!data.aiAnalysis || data.aiAnalysis.length === 0) {
    const msg = document.createElement('div');
    msg.style.textAlign = 'center';
    msg.style.padding = '20px';
    msg.style.color = 'green';
    msg.textContent = '✅ AI found no obvious semantic issues.';
    container.appendChild(msg);
    return;
  }

  const section = document.createElement('div');
  const h4 = document.createElement('h4');
  h4.textContent = '🤖 Semantic Analysis';
  section.appendChild(h4);

  data.aiAnalysis.forEach((d, idx) => {
    const div = document.createElement('div');
    div.className = 'suggestion-item';
    div.style.borderLeft = '4px solid #9c27b0';

    const details = document.createElement('div');
    details.className = 'suggestion-details';

    const strong = document.createElement('strong');
    strong.textContent = d.issue;
    details.appendChild(strong);

    const subDiv = document.createElement('div');
    subDiv.style.marginTop = '5px';
    subDiv.style.fontSize = '0.9em';

    // Severity
    const sevSpan = document.createElement('span');
    sevSpan.style.fontWeight = 'bold';
    if (d.severity === 'High') sevSpan.style.color = 'red';
    sevSpan.textContent = `Severity: ${d.severity || 'Info'} `;

    subDiv.appendChild(sevSpan);
    subDiv.appendChild(document.createElement('br'));
    subDiv.appendChild(document.createTextNode(`Folders: ${d.affectedFolders ? d.affectedFolders.join(', ') : 'N/A'} `));
    details.appendChild(subDiv);

    if (d.action) {
      const btnDiv = document.createElement('div');
      btnDiv.style.marginTop = '8px';

      const btn = document.createElement('button');
      btn.className = 'success small-btn';
      btn.textContent = `Fix: ${d.action.type} `;
      btn.onclick = () => window.applyAIAction(btn, d.action);

      btnDiv.appendChild(btn);
      details.appendChild(btnDiv);
    }

    div.appendChild(details);
    section.appendChild(div);
  });
  container.appendChild(section);
}

// --- ACTIONS ---
window.applyRemoveKeyword = function (folderPath, keyword, allFolders = false) {
  if (!confirm(`Remove keyword "${keyword}" ? `)) return;

  let changes = 0;
  const targetFolders = allFolders ? configTree.map(r => r.folder) : [folderPath];

  configTree.forEach(node => {
    if (targetFolders.includes(node.folder) && node.config.keywords) {
      const idx = node.config.keywords.indexOf(keyword);
      if (idx !== -1) {
        node.config.keywords.splice(idx, 1);
        changes++;
      }
    }
  });

  if (changes > 0) {
    setDirty(true);
    // Refresh analysis? Or just remove UI element?
    // Simple: Close modal and refresh tree
    document.getElementById('conflictModal').classList.remove('active');
    renderTree();
    showStatus(document.getElementById('mainStatus'), `Removed "${keyword}" from ${changes} folders`, 'green');
  }
};

window.applyAIAction = function (btn, action) {
  if (!confirm(`Apply fix: ${action.type}?`)) return;

  // Implement Merge / Delete / Rename
  if (action.type === 'delete_keyword') {
    window.applyRemoveKeyword(action.folder, action.keyword);
  } else if (action.type === 'merge') {
    // Source -> Target
    // 1. Move keywords/regex from Source to Target
    // 2. Delete Source
    const sourceNode = configTree.find(r => r.folder === action.source);
    const targetNode = configTree.find(r => r.folder === action.target);

    if (sourceNode && targetNode) {
      if (sourceNode.config.keywords) {
        targetNode.config.keywords = [...new Set([...(targetNode.config.keywords || []), ...sourceNode.config.keywords])];
      }
      if (sourceNode.config.regex) {
        targetNode.config.regex = [...new Set([...(targetNode.config.regex || []), ...sourceNode.config.regex])];
      }
      // Delete Source
      const idx = configTree.indexOf(sourceNode);
      if (idx !== -1) configTree.splice(idx, 1);

      setDirty(true);
      document.getElementById('conflictModal').classList.remove('active');
      renderTree();
      showStatus(document.getElementById('mainStatus'), `Merged ${action.source} into ${action.target} `, 'green');
    } else {
      alert("Could not find source or target folders.");
    }
  }
  // Disable button
  btn.disabled = true;
  btn.textContent = "Applied";
};

// Attach Listeners
document.addEventListener('DOMContentLoaded', () => {
  const staticBtn = document.getElementById('staticAnalysisBtn');
  if (staticBtn) staticBtn.addEventListener('click', startStaticAnalysis);

  const semanticBtn = document.getElementById('semanticAnalysisBtn');
  if (semanticBtn) semanticBtn.addEventListener('click', startSemanticAnalysis);

  const closeBtn = document.getElementById('closeConflictBtn');
  if (closeBtn) closeBtn.addEventListener('click', () => {
    document.getElementById('conflictModal').classList.remove('active');
  });

  // Old Smart Suggest
  const suggestBtn = document.getElementById('smartSuggestBtn');
  if (suggestBtn) suggestBtn.addEventListener('click', startSmartSuggest);
  // ... other existing listeners
});
