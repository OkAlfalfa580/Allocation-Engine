'use strict';

/* ─── CONSTANTS ──────────────────────────────────────── */
const SIZE_COLS = ['25','26','27','28','30','32','34','36','38','40','42',
                   'XS','S','M','L','XL','XXL','XXXL','3XL','4XL','5XL'];

/* ─── STATE ──────────────────────────────────────────── */
const state = {
  files: { order: null, billed: null, lot: null },
  data:  { order: [], billed: [], lot: [] },
  orderFormat: null,      // 'long' | 'wide'
  retailers: [],          // [{code, name}] original order
  priority: [],           // [partyName,...] current priority
  lotName: '',
  seasonFilter: 'AW-25',
  allocationResults: [],
  unallocatedResults: [],
  fulfilmentRows: [],
  currentStep: 1
};


/* ─── STEP NAVIGATION ────────────────────────────────── */
function goToStep(n) {
  [1,2,3,4].forEach(i => {
    document.getElementById('panel-'+i).classList.remove('active');
    document.getElementById('step-'+i).classList.remove('active');
  });
  document.getElementById('panel-'+n).classList.add('active');
  document.getElementById('step-'+n).classList.add('active');
  state.currentStep = n;
  if(n===3) buildConfigSummary();
  window.scrollTo({top:0,behavior:'smooth'});
}

function markDone(n) {
  const sc = document.getElementById('sc-'+n);
  sc.innerHTML = '&#10003;';
  document.getElementById('step-'+n).classList.add('done');
}

function tryGoToStep(n) {
  if(n < state.currentStep || document.getElementById('step-'+n).classList.contains('done')) {
    goToStep(n);
  }
}

function updateSeasonBadge() {
  document.getElementById('seasonBadge').textContent = state.seasonFilter || 'SEASON';
}

/* ─── TOAST ──────────────────────────────────────────── */
let _toastTimer = null;
function showToast(msg, type='ok') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'show ' + type;
  if(_toastTimer) clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => { t.className=''; }, 3000);
}

/* ─── LOG BOX ────────────────────────────────────────── */
function log(type, msg) {
  const box = document.getElementById('logBox');
  box.style.display = 'block';
  const ts = new Date().toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false});
  const icon = {ok:'✓',warn:'⚠',err:'✗',info:'→'}[type]||'·';
  const line = document.createElement('div');
  line.className = 'log-line ' + type;
  line.innerHTML = `<span class="log-ts">${ts}</span><span class="log-msg">${icon} ${msg}</span>`;
  line.style.cssText = 'opacity:0;transform:translateX(-8px);transition:opacity 0.18s ease,transform 0.18s ease';
  box.appendChild(line);
  box.scrollTop = box.scrollHeight;
  requestAnimationFrame(() => { line.style.opacity='1'; line.style.transform='translateX(0)'; });
}

function clearLog() {
  const box = document.getElementById('logBox');
  box.innerHTML = '';
  box.style.display = 'none';
}

/* ─── PROGRESS BAR ───────────────────────────────────── */
function setProgress(pct) {
  document.getElementById('progressBar').style.width = pct + '%';
}

/* ─── FILE STATUS ────────────────────────────────────── */
function setFileStatus(key, type, msg) {
  const el = document.getElementById('stat-'+key);
  el.className = 'file-status ' + type;
  el.textContent = msg;
  const card = document.getElementById('card-'+key);
  card.classList.remove('loaded','error-state','shake');
  if(type==='ok') card.classList.add('loaded');
  if(type==='err') {
    card.classList.add('error-state');
    requestAnimationFrame(() => {
      card.classList.add('shake');
      card.addEventListener('animationend', () => card.classList.remove('shake'), {once:true});
    });
  }
}

/* ─── DRAG & DROP (file upload) ──────────────────────── */
function onDragOver(e, cardId) {
  e.preventDefault(); e.stopPropagation();
  document.getElementById(cardId).classList.add('dragover');
}
function onDragLeave(cardId) {
  document.getElementById(cardId).classList.remove('dragover');
}
function onDrop(e, key) {
  e.preventDefault(); e.stopPropagation();
  const cardId = 'card-'+key;
  document.getElementById(cardId).classList.remove('dragover');
  const file = e.dataTransfer.files[0];
  if(file) processFile(key, file);
}
function triggerFile(id) { document.getElementById(id).click(); }
function loadFile(key, input) {
  const file = input.files[0];
  if(file) processFile(key, file);
  input.value='';
}

/* ─── PARSE SIZE ─────────────────────────────────────── */
function parseSize(val) {
  return String(val||'').trim().split(/\s+/)[0].toUpperCase();
}

/* ─── UNPIVOT WIDE ORDER SHEET (SS26) ────────────────── */
function unpivotOrderSheet(rows) {
  const result = [];
  rows.forEach(r => {
    const retailerCode = String(r['Retailer Code']||r['RETAILER CODE']||'').trim();
    const partyName    = String(r['Party Name']||r['PARTY NAME']||'').trim();
    const gender       = String(r['Gender']||r['GENDER']||'').trim();
    const category     = String(r['Category']||r['CATEGORY']||'').trim();
    const subCat       = String(r['Sub Category']||r['SUB CATEGORY']||'').trim();
    const styleName    = String(r['Style NAME']||r['StyleName']||r['STYLE NAME']||'').trim();
    const color        = String(r['Color']||r['COLOR']||r['Colour']||'').trim();
    const productCode  = String(r['PRODUCT CODE']||r['Product Code']||r['product code']||'').trim();
    const fit          = String(r['Fit']||r['FIT']||'').trim();
    if(!partyName || !productCode) return;
    SIZE_COLS.forEach(sz => {
      const qty = parseInt(r[sz]) || 0;
      if(qty <= 0) return;
      result.push({
        'Retailer Code': retailerCode,
        'Party Name': partyName,
        'Gender': gender,
        'Category': category,
        'Sub Category': subCat,
        'StyleName': styleName,
        'Color': color,
        'Product Code': productCode,
        'Fit': fit,
        'Size': sz,
        'Current Quantity': qty
      });
    });
  });
  return result;
}

/* ─── DETECT FORMAT ──────────────────────────────────── */
function detectOrderFormat(rows) {
  if(!rows.length) return 'long';
  const keys = Object.keys(rows[0]).map(k=>k.trim());
  const hasSize = keys.some(k=>/^size$/i.test(k));
  const hasCurrentQty = keys.some(k=>/current.?quantity|current.?qty/i.test(k));
  if(hasSize && hasCurrentQty) return 'long';
  const hasSizeCols = SIZE_COLS.some(s=>keys.includes(s));
  if(hasSizeCols) return 'wide';
  return 'long';
}

