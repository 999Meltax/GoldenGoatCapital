const formatter = new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
    signDisplay: "always",
});

// Standardkategorien – immer vorhanden, nicht löschbar
const DEFAULT_CATEGORIES = [
    "Essen & Trinken",
    "Lebensmittel",
    "Klamotten",
    "Freizeit",
    "Tanken",
    "Wohnen",
    "Transport",
    "Gesundheit",
    "Gehalt",
    "Sonstiges"
];

let list, form, categoryForm, status, balance, income, expense,
    categorySelect, categoryInput, monthFilter, categoryFilter,
    actionModalCategory, modalContent;
let transactions = [];
let categories   = [];
let allAccounts  = [];          // alle Konten vom Server
let allRegeln    = [];          // Kategorisierungs-Regeln
let activeTab    = 'list';
let chartInstance = null;

// Account-Filter für Tracker (unabhängig von finanzen.js)
// Gespeichert in localStorage unter 'tracker_active_accounts'
function getTrackerActiveIds() {
    try {
        const raw = localStorage.getItem('tracker_active_accounts');
        if (raw === null) return null; // null = noch nicht initialisiert → alle
        return new Set(JSON.parse(raw));
    } catch { return null; }
}

function setTrackerActiveIds(ids) {
    localStorage.setItem('tracker_active_accounts', JSON.stringify([...ids]));
}

function isAccountActive(accountId) {
    const ids = getTrackerActiveIds();
    if (ids === null) return true; // noch nicht konfiguriert → alle aktiv
    return ids.has(String(accountId));
}

function initialize() {
    list                = document.getElementById("transactionList");
    form                = document.getElementById("transactionForm");
    categoryForm        = document.getElementById("categoryFormAdd");
    status              = document.getElementById("status");
    balance             = document.getElementById("balance");
    income              = document.getElementById("income");
    expense             = document.getElementById("expense");
    categorySelect      = document.getElementById('categorySelect');
    categoryInput       = document.getElementById('categoryInput');
    monthFilter         = document.getElementById('monthFilter');
    categoryFilter      = document.getElementById('categoryFilter');
    actionModalCategory = document.getElementById('actionModalCategory');
    modalContent        = document.getElementById('modalContentCategory');

    form.addEventListener("submit", addTransaction);
    initRegelListener();
    monthFilter.addEventListener("change", applyAndRender);
    categoryFilter.addEventListener("change", applyAndRender);
    categoryForm.addEventListener("submit", addCategory);

    document.getElementById('tabList').addEventListener('click',  () => switchTab('list'));
    document.getElementById('tabChart').addEventListener('click', () => switchTab('chart'));

    categorySelect.addEventListener('click', (e) => {
        const target = e.target.closest('[class]');
        const item   = e.target.closest('.category-item');

        if (e.target.classList.contains('select-selected') || e.target.closest('.select-selected')) {
            const items = categorySelect.querySelector('.select-items');
            items.classList.toggle('select-show');
            categorySelect.querySelector('.select-selected').classList.toggle('select-arrow-active');
        } else if (e.target.classList.contains('delete-btn') || e.target.closest('.delete-btn')) {
            const btn = e.target.closest('.delete-btn');
            showDeleteModal(btn.dataset.name);
        } else if (e.target.classList.contains('edit-btn') || e.target.closest('.edit-btn')) {
            const btn = e.target.closest('.edit-btn');
            showEditModal(btn.dataset.name);
        } else if (item) {
            const value = item.dataset.value;
            categoryInput.value = value;
            categorySelect.querySelector('.select-selected').textContent = value;
            categorySelect.querySelector('.select-items').classList.remove('select-show');
            categorySelect.querySelector('.select-selected').classList.remove('select-arrow-active');
        }
    });

    document.addEventListener('click', (e) => {
        if (!categorySelect.contains(e.target)) {
            categorySelect.querySelector('.select-items').classList.remove('select-show');
            categorySelect.querySelector('.select-selected').classList.remove('select-arrow-active');
        }
    });
}

window.addEventListener("load", () => {
    initialize();
    loadData();
});

// ─── Regeln live anwenden ─────────────────────────────────────

function applyRegelLocal(name) {
    const nameLower = (name || '').toLowerCase().trim();
    if (!nameLower) return null;
    let result = { category: null, type: null };
    for (const r of allRegeln) {
        if (!r.aktiv) continue;
        const regelModus = r.modus || 'beide';
        if (regelModus !== 'beide' && regelModus !== 'haushalt') continue;
        const wert = (r.bedingung_wert || '').toLowerCase();
        let match = false;
        switch (r.bedingung_operator) {
            case 'enthält':      match = nameLower.includes(wert); break;
            case 'beginnt_mit':  match = nameLower.startsWith(wert); break;
            case 'endet_mit':    match = nameLower.endsWith(wert); break;
            case 'gleich':       match = nameLower === wert; break;
        }
        if (match) {
            if (r.aktion_kategorie) result.category = r.aktion_kategorie;
            if (r.aktion_typ)       result.type     = r.aktion_typ;
        }
    }
    return (result.category || result.type) ? result : null;
}

function setCategoryInForm(catName) {
    if (!catName) return;
    if (categoryInput) categoryInput.value = catName;
    const selected = categorySelect?.querySelector('.select-selected');
    if (selected) selected.textContent = catName;
}

function setTypeInForm(type) {
    const cb = document.querySelector('#transactionForm #type');
    if (!cb) return;
    cb.checked = type === 'Einnahmen';
}

let _hausRegelHintEl = null;
function showRegelHint(regelName) {
    if (!_hausRegelHintEl) {
        _hausRegelHintEl = document.createElement('div');
        _hausRegelHintEl.style.cssText = 'font-size:0.75rem;color:var(--haus-accent,#22c55e);margin-top:4px;display:flex;align-items:center;gap:4px;min-height:16px;';
        const nameInput = document.querySelector('#transactionForm input[name="name"]');
        if (nameInput?.parentElement) nameInput.parentElement.appendChild(_hausRegelHintEl);
    }
    _hausRegelHintEl.innerHTML = regelName
        ? `<i class="ri-magic-line"></i> Regel angewendet: ${regelName}`
        : '';
}

// Debounced Name-Input Listener
let _hausDebounce = null;
function initRegelListener() {
    const nameInput = document.querySelector('#transactionForm input[name="name"]');
    if (!nameInput) return;
    nameInput.addEventListener('input', () => {
        clearTimeout(_hausDebounce);
        _hausDebounce = setTimeout(() => {
            const matched = applyRegelLocal(nameInput.value);
            if (matched) {
                if (matched.category) setCategoryInForm(matched.category);
                if (matched.type)     setTypeInForm(matched.type);
                const parts = [matched.category, matched.type].filter(Boolean).join(', ');
                showRegelHint(parts);
            } else {
                showRegelHint(null);
            }
        }, 250);
    });
}

// ─── Tab-Logik ────────────────────────────────────────────────

function switchTab(tab) {
    activeTab = tab;
    document.getElementById('tabList').classList.toggle('active', tab === 'list');
    document.getElementById('tabChart').classList.toggle('active', tab === 'chart');
    document.getElementById('viewList').style.display  = tab === 'list'  ? '' : 'none';
    document.getElementById('viewChart').style.display = tab === 'chart' ? '' : 'none';
    if (tab === 'chart') renderChart();
}

// ─── Filter-State ─────────────────────────────────────────────

// filterMode: 'months' | 'range' | 'weeks'
// selectedMonths: Set of 'YYYY-MM' strings
// rangeFrom / rangeTo: 'YYYY-MM-DD' strings
// selectedWeeks: Set of 'YYYY-Www' strings
let filterMode     = 'months';
let selectedMonths = new Set(); // leer = alle
let rangeFrom      = '';
let rangeTo        = '';
let selectedWeeks  = new Set(); // leer = alle
let chartType      = 'bar';

// ─── Sortierung & Pagination ──────────────────────────────────
let sortField  = 'date';   // 'date' | 'amount' | 'name' | 'category'
let sortDir    = 'desc';   // 'asc' | 'desc'
let currentPage = 1;
const PAGE_SIZE = 20;

// ─── Filter Panel ─────────────────────────────────────────────

function toggleFilterPanel() {
    const panel = document.getElementById('filterPanel');
    const btn   = document.getElementById('filterToggleBtn');
    const open  = panel.style.display !== 'none';
    panel.style.display = open ? 'none' : 'block';
    btn.classList.toggle('open', !open);
}

function setFilterMode(mode) {
    filterMode = mode;
    document.querySelectorAll('.filter-mode-tab').forEach(t => t.classList.toggle('active', t.dataset.mode === mode));
    document.getElementById('filterModeMonths').style.display = mode === 'months' ? '' : 'none';
    document.getElementById('filterModeRange').style.display  = mode === 'range'  ? '' : 'none';
    document.getElementById('filterModeWeeks').style.display  = mode === 'weeks'  ? '' : 'none';
    applyAndRender();
}

function clearDateFilter() {
    selectedMonths = new Set();
    rangeFrom = rangeTo = '';
    selectedWeeks = new Set();
    document.getElementById('rangeFrom').value = '';
    document.getElementById('rangeTo').value   = '';
    buildMonthChips();
    buildWeekChips();
    updateFilterBadge();
    applyAndRender();
}

