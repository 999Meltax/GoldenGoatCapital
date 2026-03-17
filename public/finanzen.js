// =====================================================
// FORMATTER & KONSTANTEN
// =====================================================
const fmt     = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });
const fmtSign = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', signDisplay: 'always' });

const ACCOUNT_ICONS = {
    girokonto:      'ri-bank-line',
    sparkonto:      'ri-safe-line',
    haushaltskonto: 'ri-home-3-line',
    bargeld:        'ri-money-euro-circle-line',
    depot:          'ri-stock-line',
    sonstiges:      'ri-wallet-3-line'
};
const ACCOUNT_LABELS = {
    girokonto:      'Girokonto',
    sparkont:       'Sparkonto',
    sparkonto:      'Sparkonto',
    haushaltskonto: 'Haushaltskonto',
    bargeld:        'Bargeld',
    depot:          'Depot / Investments',
    sonstiges:      'Sonstiges'
};

// =====================================================
// STATE
// =====================================================
let zusammenfassungData = [];
let ausgabenData        = [];
let investmentsData     = [];
let categories          = [];
let fixkosten           = [];
let initialwerte        = {};
let manuelle            = [];
let accounts            = [];
let transactions        = [];
let selectedColor       = '#6358e6';

// =====================================================
// ACCOUNT FILTER – Finanzen
// =====================================================
function getFinanzenActiveIds() {
    try {
        const raw = localStorage.getItem('finanzen_active_accounts');
        if (raw === null) return null;
        return new Set(JSON.parse(raw));
    } catch { return null; }
}
function setFinanzenActiveIds(ids) {
    localStorage.setItem('finanzen_active_accounts', JSON.stringify([...ids]));
}
function getActiveAccounts() {
    const ids = getFinanzenActiveIds();
    if (ids === null) return accounts;
    return accounts.filter(a => ids.has(String(a.id)));
}
function ensureNewAccountsActive() {
    const ids = getFinanzenActiveIds();
    if (ids === null) return;
    let changed = false;
    accounts.forEach(a => {
        if (!ids.has(String(a.id))) { ids.add(String(a.id)); changed = true; }
    });
    if (changed) setFinanzenActiveIds(ids);
}

// =====================================================
// INIT
// =====================================================
document.addEventListener('DOMContentLoaded', async () => {
    // Tabs ZUERST registrieren
    document.querySelectorAll('.finanzen-tabs .tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.finanzen-tabs .tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.finanz-tab').forEach(c => c.classList.remove('active'));
            tab.classList.add('active');
            const target = document.getElementById(tab.dataset.tab);
            if (target) target.classList.add('active');
            if (tab.dataset.tab === 'dashboard') {
                requestAnimationFrame(() => requestAnimationFrame(() => renderDashboardGraphs()));
            }
        });
    });

    try {
        await loadAllData();
    } catch (err) {
        console.error('Fehler beim Laden der Finanzdaten:', err);
    }

    document.getElementById('addAccountBtn')?.addEventListener('click', () => openAccountModal());
    document.getElementById('addAccountBtnEmpty')?.addEventListener('click', () => openAccountModal());

    document.getElementById('colorPicker')?.addEventListener('click', e => {
        const opt = e.target.closest('.color-option');
        if (!opt) return;
        document.querySelectorAll('.color-option').forEach(c => c.classList.remove('active'));
        opt.classList.add('active');
        selectedColor = opt.dataset.color;
    });

    document.addEventListener('click', e => {
        const wrap = document.getElementById('finanzenFilterWrap');
        if (wrap && !wrap.contains(e.target)) {
            document.getElementById('finanzenFilterDropdown')?.classList.remove('open');
            document.getElementById('finanzenFilterBtn')?.classList.remove('open');
        }
        const zusWrap = document.getElementById('zusFilterWrap');
        if (zusWrap && !zusWrap.contains(e.target)) {
            document.getElementById('zusFilterDropdown')?.classList.remove('open');
            document.getElementById('zusFilterBtn')?.classList.remove('open');
        }
        const ausWrap = document.getElementById('ausFilterWrap');
        if (ausWrap && !ausWrap.contains(e.target)) {
            document.getElementById('ausFilterDropdown')?.classList.remove('open');
            document.getElementById('ausFilterBtn')?.classList.remove('open');
        }
        if (!e.target.closest('.account-filter-wrap')) {
            document.querySelectorAll('.dash-chart-dropdown.open').forEach(dd => dd.classList.remove('open'));
        }
    });
});

// =====================================================
// DATEN LADEN
// =====================================================
async function loadAllData() {
    const [accRes, zusRes, ausRes, invRes, catRes, fixRes, initRes, manRes, txRes] = await Promise.all([
        fetch('/users/accounts'),
        fetch('/users/finanzen/zusammenfassung'),
        fetch('/users/finanzen/ausgaben'),
        fetch('/users/finanzen/investments'),
        fetch('/users/categories'),
        fetch('/users/fixkosten/list'),
        fetch('/users/initialwerte'),
        fetch('/users/manuelle-eintraege'),
        fetch('/users/getTransactions')
    ]);

    accounts            = await accRes.json();
    zusammenfassungData = await zusRes.json();
    ausgabenData        = await ausRes.json();
    investmentsData     = await invRes.json();
    categories          = await catRes.json();
    fixkosten           = await fixRes.json();
    initialwerte        = await initRes.json();
    manuelle            = await manRes.json();
    transactions        = await txRes.json();

    ensureNewAccountsActive();
    renderAccounts();
    buildFinanzenFilterUI();
    buildZusFilterUI();
    buildAusFilterUI();
    renderNetWorthBanner();
    renderZusammenfassung();
    renderAusgaben();
    renderInvestments();
    populateAccountSelects();
    requestAnimationFrame(() => requestAnimationFrame(() => renderDashboardGraphs()));
}

