/* IndexedDB persistence — permanent on-device storage (survives app restarts, works offline). */
(function (root) {
  'use strict';
  const DB_NAME = 'my-expense-manager';
  const DB_VERSION = 1;
  const STORES = ['accounts', 'categories', 'txns', 'meta'];
  let dbp = null;

  function open() {
    if (dbp) return dbp;
    dbp = new Promise((resolve, reject) => {
      if (!('indexedDB' in root)) return reject(new Error('This browser does not support IndexedDB'));
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('accounts')) db.createObjectStore('accounts', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('categories')) db.createObjectStore('categories', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('txns')) {
          const s = db.createObjectStore('txns', { keyPath: 'id' });
          s.createIndex('date', 'date');
        }
        if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'key' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
      req.onblocked = () => reject(new Error('Database is blocked — close other tabs of this app'));
    });
    return dbp;
  }

  function done(tx) {
    return new Promise((res, rej) => { tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error || new Error('Transaction aborted')); });
  }

  async function getAll(store) {
    const db = await open();
    return new Promise((res, rej) => {
      const r = db.transaction(store, 'readonly').objectStore(store).getAll();
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    });
  }
  async function put(store, value) {
    const db = await open(); const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).put(value); return done(tx);
  }
  async function putMany(store, values) {
    const db = await open(); const tx = db.transaction(store, 'readwrite');
    const s = tx.objectStore(store); for (const v of values) s.put(v); return done(tx);
  }
  async function del(store, id) {
    const db = await open(); const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).delete(id); return done(tx);
  }
  async function delMany(store, ids) {
    const db = await open(); const tx = db.transaction(store, 'readwrite');
    const s = tx.objectStore(store); for (const id of ids) s.delete(id); return done(tx);
  }
  /** Atomic multi-store write: ops = [{store, put?:obj, del?:id}] — all succeed or none. */
  async function batch(ops) {
    const db = await open(); const stores = [...new Set(ops.map((o) => o.store))];
    const tx = db.transaction(stores, 'readwrite');
    for (const o of ops) { const s = tx.objectStore(o.store); if (o.put) s.put(o.put); if (o.del) s.delete(o.del); }
    return done(tx);
  }
  /** Replace EVERYTHING atomically (used by restore and erase). */
  async function replaceAll(data) {
    const db = await open(); const tx = db.transaction(STORES, 'readwrite');
    for (const st of STORES) tx.objectStore(st).clear();
    for (const a of data.accounts || []) tx.objectStore('accounts').put(a);
    for (const c of data.categories || []) tx.objectStore('categories').put(c);
    for (const t of data.txns || []) tx.objectStore('txns').put(t);
    for (const k in (data.meta || {})) tx.objectStore('meta').put({ key: k, value: data.meta[k] });
    return done(tx);
  }
  async function loadAll() {
    const [accounts, categories, txns, metaRows] = await Promise.all(STORES.map(getAll));
    const meta = {}; for (const r of metaRows) meta[r.key] = r.value;
    return { accounts, categories, txns, meta };
  }
  const setMeta = (key, value) => put('meta', { key, value });

  root.DB = { open, getAll, put, putMany, del, delMany, batch, replaceAll, loadAll, setMeta };
})(self);
