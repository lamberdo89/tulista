/* assets/app.js - Lista compra local (sin servidor) */

const CATALOG_URL = "./products.json";

// Estado (localStorage)
const STATE_KEY = "shopping_state_v3";
const LOCAL_PRODUCTS_KEY = "local_products_v1";
const HISTORY_KEY = "shopping_history_v1";

let catalog = [];
let mode = "catalog";

let state = {
  checked: {},       // en lista de compra (modo super)
  qty: {},
  priceOverride: {},
  done: {}           // comprado (solo sentido en modo super)
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
    state.done = saved.done || {};
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

function isChecked(id) { return !!state.checked[id]; }
function setChecked(id, v) {
  state.checked[id] = !!v;
  if (state.checked[id] && !state.qty[id]) state.qty[id] = 1;
  if (!state.checked[id]) {
    // si lo quitas de la compra, también quita “comprado”
    delete state.done[id];
  }
}
function isDone(id) { return !!state.done[id]; }
function setDone(id, v) { state.done[id] = !!v; }

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
  let units = 0;

  for (const p of catalog) {
    const id = String(p.id);
    if (!isChecked(id)) continue;
    marked++;

    const q = getQty(id);
    units += q;

    const price = getPriceFor(id, p);
    if (price == null) continue;

    total += price * q;
  }

  return { marked, units, total };
}