function applyAndRender() {
    currentPage = 1;
    updateFilterBadge();
    renderList();
    if (activeTab === 'chart') renderChart();
}

function updateFilterBadge() {
    const badge   = document.getElementById('filterActiveBadge');
    const clearBtn = document.getElementById('filterClearBtn');
    let count = 0;
    if (filterMode === 'months') count = selectedMonths.size;
    else if (filterMode === 'range') count = (rangeFrom || rangeTo) ? 1 : 0;
    else if (filterMode === 'weeks') count = selectedWeeks.size;

    if (count > 0) {
        badge.textContent   = count;
        badge.style.display = '';
        clearBtn.style.display = '';
    } else {
        badge.style.display    = 'none';
        clearBtn.style.display = 'none';
    }
}

// ── Monats-Chips ─────────────────────────────────────────────

function buildMonthChips() {
    const container = document.getElementById('monthChips');
    if (!container) return;
    // Alle vorhandenen Monate aus Transaktionen
    const monthSet = new Set();
    transactions.forEach(t => {
        const m = (t.date || '').substring(0, 7);
        if (m) monthSet.add(m);
    });
    const months = [...monthSet].sort().reverse();
    container.innerHTML = months.map(m => {
        const label = new Date(m + '-01').toLocaleDateString('de-DE', { month: 'short', year: 'numeric' });
        const active = selectedMonths.has(m) ? 'active' : '';
        return `<span class="month-chip ${active}" data-month="${m}" onclick="toggleMonthChip('${m}')">${label}</span>`;
    }).join('');
}

function toggleMonthChip(month) {
    if (selectedMonths.has(month)) selectedMonths.delete(month);
    else selectedMonths.add(month);
    // Chip-Klasse direkt toggeln ohne komplettes Rebuild
    document.querySelectorAll('.month-chip').forEach(el => {
        el.classList.toggle('active', selectedMonths.has(el.dataset.month));
    });
    applyAndRender();
}

// ── Zeitraum-Filter ───────────────────────────────────────────

function applyRangeFilter() {
    rangeFrom = document.getElementById('rangeFrom').value;
    rangeTo   = document.getElementById('rangeTo').value;
    applyAndRender();
}

// ── Wochen-Chips ─────────────────────────────────────────────

function getISOWeek(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return { week: Math.ceil((((d - yearStart) / 86400000) + 1) / 7), year: d.getUTCFullYear() };
}

function getWeekKey(date) {
    const { week, year } = getISOWeek(date);
    return `${year}-W${String(week).padStart(2, '0')}`;
}

function buildWeekChips() {
    const container = document.getElementById('weekChips');
    const yearSel   = document.getElementById('weekYear');
    if (!container || !yearSel) return;

    const yearVal = parseInt(yearSel.value) || new Date().getFullYear();
    const weekSet = new Set();
    transactions.forEach(t => {
        if (!t.date) return;
        const d = new Date(t.date);
        if (d.getFullYear() === yearVal || getISOWeek(d).year === yearVal) {
            weekSet.add(getWeekKey(d));
        }
    });
    const weeks = [...weekSet].filter(w => w.startsWith(yearVal + '-W')).sort().reverse();
    container.innerHTML = weeks.map(w => {
        const kw    = parseInt(w.split('-W')[1]);
        const active = selectedWeeks.has(w) ? 'active' : '';
        return `<span class="month-chip ${active}" data-week="${w}" onclick="toggleWeekChip('${w}')">KW ${kw}</span>`;
    }).join('');
    if (!weeks.length) container.innerHTML = '<span style="font-size:0.8rem;color:var(--text-3);">Keine Daten für dieses Jahr.</span>';
}

function populateWeekYearSelect() {
    const sel = document.getElementById('weekYear');
    if (!sel) return;
    const years = new Set();
    transactions.forEach(t => { if (t.date) years.add(new Date(t.date).getFullYear()); });
    const cur = new Date().getFullYear();
    years.add(cur);
    sel.innerHTML = [...years].sort().reverse().map(y =>
        `<option value="${y}" ${y === cur ? 'selected' : ''}>${y}</option>`
    ).join('');
}

function toggleWeekChip(week) {
    if (selectedWeeks.has(week)) selectedWeeks.delete(week);
    else selectedWeeks.add(week);
    document.querySelectorAll('[data-week]').forEach(el => {
        el.classList.toggle('active', selectedWeeks.has(el.dataset.week));
    });
    applyAndRender();
}

// ─── Chart-Typ ────────────────────────────────────────────────

function setChartType(type) {
    chartType = type;
    document.querySelectorAll('.chart-type-btn').forEach(b => b.classList.toggle('active', b.dataset.type === type));
    renderChart();
}

// ─── Daten laden ──────────────────────────────────────────────

async function loadData() {
    try {
        const [txRes, catRes, accRes, regelRes] = await Promise.all([
            fetch('/users/haushalt/transaktionen'),
            fetch('/users/haushalt/tracker/categories'),
            fetch('/users/haushalt/tracker/accounts'),
            fetch('/users/regeln/list')
        ]);
        transactions = await txRes.json();
        const userCats = await catRes.json();
        allAccounts = await accRes.json();
        allRegeln   = regelRes.ok ? await regelRes.json() : [];

        // Neue Konten automatisch als aktiv markieren
        const existingIds = getTrackerActiveIds();
        if (existingIds !== null) {
            allAccounts.forEach(a => {
                if (!existingIds.has(String(a.id))) {
                    existingIds.add(String(a.id));
                }
            });
            setTrackerActiveIds(existingIds);
        }

        // Konto-Select im Formular befüllen
        const accSelect = document.getElementById('accountSelect');
        if (accSelect) {
            accSelect.innerHTML = '<option value="">Kein Konto zuweisen</option>' +
                allAccounts.map(a => `<option value="${a.id}">${a.name}</option>`).join('');
        }

        // Konto-Select im Edit-Modal
        const editAccSelect = document.getElementById('editAccountSelect');
        if (editAccSelect) {
            editAccSelect.innerHTML = '<option value="">Kein Konto</option>' +
                allAccounts.map(a => `<option value="${a.id}">${a.name}</option>`).join('');
        }

        // Merge Kategorien
        categories = [
            ...DEFAULT_CATEGORIES.map(name => ({ name, isDefault: true })),
            ...userCats.filter(c => !DEFAULT_CATEGORIES.includes(c.name)).map(c => ({ ...c, isDefault: false }))
        ];

        buildTrackerFilterUI();
        populateMonthFilter();
        populateCategoryFilter();
        populateCategorySelect();
        populateWeekYearSelect();
        buildMonthChips();
        buildWeekChips();
        updateFilterBadge();
        renderList();
        renderAccountCards();
        loadRecurring();
    } catch (err) {
        console.error('Fehler beim Laden:', err);
        if (status) status.textContent = 'Fehler beim Laden der Daten';
    }
}

// ─── Kategorie-Dropdown ───────────────────────────────────────

function populateCategorySelect() {
    const selectItems = categorySelect.querySelector('.select-items');
    selectItems.innerHTML = '';

    categories.forEach(cat => {
        const div = document.createElement('div');
        div.className = 'category-item';
        div.dataset.value = cat.name;

        if (cat.isDefault) {
            div.innerHTML = `
                <span>${cat.name}</span>
                <span class="default-badge" title="Standardkategorie"><i class="ri-lock-line"></i></span>
            `;
        } else {
            div.innerHTML = `
                <span>${cat.name}</span>
                <span class="edit-btn" data-name="${cat.name}" title="Umbenennen"><i class="ri-pencil-line"></i></span>
                <span class="delete-btn" data-name="${cat.name}" title="Löschen"><i class="ri-delete-bin-line"></i></span>
            `;
        }
        selectItems.appendChild(div);
    });
}

async function addCategory(e) {
    e.preventDefault();
    const name = document.getElementById('categoryName').value.trim();
    if (!name) return;
    if (DEFAULT_CATEGORIES.includes(name)) {
        showStatus('Diese Kategorie existiert bereits als Standardkategorie.', true);
        return;
    }
    try {
        const res = await fetch('/users/haushalt/tracker/categories/add', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name })
        });
        if (!res.ok) throw new Error((await res.json()).message);
        categoryForm.reset();
        showStatus('Kategorie hinzugefügt!', false);
        await loadData();
    } catch (err) {
        showStatus(err.message, true);
    }
}

function showDeleteModal(categoryName) {
    if (!actionModalCategory || !modalContent) return;
    const relCount = transactions.filter(t => t.category === categoryName).length;
    const msg = relCount > 0
        ? `Möchtest du „${categoryName}" wirklich löschen? ${relCount} Transaktion(en) werden ebenfalls entfernt.`
        : `Möchtest du die Kategorie „${categoryName}" löschen?`;

    modalContent.innerHTML = `
        <span class="close" onclick="closeModal()">×</span>
        <h3>Kategorie löschen</h3>
        <p style="margin:12px 0 20px;">${msg}</p>
        <div style="display:flex;gap:8px;">
            <button onclick="confirmDeleteCategory('${categoryName}')">Löschen</button>
            <button class="cancel-btn" onclick="closeModal()">Abbrechen</button>
        </div>
    `;
    actionModalCategory.style.display = 'flex';
}