/* ─── PROCESS FILE ───────────────────────────────────── */
function processFile(key, file) {
  state.files[key] = file;
  const reader = new FileReader();
  reader.onerror = () => { setFileStatus(key,'err','Error reading file'); };
  reader.onload = e => {
    try {
      const data = new Uint8Array(e.target.result);
      const wb = XLSX.read(data, {type:'array'});

      if(key==='order') {
        // Try sheet names in priority order
        const sheetName = ['H2 25 ORDER FORM','Sheet2'].find(n=>wb.SheetNames.includes(n)) || wb.SheetNames[0];
        const rawRows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], {defval:''});
        if(!rawRows.length) { setFileStatus(key,'err','No data found in sheet: '+sheetName); return; }
        const fmt = detectOrderFormat(rawRows);
        state.orderFormat = fmt;
        if(fmt==='wide') {
          state.data.order = unpivotOrderSheet(rawRows);
          if(!state.data.order.length) { setFileStatus(key,'err','Wide-format detected but no size quantities found'); return; }
          // Auto-set season
          if(!document.getElementById('seasonInput').value || document.getElementById('seasonInput').value==='AW-25') {
            document.getElementById('seasonInput').value = 'SS-26';
            state.seasonFilter = 'SS-26';
            updateSeasonBadge();
          }
        } else {
          state.data.order = rawRows.map(r=>({...r,'Party Name':String(r['Party Name']||'').trim(),'Product Code':String(r['Product Code']||'').trim()}));
        }
        extractRetailersFromOrder();
        const fmtBadge = fmt==='wide'?'<span class="format-badge wide">SS26 Wide</span>':'<span class="format-badge long">AW25 Long</span>';
        setFileStatus(key,'ok', `${file.name} — ${state.data.order.length} lines, ${state.retailers.length} retailers ${fmtBadge}`);
        // Actually set via innerHTML since setFileStatus uses textContent
        const el = document.getElementById('stat-order');
        el.className = 'file-status ok';
        el.innerHTML = `${file.name} &mdash; ${state.data.order.length.toLocaleString()} lines &middot; ${state.retailers.length} retailers ${fmtBadge}`;

      } else if(key==='billed') {
        const sheetName = wb.SheetNames.includes('Report') ? 'Report' : wb.SheetNames[0];
        const sheet = wb.Sheets[sheetName];
        // Header at row index 1 (skip blank row 0)
        const rows = XLSX.utils.sheet_to_json(sheet, {range:1, defval:''});
        state.data.billed = rows;
        setFileStatus(key,'ok',`${file.name} — ${rows.length.toLocaleString()} rows loaded`);

      } else if(key==='lot') {
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet, {defval:''});
        state.data.lot = rows;
        // Try to pre-fill lot name
        const lotCol = findCol(rows, /lot/i);
        if(lotCol && rows[0][lotCol]) {
          const ln = String(rows[0][lotCol]).trim();
          if(ln && !document.getElementById('lotNameInput').value) {
            document.getElementById('lotNameInput').value = ln;
            state.lotName = ln;
          }
        }
        setFileStatus(key,'ok',`${file.name} — ${rows.length.toLocaleString()} rows loaded`);
      }
      showToast(file.name + ' loaded successfully');
    } catch(err) {
      setFileStatus(key,'err','Parse error: '+err.message);
      showToast('Failed to parse '+file.name, 'err');
    }
  };
  reader.readAsArrayBuffer(file);
}

/* ─── FIND COLUMN (regex) ────────────────────────────── */
function findCol(rows, regex) {
  if(!rows.length) return null;
  return Object.keys(rows[0]).find(k=>regex.test(k)) || null;
}

/* ─── EXTRACT RETAILERS ──────────────────────────────── */
function extractRetailersFromOrder() {
  const seen = new Map();
  state.data.order.forEach(r=>{
    const name = String(r['Party Name']||'').trim();
    const code = String(r['Retailer Code']||'').trim();
    if(name && !seen.has(name)) seen.set(name, code);
  });
  state.retailers = Array.from(seen, ([name,code])=>({name,code}));
  state.priority = state.retailers.map(r=>r.name);
  // Update priority hint
  const hint = document.getElementById('priorityHint');
  if(hint) hint.innerHTML = `<span>${state.retailers.length}</span> retailers loaded — Rank 1 = first to receive stock from each lot`;
}

/* ─── STEP 1 → 2 VALIDATION ──────────────────────────── */
function proceedToStep2() {
  if(!state.files.order) { showToast('Please upload the Order Sheet (File 01)', 'err'); return; }
  if(!state.files.billed) { showToast('Please upload the Billed Items file (File 02)', 'err'); return; }
  if(!state.files.lot)   { showToast('Please upload the Lot Stock file (File 03)', 'err'); return; }
  if(!state.data.order.length) { showToast('Order file has no readable rows', 'err'); return; }
  if(!state.retailers.length) { showToast('No retailers found in order file', 'err'); return; }
  // Capture lot name from input
  state.lotName = document.getElementById('lotNameInput').value.trim();
  state.seasonFilter = document.getElementById('seasonInput').value.trim() || 'AW-25';
  updateSeasonBadge();
  markDone(1);
  goToStep(2);
  renderPriorityList();
}

