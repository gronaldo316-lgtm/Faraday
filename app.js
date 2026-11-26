// =====================================================================
// EFF-EX | Control Logístico  —  lógica de la app + sincronización Supabase
// =====================================================================

// 1. AUDIO FEEDBACK
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
function beep(ok) {
  if (audioCtx.state === 'suspended') audioCtx.resume();
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  if (ok) {
    osc.type = 'sine';
    osc.frequency.setValueAtTime(780, audioCtx.currentTime);
    osc.frequency.setValueAtTime(1046, audioCtx.currentTime + 0.08);
    gain.gain.setValueAtTime(0.14, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.25);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.25);
  } else {
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(175, audioCtx.currentTime);
    osc.frequency.setValueAtTime(130, audioCtx.currentTime + 0.14);
    gain.gain.setValueAtTime(0.22, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.4);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.4);
  }
}

// 2. ESTADO INICIAL (se usa como datos de ejemplo la primera vez y al "Reiniciar Demo")
const DEFAULT_DATA = {
  blockedCount: 0,
  poSeq: 504,
  skuSeq: 7,
  lastScannedPoCode: null,
  selectedForkliftLpn: null,
  purchaseOrders: [
    {
      code: 'OC-501',
      supplier: 'Mobiliario Integral S.A. de C.V.',
      rfc: 'MIN1804127K3',
      invoice: 'FAC-8821',
      date: '2026-11-25',
      contact: 'Roberto Sánchez',
      dock: 'ANDÉN ENTRADA 01',
      dailyRate: 450,
      daysInWarehouse: 1,
      status: 'PENDIENTE',
      nextStepDismissed: false,
      products: [
        { name: 'Sillas Ergonómicas', sku: 'SKU-SIL-01', qty: '1 Tarima', aisle: 'B' },
        { name: 'Mesas Industriales', sku: 'SKU-MES-02', qty: '1 Tarima', aisle: 'A' },
        { name: 'Lámparas LED', sku: 'SKU-LAM-03', qty: '1 Tarima', aisle: 'B' }
      ]
    },
    {
      code: 'OC-502',
      supplier: 'OfiEquipamiento de México S.A.',
      rfc: 'OEM200905PL8',
      invoice: 'FAC-4410',
      date: '2026-11-25',
      contact: 'Laura Domínguez',
      dock: 'ANDÉN ENTRADA 02',
      dailyRate: 300,
      daysInWarehouse: 1,
      status: 'PENDIENTE',
      nextStepDismissed: false,
      products: [
        { name: 'Escritorios Ejecutivos', sku: 'SKU-ESC-04', qty: '1 Tarima', aisle: 'A' }
      ]
    },
    {
      code: 'OC-503',
      supplier: 'LogiPack del Golfo S.R.L.',
      rfc: 'LGO1711289A4',
      invoice: 'REM-1093',
      date: '2026-11-26',
      contact: 'Miguel Ángel Ruiz',
      dock: 'ANDÉN ENTRADA 03',
      dailyRate: 600,
      daysInWarehouse: 1,
      status: 'PENDIENTE',
      nextStepDismissed: false,
      products: [
        { name: 'Estantes Metálicos', sku: 'SKU-EST-05', qty: '1 Tarima', aisle: 'A' },
        { name: 'Cajas Archivo', sku: 'SKU-CAJ-06', qty: '1 Tarima', aisle: 'B' }
      ]
    }
  ],
  lpns: [],
  outboundDocks: ['ANDÉN SALIDA 01', 'ANDÉN SALIDA 02', 'ANDÉN SALIDA 03'],
  outboundDockCursor: 0,
  operators: [
    { id: 'OP-01', name: 'Carlos Mendoza', unit: 'Tráiler 01', assignedDock: 'ANDÉN SALIDA 01', status: 'DISPONIBLE', assignedRef: null },
    { id: 'OP-02', name: 'Luis Fernando Ortiz', unit: 'Tráiler 02', assignedDock: 'ANDÉN SALIDA 02', status: 'DISPONIBLE', assignedRef: null },
    { id: 'OP-03', name: 'Jorge Ramírez', unit: 'Tráiler 03', assignedDock: 'ANDÉN SALIDA 03', status: 'EN_RUTA', assignedRef: 'OC-498 (Entrega Local)' }
  ],
  racks: [
    { code: 'A-01', aisle: 'A', status: 'LIBRE', lpn: null, product: null },
    { code: 'A-02', aisle: 'A', status: 'LIBRE', lpn: null, product: null },
    { code: 'A-03', aisle: 'A', status: 'LIBRE', lpn: null, product: null },
    { code: 'A-04', aisle: 'A', status: 'LIBRE', lpn: null, product: null },
    { code: 'B-01', aisle: 'B', status: 'LIBRE', lpn: null, product: null },
    { code: 'B-02', aisle: 'B', status: 'LIBRE', lpn: null, product: null },
    { code: 'B-03', aisle: 'B', status: 'LIBRE', lpn: null, product: null },
    { code: 'B-04', aisle: 'B', status: 'LIBRE', lpn: null, product: null }
  ],
  logs: [
    { time: '15:50', ref: 'SISTEMA', msg: '3 Órdenes de Compra cargadas y listas en andén', ok: true }
  ]
};

let db = JSON.parse(JSON.stringify(DEFAULT_DATA));
let globalCameraStream = null;
let isRequestingCamera = false;
let feedbackTimeoutId = null;
let activePdfPoCode = null;
let cameraScanInterval = null;
let cameraRenderFrameId = null;
let zxingCodeReader = null;
let isScanLocked = false;
let currentCamMode = 'anden';
let currentScanTargetLpnId = null;
let lastDispatchedSummary = null;
let showRackReturnNextStep = false;
let currentPrintingId = null;
let isDarkMode = false;

// =====================================================================
// SINCRONIZACIÓN CON SUPABASE
// =====================================================================
const Sync = { ready: false, saving: false, queued: false, timer: null, retryTimer: null, last: {}, lastError: '' };

const TABLE_ORDER = ['app_settings', 'purchase_orders', 'po_products', 'lpns', 'racks', 'operators'];
const TABLE_CONFLICT = {
  app_settings: 'id',
  purchase_orders: 'code',
  po_products: 'po_code,sort_order',
  lpns: 'id',
  racks: 'code',
  operators: 'id'
};

function setSyncStatus(kind, detail) {
  const el = document.getElementById('sync-indicator');
  if (!el) return;
  const map = {
    loading: ['&#9679; Conectando...', 'text-slate-400'],
    saving:  ['&#9679; Guardando...', 'text-amber-600'],
    ok:      ['&#9679; Sincronizado', 'text-emerald-600'],
    error:   ['&#9679; Sin conexión (toca para reintentar)', 'text-red-600']
  };
  const [txt, cls] = map[kind] || map.loading;
  el.innerHTML = txt;
  el.className = `text-[9px] font-mono font-bold mt-0.5 ${cls}`;
  el.title = detail || '';
}

// Convierte el estado en memoria a filas de las tablas
function serializeState() {
  const st = {
    app_settings: [{
      id: 1,
      po_seq: db.poSeq,
      sku_seq: db.skuSeq,
      blocked_count: db.blockedCount,
      outbound_dock_cursor: db.outboundDockCursor,
      last_scanned_po_code: db.lastScannedPoCode || null,
      selected_forklift_lpn: db.selectedForkliftLpn || null
    }],
    purchase_orders: db.purchaseOrders.map((po, i) => ({
      code: po.code,
      supplier: po.supplier,
      rfc: po.rfc || null,
      invoice: po.invoice || null,
      po_date: po.date || null,
      contact: po.contact || null,
      dock: po.dock || null,
      daily_rate: Number(po.dailyRate || 450),
      days_in_warehouse: po.daysInWarehouse || 1,
      status: po.status,
      next_step_dismissed: !!po.nextStepDismissed,
      sort_order: i
    })),
    po_products: [],
    lpns: db.lpns.map((l, i) => ({
      id: l.id,
      po_code: l.poCode,
      product: l.product,
      qty: l.qty || null,
      rack: l.rack || null,
      status: l.status,
      dispatch_rack_scanned: !!l.dispatchRackScanned,
      dispatch_prod_scanned: !!l.dispatchProdScanned,
      sort_order: i
    })),
    racks: db.racks.map(r => ({ code: r.code, aisle: r.aisle, status: r.status, lpn: r.lpn || null, product: r.product || null })),
    operators: db.operators.map(o => ({
      id: o.id, name: o.name, unit: o.unit, assigned_dock: o.assignedDock || null, status: o.status, assigned_ref: o.assignedRef || null
    }))
  };
  db.purchaseOrders.forEach(po => {
    po.products.forEach((p, j) => {
      st.po_products.push({ po_code: po.code, sort_order: j, name: p.name, sku: p.sku, qty: p.qty || '1 Tarima', aisle: p.aisle || 'A' });
    });
  });
  return st;
}

async function flushSave() {
  if (!Sync.ready) return false;
  if (Sync.saving) { Sync.queued = true; return true; }
  Sync.saving = true;
  let failed = false;
  try {
    const st = serializeState();
    let wroteSomething = false;
    for (const t of TABLE_ORDER) {
      const snap = JSON.stringify(st[t]);
      if (snap !== Sync.last[t]) {
        if (!wroteSomething) setSyncStatus('saving');
        wroteSomething = true;
        await sb.upsert(t, st[t], TABLE_CONFLICT[t]);
        Sync.last[t] = snap;
      }
    }
    const pending = db.logs.filter(l => !l.id).reverse(); // más antiguos primero
    if (pending.length) {
      if (!wroteSomething) setSyncStatus('saving');
      const saved = await sb.insert('event_logs', pending.map(l => ({ time: l.time, ref: l.ref, msg: l.msg, ok: l.ok })));
      saved.forEach((row, i) => { pending[i].id = row.id; });
    }
    setSyncStatus('ok');
  } catch (err) {
    failed = true;
    console.error('[EFF-EX] Error al guardar en Supabase:', err);
    setSyncStatus('error', String(err.message || err));
    clearTimeout(Sync.retryTimer);
    Sync.retryTimer = setTimeout(scheduleSave, 8000);
  } finally {
    Sync.saving = false;
    if (Sync.queued && !failed) { Sync.queued = false; scheduleSave(); }
    else Sync.queued = false;
  }
  return !failed;
}

