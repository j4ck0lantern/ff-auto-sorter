const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// ANSI Color Codes
const RST = "\x1b[0m";
const RED = "\x1b[31m";
const GRN = "\x1b[32m";
const YEL = "\x1b[33m";
const CYN = "\x1b[36m";

const PROJECT_ROOT = path.resolve(__dirname, '..');
const SRC_FILES = ['background.js', 'options.js', 'popup.js', 'db.js', 'utils.js', 'ai_manager.js', 'folder_manager.js'];
const TEST_FILES = [
    'tests/test_utils.js',
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
    'tests/test_folder_sorting_logic.js',
    'tests/test_sequence.js',
    'tests/test_reproduce_folder_gaps.js',
    'tests/test_concurrency.js',
    'tests/test_reports_xss.js'
];

let errorCount = 0;
let warnCount = 0;

console.log(`${CYN}=== [CODEBASE HEALTH SCAN] ===${RST}\n`);

// 1. RUN UNIT TESTS
console.log(`${CYN}--- [Executing Unit Tests] ---${RST}`);
TEST_FILES.forEach(testFile => {
    try {
        console.log(`\n> Running ${testFile}...`);
        execSync(`node ${testFile}`, { stdio: 'inherit', cwd: PROJECT_ROOT });
        console.log(`${GRN}[PASS] ${testFile}${RST}`);
    } catch (e) {
        console.error(`${RED}[FAIL] ${testFile}${RST}`);
        errorCount++;
    }
});

// 2. STATIC ANALYSIS
console.log(`\n${CYN}--- [Static Code Analysis] ---${RST}`);

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
            console.error(`${RED}[X] [${file}:${lineNum}] 'debugger' statement found: "${trimmed}"${RST}`);
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
                // console.log(`   [i] [${file}:${lineNum}] Active Debug Log (OK)`);
            } else {
                console.warn(`${YEL}[!] [${file}:${lineNum}] Untagged 'console.log': ${trimmed.substring(0, 60)}...${RST}`);
                warnCount++;
            }
        }

        // CHECK: Empty Blocks
        if (trimmed === 'try { } catch (e) { }') {
            console.warn(`${YEL}[!] [${file}:${lineNum}] Empty try-catch block.${RST}`);
            warnCount++;
        }
    });
});

console.log(`\n${CYN}--- [SCAN COMPLETE] ---${RST}`);
console.log(`${RED}Critical Errors: ${errorCount}${RST}`);
console.log(`${YEL}Warnings: ${warnCount}${RST}`);

if (errorCount === 0) {
    if (warnCount > 0) {
        console.log(`\n${GRN}[OK] PROJECT IS FUNCTIONAL (With Warnings)${RST}`);
    } else {
        console.log(`\n${GRN}[OK] PROJECT IS CLEAN${RST}`);
    }
    process.exit(0);
} else {
    console.log(`\n${RED}[XXX] PROJECT HAS CRITICAL ERRORS${RST}`);
    process.exit(1);
}