/* ─── PRIORITY LIST ──────────────────────────────────── */
function renderPriorityList() {
  const container = document.getElementById('priorityList');
  container.innerHTML = '';
  state.priority.forEach((name, i) => {
    const code = (state.retailers.find(r=>r.name===name)||{}).code || '';
    const item = document.createElement('div');
    item.className = 'priority-item';
    const safeName = name.replace(/&/g,'&amp;').replace(/"/g,'&quot;');
    item.innerHTML = `
      <input class="p-rank-input" type="number" min="1" value="${i+1}"
             data-name="${safeName}" onchange="applyPriorityOrder()">
      <span class="p-code">${code}</span>
      <span class="p-name">${name}</span>`;
    container.appendChild(item);
  });
  document.getElementById('priorityHint').innerHTML =
    `<span>${state.priority.length}</span> retailers loaded — Rank 1 = first to receive stock from each lot`;
}

function applyPriorityOrder() {
  const inputs = document.querySelectorAll('.p-rank-input');
  const entries = [];
  inputs.forEach(inp => {
    entries.push({ name: inp.dataset.name, rank: parseFloat(inp.value) || 999 });
  });
  entries.sort((a, b) => a.rank - b.rank);
  state.priority = entries.map(e => e.name);
  renderPriorityList();
}

function resetPriority() {
  state.priority = state.retailers.map(r=>r.name);
  renderPriorityList();
}

function reversePriority() {
  state.priority.reverse();
  renderPriorityList();
}

/* ─── CONFIG SUMMARY (Step 3) ────────────────────────── */
function buildConfigSummary() {
  const lotTotal = computeLotTotal();
  document.getElementById('cfg-order').textContent = state.files.order ? state.files.order.name : '—';
  document.getElementById('cfg-order-sub').textContent =
    `${state.data.order.length.toLocaleString()} lines · ${state.retailers.length} retailers · ${state.orderFormat||'?'} format`;
  document.getElementById('cfg-billed').textContent = state.files.billed ? state.files.billed.name : '—';
  document.getElementById('cfg-billed-sub').textContent =
    `${state.data.billed.length.toLocaleString()} rows · Season: ${state.seasonFilter}`;
  document.getElementById('cfg-lot').textContent = state.files.lot ? state.files.lot.name : '—';
  document.getElementById('cfg-lot-sub').textContent =
    `Lot: ${state.lotName||'(unnamed)'} · ${lotTotal.toLocaleString()} units`;
  // Badges
  const badges = document.getElementById('priorityBadges');
  badges.innerHTML = state.priority.slice(0,5).map((n,i)=>
    `<span class="p-badge">#${i+1} ${n}</span>`
  ).join('') + (state.priority.length>5 ? `<span class="p-badge" style="border-color:var(--border);color:var(--sub)">+${state.priority.length-5} more</span>` : '');
}

function computeLotTotal() {
  const rows = state.data.lot;
  const qtyCol = findCol(rows, /qty|quantity|total|pieces|pcs/i);
  if(!qtyCol) return 0;
  return rows.reduce((s,r)=>s+(parseInt(r[qtyCol])||0), 0);
}

/* ─── RUN ALLOCATION ─────────────────────────────────── */
function runAllocation() {
  // Validation
  if(!state.lotName) {
    if(!confirm('Lot number is empty. Continue anyway?')) return;
  }
  const runBtn = document.getElementById('runBtn');
  runBtn.disabled = true;
  runBtn.classList.add('pulsing');
  document.getElementById('progressBar').classList.add('running');
  clearLog();
  setProgress(0);
  setTimeout(executeAllocation, 80);
}

function executeAllocation() {
  try {
    setProgress(8);

    /* ── A: Build orderMap ── */
    log('info', `Processing ${state.data.order.length.toLocaleString()} order lines across ${state.retailers.length} retailers...`);
    const orderMap = {};
    let dupCount = 0;
    state.data.order.forEach(r => {
      const partyName   = String(r['Party Name']||'').trim();
      const productCode = String(r['Product Code']||'').trim();
      const size        = String(r['Size']||'').trim().toUpperCase();
      const qty         = parseInt(r['Current Quantity'])||0;
      if(!partyName||!productCode||!size||qty<=0) return;
      const key = `${partyName}||${productCode}||${size}`;
      if(orderMap[key]) { orderMap[key].orderedQty += qty; dupCount++; }
      else {
        orderMap[key] = {
          retailerCode: String(r['Retailer Code']||'').trim(),
          partyName, gender: String(r['Gender']||'').trim(),
          category: String(r['Category']||'').trim(),
          subCat: String(r['Sub Category']||'').trim(),
          styleName: String(r['StyleName']||r['Style NAME']||'').trim(),
          color: String(r['Color']||'').trim(),
          fit: String(r['Fit']||'').trim(),
          productCode, size, orderedQty: qty
        };
      }
    });
    if(dupCount) log('warn', `${dupCount} duplicate order keys found — quantities summed`);
    setProgress(20);

    /* ── B: Build billedMap ── */
    log('info', `Processing ${state.data.billed.length.toLocaleString()} billed lines (Season: ${state.seasonFilter})...`);
    const billedMap = {};
    const orderPartyNames = new Set(Object.values(orderMap).map(v=>v.partyName));
    const unmatchedBilledParties = new Set();
    let billedSkipped = 0;
    let negativeQtyCount = 0;
    state.data.billed.forEach(r => {
      const season = String(r['SEASON']||r['Season']||'').trim();
      if(season !== state.seasonFilter) { billedSkipped++; return; }
      const partyName = String(r['PARTY NAME']||r['Party Name']||'').trim();
      // Product code: try direct column first, then extract from ITEM NAME
      let productCode = String(r['PRODUCT CODE']||r['Product Code']||'').trim();
      if(!productCode) {
        const itemName = String(r['ITEM NAME']||r['Item Name']||'').trim();
        productCode = itemName.split(/\s+/)[0];
      }
      const size          = parseSize(r['PACK/GRADE']||r['Pack/Grade']||r['SIZE']||r['Size']||'');
      const qty           = parseInt(r['TOTAL QTY']||r['Total Qty']||r['Qty']||0)||0;
      // Billing → Order field mappings
      const shadeName     = String(r['SHADE NAME']||r['Shade Name']||r['SHADE']||'').trim();       // → Color
      const itemGroupName = String(r['ITEM GROUP NAME']||r['Item Group Name']||r['ITEM GROUP']||'').trim(); // → Category
      const billingCat    = String(r['CATEGORY']||r['Category']||'').trim();                       // → Sub Category
      if(!partyName||!productCode||!size||qty===0) return; // allow negatives (returns/credit notes)
      if(qty < 0) negativeQtyCount++;
      if(!orderPartyNames.has(partyName)) unmatchedBilledParties.add(partyName);
      const key = `${partyName}||${productCode}||${size}`;
      if(billedMap[key]) { billedMap[key].billedQty += qty; }
      else { billedMap[key] = { billedQty: qty, partyName, productCode, size, shadeName, itemGroupName, billingCat }; }
    });
    log('ok', `Billed map built: ${Object.keys(billedMap).length.toLocaleString()} unique retailer-article-size combos`);
    if(negativeQtyCount) log('info', `${negativeQtyCount} return/credit note rows found — quantities deducted from billed totals`);
    if(unmatchedBilledParties.size > 0)
      log('warn', `${unmatchedBilledParties.size} billed party names not found in order file`);
    setProgress(35);

    /* ── C: Net pending ── */
    log('info', 'Computing net pending (Ordered − Billed)...');
    const pendingMap = {};
    let overBilledCount = 0;
    Object.keys(orderMap).forEach(key => {
      const o = orderMap[key];
      const billedQty = billedMap[key] ? billedMap[key].billedQty : 0;
      let netPending = o.orderedQty - billedQty;
      if(billedQty > o.orderedQty) { overBilledCount++; netPending = 0; }
      netPending = Math.min(Math.max(0, netPending), o.orderedQty); // clamp: never below 0 or above ordered
      pendingMap[key] = { ...o, billedQty, netPending };
    });
    if(overBilledCount) log('warn', `${overBilledCount} items flagged as over-billed — treated as 0 pending`);
    setProgress(50);

    /* ── D: Parse lot file ── */
    const lotRows = state.data.lot;
    const pcCol   = findCol(lotRows, /product.?code|item.?code|^article$/i) || findCol(lotRows, /item.?name|style/i);
    const szCol   = findCol(lotRows, /^size$|pack.?grade|^grade$/i);
    const qtyCol  = findCol(lotRows, /qty|quantity|total|pieces|pcs/i);
    const descCol = findCol(lotRows, /description|item.?name/i);
    const lotCol  = findCol(lotRows, /lot/i);
    if(!pcCol||!qtyCol) {
      log('err', 'Lot file: cannot detect Product Code or Quantity column'); setProgress(100); return;
    }
    log('info', `Parsing lot stock file... (PC col: "${pcCol}", Size col: "${szCol||'?'}", Qty col: "${qtyCol}")`);
    const lotMap = {};
    let noMatchCount = 0;
    const orderProductCodes = new Set(Object.values(orderMap).map(v=>v.productCode));
    lotRows.forEach(r => {
      let pc = String(r[pcCol]||'').trim();
      // Extract first token if it looks like "CODE description"
      if(pc.includes(' ')) pc = pc.split(/\s+/)[0];
      const sz  = szCol ? parseSize(r[szCol]) : '';
      const qty = parseInt(r[qtyCol])||0;
      const desc = descCol ? String(r[descCol]||'').trim() : '';
      const lot  = lotCol ? String(r[lotCol]||'').trim() : state.lotName;
      if(!pc||qty<=0) return;
      const key = `${pc}||${sz}`;
      if(lotMap[key]) { lotMap[key].availQty += qty; lotMap[key].remaining += qty; }
      else { lotMap[key] = { availQty:qty, remaining:qty, itemName:desc||pc, lot:lot||state.lotName, productCode:pc, size:sz }; }
    });
    const lotKeys = Object.keys(lotMap);
    const lotTotal = lotKeys.reduce((s,k)=>s+lotMap[k].availQty,0);
    log('info', `Lot stock parsed: ${lotKeys.length} article-size combos, ${lotTotal.toLocaleString()} units`);
    lotKeys.forEach(k=>{
      const pc = lotMap[k].productCode;
      if(!orderProductCodes.has(pc)) noMatchCount++;
    });
    if(noMatchCount) log('warn', `${noMatchCount} lot articles have no matching orders`);
    setProgress(65);

    /* ── E: Allocation loop ── */
    log('info', 'Running allocation by priority order...');
    const allocationResults = [];
    const priorityIndex = {};
    state.priority.forEach((name,i)=>{ priorityIndex[name]=i; });

    lotKeys.forEach(lotKey => {
      const [productCode, size] = lotKey.split('||');
      // Find all demanders with netPending > 0
      const demanders = [];
      Object.keys(pendingMap).forEach(ordKey => {
        const o = pendingMap[ordKey];
        if(o.productCode===productCode && o.size===size && o.netPending>0) {
          demanders.push(o);
        }
      });
      // Sort by priority
      demanders.sort((a,b)=>{
        const ia = priorityIndex[a.partyName]??999;
        const ib = priorityIndex[b.partyName]??999;
        return ia-ib;
      });
      demanders.forEach(d => {
        if(lotMap[lotKey].remaining<=0) return;
        const allocQty = Math.min(lotMap[lotKey].remaining, d.netPending);
        lotMap[lotKey].remaining -= allocQty;
        const ordKey = `${d.partyName}||${d.productCode}||${d.size}`;
        pendingMap[ordKey].netPending -= allocQty;
        allocationResults.push({
          partyName: d.partyName, retailerCode: d.retailerCode,
          productCode: d.productCode, size: d.size,
          styleName: d.styleName, color: d.color,
          category: d.category, subCat: d.subCat,
          gender: d.gender, fit: d.fit,
          orderedQty: d.orderedQty, billedQty: d.billedQty,
          allocQty, remainingAfter: d.orderedQty - d.billedQty - allocQty,
          lot: lotMap[lotKey].lot
        });
      });
    });

    const totalAllocated = allocationResults.reduce((s,r)=>s+r.allocQty,0);
    const retailersServed = new Set(allocationResults.map(r=>r.partyName)).size;
    log('ok', `Allocation complete: ${totalAllocated.toLocaleString()} units → ${retailersServed} retailers`);
    setProgress(82);

    /* ── F: Unallocated ── */
    const unallocatedResults = [];
    const allocatedOrderKeys = new Set(allocationResults.map(r=>`${r.partyName}||${r.productCode}||${r.size}`));
    lotKeys.forEach(lotKey => {
      if(lotMap[lotKey].remaining<=0) return;
      const [pc, sz] = lotKey.split('||');
      const hasDemanders = Object.values(pendingMap).some(p=>p.productCode===pc&&p.size===sz&&p.orderedQty>0);
      const hadPending = Object.values(pendingMap).some(p=>p.productCode===pc&&p.size===sz&&(p.orderedQty-p.billedQty)>0);
      let reason = 'No pending orders for this article';
      if(hasDemanders && !hadPending) reason = 'All orders already billed / fulfilled';
      else if(hadPending) reason = 'Excess lot stock — all retailer demand met';
      unallocatedResults.push({
        productCode: pc, size: sz,
        itemName: lotMap[lotKey].itemName,
        availQty: lotMap[lotKey].availQty,
        remaining: lotMap[lotKey].remaining,
        reason
      });
    });
    log('info', `Unallocated: ${unallocatedResults.length} article-size combos, ${unallocatedResults.reduce((s,r)=>s+r.remaining,0).toLocaleString()} units remaining`);
    setProgress(90);

    /* ── G: Fulfilment rows ── */
    const allocMap = {};
    allocationResults.forEach(a=>{ allocMap[`${a.partyName}||${a.productCode}||${a.size}`] = a.allocQty; });
    const fulfilmentRows = Object.keys(pendingMap).map(key => {
      const p = pendingMap[key];
      const allocQty = allocMap[key]||0;
      const billed = p.billedQty;
      const ordered = p.orderedQty;
      let status;
      if(billed >= ordered) status = 'FULLY BILLED';
      else if(billed > ordered) status = 'OVER-BILLED ⚠';
      else if(billed > 0 && allocQty > 0) status = 'PARTIALLY BILLED + ALLOCATED';
      else if(billed === 0 && allocQty > 0) status = 'ALLOCATED — PENDING BILL';
      else if(billed > 0 && allocQty === 0) status = 'PARTIALLY BILLED';
      else status = 'PENDING';
      // Recalculate: over-billed condition
      if(billed > ordered) status = 'OVER-BILLED ⚠';
      const pct = ordered > 0 ? Math.round((billed+allocQty)/ordered*100) : 0;
      // Enrich with billing-mapped fields when order fields are blank
      const b = billedMap[key];
      const color    = p.color    || (b ? b.shadeName     : '');
      const category = p.category || (b ? b.itemGroupName : '');
      const subCat   = p.subCat   || (b ? b.billingCat    : '');
      return { ...p, color, category, subCat, allocQty, status, fulfilPct: pct, netRemaining: Math.max(0,ordered-billed-allocQty) };
    });
    // Append billed-but-not-ordered rows (Ordered = 0)
    Object.keys(billedMap).forEach(key => {
      if(orderMap[key]) return; // already covered via pendingMap
      const b = billedMap[key];
      fulfilmentRows.push({
        retailerCode: '', partyName: b.partyName,
        productCode: b.productCode, size: b.size,
        gender: '', fit: '', styleName: '',
        color:    b.shadeName     || '',   // SHADE NAME → Color
        category: b.itemGroupName || '',   // ITEM GROUP NAME → Category
        subCat:   b.billingCat    || '',   // Category (billing) → Sub Category
        orderedQty: 0, billedQty: b.billedQty,
        allocQty: 0, netRemaining: 0, fulfilPct: 0,
        status: 'OVER-BILLED ⚠'
      });
    });
    log('ok', `Fulfilment report ready: ${fulfilmentRows.length.toLocaleString()} rows`);
    setProgress(100);

    // Save to state
    state.allocationResults = allocationResults;
    state.unallocatedResults = unallocatedResults;
    state.fulfilmentRows = fulfilmentRows;

    showToast('Allocation complete! ' + totalAllocated.toLocaleString() + ' units allocated', 'ok');

    // Stop pulse + glow
    document.getElementById('runBtn').classList.remove('pulsing');
    document.getElementById('progressBar').classList.remove('running');
    // Render results and navigate
    setTimeout(()=>{
      markDone(2); markDone(3);
      renderResults(lotTotal, totalAllocated, unallocatedResults.reduce((s,r)=>s+r.remaining,0), retailersServed);
      goToStep(4);
    }, 600);

  } catch(err) {
    log('err', 'Engine error: ' + err.message);
    showToast('Allocation failed: ' + err.message, 'err');
    const runBtnErr = document.getElementById('runBtn');
    runBtnErr.disabled = false;
    runBtnErr.classList.remove('pulsing');
    document.getElementById('progressBar').classList.remove('running');
    setProgress(0);
    console.error(err);
  }
}

/* ─── RENDER RESULTS ─────────────────────────────────── */
function renderResults(lotTotal, allocated, unallocTotal, retailersServed) {
  animateCounter(document.getElementById('statTotal'), lotTotal, 800);
  animateCounter(document.getElementById('statAlloc'), allocated, 800);
  animateCounter(document.getElementById('statUnalloc'), unallocTotal, 800);
  animateCounter(document.getElementById('statRetailers'), retailersServed, 600);
  document.getElementById('statRetailersSub').textContent = `of ${state.retailers.length} total`;

  // Populate filters
  const retailerSel = document.getElementById('filterRetailer');
  retailerSel.innerHTML = '<option value="">All Retailers</option>';
  const uniqueRetailers = [...new Set(state.allocationResults.map(r=>r.partyName))].sort();
  uniqueRetailers.forEach(n=>{ const o=document.createElement('option');o.value=n;o.textContent=n;retailerSel.appendChild(o); });

  const catSel = document.getElementById('filterCategory');
  catSel.innerHTML = '<option value="">All Categories</option>';
  const uniqueCats = [...new Set(state.allocationResults.map(r=>r.category).filter(Boolean))].sort();
  uniqueCats.forEach(c=>{ const o=document.createElement('option');o.value=c;o.textContent=c;catSel.appendChild(o); });

  renderAllocTable(state.allocationResults);
  renderUnallocTable(state.unallocatedResults);
}

function renderAllocTable(rows) {
  const tbody = document.getElementById('allocTbody');
  if(!rows.length) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="10">No allocated rows to display</td></tr>';
    return;
  }
  tbody.innerHTML = rows.map((r,i)=>`
    <tr>
      <td class="num td-muted">${i+1}</td>
      <td>${r.partyName}</td>
      <td class="td-code">${r.productCode}</td>
      <td class="td-muted">${r.styleName}${r.color?' · '+r.color:''}</td>
      <td>${r.category||'—'}</td>
      <td>${r.size}</td>
      <td class="num">${r.orderedQty}</td>
      <td class="num td-muted">${r.billedQty}</td>
      <td class="num td-green">${r.allocQty}</td>
      <td class="num ${r.remainingAfter>0?'td-amber':'td-muted'}">${r.remainingAfter}</td>
    </tr>`).join('');
}

