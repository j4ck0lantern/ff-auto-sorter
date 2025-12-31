const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const SRC_FILES = ['background.js', 'options.js', 'popup.js', 'db.js'];
const TEST_FILES = [
    'tests/test_logic_core.js',
    'tests/test_options_logic.js',
    'tests/test_progress_bug.js',
    'tests/test_config_hot_reload.js',
    'tests/test_performance_cache.js',
    'tests/test_keyword_matching.js',
    'tests/test_css_dark_mode.js',
    'tests/test_ai_logic_flow.js',
    'tests/test_storage_priority.js',
    'tests/test_folder_index_regression.js',
    'tests/test_critical_fixes.js'
];

let errorCount = 0;
let warnCount = 0;

console.log("=== 🏥 CODEBASE HEALTH SCAN 🏥 ===\n");

// 1. RUN UNIT TESTS
console.log("--- 🧪 Executing Unit Tests ---");
TEST_FILES.forEach(testFile => {
    try {
        console.log(`\n> Running ${testFile}...`);
        execSync(`node ${testFile}`, { stdio: 'inherit', cwd: PROJECT_ROOT });
        console.log(`✅ ${testFile} PASSED`);
    } catch (e) {
        console.error(`❌ ${testFile} FAILED`);
        errorCount++;
    }
});

// 2. STATIC ANALYSIS
console.log("\n--- 🔍 Static Code Analysis ---");

SRC_FILES.forEach(file => {
    const filePath = path.join(PROJECT_ROOT, file);
    if (!fs.existsSync(filePath)) return;

    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');

    lines.forEach((line, idx) => {
        const lineNum = idx + 1;
        const trimmed = line.trim();

        // CHECK: Debugger (CRITICAL ERROR)
        if (trimmed.includes('debugger;')) {
            console.error(`❌ [${file}:${lineNum}] 'debugger' statement found: "${trimmed}"`);
            errorCount++;
        }

        // CHECK: Console Log (Context Aware)
        if (trimmed.includes('console.log(')) {
            // Smart Filter: Allow tagged logs as "Active Work", warn on untagged
            const isTagged = trimmed.toLowerCase().includes('[debug') ||
                trimmed.includes('[Organize]') ||
                trimmed.includes('[Prune]') ||
                trimmed.includes('[AI]');

            if (isTagged) {
                // Active Development Log - Ignore for Health Scan
                // console.log(`   ℹ️ [${file}:${lineNum}] Active Debug Log (OK)`);
            } else {
                console.warn(`⚠️ [${file}:${lineNum}] Untagged 'console.log': ${trimmed.substring(0, 60)}...`);
                warnCount++;
            }
        }

        // CHECK: Empty Blocks
        if (trimmed === 'try { } catch (e) { }') {
            console.warn(`⚠️ [${file}:${lineNum}] Empty try-catch block.`);
            warnCount++;
        }
    });
});

console.log("\n--- 📊 SCAN COMPLETE ---");
console.log(`Critical Errors: ${errorCount}`);
console.log(`Warnings: ${warnCount}`);

if (errorCount === 0) {
    if (warnCount > 0) {
        console.log("\n✅ PROJECT IS FUNCTIONAL (With Warnings)");
    } else {
        console.log("\n✅ PROJECT IS CLEAN");
    }
    process.exit(0);
} else {
    console.log("\n❌ PROJECT HAS CRITICAL ERRORS");
    process.exit(1);
}
