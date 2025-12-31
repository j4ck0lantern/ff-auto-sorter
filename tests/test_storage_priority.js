const fs = require('fs');
const path = require('path');
const vm = require('vm');

/**
 * UNIT TEST: Storage Priority Regression
 *
 * Verifies that getConfig() correctly falls back to Local storage
 * when Sync storage returns an empty array (which is truthy).
 */

// 1. Setup Mock Environment
const mockStorage = {
    syncData: {},
    localData: {},
    sync: {
        get: async (key) => ({ [key]: mockStorage.syncData[key] }),
        set: async (data) => Object.assign(mockStorage.syncData, data)
    },
    local: {
        get: async (key) => ({ [key]: mockStorage.localData[key] }),
        set: async (data) => Object.assign(mockStorage.localData, data)
    }
};

const mockBrowser = {
    storage: {
        ...mockStorage,
        onChanged: { addListener: () => {} }
    },
    runtime: { onInstalled: { addListener: () => {} }, onMessage: { addListener: () => {} } },
    bookmarks: { onCreated: { addListener: () => {} } },
    menus: { create: () => {}, onClicked: { addListener: () => {} } }
};

// 2. Load background.js in Sandbox
const bgPath = path.join(__dirname, '../background.js');
const bgCode = fs.readFileSync(bgPath, 'utf8');

const sandbox = {
    browser: mockBrowser,
    console: console,
    setTimeout: setTimeout,
    clearTimeout: clearTimeout,
    fetch: () => {},
    TagDB: { getTags: async () => ({}) }, // Mock dependency
    URL: URL,
    // Add other globals if needed
};

vm.createContext(sandbox);
vm.runInContext(bgCode, sandbox);

// 3. Test Cases
async function runTests() {
    console.log("=== TEST: Storage Priority (getConfig) ===");

    const getConfig = sandbox.getConfig;
    if (typeof getConfig !== 'function') {
        console.error("FAIL: getConfig function not found in background.js scope.");
        process.exit(1);
    }

    let passes = 0;
    let fails = 0;

    // SCENARIO 1: Sync has data -> Use Sync
    console.log("\nScenario 1: Sync has data");
    mockStorage.syncData = { sorterConfig: [{ folder: "SyncFolder" }] };
    mockStorage.localData = { sorterConfig: [{ folder: "LocalFolder" }] };

    let config = await getConfig();
    if (config.length === 1 && config[0].folder === "SyncFolder") {
        console.log("PASS: Preferred Sync when available.");
        passes++;
    } else {
        console.error("FAIL: Did not prefer Sync. Got:", config);
        fails++;
    }

    // SCENARIO 2: Sync is NULL/Undefined -> Use Local
    console.log("\nScenario 2: Sync is Missing (null/undefined)");
    mockStorage.syncData = {}; // get returns {}
    mockStorage.localData = { sorterConfig: [{ folder: "LocalFolder" }] };

    config = await getConfig();
    if (config.length === 1 && config[0].folder === "LocalFolder") {
        console.log("PASS: Fell back to Local when Sync missing.");
        passes++;
    } else {
        console.error("FAIL: Did not fallback to Local. Got:", config);
        fails++;
    }

    // SCENARIO 3: Sync is EMPTY ARRAY [] -> Use Local (THE BUG FIX)
    console.log("\nScenario 3: Sync is Empty Array [] (The Bug)");
    mockStorage.syncData = { sorterConfig: [] };
    mockStorage.localData = { sorterConfig: [{ folder: "LocalFolder" }] };

    config = await getConfig();
    if (config.length === 1 && config[0].folder === "LocalFolder") {
        console.log("PASS: Fell back to Local when Sync was empty array.");
        passes++;
    } else {
        console.error("FAIL: Accepted empty Sync array instead of falling back. Got:", config);
        fails++;
    }

    // SCENARIO 4: Both Empty -> Return Empty
    console.log("\nScenario 4: Both Empty");
    mockStorage.syncData = { sorterConfig: [] };
    mockStorage.localData = { sorterConfig: [] };

    config = await getConfig();
    if (Array.isArray(config) && config.length === 0) {
        console.log("PASS: Returned empty array when both empty.");
        passes++;
    } else {
        console.error("FAIL: Unexpected result for empty state. Got:", config);
        fails++;
    }

    console.log(`\n=== RESULT: ${passes} Passed, ${fails} Failed ===`);
    if (fails > 0) process.exit(1);
}

runTests();
