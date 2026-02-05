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

let hideBought = false;

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

// Fechas stats
function startOfMonthTs() {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}
function sumHistoryBetween(tsFrom, tsTo) {
  const history = loadHistory();
  let compras = 0;
  let total = 0;
  let productos = 0;

  for (const h of history) {
    const ts = Number(h.ts);
    if (!Number.isFinite(ts)) continue;
    if (ts < tsFrom || ts >= tsTo) continue;
    compras += 1;
    total += Number(h.total) || 0;
    productos += Number(h.count) || 0;
  }

  const media = compras > 0 ? (total / compras) : 0;

  return {
    compras,
    total: Math.round(total * 100) / 100,
    productos,
    media: Math.round(media * 100) / 100
  };
}

// ---------- Storage ----------
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

// ---------- State helpers ----------
function isChecked(id) { return !!state.checked[id]; }
function setChecked(id, v) {
  state.checked[id] = !!v;
  if (state.checked[id] && !state.qty[id]) state.qty[id] = 1;
  if (!state.checked[id]) {
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

  btnStats: document.getElementById("btnStats"),
  statsModal: document.getElementById("statsModal"),
  statsBody: document.getElementById("statsBody"),
  btnCloseStats: document.getElementById("btnCloseStats"),
};

// ---------- UI helpers ----------
function setMode(newMode) {
  mode = newMode;

  document.body.classList.toggle("mode-super", mode === "super");
  document.body.classList.toggle("mode-catalog", mode === "catalog");

  // tabs activos
  if (el.tabCatalog) el.tabCatalog.classList.toggle("on", mode === "catalog");
  if (el.tabSuper) el.tabSuper.classList.toggle("on", mode === "super");

  // mostrar/ocultar navegación
  const tabs = document.getElementById("tabs");
  const superNav = document.getElementById("superNav");
  if (tabs) tabs.style.display = (mode === "super") ? "none" : "";
  if (superNav) superNav.style.display = (mode === "super") ? "" : "none";

  // buscador solo en catálogo
  if (el.search) {
    if (mode === "super") {
      el.search.value = "";
      el.search.style.display = "none";
    } else {
      el.search.style.display = "";
    }
  }

  // ocultar total del medio siempre (ya lo querías fuera)
  if (el.totalBox) el.totalBox.style.display = "none";

  // actionsBar solo en catálogo
  const actionsBar = document.querySelector(".actionsBar");
  if (actionsBar) actionsBar.style.display = (mode === "super") ? "none" : "";

  // footer inferior solo en súper
  if (el.superFooter) el.superFooter.style.display = (mode === "super") ? "" : "none";

  render();
}


function updateHeader() {
  const { total } = computeTotals();

  // Topbar: SIN contadores (limpio)
  if (el.badge) el.badge.textContent = "";

  // Footer inferior (modo súper)
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

function openStatsModal() {
  if (!el.statsModal) return;
  el.statsModal.style.display = "flex";
  renderStats();
}
function closeStatsModal() {
  if (!el.statsModal) return;
  el.statsModal.style.display = "none";
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

    items.push({ id: p.id, name: p.name, qty, price, subtotal });
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
    el.historyList.innerHTML = `
      <div class="hint" style="margin-top:12px">
        Aún no hay compras guardadas. En modo súper pulsa <b>Finalizar compra</b>.
      </div>`;
    return;
  }

  el.historyList.innerHTML = "";

  history.forEach(h => {
    const card = document.createElement("div");
    card.className = "historyCard";

    const top = document.createElement("div");
    top.className = "historyTop";

    const main = document.createElement("div");
    main.className = "historyMain";

    const title = document.createElement("div");
    title.className = "historyTitle";
    title.textContent = "Compra guardada";

    const numbers = document.createElement("div");
    numbers.className = "historyNumbers";

    const total = document.createElement("div");
    total.className = "historyTotal";
    total.textContent = euro(Number(h.total) || 0);

    const count = document.createElement("div");
    count.className = "historyCount";
    count.textContent = `${h.count} productos`;

    numbers.appendChild(total);
    numbers.appendChild(count);

    const date = document.createElement("div");
    date.className = "historyDate";
    date.textContent = formatDate(h.ts);

    main.appendChild(title);
    main.appendChild(numbers);
    main.appendChild(date);

    const actions = document.createElement("div");
    actions.className = "historyActions";

    const btnView = document.createElement("button");
    btnView.type = "button";
    btnView.className = "btn small view";
    btnView.textContent = "Ver detalle";

    const btnDel = document.createElement("button");
    btnDel.type = "button";
    btnDel.className = "btn small delete";
    btnDel.textContent = "Borrar";
    btnDel.addEventListener("click", () => deleteHistoryItem(h.ts));

    actions.appendChild(btnView);
    actions.appendChild(btnDel);

    top.appendChild(main);
    top.appendChild(actions);

    const details = document.createElement("div");
    details.className = "historyDetails";

    const items = Array.isArray(h.items) ? h.items : [];
    if (items.length === 0) {
      details.innerHTML = `<div class="hint">Sin detalle de productos.</div>`;
    } else {
      items.forEach(it => {
        const row = document.createElement("div");
        row.className = "historyRow";

        const a = document.createElement("div");
        a.className = "historyRowName";
        a.textContent = `${it.qty}× ${it.name}`;

        const b = document.createElement("div");
        b.className = "historyRowPrice";
        b.textContent = (it.subtotal == null) ? "—" : euro(Number(it.subtotal));

        row.appendChild(a);
        row.appendChild(b);
        details.appendChild(row);
      });
    }

    btnView.addEventListener("click", () => {
      const on = details.classList.toggle("on");
      btnView.textContent = on ? "Ocultar" : "Ver detalle";
    });

    card.appendChild(top);
    card.appendChild(details);

    el.historyList.appendChild(card);
  });
}

// ---------- Stats ----------
// (OPCIONAL) Si quieres que Stats use estas clases y no estilos inline,
// sustituye tu renderStats() por este:

function renderStats() {
  if (!el.statsBody) return;

  const now = Date.now();
  const last30From = now - 30 * 24 * 60 * 60 * 1000;
  const monthFrom = startOfMonthTs();

  const last30 = sumHistoryBetween(last30From, now);
  const month = sumHistoryBetween(monthFrom, now);

  const box = (title, s) => `
    <div class="statsCard">
      <div class="statsCardTitle">${title}</div>
      <div class="statsRow">
        <div class="statsKpi">
          <div class="statsKpiLabel">Total gastado</div>
          <div class="statsKpiValue">${euro(s.total)}</div>
        </div>
        <div class="statsKpi">
          <div class="statsKpiLabel">Compras</div>
          <div class="statsKpiValue">${s.compras}</div>
        </div>
        <div class="statsKpi">
          <div class="statsKpiLabel">Productos (total)</div>
          <div class="statsKpiValue">${s.productos}</div>
        </div>
        <div class="statsKpi">
          <div class="statsKpiLabel">Media por compra</div>
          <div class="statsKpiValue">${euro(s.media)}</div>
        </div>
      </div>
    </div>
  `;

  el.statsBody.innerHTML = `
    <div class="statsGrid">
      ${box("Últimos 30 días", last30)}
      ${box("Mes actual", month)}
    </div>
  `;
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

// ---------- Render helpers ----------
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

  if (!superMode && checked) li.classList.add("selected");

  const left = document.createElement("div");
  left.className = "left";

  const cb = document.createElement("input");
  cb.type = "checkbox";
  cb.className = "cb";
  cb.checked = superMode ? done : checked;

  cb.addEventListener("change", () => {
    if (superMode) setDone(id, cb.checked);
    else setChecked(id, cb.checked);

    saveState();
    render();
  });

  const textWrap = document.createElement("div");
  textWrap.className = "text";

  const name = document.createElement("div");
  name.className = "name";
  name.textContent = p.name;

  // En súper: tachado solo si "done". En catálogo: NO tachamos (solo .selected de fondo)
  if (superMode && done) name.classList.add("checked");

  const meta = document.createElement("div");
  meta.className = "meta";
  meta.textContent = checked ? `Unidades: ${qty}` : "En catálogo";

  textWrap.appendChild(name);
  textWrap.appendChild(meta);

  left.appendChild(cb);
  left.appendChild(textWrap);

  const right = document.createElement("div");
  right.className = "right";

  // Precio: oculto en súper por CSS, pero lo dejamos aquí para catálogo
  const priceTag = document.createElement("button");
  priceTag.type = "button";
  priceTag.className = "priceTag" + (!hasPrice ? " missing" : "");
  priceTag.textContent = hasPrice ? euro(price) : "—";
  priceTag.title = "Tocar para editar precio";
  priceTag.addEventListener("click", (ev) => { ev.stopPropagation(); openPriceModal(p); });
  right.appendChild(priceTag);

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

      // meta en súper no lo quieres (CSS lo oculta), así que da igual
      meta.textContent = `Unidades: ${getQty(id)}`;
    } else {
      meta.textContent = checked ? `Unidades: ${getQty(id)}` : "En catálogo";
    }
  }

  li.appendChild(left);
  li.appendChild(right);

  li.addEventListener("click", (ev) => {
    const tag = (ev.target?.tagName || "").toUpperCase();
    if (tag === "BUTTON" || tag === "INPUT" || tag === "A" || tag === "SUMMARY") return;

    if (superMode) setDone(id, !isDone(id));
    else setChecked(id, !isChecked(id));

    saveState();
    render();
  });

  return li;
}