function renderUnallocTable(rows) {
  const tbody = document.getElementById('unallocTbody');
  if(!rows.length) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="7">All lot stock was allocated</td></tr>';
    return;
  }
  tbody.innerHTML = rows.map((r,i)=>`
    <tr>
      <td class="num td-muted">${i+1}</td>
      <td class="td-code">${r.productCode}</td>
      <td class="td-muted">${r.itemName}</td>
      <td>${r.size}</td>
      <td class="num">${r.availQty}</td>
      <td class="num td-amber">${r.remaining}</td>
      <td><span class="tag tag-muted">${r.reason}</span></td>
    </tr>`).join('');
}

function filterAllocTable() {
  const retailer = document.getElementById('filterRetailer').value;
  const cat = document.getElementById('filterCategory').value;
  let rows = state.allocationResults;
  if(retailer) rows = rows.filter(r=>r.partyName===retailer);
  if(cat) rows = rows.filter(r=>r.category===cat);
  renderAllocTable(rows);
}

/* ─── DOWNLOAD: ALLOCATION.XLSX ──────────────────────── */
function downloadAllocationFile() {
  if(!state.allocationResults.length) { showToast('No allocation results to download', 'err'); return; }
  const wb = XLSX.utils.book_new();

  // Sheet 1: Allocation Detail
  const detail = state.allocationResults.map((r,i)=>({
    '#': i+1,
    'Retailer Code': r.retailerCode,
    'Party Name': r.partyName,
    'Product Code': r.productCode,
    'Style Name': r.styleName,
    'Color': r.color,
    'Category': r.category,
    'Sub Category': r.subCat,
    'Gender': r.gender,
    'Size': r.size,
    'Ordered Qty': r.orderedQty,
    'Already Billed': r.billedQty,
    'Allocated Qty': r.allocQty,
    'Remaining After': r.remainingAfter,
    'Lot': r.lot
  }));
  const ws1 = XLSX.utils.json_to_sheet(detail);
  ws1['!cols'] = [{wch:4},{wch:12},{wch:35},{wch:14},{wch:20},{wch:16},{wch:16},{wch:20},{wch:8},{wch:6},{wch:10},{wch:12},{wch:12},{wch:14},{wch:14}];
  XLSX.utils.book_append_sheet(wb, ws1, 'Allocation Detail');

  // Sheet 2: Summary by Retailer
  const rMap = {};
  state.allocationResults.forEach(r=>{
    if(!rMap[r.partyName]) rMap[r.partyName]={partyName:r.partyName,retailerCode:r.retailerCode,totalAllocated:0,skuCount:0};
    rMap[r.partyName].totalAllocated += r.allocQty;
    rMap[r.partyName].skuCount++;
  });
  const ws2 = XLSX.utils.json_to_sheet(Object.values(rMap).map(r=>({
    'Retailer Code': r.retailerCode, 'Party Name': r.partyName,
    'Total Allocated Units': r.totalAllocated, 'SKUs Count': r.skuCount
  })));
  ws2['!cols']=[{wch:14},{wch:35},{wch:20},{wch:12}];
  XLSX.utils.book_append_sheet(wb, ws2, 'Summary by Retailer');

  // Sheet 3: Unallocated Stock
  const ws3 = XLSX.utils.json_to_sheet(state.unallocatedResults.map((r,i)=>({
    '#': i+1, 'Product Code': r.productCode, 'Item Description': r.itemName,
    'Size': r.size, 'Available in Lot': r.availQty,
    'Unallocated Qty': r.remaining, 'Reason': r.reason
  })));
  ws3['!cols']=[{wch:4},{wch:14},{wch:30},{wch:6},{wch:16},{wch:14},{wch:45}];
  XLSX.utils.book_append_sheet(wb, ws3, 'Unallocated Stock');

  const lotTag = state.lotName ? '_'+state.lotName : '';
  XLSX.writeFile(wb, `Allocation${lotTag}_${today()}.xlsx`);
  showToast('Allocation.xlsx downloaded');
}