function scheduleSave() {
  if (!Sync.ready) return;
  clearTimeout(Sync.timer);
  Sync.timer = setTimeout(flushSave, 300);
}

async function loadFromSupabase() {
  const [settings, pos, prods, lpns, racks, ops, logs] = await Promise.all([
    sb.select('app_settings', '&id=eq.1'),
    sb.select('purchase_orders', '&order=sort_order.asc'),
    sb.select('po_products', '&order=sort_order.asc'),
    sb.select('lpns', '&order=sort_order.asc'),
    sb.select('racks', '&order=code.asc'),
    sb.select('operators', '&order=id.asc'),
    sb.select('event_logs', '&order=id.desc&limit=100')
  ]);

  // Primera vez: base vacía -> se cargan los datos de ejemplo
  if (!settings.length && !pos.length) {
    db = JSON.parse(JSON.stringify(DEFAULT_DATA));
    Sync.last = {};
    Sync.ready = true;
    const seeded = await flushSave();
    if (!seeded) throw new Error('No se pudieron guardar los datos iniciales en Supabase');
    return;
  }

  const s = settings[0] || {};
  db = {
    blockedCount: s.blocked_count ?? 0,
    poSeq: s.po_seq ?? 504,
    skuSeq: s.sku_seq ?? 7,
    lastScannedPoCode: s.last_scanned_po_code || null,
    selectedForkliftLpn: s.selected_forklift_lpn || null,
    outboundDockCursor: s.outbound_dock_cursor ?? 0,
    outboundDocks: DEFAULT_DATA.outboundDocks.slice(),
    purchaseOrders: pos.map(po => ({
      code: po.code,
      supplier: po.supplier,
      rfc: po.rfc || '',
      invoice: po.invoice || '',
      date: po.po_date || '',
      contact: po.contact || '',
      dock: po.dock || '',
      dailyRate: Number(po.daily_rate),
      daysInWarehouse: po.days_in_warehouse,
      status: po.status,
      nextStepDismissed: po.next_step_dismissed,
      products: prods.filter(p => p.po_code === po.code)
        .sort((a, b) => a.sort_order - b.sort_order)
        .map(p => ({ name: p.name, sku: p.sku, qty: p.qty, aisle: p.aisle }))
    })),
    lpns: lpns.map(l => ({
      id: l.id,
      poCode: l.po_code,
      product: l.product,
      qty: l.qty,
      rack: l.rack,
      status: l.status,
      dispatchRackScanned: l.dispatch_rack_scanned,
      dispatchProdScanned: l.dispatch_prod_scanned
    })),
    racks: racks.length
      ? racks.map(r => ({ code: r.code, aisle: r.aisle, status: r.status, lpn: r.lpn, product: r.product }))
      : JSON.parse(JSON.stringify(DEFAULT_DATA.racks)),
    operators: ops.length
      ? ops.map(o => ({ id: o.id, name: o.name, unit: o.unit, assignedDock: o.assigned_dock, status: o.status, assignedRef: o.assigned_ref }))
      : JSON.parse(JSON.stringify(DEFAULT_DATA.operators)),
    logs: logs.map(l => ({ id: l.id, time: l.time, ref: l.ref, msg: l.msg, ok: l.ok }))
  };

  // Lo recién cargado ya está guardado: no se vuelve a escribir
  const st = serializeState();
  Sync.last = {};
  TABLE_ORDER.forEach(t => { Sync.last[t] = JSON.stringify(st[t]); });
  if (!racks.length) delete Sync.last.racks;
  if (!ops.length) delete Sync.last.operators;
  Sync.ready = true;
}

async function initSync() {
  setSyncStatus('loading');
  Sync.lastError = '';
  try {
    await loadFromSupabase();
    setSyncStatus('ok');
    renderAll();
  } catch (err) {
    Sync.ready = false;
    console.error('[EFF-EX] No se pudo cargar desde Supabase:', err);
    setSyncStatus('error', String(err.message || err));
  }
}

function retrySync() {
  if (!Sync.ready) { initSync(); return; }
  Sync.last = {};
  flushSave();
}

// =====================================================================
// TEMA, CÁMARA, NOTIFICACIONES
// =====================================================================
function toggleThemeMode() {
  isDarkMode = !isDarkMode;
  document.body.classList.toggle('dark-mode', isDarkMode);
  const icon = document.getElementById('theme-toggle-icon');
  const label = document.getElementById('theme-toggle-label');
  if (isDarkMode) {
    if (icon) icon.className = 'fa-solid fa-sun text-amber-400';
    if (label) label.textContent = 'Claro';
  } else {
    if (icon) icon.className = 'fa-solid fa-moon text-purple-600';
    if (label) label.textContent = 'Oscuro';
  }
}

function setGlobalCamBadgeReady() {
  const btn = document.getElementById('global-cam-btn');
  const icon = document.getElementById('global-cam-icon');
  const lbl = document.getElementById('global-cam-label');
  if (!btn || !lbl) return;
  btn.className = 'px-2.5 py-1.5 rounded-full bg-emerald-50 border border-emerald-300 text-emerald-700 text-xs font-mono font-bold flex items-center gap-1.5 transition';
  if (icon) icon.className = 'fa-solid fa-circle-check text-emerald-600';
  lbl.textContent = 'Cámara Lista';
}

async function requestGlobalCamera(e) {
  if (e) {
    e.preventDefault();
    e.stopPropagation();
  }
  const btn = document.getElementById('global-cam-btn');
  const lbl = document.getElementById('global-cam-label');

  if (globalCameraStream && globalCameraStream.getTracks().some(t => t.readyState === 'live')) {
    setGlobalCamBadgeReady();
    notify(true, 'CÁMARA LISTA', 'La cámara ya está activa en toda la aplicación.');
    return;
  }

  if (isRequestingCamera) return;
  isRequestingCamera = true;
  btn.disabled = true;
  lbl.textContent = 'Activando...';

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' } },
      audio: false
    });
    globalCameraStream = stream;
    setGlobalCamBadgeReady();
    notify(true, 'CÁMARA ACTIVADA', 'Lista para escanear en toda la aplicación.');
  } catch (err) {
    btn.className = 'px-2.5 py-1.5 rounded-full bg-amber-50 border border-amber-300 text-amber-800 text-xs font-mono font-bold flex items-center gap-1.5 transition';
    lbl.textContent = 'Sin Cámara';
    notify(false, 'CÁMARA NO DISPONIBLE', 'Usa los botones de lectura rápida al abrir el escáner.');
  } finally {
    isRequestingCamera = false;
    btn.disabled = false;
  }
}

// 3. NOTIFICATION BANNER (se oculta solo a los 2.8s)
function notify(ok, title, sub) {
  beep(ok);
  if (feedbackTimeoutId) clearTimeout(feedbackTimeoutId);

  const pill = document.getElementById('status-pill');
  const dot = document.getElementById('status-dot');
  const lbl = document.getElementById('status-label');

  const box = document.getElementById('feedback-box');
  const inner = document.getElementById('feedback-inner');
  const icon = document.getElementById('feedback-icon');
  const tEl = document.getElementById('feedback-title');
  const sEl = document.getElementById('feedback-sub');

  box.classList.remove('hidden', 'animate-shake');
  void box.offsetWidth;

  if (ok) {
    pill.className = 'flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-mono font-bold';
    dot.className = 'w-2.5 h-2.5 rounded-full bg-emerald-500';
    lbl.textContent = 'VERIFICADO';

    inner.className = 'rounded-2xl p-4 border-2 bg-emerald-50 border-emerald-400 text-emerald-950 flex items-center justify-between gap-3 shadow-lg';
    icon.className = 'w-11 h-11 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 text-xl';
    icon.innerHTML = '<i class="fa-solid fa-circle-check"></i>';
  } else {
    db.blockedCount++;
    box.classList.add('animate-shake');
    pill.className = 'flex items-center gap-2 px-3 py-1.5 rounded-full bg-red-50 border border-red-300 text-red-700 text-xs font-mono font-bold';
    dot.className = 'w-2.5 h-2.5 rounded-full bg-red-500 animate-ping';
    lbl.textContent = 'BLOQUEO';

    inner.className = 'rounded-2xl p-4 border-2 bg-red-50 border-red-400 text-red-950 flex items-center justify-between gap-3 shadow-lg';
    icon.className = 'w-11 h-11 rounded-xl bg-red-600 text-white flex items-center justify-center shrink-0 text-xl';
    icon.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i>';
  }

  tEl.textContent = title;
  sEl.textContent = sub;
  renderAll();

  feedbackTimeoutId = setTimeout(() => {
    hideFeedback();
  }, 2800);
}

function hideFeedback() {
  document.getElementById('feedback-box').classList.add('hidden');
}

function logEvent(ref, msg, ok) {
  const now = new Date();
  const time = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0');
  db.logs.unshift({ time, ref, msg, ok });
  renderAll();
}