// ---------- DOM ----------
const el = {
  tabCatalog: document.getElementById("tabCatalogo") || document.getElementById("tabCatalog"),
  tabSuper: document.getElementById("tabSuper"),

  btnReset: document.getElementById("btnReset"),
  btnAdd: document.getElementById("btnAdd"),
  btnHistory: document.getElementById("btnHistory"),
  btnFinish: document.getElementById("btnFinish"),
  btnPdf: document.getElementById("btnPdf"),

  search: document.getElementById("search"),
  list: document.getElementById("list"),
  badge: document.getElementById("badge"),

  totalBox: document.getElementById("totalBox"),
  totalValue: document.getElementById("totalValue"),
  footerTotal: document.getElementById("footerTotal"),

  superFooter: document.getElementById("superFooter"),
  superTools: document.getElementById("superTools"),
  toggleHideBought: document.getElementById("toggleHideBought"),

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

let hideBought = false;

// ---------- UI helpers ----------
// ✅ setMode (editado para “modo súper limpio”)
function setMode(newMode) {
  mode = newMode;

  // clases para CSS (body.mode-super / body.mode-catalog)
  document.body.classList.toggle("mode-super", mode === "super");
  document.body.classList.toggle("mode-catalog", mode === "catalog");

  // tabs
  if (el.tabCatalog) el.tabCatalog.classList.toggle("on", mode === "catalog");
  if (el.tabSuper) el.tabSuper.classList.toggle("on", mode === "super");

  // ✅ en modo súper NO queremos buscador
  if (el.search) {
    if (mode === "super") {
      el.search.value = "";
      el.search.style.display = "none";
    } else {
      el.search.style.display = "";
    }
  }

  // ✅ en modo súper NO queremos total “del medio”
  if (el.totalBox) el.totalBox.style.display = "none";

  // ✅ en modo súper NO queremos la barra de acciones (Reset/Añadir/Historial)
  const actionsBar = document.querySelector(".actionsBar");
  if (actionsBar) actionsBar.style.display = (mode === "super") ? "none" : "";

  // ✅ footer (barra inferior) solo en modo súper
  const superFooter = document.querySelector(".superFooter");
  if (superFooter) superFooter.style.display = (mode === "super") ? "" : "none";

  // finalizar compra (si aún lo usas)
  if (el.finishRow) el.finishRow.style.display = (mode === "super") ? "" : "none";

  render();
}

function updateHeader() {
  const { marked, units, total } = computeTotals();
  if (el.badge) el.badge.textContent = `Productos: ${marked} · Unidades: ${units} · Catálogo: ${catalog.length}`;
  if (el.totalValue) el.totalValue.textContent = euro(total);
  if (el.footerTotal) el.footerTotal.textContent = euro(total);
}

function openAddModal() {
  if (!el.addModal) return;
  el.addModal.style.display = "flex";
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

  el.priceModal.style.display = "flex";
  setTimeout(() => el.priceValue?.focus(), 50);
}
function closePriceModal() {
  if (!el.priceModal) return;
  el.priceModal.style.display = "none";
  editingPriceProductId = null;
}

function openHistoryModal() {
  if (!el.historyModal) return;
  el.historyModal.style.display = "flex";
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
    alert("No hay productos en la compra.");
    return;
  }

  const history = loadHistory();
  history.unshift(snap);
  saveHistory(history);

  state.checked = {};
  state.qty = {};
  state.done = {};
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
  state.done = {};

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
    el.historyList.innerHTML = `<div class="hint">No hay compras guardadas aún.</div>`;
    return;
  }

  el.historyList.innerHTML = "";

  history.forEach(h => {
    const wrap = document.createElement("div");
    wrap.style.border = "1px solid #e6e8ee";
    wrap.style.borderRadius = "16px";
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
      <div style="font-weight:1000;font-size:16px">Total: ${euro(Number(h.total) || 0)}</div>
      <div style="color:#6b7280;font-size:12px;font-weight:900">Productos: ${h.count} · ${formatDate(h.ts)}</div>
    `;

    const btns = document.createElement("div");
    btns.style.display = "flex";
    btns.style.gap = "8px";
    btns.style.flexWrap = "wrap";
    btns.style.justifyContent = "flex-end";

    const bRestore = document.createElement("button");
    bRestore.className = "btn add";
    bRestore.type = "button";
    bRestore.textContent = "Restaurar";
    bRestore.addEventListener("click", () => {
      closeHistoryModal();
      restorePurchase(h.ts);
    });

    const bDel = document.createElement("button");
    bDel.className = "btn reset";
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
    sum.style.fontWeight = "900";
    det.appendChild(sum);

    const list = document.createElement("div");
    list.style.marginTop = "10px";
    list.style.display = "grid";
    list.style.gap = "6px";

    (h.items || []).forEach(it => {
      const row = document.createElement("div");
      row.style.display = "flex";
      row.style.justifyContent = "space-between";
      row.style.gap = "10px";
      row.style.fontSize = "14px";

      const a = document.createElement("div");
      a.style.fontWeight = "900";
      a.textContent = `${it.qty}× ${it.name}`;

      const b = document.createElement("div");
      b.style.fontWeight = "1000";
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

// ---------- PDF (simple) ----------
function buildPrintHtml() {
  const { total } = computeTotals();

  const pending = [];
  const bought = [];

  for (const p of catalog) {
    const id = String(p.id);
    if (!isChecked(id)) continue;

    const qty = getQty(id);
    const price = getPriceFor(id, p);
    const line = {
      name: p.name,
      qty,
      price,
      subtotal: (price == null) ? null : Math.round(price * qty * 100) / 100,
      done: isDone(id)
    };

    (line.done ? bought : pending).push(line);
  }

  const rows = (arr) => arr.map(x => `
    <tr>
      <td style="width:34px">[ ]</td>
      <td><b>${x.name}</b><br><span style="color:#666;font-size:12px">Unidades: ${x.qty}${x.price==null ? "" : ` · Precio: ${euro(x.price)} · Subtotal: ${euro(x.subtotal)}`}</span></td>
    </tr>
  `).join("");

  const now = formatDate(Date.now());

  return `
<!doctype html>
<html><head><meta charset="utf-8">
<title>Lista de la compra</title>
<style>
  body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial;margin:24px;color:#111}
  h1{margin:0 0 6px 0}
  .meta{color:#666;font-size:12px;margin-bottom:16px}
  .total{font-size:18px;font-weight:900;margin:10px 0 18px 0}
  table{width:100%;border-collapse:collapse}
  tr{border-top:1px solid #e6e8ee}
  tr:first-child{border-top:0}
  td{padding:10px 0;vertical-align:top}
  h2{margin:18px 0 10px 0;font-size:14px;color:#666;text-transform:uppercase;letter-spacing:.3px}
</style>
</head>
<body>
  <h1>Lista de la compra</h1>
  <div class="meta">${now}</div>
  <div class="total">Total estimado: ${euro(total)}</div>

  <h2>Pendiente</h2>
  <table>${rows(pending)}</table>

  ${bought.length ? `<h2>Comprado</h2><table>${rows(bought)}</table>` : ""}

  <script>window.onload = () => window.print();</script>
</body></html>`;
}

function printPdf() {
  const html = buildPrintHtml();
  const w = window.open("", "_blank");
  if (!w) { alert("Bloqueado por el navegador. Permite popups para imprimir."); return; }
  w.document.open();
  w.document.write(html);
  w.document.close();
}

// ---------- Render ----------
function renderSectionTitle(text) {
  const li = document.createElement("li");
  li.className = "sectionTitle";
  li.textContent = text;
  return li;
}

function renderItem(p, { superMode }) {
  const id = String(p.id);
  const checked = isChecked(id);
  const qty = getQty(id);

  const price = getPriceFor(id, p);
  const hasPrice = price != null && Number.isFinite(price);

  const done = isDone(id);

  const li = document.createElement("li");
  li.className = "item" + (done ? " done" : "");

  const left = document.createElement("div");
  left.className = "left";

  // checkbox: en super = comprado; en catalogo = seleccionar compra
  const cb = document.createElement("input");
  cb.type = "checkbox";
  cb.className = "cb";

  if (superMode) cb.checked = done;
  else cb.checked = checked;

  cb.addEventListener("change", () => {
    if (superMode) {
      setDone(id, cb.checked);
    } else {
      setChecked(id, cb.checked);
    }
    saveState();
    render();
  });

  const textWrap = document.createElement("div");
  textWrap.className = "text";

  const name = document.createElement("div");
  name.className = "name";
  name.textContent = p.name;

  if (superMode && done) name.classList.add("checked");
  if (!superMode && checked) name.classList.add("checked");

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
  priceTag.className = "priceTag" + (!hasPrice ? " missing" : "");
  priceTag.textContent = hasPrice ? euro(price) : "—";
  priceTag.title = "Tocar para editar precio";
  priceTag.addEventListener("click", (ev) => { ev.stopPropagation(); openPriceModal(p); });
  right.appendChild(priceTag);

  // qty controls: en super siempre; en catalogo solo si marcado
  const showQtyControls = superMode || (mode === "catalog" && checked);
  if (showQtyControls) {
    const controls = document.createElement("div");
    controls.className = "qtyControls";

    const btnMinus = document.createElement("button");
    btnMinus.type = "button";
    btnMinus.className = "qtyBtn";
    btnMinus.textContent = "−";
    btnMinus.addEventListener("click", (ev) => {
      ev.stopPropagation();
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
    btnPlus.addEventListener("click", (ev) => {
      ev.stopPropagation();
      if (!isChecked(id)) setChecked(id, true);
      setQty(id, getQty(id) + 1);
      saveState();
      render();
    });

    controls.appendChild(btnMinus);
    controls.appendChild(qtyVal);
    controls.appendChild(btnPlus);

    right.appendChild(controls);

    if (superMode) {
      const subtotal = document.createElement("div");
      subtotal.className = "subtotal";
      subtotal.textContent = hasPrice ? euro(price * getQty(id)) : "—";
      right.appendChild(subtotal);

      // botón quitar de la compra
      const btnRemove = document.createElement("button");
      btnRemove.type = "button";
      btnRemove.className = "btnTiny danger";
      btnRemove.textContent = "🗑";
      btnRemove.title = "Quitar de la compra";
      btnRemove.addEventListener("click", (ev) => {
        ev.stopPropagation();
        setChecked(id, false);
        saveState();
        render();
      });
      right.appendChild(btnRemove);

      meta.textContent = `Unidades: ${getQty(id)}` + (done ? " · Comprado" : " · Pendiente");
    } else {
      meta.textContent = checked ? `Unidades: ${getQty(id)}` : "En catálogo";
    }
  }

  li.appendChild(left);
  li.appendChild(right);

  // click fila: en catálogo alterna selección; en súper alterna comprado
  li.addEventListener("click", (ev) => {
    const tag = (ev.target?.tagName || "").toUpperCase();
    if (tag === "BUTTON" || tag === "INPUT" || tag === "A" || tag === "SUMMARY") return;

    if (superMode) {
      setDone(id, !isDone(id));
    } else {
      setChecked(id, !isChecked(id));
    }
    saveState();
    render();
  });

  return li;
}

// ✅ render (editado para “modo súper limpio”: sin búsqueda en súper y sin totalBox)
function render() {
  if (!el.list) return;

  updateHeader();

  // ✅ en modo súper NO aplicamos búsqueda (porque la ocultamos)
  const q = (mode === "super") ? "" : norm(el.search?.value || "");

  // catálogo = todos, súper = solo seleccionados
  let items = catalog;
  if (mode === "super") items = items.filter(p => isChecked(String(p.id)));
  if (q) items = items.filter(p => matchesSearch(p, q));

  el.list.innerHTML = "";

  if (mode === "super") {
    const pending = items.filter(p => !isDone(String(p.id)));
    const bought = items.filter(p => isDone(String(p.id)));

    el.list.appendChild(renderSectionTitle(`Pendiente (${pending.length})`));
    if (pending.length === 0) {
      const li = document.createElement("li");
      li.className = "item";
      li.innerHTML = `<div class="left"><div class="text"><div class="name">Nada pendiente</div><div class="meta">Marca algo en catálogo o restaura una compra</div></div></div>`;
      el.list.appendChild(li);
    } else {
      pending.forEach(p => el.list.appendChild(renderItem(p, { superMode: true })));
    }

    if (!hideBought) {
      el.list.appendChild(renderSectionTitle(`Comprado (${bought.length})`));
      if (bought.length === 0) {
        const li = document.createElement("li");
        li.className = "item";
        li.innerHTML = `<div class="left"><div class="text"><div class="name">Nada comprado aún</div><div class="meta">Marca los productos conforme los vayas metiendo al carro</div></div></div>`;
        el.list.appendChild(li);
      } else {
        bought.forEach(p => el.list.appendChild(renderItem(p, { superMode: true })));
      }
    }

    return;
  }

  // modo catálogo
  if (items.length === 0) {
    const li = document.createElement("li");
    li.className = "item";
    li.innerHTML = `<div class="left"><div class="text"><div class="name">Sin resultados</div><div class="meta">Prueba otra búsqueda</div></div></div>`;
    el.list.appendChild(li);
    return;
  }

  items.forEach(p => el.list.appendChild(renderItem(p, { superMode: false })));
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

// ---------- Wire UI ----------
function wireUI() {
  document.addEventListener("click", (e) => {
    const t = e.target;

    if (t && t.id === "tabCatalogo") { e.preventDefault(); setMode("catalog"); return; }
    if (t && t.id === "tabSuper") { e.preventDefault(); setMode("super"); return; }

    if (t && t.id === "btnReset") {
      e.preventDefault();
      if (!confirm("¿Desmarcar todo?")) return;
      state.checked = {};
      state.qty = {};
      state.done = {};
      saveState();
      setMode("catalog");
      return;
    }

    if (t && t.id === "btnAdd") { e.preventDefault(); openAddModal(); return; }
    if (t && t.id === "btnCloseAdd") { e.preventDefault(); closeAddModal(); return; }

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

    if (t && t.id === "btnHistory") { e.preventDefault(); openHistoryModal(); return; }
    if (t && t.id === "btnCloseHistory") { e.preventDefault(); closeHistoryModal(); return; }
    if (t && t.id === "btnClearHistory") { e.preventDefault(); clearHistory(); return; }

    if (t && t.id === "btnFinish") { e.preventDefault(); finalizePurchase(); return; }
    if (t && t.id === "btnPdf") { e.preventDefault(); printPdf(); return; }

  }, true);

  el.search?.addEventListener("input", () => render());

  el.toggleHideBought?.addEventListener("change", () => {
    hideBought = !!el.toggleHideBought.checked;
    render();
  });

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
    alert("No se pudo cargar products.json.");
    return;
  }

  const { marked } = computeTotals();
  setMode(marked > 0 ? "super" : "catalog");
})();