/* ─── DOWNLOAD: FULFILMENT_REPORT.XLSX ──────────────── */
function downloadFulfilmentReport() {
  if(!state.fulfilmentRows.length) { showToast('No fulfilment data to download', 'err'); return; }
  const wb = XLSX.utils.book_new();

  // Sheet 1: Full Fulfilment Detail
  const ws1 = XLSX.utils.json_to_sheet(state.fulfilmentRows.map((r,i)=>({
    '#': i+1,
    'Retailer Code': r.retailerCode,
    'Party Name': r.partyName,
    'Product Code': r.productCode,
    'Style Name': r.styleName,
    'Color': r.color,
    'Category': r.category,
    'Sub Category': r.subCat,
    'Gender': r.gender,
    'Size': r.size,
    'Ordered': r.orderedQty,
    'Billed': r.billedQty,
    'Allocated': r.allocQty,
    'Net Remaining': r.netRemaining,
    'Fulfilment %': r.fulfilPct,
    'Status': r.status
  })));
  ws1['!cols']=[{wch:4},{wch:12},{wch:35},{wch:14},{wch:20},{wch:16},{wch:16},{wch:20},{wch:8},{wch:6},{wch:8},{wch:8},{wch:9},{wch:12},{wch:12},{wch:28}];
  XLSX.utils.book_append_sheet(wb, ws1, 'Full Fulfilment Detail');

  // Sheet 2: Summary by Retailer
  const rMap = {};
  state.fulfilmentRows.forEach(r=>{
    if(!rMap[r.partyName]) rMap[r.partyName]={partyName:r.partyName,retailerCode:r.retailerCode,ordered:0,billed:0,allocated:0,remaining:0};
    rMap[r.partyName].ordered+=r.orderedQty;
    rMap[r.partyName].billed+=r.billedQty;
    rMap[r.partyName].allocated+=r.allocQty;
    rMap[r.partyName].remaining+=r.netRemaining;
  });
  const ws2 = XLSX.utils.json_to_sheet(Object.values(rMap).map(r=>({
    'Retailer Code':r.retailerCode,'Party Name':r.partyName,
    'Total Ordered':r.ordered,'Total Billed':r.billed,
    'Total Allocated':r.allocated,'Net Remaining':r.remaining,
    'Fulfilment %': r.ordered>0?Math.round((r.billed+r.allocated)/r.ordered*100):0
  })));
  ws2['!cols']=[{wch:14},{wch:35},{wch:12},{wch:12},{wch:14},{wch:12},{wch:12}];
  XLSX.utils.book_append_sheet(wb, ws2, 'Summary by Retailer');

  // Sheet 3: Summary by Category
  const cMap = {};
  state.fulfilmentRows.forEach(r=>{
    const cat = r.category||'Uncategorized';
    if(!cMap[cat]) cMap[cat]={category:cat,ordered:0,billed:0,allocated:0,remaining:0};
    cMap[cat].ordered+=r.orderedQty;
    cMap[cat].billed+=r.billedQty;
    cMap[cat].allocated+=r.allocQty;
    cMap[cat].remaining+=r.netRemaining;
  });
  const ws3 = XLSX.utils.json_to_sheet(Object.values(cMap).map(c=>({
    'Category':c.category,'Total Ordered':c.ordered,'Total Billed':c.billed,
    'Total Allocated':c.allocated,'Net Remaining':c.remaining,
    'Fulfilment %': c.ordered>0?Math.round((c.billed+c.allocated)/c.ordered*100):0
  })));
  ws3['!cols']=[{wch:20},{wch:12},{wch:12},{wch:14},{wch:12},{wch:12}];
  XLSX.utils.book_append_sheet(wb, ws3, 'Summary by Category');

  const lotTag = state.lotName ? '_'+state.lotName : '';
  XLSX.writeFile(wb, `Fulfilment_Report${lotTag}_${today()}.xlsx`);
  showToast('Fulfilment_Report.xlsx downloaded');
}