async function confirmDeleteCategory(name) {
    try {
        const res = await fetch(`/users/haushalt/tracker/categories/delete/${encodeURIComponent(name)}`, { method: 'DELETE' });
        if (!res.ok) throw new Error((await res.json()).message);
        const r = await res.json();
        showStatus(`Gelöscht${r.transactionCount > 0 ? `, ${r.transactionCount} Transaktionen entfernt` : ''}.`, false);
        await loadData();
        closeModal();
    } catch (err) {
        showStatus(err.message, true);
    }
}

function showEditModal(categoryName) {
    if (!actionModalCategory || !modalContent) return;
    modalContent.innerHTML = `
        <span class="close" onclick="closeModal()">×</span>
        <h3>Kategorie umbenennen</h3>
        <div class="form-group" style="margin:16px 0;">
            <label class="form-label">Neuer Name</label>
            <input type="text" id="editCategoryName" value="${categoryName}" required/>
        </div>
        <div style="display:flex;gap:8px;">
            <button onclick="confirmEditCategory('${categoryName}')">Speichern</button>
            <button class="cancel-btn" onclick="closeModal()">Abbrechen</button>
        </div>
    `;
    actionModalCategory.style.display = 'flex';
}

async function confirmEditCategory(oldName) {
    const newName = document.getElementById('editCategoryName').value.trim();
    if (!newName) return;
    try {
        const res = await fetch('/users/haushalt/tracker/categories/update', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ oldName, newName })
        });
        if (!res.ok) throw new Error((await res.json()).message);
        showStatus('Kategorie aktualisiert!', false);
        await loadData();
        closeModal();
    } catch (err) {
        showStatus(err.message, true);
    }
}

function closeModal() {
    if (actionModalCategory) actionModalCategory.style.display = 'none';
}

// ─── Transaktion bearbeiten (Modal) ───────────────────────────

// Sucht Transaktion aus dem Array per ID – vermeidet HTML-Encoding-Probleme
function openEditById(id) {
    const t = transactions.find(tx => tx.id === id);
    if (t) showEditTransactionModal(t);
}

function showEditTransactionModal(transaction) {
    if (!actionModalCategory || !modalContent) return;

    const catOptions = categories.map(c =>
        `<option value="${c.name}" ${c.name === transaction.category ? 'selected' : ''}>${c.name}</option>`
    ).join('');

    const dateFormatted = new Date(transaction.date).toISOString().split('T')[0];
    const isIncome = transaction.type === 'Einnahmen';

    modalContent.innerHTML = `
        <span class="close" onclick="closeModal()">×</span>
        <h3 style="margin-bottom:20px;">Transaktion bearbeiten</h3>

        <div class="form-group" style="margin-bottom:12px;">
            <label class="form-label">Typ</label>
            <div class="toggle-wrapper">
                <label for="editType" style="width:100%;display:block;">
                    <input type="checkbox" id="editType" ${isIncome ? 'checked' : ''}/>
                    <div class="option">
                        <span>Ausgaben</span>
                        <span>Einnahmen</span>
                    </div>
                </label>
            </div>
        </div>

        <div class="form-group" style="margin-bottom:12px;">
            <label class="form-label">Name</label>
            <input type="text" id="editName" value="${transaction.name}" required/>
        </div>

        <div class="form-group" style="margin-bottom:12px;">
            <label class="form-label">Kategorie</label>
            <select id="editCategory">${catOptions}</select>
        </div>

        <div class="form-row" style="margin-bottom:20px;">
            <div class="form-group">
                <label class="form-label">Betrag</label>
                <input type="number" id="editAmount" value="${transaction.amount}" min="0.01" step="0.01" required/>
            </div>
            <div class="form-group">
                <label class="form-label">Datum</label>
                <input type="date" id="editDate" value="${dateFormatted}" required/>
            </div>
        </div>

        <div class="form-group" style="margin-bottom:20px;">
            <label class="form-label">Konto <span style="color:var(--text-3); font-weight:400;">(optional)</span></label>
            <select id="editAccountSelect"><option value="">Kein Konto</option></select>
        </div>

        <div style="display:flex; gap:8px;">
            <button onclick="confirmEditTransaction(${transaction.id})"><i class="ri-save-line"></i> Speichern</button>
            <button class="cancel-btn" onclick="closeModal()">Abbrechen</button>
        </div>
    `;
    // Account-Select nachfüllen (Konten werden asynchron geladen)
    fetch('/users/haushalt/tracker/accounts').then(r => r.json()).then(accounts => {
        const sel = document.getElementById('editAccountSelect');
        if (sel) {
            sel.innerHTML = '<option value="">Kein Konto</option>' +
                accounts.map(a => `<option value="${a.id}" ${String(a.id) === String(transaction.account_id) ? 'selected' : ''}>${a.name}</option>`).join('');
        }
    });
    actionModalCategory.style.display = 'flex';
}

async function confirmEditTransaction(id) {
    const name       = document.getElementById('editName').value.trim();
    const category   = document.getElementById('editCategory').value;
    const amount     = parseFloat(document.getElementById('editAmount').value);
    const date       = document.getElementById('editDate').value;
    const type       = document.getElementById('editType').checked ? 'Einnahmen' : 'Ausgaben';
    const account_id = document.getElementById('editAccountSelect')?.value || null;

    if (!name || !category || isNaN(amount) || amount <= 0 || !date) {
        showStatus('Bitte alle Felder ausfüllen.', true);
        return;
    }
    try {
        const res = await fetch(`/users/haushalt/transaktionen/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, category, amount, date, type, account_id })
        });
        if (!res.ok) throw new Error((await res.json()).message || 'Fehler beim Speichern');
        showStatus('Transaktion gespeichert!', false);
        await loadData();
        closeModal();
    } catch (err) {
        showStatus(err.message, true);
    }
}

// ─── Transaktion hinzufügen ───────────────────────────────────

async function addTransaction(e) {
    e.preventDefault();
    const formEl  = e.target;
    const formData = new FormData(formEl);
    const typeCheckbox = formEl.querySelector('#type');
    const tx = {
        name:       formData.get("name")?.trim() || "",
        amount:     parseFloat(formData.get("amount")) || 0,
        date:       formData.get("date") || "",
        type:       typeCheckbox && typeCheckbox.checked ? "Einnahmen" : "Ausgaben",
        category:   formData.get("category")?.trim() || "",
        account_id: formData.get("account_id") || null
    };

    if (!tx.name)       return showStatus('Bitte einen Namen eingeben.', true);
    if (!tx.category)   return showStatus('Bitte eine Kategorie wählen.', true);
    if (tx.amount <= 0) return showStatus('Bitte einen gültigen Betrag eingeben.', true);
    if (!tx.date)       return showStatus('Bitte ein Datum wählen.', true);

    try {
        const res = await fetch('/users/haushalt/transaktionen/add', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(tx)
        });
        if (!res.ok) throw new Error((await res.json()).message);
        formEl.reset();
        categorySelect.querySelector('.select-selected').textContent = 'Kategorie wählen';
        categoryInput.value = '';
        const typeEl = formEl.querySelector('#type');
        if (typeEl) typeEl.checked = false;
        showStatus('Transaktion hinzugefügt!', false);
        await loadData();
    } catch (err) {
        showStatus(err.message, true);
    }
}

// ─── Transaktion löschen ──────────────────────────────────────

function deleteTransaction(id) {
    const tx = transactions.find(t => t.id === id);
    if (!tx) return;

    transactions = transactions.filter(t => t.id !== id);
    renderList();

    let deleteTimer = null;

    function restoreTx() {
        clearTimeout(deleteTimer);
        transactions.push(tx);
        transactions.sort((a, b) => new Date(b.date) - new Date(a.date));
        renderList();
    }

    showUndoToast(`„${tx.name}" gelöscht`, restoreTx);

    deleteTimer = setTimeout(async () => {
        try {
            const res = await fetch(`/users/haushalt/transaktionen/${id}`, { method: 'DELETE' });
            if (!res.ok) throw new Error((await res.json()).message);
        } catch (err) {
            showStatus(err.message || 'Fehler beim Löschen.', true);
            restoreTx();
        }
    }, 5000);
}

// ─── Account Filter UI ────────────────────────────────────────

const ACCOUNT_LABELS_TRACKER = {
    girokonto: 'Girokonto', sparkonto: 'Sparkonto',
    haushaltskonto: 'Haushaltskonto', bargeld: 'Bargeld',
    depot: 'Depot', sonstiges: 'Sonstiges'
};

function buildTrackerFilterUI() {
    const container = document.getElementById('trackerFilterItems');
    const wrap      = document.getElementById('trackerFilterWrap');
    if (!container) return;

    if (!allAccounts.length) {
        if (wrap) wrap.style.display = 'none';
        return;
    }
    if (wrap) wrap.style.display = '';

    const activeIds = getTrackerActiveIds();
    const fmtLocal  = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });

    container.innerHTML = allAccounts.map(acc => {
        const isActive  = activeIds === null || activeIds.has(String(acc.id));
        const bal       = acc.currentBalance ?? acc.balance ?? 0;
        const typeLabel = ACCOUNT_LABELS_TRACKER[acc.type] || acc.type;
        return `
        <label class="account-filter-item">
            <input type="checkbox" ${isActive ? 'checked' : ''}
                onchange="toggleTrackerAccount(${acc.id}, this.checked)">
            <div class="account-filter-item-dot" style="background:${acc.color};"></div>
            <div class="account-filter-item-info">
                <div class="account-filter-item-name">${acc.name}</div>
                <div class="account-filter-item-type">${typeLabel}</div>
            </div>
            <div class="account-filter-item-balance" style="color:${bal >= 0 ? '#22c55e' : '#ef4444'}">
                ${fmtLocal.format(bal)}
            </div>
        </label>`;
    }).join('');

    updateTrackerFilterBtn();
}