// 4. NAVIGATION
function goTab(tabName) {
  document.querySelectorAll('.view-panel').forEach(el => el.classList.add('hidden'));
  document.getElementById(`view-${tabName}`).classList.remove('hidden');

  document.querySelectorAll('.dtab').forEach(btn => {
    btn.className = 'dtab py-2.5 px-1.5 rounded-xl text-[10px] font-bold flex items-center justify-center gap-1 transition bg-slate-100 text-slate-600 hover:bg-slate-200';
  });
  const activeDesktop = document.getElementById(`dtab-${tabName}`);
  if (activeDesktop) {
    activeDesktop.className = 'dtab py-2.5 px-1.5 rounded-xl text-[10px] font-bold flex items-center justify-center gap-1 transition bg-navy text-white shadow-sm';
  }

  document.querySelectorAll('.mtab').forEach(btn => {
    btn.className = 'mtab flex flex-col items-center justify-center py-1 rounded-xl text-[8.5px] font-bold gap-0.5 text-slate-500';
  });
  const activeMobile = document.getElementById(`mtab-${tabName}`);
  if (activeMobile) {
    activeMobile.className = 'mtab flex flex-col items-center justify-center py-1 rounded-xl text-[8.5px] font-bold gap-0.5 bg-navy text-white';
  }
}

// 5. CÓDIGO DE BARRAS CODE-128 REAL
function makeBarcodeSVG(text) {
  const cleanVal = String(text || 'OC-501').trim().toUpperCase();
  if (typeof JsBarcode !== 'undefined') {
    try {
      const svgEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      JsBarcode(svgEl, cleanVal, {
        format: 'CODE128',
        lineColor: '#000000',
        background: '#ffffff',
        width: 2.2,
        height: 46,
        margin: 8,
        displayValue: false
      });
      svgEl.setAttribute('class', 'w-full h-11 mx-auto bg-white');
      return svgEl.outerHTML;
    } catch (e) {}
  }
  return `<div class="font-mono text-xs font-bold py-2 bg-white text-black">${cleanVal}</div>`;
}

// 6. NUEVA ORDEN DE COMPRA
function openNewPoModal() {
  document.getElementById('new-po-code').value = `OC-${db.poSeq}`;
  document.getElementById('new-po-supplier').value = '';
  document.getElementById('new-po-rfc').value = '';
  document.getElementById('new-po-invoice').value = '';
  document.getElementById('new-po-contact').value = '';
  document.getElementById('new-po-rate').value = '450';
  document.getElementById('new-po-date').value = new Date().toISOString().split('T')[0];
  const container = document.getElementById('new-po-products-container');
  container.innerHTML = '';
  addProductRow();
  document.getElementById('new-po-modal').classList.remove('hidden');
}

function closeNewPoModal() {
  document.getElementById('new-po-modal').classList.add('hidden');
}

function addProductRow(defaultName = '', defaultSku = '', defaultQty = '1 Tarima') {
  const container = document.getElementById('new-po-products-container');
  const idx = container.children.length + 1;
  const row = document.createElement('div');
  row.className = 'po-product-row bg-slate-50 border border-slate-200 rounded-2xl p-3 space-y-2 relative';
  row.innerHTML = `
    <div class="flex items-center justify-between">
      <span class="row-badge text-[10px] font-mono font-bold text-slate-500 uppercase">Producto #${idx}</span>
      <button type="button" onclick="removeProductRow(this)" class="text-slate-400 hover:text-red-600 text-xs px-1.5 py-0.5 rounded transition" title="Quitar producto">
        <i class="fa-solid fa-trash-can"></i>
      </button>
    </div>
    <div class="grid grid-cols-1 sm:grid-cols-12 gap-2">
      <input type="text" oninput="autoGenerateRowSku(this)" class="prod-name sm:col-span-5 px-3 py-2 rounded-xl bg-white border border-slate-300 text-xs font-semibold focus:outline-none focus:border-navy" placeholder="Nombre (ej. Cajas Plásticas)" value="${defaultName}" />
      <div class="sm:col-span-4 relative">
        <input type="text" readonly tabindex="-1" class="prod-sku w-full px-3 py-2 pr-7 rounded-xl bg-slate-100 border border-slate-300 font-mono text-xs font-extrabold text-navy uppercase cursor-not-allowed select-none focus:outline-none" placeholder="SKU AUTO" value="${defaultSku}" />
        <i class="fa-solid fa-wand-magic-sparkles text-slate-400 text-[10px] absolute right-2.5 top-1/2 -translate-y-1/2" title="SKU generado automáticamente"></i>
      </div>
      <div class="sm:col-span-3 relative">
        <input type="text" readonly tabindex="-1" class="prod-qty w-full px-3 py-2 pr-7 rounded-xl bg-slate-100 border border-slate-300 font-mono text-xs font-bold text-slate-700 cursor-not-allowed select-none focus:outline-none" value="1 Tarima" />
        <i class="fa-solid fa-lock text-slate-400 text-[10px] absolute right-2.5 top-1/2 -translate-y-1/2" title="Cantidad estándar bloqueada"></i>
      </div>
    </div>
  `;
  container.appendChild(row);
  renumberProductRows();
}

function autoGenerateRowSku(nameInput) {
  const row = nameInput.closest('.po-product-row');
  const skuInput = row.querySelector('.prod-sku');
  const cleanName = nameInput.value.trim();

  if (!cleanName) {
    skuInput.value = '';
    return;
  }

  // Si el producto ya existe en el catálogo se reutiliza su SKU (anti-duplicado)
  const existingProd = db.purchaseOrders
    .flatMap(po => po.products)
    .find(p => p.name.toLowerCase() === cleanName.toLowerCase());

  if (existingProd) {
    skuInput.value = existingProd.sku;
    return;
  }

  const letters = cleanName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z]/g, '')
    .toUpperCase();
  const prefix = (letters.slice(0, 3) || 'PRD').padEnd(3, 'X');
  const rows = Array.from(document.querySelectorAll('#new-po-products-container .po-product-row'));
  const rowOffset = rows.indexOf(row);
  const num = String(db.skuSeq + rowOffset).padStart(2, '0');

  skuInput.value = `SKU-${prefix}-${num}`;
}

function removeProductRow(btn) {
  const container = document.getElementById('new-po-products-container');
  if (container.children.length <= 1) {
    notify(false, 'MÍNIMO 1 PRODUCTO', 'La Orden de Compra debe incluir al menos un producto.');
    return;
  }
  btn.closest('.po-product-row').remove();
  renumberProductRows();
}

function renumberProductRows() {
  const rows = document.querySelectorAll('#new-po-products-container .po-product-row');
  rows.forEach((row, i) => {
    row.querySelector('.row-badge').textContent = `Producto #${i + 1}`;
    const nameInput = row.querySelector('.prod-name');
    if (nameInput && nameInput.value.trim()) {
      autoGenerateRowSku(nameInput);
    }
  });
}

function saveNewPO() {
  const autoCode = `OC-${db.poSeq}`;

  if (db.purchaseOrders.some(o => o.code === autoCode)) {
    db.poSeq++;
  }

  const finalCode = `OC-${db.poSeq}`;
  const supplier = document.getElementById('new-po-supplier').value.trim() || 'Proveedor Registrado S.A. de C.V.';
  const rfc = document.getElementById('new-po-rfc').value.trim().toUpperCase() || 'XAXX010101000';
  const invoice = document.getElementById('new-po-invoice').value.trim().toUpperCase() || `FAC-${1000 + db.poSeq}`;
  const date = document.getElementById('new-po-date').value || new Date().toISOString().split('T')[0];
  const contact = document.getElementById('new-po-contact').value.trim() || 'Operador Asignado';
  const dock = document.getElementById('new-po-dock').value || 'ANDÉN ENTRADA 01';
  const dailyRate = Math.max(1, parseFloat(document.getElementById('new-po-rate').value) || 450);
  const rows = document.querySelectorAll('#new-po-products-container .po-product-row');
  const products = [];
  let newSkusCreated = 0;

  rows.forEach((row, idx) => {
    const name = row.querySelector('.prod-name').value.trim();
    if (name) {
      autoGenerateRowSku(row.querySelector('.prod-name'));
      const sku = row.querySelector('.prod-sku').value.trim();
      const qty = row.querySelector('.prod-qty').value.trim() || '1 Tarima';
      const alreadyExists = db.purchaseOrders.flatMap(po => po.products).some(p => p.sku === sku);
      if (!alreadyExists) newSkusCreated++;
      products.push({
        name,
        sku,
        qty,
        aisle: idx % 2 === 0 ? 'A' : 'B'
      });
    }
  });

  if (products.length === 0) {
    notify(false, 'FALTAN PRODUCTOS', 'Escribe el nombre de al menos un producto para guardar la OC.');
    return;
  }

  db.purchaseOrders.unshift({
    code: finalCode,
    supplier,
    rfc,
    invoice,
    date,
    contact,
    dock,
    dailyRate,
    daysInWarehouse: 1,
    status: 'PENDIENTE',
    nextStepDismissed: false,
    products
  });

  db.poSeq++;
  db.skuSeq += newSkusCreated;

  closeNewPoModal();
  goTab('bitacora');
  openPoPdfModal(finalCode);
  notify(true, `ORDEN ${finalCode} EMITIDA`, `Lista en Bitácora OC para descargar PDF y entregar al cliente.`);
  logEvent(finalCode, `Nueva OC emitida (${supplier})`, true);
}

// PDF: vista previa y descarga
function openPoPdfModal(poCode) {
  const po = db.purchaseOrders.find(o => o.code === poCode);
  if (!po) return;
  activePdfPoCode = poCode;

  document.getElementById('pdf-po-code').textContent = po.code;
  document.getElementById('pdf-po-svg').innerHTML = makeBarcodeSVG(po.code);
  document.getElementById('pdf-po-supplier').textContent = po.supplier;
  document.getElementById('pdf-po-rfc').textContent = po.rfc || 'XAXX010101000';
  document.getElementById('pdf-po-contact').textContent = po.contact || 'Operador Asignado';
  document.getElementById('pdf-po-invoice').textContent = po.invoice || 'SIN FACTURA';
  document.getElementById('pdf-po-date').textContent = po.date || '---';
  document.getElementById('pdf-po-dock').textContent = po.dock || 'ANDÉN ENTRADA 01';
  document.getElementById('pdf-po-rate').textContent = `$${Number(po.dailyRate || 450).toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN / día`;

  const tbody = document.getElementById('pdf-po-tbody');
  tbody.innerHTML = po.products.map((p, idx) => `
    <tr>
      <td class="py-2 px-3 font-mono text-slate-500">${idx + 1}</td>
      <td class="py-2 px-3 font-mono font-bold text-navy">${p.sku}</td>
      <td class="py-2 px-3 font-semibold text-slate-800">${p.name}</td>
      <td class="py-2 px-3 text-right font-mono font-bold text-slate-700">${p.qty}</td>
    </tr>
  `).join('');

  document.getElementById('po-pdf-modal').classList.remove('hidden');
}