/* ─── TEMPLATE DOWNLOADS ─────────────────────────────── */
function downloadTemplate(type) {
  const wb = XLSX.utils.book_new();
  if(type==='order') {
    const ws = XLSX.utils.aoa_to_sheet([
      ['Retailer Code','Party Name','Gender','Category','Sub Category','StyleName','Color','Product Code','Size','Current Quantity'],
      ['9437053407','ALISHAN(LEVIS) -BHUBANESWAR','Men','Top','M-Sweatshirts','2612','Grey','0004F-0022','L',2],
      ['9437053407','ALISHAN(LEVIS) -BHUBANESWAR','Men','Top','M-Sweatshirts','2612','Grey','0004F-0022','M',1],
      ['[NOTE]','Fill one row per retailer × product × size combination. Current Quantity = pieces ordered.']
    ]);
    ws['!cols']=[{wch:14},{wch:35},{wch:8},{wch:14},{wch:18},{wch:10},{wch:10},{wch:14},{wch:6},{wch:16}];
    XLSX.utils.book_append_sheet(wb, ws, 'H2 25 ORDER FORM');
    XLSX.writeFile(wb, 'Template_Order_Sheet.xlsx');
  } else if(type==='billed') {
    const ws = XLSX.utils.aoa_to_sheet([
      [],
      ['SNO.','PARTY NAME','BILL DATE','BILL NO.','ITEM CODE','ITEM NAME','SHADE NAME','PACK/GRADE','ITEM GROUP NAME','M.R.P.','RATE/UNIT','RATE/PACK','TOTAL QTY','GROSS AMOUNT','TAX (RS)','TAX-1(RS)','NET AMOUNT','CATEGORY','DEPARTMENT','SEASON','GROUP5.GRP1','HSN','LOT NO.','MARGIN(%)'],
      [1,'ALISHAN(LEVIS) -BHUBANESWAR','01/09/2025','GLVS-1','5401221266827','002JU-0009 DARK INDIGO','DARK INDIGO','32 34','JEANS',6319,3796.77,3796.77,2,7593.54,455.61,455.61,8504.76,'JEANS',511,'AW-25','LEVIS PRICE LIST',62034990,'5081658986',36.71],
      ['[NOTE]','IMPORTANT: Row 1 must remain blank. Headers on row 2. ITEM NAME must start with Product Code followed by a space. PACK/GRADE for jeans: "32 34". SEASON must match the season filter.']
    ]);
    ws['!cols']=[{wch:5},{wch:35},{wch:12},{wch:12},{wch:16},{wch:28},{wch:16},{wch:10},{wch:18},{wch:8},{wch:10},{wch:10},{wch:10},{wch:14},{wch:10},{wch:10},{wch:12},{wch:12},{wch:10},{wch:8},{wch:20},{wch:12},{wch:14},{wch:10}];
    XLSX.utils.book_append_sheet(wb, ws, 'Report');
    XLSX.writeFile(wb, 'Template_Billed_Report.xlsx');
  } else if(type==='lot') {
    const ws = XLSX.utils.aoa_to_sheet([
      ['Product Code','Size','Quantity','Lot Number'],
      ['002JU-0009',32,24,'5082898055'],
      ['002JU-0009',34,12,'5082898055'],
      ['0004F-0022','L',8,'5082898055'],
      ['[NOTE]','Product Code must exactly match the order sheet. Size: use numeric waist size for jeans (32, 34…), letter size for apparel (S, M, L, XL…). Lot Number optional.']
    ]);
    ws['!cols']=[{wch:14},{wch:6},{wch:10},{wch:14}];
    XLSX.utils.book_append_sheet(wb, ws, 'Lot Stock');
    XLSX.writeFile(wb, 'Template_Lot_Stock.xlsx');
  }
  showToast('Template downloaded', 'info');
}