function render() {
  if (!el.list) return;

  updateHeader();

  const q = (mode === "super") ? "" : norm(el.search?.value || "");

  let items = catalog;
  if (mode === "super") items = items.filter(p => isChecked(String(p.id)));
  if (q) items = items.filter(p => matchesSearch(p, q));

  el.list.innerHTML = "";

  if (mode === "super") {
    // Súper: sin textos de “Nada pendiente” y sin secciones si no quieres (dejamos 1 sola lista)
    if (items.length === 0) {
      const li = document.createElement("li");
      li.className = "item";
      li.innerHTML = `<div class="left"><div class="text"><div class="name">No hay productos</div></div></div>`;
      el.list.appendChild(li);
      return;
    }

    // Si quieres ocultar comprados, filtramos
    const visible = hideBought ? items.filter(p => !isDone(String(p.id))) : items;

    visible.forEach(p => el.list.appendChild(renderItem(p, { superMode: true })));
    return;
  }

  // Catálogo
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
    if (t && t.id === "btnBackCatalog") { e.preventDefault(); setMode("catalog"); return; }

    if (t && t.id === "btnStats") { e.preventDefault(); openStatsModal(); return; }
    if (t && t.id === "btnCloseStats") { e.preventDefault(); closeStatsModal(); return; }

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
  el.statsModal?.addEventListener("click", (e) => { if (e.target === el.statsModal) closeStatsModal(); });
}

