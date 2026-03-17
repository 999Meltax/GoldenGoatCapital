// ═══════════════════════════════════════════════════════════
// GLOBAL STATE
// ═══════════════════════════════════════════════════════════
const fmt = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });

let budgetMonat = new Date().toISOString().slice(0, 7); // YYYY-MM
let allTransactions = [];
let allBudgets = [];
let allSparziele = [];
let donutChart = null;

// ═══════════════════════════════════════════════════════════
// TABS
// ═══════════════════════════════════════════════════════════
function switchTab(tabId, btn) {
    document.querySelectorAll('.budget-tab-content').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.budget-tab').forEach(b => b.classList.remove('active'));
    document.getElementById(tabId).classList.add('active');
    btn.classList.add('active');
}

// ═══════════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', async () => {
    await loadAll();
    updateMonthLabel();
});

async function loadAll() {
    try {
        const [txRes, budgetRes, szRes] = await Promise.all([
            fetch('/users/getTransactions'),
            fetch('/users/budgets'),
            fetch('/users/sparziele')
        ]);
        allTransactions = txRes.ok ? await txRes.json() : [];
        allBudgets      = budgetRes.ok ? await budgetRes.json() : [];
        allSparziele    = szRes.ok ? await szRes.json() : [];
    } catch (e) {
        console.error('Fehler beim Laden:', e);
        allTransactions = [];
        allBudgets = [];
        allSparziele = [];
    }
    renderBudget();
    renderSparziele();
}

// ═══════════════════════════════════════════════════════════
// MONAT NAVIGATION
// ═══════════════════════════════════════════════════════════
function changeMonth(delta) {
    const d = new Date(budgetMonat + '-01');
    d.setMonth(d.getMonth() + delta);
    budgetMonat = d.toISOString().slice(0, 7);
    updateMonthLabel();
    renderBudget();
}

function updateMonthLabel() {
    const d = new Date(budgetMonat + '-01');
    document.getElementById('budgetMonthLabel').textContent =
        d.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
}

// ═══════════════════════════════════════════════════════════
// BUDGETPLANER
// ═══════════════════════════════════════════════════════════
function renderBudget() {
    const monthTxs = allTransactions.filter(t => (t.date || '').startsWith(budgetMonat));
    const income  = monthTxs.filter(t => t.type === 'Einnahmen').reduce((s, t) => s + t.amount, 0);
    const spent   = monthTxs.filter(t => t.type === 'Ausgaben').reduce((s, t) => s + t.amount, 0);
    const total   = allBudgets.reduce((s, b) => s + b.betrag, 0);
    const remain  = income - spent;

    document.getElementById('bsTotal').textContent  = fmt.format(total);
    document.getElementById('bsIncome').textContent = fmt.format(income);
    document.getElementById('bsSpent').textContent  = fmt.format(spent);

    const remEl = document.getElementById('bsRemain');
    remEl.textContent = fmt.format(remain);
    remEl.style.color = remain >= 0 ? 'var(--green)' : 'var(--red)';

    // Ausgaben pro Kategorie
    const byKat = {};
    monthTxs.filter(t => t.type === 'Ausgaben').forEach(t => {
        const k = t.category || 'Sonstiges';
        byKat[k] = (byKat[k] || 0) + t.amount;
    });

    // Alle Kategorien aus Budgets + Transaktionen sammeln
    const allKats = new Set([...allBudgets.map(b => b.kategorie), ...Object.keys(byKat)]);

    const listEl = document.getElementById('budgetKatList');
    if (allKats.size === 0) {
        listEl.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-3);">Noch keine Budgets festgelegt.</div>';
    } else {
        listEl.innerHTML = [...allKats].map(kat => {
            const budget  = allBudgets.find(b => b.kategorie === kat);
            const budgeted = budget ? budget.betrag : null;
            const ausgaben = byKat[kat] || 0;
            const pct = budgeted ? Math.min(ausgaben / budgeted * 100, 100) : 0;
            const color = pct > 90 ? '#ef4444' : pct > 70 ? '#f59e0b' : '#22c55e';
            const budgetId = budget ? budget.id : '';

            return '<div class="kat-budget-row">' +
                '<div class="kat-budget-header">' +
                    '<span style="font-weight:600;">' + kat + '</span>' +
                    '<div style="display:flex;align-items:center;gap:8px;">' +
                        (budgeted !== null ? '<span style="color:' + (ausgaben > budgeted ? 'var(--red)' : 'var(--text-2)') + ';font-weight:700;">' + fmt.format(ausgaben) + ' / ' + fmt.format(budgeted) + '</span>' : '<span style="color:var(--text-3);">' + fmt.format(ausgaben) + ' (kein Budget)</span>') +
                        '<button onclick="openBudgetModal(\'' + kat + '\',' + (budgeted || '') + ',\'' + budgetId + '\')" style="background:var(--surface-2);border:1px solid var(--border);color:var(--text-3);padding:3px 8px;border-radius:6px;cursor:pointer;font-size:0.75rem;font-family:inherit;">' +
                            (budget ? '<i class="ri-edit-line"></i>' : '<i class="ri-add-line"></i>') +
                        '</button>' +
                        (budget ? '<button onclick="deleteBudget(\'' + budgetId + '\')" style="background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.2);color:#ef4444;padding:3px 8px;border-radius:6px;cursor:pointer;font-size:0.75rem;font-family:inherit;"><i class="ri-delete-bin-line"></i></button>' : '') +
                    '</div>' +
                '</div>' +
                (budgeted !== null ? '<div class="kat-budget-bar-wrap"><div class="kat-budget-bar" style="width:' + pct + '%;background:' + color + ';"></div></div>' : '') +
                '<div class="kat-budget-footer">' +
                    (budgeted !== null ? '<span>' + pct.toFixed(1) + '% genutzt</span><span>' + fmt.format(Math.max(budgeted - ausgaben, 0)) + ' verbleibend</span>' : '<span>Kein Budget gesetzt</span><span style="cursor:pointer;color:var(--accent);" onclick="openBudgetModal(\'' + kat + '\')">Budget festlegen →</span>') +
                '</div>' +
            '</div>';
        }).join('');
    }

    // Donut-Chart
    renderDonutChart(byKat);
}