/* ─── UTILITIES ──────────────────────────────────────── */
function today() {
  return new Date().toISOString().slice(0,10);
}

/* ─── STAT COUNTER ───────────────────────────────────── */
function animateCounter(el, target, duration) {
  const start = performance.now();
  function tick(now) {
    const elapsed = now - start;
    const progress = Math.min(elapsed / duration, 1);
    const ease = 1 - Math.pow(1 - progress, 3); // easeOutCubic
    const current = Math.round(target * ease);
    el.textContent = current.toLocaleString();
    if(progress < 1) requestAnimationFrame(tick);
    else el.textContent = target.toLocaleString();
  }
  requestAnimationFrame(tick);
}

/* ─── GOOGLE SHEETS INTEGRATION ──────────────────────── */
const GS_LS_KEY = 'levis_gs_config';

function loadGsConfig() {
  try { return JSON.parse(localStorage.getItem(GS_LS_KEY)) || null; } catch(e) { return null; }
}
function saveGsConfig(cfg) {
  localStorage.setItem(GS_LS_KEY, JSON.stringify(cfg));
}
function parseSheetId(urlOrId) {
  const m = String(urlOrId).match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return m ? m[1] : String(urlOrId).trim();
}

function toggleGsConfig() {
  const el = document.getElementById('gsConfig');
  const hidden = el.style.display === 'none' || el.style.display === '';
  if(hidden){ populateGsConfigForm(); el.style.display = 'block'; }
  else { el.style.display = 'none'; }
}

function populateGsConfigForm() {
  const cfg = loadGsConfig();
  if(!cfg) return;
  document.getElementById('gsApiKey').value    = cfg.apiKey || '';
  document.getElementById('gsUrlOrder').value  = (cfg.order  && cfg.order.sheetId)  || '';
  document.getElementById('gsTabOrder').value  = (cfg.order  && cfg.order.tabName)  || '';
  document.getElementById('gsUrlBilled').value = (cfg.billed && cfg.billed.sheetId) || '';
  document.getElementById('gsTabBilled').value = (cfg.billed && cfg.billed.tabName) || '';
  document.getElementById('gsUrlLot').value    = (cfg.lot    && cfg.lot.sheetId)    || '';
  document.getElementById('gsTabLot').value    = (cfg.lot    && cfg.lot.tabName)    || '';
}

function readGsConfigForm() {
  return {
    apiKey: document.getElementById('gsApiKey').value.trim(),
    order:  { sheetId: parseSheetId(document.getElementById('gsUrlOrder').value),  tabName: document.getElementById('gsTabOrder').value.trim() },
    billed: { sheetId: parseSheetId(document.getElementById('gsUrlBilled').value), tabName: document.getElementById('gsTabBilled').value.trim() },
    lot:    { sheetId: parseSheetId(document.getElementById('gsUrlLot').value),    tabName: document.getElementById('gsTabLot').value.trim() }
  };
}