function toggleTrackerAccount(id, checked) {
    let ids = getTrackerActiveIds();
    if (ids === null) ids = new Set(allAccounts.map(a => String(a.id)));
    if (checked) ids.add(String(id));
    else         ids.delete(String(id));
    setTrackerActiveIds(ids);
    updateTrackerFilterBtn();
    buildTrackerFilterUI();
    renderList();
    if (activeTab === 'chart') renderChart();
}

function selectAllTrackerAccounts() {
    setTrackerActiveIds(new Set(allAccounts.map(a => String(a.id))));
    buildTrackerFilterUI();
    renderList();
    if (activeTab === 'chart') renderChart();
}

function selectNoneTrackerAccounts() {
    setTrackerActiveIds(new Set());
    buildTrackerFilterUI();
    renderList();
    if (activeTab === 'chart') renderChart();
}

function updateTrackerFilterBtn() {
    const btn   = document.getElementById('trackerFilterBtn');
    const label = document.getElementById('trackerFilterLabel');
    const dot   = document.getElementById('trackerFilterDot');
    if (!btn || !label || !dot) return;

    const activeIds   = getTrackerActiveIds();
    const total       = allAccounts.length;
    const activeCount = activeIds === null
        ? total
        : [...activeIds].filter(id => allAccounts.find(a => String(a.id) === id)).length;

    dot.style.background = '';
    if (activeCount === 0) {
        label.textContent    = 'Kein Konto';
        dot.className        = 'filter-dot';
        dot.style.background = '#ef4444';
    } else if (activeCount === total || activeIds === null) {
        label.textContent = 'Alle Konten';
        dot.className     = 'filter-dot all';
    } else {
        const names = allAccounts.filter(a => activeIds.has(String(a.id))).map(a => a.name);
        label.textContent    = names.length <= 2 ? names.join(', ') : `${activeCount} von ${total} Konten`;
        dot.className        = 'filter-dot';
        dot.style.background = 'var(--accent, #6358e6)';
    }
}

function toggleTrackerFilter() {
    const btn      = document.getElementById('trackerFilterBtn');
    const dropdown = document.getElementById('trackerFilterDropdown');
    if (!btn || !dropdown) return;
    const open = dropdown.classList.contains('open');
    dropdown.classList.toggle('open', !open);
    btn.classList.toggle('open', !open);
}

// Schließen bei Klick außerhalb
document.addEventListener('click', e => {
    const wrap = document.getElementById('trackerFilterWrap');
    if (wrap && !wrap.contains(e.target)) {
        document.getElementById('trackerFilterDropdown')?.classList.remove('open');
        document.getElementById('trackerFilterBtn')?.classList.remove('open');
    }
});

// ─── Liste rendern ────────────────────────────────────────────

function getFiltered() {
    const selCat    = categoryFilter ? categoryFilter.value : '';
    const activeIds = getTrackerActiveIds();

    return transactions.filter(t => {
        if (!t.date) return false;
        const dateStr = t.date.substring(0, 10); // YYYY-MM-DD

        // ── Datumsfilter ──
        let dateMatch = true;
        if (filterMode === 'months' && selectedMonths.size > 0) {
            dateMatch = selectedMonths.has(dateStr.substring(0, 7));
        } else if (filterMode === 'range') {
            if (rangeFrom) dateMatch = dateMatch && dateStr >= rangeFrom;
            if (rangeTo)   dateMatch = dateMatch && dateStr <= rangeTo;
        } else if (filterMode === 'weeks' && selectedWeeks.size > 0) {
            dateMatch = selectedWeeks.has(getWeekKey(new Date(dateStr)));
        }

        const catMatch = !selCat || selCat === t.category;
        const accMatch = activeIds === null || !t.account_id || activeIds.has(String(t.account_id));
        return dateMatch && catMatch && accMatch;
    });
}

function getSorted(arr) {
    return [...arr].sort((a, b) => {
        let av, bv;
        if (sortField === 'date') {
            av = a.date || '';
            bv = b.date || '';
        } else if (sortField === 'amount') {
            av = a.amount || 0;
            bv = b.amount || 0;
        } else if (sortField === 'name') {
            av = (a.name || '').toLowerCase();
            bv = (b.name || '').toLowerCase();
        } else if (sortField === 'category') {
            av = (a.category || '').toLowerCase();
            bv = (b.category || '').toLowerCase();
        }
        if (av < bv) return sortDir === 'asc' ? -1 : 1;
        if (av > bv) return sortDir === 'asc' ? 1 : -1;
        return 0;
    });
}

function setSort(field) {
    if (sortField === field) {
        sortDir = sortDir === 'asc' ? 'desc' : 'asc';
    } else {
        sortField = field;
        sortDir = field === 'date' || field === 'amount' ? 'desc' : 'asc';
    }
    currentPage = 1;
    renderList();
}

function renderSortHeader() {
    const cols = [
        { key: 'name',     label: 'Bezeichnung' },
        { key: 'category', label: 'Kategorie' },
        { key: 'date',     label: 'Datum' },
        { key: 'amount',   label: 'Betrag' },
    ];
    const header = document.getElementById('txSortHeader');
    if (!header) return;
    header.innerHTML = cols.map(c => {
        const active = sortField === c.key;
        const icon = active ? (sortDir === 'asc' ? 'ri-arrow-up-s-line' : 'ri-arrow-down-s-line') : 'ri-arrow-up-down-line';
        return `<span class="tx-sort-col${active ? ' active' : ''}" onclick="setSort('${c.key}')" title="Nach ${c.label} sortieren">
            ${c.label} <i class="${icon}"></i>
        </span>`;
    }).join('') + '<span class="tx-sort-col" style="cursor:default;pointer-events:none;"></span>';
}

function renderPagination(total) {
    const container = document.getElementById('txPagination');
    if (!container) return;
    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

    if (totalPages <= 1) {
        container.innerHTML = '';
        return;
    }

    // Clamp currentPage
    if (currentPage > totalPages) currentPage = totalPages;

    let html = `<div class="tx-pagination">`;
    html += `<span class="tx-page-info">${total} Einträge · Seite ${currentPage} von ${totalPages}</span>`;
    html += `<div class="tx-page-btns">`;

    // Prev
    html += `<button class="tx-page-btn" onclick="goToPage(${currentPage - 1})" ${currentPage === 1 ? 'disabled' : ''}>
        <i class="ri-arrow-left-s-line"></i>
    </button>`;

    // Page numbers – show max 7 buttons with ellipsis
    const pages = getPageRange(currentPage, totalPages);
    pages.forEach(p => {
        if (p === '...') {
            html += `<span class="tx-page-ellipsis">…</span>`;
        } else {
            html += `<button class="tx-page-btn${p === currentPage ? ' active' : ''}" onclick="goToPage(${p})">${p}</button>`;
        }
    });

    // Next
    html += `<button class="tx-page-btn" onclick="goToPage(${currentPage + 1})" ${currentPage === totalPages ? 'disabled' : ''}>
        <i class="ri-arrow-right-s-line"></i>
    </button>`;

    html += `</div></div>`;
    container.innerHTML = html;
}

function getPageRange(cur, total) {
    if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
    const pages = [];
    if (cur <= 4) {
        for (let i = 1; i <= 5; i++) pages.push(i);
        pages.push('...');
        pages.push(total);
    } else if (cur >= total - 3) {
        pages.push(1);
        pages.push('...');
        for (let i = total - 4; i <= total; i++) pages.push(i);
    } else {
        pages.push(1);
        pages.push('...');
        for (let i = cur - 1; i <= cur + 1; i++) pages.push(i);
        pages.push('...');
        pages.push(total);
    }
    return pages;
}