function closePoPdfModal() {
  document.getElementById('po-pdf-modal').classList.add('hidden');
}

function downloadPoPdf(explicitCode = null) {
  const targetCode = explicitCode || activePdfPoCode;
  const po = db.purchaseOrders.find(o => o.code === targetCode);
  if (!po) return;

  if (window.jspdf && window.jspdf.jsPDF) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

    doc.setFillColor(30, 58, 138);
    doc.rect(14, 14, 182, 22, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text('EFF-EX LOGÍSTICA - ORDEN DE COMPRA', 20, 24);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text('CITA DE ARRIBO Y CONTROL ÓPTICO DE RECEPCIÓN', 20, 31);

    const barcodeCanvas = document.createElement('canvas');
    if (typeof JsBarcode !== 'undefined') {
      JsBarcode(barcodeCanvas, po.code, {
        format: 'CODE128',
        lineColor: '#000000',
        background: '#ffffff',
        width: 2.5,
        height: 55,
        margin: 6,
        displayValue: true,
        fontSize: 16
      });
      const barcodeDataUrl = barcodeCanvas.toDataURL('image/png');
      doc.addImage(barcodeDataUrl, 'PNG', 132, 42, 64, 24);
    }

    doc.setTextColor(15, 23, 42);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text(`FOLIO: ${po.code}`, 14, 48);

    doc.setFontSize(9.5);
    doc.setFont('helvetica', 'normal');
    doc.text(`Razón Social: ${po.supplier}`, 14, 55);
    doc.text(`RFC: ${po.rfc || 'XAXX010101000'}`, 14, 61);
    doc.text(`Factura / Remisión: ${po.invoice || 'SIN FACTURA'}`, 14, 67);
    doc.text(`Fecha Programada: ${po.date || '---'}`, 14, 73);
    doc.text(`Andén Asignado: ${po.dock || 'ANDÉN ENTRADA 01'}`, 14, 79);
    doc.text(`Contacto / Operador: ${po.contact || 'Operador Asignado'}`, 14, 85);
    doc.text(`Tarifa Almacenaje: $${Number(po.dailyRate || 450).toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN / día`, 14, 91);

    let y = 102;
    doc.setFillColor(241, 245, 249);
    doc.rect(14, y - 5, 182, 8, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text('#', 17, y);
    doc.text('SKU', 28, y);
    doc.text('Descripción del Producto', 68, y);
    doc.text('Cantidad', 168, y);

    y += 8;
    doc.setFont('helvetica', 'normal');
    po.products.forEach((p, i) => {
      doc.text(String(i + 1), 17, y);
      doc.text(String(p.sku), 28, y);
      doc.text(String(p.name), 68, y);
      doc.text(String(p.qty), 168, y);
      doc.setDrawColor(226, 232, 240);
      doc.line(14, y + 2.5, 196, y + 2.5);
      y += 8;
    });

    y += 6;
    doc.setFillColor(254, 243, 199);
    doc.rect(14, y, 182, 14, 'F');
    doc.setTextColor(120, 53, 15);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.text('INSTRUCCIÓN OBLIGATORIA: Presentar este código de barras al llegar al andén para su lectura óptica.', 18, y + 9);

    doc.save(`${po.code}_Orden_de_Compra.pdf`);
    notify(true, `PDF DESCARGADO: ${po.code}`, `Se guardó el archivo ${po.code}_Orden_de_Compra.pdf`);
    logEvent(po.code, `Archivo PDF descargado para cliente`, true);
  } else {
    window.print();
  }
}

// 7. ESCÁNER DE CÁMARA
async function openCameraScanner(mode, targetLpnId = null) {
  if ((mode === 'dispatch-rack' || mode === 'dispatch-prod') && !db.operators.some(op => op.status === 'DISPONIBLE')) {
    notify(false, 'BLOQUEO DE SALIDA: 3 OPERADORES OCUPADOS', 'Los 3 operadores y tráilers están en ruta. Regresa un operador a base en 5. Operadores para continuar.');
    logEvent('DESPACHO', 'Escaneo de salida bloqueado: 0 operadores disponibles', false);
    return;
  }

  currentCamMode = mode;
  currentScanTargetLpnId = targetLpnId;
  isScanLocked = false;
  const modal = document.getElementById('camera-modal');
  const video = document.getElementById('camera-video');
  const canvas = document.getElementById('camera-canvas');
  const fallback = document.getElementById('camera-fallback-msg');
  const modeLbl = document.getElementById('cam-mode-label');
  const quickBox = document.getElementById('cam-quick-buttons');

  modal.classList.remove('hidden');
  fallback.classList.add('hidden');
  canvas.classList.remove('hidden');

  if (mode === 'anden') {
    modeLbl.textContent = '1. CHECK OC: ESCANEAR ORDEN DE COMPRA';
    const pendingOrders = db.purchaseOrders.filter(o => o.status === 'PENDIENTE').slice(0, 2);
    const btns = pendingOrders.map(o => `
      <button onclick="processScannedCode('${o.code}', 'anden', true)" class="py-3 px-2 rounded-xl bg-white/15 hover:bg-white/25 text-white font-mono text-xs font-bold truncate">
        ${o.code}
      </button>
    `);
    while (btns.length < 2) {
      const fallbackCode = db.purchaseOrders[0]?.code || 'OC-501';
      btns.push(`
        <button onclick="processScannedCode('${fallbackCode}', 'anden', true)" class="py-3 px-2 rounded-xl bg-white/15 hover:bg-white/25 text-white font-mono text-xs font-bold truncate">
          ${fallbackCode}
        </button>
      `);
    }
    btns.push(`
      <button onclick="processScannedCode('OC-999', 'anden', true)" class="py-3 px-2 rounded-xl bg-red-600/85 hover:bg-red-600 text-white font-mono text-xs font-bold">
        OC-999 (Err)
      </button>
    `);
    quickBox.innerHTML = btns.join('');
  } else if (mode === 'racks') {
    modeLbl.textContent = '3. ASIG. RACK: ESCANEAR RACK ASIGNADO';
    const pending = db.lpns.filter(l => l.status === 'ACOMODADO_EN_RACK');
    const active = pending.find(l => l.id === db.selectedForkliftLpn) || pending[0];
    const targetRack = active ? active.rack : 'B-01';
    quickBox.innerHTML = `
      <button onclick="processScannedCode('${targetRack}', 'racks', true)" class="col-span-2 py-3 px-2 rounded-xl bg-emerald-600/90 hover:bg-emerald-600 text-white font-mono text-xs font-bold">
        Escanear ${targetRack}
      </button>
      <button onclick="processScannedCode('B-04', 'racks', true)" class="py-3 px-2 rounded-xl bg-red-600/85 hover:bg-red-600 text-white font-mono text-xs font-bold">
        Rack Erróneo
      </button>
    `;
  } else if (mode === 'dispatch-rack') {
    const item = db.lpns.find(l => l.id === targetLpnId);
    const expectedRack = item ? item.rack : 'A-01';
    modeLbl.textContent = `4. DESPACHO: ESCANEAR RACK (${expectedRack})`;
    quickBox.innerHTML = `
      <button onclick="processScannedCode('${expectedRack}', 'dispatch-rack', true)" class="col-span-2 py-3 px-2 rounded-xl bg-teal-600/90 hover:bg-teal-600 text-white font-mono text-xs font-bold">
        Escanear Rack ${expectedRack}
      </button>
      <button onclick="processScannedCode('Z-99', 'dispatch-rack', true)" class="py-3 px-2 rounded-xl bg-red-600/85 hover:bg-red-600 text-white font-mono text-xs font-bold">
        Rack Erróneo
      </button>
    `;
  } else if (mode === 'dispatch-prod') {
    const item = db.lpns.find(l => l.id === targetLpnId);
    const expectedCode = item ? item.id : 'P-501-01';
    modeLbl.textContent = `4. DESPACHO: ESCANEAR PRODUCTO (${expectedCode})`;
    quickBox.innerHTML = `
      <button onclick="processScannedCode('${expectedCode}', 'dispatch-prod', true)" class="col-span-2 py-3 px-2 rounded-xl bg-emerald-600/90 hover:bg-emerald-600 text-white font-mono text-xs font-bold">
        Escanear ${expectedCode}
      </button>
      <button onclick="processScannedCode('P-000-99', 'dispatch-prod', true)" class="py-3 px-2 rounded-xl bg-red-600/85 hover:bg-red-600 text-white font-mono text-xs font-bold">
        Código Erróneo
      </button>
    `;
  }

  const startOpticalDecoder = () => {
    if (cameraRenderFrameId) cancelAnimationFrame(cameraRenderFrameId);
    if (cameraScanInterval) clearInterval(cameraScanInterval);
    if (zxingCodeReader) {
      try { zxingCodeReader.reset(); } catch (_) {}
    }

    const ctx = canvas.getContext('2d');
    const drawVideoFrame = () => {
      if (modal.classList.contains('hidden')) return;
      if (video.readyState >= 2 && video.videoWidth > 0) {
        if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
        }
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      }
      cameraRenderFrameId = requestAnimationFrame(drawVideoFrame);
    };
    cameraRenderFrameId = requestAnimationFrame(drawVideoFrame);

    if ('BarcodeDetector' in window) {
      const detector = new BarcodeDetector({ formats: ['code_128', 'code_39', 'ean_13', 'qr_code'] });
      cameraScanInterval = setInterval(async () => {
        if (isScanLocked || video.readyState < 2) return;
        try {
          const codes = await detector.detect(video);
          if (codes.length > 0 && codes[0].rawValue) {
            isScanLocked = true;
            processScannedCode(codes[0].rawValue, mode, true);
          }
        } catch (_) {}
      }, 260);
    } else if (typeof ZXing !== 'undefined' && ZXing.BrowserMultiFormatReader) {
      try {
        zxingCodeReader = new ZXing.BrowserMultiFormatReader();
        zxingCodeReader.decodeFromVideoElementContinuously(video, (result) => {
          if (result && result.getText() && !isScanLocked) {
            isScanLocked = true;
            processScannedCode(result.getText(), mode, true);
          }
        });
      } catch (_) {}
    }
  };

  if (globalCameraStream && globalCameraStream.active) {
    video.srcObject = globalCameraStream;
    await video.play().catch(() => {});
    startOpticalDecoder();
    return;
  }

  try {
    globalCameraStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' } },
      audio: false
    });
    video.srcObject = globalCameraStream;
    await video.play().catch(() => {});
    setGlobalCamBadgeReady();
    startOpticalDecoder();
  } catch (err) {
    canvas.classList.add('hidden');
    fallback.classList.remove('hidden');
  }
}