async function fetchSheetValues(sheetId, tabName, apiKey) {
  const range = encodeURIComponent(tabName || 'Sheet1');
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${range}?key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url);
  if(!res.ok) {
    const err = await res.json().catch(()=>({}));
    throw new Error((err.error && err.error.message) || ('HTTP ' + res.status));
  }
  const json = await res.json();
  return json.values || [];
}

function sheetValuesToObjects(values, headerRowIndex) {
  headerRowIndex = headerRowIndex || 0;
  if(values.length <= headerRowIndex) return [];
  const headers = values[headerRowIndex].map(h => String(h).trim());
  const rows = [];
  for(let i = headerRowIndex + 1; i < values.length; i++) {
    const row = {};
    headers.forEach((h, j) => { row[h] = values[i][j] !== undefined ? values[i][j] : ''; });
    rows.push(row);
  }
  return rows;
}

async function loadFromGoogleSheets(key) {
  const cfg = loadGsConfig();
  if(!cfg || !cfg.apiKey) { showToast('Configure Google Sheets first', 'err'); toggleGsConfig(); return; }
  const sheetCfg = cfg[key];
  if(!sheetCfg || !sheetCfg.sheetId) { showToast('No sheet configured for ' + key + ' — open Settings', 'err'); toggleGsConfig(); return; }

  setFileStatus(key, 'info', '⬡ Fetching from Google Sheets...');
  try {
    // Billed sheet: headers on row index 1 (row 0 is blank)
    const headerRowIndex = key === 'billed' ? 1 : 0;
    const values = await fetchSheetValues(sheetCfg.sheetId, sheetCfg.tabName, cfg.apiKey);
    const rows = sheetValuesToObjects(values, headerRowIndex);
    if(!rows.length) { setFileStatus(key, 'err', 'No data found in sheet'); return; }

    const sourceName = (sheetCfg.tabName || 'Sheet') + ' (Google Sheets)';
    state.files[key] = { name: sourceName }; // satisfies proceedToStep2 validation

    if(key === 'order') {
      const fmt = detectOrderFormat(rows);
      state.orderFormat = fmt;
      if(fmt === 'wide') {
        state.data.order = unpivotOrderSheet(rows);
        if(!state.data.order.length) { setFileStatus(key,'err','Wide-format detected but no size quantities found'); return; }
        if(!document.getElementById('seasonInput').value || document.getElementById('seasonInput').value === 'AW-25') {
          document.getElementById('seasonInput').value = 'SS-26';
          state.seasonFilter = 'SS-26';
          updateSeasonBadge();
        }
      } else {
        state.data.order = rows.map(r => ({...r, 'Party Name': String(r['Party Name']||'').trim(), 'Product Code': String(r['Product Code']||'').trim()}));
      }
      extractRetailersFromOrder();
      const fmtBadge = fmt==='wide' ? '<span class="format-badge wide">SS26 Wide</span>' : '<span class="format-badge long">AW25 Long</span>';
      const el = document.getElementById('stat-order');
      el.className = 'file-status ok';
      el.innerHTML = sourceName + ' &mdash; ' + state.data.order.length.toLocaleString() + ' lines &middot; ' + state.retailers.length + ' retailers ' + fmtBadge;

    } else if(key === 'billed') {
      state.data.billed = rows;
      setFileStatus(key, 'ok', sourceName + ' — ' + rows.length.toLocaleString() + ' rows loaded');

    } else if(key === 'lot') {
      state.data.lot = rows;
      const lotCol = findCol(rows, /lot/i);
      if(lotCol && rows[0][lotCol]) {
        const ln = String(rows[0][lotCol]).trim();
        if(ln && !document.getElementById('lotNameInput').value) {
          document.getElementById('lotNameInput').value = ln;
          state.lotName = ln;
        }
      }
      setFileStatus(key, 'ok', sourceName + ' — ' + rows.length.toLocaleString() + ' rows loaded');
    }
    showToast(key.charAt(0).toUpperCase() + key.slice(1) + ' fetched from Google Sheets');

  } catch(err) {
    setFileStatus(key, 'err', 'Fetch error: ' + err.message);
    showToast('Failed to fetch ' + key + ': ' + err.message, 'err');
  }
}

async function fetchAllSheets() {
  await loadFromGoogleSheets('order');
  await loadFromGoogleSheets('billed');
  await loadFromGoogleSheets('lot');
}

async function saveAndFetchAll() {
  const cfg = readGsConfigForm();
  if(!cfg.apiKey) { showToast('API Key is required', 'err'); return; }
  if(!cfg.order.sheetId || !cfg.billed.sheetId || !cfg.lot.sheetId) {
    showToast('Please fill in all three sheet URLs/IDs', 'err'); return;
  }
  saveGsConfig(cfg);
  document.getElementById('gsConfig').style.display = 'none';
  document.getElementById('gsBanner').style.display = 'flex';
  await fetchAllSheets();
}

// Auto-init: if config already saved, show banner and fetch on load
(function initGs() {
  const cfg = loadGsConfig();
  if(cfg && cfg.apiKey) {
    document.getElementById('gsBanner').style.display = 'flex';
    fetchAllSheets();
  } else {
    // First visit — show config panel open
    document.getElementById('gsConfig').style.display = 'block';
  }
})();

function resetAll() {
  state.files = {order:null,billed:null,lot:null};
  state.data  = {order:[],billed:[],lot:[]};
  state.orderFormat = null;
  state.retailers = [];
  state.priority = [];
  state.lotName = '';
  state.seasonFilter = 'AW-25';
  state.allocationResults = [];
  state.unallocatedResults = [];
  state.fulfilmentRows = [];
  state.currentStep = 1;
  // Reset UI
  ['order','billed','lot'].forEach(k=>{
    setFileStatus(k,'','');
    document.getElementById('card-'+k).classList.remove('loaded','error-state');
  });
  document.getElementById('lotNameInput').value = '';
  document.getElementById('seasonInput').value = 'AW-25';
  document.getElementById('seasonBadge').textContent = 'AW-25';
  document.getElementById('priorityList').innerHTML = '';
  clearLog();
  setProgress(0);
  const runBtnReset = document.getElementById('runBtn');
  runBtnReset.disabled = false;
  runBtnReset.classList.remove('pulsing');
  document.getElementById('progressBar').classList.remove('running');
  // Reset step bar
  [1,2,3,4].forEach(i=>{
    document.getElementById('step-'+i).classList.remove('done','active');
    document.getElementById('sc-'+i).innerHTML = String(i);
  });
  goToStep(1);
}
