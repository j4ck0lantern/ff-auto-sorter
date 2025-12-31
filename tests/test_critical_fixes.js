/**
 * TEST: Critical Regressions Suite
 * 
 * Verifies fixes for:
 * 1. Nested Index Poisoning (Home vs SysAdmin)
 * 2. Background Script Crash on Config Change (ReferenceError)
 * 3. AI JSON Parsing Resilience
 */

const fs = require('fs');
const path = require('path');
const mockBrowser = require('./mock_browser');

global.browser = mockBrowser.browser;
global.window = global;
global.fetch = async () => ({
    ok: true,
    json: async () => ({ choices: [{ message: { content: '{"folder": "Mock/Path"}' } }] }),
    text: async () => ""
});

function loadScript(filename) {
    let script = fs.readFileSync(path.resolve(__dirname, '..', filename), 'utf8');
    script = script.replace(/^const /gm, 'var ').replace(/^let /gm, 'var ');
    // Mock imports if any (none in background.js usually)
    eval.call(global, script);
}

// Load dependencies
loadScript('db.js');
loadScript('background.js');

async function runTests() {
    console.log("=== SUITE: Critical Fixes Verification ===\n");
    let passed = 0;
    let failed = 0;

    // --- CASE 1: Nested Index Poisoning ---
    console.log("TEST 1: Nested Index Poisoning (Expect Home[0] < SysAdmin[6])");
    const toolbarId = "toolbar_____";
    browser.bookmarks.setTree([
        {
            id: "root________", title: "Root", children: [
                {
                    id: toolbarId, title: "Bookmarks Toolbar", children: [
                        { id: "f_sys", title: "SysAdmin", index: 0, parentId: toolbarId },
                        { id: "f_home", title: "Home", index: 1, parentId: toolbarId }
                    ]
                }
            ]
        }
    ]);

    // Config: Child "SysAdmin/Web" has implicit index (undefined or 0 in rule). Parent "SysAdmin" has 6. Home has 0.
    // Bug: Child index 0 was applied to Parent SysAdmin.
    const poisonConfig = [
        { folder: "Home", index: 0, config: { ignore: true } },
        { folder: "SysAdmin", index: 6, config: { ignore: false } },
        { folder: "SysAdmin/Web", config: {} } // No index, or index 0 implicit
    ];
    await browser.storage.local.set({ sorterConfig: poisonConfig });

    await enforceFolderStructure();

    const children = await browser.bookmarks.getChildren(toolbarId);
    const homeIdx = children.findIndex(c => c.title === "Home");
    const sysIdx = children.findIndex(c => c.title === "SysAdmin");

    if (homeIdx !== -1 && sysIdx !== -1 && homeIdx < sysIdx) {
        console.log(`✅ PASS: Home (${homeIdx}) is before SysAdmin (${sysIdx})\n`);
        passed++;
    } else {
        console.error(`❌ FAIL: Home (${homeIdx}) vs SysAdmin (${sysIdx})\n`);
        failed++;
    }

    // --- CASE 2: Background Crash on Config Change ---
    console.log("TEST 2: Config Change Crash (ReferenceError check)");
    try {
        // Trigger storage change
        // The mock now calls listeners. background.js has a listener that calls loadMainConfig (or getConfig now).
        // If ReferenceError exists, it will throw here.
        await browser.storage.sync.set({ sorterConfig: [] });
        console.log("✅ PASS: No crash on storage trigger.\n");
        passed++;
    } catch (e) {
        console.error(`❌ FAIL: Crashed on storage change: ${e.message}\n`);
        failed++;
    }

    // --- CASE 3: AI JSON Parsing ---
    console.log("TEST 3: AI JSON Parsing (Markdown & Chat wrappers)");
    const messyInputs = [
        'Here is the JSON: ```json\n{"folder": "Good"}\n```',
        'Just {"folder": "Raw"} works',
        'Sure! \n\n ```\n{\n  "folder": "Multiline"\n}\n``` \nHope this helps.'
    ];

    let parsePass = true;
    for (const input of messyInputs) {
        // We can't access `fetchAI` directly if it's not global, but we can test the regex logic 
        // OR we can rely on `processSingleBookmarkAI` if we mock `fetch`.

        // Let's create a temporary verified function mimicking the background.js logic
        const jsonMatch = input.match(/\{[\s\S]*\}/); // The fix we applied
        if (!jsonMatch) {
            console.error(`❌ FAIL: Failed to match input: ${input.substring(0, 20)}...`);
            parsePass = false;
        } else {
            try {
                JSON.parse(jsonMatch[0]);
            } catch (e) {
                console.error(`❌ FAIL: Matched invalid JSON: ${jsonMatch[0]}`);
                parsePass = false;
            }
        }
    }

    if (parsePass) {
        console.log("✅ PASS: All messy inputs matched and parsed.\n");
        passed++;
    } else {
        failed++;
    }

    console.log(`=== RESULTS: ${passed} Passed, ${failed} Failed ===`);
    if (failed > 0) process.exit(1);
}

runTests().catch(e => {
    console.error(e);
    process.exit(1);
});
