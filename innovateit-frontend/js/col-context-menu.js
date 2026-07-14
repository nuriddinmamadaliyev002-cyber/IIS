/**
 * ═══════════════════════════════════════════════════
 *  Col Context Menu — Ustun ustida o'ng-klik menyu
 * ═══════════════════════════════════════════════════
 *
 *  Ishlatish:
 *    ColContextMenu.init('bux-table-main', COL_LABELS);
 *
 *  Menu imkoniyatlari:
 *  ├─ ⬆ A→Z tartiblash
 *  ├─ ⬇ Z→A tartiblash
 *  ├─ ✕ Tartibni bekor qilish
 *  ├─ ─────────────
 *  └─ 🙈 Ustunni yashirish
 */

const ColContextMenu = (() => {

  let tableId   = null;
  let colLabels = {};
  let menu      = null;
  let currentTh = null;
  let currentCol= null;

  // Hozirgi sort holati
  let sortState = { col: null, dir: null }; // dir: 'asc' | 'desc'

  // Tashqi callback lar (buxgalter.js dan)
  let onHide   = null; // (col) => void
  let onSort   = null; // (col, dir) => void — agar null bo'lsa, ichki sort ishlatiladi
  let getRows  = null; // () => FILTERED array
  let setRows  = null; // (sorted) => void + renderTable()
  let onFilter   = null; // (col, Set|null) => void — Set berilsa filter qo'llanadi, null bo'lsa tozalanadi
  let getAllRows = null; // () => barcha qatorlar (filtersiz), unique qiymatlarni chiqarish uchun
  let getFilter  = null; // (col) => Set|null — hozirgi ustun uchun faol filter

  // Filter panel holati
  let filterPanel   = null;
  let filterCol     = null;
  let filterOptions = []; // [{ value, label, count, checked }]

  /* ─────────────────────────────────────
     init
  ───────────────────────────────────── */
  function init(id, labels, options = {}) {
    tableId   = id;
    colLabels = labels || {};
    onHide    = options.onHide     || null;
    onSort    = options.onSort     || null;
    getRows   = options.getRows    || null;
    setRows   = options.setRows    || null;
    onFilter  = options.onFilter   || null;
    getAllRows= options.getAllRows || null;
    getFilter = options.getFilter  || null;

    _buildMenu();
    _attachListeners();
  }

  /* ─────────────────────────────────────
     Menu elementini yaratish
  ───────────────────────────────────── */
  function _buildMenu() {
    // Agar bor bo'lsa — qayta ishlatamiz
    menu = document.getElementById('col-context-menu');
    if (menu) return;

    menu = document.createElement('div');
    menu.id = 'col-context-menu';
    menu.innerHTML = `
      <div class="ctx-header" id="ctx-col-name">—</div>
      <div class="ctx-item" id="ctx-sort-asc"  onclick="ColContextMenu._doSort('asc')">
        <span class="ctx-icon">⬆</span> A → Z tartiblash
      </div>
      <div class="ctx-item" id="ctx-sort-desc" onclick="ColContextMenu._doSort('desc')">
        <span class="ctx-icon">⬇</span> Z → A tartiblash
      </div>
      <div class="ctx-item" id="ctx-sort-clear" onclick="ColContextMenu._doSort(null)" style="display:none;">
        <span class="ctx-icon">↕</span> Tartibni bekor qilish
      </div>
      <div class="ctx-sep" id="ctx-sep-1"></div>
      <div class="ctx-item" id="ctx-filter" onclick="ColContextMenu._openFilterPanel()">
        <span class="ctx-icon">🔎</span> Qiymatlar bo'yicha filter
      </div>
      <div class="ctx-item" id="ctx-filter-clear" onclick="ColContextMenu._clearFilterFromMenu()" style="display:none;">
        <span class="ctx-icon">✕</span> Filterni tozalash
      </div>
      <div class="ctx-sep" id="ctx-sep-2"></div>
      <div class="ctx-item danger" id="ctx-hide" onclick="ColContextMenu._doHide()">
        <span class="ctx-icon">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
            <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
            <line x1="1" y1="1" x2="23" y2="23"/>
          </svg>
        </span> Ustunni yashirish
      </div>
    `;
    document.body.appendChild(menu);
  }

  /* ─────────────────────────────────────
     Thead th larga contextmenu listener
  ───────────────────────────────────── */
  function _attachListeners() {
    const table = document.getElementById(tableId);
    if (!table) return;

    table.querySelectorAll('thead th').forEach(th => {
      // Oldingi listener ni olib tashlaymiz (ikki marta init bo'lmasligi uchun)
      th.removeEventListener('contextmenu', _onRightClick);
      th.addEventListener('contextmenu', _onRightClick);
    });

    // Tashqarida klik → menyuni yopish
    document.addEventListener('click',       _closeMenu);
    document.addEventListener('contextmenu', _onDocContextMenu);
    document.addEventListener('keydown',     _onKeyDown);
  }

  /* ─────────────────────────────────────
     Right-click handler
  ───────────────────────────────────── */
  function _onRightClick(e) {
    e.preventDefault();
    e.stopPropagation();

    currentTh  = e.currentTarget;
    currentCol = currentTh.getAttribute('data-col');

    if (!currentCol) return; // №, nomlarsiz th lar uchun

    // "num" va "name" ustunlarini ham menyu ko'rsatadi (sort uchun)
    _showMenu(e.clientX, e.clientY);
  }

  /* ─────────────────────────────────────
     Menyuni ko'rsatish
  ───────────────────────────────────── */
  function _showMenu(x, y) {
    if (!menu) _buildMenu();

    // Header nomi
    const label = colLabels[currentCol]
      || currentTh?.textContent?.trim().replace(/[⬆⬇↕]/g, '').trim()
      || currentCol;
    document.getElementById('ctx-col-name').textContent = label.toUpperCase();

    // Sort clear — faqat hozir bu ustun sort qilingan bo'lsa ko'rinsin
    const isSorted = sortState.col === currentCol;
    document.getElementById('ctx-sort-clear').style.display = isSorted ? '' : 'none';

    // Sort indicator highlight
    document.getElementById('ctx-sort-asc').style.fontWeight
      = (isSorted && sortState.dir === 'asc') ? '700' : '';
    document.getElementById('ctx-sort-desc').style.fontWeight
      = (isSorted && sortState.dir === 'desc') ? '700' : '';

    // Filter faollik holati
    const hasFilter = getFilter ? !!getFilter(currentCol) : false;

    const hideBtn        = document.getElementById('ctx-hide');
    const sep2            = document.getElementById('ctx-sep-2');
    const filterBtn       = document.getElementById('ctx-filter');
    const filterClearBtn  = document.getElementById('ctx-filter-clear');
    const sep1            = document.getElementById('ctx-sep-1');

    if (currentCol === 'num') {
      // № ustuni — na filter, na yashirish mantiqiy emas
      filterBtn.style.display = 'none';
      filterClearBtn.style.display = 'none';
      sep1.style.display = 'none';
      hideBtn.style.display = 'none';
      sep2.style.display = 'none';
    } else if (currentCol === 'name') {
      // Ism — filter mumkin, lekin yashirish mumkin emas
      filterBtn.style.display = '';
      filterClearBtn.style.display = hasFilter ? '' : 'none';
      sep1.style.display = '';
      hideBtn.style.display = 'none';
      sep2.style.display = 'none';
    } else {
      filterBtn.style.display = '';
      filterClearBtn.style.display = hasFilter ? '' : 'none';
      sep1.style.display = '';
      hideBtn.style.display = '';
      sep2.style.display = '';
    }

    // Pozitsiya — ekrandan tashqariga chiqmasin
    menu.style.display = 'block';
    const mw = menu.offsetWidth  || 200;
    const mh = menu.offsetHeight || 180;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let left = x + 2;
    let top  = y + 2;
    if (left + mw > vw) left = vw - mw - 8;
    if (top  + mh > vh) top  = vh - mh - 8;

    menu.style.left = left + 'px';
    menu.style.top  = top  + 'px';
  }

  /* ─────────────────────────────────────
     Menyuni yopish
  ───────────────────────────────────── */
  function _closeMenu() {
    if (menu) menu.style.display = 'none';
    currentTh  = null;
    currentCol = null;
  }

  function _onDocContextMenu(e) {
    // Th ustida emas bo'lsa — menyuni yopamiz
    if (!e.target.closest('thead th')) {
      _closeMenu();
    }
  }

  function _onKeyDown(e) {
    if (e.key === 'Escape') { _closeMenu(); _closeFilterPanel(); }
  }

  /* ─────────────────────────────────────
     Sort
  ───────────────────────────────────── */
  function _doSort(dir) {
    // currentCol ni oldin saqlaymiz — _closeMenu() null qilib yuboradi
    const col = currentCol;
    _closeMenu();
    if (!col && dir !== null) return;
    // dir===null holatda sortState.col dan olamiz
    const targetCol = col || sortState.col;
    if (!targetCol) return;

    // Sort holatini yangilash
    if (dir === null) {
      sortState = { col: null, dir: null };
    } else {
      sortState = { col: targetCol, dir };
    }

    // Barcha th lardan sort class larni olib tashlash
    const table = document.getElementById(tableId);
    if (table) {
      table.querySelectorAll('thead th').forEach(th => {
        th.classList.remove('sorted-asc', 'sorted-desc');
      });
      if (dir && targetCol) {
        const activeTh = table.querySelector(`thead th[data-col="${targetCol}"]`);
        if (activeTh) activeTh.classList.add(`sorted-${dir}`);
      }
    }

    // Tashqi sort funksiyasi bor bo'lsa ishlatamiz
    if (onSort) {
      onSort(targetCol, dir);
      return;
    }

    // Ichki sort — getRows/setRows orqali
    if (!getRows || !setRows) return;
    const rows = getRows();
    if (!rows || rows.length === 0) return;

    if (dir === null) {
      // Original tartibga qaytish — id bo'yicha
      const sorted = [...rows].sort((a, b) => {
        const ai = a.student?.id || a.id || 0;
        const bi = b.student?.id || b.id || 0;
        return ai - bi;
      });
      setRows(sorted);
      return;
    }

    const sorted = [...rows].sort((a, b) => {
      const va = _getVal(a, targetCol);
      const vb = _getVal(b, targetCol);
      const cmp = _compare(va, vb);
      return dir === 'asc' ? cmp : -cmp;
    });
    setRows(sorted);
  }

  /* Qiymat olish — nested object dan */
  function _getVal(row, col) {
    const s = row.student || row;
    const t = row.tolov   || {};
    const map = {
      name:   `${s.familiya || ''} ${s.ism || ''}`.trim(),
      maktab: s.maktab  || '',
      sinf:   s.sinf    || '',
      tel:    s.telefon || '',
      qayd:   t.qaydnoma          || '',
      ehtimoliy: t.ehtimoliy_tolov_sanasi || '',
      gap:    t.gaplashilgan_vaqt || '',
      kerak:  parseInt(t.tolov_kerak  || 0),
      qildi:  parseInt(t.tolov_qildi  || 0),
      sana:   t.tolov_sanasi      || '',
      holat:  (parseInt(t.tolov_kerak||0) - parseInt(t.tolov_qildi||0)),
      kvit:   t.kvitansiya_fayl   || '',
      num:    s.id || 0,
    };
    return map[col] !== undefined ? map[col] : '';
  }

  function _compare(a, b) {
    if (typeof a === 'number' && typeof b === 'number') return a - b;
    return String(a).localeCompare(String(b), 'uz', { numeric: true });
  }

  /* ─────────────────────────────────────
     Filter panel — qurish
  ───────────────────────────────────── */
  function _buildFilterPanel() {
    filterPanel = document.getElementById('col-filter-panel');
    if (filterPanel) return;

    filterPanel = document.createElement('div');
    filterPanel.id = 'col-filter-panel';
    filterPanel.innerHTML = `
      <div class="cfp-header">
        <span id="cfp-title">—</span>
        <button type="button" class="cfp-close" onclick="ColContextMenu._closeFilterPanel()">×</button>
      </div>
      <div class="cfp-toolbar">
        <button type="button" class="cfp-link" onclick="ColContextMenu._filterSelectAll(true)">Barchasini belgilash</button>
        <span class="cfp-dot">·</span>
        <button type="button" class="cfp-link" onclick="ColContextMenu._filterSelectAll(false)">Hech birini belgilamaslik</button>
      </div>
      <div class="cfp-list" id="cfp-list"></div>
      <div class="cfp-footer">
        <button type="button" class="cfp-btn cfp-btn-ghost" id="cfp-clear-btn" onclick="ColContextMenu._clearFilter()" style="display:none;">Filterni tozalash</button>
        <div class="cfp-footer-right">
          <button type="button" class="cfp-btn cfp-btn-cancel" onclick="ColContextMenu._closeFilterPanel()">Bekor qilish</button>
          <button type="button" class="cfp-btn cfp-btn-apply" onclick="ColContextMenu._applyFilter()">Qo'llash</button>
        </div>
      </div>
    `;
    document.body.appendChild(filterPanel);
  }

  /* ─────────────────────────────────────
     Filter panelni ochish
  ───────────────────────────────────── */
  function _openFilterPanel() {
    const col = currentCol;
    const th  = currentTh;
    _closeMenu(); // asosiy menyuni yopamiz (currentCol/currentTh ni tozalaydi — shuning uchun oldin saqlab oldik)
    if (!col) return;

    _buildFilterPanel();
    filterCol = col;

    const label = colLabels[col] || col;
    document.getElementById('cfp-title').textContent = label.toUpperCase();

    // Unique qiymatlarni yig'ish (butun oy bo'yicha, hozirgi filterlardan qat'i nazar)
    const rows = getAllRows ? (getAllRows() || []) : [];
    const isDateCol = ['ehtimoliy', 'gap', 'sana'].includes(col);
    const counts = new Map();
    rows.forEach(r => {
      const raw = _getVal(r, col);
      const key = (raw === null || raw === undefined) ? '' : String(raw).trim();
      counts.set(key, (counts.get(key) || 0) + 1);
    });

    let entries = [...counts.entries()];
    entries.sort((a, b) => {
      if (a[0] === '' && b[0] === '') return 0;
      if (a[0] === '') return -1;
      if (b[0] === '') return 1;
      if (isDateCol) return _dateSortKey(a[0]) - _dateSortKey(b[0]);
      return String(a[0]).localeCompare(String(b[0]), 'uz', { numeric: true });
    });

    const activeSet = getFilter ? getFilter(col) : null; // null = filter yo'q = hammasi belgilangan

    filterOptions = entries.map(([value, count]) => ({
      value,
      count,
      label: value === '' ? "(Bo'sh)" : (isDateCol ? _dateLabel(value) : value),
      checked: activeSet ? activeSet.has(value) : true,
    }));

    _renderFilterList();
    document.getElementById('cfp-clear-btn').style.display = activeSet ? '' : 'none';

    _positionFilterPanel(th);
    filterPanel.style.display = 'block';

    setTimeout(() => {
      document.addEventListener('mousedown', _onFilterOutsideClick, true);
    }, 0);
  }

  function _dateSortKey(v) {
    const p = String(v).split('.');
    if (p.length === 3) return new Date(+p[2], +p[1] - 1, +p[0]).getTime();
    return 0;
  }

  function _dateLabel(v) {
    // "13.07.2026" → "Iyul 13" (global tolovSanasi() funksiyasi mavjud bo'lsa undan foydalanamiz)
    if (typeof window.tolovSanasi === 'function') return window.tolovSanasi(v);
    return v;
  }

  function _renderFilterList() {
    const list = document.getElementById('cfp-list');
    if (!list) return;
    if (filterOptions.length === 0) {
      list.innerHTML = `<div class="cfp-empty">Qiymatlar topilmadi</div>`;
      return;
    }
    list.innerHTML = filterOptions.map((o, i) => `
      <label class="cfp-check-row">
        <input type="checkbox" ${o.checked ? 'checked' : ''} onchange="ColContextMenu._toggleFilterItem(${i}, this.checked)">
        <span class="cfp-check-label">${o.label}</span>
        <span class="cfp-check-count">${o.count}</span>
      </label>
    `).join('');
  }

  function _toggleFilterItem(idx, checked) {
    if (filterOptions[idx]) filterOptions[idx].checked = checked;
  }

  function _filterSelectAll(checked) {
    filterOptions.forEach(o => o.checked = checked);
    _renderFilterList();
  }

  function _positionFilterPanel(th) {
    filterPanel.style.display = 'block';
    const rect = th ? th.getBoundingClientRect() : { left: 100, bottom: 100 };
    const pw = filterPanel.offsetWidth  || 260;
    const ph = filterPanel.offsetHeight || 320;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let left = rect.left;
    let top  = rect.bottom + 4;
    if (left + pw > vw) left = vw - pw - 8;
    if (left < 8) left = 8;
    if (top + ph > vh) top = Math.max(8, rect.top - ph - 4);

    filterPanel.style.left = left + 'px';
    filterPanel.style.top  = top  + 'px';
  }

  function _onFilterOutsideClick(e) {
    if (filterPanel && !filterPanel.contains(e.target)) {
      _closeFilterPanel();
    }
  }

  function _closeFilterPanel() {
    if (filterPanel) filterPanel.style.display = 'none';
    document.removeEventListener('mousedown', _onFilterOutsideClick, true);
    filterCol = null;
    filterOptions = [];
  }

  function _applyFilter() {
    const col = filterCol;
    if (!col) return;
    const total   = filterOptions.length;
    const checked = filterOptions.filter(o => o.checked);
    _closeFilterPanel();
    if (!onFilter) return;

    if (checked.length === total) {
      onFilter(col, null); // hammasi belgilangan — filter shart emas
    } else {
      onFilter(col, new Set(checked.map(o => o.value))); // 0 ta belgilansa — hech narsa mos kelmaydi (bo'sh natija)
    }
  }

  function _clearFilter() {
    const col = filterCol;
    _closeFilterPanel();
    if (col && onFilter) onFilter(col, null);
  }

  function _clearFilterFromMenu() {
    const col = currentCol;
    _closeMenu();
    if (col && onFilter) onFilter(col, null);
  }

  /* ─────────────────────────────────────
     Ustunni yashirish
  ───────────────────────────────────── */
  function _doHide() {
    const col = currentCol;
    _closeMenu();
    if (!col) return;
    if (onHide) onHide(col);
  }

  /* ─────────────────────────────────────
     Thead yangilanganda listener qayta ulash
  ───────────────────────────────────── */
  function refresh() {
    _attachListeners();
  }

  /* Public API */
  return {
    init, refresh, _doSort, _doHide,
    _openFilterPanel, _closeFilterPanel, _applyFilter, _clearFilter, _clearFilterFromMenu,
    _toggleFilterItem, _filterSelectAll,
  };

})();