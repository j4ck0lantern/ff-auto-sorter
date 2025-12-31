/**
 * MOCK BROWSER API
 * 
 * Simple mock of the WebExtension browser API for Node.js testing.
 */

const browser = {
    bookmarks: {
        _tree: [],
        getTree: async () => JSON.parse(JSON.stringify(browser.bookmarks._tree)),
        getChildren: async (id) => {
            const [item] = await browser.bookmarks.get(id);
            return item ? (item.children || []) : [];
        },
        get: async (id) => {
            const find = (nodes) => {
                for (const n of nodes) {
                    if (n.id === id) return n;
                    if (n.children) {
                        const res = find(n.children);
                        if (res) return res;
                    }
                }
                return null;
            };
            const item = find(browser.bookmarks._tree);
            return item ? [item] : [];
        },
        create: async (obj) => {
            const id = "new_" + Math.random();
            const newItem = { id, ...obj, children: [] };
            // Simple: append to root's first child (unfiled)
            if (browser.bookmarks._tree[0] && browser.bookmarks._tree[0].children[0]) {
                browser.bookmarks._tree[0].children[0].children.push(newItem);
            }
            return newItem;
        },
        removeTree: async (id) => { /* no-op */ },
        update: async (id, changes) => {
            const [item] = await browser.bookmarks.get(id);
            if (item) Object.assign(item, changes);
            return item;
        },
        search: async ({ url }) => {
            const results = [];
            const traverse = (nodes) => {
                for (const n of nodes) {
                    if (n.url === url) results.push(n);
                    if (n.children) traverse(n.children);
                }
            };
            traverse(browser.bookmarks._tree);
            return results;
        },
        move: async (id, { parentId, index }) => {
            // Simplified move
            return { id, parentId, index };
        },
        onCreated: { addListener: () => { } },
        onRemoved: { addListener: () => { } },
        onChanged: { addListener: () => { } },
        setTree: (tree) => { browser.bookmarks._tree = tree; }
    },
    storage: {
        onChanged: { addListener: () => { } },
        local: {
            _data: {},
            get: async (keys) => {
                const res = {};
                if (Array.isArray(keys)) keys.forEach(k => res[k] = browser.storage.local._data[k]);
                else res[keys] = browser.storage.local._data[keys];
                return res;
            },
            set: async (obj) => { Object.assign(browser.storage.local._data, obj); }
        },
        sync: {
            _data: {},
            get: async (keys) => {
                const res = {};
                if (Array.isArray(keys)) keys.forEach(k => res[k] = browser.storage.sync._data[k]);
                else res[keys] = browser.storage.sync._data[keys];
                return res;
            },
            set: async (obj) => { Object.assign(browser.storage.sync._data, obj); }
        }
    },
    runtime: {
        onMessage: {
            _listeners: [],
            addListener: (fn) => browser.runtime.onMessage._listeners.push(fn)
        },
        sendMessage: async (msg) => {
            for (const fn of browser.runtime.onMessage._listeners) {
                const res = await fn(msg);
                if (res) return res;
            }
        },
        onInstalled: { addListener: () => { } }
    },
    notifications: {
        create: async () => "id",
        clear: async () => { }
    },
    menus: {
        create: () => { },
        onClicked: { addListener: () => { } }
    }
};

module.exports = { browser };