function goToPage(page) {
    const filtered = getFiltered();
    const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    currentPage = Math.max(1, Math.min(page, totalPages));
    renderList();
    // Scroll to top of list
    document.getElementById('transactionList')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function renderList() {
    const filtered = getFiltered();
    const sorted   = getSorted(filtered);

    // Reset to page 1 if current page is out of range
    const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
    if (currentPage > totalPages) currentPage = totalPages;

    const start = (currentPage - 1) * PAGE_SIZE;
    const page  = sorted.slice(start, start + PAGE_SIZE);

    list.innerHTML = "";
    renderSortHeader();

    let incomeTotal = 0, expenseTotal = 0;
    // Summaries always from ALL filtered (not just current page)
    sorted.forEach(t => {
        if (t.type === 'Einnahmen') incomeTotal += t.amount;
        else                        expenseTotal += t.amount;
    });

    if (page.length === 0) {
        list.innerHTML = `<li style="text-align:center;padding:40px 0;color:var(--text-3);list-style:none;">
            <i class="ri-inbox-line" style="font-size:2rem;display:block;margin-bottom:8px;"></i>
            Keine Transaktionen gefunden.
        </li>`;
    } else {
        page.forEach(t => {
            const isIncome   = t.type === "Einnahmen";
            const sign       = isIncome ? 1 : -1;
            const isFixkost  = t.recurring_id != null;
            const li         = document.createElement("li");
            li.className     = "transaction";
            li.innerHTML = `
                <div class="name">
                    <h4>${t.name}${isFixkost ? ' <span class="fixkost-badge"><i class="ri-repeat-line"></i> Fixkosten</span>' : ''}</h4>
                    <p>${new Date(t.date).toLocaleDateString('de-DE')}${t.account_id ? ' · ' + (allAccounts.find(x => String(x.id) === String(t.account_id))?.name || '') : ''}</p>
                </div>
                <div class="category"><h4>${t.category}</h4></div>
                <div class="amount ${isIncome ? 'income' : 'expense'}">
                    ${formatter.format(t.amount * sign)}
                </div>
                <div class="transaction-actions">
                    ${isFixkost ? `<span class="fixkost-lock-icon" title="Automatisch eingetragene Fixkosten können nicht bearbeitet werden"><i class="ri-lock-line"></i></span>` : `
                    <button class="edit-transaction-btn"
                        onclick="openEditById(${t.id})"
                        title="Bearbeiten">
                        <i class="ri-pencil-line"></i>
                    </button>`}
                    <button class="delete-transaction-btn" onclick="deleteTransaction(${t.id})" title="Löschen">
                        <i class="ri-delete-bin-line"></i>
                    </button>
                </div>
            `;
            list.appendChild(li);
        });
    }

    renderPagination(sorted.length);

    // Gewinn/Verlust = Einnahmen − Ausgaben (aus ALLEN gefilterten Transaktionen)
    const netBalance = incomeTotal - expenseTotal;

    balance.textContent = formatter.format(netBalance);
    income.textContent  = formatter.format(incomeTotal);
    expense.textContent = formatter.format(expenseTotal);
    balance.style.color = netBalance > 0 ? 'var(--green)' : netBalance < 0 ? 'var(--red)' : '#fff';
    fitBalanceText(balance);
}

// ─── Diagramm rendern ─────────────────────────────────────────

function groupByLabel(txList) {
    // Für Monate-Modus: nach Monat gruppieren mit ISO-Sortierschlüssel
    // Für range/weeks: nach Tag gruppieren wenn Bereich ≤ 60 Tage, sonst Monat
    let keyFn, labelFn;
    const filtered = txList;

    if (filterMode === 'weeks' && selectedWeeks.size > 0) {
        keyFn   = t => getWeekKey(new Date(t.date.substring(0,10)));
        labelFn = k => 'KW ' + parseInt(k.split('-W')[1]) + ' ' + k.split('-W')[0];
    } else if (filterMode === 'range' && rangeFrom && rangeTo) {
        const days = (new Date(rangeTo) - new Date(rangeFrom)) / 86400000;
        if (days <= 62) {
            keyFn   = t => t.date.substring(0, 10);
            labelFn = k => new Date(k).toLocaleDateString('de-DE', { day:'2-digit', month:'short' });
        } else {
            keyFn   = t => t.date.substring(0, 7);
            labelFn = k => new Date(k + '-01').toLocaleDateString('de-DE', { month:'short', year:'numeric' });
        }
    } else {
        keyFn   = t => t.date.substring(0, 7);
        labelFn = k => new Date(k + '-01').toLocaleDateString('de-DE', { month:'short', year:'numeric' });
    }

    const grouped = {};
    filtered.forEach(t => {
        const k = keyFn(t);
        if (!grouped[k]) grouped[k] = { income: 0, expense: 0 };
        if (t.type === 'Einnahmen') grouped[k].income  += t.amount;
        else                        grouped[k].expense += t.amount;
    });

    const sortedKeys = Object.keys(grouped).sort();
    return { keys: sortedKeys, labels: sortedKeys.map(labelFn), grouped };
}

function renderChart() {
    const canvas = document.getElementById('transactionsChart');
    if (!canvas) return;
    if (chartInstance) { chartInstance.destroy(); chartInstance = null; }

    const filtered           = getFiltered();
    const { keys, labels, grouped } = groupByLabel(filtered);
    const isDoughnut         = chartType === 'doughnut';

    // Für Donut: Ausgaben nach Kategorie aufteilen
    let datasets, chartLabels;
    if (isDoughnut) {
        const catMap = {};
        filtered.filter(t => t.type === 'Ausgaben').forEach(t => {
            catMap[t.category] = (catMap[t.category] || 0) + t.amount;
        });
        const catKeys = Object.keys(catMap).sort((a,b) => catMap[b] - catMap[a]);
        const colors  = ['#6358e6','#ef4444','#f59e0b','#22c55e','#3b82f6','#ec4899','#14b8a6','#a855f7','#f97316','#84cc16'];
        chartLabels = catKeys;
        datasets = [{
            label: 'Ausgaben nach Kategorie',
            data:  catKeys.map(c => catMap[c]),
            backgroundColor: catKeys.map((_, i) => colors[i % colors.length]),
            borderWidth: 2,
            borderColor: 'rgba(0,0,0,0.3)'
        }];
    } else {
        chartLabels = labels;
        const isLine = chartType === 'line';
        datasets = [
            {
                label: 'Einnahmen',
                data:  keys.map(k => grouped[k].income),
                backgroundColor: isLine ? 'rgba(34,197,94,0.15)' : 'rgba(34,197,94,0.7)',
                borderColor: 'rgba(34,197,94,1)',
                borderWidth: isLine ? 2 : 1,
                borderRadius: isLine ? 0 : 6,
                fill: isLine,
                tension: 0.35,
                pointRadius: isLine ? 4 : 0,
            },
            {
                label: 'Ausgaben',
                data:  keys.map(k => grouped[k].expense),
                backgroundColor: isLine ? 'rgba(239,68,68,0.15)' : 'rgba(239,68,68,0.7)',
                borderColor: 'rgba(239,68,68,1)',
                borderWidth: isLine ? 2 : 1,
                borderRadius: isLine ? 0 : 6,
                fill: isLine,
                tension: 0.35,
                pointRadius: isLine ? 4 : 0,
            }
        ];
    }

    const baseOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { labels: { color: 'rgba(255,255,255,0.8)', font: { family: 'Plus Jakarta Sans', size: 13 } } },
            tooltip: {
                callbacks: {
                    label: ctx => ' ' + new Intl.NumberFormat('de-DE',{style:'currency',currency:'EUR'}).format(ctx.parsed.y ?? ctx.parsed)
                }
            }
        }
    };

    if (!isDoughnut) {
        baseOptions.scales = {
            y: {
                beginAtZero: true,
                ticks: { color: 'rgba(255,255,255,0.6)', callback: v => v + ' €' },
                grid:  { color: 'rgba(255,255,255,0.06)' }
            },
            x: {
                ticks: { color: 'rgba(255,255,255,0.6)' },
                grid:  { color: 'rgba(255,255,255,0.06)' }
            }
        };
    }

    chartInstance = new Chart(canvas.getContext('2d'), {
        type: chartType === 'doughnut' ? 'doughnut' : chartType,
        data: { labels: chartLabels, datasets },
        options: baseOptions
    });
}

// ─── Filter befüllen ──────────────────────────────────────────

function populateMonthFilter() {
    const existing = new Set(Array.from(monthFilter.options).map(o => o.value));
    transactions.forEach(t => {
        const d = new Date(t.date);
        const month = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
        if (!existing.has(month)) {
            const opt = document.createElement('option');
            opt.value = month;
            opt.textContent = new Date(`${month}-01`).toLocaleString('de-DE', { month: 'long', year: 'numeric' });
            monthFilter.appendChild(opt);
            existing.add(month);
        }
    });
}

function populateCategoryFilter() {
    categoryFilter.innerHTML = '<option value="">Alle Kategorien</option>';
    categories.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.name;
        opt.textContent = c.name;
        categoryFilter.appendChild(opt);
    });
}

// ─── Hilfsfunktionen ──────────────────────────────────────────

function showStatus(msg, isError) {
    if (!status) return;
    status.textContent = msg;
    status.className   = isError ? 'error' : 'success';
    setTimeout(() => { status.textContent = ''; status.className = ''; }, 3500);
}

function fitBalanceText(el) {
    if (!el) return;
    el.style.fontSize = '';
    const parent = el.parentElement;
    let fs = parseFloat(getComputedStyle(el).fontSize);
    while (el.scrollWidth > (parent.clientWidth - 32) && fs > 12) {
        fs -= 1;
        el.style.fontSize = fs + 'px';
    }
}