function renderDonutChart(byKat) {
    const canvas = document.getElementById('budgetDonutChart');
    if (!canvas) return;

    const entries = Object.entries(byKat).sort((a, b) => b[1] - a[1]).slice(0, 8);
    const colors = ['#6358e6','#22c55e','#f59e0b','#ef4444','#3b82f6','#ec4899','#8b5cf6','#14b8a6'];

    if (donutChart) { donutChart.destroy(); donutChart = null; }

    if (entries.length === 0) {
        canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
        document.getElementById('budgetChartLegend').innerHTML = '<span style="color:var(--text-3);font-size:0.82rem;">Keine Ausgaben in diesem Monat</span>';
        return;
    }

    donutChart = new Chart(canvas, {
        type: 'doughnut',
        data: {
            labels: entries.map(e => e[0]),
            datasets: [{
                data: entries.map(e => e[1]),
                backgroundColor: colors.slice(0, entries.length),
                borderColor: 'transparent',
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '68%',
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: ctx => ' ' + fmt.format(ctx.raw)
                    }
                }
            }
        }
    });

    const total = entries.reduce((s, e) => s + e[1], 0);
    document.getElementById('budgetChartLegend').innerHTML = entries.map((e, i) =>
        '<div style="display:flex;align-items:center;gap:6px;">' +
            '<div style="width:10px;height:10px;border-radius:50%;background:' + colors[i] + ';flex-shrink:0;"></div>' +
            '<span style="flex:1;color:var(--text-2);">' + e[0] + '</span>' +
            '<span style="font-weight:600;">' + (e[1] / total * 100).toFixed(1) + '%</span>' +
        '</div>'
    ).join('');
}

// Budget Modal
function openBudgetModal(kat = '', betrag = '', id = '') {
    document.getElementById('bmKategorie').value = kat;
    document.getElementById('bmBetrag').value    = betrag;
    document.getElementById('bmEditId').value    = id;
    document.getElementById('budgetModal').style.display = 'flex';
    document.getElementById('bmKategorie').focus();
}
function closeBudgetModal() {
    document.getElementById('budgetModal').style.display = 'none';
}
document.getElementById('budgetModal').addEventListener('click', function(e) {
    if (e.target === this) closeBudgetModal();
});

async function saveBudgetModal() {
    const kat    = document.getElementById('bmKategorie').value.trim();
    const betrag = parseFloat(document.getElementById('bmBetrag').value);
    const id     = document.getElementById('bmEditId').value;
    if (!kat || isNaN(betrag)) { alert('Bitte Kategorie und Betrag ausfüllen.'); return; }

    try {
        let res;
        if (id) {
            res = await fetch('/users/budgets/' + id, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ kategorie: kat, betrag })
            });
        } else {
            res = await fetch('/users/budgets/add', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ kategorie: kat, betrag })
            });
        }
        if (!res.ok) throw new Error();
        closeBudgetModal();
        const budgetRes = await fetch('/users/budgets');
        allBudgets = budgetRes.ok ? await budgetRes.json() : [];
        renderBudget();
    } catch { alert('Fehler beim Speichern.'); }
}

