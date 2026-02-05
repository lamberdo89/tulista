/* assets/app.js - Lista compra local (sin servidor) */

const CATALOG_URL = "./products.json";

// Estado (localStorage)
const STATE_KEY = "shopping_state_v2";
const LOCAL_PRODUCTS_KEY = "local_products_v1";
const HISTORY_KEY = "shopping_history_v1"; // historial

let catalog = []; // [{id,name,price}]
let mode = "catalog"; // "catalog" | "super"

let state = {
  checked: {},
  qty: {},
  priceOverride: {}
};

let localProducts = [];
let editingPriceProductId = null;

// ---------- Utils ----------
function euro(n) {
  if (n == null || Number.isNaN(n)) return "—";
  return n.toLocaleString("es-ES", { style: "currency", currency: "EUR" });
}
function norm(s) {
  return (s || "").toString().trim().toLowerCase().replace(/\s+/g, " ");
}
function titleCase(s) {
  const t = (s || "").trim();
  if (!t) return t;
  return t.charAt(0).toUpperCase() + t.slice(1);
}
function toPrice(v) {
  if (v == null || v === "") return null;
  const n = Number(String(v).replace(",", "."));
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100) / 100;
}
function formatDate(ts) {
  const d = new Date(ts);
  return d.toLocaleString("es-ES", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function loadState() {
  const saved = window.LocalDB.get(STATE_KEY, null);
  if (saved && typeof saved === "object") {
    state.checked = saved.checked || {};
    state.qty = saved.qty || {};
    state.priceOverride = saved.priceOverride || {};
  }
}
function saveState() {
  window.LocalDB.set(STATE_KEY, state);
}
function loadLocalProducts() {
  const saved = window.LocalDB.get(LOCAL_PRODUCTS_KEY, []);
  localProducts = Array.isArray(saved) ? saved : [];
}
function saveLocalProducts() {
  window.LocalDB.set(LOCAL_PRODUCTS_KEY, localProducts);
}
function loadHistory() {
  const h = window.LocalDB.get(HISTORY_KEY, []);
  return Array.isArray(h) ? h : [];
}
function saveHistory(h) {
  window.LocalDB.set(HISTORY_KEY, h);
}

function isChecked(id) {
  return !!state.checked[id];
}
function setChecked(id, v) {
  state.checked[id] = !!v;
  if (state.checked[id] && !state.qty[id]) state.qty[id] = 1;
}
function getQty(id) {
  const q = Number(state.qty[id]);
  return Number.isFinite(q) && q >= 1 ? Math.floor(q) : 1;
}
function setQty(id, q) {
  const v = Math.max(1, Math.floor(Number(q) || 1));
  state.qty[id] = v;
}
function getPriceFor(id, product) {
  if (state.priceOverride && Object.prototype.hasOwnProperty.call(state.priceOverride, id)) {
    const v = state.priceOverride[id];
    const n = Number(v);
    return (v === null || v === "" || Number.isNaN(n)) ? null : n;
  }
  const n = Number(product.price);
  return (product.price === null || product.price === "" || Number.isNaN(n)) ? null : n;
}

function computeTotals() {
  let marked = 0;
  let total = 0;

  for (const p of catalog) {
    const id = String(p.id);
    if (!isChecked(id)) continue;
    marked++;

    const price = getPriceFor(id, p);
    if (price == null) continue;

    total += price * getQty(id);
  }
  return { marked, total };
}

// ---------- DOM ----------
const el = {
  tabCatalog: document.getElementById("tabCatalogo") || document.getElementById("tabCatalog"),
  tabSuper: document.getElementById("tabSuper"),

  btnMic: document.getElementById("btnMic"),
  btnReset: document.getElementById("btnReset"),
  btnAdd: document.getElementById("btnAdd"),
  btnHistory: document.getElementById("btnHistory"),
  btnFinish: document.getElementById("btnFinish"),

  finishRow: document.getElementById("finishRow"),

  search: document.getElementById("search"),
  list: document.getElementById("list"),
  badge: document.getElementById("badge"),

  totalBox: document.getElementById("totalBox"),
  totalValue: document.getElementById("totalValue"),

  addModal: document.getElementById("addModal"),
  addName: document.getElementById("addName"),
  addQty: document.getElementById("addQty"),
  addPrice: document.getElementById("addPrice"),
  btnCloseAdd: document.getElementById("btnCloseAdd"),
  btnSaveAdd: document.getElementById("btnSaveAdd"),

  priceModal: document.getElementById("priceModal"),
  priceTitle: document.getElementById("priceTitle"),
  priceValue: document.getElementById("priceValue"),
  btnClosePrice: document.getElementById("btnClosePrice"),
  btnSavePrice: document.getElementById("btnSavePrice"),

  historyModal: document.getElementById("historyModal"),
  historyList: document.getElementById("historyList"),
  btnCloseHistory: document.getElementById("btnCloseHistory"),
  btnClearHistory: document.getElementById("btnClearHistory"),
};

// ---------- UI helpers ----------
function setMode(newMode) {
  mode = newMode;

  if (el.tabCatalog) el.tabCatalog.classList.toggle("on", mode === "catalog");
  if (el.tabSuper) el.tabSuper.classList.toggle("on", mode === "super");

  if (el.totalBox) el.totalBox.style.display = (mode === "super") ? "" : "none";
  if (el.finishRow) el.finishRow.style.display = (mode === "super") ? "" : "none";

  if (el.search) el.search.value = "";
  render();
}

function updateHeader() {
  const { marked, total } = computeTotals();
  if (el.badge) el.badge.textContent = `Marcados: ${marked} · Total: ${catalog.length}`;
  if (el.totalValue) el.totalValue.textContent = euro(total);
  if (el.totalBox) el.totalBox.style.display = (mode === "super") ? "" : "none";
  if (el.finishRow) el.finishRow.style.display = (mode === "super") ? "" : "none";
}

function openAddModal() {
  if (!el.addModal) return;
  el.addModal.style.display = "block";
  if (el.addQty) el.addQty.value = "1";
  if (el.addPrice) el.addPrice.value = "";
  setTimeout(() => el.addName?.focus(), 50);
}
function closeAddModal() {
  if (!el.addModal) return;
  el.addModal.style.display = "none";
}
function openPriceModal(product) {
  if (!el.priceModal) return;
  editingPriceProductId = String(product.id);

  const current = getPriceFor(editingPriceProductId, product);
  if (el.priceTitle) el.priceTitle.textContent = `Precio: ${product.name}`;
  if (el.priceValue) el.priceValue.value = (current == null) ? "" : String(current);

  el.priceModal.style.display = "block";
  setTimeout(() => el.priceValue?.focus(), 50);
}
function closePriceModal() {
  if (!el.priceModal) return;
  el.priceModal.style.display = "none";
  editingPriceProductId = null;
}

function openHistoryModal() {
  if (!el.historyModal) return;
  el.historyModal.style.display = "block";
  renderHistory();
}
function closeHistoryModal() {
  if (!el.historyModal) return;
  el.historyModal.style.display = "none";
}

function matchesSearch(p, q) {
  if (!q) return true;
  return norm(p.name).includes(q);
}

// ---------- Catalog helpers ----------
function findByName(name) {
  const key = norm(name);
  return catalog.find(p => norm(p.name) === key) || null;
}
function nextLocalId() {
  let maxId = 0;
  for (const p of catalog) maxId = Math.max(maxId, Number(p.id) || 0);
  for (const p of localProducts) maxId = Math.max(maxId, Number(p.id) || 0);
  return maxId + 1;
}
function createLocalProduct(name) {
  const prod = { id: nextLocalId(), name: titleCase(name), price: null };
  localProducts.push(prod);
  saveLocalProducts();
  catalog.push(prod);
  catalog.sort((a, b) => norm(a.name).localeCompare(norm(b.name), "es"));
  return prod;
}

// ---------- Historial ----------
function buildCurrentPurchaseSnapshot() {
  const items = [];
  let total = 0;

  for (const p of catalog) {
    const id = String(p.id);
    if (!isChecked(id)) continue;

    const qty = getQty(id);
    const price = getPriceFor(id, p);
    const subtotal = (price == null) ? null : Math.round(price * qty * 100) / 100;

    if (subtotal != null) total += subtotal;

    items.push({
      id: p.id,
      name: p.name,
      qty,
      price,
      subtotal
    });
  }

  return {
    ts: Date.now(),
    count: items.length,
    total: Math.round(total * 100) / 100,
    items
  };
}

function finalizePurchase() {
  const snap = buildCurrentPurchaseSnapshot();
  if (snap.count === 0) {
    alert("No hay productos marcados.");
    return;
  }

  const history = loadHistory();
  history.unshift(snap);
  saveHistory(history);

  state.checked = {};
  state.qty = {};
  saveState();

  setMode("catalog");
  openHistoryModal();
}

function restorePurchase(ts) {
  const history = loadHistory();
  const found = history.find(h => String(h.ts) === String(ts));
  if (!found) return;

  state.checked = {};
  state.qty = {};

  for (const it of found.items) {
    let p = catalog.find(x => String(x.id) === String(it.id)) || findByName(it.name);
    if (!p) p = createLocalProduct(it.name);

    const id = String(p.id);
    setChecked(id, true);
    setQty(id, Math.max(1, it.qty || 1));
    if (it.price != null) state.priceOverride[id] = it.price;
  }

  saveState();
  setMode("super");
}

function deleteHistoryItem(ts) {
  const history = loadHistory().filter(h => String(h.ts) !== String(ts));
  saveHistory(history);
  renderHistory();
}

function clearHistory() {
  if (!confirm("¿Borrar todo el historial?")) return;
  saveHistory([]);
  renderHistory();
}

function renderHistory() {
  if (!el.historyList) return;

  const history = loadHistory();
  if (history.length === 0) {
    el.historyList.innerHTML = `<div class="hint" style="margin-top:12px;color:#666;font-size:12px">No hay compras guardadas aún.</div>`;
    return;
  }

  el.historyList.innerHTML = "";

  history.forEach(h => {
    const wrap = document.createElement("div");
    wrap.style.border = "1px solid #e6e8ee";
    wrap.style.borderRadius = "12px";
    wrap.style.padding = "12px";
    wrap.style.marginBottom = "10px";
    wrap.style.background = "#fff";

    const top = document.createElement("div");
    top.style.display = "flex";
    top.style.justifyContent = "space-between";
    top.style.gap = "10px";
    top.style.alignItems = "center";

    const left = document.createElement("div");
    left.innerHTML = `
      <div style="font-weight:700">${formatDate(h.ts)}</div>
      <div style="color:#666;font-size:12px">Productos: ${h.count} · Total: ${euro(Number(h.total) || 0)}</div>
    `;

    const btns = document.createElement("div");
    btns.style.display = "flex";
    btns.style.gap = "8px";
    btns.style.flexWrap = "wrap";
    btns.style.justifyContent = "flex-end";

    const bRestore = document.createElement("button");
    bRestore.className = "btn primary";
    bRestore.type = "button";
    bRestore.textContent = "Restaurar";
    bRestore.addEventListener("click", () => {
      closeHistoryModal();
      restorePurchase(h.ts);
    });

    const bDel = document.createElement("button");
    bDel.className = "btn";
    bDel.type = "button";
    bDel.textContent = "Borrar";
    bDel.addEventListener("click", () => deleteHistoryItem(h.ts));

    btns.appendChild(bRestore);
    btns.appendChild(bDel);

    top.appendChild(left);
    top.appendChild(btns);

    const det = document.createElement("details");
    det.style.marginTop = "10px";
    const sum = document.createElement("summary");
    sum.textContent = "Ver detalle";
    sum.style.cursor = "pointer";
    sum.style.color = "#111";
    det.appendChild(sum);

    const list = document.createElement("div");
    list.style.marginTop = "8px";
    list.style.display = "grid";
    list.style.gap = "6px";

    (h.items || []).forEach(it => {
      const row = document.createElement("div");
      row.style.display = "flex";
      row.style.justifyContent = "space-between";
      row.style.gap = "10px";
      row.style.fontSize = "14px";

      const a = document.createElement("div");
      a.textContent = `${it.qty}× ${it.name}`;

      const b = document.createElement("div");
      b.style.fontWeight = "700";
      b.textContent = (it.subtotal == null) ? "—" : euro(Number(it.subtotal));

      row.appendChild(a);
      row.appendChild(b);
      list.appendChild(row);
    });

    det.appendChild(list);

    wrap.appendChild(top);
    wrap.appendChild(det);

    el.historyList.appendChild(wrap);
  });
}

// ---------- Render (fila clicable + qty en catálogo cuando está marcado) ----------
function render() {
  if (!el.list) return;

  updateHeader();

  const q = norm(el.search?.value || "");
  let items = catalog;

  if (mode === "super") items = items.filter(p => isChecked(String(p.id)));
  if (q) items = items.filter(p => matchesSearch(p, q));

  el.list.innerHTML = "";

  if (mode === "super" && items.length === 0) {
    const li = document.createElement("li");
    li.className = "empty";
    li.textContent = "No hay productos marcados.";
    el.list.appendChild(li);
    return;
  }

  for (const p of items) {
    const id = String(p.id);
    const checked = isChecked(id);
    const qty = getQty(id);

    const price = getPriceFor(id, p);
    const hasPrice = price != null && Number.isFinite(price);

    const li = document.createElement("li");
    li.className = "item";

    // Tap en la fila (excepto botones/inputs) => marcar/desmarcar
    li.addEventListener("click", (ev) => {
      const target = ev.target;
      const tag = (target?.tagName || "").toUpperCase();
      if (tag === "BUTTON" || tag === "INPUT" || tag === "A" || tag === "SUMMARY") return;

      setChecked(id, !isChecked(id));
      if (isChecked(id) && !state.qty[id]) state.qty[id] = 1;
      saveState();
      render();
    });

    const left = document.createElement("div");
    left.className = "left";

    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.className = "cb";
    cb.checked = checked;
    cb.addEventListener("change", () => {
      setChecked(id, cb.checked);
      saveState();
      render();
    });

    const textWrap = document.createElement("div");
    textWrap.className = "text";

    const name = document.createElement("div");
    name.className = "name";
    name.textContent = p.name;
    if (checked) name.classList.add("checked");

    const meta = document.createElement("div");
    meta.className = "meta";
    meta.textContent = checked ? `Unidades: ${qty}` : "En catálogo";

    textWrap.appendChild(name);
    textWrap.appendChild(meta);

    left.appendChild(cb);
    left.appendChild(textWrap);

    const right = document.createElement("div");
    right.className = "right";

    const priceTag = document.createElement("button");
    priceTag.type = "button";
    priceTag.className = "priceTag";
    priceTag.textContent = hasPrice ? euro(price) : "—";
    if (!hasPrice) priceTag.classList.add("missing");
    priceTag.title = "Tocar para editar precio";
    priceTag.addEventListener("click", () => openPriceModal(p));
    right.appendChild(priceTag);

    // Controles: en súper siempre; en catálogo solo si está marcado
    const showQtyControls = (mode === "super") || (mode === "catalog" && checked);

    if (showQtyControls) {
      const controls = document.createElement("div");
      controls.className = "qtyControls";

      const btnMinus = document.createElement("button");
      btnMinus.type = "button";
      btnMinus.className = "qtyBtn";
      btnMinus.textContent = "−";
      btnMinus.addEventListener("click", () => {
        const current = getQty(id);
        const next = current - 1;

        if (next <= 0) {
          setChecked(id, false);
          delete state.qty[id];
        } else {
          setQty(id, next);
        }

        saveState();
        render();
      });

      const qtyVal = document.createElement("div");
      qtyVal.className = "qtyVal";
      qtyVal.textContent = String(getQty(id));

      const btnPlus = document.createElement("button");
      btnPlus.type = "button";
      btnPlus.className = "qtyBtn";
      btnPlus.textContent = "+";
      btnPlus.addEventListener("click", () => {
        if (!isChecked(id)) setChecked(id, true);
        setQty(id, getQty(id) + 1);
        saveState();
        render();
      });

      controls.appendChild(btnMinus);
      controls.appendChild(qtyVal);
      controls.appendChild(btnPlus);

      right.appendChild(controls);

      if (mode === "super") {
        const subtotal = document.createElement("div");
        subtotal.className = "subtotal";
        subtotal.textContent = hasPrice ? euro(price * getQty(id)) : "—";
        right.appendChild(subtotal);
        meta.textContent = `Unidades: ${getQty(id)}`;
      } else {
        meta.textContent = `Unidades: ${getQty(id)}`;
      }
    }

    li.appendChild(left);
    li.appendChild(right);
    el.list.appendChild(li);
  }
}

// ---------- Load catalog ----------
async function loadCatalog() {
  const res = await fetch(CATALOG_URL, { cache: "no-store" });
  if (!res.ok) throw new Error("No se pudo cargar products.json");
  const data = await res.json();

  const arr = Array.isArray(data) ? data : [];
  const base = arr
    .filter(x => x && typeof x === "object" && x.name)
    .map((x, i) => ({
      id: (x.id != null ? x.id : i + 1),
      name: String(x.name),
      price: toPrice(x.price)
    }));

  loadLocalProducts();
  const merged = [...base];

  for (const lp of localProducts) {
    if (!merged.some(p => norm(p.name) === norm(lp.name))) merged.push(lp);
  }

  catalog = merged.sort((a, b) => norm(a.name).localeCompare(norm(b.name), "es"));

  for (const p of catalog) {
    const id = String(p.id);
    if (isChecked(id) && !state.qty[id]) state.qty[id] = 1;
  }
}

// ---------- Wire UI (SIN CAMBIAR LO DEMÁS, solo btnSaveAdd actualizado) ----------
function wireUI() {
  document.addEventListener("click", (e) => {
    const t = e.target;

    if (t && (t.id === "tabCatalogo" || t.id === "tabCatalog")) { e.preventDefault(); setMode("catalog"); return; }
    if (t && t.id === "tabSuper") { e.preventDefault(); setMode("super"); return; }

    if (t && t.id === "btnReset") {
      e.preventDefault();
      if (!confirm("¿Desmarcar todo?")) return;
      state.checked = {};
      state.qty = {};
      saveState();
      setMode("catalog");
      return;
    }

    // (si tienes micro, lo mantienes; si no, puedes borrar este if)
    if (t && t.id === "btnMic") { e.preventDefault(); /* runVoice(); */ return; }

    if (t && t.id === "btnAdd") { e.preventDefault(); openAddModal(); return; }
    if (t && t.id === "btnCloseAdd") { e.preventDefault(); closeAddModal(); return; }

    // ✅ AQUÍ VA TU CAMBIO: btnSaveAdd con qty + price
    if (t && t.id === "btnSaveAdd") {
      e.preventDefault();

      const nameRaw = (el.addName?.value || "").trim();
      if (!nameRaw) return;

      const qtyRaw = (el.addQty?.value || "1").trim();
      const qty = Math.max(1, parseInt(qtyRaw, 10) || 1);

      const priceRaw = (el.addPrice?.value || "").trim();
      const price = toPrice(priceRaw === "" ? null : priceRaw);

      let p = findByName(nameRaw);
      if (!p) p = createLocalProduct(nameRaw);

      const id = String(p.id);
      setChecked(id, true);
      setQty(id, qty);

      if (price != null) state.priceOverride[id] = price;

      saveState();

      if (el.addName) el.addName.value = "";
      if (el.addQty) el.addQty.value = "1";
      if (el.addPrice) el.addPrice.value = "";

      closeAddModal();
      setMode("super");
      return;
    }

    if (t && t.id === "btnClosePrice") { e.preventDefault(); closePriceModal(); return; }
    if (t && t.id === "btnSavePrice") {
      e.preventDefault();
      if (!editingPriceProductId) return;

      const raw = (el.priceValue?.value || "").trim();
      const price = toPrice(raw === "" ? null : raw);
      state.priceOverride[editingPriceProductId] = (price == null) ? null : price;

      saveState();
      closePriceModal();
      render();
      return;
    }

    // Historial
    if (t && t.id === "btnHistory") { e.preventDefault(); openHistoryModal(); return; }
    if (t && t.id === "btnCloseHistory") { e.preventDefault(); closeHistoryModal(); return; }
    if (t && t.id === "btnClearHistory") { e.preventDefault(); clearHistory(); return; }

    // Finalizar compra
    if (t && t.id === "btnFinish") { e.preventDefault(); finalizePurchase(); return; }

  }, true);

  el.search?.addEventListener("input", () => render());

  el.addModal?.addEventListener("click", (e) => { if (e.target === el.addModal) closeAddModal(); });
  el.priceModal?.addEventListener("click", (e) => { if (e.target === el.priceModal) closePriceModal(); });
  el.historyModal?.addEventListener("click", (e) => { if (e.target === el.historyModal) closeHistoryModal(); });
}

// ---------- Init ----------
(async function init() {
  loadState();
  wireUI();

  try {
    await loadCatalog();
  } catch {
    alert("No se pudo cargar products.json. Asegúrate de abrir con Live Server y que products.json está al lado de index.html.");
    return;
  }

  const { marked } = computeTotals();
  setMode(marked > 0 ? "super" : "catalog");
})();
