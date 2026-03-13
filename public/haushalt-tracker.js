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
        const [txRes, catRes, accRes] = await Promise.all([
            fetch('/users/haushalt/transaktionen'),
            fetch('/users/haushalt/tracker/categories'),
            fetch('/users/haushalt/tracker/accounts')
        ]);
        transactions = await txRes.json();
        const userCats = await catRes.json();
        allAccounts = await accRes.json();

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

async function deleteTransaction(id) {
    try {
        const res = await fetch(`/users/haushalt/transaktionen/${id}`, { method: 'DELETE' });
        if (!res.ok) throw new Error((await res.json()).message);
        await loadData();
    } catch (err) {
        showStatus(err.message, true);
    }
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
// ─── Export Modal ──────────────────────────────────────────────

let exportFormat = 'pdf';

function openExportModal() {
    const filtered = getFiltered();
    const info     = document.getElementById('exportInfo');
    if (info) {
        info.innerHTML = '<div>· ' + filtered.length + ' Transaktion(en) im aktuellen Filter</div>';
    }
    document.getElementById('exportModal').style.display = 'flex';
}

function closeExportModal() {
    document.getElementById('exportModal').style.display = 'none';
}

function setExportFormat(fmt) {
    exportFormat = fmt;
    document.querySelectorAll('.export-format-tab').forEach(b => b.classList.toggle('active', b.dataset.fmt === fmt));
    document.getElementById('exportPdfOptions').style.display   = fmt === 'pdf'   ? '' : 'none';
    document.getElementById('exportCsvOptions').style.display   = fmt === 'csv'   ? '' : 'none';
    document.getElementById('exportMonatOptions').style.display = fmt === 'monat' ? '' : 'none';
    const labels = { pdf: 'PDF erstellen', csv: 'CSV herunterladen', monat: 'Monatsanalyse erstellen' };
    document.getElementById('exportBtnLabel').textContent = labels[fmt] || 'Exportieren';

    // Monatsliste befüllen
    if (fmt === 'monat') {
        const sel = document.getElementById('exportMonatSelect');
        const months = [...new Set(transactions.map(t => (t.date || '').substring(0, 7)).filter(Boolean))].sort().reverse();
        sel.innerHTML = months.map(m => {
            const label = new Date(m + '-01').toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
            return '<option value="' + m + '">' + label + '</option>';
        }).join('');
    }
}

// csvMode-Hint aktualisieren
document.addEventListener('change', e => {
    if (e.target.name === 'csvMode') {
        const hint = document.getElementById('csvModeHint');
        if (!hint) return;
        if (e.target.value === 'reimport') {
            hint.textContent = 'Enthält alle Felder im gleichen Format wie der CSV-Import — kann 1:1 wieder eingelesen werden.';
        } else {
            hint.textContent = 'Lesbare Spaltenbezeichnungen mit negativen Beträgen für Ausgaben — gut für Excel/Steuerberater.';
        }
    }
});

async function runExport() {
    if (exportFormat === 'csv') {
        exportCSV();
        return;
    }
    // PDF-Export ist Pro-Feature
    try {
        const r = await fetch('/users/me/plan');
        const { plan } = await r.json();
        if (plan !== 'pro') {
            if (typeof showUpgradeModal === 'function') {
                showUpgradeModal('PDF-Export ist ein Pro-Feature', 'Im Free-Tarif ist der PDF-Export nicht verfügbar. Upgrade auf Pro um Monatsanalysen und PDF-Berichte zu exportieren.');
            } else {
                window.location.href = '/users/tarife';
            }
            return;
        }
    } catch { /* Netzwerkfehler – im Zweifel erlauben */ }

    if (exportFormat === 'monat') exportMonatsanalyse();
    else exportPDF();
}

// ── CSV Export ────────────────────────────────────────────────

function exportCSV() {
    const delim    = document.querySelector('input[name="exportDelimiter"]:checked')?.value || ';';
    const mode     = document.querySelector('input[name="csvMode"]:checked')?.value || 'reimport';
    const filtered = getFiltered();

    let header, rows;

    if (mode === 'reimport') {
        // 1:1 reimportierbar — Spaltenbezeichnungen identisch zum Import-Mapping
        header = ['Datum', 'Name', 'Kategorie', 'Typ', 'Betrag', 'Konto'].join(delim);
        rows = filtered.map(t => {
            const accName = t.account_id ? (allAccounts.find(a => String(a.id) === String(t.account_id))?.name || '') : '';
            return [
                t.date?.substring(0, 10) || '',
                '"' + (t.name     || '').replace(/"/g, '""') + '"',
                '"' + (t.category || '').replace(/"/g, '""') + '"',
                t.type || 'Ausgaben',
                // Betrag immer positiv — Typ-Spalte gibt Richtung vor (wie Import erwartet)
                Math.abs(t.amount).toFixed(2).replace('.', ','),
                '"' + accName.replace(/"/g, '""') + '"'
            ].join(delim);
        });
    } else {
        // Lesbare Version — negative Beträge für Ausgaben, menschenlesbare Spalten
        header = ['Datum', 'Bezeichnung', 'Kategorie', 'Art', 'Betrag (€)', 'Konto'].join(delim);
        rows = filtered.map(t => {
            const accName = t.account_id ? (allAccounts.find(a => String(a.id) === String(t.account_id))?.name || '') : '';
            const signed  = t.type === 'Ausgaben' ? -Math.abs(t.amount) : Math.abs(t.amount);
            return [
                t.date?.substring(0, 10) || '',
                '"' + (t.name     || '').replace(/"/g, '""') + '"',
                '"' + (t.category || '').replace(/"/g, '""') + '"',
                t.type || '',
                signed.toFixed(2).replace('.', ','),
                '"' + accName.replace(/"/g, '""') + '"'
            ].join(delim);
        });
    }

    const suffix   = mode === 'reimport' ? '_reimport' : '_lesbar';
    const blob     = new Blob(['\uFEFF' + [header, ...rows].join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url      = URL.createObjectURL(blob);
    const a        = document.createElement('a');
    a.href         = url;
    a.download     = 'transaktionen' + suffix + '_' + new Date().toISOString().substring(0, 10) + '.csv';
    a.click();
    URL.revokeObjectURL(url);
    closeExportModal();
}


// ── Monatsanalyse PDF ─────────────────────────────────────────

async function exportMonatsanalyse() {
    const { jsPDF } = window.jspdf;
    if (!jsPDF) { alert('PDF-Bibliothek wird geladen, bitte kurz warten.'); return; }

    const monat      = document.getElementById('exportMonatSelect')?.value;
    const chartType  = document.querySelector('input[name="monatChartType"]:checked')?.value || 'bar';
    if (!monat) { alert('Bitte einen Monat auswählen.'); return; }

    const monatLabel = new Date(monat + '-01').toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
    const monatTxs   = transactions.filter(t => (t.date || '').startsWith(monat));

    if (monatTxs.length === 0) {
        alert('Keine Transaktionen für ' + monatLabel + ' gefunden.');
        return;
    }

    // Farben – grüner Haushalt-Akzent statt Blau
    const W = 210, H = 297, M = 16;
    const navy      = [15,  30,  70];
    const accentGreen = [5, 150, 105];   // grüner Akzent für Haushalt
    const white     = [255, 255, 255];
    const lineGrey  = [226, 232, 240];
    const rowAlt    = [248, 250, 252];
    const inkDark   = [30,  41,  59];
    const inkMid    = [71,  85, 105];
    const greenInk  = [22, 163,  74];
    const redInk    = [220,  38,  38];
    const greenBg   = [220, 252, 231];
    const redBg     = [254, 226, 226];
    const amberBg   = [254, 243, 199];

    const fmtEur  = v => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(v);
    const fmtDate = s => s ? new Date(s).toLocaleDateString('de-DE') : '';

    const totalInc = monatTxs.filter(t => t.type === 'Einnahmen').reduce((s, t) => s + t.amount, 0);
    const totalExp = monatTxs.filter(t => t.type === 'Ausgaben').reduce((s, t) => s + t.amount, 0);
    const net      = totalInc - totalExp;

    // Kategorien
    const byKat = {};
    monatTxs.filter(t => t.type === 'Ausgaben').forEach(t => {
        const k = t.category || 'Sonstiges';
        byKat[k] = (byKat[k] || 0) + t.amount;
    });
    const topKats = Object.entries(byKat).sort((a, b) => b[1] - a[1]);

    // Nach Tag gruppieren für Chart
    const byDay = {};
    monatTxs.forEach(t => {
        const d = (t.date || '').substring(0, 10);
        if (!byDay[d]) byDay[d] = { inc: 0, exp: 0 };
        if (t.type === 'Einnahmen') byDay[d].inc += t.amount;
        else byDay[d].exp += t.amount;
    });
    const dayKeys   = Object.keys(byDay).sort();
    const dayLabels = dayKeys.map(d => new Date(d).toLocaleDateString('de-DE', { day: '2-digit', month: 'short' }));

    // Chart offscreen rendern
    async function renderMonatChart() {
        return new Promise(resolve => {
            const canvas     = document.createElement('canvas');
            canvas.width     = 900;
            canvas.height    = 320;
            canvas.style.position = 'absolute';
            canvas.style.left = '-9999px';
            document.body.appendChild(canvas);

            const isDoughnut = chartType === 'doughnut';
            const isLine     = chartType === 'line';
            const colors     = ['#059669','#ef4444','#f59e0b','#3b82f6','#ec4899','#14b8a6','#a855f7','#f97316'];

            let datasets, labels;
            if (isDoughnut) {
                labels   = topKats.map(([k]) => k);
                datasets = [{ label: 'Ausgaben', data: topKats.map(([, v]) => v),
                    backgroundColor: labels.map((_, i) => colors[i % colors.length]),
                    borderWidth: 2, borderColor: '#fff' }];
            } else {
                labels   = dayLabels;
                datasets = [
                    { label: 'Einnahmen', data: dayKeys.map(k => byDay[k].inc),
                      backgroundColor: isLine ? 'rgba(34,197,94,0.12)' : 'rgba(34,197,94,0.75)',
                      borderColor: '#16a34a', borderWidth: 2, fill: isLine, tension: 0.35,
                      pointRadius: isLine ? 3 : 0, borderRadius: 4 },
                    { label: 'Ausgaben', data: dayKeys.map(k => byDay[k].exp),
                      backgroundColor: isLine ? 'rgba(220,38,38,0.12)' : 'rgba(220,38,38,0.75)',
                      borderColor: '#dc2626', borderWidth: 2, fill: isLine, tension: 0.35,
                      pointRadius: isLine ? 3 : 0, borderRadius: 4 }
                ];
            }

            const bgPlugin = { id: 'bg', beforeDraw(ch) { const c = ch.ctx; c.save(); c.fillStyle = '#f9fafb'; c.fillRect(0,0,ch.width,ch.height); c.fillStyle = '#ffffff'; c.beginPath(); if (c.roundRect) { c.roundRect(10,10,ch.width-20,ch.height-20,10); } else { c.rect(10,10,ch.width-20,ch.height-20); } c.fill(); c.restore(); } };
            const ch = new Chart(canvas.getContext('2d'), {
                type: isDoughnut ? 'doughnut' : chartType,
                data: { labels, datasets },
                options: {
                    responsive: false, animation: false,
                    plugins: { legend: { labels: { color: '#475569', font: { size: 12, family: 'helvetica' } } } },
                    scales: isDoughnut ? {} : {
                        y: { ticks: { color: '#64748b', callback: v => v + ' €', font: { size: 10 } }, grid: { color: 'rgba(0,0,0,0.06)' } },
                        x: { ticks: { color: '#64748b', font: { size: 10 }, maxRotation: 45 }, grid: { color: 'rgba(0,0,0,0.04)' } }
                    }
                },
                plugins: [bgPlugin]
            });

            setTimeout(() => {
                const img = canvas.toDataURL('image/png');
                ch.destroy();
                document.body.removeChild(canvas);
                resolve(img);
            }, 300);
        });
    }

    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

    // ── Seiten-Hintergrund ──
    doc.setFillColor(250, 251, 253);
    doc.rect(0, 0, W, H, 'F');

    // ── Header-Banner (grün) ──
    doc.setFillColor(...accentGreen);
    doc.rect(0, 0, W, 38, 'F');

    doc.setTextColor(...white);
    doc.setFontSize(18); doc.setFont('helvetica', 'bold');
    doc.text('Monatsanalyse', M, 16);
    doc.setFontSize(11); doc.setFont('helvetica', 'normal');
    doc.text(monatLabel, M, 25);
    doc.setFontSize(8);
    doc.text('Golden Goat Capital  ·  Haushalt  ·  Erstellt am ' + new Date().toLocaleDateString('de-DE'), M, 33);

    // ── Zusammenfassung Kacheln ──
    let y = 46;
    const tileW = (W - M * 2 - 10) / 3;

    // Einnahmen
    doc.setFillColor(...greenBg);
    doc.roundedRect(M, y, tileW, 22, 2, 2, 'F');
    doc.setFillColor(...greenInk);
    doc.roundedRect(M, y, tileW, 2, 1, 1, 'F');
    doc.setTextColor(...greenInk);
    doc.setFontSize(7); doc.setFont('helvetica', 'bold');
    doc.text('EINNAHMEN', M + 4, y + 8);
    doc.setFontSize(13); doc.setFont('helvetica', 'bold');
    doc.text(fmtEur(totalInc), M + 4, y + 17);

    // Ausgaben
    const tile2X = M + tileW + 5;
    doc.setFillColor(...redBg);
    doc.roundedRect(tile2X, y, tileW, 22, 2, 2, 'F');
    doc.setFillColor(...redInk);
    doc.roundedRect(tile2X, y, tileW, 2, 1, 1, 'F');
    doc.setTextColor(...redInk);
    doc.setFontSize(7); doc.setFont('helvetica', 'bold');
    doc.text('AUSGABEN', tile2X + 4, y + 8);
    doc.setFontSize(13); doc.setFont('helvetica', 'bold');
    doc.text(fmtEur(totalExp), tile2X + 4, y + 17);

    // Saldo
    const tile3X = M + (tileW + 5) * 2;
    doc.setFillColor(...(net >= 0 ? greenBg : redBg));
    doc.roundedRect(tile3X, y, tileW, 22, 2, 2, 'F');
    doc.setFillColor(...(net >= 0 ? greenInk : redInk));
    doc.roundedRect(tile3X, y, tileW, 2, 1, 1, 'F');
    doc.setTextColor(...(net >= 0 ? greenInk : redInk));
    doc.setFontSize(7); doc.setFont('helvetica', 'bold');
    doc.text('SALDO', tile3X + 4, y + 8);
    doc.setFontSize(13); doc.setFont('helvetica', 'bold');
    doc.text((net >= 0 ? '+' : '') + fmtEur(net), tile3X + 4, y + 17);

    y += 28;

    // ── Diagramm ──
    doc.setFillColor(...white);
    doc.setDrawColor(...lineGrey); doc.setLineWidth(0.3);
    doc.roundedRect(M, y, W - M*2, 62, 2, 2, 'FD');

    doc.setTextColor(...navy);
    doc.setFontSize(9); doc.setFont('helvetica', 'bold');
    doc.text('Einnahmen & Ausgaben im ' + monatLabel, M + 4, y + 7);

    const chartImg = await renderMonatChart();
    if (chartImg) doc.addImage(chartImg, 'PNG', M + 1, y + 10, W - M*2 - 2, 50);
    y += 68;

    // ── Kategorien-Aufschlüsselung ──
    if (topKats.length > 0) {
        if (y > H - 50) { doc.addPage(); doc.setFillColor(250,251,253); doc.rect(0,0,W,H,'F'); y = 20; }
        doc.setTextColor(...navy);
        doc.setFontSize(9); doc.setFont('helvetica', 'bold');
        doc.text('Ausgaben nach Kategorie', M, y + 1); y += 6;

        const barW  = W - M*2 - 60;
        const colors = ['#059669','#ef4444','#f59e0b','#3b82f6','#ec4899','#14b8a6'];

        topKats.slice(0, 8).forEach(([kat, val], i) => {
            if (y > H - 30) return;
            const pct    = totalExp > 0 ? val / totalExp : 0;
            const filled = barW * pct;

            doc.setTextColor(...inkDark);
            doc.setFontSize(7.5); doc.setFont('helvetica', 'normal');
            doc.text(kat.length > 22 ? kat.substring(0, 20) + '…' : kat, M, y + 4);

            doc.setFillColor(...lineGrey);
            doc.roundedRect(M + 52, y, barW, 5, 1, 1, 'F');
            const hex  = colors[i % colors.length];
            const r    = parseInt(hex.slice(1,3), 16);
            const g    = parseInt(hex.slice(3,5), 16);
            const b    = parseInt(hex.slice(5,7), 16);
            doc.setFillColor(r, g, b);
            if (filled > 0) doc.roundedRect(M + 52, y, filled, 5, 1, 1, 'F');

            doc.setTextColor(...inkMid);
            doc.setFontSize(7); doc.setFont('helvetica', 'bold');
            doc.text(fmtEur(val) + ' (' + (pct * 100).toFixed(1) + '%)', W - M, y + 4, { align: 'right' });
            y += 9;
        });
        y += 4;
    }

    // ── Transaktionsliste ──
    if (y > H - 60) { doc.addPage(); doc.setFillColor(250,251,253); doc.rect(0,0,W,H,'F'); y = 20; }

    doc.setDrawColor(...lineGrey); doc.setLineWidth(0.3);
    doc.line(M, y, W - M, y); y += 5;
    doc.setTextColor(...navy);
    doc.setFontSize(9); doc.setFont('helvetica', 'bold');
    doc.text('Alle Transaktionen (' + monatTxs.length + ')', M, y); y += 5;

    // Tabellen-Header (grün)
    doc.setFillColor(...accentGreen);
    doc.rect(M, y, W - M*2, 7, 'F');
    doc.setTextColor(...white);
    doc.setFontSize(6.5); doc.setFont('helvetica', 'bold');
    const colX = { date: M + 2, name: M + 24, cat: M + 88, amt: W - M - 2 };
    doc.text('DATUM',        colX.date, y + 4.5);
    doc.text('BEZEICHNUNG',  colX.name, y + 4.5);
    doc.text('KATEGORIE',    colX.cat,  y + 4.5);
    doc.text('BETRAG',       colX.amt,  y + 4.5, { align: 'right' });
    y += 8;

    const sorted = monatTxs.slice().sort((a, b) => (a.date || '') < (b.date || '') ? -1 : 1);
    sorted.forEach((t, ri) => {
        if (y > H - 15) {
            doc.addPage();
            doc.setFillColor(250, 251, 253);
            doc.rect(0, 0, W, H, 'F');
            y = 16;
            doc.setFillColor(...accentGreen);
            doc.rect(M, y, W - M*2, 7, 'F');
            doc.setTextColor(...white);
            doc.setFontSize(6.5); doc.setFont('helvetica', 'bold');
            doc.text('DATUM', colX.date, y + 4.5);
            doc.text('BEZEICHNUNG', colX.name, y + 4.5);
            doc.text('KATEGORIE', colX.cat, y + 4.5);
            doc.text('BETRAG', colX.amt, y + 4.5, { align: 'right' });
            y += 8;
        }

        const isInc = t.type === 'Einnahmen';
        const rowH  = 6.5;
        if (ri % 2 === 1) { doc.setFillColor(...rowAlt); doc.rect(M, y - 0.5, W - M*2, rowH, 'F'); }

        doc.setFontSize(7); doc.setFont('helvetica', 'normal');
        doc.setTextColor(...inkDark);
        doc.text(fmtDate(t.date?.substring(0, 10)), colX.date, y + 4);

        const nm = (t.name || '').length > 34 ? t.name.substring(0, 32) + '…' : (t.name || '');
        doc.text(nm, colX.name, y + 4);

        doc.setTextColor(...inkMid);
        const cat = (t.category || '').length > 16 ? t.category.substring(0, 14) + '…' : (t.category || '');
        doc.text(cat, colX.cat, y + 4);

        doc.setTextColor(...(isInc ? greenInk : redInk));
        doc.setFont('helvetica', 'bold');
        doc.text((isInc ? '+' : '−') + fmtEur(t.amount), colX.amt, y + 4, { align: 'right' });
        y += rowH;
    });

    // ── Footer ──
    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFillColor(...white);
        doc.rect(0, H - 14, W, 14, 'F');
        doc.setFillColor(...accentGreen);
        doc.rect(0, H - 14, W, 0.7, 'F');
        doc.setTextColor(107, 114, 128);
        doc.setFontSize(6.5); doc.setFont('helvetica', 'normal');
        doc.text('Golden Goat Capital · Haushalt · Monatsanalyse ' + monatLabel, M, H - 5);
        doc.text('Seite ' + i + ' / ' + pageCount, W - M, H - 5, { align: 'right' });
    }

    doc.save('monatsanalyse_haushalt_' + monat + '.pdf');
    closeExportModal();
}

// ── PDF Export ────────────────────────────────────────────────

async function exportPDF() {
    const { jsPDF } = window.jspdf;
    if (!jsPDF) { alert('PDF-Bibliothek wird geladen, bitte kurz warten.'); return; }

    const chartTypes = [...document.querySelectorAll('input[name="exportChartType"]:checked')].map(el => el.value);
    if (chartTypes.length === 0) chartTypes.push('bar');
    const groupBy    = document.querySelector('input[name="exportGroupBy"]:checked')?.value || 'month';

    const filtered = getFiltered();

    if (filtered.length === 0) {
        alert('Keine Transaktionen für den aktuellen Filter.');
        return;
    }

    // ─── Designkonstanten (grüner Haushalt-Akzent) ──────────────
    const fmtEur  = v => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(v);
    const fmtDate = s => s ? new Date(s).toLocaleDateString('de-DE') : '';

    const W = 210, H = 297, M = 16;
    const white        = [255, 255, 255];
    const pagesBg      = [250, 251, 253];
    const navy         = [17,  24,  39];
    const accentGreen  = [5, 150, 105];
    const accentLight  = [236, 253, 245];
    const accentBorder = [167, 243, 208];
    const slate        = [107, 114, 128];
    const lineGrey     = [229, 231, 235];
    const rowAlt       = [249, 250, 251];
    const inkDark      = [17,  24,  39];
    const inkMid       = [75,  85, 99];
    const greenInk     = [21, 128,  61];
    const redInk       = [185,  28,  28];
    const greenBg      = [240, 253, 244];
    const redBg        = [254, 242, 242];

    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

    let filterDesc = 'Alle Transaktionen';
    if (filterMode === 'months' && selectedMonths.size > 0) {
        filterDesc = [...selectedMonths].sort().map(m => new Date(m+'-01').toLocaleDateString('de-DE',{month:'long',year:'numeric'})).join(', ');
    } else if (filterMode === 'range' && (rangeFrom || rangeTo)) {
        filterDesc = (rangeFrom ? fmtDate(rangeFrom) : '?') + ' \u2013 ' + (rangeTo ? fmtDate(rangeTo) : 'heute');
    } else if (filterMode === 'weeks' && selectedWeeks.size > 0) {
        filterDesc = 'KW ' + [...selectedWeeks].sort().map(w => parseInt(w.split('-W')[1])).join(', ');
    }

    // ─── Seitenhintergrund ──────────────────────────────────────
    function paintBg() {
        doc.setFillColor(...pagesBg);
        doc.rect(0, 0, W, H, 'F');
    }

    // ─── Header ─────────────────────────────────────────────────
    function drawHeader(localPage) {
        paintBg();
        doc.setFillColor(...white);
        doc.rect(0, 0, W, 44, 'F');
        doc.setFillColor(...accentGreen);
        doc.rect(0, 43, W, 1, 'F');

        doc.setTextColor(...navy);
        doc.setFontSize(13); doc.setFont('helvetica', 'bold');
        doc.text('Golden Goat Capital', M, 13);



        doc.setFontSize(7.5); doc.setFont('helvetica', 'normal');
        doc.setTextColor(...slate);
        doc.text('Finanzbericht \u00b7 ' + filterDesc, M, 20);
        doc.text('Erstellt am ' + new Date().toLocaleDateString('de-DE'), M, 26);

        doc.setTextColor(...slate);
        doc.setFontSize(7); doc.setFont('helvetica', 'normal');
        doc.text('Seite ' + localPage, W - M, 39, { align: 'right' });
    }

    // ─── Footer ─────────────────────────────────────────────────
    function drawFooter() {
        doc.setFillColor(...white);
        doc.rect(0, H - 14, W, 14, 'F');
        doc.setFillColor(...accentGreen);
        doc.rect(0, H - 14, W, 0.7, 'F');
        doc.setTextColor(...slate);
        doc.setFontSize(6.5); doc.setFont('helvetica', 'normal');
        doc.text('Golden Goat Capital \u00b7 Haushalt \u00b7 Vertraulich', M, H - 5);
        doc.text(new Date().toLocaleDateString('de-DE'), W - M, H - 5, { align: 'right' });
    }

    // ─── Folgeseite ──────────────────────────────────────────────
    function addTxPage(localPage) {
        doc.addPage();
        drawHeader(localPage);
        drawFooter();
        doc.setFillColor(...accentLight);
        doc.rect(0, 44, W, 7, 'F');
        doc.setTextColor(...accentGreen);
        doc.setFontSize(6.5); doc.setFont('helvetica', 'bold');
        doc.text('TRANSAKTIONEN \u00b7 Haushalt \u00b7 Seite ' + localPage, W / 2, 49, { align: 'center' });
        return 54;
    }

    // ─── Summary-Kacheln ────────────────────────────────────────
    function drawSummaryKacheln(txList, y) {
        const inc = txList.filter(t => t.type === 'Einnahmen').reduce((s,t) => s+t.amount, 0);
        const exp = txList.filter(t => t.type === 'Ausgaben').reduce((s,t) => s+t.amount, 0);
        const net = inc - exp;
        const tiles = [
            { label:'Einnahmen',        val: fmtEur(inc), col: greenInk, bg: greenBg },
            { label:'Ausgaben',         val: fmtEur(exp), col: redInk,   bg: redBg   },
            { label:'Gewinn / Verlust', val: (net>=0?'+':'') + fmtEur(net), col: net>=0 ? greenInk : redInk, bg: net>=0 ? greenBg : redBg },
        ];
        const tW = (W - M*2 - 8) / 3;
        tiles.forEach((t, i) => {
            const x = M + i * (tW + 4);
            doc.setFillColor(...t.bg);
            doc.roundedRect(x, y, tW, 19, 1.5, 1.5, 'F');
            doc.setDrawColor(...lineGrey); doc.setLineWidth(0.25);
            doc.roundedRect(x, y, tW, 19, 1.5, 1.5, 'S');
            doc.setFillColor(...t.col);
            doc.roundedRect(x, y, tW, 2, 1, 1, 'F');
            doc.setTextColor(...t.col);
            doc.setFontSize(9.5); doc.setFont('helvetica', 'bold');
            doc.text(t.val, x + tW/2, y + 11.5, { align:'center' });
            doc.setTextColor(...inkMid);
            doc.setFontSize(6); doc.setFont('helvetica', 'normal');
            doc.text(t.label, x + tW/2, y + 16.5, { align:'center' });
        });
        return y + 23;
    }

    // ─── Diagramm ────────────────────────────────────────────────
    async function renderChart(txList, cType, mmW, mmH) {
        return new Promise(resolve => {
            if (!txList.length) { resolve(null); return; }
            const CW = 1200;
            const CH = Math.round(CW * (mmH / mmW));
            const canvas = document.createElement('canvas');
            canvas.width  = CW; canvas.height = CH;
            canvas.style.cssText = 'position:absolute;left:-9999px;top:-9999px;';
            document.body.appendChild(canvas);
            const ctx = canvas.getContext('2d');

            const kfn = groupBy==='day'  ? t=>t.date?.substring(0,10)
                      : groupBy==='week' ? t=>getWeekKey(new Date(t.date?.substring(0,10)))
                      : t=>t.date?.substring(0,7);
            const lfn = groupBy==='day'  ? k=>new Date(k).toLocaleDateString('de-DE',{day:'2-digit',month:'short'})
                      : groupBy==='week' ? k=>'KW '+parseInt(k.split('-W')[1])
                      : k=>new Date(k+'-01').toLocaleDateString('de-DE',{month:'short',year:'numeric'});

            const isDoughnut = cType === 'doughnut';
            let labels, datasets;

            if (isDoughnut) {
                const catMap = {};
                txList.filter(t=>t.type==='Ausgaben').forEach(t => {
                    catMap[t.category] = (catMap[t.category]||0) + t.amount;
                });
                const totalExp = Object.values(catMap).reduce((s,v)=>s+v, 0);
                const ck   = Object.keys(catMap).sort((a,b)=>catMap[b]-catMap[a]);
                const cols = ['#059669','#dc2626','#d97706','#3b82f6','#7c3aed','#0891b2','#db2777','#ea580c','#65a30d','#0369a1'];
                labels   = ck.map(c => c + '  ' + (totalExp>0 ? (catMap[c]/totalExp*100).toFixed(1) : '0.0') + '%');
                datasets = [{ data: ck.map(c=>catMap[c]), backgroundColor: ck.map((_,i)=>cols[i%cols.length]), borderWidth: 3, borderColor: '#ffffff' }];
            } else {
                const g = {};
                txList.forEach(t => {
                    const k = kfn(t); if (!g[k]) g[k]={income:0,expense:0};
                    if (t.type==='Einnahmen') g[k].income+=t.amount; else g[k].expense+=t.amount;
                });
                const sk = Object.keys(g).sort();
                labels = sk.map(lfn);
                const isLine = cType === 'line';
                datasets = [
                    { label:'Einnahmen', data:sk.map(k=>g[k].income),
                      backgroundColor: isLine ? 'rgba(21,128,61,0.12)' : 'rgba(21,128,61,0.85)',
                      borderColor:'#15803d', borderWidth:isLine?3:0, fill:isLine, tension:0.35,
                      pointBackgroundColor:'#15803d', pointBorderColor:'#fff', pointBorderWidth:2,
                      pointRadius:isLine?5:0, borderRadius:isLine?0:5, borderSkipped:false },
                    { label:'Ausgaben',  data:sk.map(k=>g[k].expense),
                      backgroundColor: isLine ? 'rgba(185,28,28,0.12)' : 'rgba(185,28,28,0.85)',
                      borderColor:'#b91c1c', borderWidth:isLine?3:0, fill:isLine, tension:0.35,
                      pointBackgroundColor:'#b91c1c', pointBorderColor:'#fff', pointBorderWidth:2,
                      pointRadius:isLine?5:0, borderRadius:isLine?0:5, borderSkipped:false }
                ];
            }

            const FS_TICK   = Math.round(CW * 0.022);
            const FS_LEGEND = Math.round(CW * 0.025);
            const FS_DLEG   = Math.round(CW * 0.019);
            const fmtShort = v => {
                if (v >= 1000000) return (v/1000000).toFixed(1).replace('.',',')+' Mio€';
                if (v >= 1000)    return (v/1000).toFixed(v%1000===0?0:1).replace('.',',')+' k€';
                return v.toLocaleString('de-DE')+'€';
            };
            const bgPlugin = { id:'whitebg', beforeDraw(ch) {
                const c=ch.ctx; c.save(); c.fillStyle='#f9fafb'; c.fillRect(0,0,CW,CH);
                c.fillStyle='#ffffff'; c.beginPath();
                if (c.roundRect) { c.roundRect(10,10,CW-20,CH-20,14); } else { c.rect(10,10,CW-20,CH-20); }
                c.fill(); c.restore();
            }};

            const ch = new Chart(ctx, {
                type: isDoughnut ? 'doughnut' : cType,
                data: { labels, datasets },
                options: {
                    responsive: false, animation: false,
                    layout: { padding: { top:28, right:28, bottom:20, left:20 } },
                    plugins: {
                        legend: { position: isDoughnut ? 'right' : 'bottom',
                            labels: { color:'#1f2937',
                                font:{ size:isDoughnut ? FS_DLEG : FS_LEGEND, family:'Arial, sans-serif', weight:'500' },
                                boxWidth: isDoughnut?20:22, boxHeight: isDoughnut?20:16,
                                padding: isDoughnut?16:26, usePointStyle: !isDoughnut, pointStyleWidth: 22 }
                        },
                        tooltip: { enabled: false }
                    },
                    scales: isDoughnut ? {} : {
                        y: { beginAtZero:true, grid:{ color:'rgba(0,0,0,0.06)', lineWidth:1.5 },
                            border:{ display:false }, ticks:{ color:'#4b5563',
                            font:{ size:FS_TICK, family:'Arial, sans-serif' },
                            callback: v => fmtShort(v), maxTicksLimit:6, padding:10 } },
                        x: { grid:{ display:false }, border:{ display:false }, ticks:{ color:'#4b5563',
                            font:{ size:FS_TICK, family:'Arial, sans-serif' }, maxRotation:0,
                            maxTicksLimit:12, padding:8 } }
                    }
                },
                plugins: [bgPlugin]
            });

            setTimeout(() => {
                const img = canvas.toDataURL('image/png', 1.0);
                ch.destroy(); document.body.removeChild(canvas);
                resolve(img);
            }, 400);
        });
    }

    // ─── Übersichtsseite ─────────────────────────────────────────
    async function drawOverviewPage(localPage) {
        drawHeader(localPage);
        drawFooter();
        let y = 49;

        doc.setTextColor(...slate);
        doc.setFontSize(6.5); doc.setFont('helvetica', 'bold');
        doc.text('ZUSAMMENFASSUNG', M, y); y += 5;

        y = drawSummaryKacheln(filtered, y);
        y += 5;

        doc.setDrawColor(...lineGrey); doc.setLineWidth(0.3);
        doc.line(M, y, W-M, y); y += 5;

        doc.setTextColor(...slate);
        doc.setFontSize(6.5); doc.setFont('helvetica', 'bold');
        doc.text('AUSWERTUNG', M, y); y += 4;

        const CHART_H = 47, CHART_GAP = 4, cW = W - M*2;

        if (filtered.length > 0) {
            for (const cType of chartTypes) {
                const img = await renderChart(filtered, cType, cW, CHART_H);
                if (img) {
                    doc.setFillColor(...white);
                    doc.setDrawColor(...lineGrey); doc.setLineWidth(0.25);
                    doc.roundedRect(M, y, cW, CHART_H, 2, 2, 'FD');
                    doc.addImage(img, 'PNG', M + 1, y + 1, cW - 2, CHART_H - 2);
                    y += CHART_H + CHART_GAP;
                }
            }
        }
    }

    // ─── Transaktionsseiten ──────────────────────────────────────
    function groupTx(txList) {
        const g = {};
        txList.forEach(t => {
            let k = groupBy==='day'  ? (t.date?.substring(0,10)||'?')
                  : groupBy==='week' ? getWeekKey(new Date(t.date?.substring(0,10)))
                  : (t.date?.substring(0,7)||'?');
            if (!g[k]) g[k]=[];
            g[k].push(t);
        });
        return g;
    }

    // Spalten ohne KONTO (haushalt hat keine Konten)
    const colX = { date:M+2, name:M+28, cat:M+105, amt:W-M-2 };

    async function drawTransactionPages(localPage) {
        let y = addTxPage(localPage);
        const grouped = groupTx(filtered);
        const keys    = Object.keys(grouped).sort();

        for (const key of keys) {
            if (y > H - 46) { localPage++; y = addTxPage(localPage); }

            let grpLabel = key;
            if (groupBy==='month')     grpLabel = new Date(key+'-01').toLocaleDateString('de-DE',{month:'long',year:'numeric'});
            else if (groupBy==='week') grpLabel = 'KW ' + parseInt(key.split('-W')[1]) + ' \u00b7 ' + key.split('-W')[0];
            else                       grpLabel = fmtDate(key);

            const gInc = grouped[key].filter(t=>t.type==='Einnahmen').reduce((s,t)=>s+t.amount,0);
            const gExp = grouped[key].filter(t=>t.type==='Ausgaben').reduce((s,t)=>s+t.amount,0);
            const gNet = gInc - gExp;

            const grpH = 13;
            doc.setFillColor(...accentLight);
            doc.rect(M, y, W-M*2, grpH, 'F');
            doc.setDrawColor(...accentBorder); doc.setLineWidth(0.25);
            doc.rect(M, y, W-M*2, grpH, 'S');
            doc.setFillColor(...accentGreen);
            doc.rect(M, y, 2.5, grpH, 'F');

            doc.setTextColor(...navy);
            doc.setFontSize(7.5); doc.setFont('helvetica', 'bold');
            doc.text(grpLabel, M + 5, y + 5);

            doc.setFontSize(6); doc.setFont('helvetica', 'normal');
            const rX = W - M - 3;
            const netVal = (gNet>=0?'+':'') + fmtEur(gNet);
            doc.setTextColor(...(gNet>=0 ? greenInk : redInk));
            doc.text(netVal, rX, y + 10.5, { align:'right' });
            const netValW = doc.getTextWidth(netVal);
            doc.setTextColor(...inkMid);
            doc.text('Saldo: ', rX - netValW, y + 10.5, { align:'right' });
            const netTotalW = doc.getTextWidth('Saldo: ') + netValW + 8;
            const expVal = fmtEur(gExp);
            doc.setTextColor(...redInk);
            doc.text(expVal, rX - netTotalW, y + 10.5, { align:'right' });
            const expValW = doc.getTextWidth(expVal);
            doc.setTextColor(...inkMid);
            doc.text('Ausgaben: ', rX - netTotalW - expValW, y + 10.5, { align:'right' });
            const expTotalW = doc.getTextWidth('Ausgaben: ') + expValW + 8;
            const incVal = fmtEur(gInc);
            doc.setTextColor(...greenInk);
            doc.text(incVal, rX - netTotalW - expTotalW, y + 10.5, { align:'right' });
            doc.setTextColor(...inkMid);
            doc.text('Einnahmen: ', rX - netTotalW - expTotalW - doc.getTextWidth(incVal), y + 10.5, { align:'right' });
            y += grpH + 1.5;

            // Tabellen-Header
            doc.setFillColor(243, 244, 246);
            doc.rect(M, y, W-M*2, 5.5, 'F');
            doc.setTextColor(...inkMid);
            doc.setFontSize(5.5); doc.setFont('helvetica', 'bold');
            doc.text('DATUM',       colX.date, y + 3.8);
            doc.text('BEZEICHNUNG', colX.name, y + 3.8);
            doc.text('KATEGORIE',   colX.cat,  y + 3.8);
            doc.text('BETRAG',      colX.amt,  y + 3.8, { align:'right' });
            y += 6.5;

            for (let ri = 0; ri < grouped[key].length; ri++) {
                if (y > H - 20) { localPage++; y = addTxPage(localPage); }
                const t    = grouped[key][ri];
                const isInc = t.type === 'Einnahmen';
                const rowH  = 6;

                doc.setFillColor(...(ri % 2 === 0 ? white : rowAlt));
                doc.rect(M, y, W-M*2, rowH, 'F');

                doc.setFontSize(6.5); doc.setFont('helvetica', 'normal');
                doc.setTextColor(...inkDark);
                doc.text(fmtDate(t.date?.substring(0,10)), colX.date, y + 4);

                const nm = (t.name||'').length > 42 ? t.name.substring(0,40)+'\u2026' : (t.name||'');
                doc.text(nm, colX.name, y + 4);

                doc.setTextColor(...inkMid);
                const cat = (t.category||'').length > 22 ? t.category.substring(0,20)+'\u2026' : (t.category||'');
                doc.text(cat, colX.cat, y + 4);

                doc.setTextColor(...(isInc ? greenInk : redInk));
                doc.setFont('helvetica', 'bold');
                doc.text((isInc ? '+' : '-') + fmtEur(t.amount), colX.amt, y + 4, { align:'right' });
                y += rowH;
            }

            doc.setDrawColor(...lineGrey); doc.setLineWidth(0.2);
            doc.line(M, y + 0.5, W-M, y + 0.5);
            y += 4;
        }
    }

    // ─── Hauptlogik ─────────────────────────────────────────────
    drawHeader(1);
    drawFooter();
    await drawOverviewPage(1);
    await drawTransactionPages(2);

    doc.save('haushalt_export_' + new Date().toISOString().substring(0,10) + '.pdf');
    closeExportModal();

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

async function deleteRecurring() {
    const id = document.getElementById('recurEditId').value;
    if (!id || !confirm('Vorlage wirklich löschen?')) return;
    try {
        const res = await fetch('/users/haushalt/recurring/' + id, { method: 'DELETE' });
        if (!res.ok) throw new Error();
        await loadRecurring();
        renderRecurringListe();
        switchRecurTab('liste');
        showStatus('Vorlage gelöscht.', false);
    } catch {
        showStatus('Fehler beim Löschen.', true);
    }
}

// ── Hilfsfunktion ─────────────────────────────────────────────

function escRec(str) {
    return String(str || '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}