function closeCameraScanner() {
  document.getElementById('camera-modal').classList.add('hidden');
  if (cameraRenderFrameId) {
    cancelAnimationFrame(cameraRenderFrameId);
    cameraRenderFrameId = null;
  }
  if (cameraScanInterval) {
    clearInterval(cameraScanInterval);
    cameraScanInterval = null;
  }
  if (zxingCodeReader) {
    try { zxingCodeReader.reset(); } catch (_) {}
  }
  // Se mantiene globalCameraStream activo para que el navegador no vuelva a pedir permiso
}

// 8. LÓGICA PRINCIPAL DE ESCANEO
function processScannedCode(rawCode, mode, fromCamera = false) {
  if (fromCamera) closeCameraScanner();
  const code = rawCode.trim().toUpperCase();

  if (mode === 'anden') {
    const po = db.purchaseOrders.find(o => o.code === code);

    if (!po) {
      notify(false, `ERROR: ORDEN INEXISTENTE (${code})`, 'El código escaneado no coincide con ninguna Orden de Compra registrada.');
      logEvent(code, 'Orden de Compra desconocida rechazada', false);
      return;
    }

    if (po.status === 'RECIBIDA') {
      notify(false, `BLOQUEO ANTI-DUPLICIDAD: ${po.code}`, 'Esta Orden de Compra ya fue recibida anteriormente. No se generan duplicados.');
      logEvent(po.code, 'Doble escaneo de Orden de Compra bloqueado', false);
      return;
    }

    const generatedList = [];
    const poNum = po.code.replace('OC-', '');

    po.products.forEach((prod, idx) => {
      const freeRack = db.racks.find(r => r.aisle === prod.aisle && r.status === 'LIBRE') || db.racks.find(r => r.status === 'LIBRE');
      const pCode = `P-${poNum}-0${idx + 1}`;
      const assignedRack = freeRack ? freeRack.code : 'PISO';

      if (freeRack) {
        freeRack.status = 'RESERVADO';
        freeRack.lpn = pCode;
        freeRack.product = prod.name;
      }

      const newItem = {
        id: pCode,
        poCode: po.code,
        product: prod.name,
        qty: prod.qty,
        rack: assignedRack,
        status: 'POR_ETIQUETAR',
        dispatchRackScanned: false,
        dispatchProdScanned: false
      };

      db.lpns.unshift(newItem);
      generatedList.push(newItem);
    });

    po.status = 'RECIBIDA';
    po.nextStepDismissed = false;
    po.daysInWarehouse = 1;
    db.lastScannedPoCode = po.code;

    const countText = generatedList.length === 1
      ? 'Se generó 1 etiqueta única en 2. Generador de Etiquetas.'
      : `Se generaron automáticamente ${generatedList.length} etiquetas únicas (1 por producto) en 2. Generador de Etiquetas.`;

    notify(true, `¡ORDEN DE COMPRA CORRECTA! (${po.code})`, `Coincidencia verificada. ${countText}`);
    logEvent(po.code, `OC verificada -> ${generatedList.length} etiqueta(s) generadas`, true);
  } else if (mode === 'racks') {
    scanRack(code);
  } else if (mode === 'dispatch-rack') {
    verifyDispatchRackScan(currentScanTargetLpnId, code);
  } else if (mode === 'dispatch-prod') {
    verifyDispatchProdScan(currentScanTargetLpnId, code);
  }
}

function advanceFromPoCard(poCode) {
  const po = db.purchaseOrders.find(o => o.code === poCode);
  if (po) {
    po.nextStepDismissed = true;
  }
  goTab('anden');
  renderAll();
}

// 9. ASIGNACIÓN DE RACK
function selectForkliftLpn(id) {
  db.selectedForkliftLpn = id;
  renderRacks();
  scheduleSave();
}

function scanRack(rackCode) {
  const pending = db.lpns.filter(l => l.status === 'ACOMODADO_EN_RACK');
  if (pending.length === 0) {
    notify(false, 'SIN TARIMAS LISTAS PARA RACK', 'Imprime las etiquetas en 2. Generador de Etiquetas primero.');
    return;
  }

  const active = pending.find(l => l.id === db.selectedForkliftLpn) || pending[0];
  const targetRackObj = db.racks.find(r => r.code === rackCode);

  if (rackCode !== active.rack) {
    const extra = targetRackObj && targetRackObj.status === 'OCUPADO' ? ` (${rackCode} ocupado por ${targetRackObj.lpn})` : '';
    notify(false, `RACK EQUIVOCADO: ${rackCode}`, `Debes escanear ${active.rack}${extra}.`);
    logEvent(active.id, `Ubicación incorrecta ${rackCode} bloqueada`, false);
    return;
  }

  targetRackObj.status = 'OCUPADO';
  targetRackObj.lpn = active.id;
  targetRackObj.product = active.product;
  active.status = 'VERIFICADO_EN_RACK';
  showRackReturnNextStep = true;

  notify(true, `ASIGNACIÓN DE RACK CONFIRMADA`, `${active.id} (${active.product}) verificado en ${rackCode}`);
  logEvent(active.id, `Asignación de rack OK en ${rackCode}`, true);
}

function finishRackStepAndReturn() {
  showRackReturnNextStep = false;
  goTab('ordenes');
  renderAll();
}

function simulateWrongRack() {
  const pending = db.lpns.filter(l => l.status === 'ACOMODADO_EN_RACK');
  const active = pending.find(l => l.id === db.selectedForkliftLpn) || pending[0];
  const wrong = db.racks.find(r => !active || r.code !== active.rack);
  scanRack(wrong.code);
}

// 10. DESPACHO (DOBLE ESCANEO RACK + PRODUCTO)
function verifyDispatchRackScan(lpnId, scannedRackCode) {
  if (!db.operators.some(op => op.status === 'DISPONIBLE')) {
    notify(false, 'BLOQUEO: SIN OPERADORES DISPONIBLES', 'Los 3 operadores están en ruta. Regresa uno a base para escanear.');
    return;
  }
  const lpn = db.lpns.find(l => l.id === lpnId);
  if (!lpn) return;

  if (scannedRackCode !== lpn.rack) {
    notify(false, `RACK INCORRECTO: ${scannedRackCode}`, `El producto ${lpn.id} se encuentra en el rack ${lpn.rack}.`);
    logEvent(lpn.id, `Escaneo de rack incorrecto en despacho (${scannedRackCode})`, false);
    return;
  }

  lpn.dispatchRackScanned = true;
  notify(true, `RACK ${lpn.rack} VERIFICADO`, `Ahora escanea el código del producto ${lpn.id}.`);
  logEvent(lpn.id, `Rack ${lpn.rack} validado para salida`, true);
  checkAndCompleteOutboundDispatch(lpn);
}

function verifyDispatchProdScan(lpnId, scannedProdCode) {
  if (!db.operators.some(op => op.status === 'DISPONIBLE')) {
    notify(false, 'BLOQUEO: SIN OPERADORES DISPONIBLES', 'Los 3 operadores están en ruta. Regresa uno a base para escanear.');
    return;
  }
  const lpn = db.lpns.find(l => l.id === lpnId);
  if (!lpn) return;

  if (scannedProdCode !== lpn.id) {
    notify(false, `PRODUCTO INCORRECTO: ${scannedProdCode}`, `Debes escanear la etiqueta ${lpn.id} (${lpn.product}).`);
    logEvent(lpn.id, `Código de producto erróneo en despacho (${scannedProdCode})`, false);
    return;
  }

  lpn.dispatchProdScanned = true;
  notify(true, `PRODUCTO ${lpn.id} VERIFICADO`, `Código del producto confirmado.`);
  logEvent(lpn.id, `Código ${lpn.id} validado para salida`, true);
  checkAndCompleteOutboundDispatch(lpn);
}

function checkAndCompleteOutboundDispatch(lpn) {
  if (!lpn.dispatchRackScanned || !lpn.dispatchProdScanned) {
    renderAll();
    return;
  }

  const freedRackCode = lpn.rack;
  const rack = db.racks.find(r => r.code === freedRackCode);
  if (rack) {
    rack.status = 'LIBRE';
    rack.lpn = null;
    rack.product = null;
  }

  lpn.status = 'DESPACHADA';
  const assignedOutboundDock = db.outboundDocks[db.outboundDockCursor % db.outboundDocks.length];
  db.outboundDockCursor++;
  lpn.rack = assignedOutboundDock;

  lastDispatchedSummary = {
    lpnId: lpn.id,
    poCode: lpn.poCode,
    product: lpn.product,
    freedRack: freedRackCode,
    dockName: `${assignedOutboundDock} (EMBARQUE)`
  };

  notify(true, `LLEVAR A ${assignedOutboundDock}`, `Rack ${freedRackCode} quedó DESOCUPADO. Asigna un operador disponible.`);
  logEvent(lpn.id, `Despachado a ${assignedOutboundDock} -> Rack ${freedRackCode} DESOCUPADO`, true);
}