async function deleteBudget(id) {
    if (!confirm('Budget wirklich löschen?')) return;
    try {
        await fetch('/users/budgets/' + id, { method: 'DELETE' });
        const budgetRes = await fetch('/users/budgets');
        allBudgets = budgetRes.ok ? await budgetRes.json() : [];
        renderBudget();
    } catch { alert('Fehler beim Löschen.'); }
}

// ═══════════════════════════════════════════════════════════
// SPARZIELE
// ═══════════════════════════════════════════════════════════
function selectColor(el) {
    document.querySelectorAll('.sz-color-dot').forEach(d => d.classList.remove('active'));
    el.classList.add('active');
    document.getElementById('szColor').value = el.dataset.color;
}

function renderSparziele() {
    const el = document.getElementById('sparzieleList');
    if (allSparziele.length === 0) {
        el.innerHTML = '<div style="text-align:center;padding:60px 24px;color:var(--text-3);"><i class="ri-flag-line" style="font-size:3rem;display:block;margin-bottom:12px;opacity:0.3;"></i><div style="font-weight:600;">Noch keine Sparziele</div><div style="font-size:0.83rem;margin-top:6px;">Erstelle dein erstes Sparziel über das Formular.</div></div>';
        return;
    }
    el.innerHTML = allSparziele.map(sz => {
        const pct = Math.min(sz.gespart / sz.zielbetrag * 100, 100);
        const verbleibend = Math.max(sz.zielbetrag - sz.gespart, 0);
        const done = sz.gespart >= sz.zielbetrag;

        let datumInfo = '';
        if (sz.datum) {
            const zieldatum = new Date(sz.datum);
            const heute = new Date();
            const tage = Math.ceil((zieldatum - heute) / (1000 * 60 * 60 * 24));
            datumInfo = tage > 0 ? tage + ' Tage verbleibend' : (tage === 0 ? 'Heute!' : 'Abgelaufen');
        }

        return '<div class="sparziel-card">' +
            '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:12px;">' +
                '<div style="display:flex;align-items:center;gap:12px;">' +
                    '<div style="width:42px;height:42px;border-radius:12px;background:' + sz.farbe + '22;color:' + sz.farbe + ';display:flex;align-items:center;justify-content:center;font-size:1.3rem;flex-shrink:0;">' +
                        '<i class="ri-flag-fill"></i>' +
                    '</div>' +
                    '<div>' +
                        '<div style="font-weight:700;font-size:1rem;">' + escHtml(sz.name) + '</div>' +
                        (datumInfo ? '<div style="font-size:0.75rem;color:var(--text-3);">' + datumInfo + '</div>' : '') +
                    '</div>' +
                '</div>' +
                '<div style="display:flex;gap:6px;align-items:center;">' +
                    (done ? '<span style="background:rgba(34,197,94,0.12);color:#22c55e;border:1px solid rgba(34,197,94,0.2);padding:3px 10px;border-radius:20px;font-size:0.72rem;font-weight:700;">✓ Erreicht</span>' : '') +
                    '<button onclick="editSparziel(' + sz.id + ')" style="background:var(--surface-2);border:1px solid var(--border);color:var(--text-3);padding:5px 9px;border-radius:8px;cursor:pointer;font-size:0.8rem;font-family:inherit;"><i class="ri-edit-line"></i></button>' +
                    '<button onclick="addToSparziel(' + sz.id + ')" style="background:rgba(34,197,94,0.1);border:1px solid rgba(34,197,94,0.2);color:#22c55e;padding:5px 9px;border-radius:8px;cursor:pointer;font-size:0.8rem;font-family:inherit;" title="Betrag hinzufügen"><i class="ri-add-line"></i></button>' +
                    '<button onclick="deleteSparziel(' + sz.id + ')" style="background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.2);color:#ef4444;padding:5px 9px;border-radius:8px;cursor:pointer;font-size:0.8rem;font-family:inherit;"><i class="ri-delete-bin-line"></i></button>' +
                '</div>' +
            '</div>' +
            '<div class="sz-bar-wrap"><div class="sz-bar" style="width:' + pct + '%;background:' + sz.farbe + ';"></div></div>' +
            '<div style="display:flex;justify-content:space-between;font-size:0.82rem;color:var(--text-3);margin-top:4px;">' +
                '<span><b style="color:var(--text-1);">' + fmt.format(sz.gespart) + '</b> gespart</span>' +
                '<span>' + pct.toFixed(1) + '%</span>' +
                '<span>Ziel: <b style="color:var(--text-1);">' + fmt.format(sz.zielbetrag) + '</b></span>' +
            '</div>' +
            (verbleibend > 0 ? '<div style="font-size:0.78rem;color:var(--text-3);margin-top:4px;">Noch ' + fmt.format(verbleibend) + ' bis zum Ziel</div>' : '') +
        '</div>';
    }).join('');
}

