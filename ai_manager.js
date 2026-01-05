/* --- LOGIC: AI API Call --- */
async function getAISuggestionPrompt(bookmark, sorterConfig) {
    let aiConfig, geminiApiKey;
    try {
        const local = await browser.storage.local.get(['aiConfig', 'geminiApiKey']);
        aiConfig = local.aiConfig;
        geminiApiKey = local.geminiApiKey;
    } catch (e) {
        // failed
    }


    let provider = aiConfig ? aiConfig.provider : (geminiApiKey ? 'gemini' : null);
    if (!provider) return null;

    // FILTER: Exclude ignored folders from AI context
    const activeRules = sorterConfig.filter(rule => !rule.config || !rule.config.ignore);
    const folderList = activeRules.map(rule => rule.folder).join(', ');

    const defaultRule = sorterConfig.find(r => r.config && r.config.default);
    const defaultFolderName = defaultRule ? defaultRule.folder : "Miscellaneous";

    const prompt = `
    Analyze this URL: ${bookmark.url}
    Title: ${bookmark.title}
    
    Folders: ${folderList}
    Fallback Folder: ${defaultFolderName}
    
    INSTRUCTIONS:
    1. Choose the best specific folder from the list provided.
    2. AVOID generic folders like "Miscellaneous" or "Other" IF a more specific folder fits (Best Effort).
    3. If the bookmark does not have a strong semantic match to any specific folder, return "${defaultFolderName}".
    4. It is BETTER to put it in "${defaultFolderName}" than to guess a wrong specific folder.
    5. Provide an 8-word description for the bookmark title.
    6. Provide 15 comma-separated keywords for search.
    
    JSON format: { "folder": "...", "description": "...", "wordSoup": "..." }
    `;

    return { prompt, provider, aiConfig, geminiApiKey };
}

async function fetchAI(promptData) {
    const { prompt, provider, aiConfig, geminiApiKey } = promptData;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    let responseText = "";
    try {
        if (provider === 'gemini') {
            const apiKey = (aiConfig && aiConfig.apiKey) ? aiConfig.apiKey : geminiApiKey;
            if (!apiKey) return null;

            const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${apiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
                signal: controller.signal
            });
            const data = await resp.json();
            responseText = data.candidates?.[0]?.content?.parts?.[0]?.text || "";

        } else if (provider === 'openai') {
            const { baseUrl, apiKey, model } = aiConfig;

            // Robust URL construction
            let cleanBase = baseUrl.replace(/\/$/, '');
            let url = cleanBase;
            if (!cleanBase.endsWith('/chat/completions')) {
                url = `${cleanBase}/chat/completions`;
            }

            console.log(`[AI] POST request to: ${url}`);

            const resp = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
                body: JSON.stringify({
                    model: model,
                    messages: [{ role: "user", content: prompt }],
                    temperature: 0.2
                }),
                signal: controller.signal
            });

            if (!resp.ok) {
                const errText = await resp.text();
                console.error(`[AI] HTTP Error ${resp.status}:`, errText);
                throw new Error(`AI Provider returned ${resp.status}: ${errText}`);
            }

            const data = await resp.json();
            responseText = data.choices?.[0]?.message?.content || "";
        }
        clearTimeout(timeoutId);

        // Strip Markdown code blocks
        responseText = responseText.replace(/```json/g, "").replace(/```/g, "").trim();

        console.log("AI Raw Response:", responseText);

        // More robust JSON extraction (captures { ... })
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            return JSON.parse(jsonMatch[0]);
        } else {
            console.warn("No JSON found in AI response");
        }

    } catch (e) {
        console.error("AI Fetch Error:", e);
        console.error("Response text was:", responseText);
    }
    return null;
}

async function processSingleBookmarkAI(bookmark, useMutex = false) {
    const sorterConfig = await getConfig();

    const promptData = await getAISuggestionPrompt(bookmark, (sorterConfig && sorterConfig.length) ? sorterConfig : DEFAULT_CONFIG);
    if (!promptData) return { success: false, error: "Configuration missing" };

    const result = await fetchAI(promptData);
    if (result) {
        // LOCK DB WRITE
        if (useMutex) await dbMutex.lock();
        try {
            await TagDB.setTags(getNormalizedUrl(bookmark.url), {
                aiFolder: result.folder,
                aiKeywords: result.wordSoup,
                time: formatDate(Date.now())
            }, bookmark.id);

            // LOG TAGS
            if (window.reportManager) {
                const tags = result.wordSoup ? result.wordSoup.split(',').map(s => s.trim()) : [];
                window.reportManager.logTag(bookmark, tags);
            }
        } finally {
            if (useMutex) dbMutex.unlock();
        }

        try {
            await browser.bookmarks.update(bookmark.id, {
                title: result.description,
                url: bookmark.url
            });

            // Move to Suggested Folder
            if (result.folder) {
                const rule = sorterConfig ? sorterConfig.find(r => r.folder === result.folder) : null;
                const index = rule ? rule.index : undefined;
                await moveBookmarkToFolder(bookmark, result.folder, index);
            }
        } catch (e) { }

        return { success: true, folder: result.folder };
    }
    return { success: false, error: "No AI response" };
}