function enableHeaderAutoHide() {
  // Solo móvil (ajusta si quieres)
  const isMobile = window.matchMedia("(max-width: 768px)").matches;
  if (!isMobile) return;

  let lastY = window.scrollY || 0;
  let ticking = false;

  const MIN_DELTA = 8;     // sensibilidad
  const SHOW_AT_TOP = 24;  // cerca del top, siempre mostrar

  function onScroll() {
    const y = window.scrollY || 0;
    const dy = y - lastY;

    // Siempre visible cerca del inicio
    if (y <= SHOW_AT_TOP) {
      document.body.classList.remove("header-hidden");
      lastY = y;
      return;
    }

    // Ignora micro-movimientos
    if (Math.abs(dy) < MIN_DELTA) return;

    if (dy > 0) {
      // bajando -> ocultar
      document.body.classList.add("header-hidden");
    } else {
      // subiendo -> mostrar
      document.body.classList.remove("header-hidden");
    }

    lastY = y;
  }

  window.addEventListener("scroll", () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      onScroll();
      ticking = false;
    });
  }, { passive: true });
}

// ---------- Init ----------
(async function init() {
  loadState();
  wireUI();

  enableHeaderAutoHide();


  try {
    await loadCatalog();
  } catch {
    alert("No se pudo cargar products.json.");
    return;
  }

  const { marked } = computeTotals();
  setMode(marked > 0 ? "super" : "catalog");
})();