// ─── Konto-Karten in Sidebar ──────────────────────────────────

function renderAccountCards() {
    const wrap = document.getElementById('accountCardsWrap');
    const list = document.getElementById('accountCardsList');
    if (!wrap || !list) return;

    if (!allAccounts.length) {
        wrap.style.display = 'none';
        return;
    }
    wrap.style.display = '';

    const fmtLocal = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });

    list.innerHTML = allAccounts.map(acc => {
        const bal      = acc.currentBalance ?? acc.balance ?? 0;
        const balColor = bal >= 0 ? '#22c55e' : '#ef4444';
        const color    = acc.color || '#10b981';
        return `<div class="acc-card">
            <div class="acc-card-icon" style="background:${color}20;color:${color};">
                <i class="ri-bank-card-line"></i>
            </div>
            <div class="acc-card-body">
                <div class="acc-card-name">${escHtml(acc.name)}</div>
                <div class="acc-card-type">Haushaltskonto</div>
            </div>
            <div class="acc-card-balance" style="color:${balColor};">${fmtLocal.format(bal)}</div>
        </div>`;
    }).join('');
}

// ── CSV Import ─────────────────────────────────────────────────

let importParsedRows  = [];  // alle geparsten Zeilen (ohne Header)
let importHeaderRow   = [];  // Spaltennamen aus CSV oder generiert
const IMPORT_FIELDS   = ['name', 'betrag', 'datum', 'kategorie', 'typ', 'ignorieren'];
const IMPORT_LABELS   = { name: 'Name/Bezeichnung', betrag: 'Betrag (€)', datum: 'Datum', kategorie: 'Kategorie', typ: 'Typ (Einnahmen/Ausgaben)', ignorieren: 'Ignorieren' };

function openImportModal() {
    // Zielkonto-Select befüllen
    const sel = document.getElementById('importAccountSelect');
    if (sel) {
        sel.innerHTML = '<option value="">Kein Konto zuweisen</option>' +
            allAccounts.map(a => '<option value="' + a.id + '">' + a.name + '</option>').join('');
    }
    document.getElementById('importStep1').style.display = '';
    document.getElementById('importStep2').style.display = 'none';
    document.getElementById('importStatus').textContent  = '';
    document.getElementById('importFileInput').value     = '';
    document.getElementById('importModal').style.display = 'flex';
}

function closeImportModal() {
    document.getElementById('importModal').style.display = 'none';
    importParsedRows = [];
    importHeaderRow  = [];
}

function importGoBack() {
    document.getElementById('importStep1').style.display = '';
    document.getElementById('importStep2').style.display = 'none';
    document.getElementById('importStatus').textContent  = '';
}

function importLoadPreview() {
    const fileInput = document.getElementById('importFileInput');
    if (!fileInput.files || !fileInput.files[0]) {
        document.getElementById('importStatus').textContent = 'Bitte eine CSV-Datei auswählen.';
        document.getElementById('importStatus').style.color = '#ef4444';
        return;
    }
    const delim     = document.querySelector('input[name="importDelimiter"]:checked')?.value || ';';
    const hasHeader = document.getElementById('importHasHeader').checked;
    const reader    = new FileReader();
    reader.onload = function(e) {
        const text  = e.target.result;
        const lines = text.split(/\r?\n/).filter(l => l.trim() !== '');
        if (lines.length === 0) {
            document.getElementById('importStatus').textContent = 'Die Datei ist leer.';
            document.getElementById('importStatus').style.color = '#ef4444';
            return;
        }
        const splitLine = line => {
            // Einfacher CSV-Parser mit Quote-Support
            const result = [];
            let cur = '', inQ = false;
            for (let i = 0; i < line.length; i++) {
                const ch = line[i];
                if (ch === '"') { inQ = !inQ; }
                else if (ch === delim && !inQ) { result.push(cur.trim()); cur = ''; }
                else { cur += ch; }
            }
            result.push(cur.trim());
            return result;
        };

        const allRows = lines.map(splitLine);
        if (hasHeader) {
            importHeaderRow  = allRows[0].map((h, i) => h || ('Spalte ' + (i + 1)));
            importParsedRows = allRows.slice(1);
        } else {
            importHeaderRow  = allRows[0].map((_, i) => 'Spalte ' + (i + 1));
            importParsedRows = allRows;
        }

        if (importParsedRows.length === 0) {
            document.getElementById('importStatus').textContent = 'Keine Datenzeilen gefunden.';
            document.getElementById('importStatus').style.color = '#ef4444';
            return;
        }

        buildImportMapping();
        document.getElementById('importStep1').style.display = 'none';
        document.getElementById('importStep2').style.display = '';
        document.getElementById('importStatus').textContent  = '';
        document.getElementById('importBtnLabel').textContent = importParsedRows.length + ' Zeilen importieren';
    };
    reader.readAsText(fileInput.files[0], 'UTF-8');
}

function buildImportMapping() {
    const container = document.getElementById('importMappingRows');
    // Auto-Erkennung der Spalten
    const autoMap = {};
    importHeaderRow.forEach((h, i) => {
        const hl = h.toLowerCase();
        if (/name|bezeichnung|beschreibung/.test(hl))     autoMap[i] = 'name';
        else if (/betrag|amount|summe/.test(hl))          autoMap[i] = 'betrag';
        else if (/datum|date|tag/.test(hl))               autoMap[i] = 'datum';
        else if (/kategorie|category|kat/.test(hl))       autoMap[i] = 'kategorie';
        else if (/typ|type|art|richtung/.test(hl))        autoMap[i] = 'typ';
    });

    container.innerHTML = importHeaderRow.map((h, i) => {
        const previewVal = importParsedRows[0] ? (importParsedRows[0][i] || '') : '';
        const selOptions = IMPORT_FIELDS.map(f =>
            '<option value="' + f + '" ' + (autoMap[i] === f ? 'selected' : '') + '>' + IMPORT_LABELS[f] + '</option>'
        ).join('');
        return '<div style="display:grid; grid-template-columns:130px 1fr; gap:10px; align-items:center; padding:8px; border-radius:8px; background:var(--surface-2); border:1px solid var(--border);">' +
            '<div>' +
                '<div style="font-size:0.75rem; color:var(--text-3); margin-bottom:2px;">Spalte ' + (i+1) + '</div>' +
                '<div style="font-weight:600; font-size:0.85rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="' + h + '">' + h + '</div>' +
                '<div style="font-size:0.72rem; color:var(--text-3); margin-top:2px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="' + previewVal + '">z.B. „' + previewVal + '"</div>' +
            '</div>' +
            '<select data-col="' + i + '" class="import-col-map" style="padding:6px 10px; border-radius:8px; background:var(--surface-1,#13131a); border:1px solid var(--border); color:var(--text-1); font-size:0.83rem; width:100%;">' +
                selOptions +
            '</select>' +
        '</div>';
    }).join('');

    // Vorschau der ersten 3 Zeilen
    renderImportPreview();
    container.querySelectorAll('.import-col-map').forEach(sel => {
        sel.addEventListener('change', renderImportPreview);
    });
}

function getImportMapping() {
    const mapping = {};
    document.querySelectorAll('.import-col-map').forEach(sel => {
        const col   = parseInt(sel.dataset.col);
        const field = sel.value;
        if (field !== 'ignorieren') mapping[field] = col;
    });
    return mapping;
}

function parseImportDate(raw) {
    if (!raw) return null;
    const s = raw.trim();
    // YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.substring(0, 10);
    // DD.MM.YYYY
    const dmy = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/);
    if (dmy) return dmy[3] + '-' + dmy[2].padStart(2,'0') + '-' + dmy[1].padStart(2,'0');
    // MM/YYYY or MM.YYYY → erster des Monats
    const my = s.match(/^(\d{1,2})[./](\d{4})$/);
    if (my) return my[2] + '-' + my[1].padStart(2,'0') + '-01';
    // YYYY-MM → erster des Monats
    const ym = s.match(/^(\d{4})-(\d{2})$/);
    if (ym) return ym[1] + '-' + ym[2] + '-01';
    return null;
}

