/**
 * UNIT TEST: Keyword Matching Logic
 * 
 * Objectives:
 * 1. Verify standard keyword matching (Happy Path).
 * 2. Verify 'ignore: true' configuration is respected.
 * 3. Verify Default Fallback behavior when no matches found.
 */

// --- MOCK CONFIGURATION ---
const mockConfig = [
    {
        folder: "Technology/Web",
        index: 0,
        config: {
            keywords: ["javascript", "typescript", "node"],
        }
    },
    {
        folder: "Technology/Legacy",
        config: {
            keywords: ["vbscript", "flash"],
            ignore: true // THIS SHOULD BE SKIPPED
        }
    },
    {
        folder: "Animals",
        config: {
            keywords: ["fox", "dog"]
        }
    },
    // Implicit "Miscellaneous" default assumed if no match
];

// --- LOGIC UNDER TEST (matches background.js implementation) ---
function findMatch(sorterConfig, bookmark) {
    const searchableText = (bookmark.title + " " + bookmark.url).toLowerCase();

    let matchedRule = null;

    for (const item of sorterConfig) {
        const config = item.config;
        if (!config) continue;

        // 1. IGNORE CHECK
        if (config.ignore) {
            // In real app, we might log this?
            // console.log(`Skipping ignored rule: ${item.folder}`);
            continue;
        }

        // 2. REGEX CHECK (Mocked out for this test, focusing on keywords)
        if (config.regex) {
            // ... regex logic ...
        }

        // 3. KEYWORD CHECK
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

    return matchedRule;
}

// --- TEST SUITE ---
let passCount = 0;
let failCount = 0;

function assert(desc, value, expected) {
    if (value === expected) {
        console.log(`✅ PASS: ${desc}`);
        passCount++;
    } else {
        console.error(`❌ FAIL: ${desc}`);
        console.error(`   Expected: '${expected}'`);
        console.error(`   Got:      '${value}'`);
        failCount++;
    }
}

console.log("=== KEYWORD MATCHING SUITE ===\n");

// Test 1: Standard Match
const b1 = { title: "Modern Javascript features", url: "http://example.com" };
const r1 = findMatch(mockConfig, b1);
assert("Keyword 'javascript' matches 'Technology/Web'", r1 ? r1.folder : null, "Technology/Web");

// Test 2: Ignored Rule
// "flash" would match "Technology/Legacy", but it has ignore: true.
const b2 = { title: "Adobe Flash Player EOL", url: "http://adobe.com" };
const r2 = findMatch(mockConfig, b2);
assert("Ignored rule 'Technology/Legacy' is skipped", r2, null);

// Test 3: No Match (Default)
const b3 = { title: "Cooking recipes for dinner", url: "http://food.com" };
const r3 = findMatch(mockConfig, b3);
assert("Unmatched content returns null (triggers Default)", r3, null);

// Test 4: Partial/Case-insensitive uniqueness
const b4 = { title: "The quick brown FOX jumps", url: "http://zoo.com" };
const r4 = findMatch(mockConfig, b4);
assert("Case-insensitive match 'FOX' -> 'Animals'", r4 ? r4.folder : null, "Animals");

console.log(`\n=== SUITE COMPLETE: ${passCount} Passed, ${failCount} Failed ===`);

if (failCount > 0) process.exit(1);
