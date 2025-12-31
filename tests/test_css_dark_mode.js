/**
 * UNIT TEST: CSS Dark Mode Coverage
 * 
 * Objective:
 * Ensure that all critical UI components have corresponding dark mode styles
 * in the @media query block.
 */

const fs = require('fs');
const path = require('path');

const optionsHtmlPath = path.resolve(__dirname, '../options.html');
const content = fs.readFileSync(optionsHtmlPath, 'utf8');

// Rules to check
const CRITICAL_ELEMENTS = [
    '.tag',
    '.tag-close',
    '.node-content',
    'input[type="text"]',
    'input[type="password"]',
    'textarea',
    'select'
];

let failCount = 0;

/**
 * Finds a block of code enclosed in balanced braces.
 */
function findBalancedBlock(text, startChar = '{', endChar = '}') {
    let depth = 0;
    let started = false;
    let result = "";

    for (const char of text) {
        if (char === startChar) {
            depth++;
            started = true;
        }
        if (started) {
            result += char;
            if (char === endChar) {
                depth--;
                if (depth === 0) return result;
            }
        }
    }
    return null;
}

function checkCoverage() {
    console.log("=== CSS DARK MODE REGRESSION SUITE ===\n");

    // 1. Locate the @media query
    const mediaQueryIndex = content.indexOf('@media (prefers-color-scheme: dark)');
    if (mediaQueryIndex === -1) {
        console.error("❌ FAIL: @media (prefers-color-scheme: dark) block missing.");
        process.exit(1);
    }

    const mediaBody = findBalancedBlock(content.substring(mediaQueryIndex));
    if (!mediaBody) {
        console.error("❌ FAIL: Could not parse balanced block for @media query.");
        process.exit(1);
    }

    // 2. Assert each element exists in the block
    CRITICAL_ELEMENTS.forEach(selector => {
        // Updated regex: Match selector followed by optional comma/newlines OR directly by {
        const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const selectorRegex = new RegExp(`${escapedSelector}(\\s*[,{])`, 'i');

        if (selectorRegex.test(mediaBody)) {
            console.log(`✅ PASS: ${selector} found in @media block.`);
        } else {
            console.error(`❌ FAIL: ${selector} missing override in @media block.`);
            failCount++;
        }
    });

    console.log(`\n=== SUITE COMPLETE: ${failCount === 0 ? "PASSED" : "FAILED (" + failCount + " issues found)"} ===`);
    if (failCount > 0) process.exit(1);
}

checkCoverage();