// =====================================================
// ACCOUNT FILTER UI
// =====================================================
function buildFinanzenFilterUI() {
    const container = document.getElementById('finanzenFilterItems');
    const wrap      = document.getElementById('finanzenFilterWrap');
    if (!container || !wrap) return;
    if (!accounts.length) { wrap.style.display = 'none'; return; }
    wrap.style.display = '';
    const activeIds = getFinanzenActiveIds();
    container.innerHTML = accounts.map(acc => {
        const isActive  = activeIds === null || activeIds.has(String(acc.id));
        const bal       = acc.currentBalance ?? acc.balance ?? 0;
        const typeLabel = ACCOUNT_LABELS[acc.type] || acc.type;
        return `<label class="account-filter-item">
            <input type="checkbox" ${isActive ? 'checked' : ''} onchange="toggleFinanzenAccount(${acc.id}, this.checked)">
            <div class="account-filter-item-dot" style="background:${acc.color};"></div>
            <div class="account-filter-item-info">
                <div class="account-filter-item-name">${acc.name}</div>
                <div class="account-filter-item-type">${typeLabel}</div>
            </div>
            <div class="account-filter-item-balance" style="color:${bal >= 0 ? '#22c55e' : '#ef4444'}">${fmt.format(bal)}</div>
        </label>`;
    }).join('');
    updateFinanzenFilterBtn();
}

function toggleFinanzenAccount(id, checked) {
    let ids = getFinanzenActiveIds();
    if (ids === null) ids = new Set(accounts.map(a => String(a.id)));
    if (checked) ids.add(String(id)); else ids.delete(String(id));
    setFinanzenActiveIds(ids);
    updateFinanzenFilterBtn();
    buildFinanzenFilterUI();
    renderNetWorthBanner();
    renderDashboardGraphs();
}
function selectAllFinanzenAccounts() {
    setFinanzenActiveIds(new Set(accounts.map(a => String(a.id))));
    buildFinanzenFilterUI(); renderNetWorthBanner(); renderDashboardGraphs();
}
function selectNoneFinanzenAccounts() {
    setFinanzenActiveIds(new Set());
    buildFinanzenFilterUI(); renderNetWorthBanner(); renderDashboardGraphs();
}
function updateFinanzenFilterBtn() {
    const btn = document.getElementById('finanzenFilterBtn');
    const label = document.getElementById('finanzenFilterLabel');
    const dot   = document.getElementById('finanzenFilterDot');
    if (!btn || !label || !dot) return;
    const activeIds   = getFinanzenActiveIds();
    const total       = accounts.length;
    const activeCount = activeIds === null ? total : [...activeIds].filter(id => accounts.find(a => String(a.id) === id)).length;
    dot.style.background = '';
    if (activeCount === 0) {
        label.textContent = 'Kein Konto'; dot.className = 'filter-dot'; dot.style.background = '#ef4444';
    } else if (activeCount === total || activeIds === null) {
        label.textContent = 'Alle Konten'; dot.className = 'filter-dot all';
    } else {
        const activeAccs = accounts.filter(a => activeIds.has(String(a.id)));
        label.textContent = activeAccs.length <= 2 ? activeAccs.map(a => a.name).join(', ') : `${activeCount} von ${total} Konten`;
        dot.className = 'filter-dot'; dot.style.background = 'var(--accent, #6358e6)';
    }
}
function toggleFinanzenFilter() {
    const btn = document.getElementById('finanzenFilterBtn');
    const dropdown = document.getElementById('finanzenFilterDropdown');
    if (!btn || !dropdown) return;
    const open = dropdown.classList.contains('open');
    dropdown.classList.toggle('open', !open);
    btn.classList.toggle('open', !open);
}

// =====================================================
// NET WORTH BANNER
// =====================================================
function renderNetWorthBanner() {
    const banner = document.getElementById('netWorthBanner');
    if (!banner) return;
    const active = getActiveAccounts();
    const total  = active.reduce((s, a) => s + (a.currentBalance ?? a.balance ?? 0), 0);
    document.getElementById('netWorthTotal').textContent = fmt.format(total);
    const activeIds   = getFinanzenActiveIds();
    const totalCount  = accounts.length;
    const activeCount = activeIds === null ? totalCount : active.length;
    const pos = active.filter(a => (a.currentBalance ?? a.balance ?? 0) >= 0).length;
    const subEl = document.getElementById('netWorthSub');
    if (subEl) {
        if (activeCount === totalCount || activeIds === null) {
            subEl.textContent = `${totalCount} Konto${totalCount !== 1 ? 'en' : ''} · ${pos} positiv`;
        } else {
            const names = active.map(a => a.name).join(', ');
            subEl.innerHTML = `<span style="color:var(--accent,#6358e6); font-weight:600;">${activeCount} von ${totalCount}</span>&nbsp;·&nbsp;${names}`;
        }
    }
}

// =====================================================
// KONTEN KARTEN – Klick öffnet eigene Seite
// =====================================================
function renderAccounts() {
    const grid   = document.getElementById('accountsGrid');
    const empty  = document.getElementById('emptyAccounts');
    const banner = document.getElementById('netWorthBanner');
    if (!grid || !empty || !banner) return;
    if (!accounts.length) {
        grid.style.display = 'none'; empty.style.display = ''; banner.style.display = 'none'; return;
    }
    empty.style.display = 'none'; grid.style.display = ''; banner.style.display = '';
    const activeIds = getFinanzenActiveIds();
    grid.innerHTML = accounts.map(acc => {
        const balance  = acc.currentBalance ?? acc.balance ?? 0;
        const isPos    = balance >= 0;
        const icon     = ACCOUNT_ICONS[acc.type] || 'ri-wallet-3-line';
        const label    = ACCOUNT_LABELS[acc.type] || acc.type;
        const safeName = acc.name.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
        const isActive = activeIds === null || activeIds.has(String(acc.id));
        return `
        <div class="account-card${isActive ? '' : ' account-card-dimmed'}" style="--acc-color:${acc.color};" onclick="window.location.href='/users/konto/${acc.id}'">
            <div class="account-card-top">
                <div class="account-icon-wrap" style="background:${acc.color}22; color:${acc.color};">
                    <i class="${icon}"></i>
                </div>
                <div class="account-card-actions">
                    <button onclick="event.stopPropagation(); openAccountModal(${acc.id})" title="Bearbeiten">
                        <i class="ri-pencil-line"></i>
                    </button>
                    <button onclick="event.stopPropagation(); confirmDeleteAccount(${acc.id}, '${safeName}')" title="Löschen">
                        <i class="ri-delete-bin-line"></i>
                    </button>
                </div>
            </div>
            <div class="account-card-type">${label}</div>
            <div class="account-card-name">${acc.name}</div>
            <div class="account-card-balance ${isPos ? 'positive' : 'negative'}">${fmt.format(balance)}</div>
            <div class="account-card-accent" style="background:${acc.color};"></div>
            ${!isActive ? `<div class="account-card-hidden-badge"><i class="ri-eye-off-line"></i> Ausgeblendet</div>` : ''}
        </div>`;
    }).join('');
}

