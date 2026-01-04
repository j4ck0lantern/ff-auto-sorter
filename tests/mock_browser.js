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
            // Simulate reading indices from current array position
            if (item && item.children) {
                return item.children.map((child, idx) => ({ ...child, index: idx }));
            }
            return [];
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
            // In real API, get() returns object with index relative to parent
            // We need to find parent to know index
            if (item) {
                 const findParent = (nodes, targetId) => {
                    for (const n of nodes) {
                        if (n.children) {
                            const idx = n.children.findIndex(c => c.id === targetId);
                            if (idx !== -1) return { parent: n, index: idx };
                            const res = findParent(n.children, targetId);
                            if (res) return res;
                        }
                    }
                    return null;
                 };
                 // Handle root
                 if (item.id === "root________") return [item];

                 const pInfo = findParent([{ children: browser.bookmarks._tree }], item.id);
                 if (pInfo) {
                     return [{ ...item, index: pInfo.index, parentId: pInfo.parent.id === undefined ? undefined : pInfo.parent.id }];
                 }
                 return [item];
            }
            return [];
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
        removeTree: async (id) => {
             const remove = (nodes) => {
                const idx = nodes.findIndex(n => n.id === id);
                if (idx !== -1) {
                    nodes.splice(idx, 1);
                    return true;
                }
                for (const n of nodes) {
                    if (n.children && remove(n.children)) return true;
                }
                return false;
             };
             remove(browser.bookmarks._tree);
        },
        update: async (id, changes) => {
            const [item] = await browser.bookmarks.get(id); // get copy
            if (item) {
                // Apply changes to real tree node
                const findAndMod = (nodes) => {
                     for (const n of nodes) {
                         if (n.id === id) {
                             Object.assign(n, changes);
                             return true;
                         }
                         if (n.children && findAndMod(n.children)) return true;
                     }
                     return false;
                };
                findAndMod(browser.bookmarks._tree);
            }
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
            // 1. Remove from old location
            let item = null;
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

            item = findAndRemove(browser.bookmarks._tree);
            if (!item) throw new Error("Item not found");

            // 2. Insert into new location
            // Use provided parentId or keep existing (if moving within same folder)
            const targetParentId = parentId || item.parentId;

            const findAndAttach = (nodes) => {
                for (const n of nodes) {
                    if (n.id === targetParentId) {
                        if (!n.children) n.children = [];
                        const targetIdx = index !== undefined ? index : n.children.length;
                        // Clamp index
                        const actualIdx = Math.min(targetIdx, n.children.length);
                        n.children.splice(actualIdx, 0, item);
                        item.parentId = n.id;
                        // item.index is dynamic, we don't store it on the object persistently in this mock structure
                        return true;
                    }
                    if (n.children && findAndAttach(n.children)) return true;
                }
                return false;
            };

            if (!findAndAttach(browser.bookmarks._tree)) {
                // Root fallback
                const targetIdx = index !== undefined ? index : browser.bookmarks._tree.length;
                browser.bookmarks._tree.splice(targetIdx, 0, item);
            }

            return { id, parentId: item.parentId, index };
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
