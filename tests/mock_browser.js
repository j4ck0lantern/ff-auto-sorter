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
            const id = obj.id || ("new_" + Math.random());
            const newItem = { id, ...obj, children: [] };

            const findAndAttach = (nodes) => {
                for (const n of nodes) {
                    if (n.id === obj.parentId) {
                        if (!n.children) n.children = [];
                        if (obj.index !== undefined) {
                            n.children.splice(obj.index, 0, newItem);
                        } else {
                            n.children.push(newItem);
                        }
                        return true;
                    }
                    if (n.children && findAndAttach(n.children)) return true;
                }
                return false;
            };

            if (!findAndAttach(browser.bookmarks._tree)) {
                // Fallback for root or missing parent
                browser.bookmarks._tree.push(newItem);
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
            const findAndRemove = (nodes) => {
                for (let i = 0; i < nodes.length; i++) {
                    if (nodes[i].id === id) {
                        return nodes.splice(i, 1)[0];
                    }
                    if (nodes[i].children) {
                        const res = findAndRemove(nodes[i].children);
                        if (res) return res;
                    }
                }
                return null;
            };

            const item = findAndRemove(browser.bookmarks._tree);
            if (!item) return { id, parentId, index };

            // Find new parent and attach
            const findAndAttach = (nodes) => {
                for (const n of nodes) {
                    if (n.id === (parentId || item.parentId)) {
                        if (!n.children) n.children = [];
                        const targetIdx = index !== undefined ? index : n.children.length;
                        n.children.splice(targetIdx, 0, item);
                        item.parentId = n.id;
                        item.index = targetIdx;
                        return true;
                    }
                    if (n.children && findAndAttach(n.children)) return true;
                }
                return false;
            };

            if (!findAndAttach(browser.bookmarks._tree)) {
                // Fallback to top level
                const targetIdx = index !== undefined ? index : browser.bookmarks._tree.length;
                browser.bookmarks._tree.splice(targetIdx, 0, item);
                item.index = targetIdx;
            }

            // Mock indices for all siblings in the affected parent
            // (Real API updates all indices when one moves)
            // This is a simplification but helps tests
            return { id, parentId: item.parentId, index: item.index };
        },
        onCreated: { addListener: () => { } },
        onRemoved: { addListener: () => { } },
        onChanged: { addListener: () => { } },
        setTree: (tree) => { browser.bookmarks._tree = tree; }
    },
    storage: {
        onChanged: {
            _listeners: [],
            addListener: (fn) => browser.storage.onChanged._listeners.push(fn)
        },
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
            set: async (obj) => {
                Object.assign(browser.storage.sync._data, obj);
                // Notify listeners
                for (const fn of browser.storage.onChanged._listeners) {
                    fn(obj, 'sync');
                }
            }
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
