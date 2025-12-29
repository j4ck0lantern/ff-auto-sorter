/* --- Database Abstraction for Bookmark Tags --- */
// Handles storage of AI tags using selectable backends (Local vs URL Hash)

const TagDB = {
    STORAGE_KEY: 'bookmarkTags',
    MODE_KEY: 'storageMode',
    currentMode: 'local', // 'local' or 'url'

    async init() {
        // Load mode from sync storage, fallback to local
        let { storageMode } = await browser.storage.sync.get('storageMode');
        if (!storageMode) {
            const local = await browser.storage.local.get('storageMode');
            storageMode = local.storageMode;
        }
        this.currentMode = storageMode || 'local';
    },

    async getMode() {
        await this.init();
        return this.currentMode;
    },

    async setMode(mode) {
        this.currentMode = mode;
        await browser.storage.sync.set({ storageMode: mode });
        await browser.storage.local.set({ storageMode: mode });
    },

    /* --- Generic Interface --- */

    async getAll() {
        // Only relevant for Local DB
        const result = await browser.storage.local.get(this.STORAGE_KEY);
        return result[this.STORAGE_KEY] || {};
    },

    async getTags(url) {
        if (!url) return {};
        await this.init();

        if (this.currentMode === 'url') {
            return this.extractFromUrl(url);
        } else {
            // Local Mode
            const allTags = await this.getAll();
            // We use normalized URL for key
            const normUrl = this.normalize(url);
            return allTags[normUrl] || {};
        }
    },

    // bookmarkId is REQUIRED for 'url' mode to update the specific bookmark
    async setTags(url, tags, bookmarkId) {
        if (!url) return;
        await this.init();

        if (this.currentMode === 'url') {
            if (!bookmarkId) {
                console.error("TagDB: bookmarkId required for URL mode setTags");
                return;
            }
            await this.writeToUrl(bookmarkId, url, tags);
        } else {
            // Local Mode
            const allTags = await this.getAll();
            const normUrl = this.normalize(url);

            // Merge logic
            const existing = allTags[normUrl] || {};
            allTags[normUrl] = { ...existing, ...tags, lastUpdated: Date.now() };

            await browser.storage.local.set({ [this.STORAGE_KEY]: allTags });
        }
    },

    async removeTags(url, bookmarkId) {
        if (!url) return;
        await this.init();

        if (this.currentMode === 'url') {
            if (!bookmarkId) return;
            // Write empty tags = clear
            await this.writeToUrl(bookmarkId, url, {});
        } else {
            const allTags = await this.getAll();
            const normUrl = this.normalize(url);
            if (allTags[normUrl]) {
                delete allTags[normUrl];
                await browser.storage.local.set({ [this.STORAGE_KEY]: allTags });
            }
        }
    },

    // For bulk operations (backup/restore) - only affects Local DB
    async saveAll(data) {
        await browser.storage.local.set({ [this.STORAGE_KEY]: data });
    },

    /* --- Helper: Normalize URL --- */
    normalize(url) {
        try {
            const urlObj = new URL(url);
            urlObj.hash = ''; // Strip hash for DB Key
            if (urlObj.pathname.endsWith('/') && urlObj.pathname.length > 1) {
                urlObj.pathname = urlObj.pathname.slice(0, -1);
            }
            return urlObj.toString();
        } catch (e) { return url; }
    },

    /* --- URL Hash Strategy Implementation --- */

    extractFromUrl(url) {
        try {
            const urlObj = new URL(url);
            const hash = urlObj.hash;
            if (!hash || hash.length < 2) return {};

            const cleanHash = hash.substring(1);
            const params = new URLSearchParams(cleanHash);

            const tags = {};
            if (params.has('ai-folder')) tags.aiFolder = params.get('ai-folder');
            if (params.has('ai-keywords')) tags.aiKeywords = params.get('ai-keywords');
            if (params.has('time')) tags.time = params.get('time');

            return tags;
        } catch (e) { return {}; }
    },

    async writeToUrl(bookmarkId, currentUrl, tags) {
        try {
            const urlObj = new URL(currentUrl);
            const initialHash = urlObj.hash.substring(1); // existing params
            const params = new URLSearchParams(initialHash);

            // Update keys
            if (tags.aiFolder) params.set('ai-folder', tags.aiFolder);
            else if (tags.aiFolder === null) params.delete('ai-folder'); // Explicit null defaults to delete?

            if (tags.aiKeywords) params.set('ai-keywords', tags.aiKeywords);
            if (tags.time) params.set('time', tags.time);

            // Reconstruct
            // If deleting all tags (removeTags called with empty object isn't enough, we need clear logic)
            // But setTags merges. removeTags handles clearing.
            // If tags is empty object? Logic above says "merge".

            // Wait, removeTags calls writeToUrl with {}? No, that would just merge nothing.
            // removeTags should explicitly delete.

            // Correction implementation for this Strategy:
            // setTags merges. 
            // removeTags clears specific keys? Or all AI keys? 
            // Let's implement specific "clear" logic if tags is strictly empty? No.

            if (Object.keys(tags).length === 0) {
                // Clear Mode
                params.delete('ai-folder');
                params.delete('ai-keywords');
                params.delete('time');
            }

            urlObj.hash = params.toString();
            const newUrl = urlObj.toString();

            if (newUrl !== currentUrl) {
                await browser.bookmarks.update(bookmarkId, { url: newUrl });
            }
        } catch (e) { console.error("URL write error", e); }
    }
};

// Make available globally
window.TagDB = TagDB;