// =====================================================
// KONTO MODAL (Anlegen/Bearbeiten)
// =====================================================
function openAccountModal(id = null) {
    const modal = document.getElementById('accountModal');
    if (!modal) return;
    document.getElementById('accountEditId').value = id || '';
    document.getElementById('accountModalTitle').textContent = id ? 'Konto bearbeiten' : 'Konto hinzufügen';
    if (id) {
        const acc = accounts.find(a => a.id === id);
        if (!acc) return;
        document.getElementById('accountName').value    = acc.name;
        document.getElementById('accountType').value    = acc.type;
        document.getElementById('accountBalance').value = acc.balance;
        selectedColor = acc.color;
    } else {
        document.getElementById('accountName').value    = '';
        document.getElementById('accountType').value    = 'girokonto';
        document.getElementById('accountBalance').value = '';
        selectedColor = '#6358e6';
    }
    document.querySelectorAll('.color-option').forEach(el =>
        el.classList.toggle('active', el.dataset.color === selectedColor)
    );
    modal.style.display = 'flex';
}
function closeAccountModal() {
    const modal = document.getElementById('accountModal');
    if (modal) modal.style.display = 'none';
}
async function saveAccount() {
    const id      = document.getElementById('accountEditId').value;
    const name    = document.getElementById('accountName').value.trim();
    const type    = document.getElementById('accountType').value;
    const balance = parseFloat(document.getElementById('accountBalance').value) || 0;
    const icon    = ACCOUNT_ICONS[type] || 'ri-wallet-3-line';
    if (!name) return;
    if (id) {
        await fetch(`/users/accounts/${id}`, {
            method: 'PUT', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, type, balance, color: selectedColor, icon })
        });
    } else {
        const res = await fetch('/users/accounts/add', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, type, balance, color: selectedColor, icon })
        });
        if (res.status === 403) {
            const data = await res.json();
            if (data.limitReached) {
                closeAccountModal();
                showUpgradeModal('Konto-Limit erreicht', data.message);
                return;
            }
        }
    }
    closeAccountModal();
    await loadAllData();
}
async function confirmDeleteAccount(id, name) {
    ggcConfirm(`Konto „${name}" wirklich löschen? Transaktionen bleiben erhalten, werden aber keinem Konto mehr zugewiesen.`, async () => {
        const ids = getFinanzenActiveIds();
        if (ids) { ids.delete(String(id)); setFinanzenActiveIds(ids); }
        await fetch(`/users/accounts/${id}`, { method: 'DELETE' });
        await loadAllData();
    });
}

// =====================================================
// SELECTS BEFÜLLEN (für andere Bereiche)
// =====================================================
function populateAccountSelects() {
    // Keine Fixkosten-Selects mehr hier nötig
}

// =====================================================
// ZUSAMMENFASSUNG FILTER
// =====================================================
function getZusActiveIds() {
    try { const r = localStorage.getItem('finanzen_zus_accounts'); return r === null ? null : new Set(JSON.parse(r)); } catch { return null; }
}
function setZusActiveIds(ids) { localStorage.setItem('finanzen_zus_accounts', JSON.stringify([...ids])); }
function getZusActiveAccounts() {
    const ids = getZusActiveIds();
    if (ids === null) return accounts;
    return accounts.filter(a => ids.has(String(a.id)));
}
function buildZusFilterUI() {
    const cont = document.getElementById('zusFilterItems');
    if (!cont) return;
    const ids = getZusActiveIds();
    cont.innerHTML = accounts.map(acc => {
        const on  = ids === null || ids.has(String(acc.id));
        const bal = acc.currentBalance ?? acc.balance ?? 0;
        return `<label class="account-filter-item">
            <input type="checkbox" ${on ? 'checked' : ''} onchange="toggleZusAccount(${acc.id},this.checked)">
            <div class="account-filter-item-dot" style="background:${acc.color};"></div>
            <div class="account-filter-item-info">
                <div class="account-filter-item-name">${acc.name}</div>
                <div class="account-filter-item-type">${ACCOUNT_LABELS[acc.type] || acc.type}</div>
            </div>
            <div class="account-filter-item-balance" style="color:${bal >= 0 ? '#22c55e' : '#ef4444'}">${fmt.format(bal)}</div>
        </label>`;
    }).join('');
    updateZusFilterBtn();
}
function toggleZusAccount(id, checked) {
    let ids = getZusActiveIds();
    if (ids === null) ids = new Set(accounts.map(a => String(a.id)));
    if (checked) ids.add(String(id)); else ids.delete(String(id));
    setZusActiveIds(ids);
    buildZusFilterUI();
    renderZusammenfassung();
}
function selectAllZusAccounts() { setZusActiveIds(new Set(accounts.map(a => String(a.id)))); buildZusFilterUI(); renderZusammenfassung(); }
function selectNoneZusAccounts() { setZusActiveIds(new Set()); buildZusFilterUI(); renderZusammenfassung(); }
function updateZusFilterBtn() {
    const btn = document.getElementById('zusFilterBtn');
    const lbl = document.getElementById('zusFilterLabel');
    const dot = document.getElementById('zusFilterDot');
    if (!btn || !lbl || !dot) return;
    const ids = getZusActiveIds();
    const total = accounts.length;
    const activeCount = ids === null ? total : [...ids].filter(id => accounts.find(a => String(a.id) === id)).length;
    dot.style.background = '';
    if (activeCount === 0) {
        lbl.textContent = 'Kein Konto'; dot.className = 'filter-dot'; dot.style.background = '#ef4444';
    } else if (activeCount === total || ids === null) {
        lbl.textContent = 'Alle Konten'; dot.className = 'filter-dot all';
    } else {
        const active = accounts.filter(a => ids.has(String(a.id)));
        lbl.textContent = active.length <= 2 ? active.map(a => a.name).join(', ') : `${activeCount} von ${total} Konten`;
        dot.className = 'filter-dot'; dot.style.background = 'var(--accent,#6358e6)';
    }
}
function toggleZusFilter() {
    const btn = document.getElementById('zusFilterBtn');
    const dd  = document.getElementById('zusFilterDropdown');
    if (!btn || !dd) return;
    const open = dd.classList.contains('open');
    dd.classList.toggle('open', !open);
    btn.classList.toggle('open', !open);
}

