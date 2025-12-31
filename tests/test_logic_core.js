/**
 * UNIT TEST: Core Logic Regression Suit
 * 
 * Focus Areas:
 * 1. Strict Path Validation (Recursive "Child" protection)
 * 2. Pruning Safety (Protected Paths & System Roots)
 * 3. AI Tag Validation (Zombie Rule Detection)
 */

// --- MOCKS ---
const mockConfig = [
    { folder: "Hobbies", config: {} }, // Parent Rule
    { folder: "Programming/Web", config: {} } // Deep Rule
];

// 1. LOGIC TEST: Path Validation
function testPathValidation() {
    console.log("\n--- Test: Strict Path Validation ---");

    // Helper to simulate the logic inside organizeBookmark
    function isPathValid(fullPath) {
        const fullPathLower = fullPath.toLowerCase();

        // 1. Build Sets
        const validPaths = new Set();
        const validRoots = [];

        mockConfig.forEach(rule => {
            const lower = rule.folder.trim().toLowerCase();
            validPaths.add(lower);
            validRoots.push(lower);

            // Ancestors
            const parts = rule.folder.split('/');
            let acc = "";
            parts.forEach(p => {
                acc = acc ? `${acc}/${p}` : p;
                const l = acc.toLowerCase();
                validPaths.add(l);
                validRoots.push(l);
            });
        });

        // 2. Exact Check
        if (validPaths.has(fullPathLower)) return true;

        // 3. Recursive Check (The Fix)
        const isChild = validRoots.some(root => fullPathLower.startsWith(root + '/'));
        return isChild;
    }

    // Scenarios
    const scenarios = [
        { path: "Hobbies", expect: true, desc: "Exact Match Root" },
        { path: "Hobbies/Carpentry", expect: true, desc: "Child of Root (Recursion Fix)" },
        { path: "Hobbies/Carpentry/Tools", expect: true, desc: "Grandchild of Root" },
        { path: "Programming", expect: true, desc: "Ancestor of Deep Rule" },
        { path: "Programming/Web", expect: true, desc: "Exact Match Deep Rule" },
        { path: "Programming/Web/React", expect: true, desc: "Child of Deep Rule" },
        { path: "Social", expect: false, desc: "Stray Root (Zombie)" },
        { path: "Social/Audio", expect: false, desc: "Stray Child" },
        { path: "Other/Hobbies", expect: false, desc: "Partial Match Failing" }
    ];

    // ...

    const pruningScenarios = [
        { path: "Hobbies", expectProtected: true },
        { path: "Programming", expectProtected: true }, // Ancestor
        { path: "Programming/Web", expectProtected: true },
        { path: "Social", expectProtected: false },
        { path: "Bookmarks Toolbar/Hobbies", expectProtected: true } // Prefix handling is inside function, mocking simple here
    ];

    // Note: The actual code handles "Bookmarks Toolbar/" prefix stripping.
    // For this unit test, we should verify that Logic too.

    function isProtected(fullPath) {
        const lower = fullPath.toLowerCase();

        // Prefix logic from background.js
        const rootPrefixes = ["bookmarks toolbar/", "bookmarks menu/"];
        let relative = lower;
        for (const p of rootPrefixes) {
            if (relative.startsWith(p)) {
                relative = relative.substring(p.length);
                break;
            }
        }

        return protectedPaths.has(lower) || protectedPaths.has(relative);
    }

    let failures = 0;
    pruningScenarios.forEach(s => {
        const result = isProtected(s.path);
        if (result === s.expectProtected) {
            console.log(`PASS: '${s.path}' Protected? ${result}`);
        } else {
            console.error(`FAIL: '${s.path}' Protected? Got ${result}, Expected ${s.expectProtected}`);
            failures++;
        }
    });

    return failures === 0;
}

// RUNNER
console.log("=== STARTING REGRESSION SUITE ===");
testPathValidation();
testPruningProtection();
console.log("=== SUITE COMPLETE ===");