async function saveSparziel() {
    const name    = document.getElementById('szName').value.trim();
    const ziel    = parseFloat(document.getElementById('szZiel').value);
    const gespart = parseFloat(document.getElementById('szGespart').value) || 0;
    const datum   = document.getElementById('szDatum').value;
    const farbe   = document.getElementById('szColor').value;
    const editId  = document.getElementById('szEditId').value;

    if (!name || isNaN(ziel)) { showMsg('szMsg', 'Bitte Name und Zielbetrag ausfüllen.', true); return; }

    try {
        let res;
        if (editId) {
            res = await fetch('/users/sparziele/' + editId, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, zielbetrag: ziel, gespart, datum: datum || null, farbe })
            });
        } else {
            res = await fetch('/users/sparziele/add', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, zielbetrag: ziel, gespart, datum: datum || null, farbe })
            });
        }
        if (!res.ok) throw new Error();
        showMsg('szMsg', editId ? 'Aktualisiert!' : 'Sparziel erstellt!', false);
        resetSparForm();
        const szRes = await fetch('/users/sparziele');
        allSparziele = szRes.ok ? await szRes.json() : [];
        renderSparziele();
    } catch { showMsg('szMsg', 'Fehler beim Speichern.', true); }
}

function editSparziel(id) {
    const sz = allSparziele.find(s => s.id === id);
    if (!sz) return;
    document.getElementById('szName').value    = sz.name;
    document.getElementById('szZiel').value    = sz.zielbetrag;
    document.getElementById('szGespart').value = sz.gespart;
    document.getElementById('szDatum').value   = sz.datum || '';
    document.getElementById('szColor').value   = sz.farbe;
    document.getElementById('szEditId').value  = sz.id;
    document.getElementById('szCancelBtn').style.display = '';
    document.querySelectorAll('.sz-color-dot').forEach(d => {
        d.classList.toggle('active', d.dataset.color === sz.farbe);
    });
    document.getElementById('szName').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

let _einzahlenId = null;

function addToSparziel(id) {
    const sz = allSparziele.find(s => s.id === id);
    if (!sz) return;
    _einzahlenId = id;
    const nameEl = document.getElementById('einzahlenName');
    if (nameEl) nameEl.textContent = sz.name;
    const input = document.getElementById('einzahlenBetrag');
    if (input) input.value = '';
    const modal = document.getElementById('einzahlenModal');
    if (modal) {
        modal.style.display = 'flex';
        setTimeout(() => input && input.focus(), 50);
    }
}

function closeEinzahlenModal(e) {
    if (e && e.target !== document.getElementById('einzahlenModal')) return;
    document.getElementById('einzahlenModal').style.display = 'none';
    _einzahlenId = null;
}

async function confirmEinzahlen() {
    const betrag = parseFloat(document.getElementById('einzahlenBetrag')?.value);
    if (!_einzahlenId || isNaN(betrag) || betrag <= 0) return;
    const id = _einzahlenId;
    document.getElementById('einzahlenModal').style.display = 'none';
    _einzahlenId = null;
    try {
        const res = await fetch('/users/sparziele/' + id + '/add', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ betrag })
        });
        if (!res.ok) throw new Error();
        const szRes = await fetch('/users/sparziele');
        allSparziele = szRes.ok ? await szRes.json() : [];
        renderSparziele();
    } catch { alert('Fehler beim Hinzufügen.'); }
}

async function deleteSparziel(id) {
    if (!confirm('Sparziel wirklich löschen?')) return;
    try {
        await fetch('/users/sparziele/' + id, { method: 'DELETE' });
        const szRes = await fetch('/users/sparziele');
        allSparziele = szRes.ok ? await szRes.json() : [];
        renderSparziele();
    } catch { alert('Fehler beim Löschen.'); }
}

function resetSparForm() {
    document.getElementById('szName').value    = '';
    document.getElementById('szZiel').value    = '';
    document.getElementById('szGespart').value = '';
    document.getElementById('szDatum').value   = '';
    document.getElementById('szColor').value   = '#6358e6';
    document.getElementById('szEditId').value  = '';
    document.getElementById('szCancelBtn').style.display = 'none';
    document.querySelectorAll('.sz-color-dot').forEach((d, i) => d.classList.toggle('active', i === 0));
}

// ═══════════════════════════════════════════════════════════
// HILFSFUNKTIONEN
// ═══════════════════════════════════════════════════════════
function escHtml(str) {
    return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function showMsg(id, msg, isErr) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = msg;
    el.style.color = isErr ? 'var(--red)' : 'var(--green)';
    setTimeout(() => { el.textContent = ''; }, 3000);
}