// =====================================================
// 1. ZUSAMMENFASSUNG
// =====================================================
function renderZusammenfassung() { try {
    buildZusFilterUI();
    const activeAccounts = getZusActiveAccounts();
    const activeIds = new Set(activeAccounts.map(a => String(a.id)));

    const filteredTx = transactions.filter(t => !t.account_id || activeIds.has(String(t.account_id)));

    const monthSet = new Set();
    filteredTx.forEach(t => { const m = (t.date || '').substring(0, 7); if (m) monthSet.add(m); });
    const months = [...monthSet].sort().reverse();

    const tbody = document.getElementById('zusammenfassungTable');
    if (!tbody) return;

    if (!months.length) {
        tbody.innerHTML = '<thead><tr><th>Monat</th></tr></thead><tbody><tr><td style="color:var(--text-3);padding:20px;">Keine Transaktionen vorhanden.</td></tr></tbody>';
        return;
    }

    function balanceUpTo(acc, untilMonth) {
        let sum = acc.balance || 0;
        transactions.filter(t => String(t.account_id) === String(acc.id) && (t.date || '').substring(0, 7) <= untilMonth)
            .forEach(t => { if (t.type === 'Einnahmen') sum += t.amount; else sum -= t.amount; });
        return sum;
    }

    const monthlyFixSum = fixkosten.filter(f => f.haeufigkeit === 'monatlich' && (!f.account_id || activeIds.has(String(f.account_id))))
        .reduce((s, f) => s + Math.abs(f.betrag || 0), 0);

    const kontoHeaders = activeAccounts.map(a =>
        `<th style="border-left:3px solid ${a.color}; padding-left:10px;">${a.name}</th>`
    ).join('');

    const header = `<thead><tr>
        <th>Monat</th>
        <th>Einnahmen</th>
        <th>Ausgaben</th>
        <th>Nettoergebnis</th>
        <th>Fixkosten</th>
        ${kontoHeaders}
        <th>Gesamt</th>
    </tr></thead>`;

    const rows = months.map(m => {
        const monTx  = filteredTx.filter(t => (t.date || '').substring(0, 7) === m);
        const inc    = monTx.filter(t => t.type === 'Einnahmen').reduce((s, t) => s + t.amount, 0);
        const exp    = monTx.filter(t => t.type === 'Ausgaben').reduce((s, t) => s + t.amount, 0);
        const spare  = inc - exp;
        const spareColor = spare >= 0 ? '#22c55e' : '#ef4444';

        const kontoCells = activeAccounts.map(a => {
            const val = balanceUpTo(a, m);
            const col = val >= 0 ? '#22c55e' : '#ef4444';
            return `<td style="border-left:3px solid ${a.color}; padding-left:10px; color:${col}; font-weight:500;">${fmt.format(val)}</td>`;
        }).join('');

        const gesamt = activeAccounts.reduce((s, a) => s + balanceUpTo(a, m), 0);
        const gesamtCol = gesamt >= 0 ? '#22c55e' : '#ef4444';
        const monLabel = new Date(m + '-01').toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });

        return `<tr>
            <td style="font-weight:600; white-space:nowrap;">${monLabel}</td>
            <td class="positive">${fmt.format(inc)}</td>
            <td class="negative">${fmt.format(exp)}</td>
            <td style="color:${spareColor}; font-weight:600;">${fmt.format(spare)}</td>
            <td style="color:var(--text-2);">${fmt.format(monthlyFixSum)}</td>
            ${kontoCells}
            <td style="color:${gesamtCol}; font-weight:700;">${fmt.format(gesamt)}</td>
        </tr>`;
    }).join('');

    tbody.innerHTML = header + `<tbody>${rows}</tbody>`;
} catch(e) { console.error('renderZusammenfassung:', e); } }

// =====================================================
// AUSGABEN FILTER
// =====================================================
function getAusActiveIds() {
    try { const r = localStorage.getItem('finanzen_aus_accounts'); return r === null ? null : new Set(JSON.parse(r)); } catch { return null; }
}
function setAusActiveIds(ids) { localStorage.setItem('finanzen_aus_accounts', JSON.stringify([...ids])); }
function getAusActiveAccounts() {
    const ids = getAusActiveIds();
    if (ids === null) return accounts;
    return accounts.filter(a => ids.has(String(a.id)));
}
function buildAusFilterUI() {
    const cont = document.getElementById('ausFilterItems');
    if (!cont) return;
    const ids = getAusActiveIds();
    cont.innerHTML = accounts.map(acc => {
        const on  = ids === null || ids.has(String(acc.id));
        const bal = acc.currentBalance ?? acc.balance ?? 0;
        return `<label class="account-filter-item">
            <input type="checkbox" ${on ? 'checked' : ''} onchange="toggleAusAccount(${acc.id},this.checked)">
            <div class="account-filter-item-dot" style="background:${acc.color};"></div>
            <div class="account-filter-item-info">
                <div class="account-filter-item-name">${acc.name}</div>
                <div class="account-filter-item-type">${ACCOUNT_LABELS[acc.type] || acc.type}</div>
            </div>
            <div class="account-filter-item-balance" style="color:${bal >= 0 ? '#22c55e' : '#ef4444'}">${fmt.format(bal)}</div>
        </label>`;
    }).join('');
    updateAusFilterBtn();
}
function toggleAusAccount(id, checked) {
    let ids = getAusActiveIds();
    if (ids === null) ids = new Set(accounts.map(a => String(a.id)));
    if (checked) ids.add(String(id)); else ids.delete(String(id));
    setAusActiveIds(ids);
    buildAusFilterUI();
    renderAusgaben();
}
function selectAllAusAccounts() { setAusActiveIds(new Set(accounts.map(a => String(a.id)))); buildAusFilterUI(); renderAusgaben(); }
function selectNoneAusAccounts() { setAusActiveIds(new Set()); buildAusFilterUI(); renderAusgaben(); }
function updateAusFilterBtn() {
    const btn = document.getElementById('ausFilterBtn');
    const lbl = document.getElementById('ausFilterLabel');
    const dot = document.getElementById('ausFilterDot');
    if (!btn || !lbl || !dot) return;
    const ids = getAusActiveIds();
    const total = accounts.length;
    const activeCount = ids === null ? total : [...ids].filter(id => accounts.find(a => String(a.id) === id)).length;
    dot.style.background = '';
    if (activeCount === 0) {
        lbl.textContent = 'Kein Konto'; dot.className = 'filter-dot'; dot.style.background = '#ef4444';
    } else if (activeCount === total || ids === null) {
        lbl.textContent = 'Alle Konten'; dot.className = 'filter-dot all';
    } else {
        const active = accounts.filter(a => ids.has(String(a.id)));
        lbl.textContent = active.length <= 2 ? active.map(a => a.name).join(', ') : `${activeCount} von ${total} Konten`;
        dot.className = 'filter-dot'; dot.style.background = 'var(--accent,#6358e6)';
    }
}
function toggleAusFilter() {
    const btn = document.getElementById('ausFilterBtn');
    const dd  = document.getElementById('ausFilterDropdown');
    if (!btn || !dd) return;
    const open = dd.classList.contains('open');
    dd.classList.toggle('open', !open);
    btn.classList.toggle('open', !open);
}

