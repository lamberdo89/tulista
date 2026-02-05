// assets/db.js
(() => {
  const DB_NAME = "tulista_db";
  const DB_VER = 1;
  const STORE_PRODUCTS = "products";
  const STORE_STATE = "state";

  function openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VER);

      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_PRODUCTS)) {
          const s = db.createObjectStore(STORE_PRODUCTS, { keyPath: "id", autoIncrement: true });
          s.createIndex("name_lc", "name_lc", { unique: true });
        }
        if (!db.objectStoreNames.contains(STORE_STATE)) {
          db.createObjectStore(STORE_STATE, { keyPath: "productId" });
        }
      };

      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function tx(storeNames, mode, fn) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const t = db.transaction(storeNames, mode);
      const stores = storeNames.map(n => t.objectStore(n));
      let out;
      Promise.resolve(fn(...stores))
        .then(r => { out = r; })
        .catch(reject);

      t.oncomplete = () => resolve(out);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    });
  }

  function lc(s){ return (s || "").trim().toLowerCase(); }

  async function seedIfEmpty(defaultNames = []) {
    const count = await tx([STORE_PRODUCTS], "readonly", (p) => new Promise((res, rej) => {
      const req = p.count();
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error);
    }));
    if (count > 0) return;

    await tx([STORE_PRODUCTS], "readwrite", (p) => {
      defaultNames.forEach(name => {
        const n = (name || "").trim();
        if (!n) return;
        p.add({ name: n, name_lc: lc(n), price: null });
      });
    });
  }

  async function getAll() {
    const products = await tx([STORE_PRODUCTS], "readonly", (p) => new Promise((res, rej) => {
      const req = p.getAll();
      req.onsuccess = () => res(req.result || []);
      req.onerror = () => rej(req.error);
    }));

    const state = await tx([STORE_STATE], "readonly", (s) => new Promise((res, rej) => {
      const req = s.getAll();
      req.onsuccess = () => res(req.result || []);
      req.onerror = () => rej(req.error);
    }));

    const map = new Map(state.map(x => [x.productId, x]));
    return products
      .map(p => {
        const st = map.get(p.id);
        return {
          id: p.id,
          name: p.name,
          price: p.price,
          is_checked: st ? !!st.is_checked : false,
          qty: st?.qty ?? 1,
          updated_at: st?.updated_at ?? null,
        };
      })
      .sort((a,b) => (b.is_checked - a.is_checked) || a.name.localeCompare(b.name, "es"));
  }

  async function addProduct(name) {
    const n = (name || "").trim();
    if (!n) return;

    // si existe por name_lc, no duplicar
    const existing = await tx([STORE_PRODUCTS], "readonly", (p) => new Promise((res, rej) => {
      const idx = p.index("name_lc");
      const req = idx.get(lc(n));
      req.onsuccess = () => res(req.result || null);
      req.onerror = () => rej(req.error);
    }));

    let id;
    if (existing) {
      id = existing.id;
    } else {
      id = await tx([STORE_PRODUCTS], "readwrite", (p) => new Promise((res, rej) => {
        const req = p.add({ name: n, name_lc: lc(n), price: null });
        req.onsuccess = () => res(req.result);
        req.onerror = () => rej(req.error);
      }));
    }

    // marcar en state
    await tx([STORE_STATE], "readwrite", (s) => {
      s.put({ productId: id, is_checked: true, qty: 1, updated_at: new Date().toISOString() });
    });
  }

  async function setChecked(id, checked) {
    await tx([STORE_STATE], "readwrite", (s) => new Promise((res) => {
      s.get(id).onsuccess = (e) => {
        const cur = e.target.result || { productId: id, qty: 1 };
        const next = {
          ...cur,
          is_checked: !!checked,
          qty: checked ? (cur.qty ?? 1) : 1,
          updated_at: new Date().toISOString()
        };
        s.put(next);
        res();
      };
    }));
  }

  async function toggleChecked(id) {
    await tx([STORE_STATE], "readwrite", (s) => new Promise((res) => {
      s.get(id).onsuccess = (e) => {
        const cur = e.target.result || { productId: id, is_checked: false, qty: 1 };
        const nextChecked = !cur.is_checked;
        s.put({
          productId: id,
          is_checked: nextChecked,
          qty: nextChecked ? (cur.qty ?? 1) : 1,
          updated_at: new Date().toISOString()
        });
        res();
      };
    }));
  }

  async function resetAll() {
    const all = await tx([STORE_STATE], "readonly", (s) => new Promise((res, rej) => {
      const req = s.getAll();
      req.onsuccess = () => res(req.result || []);
      req.onerror = () => rej(req.error);
    }));
    await tx([STORE_STATE], "readwrite", (s) => {
      all.forEach(row => s.put({ ...row, is_checked: false, qty: 1, updated_at: new Date().toISOString() }));
    });
  }
async function setPrice(id, price) {
  const n = (price === "" || price == null) ? null : Number(price);
  if (n != null && (Number.isNaN(n) || n < 0)) return;

  await tx([STORE_PRODUCTS], "readwrite", (p) => new Promise((res, rej) => {
    const req = p.get(id);
    req.onsuccess = () => {
      const row = req.result;
      if (!row) return res();
      row.price = (n == null) ? null : n;
      row.name_lc = row.name_lc || lc(row.name);
      const put = p.put(row);
      put.onsuccess = () => res();
      put.onerror = () => rej(put.error);
    };
    req.onerror = () => rej(req.error);
  }));
}

// assets/db.js
window.LocalDB = {
  get(key, fallback = null) {
    try {
      const raw = localStorage.getItem(key);
      if (raw == null) return fallback;
      return JSON.parse(raw);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  },
  del(key) {
    localStorage.removeItem(key);
  }
};


  window.DB = {
    seedIfEmpty,
    getAll,
    addProduct,
    setChecked,
    toggleChecked,
    resetAll,
    setPrice,
  };
})();