async function analyzeBookmarksForSuggestions(existingConfig) {
    try {
        // Unrestricted analysis of random sample of bookmarks
        const tree = await browser.bookmarks.getTree();
        const allBookmarks = await getAllBookmarks(tree[0]);

        // Filter: Only Http/Https, reasonable length
        const sample = allBookmarks
            .filter(b => b.url && b.url.startsWith('http'))
            .sort(() => 0.5 - Math.random()) // Shuffle
            .slice(0, 50); // Analyze max 50 random bookmarks to save tokens/time

        if (sample.length < 5) throw new Error("Not enough bookmarks to analyze");

        const inputList = sample.map(b => `- ${b.title} (${b.url})`).join('\n');
        let prompt = "";

        if (!existingConfig || existingConfig.length === 0) {
            // GREENFIELD PROMPT
            prompt = `
              Analyze this list of bookmarks and suggest 3-5 high-level folder categories that would organize them well.
              For each category, provide 5-10 strong keywords.
              
              Bookmarks:
              ${inputList}
              
              Output strictly JSON array:
              [ { "type": "new", "folder": "CategoryName", "keywords": ["kw1", "kw2"], "bookmarkCount": 5 } ]
          `;
        } else {
            // ITERATIVE / REFINEMENT PROMPT
            const configSummary = existingConfig
                .map(c => `Folder: "${c.folder}", Existing Keywords: [${c.keywords.join(', ')}]`).join('\n');

            prompt = `
              I have an existing bookmark configuration:
              ${configSummary}
              
              Analyze this list of unsorted bookmarks and:
              1. Suggest NEW folders if they don't fit existing ones.
              2. Suggest REFINEMENTS to existing folders if a bookmark *should* go there but is missing keywords (e.g. "Dev" handles "JS" but not "TypeScript").
              
              Bookmarks:
              ${inputList}
              
              Output strictly a JSON array of objects.
              
              Schema for NEW folders:
              { "type": "new", "folder": "FolderName", "keywords": ["kw1", "kw2"], "bookmarkCount": 5 }
              
              Schema for REFINING existing folders:
              { "type": "refine", "folder": "ExistingFolderName", "addKeywords": ["kw3", "kw4"], "bookmarkCount": 3 }
          `;
        }

        // Reuse fetchAI logic
        let aiConfig, geminiApiKey;
        try {
            const local = await browser.storage.local.get(['aiConfig', 'geminiApiKey']);
            aiConfig = local.aiConfig;
            geminiApiKey = local.geminiApiKey;
        } catch (e) { }

        let provider = aiConfig ? aiConfig.provider : (geminiApiKey ? 'gemini' : null);
        if (!provider) throw new Error("AI Provider not configured");

        const promptData = { prompt, provider, aiConfig, geminiApiKey };
        const rawResult = await fetchAI(promptData);

        return { suggestions: Array.isArray(rawResult) ? rawResult : [] };

    } catch (e) {
        console.error(e);
        return { error: e.message };
    }
}

async function analyzeSemanticConflicts(config) {
    try {
        let aiConfig, geminiApiKey;
        try {
            const local = await browser.storage.local.get(['aiConfig', 'geminiApiKey']);
            aiConfig = local.aiConfig;
            geminiApiKey = local.geminiApiKey;
        } catch (e) { }
        const provider = aiConfig ? aiConfig.provider : (geminiApiKey ? 'gemini' : null);

        if (!provider) return { error: "AI not configured" };

        // FILTER: Exclude ignored folders from semantic analysis
        const activeFolders = config.filter(c => !c.config || !c.config.ignore);

        const structure = activeFolders.map(c => `Folder: "${c.folder}" (Keywords: ${c.config.keywords?.join(', ') || ''})`).join('\n');
        const prompt = `
            Analyze this folder structure for Semantic Conflicts and Redundancy.
            Configuration:
            ${structure}
            
            Identify issues where folders seem to compete for the same content or are redundantly named.
            Provide an ACTIONABLE fix for each.
            
            Output strictly JSON:
            {
                "issues": [
                    { 
                        "issue": "Description of the problem", 
                        "severity": "High|Medium", 
                        "affectedFolders": ["A", "B"], 
                        "action": {
                            "type": "merge",
                            "source": "A",
                            "target": "B"
                        }
                    },
                    {
                        "issue": "Keyword is too broad",
                        "severity": "Medium",
                        "affectedFolders": ["C"],
                        "action": {
                            "type": "delete_keyword",
                            "folder": "C",
                            "keyword": "the"
                        }
                    }
                ]
            }
         `;

        const promptData = { prompt, provider, aiConfig, geminiApiKey };
        const aiJson = await fetchAI(promptData);
        return { aiAnalysis: aiJson ? (aiJson.issues || []) : [] };

    } catch (e) {
        console.error(e);
        return { error: e.message };
    }
}