// =====================================================
// 2. AUSGABEN
// =====================================================
function renderAusgaben() { try {
    buildAusFilterUI();
    const activeIds = new Set(getAusActiveAccounts().map(a => String(a.id)));
    const ausIds    = getAusActiveIds();
    const filteredTx = transactions.filter(t => !t.account_id
        ? (ausIds === null)
        : activeIds.has(String(t.account_id))
    );

    const monthSet = new Set();
    filteredTx.forEach(t => { const m = (t.date || '').substring(0, 7); if (m) monthSet.add(m); });
    const monate = [...monthSet].sort().reverse();

    const sel = document.getElementById('ausgabenMonatSelect');
    if (sel) {
        const currentVal = sel.value;
        sel.innerHTML = monate.map(m =>
            `<option value="${m}">${new Date(m + '-01').toLocaleDateString('de-DE', { month: 'long', year: 'numeric' })}</option>`
        ).join('');
        if (currentVal && monate.includes(currentVal)) sel.value = currentVal;
    }

    // Fixkosten-Tabelle – nur lesend, kein Edit/Delete
    const fkTable = document.getElementById('fixkostenTable');
    if (fkTable) {
        const activeFixkosten = fixkosten.filter(f =>
            !f.account_id || ausIds === null || activeIds.has(String(f.account_id))
        );
        if (!activeFixkosten.length) {
            fkTable.innerHTML = '<thead><tr><th>Name</th><th>Betrag</th><th>Fälligkeit</th><th>Konto</th></tr></thead><tbody><tr><td colspan="4" style="color:var(--text-3);">Keine Fixkosten für diese Konten. <a href="/users/fixkosten" style="color:var(--accent);">Verwalten →</a></td></tr></tbody>';
        } else {
            const fixRows = activeFixkosten.map(f => {
                const accName = f.account_id
                    ? (accounts.find(a => String(a.id) === String(f.account_id))?.name || '—')
                    : '—';
                return `<tr>
                    <td style="font-weight:500;">${f.name}</td>
                    <td class="negative">${fmt.format(Math.abs(f.betrag || 0))}</td>
                    <td style="color:var(--text-2);">Am ${f.datum_tag}. · ${f.haeufigkeit}</td>
                    <td style="color:var(--text-2);">${accName}</td>
                </tr>`;
            }).join('');
            const fixSum = activeFixkosten.reduce((s, f) => s + Math.abs(f.betrag || 0), 0);
            fkTable.innerHTML = `<thead><tr><th>Name</th><th>Betrag/Monat</th><th>Fälligkeit</th><th>Konto</th></tr></thead>
                <tbody>${fixRows}
                <tr style="border-top:2px solid var(--border); font-weight:700;">
                    <td>Gesamt</td>
                    <td class="negative">${fmt.format(fixSum)}</td>
                    <td colspan="2"></td>
                </tr></tbody>`;
        }
    }

    // Monatsvergleich-Tabelle
    const monatsTable = document.getElementById('ausgabenMonatsTable');
    if (monatsTable) {
        const catNames = [...new Set(filteredTx.filter(t => t.category).map(t => t.category))].sort();
        const headerRow = `<tr><th>Monat</th><th>Einnahmen</th><th>Ausgaben</th><th>Nettoergebnis</th>${catNames.map(c => `<th>${c}</th>`).join('')}</tr>`;
        const bodyRows = monate.map(m => {
            const monTx = filteredTx.filter(t => (t.date || '').substring(0, 7) === m);
            const inc   = monTx.filter(t => t.type === 'Einnahmen').reduce((s, t) => s + t.amount, 0);
            const exp   = monTx.filter(t => t.type === 'Ausgaben').reduce((s, t) => s + t.amount, 0);
            const spare = inc - exp;
            const sumCat = {};
            monTx.forEach(t => { if (t.category) sumCat[t.category] = (sumCat[t.category] || 0) + t.amount; });
            const catCells = catNames.map(c => {
                const val = sumCat[c] || 0;
                return val > 0 ? `<td style="color:var(--text-1);">${fmt.format(val)}</td>` : `<td style="color:var(--text-3);">—</td>`;
            }).join('');
            const monLabel = new Date(m + '-01').toLocaleDateString('de-DE', { month: 'short', year: '2-digit' });
            return `<tr>
                <td style="font-weight:600; white-space:nowrap;">${monLabel}</td>
                <td class="positive">${fmt.format(inc)}</td>
                <td class="negative">${fmt.format(exp)}</td>
                <td style="color:${spare >= 0 ? '#22c55e' : '#ef4444'}; font-weight:600;">${fmt.format(spare)}</td>
                ${catCells}
            </tr>`;
        }).join('');
        if (!monate.length) {
            monatsTable.innerHTML = `<thead>${headerRow}</thead><tbody><tr><td colspan="${4 + catNames.length}" style="color:var(--text-3);">Keine Transaktionen für diese Konten.</td></tr></tbody>`;
        } else {
            monatsTable.innerHTML = `<thead>${headerRow}</thead><tbody>${bodyRows}</tbody>`;
        }
    }

    renderAusgabenKategorien();
} catch(e) { console.error('renderAusgaben:', e); } }