function assignOperatorToRoute(opId) {
  const op = db.operators.find(o => o.id === opId);
  if (!op || !lastDispatchedSummary) return;

  if (op.status !== 'DISPONIBLE') {
    notify(false, 'OPERADOR NO DISPONIBLE', `${op.name} se encuentra actualmente en ruta.`);
    return;
  }

  op.status = 'EN_RUTA';
  op.assignedRef = `${lastDispatchedSummary.poCode} (${lastDispatchedSummary.product}) • ${lastDispatchedSummary.dockName}`;
  notify(true, `OPERADOR ASIGNADO: ${op.name}`, `${op.unit} (${op.assignedDock}) salió en ruta con ${lastDispatchedSummary.lpnId}.`);
  logEvent(op.id, `${op.name} (${op.unit}) asignado a ruta (${lastDispatchedSummary.lpnId})`, true);
}

function releaseOperatorToBase(opId) {
  const op = db.operators.find(o => o.id === opId);
  if (!op) return;

  const prevRef = op.assignedRef || 'ruta previa';
  op.status = 'DISPONIBLE';
  op.assignedRef = null;
  notify(true, `OPERADOR LIBERADO: ${op.name}`, `Regresó a base CEDIS (${prevRef} finalizada) y está DISPONIBLE.`);
  logEvent(op.id, `${op.name} regresó a base -> DISPONIBLE`, true);
}

function dispatchLpn(lpnId) {
  const lpn = db.lpns.find(l => l.id === lpnId);
  if (!lpn) return;

  if (lpn.status === 'DESPACHADA') {
    notify(false, 'DUPLICADO BLOQUEADO', `${lpn.id} ya fue despachado. Surtidor B detenido.`);
    logEvent(lpn.id, 'Intento de doble salida bloqueado', false);
    return;
  }
}

function simulateDuplicatePick() {
  const dispatched = db.lpns.find(l => l.status === 'DESPACHADA');
  if (dispatched) {
    dispatchLpn(dispatched.id);
  } else {
    notify(false, 'DUPLICADO BLOQUEADO: P-501-01', 'Orden de surtido duplicada detenida por control Poka-Yoke.');
    logEvent('P-501-01', 'Orden duplicada Surtidor B bloqueada', false);
  }
}

function advanceOneStorageDay() {
  const activePOs = db.purchaseOrders.filter(po => po.status === 'RECIBIDA');
  if (activePOs.length === 0) {
    notify(false, 'SIN MERCANCÍA EN ALMACÉN', 'Primero escanea una Orden de Compra en 1. Check OC.');
    return;
  }
  activePOs.forEach(po => {
    const poItems = db.lpns.filter(l => l.poCode === po.code);
    const allOut = poItems.length > 0 && poItems.every(l => l.status === 'DESPACHADA');
    if (!allOut) {
      po.daysInWarehouse = (po.daysInWarehouse || 1) + 1;
    }
  });
  notify(true, '+1 DÍA SIMULADO EN ALMACÉN', 'Tarifas diarias actualizadas en 6. Estancia $.');
  logEvent('ESTANCIA', 'Simulación +1 día de almacenaje aplicada', true);
}

// 11. IMPRESIÓN DE ETIQUETA
function openPrintModal(lpnId) {
  const lpn = db.lpns.find(l => l.id === lpnId);
  if (!lpn) return;
  currentPrintingId = lpnId;
  document.getElementById('pm-oc').textContent = lpn.poCode;
  document.getElementById('pm-prod').textContent = lpn.product;
  document.getElementById('pm-rack').textContent = lpn.rack;
  document.getElementById('pm-code').textContent = lpn.id;
  document.getElementById('pm-svg').innerHTML = makeBarcodeSVG(lpn.id);
  document.getElementById('print-modal').classList.remove('hidden');
}

function confirmPrintAndPutaway() {
  if (currentPrintingId) {
    const item = db.lpns.find(l => l.id === currentPrintingId);
    if (item) {
      if (item.status === 'POR_ETIQUETAR') {
        item.status = 'ACOMODADO_EN_RACK';
      }
      db.selectedForkliftLpn = item.id;
      notify(true, `ETIQUETA IMPRESA: ${item.id}`, `Enviado a 3. Asignación Rack (${item.rack}).`);
      logEvent(item.id, `Etiqueta impresa -> Listo para Rack ${item.rack}`, true);
    }
  }
  closePrintModal();
  renderAll();
}

function closePrintModal() {
  document.getElementById('print-modal').classList.add('hidden');
  currentPrintingId = null;
}