function parseImportAmount(raw) {
    if (!raw) return null;
    // Komma als Dezimaltrennzeichen, Punkt als Tausender → normalisieren
    let s = String(raw).trim().replace(/[€$\s]/g, '');
    // Format: 1.234,56 → 1234.56
    if (/^\-?[\d.]+,\d{1,2}$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
    else s = s.replace(',', '.');
    const n = parseFloat(s);
    return isNaN(n) ? null : n;
}

function parseImportType(raw, defaultType) {
    if (!raw) return defaultType;
    const s = raw.toLowerCase().trim();
    if (/einnahme|income|gutschrift|\+/.test(s)) return 'Einnahmen';
    if (/ausgabe|expense|belastung|lastschrift|\-/.test(s)) return 'Ausgaben';
    return defaultType;
}

function renderImportPreview() {
    const mapping     = getImportMapping();
    const defaultCat  = document.getElementById('importDefaultCategory').value || 'Sonstiges';
    const defaultType = document.getElementById('importDefaultType').value || 'Ausgaben';
    const preview     = importParsedRows.slice(0, 3);
    const box         = document.getElementById('importPreviewBox');

    if (!box) return;
    if (!mapping.betrag && !mapping.name) {
        box.innerHTML = '<div class="export-info" style="color:#f59e0b;">Bitte mindestens „Name" und „Betrag" zuweisen.</div>';
        return;
    }

    const rows = preview.map((row, ri) => {
        const name    = mapping.name     !== undefined ? (row[mapping.name]     || '—') : '—';
        const betrag  = mapping.betrag   !== undefined ? parseImportAmount(row[mapping.betrag]) : null;
        const datum   = mapping.datum    !== undefined ? parseImportDate(row[mapping.datum])   : null;
        const kat     = mapping.kategorie !== undefined ? (row[mapping.kategorie] || defaultCat) : defaultCat;
        const typ     = mapping.typ      !== undefined ? parseImportType(row[mapping.typ], defaultType) : defaultType;
        const isInc   = typ === 'Einnahmen';
        const amtStr  = betrag !== null ? (isInc ? '+' : '−') + Math.abs(betrag).toFixed(2) + ' €' : '?';
        const datStr  = datum || '?';
        return '<div style="display:flex; align-items:center; gap:10px; padding:6px 0; border-bottom:1px solid var(--border); font-size:0.82rem;">' +
            '<span style="flex:1; font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">' + name + '</span>' +
            '<span style="color:var(--text-3); white-space:nowrap;">' + datStr + '</span>' +
            '<span style="color:var(--text-3); white-space:nowrap;">' + kat + '</span>' +
            '<span style="font-weight:700; white-space:nowrap; color:' + (isInc ? '#22c55e' : '#ef4444') + ';">' + amtStr + '</span>' +
        '</div>';
    }).join('');

    box.innerHTML =
        '<div style="font-size:0.72rem; color:var(--text-3); font-weight:700; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:6px;">Vorschau (erste ' + preview.length + ' von ' + importParsedRows.length + ' Zeilen)</div>' +
        '<div style="background:var(--surface-2); border:1px solid var(--border); border-radius:8px; padding:8px 12px;">' + rows + '</div>';
}

async function runImport() {
    const mapping      = getImportMapping();
    const defaultCat   = document.getElementById('importDefaultCategory').value || 'Sonstiges';
    const defaultType  = document.getElementById('importDefaultType').value || 'Ausgaben';
    const accountId    = document.getElementById('importAccountSelect').value || null;
    const statusEl     = document.getElementById('importStatus');

    if (!mapping.betrag) {
        statusEl.textContent = 'Bitte mindestens die Spalte „Betrag" zuweisen.';
        statusEl.style.color = '#ef4444';
        return;
    }

    const toImport = [];
    importParsedRows.forEach((row, ri) => {
        const rawBetrag = mapping.betrag !== undefined ? row[mapping.betrag] : null;
        const betrag    = parseImportAmount(rawBetrag);
        if (betrag === null) return; // Zeile überspringen wenn kein Betrag

        const name = mapping.name !== undefined ? (row[mapping.name] || '').trim() : '';
        let datum  = mapping.datum !== undefined ? parseImportDate(row[mapping.datum]) : null;
        if (!datum) datum = new Date().toISOString().substring(0, 10);

        const kat  = mapping.kategorie !== undefined ? (row[mapping.kategorie] || defaultCat).trim() : defaultCat;
        const typ  = mapping.typ !== undefined ? parseImportType(row[mapping.typ], defaultType) : defaultType;

        toImport.push({
            name:       name || 'Import Zeile ' + (ri + 1),
            amount:     Math.abs(betrag),
            date:       datum,
            category:   kat || defaultCat,
            type:       typ,
            account_id: accountId || null
        });
    });

    if (toImport.length === 0) {
        statusEl.textContent = 'Keine gültigen Zeilen zum Importieren gefunden.';
        statusEl.style.color = '#ef4444';
        return;
    }

    document.getElementById('importBtnLabel').textContent = 'Wird importiert…';
    statusEl.textContent  = '';
    let success = 0, errors = 0;

    for (const tx of toImport) {
        try {
            const res = await fetch('/users/haushalt/transaktionen/add', {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify(tx)
            });
            if (res.ok) success++;
            else errors++;
        } catch { errors++; }
    }

    statusEl.textContent = success + ' Transaktion(en) importiert' + (errors > 0 ? ', ' + errors + ' Fehler.' : '.');
    statusEl.style.color = errors > 0 ? '#f59e0b' : '#22c55e';
    document.getElementById('importBtnLabel').textContent = toImport.length + ' Zeilen importieren';

    if (success > 0) {
        await loadData();
        setTimeout(() => closeImportModal(), 1800);
    }
}
// ═══════════════════════════════════════════════════════════════
//  WIEDERKEHRENDE TRANSAKTIONEN
// ═══════════════════════════════════════════════════════════════

const RHYTHMUS_LABELS = {
    woechentlich: 'Wöchentlich',
    monatlich:    'Monatlich',
    viertelj:     'Vierteljährlich',
    halbjaehrl:   'Halbjährlich',
    jaehrlich:    'Jährlich',
};

let alleRecurring  = [];
let recurActiveTab = 'liste';

// ── Laden & Erinnerungsleiste ─────────────────────────────────

async function loadRecurring() {
    try {
        const res = await fetch('/users/haushalt/recurring');
        if (!res.ok) return;
        alleRecurring = await res.json();
        renderReminderBar();
    } catch { /* silent */ }
}

function renderReminderBar() {
    const bar     = document.getElementById('recurringReminder');
    const subEl   = document.getElementById('recurringReminderSub');
    const actEl   = document.getElementById('recurringReminderActions');
    if (!bar || !subEl || !actEl) return;

    const today    = new Date().toISOString().substring(0, 10);
    const faellige = alleRecurring.filter(r => r.aktiv && r.naechste_faelligkeit && r.naechste_faelligkeit <= today);

    if (faellige.length === 0) {
        bar.style.display = 'none';
        return;
    }

    bar.style.display = '';
    subEl.textContent = faellige.length + ' Buchung' + (faellige.length > 1 ? 'en' : '') + ' fällig';

    // Max 3 Quick-Book-Buttons zeigen
    const shown = faellige.slice(0, 3);
    const fmt   = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });
    const isOverdue = r => r.naechste_faelligkeit < today;

    actEl.innerHTML = shown.map(r =>
        '<button class="recurring-book-btn' + (isOverdue(r) ? ' overdue' : '') + '" onclick="quickBook(' + r.id + ', this)">' +
            '<i class="ri-' + (isOverdue(r) ? 'error-warning' : 'check') + '-line"></i> ' +
            escRec(r.name) + ' ' + fmt.format(r.amount) +
        '</button>'
    ).join('') + (faellige.length > 3
        ? '<span style="font-size:0.8rem;color:var(--text-3);padding:0 6px;">+' + (faellige.length - 3) + ' weitere</span>'
        : '');
}

async function quickBook(id, btn) {
    btn.disabled = true;
    btn.innerHTML = '<i class="ri-loader-4-line"></i> Buche…';
    try {
        const res = await fetch('/users/haushalt/recurring/' + id + '/book', { method: 'POST' });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message);
        // Lokal updaten
        const r = alleRecurring.find(x => x.id === id);
        if (r) r.naechste_faelligkeit = data.nextFaelligkeit;
        renderReminderBar();
        // Transaktionsliste neu laden
        await loadData();
        showStatus('Gebucht!', false);
    } catch (err) {
        btn.disabled = false;
        showStatus('Fehler: ' + err.message, true);
    }
}

// ── Modal öffnen/schließen ────────────────────────────────────

function openRecurringModal() {
    // Kategorien und Konten im Formular befüllen
    const catSel = document.getElementById('recurCategory');
    if (catSel) {
        catSel.innerHTML = categories.map(c =>
            '<option value="' + c.name + '">' + c.name + '</option>'
        ).join('');
    }
    const accSel = document.getElementById('recurAccount');
    if (accSel) {
        accSel.innerHTML = '<option value="">Kein Konto</option>' +
            allAccounts.map(a => '<option value="' + a.id + '">' + a.name + '</option>').join('');
    }
    switchRecurTab('liste');
    renderRecurringListe();
    document.getElementById('recurringModalOverlay').classList.add('active');
}

function closeRecurringModal(e) {
    if (!e || e.target === document.getElementById('recurringModalOverlay') || e.currentTarget.tagName === 'BUTTON') {
        document.getElementById('recurringModalOverlay').classList.remove('active');
    }
}

// ── Tabs ──────────────────────────────────────────────────────

function switchRecurTab(tab) {
    recurActiveTab = tab;
    document.getElementById('recurTabListe').classList.toggle('active', tab === 'liste');
    document.getElementById('recurTabNeu').classList.toggle('active',   tab === 'neu');
    document.getElementById('recurPanelListe').style.display = tab === 'liste' ? '' : 'none';
    document.getElementById('recurPanelNeu').style.display   = tab === 'neu'   ? '' : 'none';

    if (tab === 'neu') {
        // Formular leeren für neue Vorlage
        document.getElementById('recurEditId').value      = '';
        document.getElementById('recurName').value        = '';
        document.getElementById('recurType').value        = 'Ausgaben';
        document.getElementById('recurAmount').value      = '';
        document.getElementById('recurRhythmus').value    = 'monatlich';
        document.getElementById('recurFaelligkeit').value = '';
        document.getElementById('recurNotiz').value       = '';
        document.getElementById('recurDeleteBtn').style.display = 'none';
        document.querySelector('#recurTabNeu').innerHTML  = '<i class="ri-add-line"></i> Neue Vorlage';
    }
}