function renderAusgabenKategorien() { try {
    const sel    = document.getElementById('ausgabenMonatSelect');
    const monat  = sel ? sel.value : null;
    const table  = document.getElementById('ausgabenKatTable');
    if (!table) return;

    if (!monat) {
        table.innerHTML = '<thead><tr><th colspan="4" style="color:var(--text-3);">Kein Monat ausgewählt</th></tr></thead>';
        return;
    }

    const activeIds  = new Set(getAusActiveAccounts().map(a => String(a.id)));
    const ausIds     = getAusActiveIds();
    const filteredTx = transactions.filter(t => !t.account_id
        ? (ausIds === null)
        : activeIds.has(String(t.account_id))
    );
    const monTx   = filteredTx.filter(t => (t.date || '').substring(0, 7) === monat);
    const ausgaben = monTx.filter(t => t.type === 'Ausgaben');
    const einnahmen = monTx.filter(t => t.type === 'Einnahmen');

    const byKat = {};
    [...ausgaben, ...einnahmen].forEach(t => {
        const kat = t.category || 'Ohne Kategorie';
        if (!byKat[kat]) byKat[kat] = { inc: 0, exp: 0, count: 0 };
        if (t.type === 'Einnahmen') byKat[kat].inc += t.amount;
        else byKat[kat].exp += t.amount;
        byKat[kat].count++;
    });

    const totalExp = ausgaben.reduce((s, t) => s + t.amount, 0);
    const rows = Object.entries(byKat)
        .sort((a, b) => (b[1].exp + b[1].inc) - (a[1].exp + a[1].inc))
        .map(([kat, v]) => {
            const pct = totalExp > 0 && v.exp > 0 ? ((v.exp / totalExp) * 100).toFixed(1) : null;
            return `<tr>
                <td style="font-weight:500;">${kat}</td>
                <td>${v.exp > 0 ? `<span class="negative">${fmt.format(v.exp)}</span>` : '—'}</td>
                <td>${v.inc > 0 ? `<span class="positive">${fmt.format(v.inc)}</span>` : '—'}</td>
                <td style="color:var(--text-3); font-size:0.82rem;">${pct ? pct + ' %' : '—'}</td>
            </tr>`;
        }).join('');

    table.innerHTML = `<thead><tr>
        <th>Kategorie</th>
        <th>Ausgaben</th>
        <th>Einnahmen</th>
        <th>Anteil</th>
    </tr></thead><tbody>${rows || '<tr><td colspan="4" style="color:var(--text-3);">Keine Transaktionen in diesem Monat.</td></tr>'}</tbody>`;
} catch(e) { console.error('renderAusgabenKategorien:', e); } }

// =====================================================
// 3. INVESTMENTS
// =====================================================
function renderInvestments() { try {
    const depotAccounts = accounts.filter(a => a.type === 'depot');
    const sparAccounts  = accounts.filter(a => a.type === 'sparkonto');

    const statsEl = document.getElementById('investmentStats');
    if (statsEl) {
        const totalPortfolio = depotAccounts.reduce((s, a) => s + (a.currentBalance ?? a.balance ?? 0), 0);
        const totalCash      = sparAccounts.reduce((s, a) => s + (a.currentBalance ?? a.balance ?? 0), 0);
        const totalInv       = totalPortfolio + totalCash;
        statsEl.innerHTML = `
            <div class="card" style="text-align:center; padding:20px;">
                <div style="font-size:0.78rem; color:var(--text-3); margin-bottom:6px; text-transform:uppercase; letter-spacing:0.05em;">Portfolio gesamt</div>
                <div style="font-size:1.6rem; font-weight:800; color:${totalPortfolio >= 0 ? '#22c55e' : '#ef4444'};">${fmt.format(totalPortfolio)}</div>
                <div style="font-size:0.75rem; color:var(--text-3); margin-top:4px;">${depotAccounts.length} Depot-Konto${depotAccounts.length !== 1 ? 'en' : ''}</div>
            </div>
            <div class="card" style="text-align:center; padding:20px;">
                <div style="font-size:0.78rem; color:var(--text-3); margin-bottom:6px; text-transform:uppercase; letter-spacing:0.05em;">Cash-Rücklagen</div>
                <div style="font-size:1.6rem; font-weight:800; color:${totalCash >= 0 ? '#22c55e' : '#ef4444'};">${fmt.format(totalCash)}</div>
                <div style="font-size:0.75rem; color:var(--text-3); margin-top:4px;">${sparAccounts.length} Sparkonto${sparAccounts.length !== 1 ? 'en' : ''}</div>
            </div>
            <div class="card" style="text-align:center; padding:20px;">
                <div style="font-size:0.78rem; color:var(--text-3); margin-bottom:6px; text-transform:uppercase; letter-spacing:0.05em;">Investments gesamt</div>
                <div style="font-size:1.6rem; font-weight:800; color:${totalInv >= 0 ? '#22c55e' : '#ef4444'};">${fmt.format(totalInv)}</div>
                <div style="font-size:0.75rem; color:var(--text-3); margin-top:4px;">Portfolio + Cash</div>
            </div>`;
    }

    const depotTable = document.getElementById('depotKontenTable');
    if (depotTable) {
        if (!depotAccounts.length) {
            depotTable.innerHTML = '<thead><tr><th>Konto</th><th>Stand</th></tr></thead><tbody><tr><td colspan="2" style="color:var(--text-3);">Keine Depot-Konten angelegt.</td></tr></tbody>';
        } else {
            const rows = depotAccounts.map(a => {
                const bal = a.currentBalance ?? a.balance ?? 0;
                const txCount = transactions.filter(t => String(t.account_id) === String(a.id)).length;
                return `<tr onclick="window.location.href='/users/konto/${a.id}'" style="cursor:pointer;">
                    <td>
                        <div style="display:flex; align-items:center; gap:8px;">
                            <div style="width:10px;height:10px;border-radius:50%;background:${a.color};flex-shrink:0;"></div>
                            <div>
                                <div style="font-weight:600;">${a.name}</div>
                                <div style="font-size:0.75rem; color:var(--text-3);">${txCount} Transaktionen</div>
                            </div>
                        </div>
                    </td>
                    <td style="color:${bal >= 0 ? '#22c55e' : '#ef4444'}; font-weight:700; text-align:right;">${fmt.format(bal)}</td>
                </tr>`;
            }).join('');
            depotTable.innerHTML = `<thead><tr><th>Konto</th><th style="text-align:right;">Aktueller Stand</th></tr></thead><tbody>${rows}</tbody>`;
        }
    }

    const invTable = document.getElementById('investmentsTable');
    if (invTable) {
        const allInvAccounts = [...depotAccounts, ...sparAccounts];
        const monthSet = new Set();
        transactions.filter(t => allInvAccounts.find(a => String(a.id) === String(t.account_id)))
            .forEach(t => { const m = (t.date || '').substring(0, 7); if (m) monthSet.add(m); });
        const monate = [...monthSet].sort().reverse();

        function balanceUpTo(acc, untilMonth) {
            let sum = acc.balance || 0;
            transactions.filter(t => String(t.account_id) === String(acc.id) && (t.date || '').substring(0, 7) <= untilMonth)
                .forEach(t => { if (t.type === 'Einnahmen') sum += t.amount; else sum -= t.amount; });
            return sum;
        }

        if (!monate.length) {
            invTable.innerHTML = '<thead><tr><th>Monat</th><th>Portfolio</th><th>Cash</th><th>Gesamt</th></tr></thead><tbody><tr><td colspan="4" style="color:var(--text-3);">Noch keine Investment-Transaktionen.</td></tr></tbody>';
        } else {
            const rows = monate.map(m => {
                const portfolio = depotAccounts.reduce((s, a) => s + balanceUpTo(a, m), 0);
                const cash      = sparAccounts.reduce((s, a) => s + balanceUpTo(a, m), 0);
                const gesamt    = portfolio + cash;
                const monLabel  = new Date(m + '-01').toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
                return `<tr>
                    <td style="font-weight:600; white-space:nowrap;">${monLabel}</td>
                    <td style="color:#22c55e;">${fmt.format(portfolio)}</td>
                    <td style="color:#eab308;">${fmt.format(cash)}</td>
                    <td style="font-weight:700; color:${gesamt >= 0 ? '#22c55e' : '#ef4444'};">${fmt.format(gesamt)}</td>
                </tr>`;
            }).join('');
            invTable.innerHTML = `<thead><tr><th>Monat</th><th style="color:#22c55e;">Portfolio</th><th style="color:#eab308;">Cash-Rücklagen</th><th>Gesamt</th></tr></thead><tbody>${rows}</tbody>`;
        }
    }
} catch(e) { console.error('renderInvestments:', e); } }