// 12. RENDER
function renderAll() {
  // 1. Check OC (solo OC ya escaneadas)
  const poListEl = document.getElementById('po-cards-list');
  const scannedPOs = db.purchaseOrders.filter(po => po.status === 'RECIBIDA');

  if (scannedPOs.length === 0) {
    poListEl.innerHTML = `
      <div class="bg-white border border-dashed border-slate-300 rounded-2xl p-8 text-center space-y-1.5">
        <i class="fa-solid fa-qrcode text-2xl text-slate-300"></i>
        <div class="text-xs font-bold text-slate-500">Ninguna Orden de Compra escaneada aún</div>
        <div class="text-[11px] text-slate-400">Presiona <strong>"ESCANEAR ORDEN DE COMPRA"</strong> arriba para leer el código del operador.</div>
      </div>
    `;
  } else {
    poListEl.innerHTML = scannedPOs.map(po => `
      <div class="bg-white border border-emerald-200 rounded-2xl p-4 shadow-sm space-y-3">
        <div class="flex items-start justify-between gap-2">
          <div>
            <div class="flex items-center gap-2">
              <span class="font-mono text-base font-extrabold text-navy">${po.code}</span>
              <span class="text-[10px] font-mono font-bold px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300">
                VERIFICADA / RECIBIDA
              </span>
            </div>
            <div class="text-xs text-slate-500 mt-0.5">${po.supplier}</div>
          </div>
          <div class="w-28 shrink-0 text-center bg-slate-50 p-1.5 rounded-lg border border-slate-200">
            ${makeBarcodeSVG(po.code)}
            <div class="font-mono text-[9px] font-bold text-slate-600 mt-0.5">${po.code}</div>
          </div>
        </div>

        <div class="flex flex-wrap gap-1.5">
          ${po.products.map(p => `
            <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 text-xs font-semibold">
              <i class="fa-solid fa-box text-navy text-[10px]"></i>
              <span>${p.name}</span>
              ${p.sku ? `<span class="font-mono text-[10px] text-slate-500">(${p.sku})</span>` : ''}
              ${p.qty ? `<span class="text-[10px] text-navy font-bold">&bull; ${p.qty}</span>` : ''}
            </span>
          `).join('')}
        </div>

        ${!po.nextStepDismissed ? `
          <button onclick="advanceFromPoCard('${po.code}')" class="w-full py-3.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-extrabold flex items-center justify-center gap-2 shadow-md shadow-emerald-600/20 transition">
            <span>SIGUIENTE PASO: IR A ETIQUETAS</span>
            <i class="fa-solid fa-arrow-right"></i>
          </button>
        ` : ''}
      </div>
    `).join('');
  }

  // 2. Etiquetas
  const activePoCode = db.lastScannedPoCode;
  const allBatch = activePoCode ? db.lpns.filter(l => l.poCode === activePoCode) : [];
  const readyForRackCount = allBatch.filter(l => l.status === 'ACOMODADO_EN_RACK').length;

  const genLabel = document.getElementById('generated-header-label');
  const nextStepBtn = document.getElementById('next-step-racks-btn');
  const genGrid = document.getElementById('generated-lpns-grid');

  genLabel.textContent = activePoCode
    ? `Etiquetas de ${activePoCode} (${allBatch.length})`
    : `Etiquetas Generadas (0)`;
  if (readyForRackCount > 0) {
    nextStepBtn.classList.remove('hidden');
  } else {
    nextStepBtn.classList.add('hidden');
  }

  if (allBatch.length > 0) {
    genGrid.innerHTML = allBatch.map(l => {
      const isPrinted = l.status !== 'POR_ETIQUETAR';
      return `
        <div class="bg-white border-2 ${isPrinted ? 'border-emerald-300' : 'border-slate-200'} rounded-2xl p-3.5 shadow-sm space-y-2.5">
          <div class="flex items-center justify-between">
            <span class="font-mono text-sm font-extrabold text-navy">${l.id}</span>
            <span class="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full ${isPrinted ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}">
              ${isPrinted ? 'IMPRESA' : 'POR ETIQUETAR'}
            </span>
          </div>
          <div class="text-xs font-bold text-slate-800">${l.product}</div>
          <div class="bg-slate-50 border border-slate-200 rounded-xl p-2 text-center">
            ${makeBarcodeSVG(l.id)}
            <div class="font-mono text-[10px] font-bold text-slate-600 mt-0.5">${l.id}</div>
          </div>
          <div class="flex items-center justify-between pt-1">
            <span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-900 text-white font-mono text-xs font-bold">
              RACK: <span class="text-emerald-300">${l.rack}</span>
            </span>
            <button onclick="openPrintModal('${l.id}')" class="px-3.5 py-2 rounded-xl ${isPrinted ? 'bg-blue-800 hover:bg-blue-900' : 'bg-purple-600 hover:bg-purple-700'} text-white text-xs font-extrabold flex items-center gap-1.5 shadow-sm">
              <i class="fa-solid fa-print"></i> ${isPrinted ? 'Reimprimir Etiqueta' : 'Etiqueta'}
            </button>
          </div>
        </div>
      `;
    }).join('');
  } else {
    genGrid.innerHTML = `
      <div class="col-span-full bg-white border border-dashed border-slate-300 rounded-2xl p-6 text-center text-xs text-slate-400">
        Primero escanea una Orden de Compra en <strong>1. Check OC</strong> para generar sus etiquetas por producto.
      </div>
    `;
  }

  // 3. Racks
  renderRacks();

  // 4. Despacho
  const outboundBox = document.getElementById('outbound-dock-assignment-box');
  if (lastDispatchedSummary) {
    outboundBox.classList.remove('hidden');
    document.getElementById('outbound-dock-title').textContent = `Llevar ${lastDispatchedSummary.product} (${lastDispatchedSummary.lpnId}) a ${lastDispatchedSummary.dockName}`;
    document.getElementById('outbound-dock-sub').textContent = `Rack ${lastDispatchedSummary.freedRack} quedó con estatus: DESOCUPADO.`;
    document.getElementById('outbound-operators-quick-list').innerHTML = db.operators.map(op => {
      const isAvail = op.status === 'DISPONIBLE';
      return `
        <div class="p-2.5 rounded-xl border ${isAvail ? 'bg-slate-50 border-slate-200' : 'bg-amber-50/60 border-amber-200'} flex items-center justify-between gap-2">
          <div class="min-w-0">
            <div class="text-xs font-extrabold text-slate-800 truncate">${op.name}</div>
            <div class="text-[10px] font-mono text-slate-500">${op.unit} &bull; ${op.assignedDock}</div>
          </div>
          ${isAvail ? `
            <button onclick="assignOperatorToRoute('${op.id}')" class="px-2.5 py-1.5 rounded-lg bg-navy hover:bg-blue-900 text-white text-[10px] font-extrabold shrink-0">
              Asignar Ruta
            </button>
          ` : `
            <span class="px-2 py-1 rounded-lg bg-amber-100 text-amber-800 font-mono text-[10px] font-bold shrink-0">
              EN RUTA
            </span>
          `}
        </div>
      `;
    }).join('');
  } else {
    outboundBox.classList.add('hidden');
  }

  const pickList = document.getElementById('picking-list');
  const posWithItems = db.purchaseOrders.filter(po => db.lpns.some(l => l.poCode === po.code));
  const hasAvailableOperators = db.operators.some(op => op.status === 'DISPONIBLE');

  if (posWithItems.length === 0) {
    pickList.innerHTML = `
      <div class="bg-white border border-dashed border-slate-300 rounded-2xl p-6 text-center text-xs text-slate-400">
        Aún no hay mercancía registrada. Escanea una Orden de Compra en <strong>1. Check OC</strong> primero.
      </div>
    `;
  } else {
    const fleetLockBanner = !hasAvailableOperators ? `
      <div class="bg-red-50 border-2 border-red-400 rounded-2xl p-4 flex items-center justify-between gap-3 shadow-sm">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-xl bg-red-600 text-white flex items-center justify-center text-lg shrink-0">
            <i class="fa-solid fa-lock"></i>
          </div>
          <div>
            <div class="text-xs font-extrabold uppercase text-red-950">Despacho Bloqueado: 3 de 3 Operadores en Ruta</div>
            <div class="text-[11px] font-medium text-red-800 mt-0.5">No puedes escanear racks ni productos de salida hasta que regrese al menos un operador a base.</div>
          </div>
        </div>
        <button onclick="goTab('operadores')" class="px-3.5 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-extrabold shrink-0 shadow-sm">
          Ir a 5. Unidades
        </button>
      </div>
    ` : '';

    pickList.innerHTML = fleetLockBanner + posWithItems.map(po => {
      const items = db.lpns.filter(l => l.poCode === po.code);
      const allDispatched = items.every(i => i.status === 'DESPACHADA');
      return `
        <div class="bg-white border ${allDispatched ? 'border-slate-200 opacity-85' : 'border-slate-200'} rounded-2xl p-4 shadow-sm space-y-3">
          <div class="flex items-center justify-between border-b border-slate-100 pb-2.5">
            <div>
              <div class="flex items-center gap-2">
                <span class="font-mono text-base font-extrabold text-navy">${po.code}</span>
                <span class="text-[10px] font-mono font-bold px-2.5 py-0.5 rounded-full ${allDispatched ? 'bg-slate-200 text-slate-600' : 'bg-emerald-100 text-emerald-800'}">
                  ${allDispatched ? 'DESPACHADA A EMBARQUE' : `${items.filter(i => i.status !== 'DESPACHADA').length} PENDIENTE(S)`}
                </span>
              </div>
              <div class="text-xs text-slate-500 mt-0.5">${po.supplier}</div>
            </div>
          </div>

          <div class="space-y-2.5">
            ${items.map(l => {
              const isOut = l.status === 'DESPACHADA';
              return `
                <div class="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5">
                  <div class="flex items-center justify-between gap-2">
                    <div class="min-w-0">
                      <div class="text-xs font-extrabold text-slate-800 truncate">${l.product}</div>
                      <div class="text-[11px] font-mono text-slate-600 mt-0.5 flex flex-wrap items-center gap-1.5">
                        <span class="font-bold text-navy">${l.id}</span>
                        <span>&bull;</span>
                        <span class="font-bold ${isOut ? 'text-emerald-700' : 'text-teal-700'}">
                          ${isOut ? `EN ${l.rack} (RACK DESOCUPADO)` : `RACK: ${l.rack}`}
                        </span>
                      </div>
                    </div>
                    ${isOut ? `
                      <button onclick="dispatchLpn('${l.id}')" class="px-2.5 py-1.5 rounded-xl bg-slate-200 hover:bg-red-100 text-slate-600 hover:text-red-700 text-[10px] font-mono font-bold shrink-0">
                        Despachado (Re-escanear)
                      </button>
                    ` : ''}
                  </div>

                  ${!isOut ? `
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                      <button ${!hasAvailableOperators ? 'disabled' : ''} onclick="openCameraScanner('dispatch-rack', '${l.id}')" class="py-2.5 px-3 rounded-xl ${!hasAvailableOperators ? 'bg-slate-300 text-slate-500 cursor-not-allowed opacity-70' : (l.dispatchRackScanned ? 'bg-emerald-600 text-white' : 'bg-purple-600 hover:bg-purple-700 text-white')} text-xs font-extrabold flex items-center justify-center gap-1.5 shadow-sm transition">
                        <i class="fa-solid ${!hasAvailableOperators ? 'fa-lock' : (l.dispatchRackScanned ? 'fa-circle-check' : 'fa-camera')}"></i>
                        <span>${!hasAvailableOperators ? 'Bloqueado (Sin Operador)' : (l.dispatchRackScanned ? `Rack ${l.rack} Verificado` : `1. Escanear Rack (${l.rack})`)}</span>
                      </button>
                      <button ${!hasAvailableOperators ? 'disabled' : ''} onclick="openCameraScanner('dispatch-prod', '${l.id}')" class="py-2.5 px-3 rounded-xl ${!hasAvailableOperators ? 'bg-slate-300 text-slate-500 cursor-not-allowed opacity-70' : (l.dispatchProdScanned ? 'bg-emerald-600 text-white' : 'bg-blue-800 hover:bg-blue-900 text-white')} text-xs font-extrabold flex items-center justify-center gap-1.5 shadow-sm transition">
                        <i class="fa-solid ${!hasAvailableOperators ? 'fa-lock' : (l.dispatchProdScanned ? 'fa-circle-check' : 'fa-barcode')}"></i>
                        <span>${!hasAvailableOperators ? 'Bloqueado (Sin Operador)' : (l.dispatchProdScanned ? `Producto ${l.id} Verificado` : `2. Escanear Producto (${l.id})`)}</span>
                      </button>
                    </div>
                  ` : ''}
                </div>
              `;
            }).join('')}
          </div>
        </div>
      `;
    }).join('');
  }

  // 5. Unidades
  const opFleetEl = document.getElementById('operators-fleet-list');
  if (opFleetEl) {
    opFleetEl.innerHTML = db.operators.map(op => {
      const isAvail = op.status === 'DISPONIBLE';
      return `
        <div class="bg-white border ${isAvail ? 'border-emerald-200' : 'border-amber-300'} rounded-2xl p-4 shadow-sm flex items-center justify-between gap-3">
          <div class="space-y-1">
            <div class="flex items-center gap-2">
              <span class="font-mono text-xs font-extrabold text-navy">${op.id}</span>
              <span class="text-sm font-extrabold text-slate-900">${op.name}</span>
              <span class="text-[10px] font-mono font-bold px-2.5 py-0.5 rounded-full ${isAvail ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' : 'bg-amber-100 text-amber-800 border border-amber-300'}">
                ${isAvail ? 'DISPONIBLE EN BASE' : 'EN RUTA'}
              </span>
            </div>
            <div class="text-xs font-mono text-slate-500">
              Unidad: <strong class="text-slate-700">${op.unit}</strong> &bull; Bahía base: <strong class="text-navy">${op.assignedDock}</strong>
              ${op.assignedRef ? ` &bull; Carga actual: <strong class="text-amber-800">${op.assignedRef}</strong>` : ''}
            </div>
          </div>
          ${!isAvail ? `
            <button onclick="releaseOperatorToBase('${op.id}')" class="px-3.5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold flex items-center gap-1.5 shrink-0 shadow-sm transition">
              <i class="fa-solid fa-house-circle-check"></i> Registrar Regreso a Base
            </button>
          ` : `
            <span class="text-xs font-mono font-bold text-emerald-700 px-3 py-1.5 rounded-xl bg-emerald-50 border border-emerald-200 shrink-0">
              Listo para salir
            </span>
          `}
        </div>
      `;
    }).join('');
  }

  // 6. Estancia $
  const billingEl = document.getElementById('warehouse-billing-list');
  const receivedPOs = db.purchaseOrders.filter(po => po.status === 'RECIBIDA');
  if (billingEl) {
    if (receivedPOs.length === 0) {
      billingEl.innerHTML = `
        <div class="bg-white border border-dashed border-slate-300 rounded-2xl p-6 text-center text-xs text-slate-400">
          Aún no hay Órdenes de Compra ingresadas al almacén.
        </div>
      `;
    } else {
      billingEl.innerHTML = receivedPOs.map(po => {
        const poItems = db.lpns.filter(l => l.poCode === po.code);
        const allDispatched = poItems.length > 0 && poItems.every(l => l.status === 'DESPACHADA');
        const days = po.daysInWarehouse || 1;
        const rate = Number(po.dailyRate || 450);
        const totalCharge = days * rate;
        return `
          <div class="p-4 rounded-2xl bg-white border ${allDispatched ? 'border-slate-200 opacity-75' : 'border-blue-200'} shadow-sm flex items-center justify-between gap-3">
            <div class="space-y-1">
              <div class="flex items-center gap-2">
                <span class="font-mono text-base font-extrabold text-navy">${po.code}</span>
                <span class="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full ${allDispatched ? 'bg-slate-200 text-slate-600' : 'bg-blue-100 text-navy'}">
                  ${allDispatched ? 'CERRADA / DESPACHADA' : 'EN ALMACÉN'}
                </span>
              </div>
              <div class="text-xs font-semibold text-slate-700">${po.supplier}</div>
              <div class="text-[11px] font-mono text-slate-500">
                Tiempo: <strong class="text-slate-800">${days} ${days === 1 ? 'día' : 'días'}</strong> &bull; Tarifa: <strong>$${rate.toLocaleString('es-MX')} MXN/día</strong>
              </div>
            </div>
            <div class="text-right shrink-0">
              <div class="text-[10px] font-mono font-bold text-slate-400 uppercase">Total Acumulado</div>
              <div class="font-mono text-lg font-extrabold text-emerald-700">$${totalCharge.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</div>
            </div>
          </div>
        `;
      }).join('');
    }
  }

  // 7. Bitácora
  document.getElementById('kpi-blocked').textContent = db.blockedCount;
  document.getElementById('compact-log').innerHTML = db.logs.map(l => `
    <div class="flex items-center justify-between gap-2 text-xs p-2.5 rounded-xl bg-slate-50 border border-slate-200">
      <div class="truncate">
        <span class="font-mono text-slate-400 mr-1.5">${l.time}</span>
        <span class="font-mono font-bold text-navy mr-1.5">${l.ref}</span>
        <span class="text-slate-700">${l.msg}</span>
      </div>
      <span class="shrink-0 text-[10px] font-mono font-bold px-2 py-0.5 rounded ${l.ok ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-700'}">
        ${l.ok ? 'OK' : 'BLOQUEO'}
      </span>
    </div>
  `).join('');

  const bitacoraEl = document.getElementById('bitacora-po-list');
  if (bitacoraEl) {
    bitacoraEl.innerHTML = db.purchaseOrders.map(po => {
      const isDone = po.status === 'RECIBIDA';
      return `
        <div class="bg-white border ${isDone ? 'border-emerald-200' : 'border-slate-200'} rounded-2xl p-4 shadow-sm space-y-3">
          <div class="flex items-start justify-between gap-3">
            <div class="space-y-1">
              <div class="flex flex-wrap items-center gap-2">
                <span class="font-mono text-base font-extrabold text-navy">${po.code}</span>
                <span class="text-[10px] font-mono font-bold px-2.5 py-0.5 rounded-full ${isDone ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' : 'bg-amber-100 text-amber-800 border border-amber-300'}">
                  ${po.status}
                </span>
                <span class="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-600">${po.invoice || 'SIN FACTURA'}</span>
                <span class="text-[10px] font-mono font-extrabold px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">$${Number(po.dailyRate || 450).toLocaleString('es-MX')}/día</span>
              </div>
              <div class="text-xs font-bold text-slate-800">${po.supplier}</div>
              <div class="text-[11px] font-mono text-slate-500">RFC: ${po.rfc || '---'} &bull; Fecha: ${po.date || '---'} &bull; ${po.dock || 'ANDÉN 01'}</div>
            </div>
            <div class="w-28 shrink-0 text-center bg-slate-50 p-1.5 rounded-lg border border-slate-200">
              ${makeBarcodeSVG(po.code)}
              <div class="font-mono text-[9px] font-bold text-slate-600 mt-0.5">${po.code}</div>
            </div>
          </div>

          <div class="flex flex-wrap gap-1.5">
            ${po.products.map(p => `
              <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-50 border border-slate-200 text-slate-700 text-xs font-semibold">
                <i class="fa-solid fa-box text-navy text-[10px]"></i>
                <span>${p.name}</span>
                <span class="font-mono text-[10px] text-slate-500">(${p.sku})</span>
                <span class="text-[10px] text-navy font-bold">&bull; ${p.qty}</span>
              </span>
            `).join('')}
          </div>

          <div class="flex flex-wrap items-center justify-end gap-2 pt-1">
            <button onclick="openPoPdfModal('${po.code}')" class="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold flex items-center gap-1.5 transition">
              <i class="fa-solid fa-eye"></i> Vista Previa
            </button>
            <button onclick="downloadPoPdf('${po.code}')" class="px-4 py-2 rounded-xl bg-navy hover:bg-blue-900 text-white text-xs font-extrabold flex items-center gap-2 shadow-sm transition">
              <i class="fa-solid fa-file-arrow-down text-red-400"></i> Descargar PDF
            </button>
          </div>
        </div>
      `;
    }).join('');
  }

  // Guardar cambios en Supabase (solo escribe lo que cambió)
  scheduleSave();
}

