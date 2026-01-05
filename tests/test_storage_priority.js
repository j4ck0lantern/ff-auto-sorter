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
        onChanged: { addListener: () => { } }
    },
    runtime: { onInstalled: { addListener: () => { } }, onMessage: { addListener: () => { } } },
    bookmarks: { onCreated: { addListener: () => { } } },
    menus: { create: () => { }, onClicked: { addListener: () => { } } }
};

// 2. Load scripts in Sandbox
const utilsPath = path.join(__dirname, '../utils.js');
const utilsCode = fs.readFileSync(utilsPath, 'utf8');

const bgPath = path.join(__dirname, '../background.js');
const bgCode = fs.readFileSync(bgPath, 'utf8');

const sandbox = {
    browser: mockBrowser,
    console: console,
    setTimeout: setTimeout,
    clearTimeout: clearTimeout,
    fetch: () => { },
    TagDB: { getTags: async () => ({}) }, // Mock dependency
    URL: URL,
    // Add other globals if needed
};

vm.createContext(sandbox);

// Transform const/let to var to ensure variables attach to sandbox global
const transform = (code) => code.replace(/^const /gm, 'var ').replace(/^let /gm, 'var ');

vm.runInContext(transform(utilsCode), sandbox);
vm.runInContext(transform(bgCode), sandbox);

// 3. Test Cases
async function runTests() {
    console.log("=== TEST: Storage Priority (Loca Only) ===");

    const getConfig = sandbox.getConfig;
    if (typeof getConfig !== 'function') {
        console.error("FAIL: getConfig function not found in background.js scope.");
        process.exit(1);
    }

    let passes = 0;
    let fails = 0;

    // SCENARIO 1: Sync has data, Local has data -> Use LOCAL
    console.log("\nScenario 1: Sync has data, Local has data");
    mockStorage.syncData = { sorterConfig: [{ folder: "SyncFolder" }] };
    mockStorage.localData = { sorterConfig: [{ folder: "LocalFolder" }] };

    let config = await getConfig();
    if (config.length === 1 && config[0].folder === "LocalFolder") {
        console.log("PASS: Preferred Local over Sync.");
        passes++;
    } else {
        console.error("FAIL: Did not prefer Local. Got:", config);
        fails++;
    }

    // SCENARIO 2: Local is Missing -> Return Empty
    console.log("\nScenario 2: Local is Missing (null/undefined)");
    mockStorage.syncData = { sorterConfig: [{ folder: "SyncFolder" }] };
    mockStorage.localData = {};

    config = await getConfig();
    if (Array.isArray(config) && config.length === 0) {
        console.log("PASS: Returned empty array (ignored Sync).");
        passes++;
    } else {
        console.error("FAIL: Did not return empty. Got:", config);
        fails++;
    }

    // SCENARIO 3: Local has Empty Array -> Use Empty Array
    console.log("\nScenario 3: Local has Empty Array");
    mockStorage.syncData = { sorterConfig: [{ folder: "SyncFolder" }] };
    mockStorage.localData = { sorterConfig: [] };

    config = await getConfig();
    if (Array.isArray(config) && config.length === 0) {
        console.log("PASS: Respects empty Local array.");
        passes++;
    } else {
        console.error("FAIL: Did not respect empty Local array. Got:", config);
        fails++;
    }

    console.log(`\n=== RESULT: ${passes} Passed, ${fails} Failed ===`);
    if (fails > 0) process.exit(1);
}

runTests();