// =====================================================
// 4. DASHBOARD CHARTS
// =====================================================
let dashChartInstances = {};

function getDashChartIds(key) {
    try { const r = localStorage.getItem(key); return r === null ? null : new Set(JSON.parse(r)); } catch { return null; }
}
function setDashChartIds(key, ids) { localStorage.setItem(key, JSON.stringify([...ids])); }
function ensureDashChartIds(key, filtered) {
    const stored = getDashChartIds(key);
    if (stored === null) { setDashChartIds(key, new Set(filtered.map(a => String(a.id)))); return; }
    const validIds = filtered.map(a => String(a.id));
    const hasValid = validIds.some(id => stored.has(id));
    if (!hasValid && filtered.length > 0) setDashChartIds(key, new Set(validIds));
}
function buildChartFilterDropdown(containerId, key, filtered) {
    const cont = document.getElementById(containerId);
    if (!cont) return;
    const ids = getDashChartIds(key);
    cont.innerHTML = filtered.map(acc => {
        const on  = ids === null || ids.has(String(acc.id));
        const bal = acc.currentBalance ?? acc.balance ?? 0;
        return `<label class="account-filter-item" style="padding:6px 8px;">
            <input type="checkbox" ${on ? 'checked' : ''} onchange="onDashChartToggle('${key}',${acc.id},this.checked,'${containerId}')">
            <div class="account-filter-item-dot" style="background:${acc.color};width:8px;height:8px;border-radius:50%;flex-shrink:0;"></div>
            <div style="flex:1;font-size:0.8rem;">${acc.name}</div>
            <div style="font-size:0.75rem;color:${bal >= 0 ? '#22c55e' : '#ef4444'};white-space:nowrap;">${fmt.format(bal)}</div>
        </label>`;
    }).join('');
}
function onDashChartToggle(key, id, checked, containerId) {
    const filtered = getDashFilteredAccounts(key);
    let ids = getDashChartIds(key);
    if (!ids) ids = new Set(filtered.map(a => String(a.id)));
    if (checked) ids.add(String(id)); else ids.delete(String(id));
    setDashChartIds(key, ids);
    buildChartFilterDropdown(containerId, key, filtered);
    const btnMap = { 'finanzen_chart_ausgaben': 'ausgabenChartFilterBtn', 'finanzen_chart_vermoegen': 'vermoegenChartFilterBtn', 'finanzen_chart_portfolio': 'portfolioChartFilterBtn', 'finanzen_chart_cash': 'cashChartFilterBtn' };
    if (btnMap[key]) updateDashChartFilterBtn(btnMap[key], key, filtered);
    renderDashboardGraphs();
}
function getDashFilteredAccounts(key) {
    if (key === 'finanzen_chart_portfolio') return accounts.filter(a => a.type === 'depot');
    if (key === 'finanzen_chart_cash')      return accounts.filter(a => a.type === 'sparkonto');
    return accounts;
}
function getDashActiveAccounts(key) {
    const filtered = getDashFilteredAccounts(key);
    const ids = getDashChartIds(key);
    if (ids === null) return filtered;
    return filtered.filter(a => ids.has(String(a.id)));
}
function updateDashChartFilterBtn(btnId, key, filtered) {
    const btn = document.getElementById(btnId);
    if (!btn) return;
    const ids   = getDashChartIds(key);
    const total = filtered.length;
    const cnt   = ids === null ? total : [...ids].filter(id => filtered.find(a => String(a.id) === id)).length;
    let label;
    if (cnt === 0) label = 'Kein Konto';
    else if (cnt === total || ids === null) label = 'Alle';
    else {
        const names = filtered.filter(a => ids.has(String(a.id))).map(a => a.name);
        label = names.length <= 2 ? names.join(', ') : `${cnt} / ${total}`;
    }
    const span = btn.querySelector('span:not(.filter-dot)');
    if (span) span.textContent = label;
}
function toggleDashChartFilter(wrapperId, dropdownId) {
    const dd   = document.getElementById(dropdownId);
    if (!dd) return;
    const open = dd.classList.contains('open');
    document.querySelectorAll('.dash-chart-dropdown.open').forEach(el => el.classList.remove('open'));
    if (!open) dd.classList.add('open');
}
function onDashSelectAll(key, containerId, btnId) {
    const filtered = getDashFilteredAccounts(key);
    setDashChartIds(key, new Set(filtered.map(a => String(a.id))));
    buildChartFilterDropdown(containerId, key, filtered);
    updateDashChartFilterBtn(btnId, key, filtered);
    renderDashboardGraphs();
}