function renderRacks() {
  const pending = db.lpns.filter(l => l.status === 'ACOMODADO_EN_RACK');
  const sel = document.getElementById('forklift-lpn-select');
  const targetEl = document.getElementById('forklift-target-rack');
  const returnBtn = document.getElementById('next-step-finish-racks-btn');

  if (returnBtn) {
    if (showRackReturnNextStep) {
      returnBtn.classList.remove('hidden');
    } else {
      returnBtn.classList.add('hidden');
    }
  }

  if (pending.length === 0) {
    sel.innerHTML = `<option value="">Sin pendientes</option>`;
    targetEl.textContent = '---';
  } else {
    if (!pending.some(l => l.id === db.selectedForkliftLpn)) {
      db.selectedForkliftLpn = pending[0].id;
    }
    sel.innerHTML = pending.map(l => `<option value="${l.id}" ${l.id === db.selectedForkliftLpn ? 'selected' : ''}>${l.id} (${l.product})</option>`).join('');
    const active = pending.find(l => l.id === db.selectedForkliftLpn);
    targetEl.textContent = active.rack;
  }

  const grid = document.getElementById('rack-map-grid');
  grid.innerHTML = db.racks.map(r => {
    let style = 'bg-slate-50 border-slate-200 text-slate-500';
    if (r.status === 'RESERVADO') style = 'bg-amber-50 border-amber-400 text-amber-900';
    if (r.status === 'OCUPADO') style = 'bg-emerald-50 border-emerald-500 text-emerald-900';

    return `
      <div class="p-3 rounded-xl border-2 text-left select-none ${style}">
        <div class="flex items-center justify-between font-mono text-xs font-extrabold">
          <span>${r.code}</span>
          <i class="fa-solid fa-lock text-[10px] opacity-50"></i>
        </div>
        <div class="font-mono text-[11px] font-bold mt-1.5 truncate">${r.lpn || 'LIBRE'}</div>
        <div class="text-[10px] truncate opacity-80">${r.product || 'Disponible'}</div>
      </div>
    `;
  }).join('');
}

// Reiniciar demo: borra los datos en Supabase y vuelve a cargar los datos de ejemplo
async function resetApp() {
  if (!confirm('¿Reiniciar la demo?\n\nSe BORRARÁN las órdenes, etiquetas y bitácora guardadas en Supabase y se cargarán los datos de ejemplo.')) return;

  clearTimeout(Sync.timer);
  clearTimeout(Sync.retryTimer);
  while (Sync.saving) await new Promise(r => setTimeout(r, 100));

  const wasReady = Sync.ready;
  db = JSON.parse(JSON.stringify(DEFAULT_DATA));
  lastDispatchedSummary = null;
  showRackReturnNextStep = false;
  hideFeedback();

  const pill = document.getElementById('status-pill');
  const dot = document.getElementById('status-dot');
  const lbl = document.getElementById('status-label');
  pill.className = 'flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-mono font-bold';
  dot.className = 'w-2.5 h-2.5 rounded-full bg-emerald-500';
  lbl.textContent = 'LISTO';

  if (wasReady) {
    Sync.ready = false; // evita escrituras mientras se limpia
    try {
      setSyncStatus('saving');
      await sb.remove('event_logs', 'id=gt.0');
      await sb.remove('lpns', 'id=neq.__none__');
      await sb.remove('po_products', 'id=gt.0');
      await sb.remove('purchase_orders', 'code=neq.__none__');
      Sync.last = {};
      Sync.ready = true;
      await flushSave();
    } catch (err) {
      console.error('[EFF-EX] Error al reiniciar en Supabase:', err);
      setSyncStatus('error', String(err.message || err));
      Sync.ready = true;
    }
  }
  renderAll();
}

function updateLiveClock() {
  const clockEl = document.getElementById('live-datetime-clock');
  if (!clockEl) return;
  const now = new Date();
  const dateStr = now.toLocaleDateString('es-MX', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });
  const timeStr = now.toLocaleTimeString('es-MX', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
  clockEl.innerHTML = `<i class="fa-regular fa-clock text-purple-600"></i><span>${dateStr.toUpperCase()} &bull; ${timeStr}</span>`;
}

window.addEventListener('DOMContentLoaded', () => {
  const globalCamBtn = document.getElementById('global-cam-btn');
  if (globalCamBtn) {
    globalCamBtn.addEventListener('click', requestGlobalCamera);
  }
  updateLiveClock();
  setInterval(updateLiveClock, 1000);
  goTab('ordenes');
  renderAll();
  initSync();
});