// ── Vorlage-Liste rendern ─────────────────────────────────────

function renderRecurringListe() {
    const container = document.getElementById('recurringListeInhalt');
    if (!container) return;

    if (alleRecurring.length === 0) {
        container.innerHTML =
            '<div style="text-align:center;padding:40px;color:var(--text-3);">' +
                '<i class="ri-loop-right-line" style="font-size:2rem;display:block;margin-bottom:12px;opacity:0.3;"></i>' +
                '<div style="font-weight:600;margin-bottom:4px;">Keine Vorlagen</div>' +
                '<div style="font-size:0.82rem;">Klicke auf „Neue Vorlage", um loszulegen.</div>' +
            '</div>';
        return;
    }

    const today  = new Date().toISOString().substring(0, 10);
    const fmt    = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });

    // Sortieren: Überfällige zuerst
    const sorted = [...alleRecurring].sort((a, b) => {
        if (!a.naechste_faelligkeit) return 1;
        if (!b.naechste_faelligkeit) return -1;
        return a.naechste_faelligkeit.localeCompare(b.naechste_faelligkeit);
    });

    container.innerHTML = sorted.map(r => {
        const isIncome  = r.type === 'Einnahmen';
        const iconColor = isIncome ? '#22c55e' : '#ef4444';
        const iconBg    = isIncome ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)';
        const amtColor  = isIncome ? '#22c55e' : '#ef4444';

        let dueBadge = '';
        if (r.naechste_faelligkeit) {
            const diff = Math.round((new Date(r.naechste_faelligkeit) - new Date(today)) / 86400000);
            if (diff < 0) {
                dueBadge = '<span class="recur-card-due overdue"><i class="ri-error-warning-line"></i> ' + Math.abs(diff) + ' Tage überfällig</span>';
            } else if (diff === 0) {
                dueBadge = '<span class="recur-card-due today"><i class="ri-time-line"></i> Heute fällig</span>';
            } else if (diff <= 7) {
                dueBadge = '<span class="recur-card-due upcoming"><i class="ri-calendar-check-line"></i> in ' + diff + ' Tagen</span>';
            } else {
                const d = new Date(r.naechste_faelligkeit).toLocaleDateString('de-DE', { day: '2-digit', month: 'short', year: 'numeric' });
                dueBadge = '<span class="recur-card-due future">' + d + '</span>';
            }
        }

        const accName  = r.account_id ? (allAccounts.find(a => String(a.id) === String(r.account_id))?.name || '') : '';
        const isFaellig = r.naechste_faelligkeit && r.naechste_faelligkeit <= today;

        return '<div class="recur-card" style="' + (!r.aktiv ? 'opacity:0.5;' : '') + '">' +
            '<div class="recur-card-icon" style="background:' + iconBg + ';color:' + iconColor + ';">' +
                '<i class="ri-loop-right-line"></i>' +
            '</div>' +
            '<div class="recur-card-body">' +
                '<div class="recur-card-name">' + escRec(r.name) + '</div>' +
                '<div class="recur-card-meta">' +
                    '<span>' + escRec(r.category) + '</span>' +
                    '<span>· ' + (RHYTHMUS_LABELS[r.rhythmus] || r.rhythmus) + '</span>' +
                    (accName ? '<span>· ' + escRec(accName) + '</span>' : '') +
                    (r.notiz ? '<span>· ' + escRec(r.notiz) + '</span>' : '') +
                '</div>' +
            '</div>' +
            dueBadge +
            '<div class="recur-card-amount" style="color:' + amtColor + ';">' +
                (isIncome ? '+' : '−') + fmt.format(r.amount) +
            '</div>' +
            '<div class="recur-card-actions">' +
                (isFaellig
                    ? '<button class="recur-icon-btn book" title="Jetzt buchen" onclick="bookFromModal(' + r.id + ', this)"><i class="ri-check-line"></i></button>'
                    : '') +
                '<button class="recur-icon-btn" title="Bearbeiten" onclick="editRecurring(' + r.id + ')"><i class="ri-pencil-line"></i></button>' +
            '</div>' +
        '</div>';
    }).join('');
}

async function bookFromModal(id, btn) {
    btn.disabled = true;
    btn.innerHTML = '<i class="ri-loader-4-line"></i>';
    try {
        const res  = await fetch('/users/haushalt/recurring/' + id + '/book', { method: 'POST' });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message);
        const r = alleRecurring.find(x => x.id === id);
        if (r) r.naechste_faelligkeit = data.nextFaelligkeit;
        renderRecurringListe();
        renderReminderBar();
        await loadData();
        showStatus('Gebucht!', false);
    } catch (err) {
        btn.disabled = false;
        btn.innerHTML = '<i class="ri-check-line"></i>';
        showStatus('Fehler: ' + err.message, true);
    }
}

// ── Bearbeiten ────────────────────────────────────────────────

function editRecurring(id) {
    const r = alleRecurring.find(x => x.id === id);
    if (!r) return;

    // Kategorien + Konten sicherstellen
    const catSel = document.getElementById('recurCategory');
    if (catSel) catSel.innerHTML = categories.map(c => '<option value="' + c.name + '">' + c.name + '</option>').join('');
    const accSel = document.getElementById('recurAccount');
    if (accSel) {
        accSel.innerHTML = '<option value="">Kein Konto</option>' +
            allAccounts.map(a => '<option value="' + a.id + '">' + a.name + '</option>').join('');
    }

    document.getElementById('recurEditId').value          = r.id;
    document.getElementById('recurName').value            = r.name;
    document.getElementById('recurType').value            = r.type;
    document.getElementById('recurAmount').value          = r.amount;
    document.getElementById('recurRhythmus').value        = r.rhythmus;
    document.getElementById('recurFaelligkeit').value     = r.naechste_faelligkeit || '';
    document.getElementById('recurNotiz').value           = r.notiz || '';
    if (catSel) catSel.value = r.category;
    if (accSel) accSel.value = r.account_id || '';
    document.getElementById('recurDeleteBtn').style.display = '';

    document.querySelector('#recurTabNeu').innerHTML = '<i class="ri-pencil-line"></i> Bearbeiten';
    switchRecurTab('neu');
}

// ── Speichern ─────────────────────────────────────────────────

async function saveRecurring() {
    const id         = document.getElementById('recurEditId').value;
    const name       = document.getElementById('recurName').value.trim();
    const type       = document.getElementById('recurType').value;
    const category   = document.getElementById('recurCategory').value;
    const amount     = parseFloat(document.getElementById('recurAmount').value);
    const rhythmus   = document.getElementById('recurRhythmus').value;
    const faelligkeit = document.getElementById('recurFaelligkeit').value || null;
    const account_id = document.getElementById('recurAccount').value || null;
    const notiz      = document.getElementById('recurNotiz').value.trim();

    if (!name || !category || isNaN(amount) || amount <= 0) {
        showStatus('Bitte Name, Kategorie und Betrag ausfüllen.', true);
        return;
    }

    const payload = { name, type, category, amount, rhythmus, naechste_faelligkeit: faelligkeit, account_id, notiz };

    try {
        let res;
        if (id) {
            res = await fetch('/users/haushalt/recurring/' + id, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
        } else {
            res = await fetch('/users/haushalt/recurring/add', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
        }
        if (!res.ok) throw new Error((await res.json()).message || 'Fehler');
        await loadRecurring();
        renderRecurringListe();
        switchRecurTab('liste');
        showStatus(id ? 'Vorlage aktualisiert!' : 'Vorlage erstellt!', false);
    } catch (err) {
        showStatus('Fehler: ' + err.message, true);
    }
}

// ── Löschen ───────────────────────────────────────────────────

function deleteRecurring() {
    const id = document.getElementById('recurEditId').value;
    if (!id) return;

    const vorlage = alleRecurring.find(r => r.id == id);
    alleRecurring = alleRecurring.filter(r => r.id != id);
    renderRecurringListe();
    switchRecurTab('liste');

    let deleteTimer = null;

    function restoreVorlage() {
        clearTimeout(deleteTimer);
        if (vorlage) alleRecurring.push(vorlage);
        renderRecurringListe();
    }

    showUndoToast(vorlage ? `„${vorlage.name}" gelöscht` : 'Vorlage gelöscht', restoreVorlage);

    deleteTimer = setTimeout(async () => {
        try {
            const res = await fetch('/users/haushalt/recurring/' + id, { method: 'DELETE' });
            if (!res.ok) throw new Error();
            await loadRecurring();
            renderRecurringListe();
        } catch {
            showStatus('Fehler beim Löschen.', true);
            restoreVorlage();
        }
    }, 5000);
}

// ── Hilfsfunktion ─────────────────────────────────────────────

function escRec(str) {
    return String(str || '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}