function renderDashboardGraphs() {
    const depotAccounts = accounts.filter(a => a.type === 'depot');
    const sparAccounts  = accounts.filter(a => a.type === 'sparkonto');

    ensureDashChartIds('finanzen_chart_ausgaben',  accounts);
    ensureDashChartIds('finanzen_chart_vermoegen', accounts);
    ensureDashChartIds('finanzen_chart_portfolio', depotAccounts);
    ensureDashChartIds('finanzen_chart_cash',      sparAccounts);

    buildChartFilterDropdown('ausgabenChartItems',  'finanzen_chart_ausgaben',  accounts);
    buildChartFilterDropdown('vermoegenChartItems', 'finanzen_chart_vermoegen', accounts);
    buildChartFilterDropdown('portfolioChartItems', 'finanzen_chart_portfolio', depotAccounts);
    buildChartFilterDropdown('cashChartItems',      'finanzen_chart_cash',      sparAccounts);

    updateDashChartFilterBtn('ausgabenChartFilterBtn',  'finanzen_chart_ausgaben',  accounts);
    updateDashChartFilterBtn('vermoegenChartFilterBtn', 'finanzen_chart_vermoegen', accounts);
    updateDashChartFilterBtn('portfolioChartFilterBtn', 'finanzen_chart_portfolio', depotAccounts);
    updateDashChartFilterBtn('cashChartFilterBtn',      'finanzen_chart_cash',      sparAccounts);

    function buildTransactionChartData(activeAccList, type) {
        const activeIds = new Set(activeAccList.map(a => String(a.id)));
        const filtered  = transactions.filter(t => !t.account_id ? true : activeIds.has(String(t.account_id)));

        if (type === 'ausgaben') {
            const monthly = {};
            filtered.forEach(t => {
                if (t.type !== 'Ausgaben') return;
                const m = (t.date || '').substring(0, 7);
                if (!m) return;
                monthly[m] = (monthly[m] || 0) + t.amount;
            });
            const sortedMonths = Object.keys(monthly).sort();
            return { labels: sortedMonths, data: sortedMonths.map(m => monthly[m]) };
        }

        const startBalance = activeAccList.reduce((s, a) => s + (a.balance || 0), 0);
        const monthly = {};
        filtered.forEach(t => {
            const m = (t.date || '').substring(0, 7);
            if (!m) return;
            if (!monthly[m]) monthly[m] = 0;
            if (t.type === 'Einnahmen') monthly[m] += t.amount;
            else monthly[m] -= t.amount;
        });
        const sortedMonths = Object.keys(monthly).sort();
        let cum = startBalance;
        const data = sortedMonths.map(m => { cum += monthly[m]; return parseFloat(cum.toFixed(2)); });

        if (!sortedMonths.length) {
            const nowStr = new Date().toISOString().substring(0, 7);
            const cur    = activeAccList.reduce((s, a) => s + (a.currentBalance ?? a.balance ?? 0), 0);
            return { labels: [nowStr], data: [cur] };
        }
        return { labels: sortedMonths, data };
    }

    function fmtMonthLabel(m) {
        return new Date(m + '-01').toLocaleDateString('de-DE', { month: 'short', year: 'numeric' });
    }

    function createChartFromTx(canvasId, label, activeAccList, type, borderColor, backgroundColor) {
        const canvas = document.getElementById(canvasId);
        if (!canvas) return;
        const result = buildTransactionChartData(activeAccList, type);
        if (dashChartInstances[canvasId]) dashChartInstances[canvasId].destroy();
        dashChartInstances[canvasId] = new Chart(canvas, {
            type: 'line',
            data: {
                labels: result.labels.map(fmtMonthLabel),
                datasets: [{ label, data: result.data, borderColor, backgroundColor, fill: true, tension: 0.3, pointRadius: 3 }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { labels: { color: 'white' } } },
                scales: {
                    y: { ticks: { color: 'white', callback: v => fmt.format(v) }, grid: { color: 'rgba(255,255,255,0.1)' } },
                    x: { ticks: { color: 'white' }, grid: { color: 'rgba(255,255,255,0.1)' } }
                }
            }
        });
    }

    createChartFromTx('ausgabenChart',  'Ausgaben',       getDashActiveAccounts('finanzen_chart_ausgaben'),  'ausgaben',  '#ef4444', 'rgba(239,68,68,0.1)');
    createChartFromTx('vermoegenChart', 'Gesamtvermögen', getDashActiveAccounts('finanzen_chart_vermoegen'), 'vermoegen', '#2563eb', 'rgba(37,99,235,0.1)');
    createChartFromTx('portfolioChart', 'Portfoliowert',  getDashActiveAccounts('finanzen_chart_portfolio'), 'vermoegen', '#16a34a', 'rgba(22,163,74,0.1)');
    createChartFromTx('cashChart',      'Cash-Rücklagen', getDashActiveAccounts('finanzen_chart_cash'),      'vermoegen', '#eab308', 'rgba(234,179,8,0.1)');
}