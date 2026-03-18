// ══════════════════════════════════════════════════════════════
//  OVERVIEW.JS  –  Golden Goat Capital Dashboard
// ══════════════════════════════════════════════════════════════

const fmtEur     = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });
const fmtEurSign = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', signDisplay: 'always' });

const ACCOUNT_LABELS_OV = {
    girokonto: 'Girokonto', sparkonto: 'Sparkonto', haushaltskonto: 'Haushaltskonto',
    bargeld: 'Bargeld', depot: 'Depot', sonstiges: 'Sonstiges'
};
const ACCOUNT_ICONS = {
    girokonto: 'ri-bank-line', sparkonto: 'ri-safe-line', haushaltskonto: 'ri-home-3-line',
    bargeld: 'ri-money-euro-circle-line', depot: 'ri-stock-line', sonstiges: 'ri-wallet-3-line'
};

let allAccountsOv      = [];
let allTransactionsOv  = [];
let allFixkostenOv     = [];
let allDokumenteOv     = [];
let allTodosOv         = [];
let allEventsOv        = [];
let wealthChartInst    = null;
let allSchuldenOv      = [];
let schuldenChartInst  = null;

// ── Filter / LocalStorage ────────────────────────────────────

function getOverviewActiveIds() {
    try {
        const r = localStorage.getItem('overview_active_accounts');
        return r === null ? null : new Set(JSON.parse(r));
    } catch { return null; }
}
function setOverviewActiveIds(ids) {
    localStorage.setItem('overview_active_accounts', JSON.stringify([...ids]));
}
function ensureNewAccountsActiveOv() {
    const ids = getOverviewActiveIds();
    if (!ids) return;
    allAccountsOv.forEach(a => { if (!ids.has(String(a.id))) ids.add(String(a.id)); });
    setOverviewActiveIds(ids);
}
function getActiveAccountsOv() {
    const ids = getOverviewActiveIds();
    return ids === null ? allAccountsOv : allAccountsOv.filter(a => ids.has(String(a.id)));
}

// ── Filter UI ────────────────────────────────────────────────

function buildOverviewFilterUI() {
    const cont = document.getElementById('overviewFilterItems');
    const wrap = document.getElementById('overviewFilterWrap');
    if (!cont || !wrap) return;
    if (!allAccountsOv.length) { wrap.style.display = 'none'; return; }
    wrap.style.display = '';
    const ids = getOverviewActiveIds();
    cont.innerHTML = allAccountsOv.map(acc => {
        const on  = ids === null || ids.has(String(acc.id));
        const bal = acc.currentBalance != null ? acc.currentBalance : (acc.balance || 0);
        const tl  = ACCOUNT_LABELS_OV[acc.type] || acc.type;
        const bc  = bal >= 0 ? '#22c55e' : '#ef4444';
        return '<label class="account-filter-item">' +
            '<input type="checkbox" ' + (on ? 'checked' : '') + ' onchange="toggleOverviewAccount(' + acc.id + ',this.checked)">' +
            '<div class="account-filter-item-dot" style="background:' + acc.color + ';"></div>' +
            '<div class="account-filter-item-info"><div class="account-filter-item-name">' + acc.name + '</div>' +
            '<div class="account-filter-item-type">' + tl + '</div></div>' +
            '<div class="account-filter-item-balance" style="color:' + bc + '">' + fmtEur.format(bal) + '</div>' +
            '</label>';
    }).join('');
    updateOverviewFilterBtn();
}

function toggleOverviewAccount(id, checked) {
    let ids = getOverviewActiveIds();
    if (!ids) ids = new Set(allAccountsOv.map(a => String(a.id)));
    if (checked) ids.add(String(id)); else ids.delete(String(id));
    setOverviewActiveIds(ids);
    buildOverviewFilterUI();
    renderAll();
}
function selectAllOverviewAccounts() {
    setOverviewActiveIds(new Set(allAccountsOv.map(a => String(a.id))));
    buildOverviewFilterUI(); renderAll();
}
function selectNoneOverviewAccounts() {
    setOverviewActiveIds(new Set());
    buildOverviewFilterUI(); renderAll();
}
function updateOverviewFilterBtn() {
    const btn = document.getElementById('overviewFilterBtn');
    const lbl = document.getElementById('overviewFilterLabel');
    const dot = document.getElementById('overviewFilterDot');
    if (!btn || !lbl || !dot) return;
    const ids = getOverviewActiveIds(), total = allAccountsOv.length;
    const cnt = ids === null ? total : [...ids].filter(id => allAccountsOv.find(a => String(a.id) === id)).length;
    dot.style.background = '';
    if (cnt === 0)                    { lbl.textContent = 'Kein Konto'; dot.className = 'filter-dot'; dot.style.background = '#ef4444'; }
    else if (cnt === total || !ids)   { lbl.textContent = 'Alle Konten'; dot.className = 'filter-dot all'; }
    else {
        const names = allAccountsOv.filter(a => ids.has(String(a.id))).map(a => a.name);
        lbl.textContent = names.length <= 2 ? names.join(', ') : (cnt + ' von ' + total + ' Konten');
        dot.className = 'filter-dot'; dot.style.background = 'var(--accent,#6358e6)';
    }
}
function toggleOverviewFilter() {
    const btn = document.getElementById('overviewFilterBtn');
    const dd  = document.getElementById('overviewFilterDropdown');
    if (!btn || !dd) return;
    const o = dd.classList.contains('open');
    dd.classList.toggle('open', !o); btn.classList.toggle('open', !o);
}

// ── Begrüßung ────────────────────────────────────────────────

function setGreeting() {
    const h = new Date().getHours();
    const el = document.getElementById('dashGreeting');
    if (!el) return;
    const greet = h < 12 ? 'Guten Morgen' : h < 18 ? 'Guten Tag' : 'Guten Abend';
    const dateStr = new Date().toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });
    el.textContent = greet + ' — ' + dateStr;
}

// ── renderAll ────────────────────────────────────────────────

function renderAll() {
    renderStats();
    renderWealthChart();
    renderAccountsList();
    renderUpcoming();
    renderBills();
    renderTodosEvents();
    renderSchulden();
    renderFinanzScore();
    renderCashflow();
    renderMonthCompare();
    renderInsights();
    renderPrognose();
}

// ── Stat-Karten ──────────────────────────────────────────────

function renderStats() {
    const active = getActiveAccountsOv();
    const ids    = getOverviewActiveIds();

    // Gesamtvermögen
    const wealth = active.reduce((s, a) => s + (a.currentBalance != null ? a.currentBalance : (a.balance || 0)), 0);
    const wEl = document.getElementById('ovWealth');
    if (wEl) {
        wEl.textContent  = fmtEur.format(wealth);
        wEl.style.color  = wealth > 0 ? '#22c55e' : wealth < 0 ? '#ef4444' : '';
    }

    // Einnahmen + Ausgaben: nur aktueller Monat
    const thisMonth = new Date().toISOString().substring(0, 7);
    const monthTx   = allTransactionsOv.filter(t => {
        const inMonth   = (t.date || '').substring(0, 7) === thisMonth;
        const inAccount = ids === null || !t.account_id || ids.has(String(t.account_id));
        return inMonth && inAccount;
    });
    let inc = 0, exp = 0;
    monthTx.forEach(t => { if (t.type === 'Einnahmen') inc += t.amount; else exp += t.amount; });
    const incEl = document.getElementById('ovIncome');
    const expEl = document.getElementById('ovExpense');
    if (incEl) incEl.textContent = fmtEur.format(inc);
    if (expEl) expEl.textContent = fmtEur.format(exp);

    // Offene Rechnungen
    const openBills = allDokumenteOv.filter(d => d.typ === 'rechnungen' && getEffectiveStatus(d) !== 'bezahlt');
    const billEl = document.getElementById('ovOpenBillsCount');
    if (billEl) {
        billEl.textContent = openBills.length;
        billEl.style.color = openBills.length > 0 ? '#f59e0b' : '';
    }

    // Gesamtschulden
    const totalDebt = allSchuldenOv.reduce((s, d) => s + (parseFloat(d.restbetrag) || 0), 0);
    const debtEl = document.getElementById('ovTotalDebt');
    if (debtEl) {
        debtEl.textContent = fmtEur.format(totalDebt);
        debtEl.style.color = totalDebt > 0 ? '#ef4444' : '#22c55e';
    }
}

function getEffectiveStatus(doc) {
    if (doc.status === 'bezahlt') return 'bezahlt';
    if (doc.faellig_datum && new Date(doc.faellig_datum) < new Date()) return 'ueberfaellig';
    return doc.status || 'offen';
}

// ── Vermögensverlauf Chart ───────────────────────────────────

function renderWealthChart() {
    const canvas = document.getElementById('ovWealthChart');
    if (!canvas) return;

    const active = getActiveAccountsOv();
    const ids    = getOverviewActiveIds();

    // Letzte 6 Monate berechnen
    const now    = new Date();
    const months = [];
    for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        months.push(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'));
    }

    const startBalance = active.reduce((s, a) => s + (a.balance || 0), 0);
    const monthlyDeltas = {};
    allTransactionsOv
        .filter(t => ids === null || !t.account_id || ids.has(String(t.account_id)))
        .forEach(t => {
            const m = (t.date || '').substring(0, 7);
            if (!monthlyDeltas[m]) monthlyDeltas[m] = 0;
            monthlyDeltas[m] += t.type === 'Einnahmen' ? t.amount : -t.amount;
        });

    // Alle Monate vor dem ersten der 6 Monate aufsummieren
    let cumBase = startBalance;
    Object.keys(monthlyDeltas).sort().forEach(m => {
        if (m < months[0]) cumBase += monthlyDeltas[m] || 0;
    });

    let cum = cumBase;
    const data = months.map(m => {
        cum += (monthlyDeltas[m] || 0);
        return parseFloat(cum.toFixed(2));
    });

    const labels = months.map(m => {
        const d = new Date(m + '-01');
        return d.toLocaleDateString('de-DE', { month: 'short', year: '2-digit' });
    });

    if (wealthChartInst) wealthChartInst.destroy();

    const gradient = canvas.getContext('2d').createLinearGradient(0, 0, 0, 240);
    gradient.addColorStop(0, 'rgba(99,88,230,0.3)');
    gradient.addColorStop(1, 'rgba(99,88,230,0.01)');

    wealthChartInst = new Chart(canvas, {
        type: 'line',
        data: {
            labels,
            datasets: [{
                label: 'Vermögen',
                data,
                borderColor: '#8b7ff5',
                backgroundColor: gradient,
                fill: true,
                tension: 0.4,
                pointRadius: 4,
                pointBackgroundColor: '#8b7ff5',
                pointBorderColor: 'var(--surface)',
                pointBorderWidth: 2,
                borderWidth: 2.5,
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: ctx => ' ' + fmtEur.format(ctx.parsed.y)
                    }
                }
            },
            scales: {
                y: {
                    ticks: { color: '#aaa', callback: v => fmtEur.format(v), font: { size: 11 }, maxTicksLimit: 5 },
                    grid:  { color: 'rgba(255,255,255,0.06)' }
                },
                x: {
                    ticks: { color: '#aaa', font: { size: 11 } },
                    grid:  { color: 'rgba(255,255,255,0.06)' }
                }
            }
        }
    });
}

// ── Konten-Liste ─────────────────────────────────────────────

function renderAccountsList() {
    const el = document.getElementById('ovAccountsList');
    if (!el) return;
    const active = getActiveAccountsOv();
    if (!active.length) {
        el.innerHTML = '<div class="ov-empty"><i class="ri-bank-line"></i>Keine Konten vorhanden</div>';
        return;
    }
    el.innerHTML = active.map(a => {
        const bal   = a.currentBalance != null ? a.currentBalance : (a.balance || 0);
        const label = ACCOUNT_LABELS_OV[a.type] || a.type;
        const color = bal >= 0 ? '#22c55e' : '#ef4444';
        return '<a class="ov-acc-item" href="/users/konto/' + a.id + '">' +
            '<div class="ov-acc-dot" style="background:' + a.color + ';"></div>' +
            '<div style="flex:1;min-width:0;">' +
                '<div class="ov-acc-name">' + escHtml(a.name) + '</div>' +
                '<div class="ov-acc-type">' + label + '</div>' +
            '</div>' +
            '<div class="ov-acc-balance" style="color:' + color + ';">' + fmtEur.format(bal) + '</div>' +
        '</a>';
    }).join('');
}

// ── Anstehende Zahlungen (Fixkosten) ─────────────────────────

function renderUpcoming() {
    const el = document.getElementById('ovUpcoming');
    if (!el) return;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Fixkosten auf die nächsten 7 Tage prüfen
    const upcoming = [];
    allFixkostenOv.forEach(f => {
        if (!f.datum_tag) return;
        // Prüfe: Welche Tage in den nächsten 7 Tagen hat diese Fixkost?
        for (let offset = 0; offset <= 7; offset++) {
            const checkDate = new Date(today);
            checkDate.setDate(today.getDate() + offset);
            let matches = false;

            if (f.haeufigkeit === 'monatlich' && checkDate.getDate() === parseInt(f.datum_tag)) {
                matches = true;
            } else if (f.haeufigkeit === 'woechentlich' && checkDate.getDay() === parseInt(f.datum_tag)) {
                matches = true;
            } else if (f.haeufigkeit === 'jaehrlich') {
                // datum_tag = Tag, ggf. monat aus name o.ä. – vereinfacht: nur Tag prüfen
                if (checkDate.getDate() === parseInt(f.datum_tag)) matches = true;
            } else if (f.haeufigkeit === 'vierteljaehrlich') {
                if (checkDate.getDate() === parseInt(f.datum_tag)) matches = true;
            }

            if (matches) {
                upcoming.push({ ...f, dueDate: new Date(checkDate), daysOffset: offset });
                break;
            }
        }
    });

    // Sortierung: aufsteigend nach Datum
    upcoming.sort((a, b) => a.dueDate - b.dueDate);

    if (!upcoming.length) {
        el.innerHTML = '<div class="ov-empty"><i class="ri-calendar-check-line"></i>Keine Zahlungen in den nächsten 7 Tagen</div>';
        return;
    }

    el.innerHTML = upcoming.map(f => {
        const daysOffset = f.daysOffset;
        let badgeClass = 'normal', badgeText = 'In ' + daysOffset + ' Tagen';
        if (daysOffset === 0) { badgeClass = 'today'; badgeText = 'Heute'; }
        else if (daysOffset === 1) { badgeClass = 'soon'; badgeText = 'Morgen'; }
        else if (daysOffset <= 3) { badgeClass = 'soon'; badgeText = 'In ' + daysOffset + ' Tagen'; }

        const dateStr = f.dueDate.toLocaleDateString('de-DE', { day: '2-digit', month: 'short' });
        const rhythmusShort = { monatlich: 'mtl.', woechentlich: 'wöch.', jaehrlich: 'jährl.', vierteljaehrlich: 'quartl.' };

        return '<div class="ov-row-item">' +
            '<div class="ov-row-item-icon" style="background:rgba(99,88,230,0.12);color:var(--accent);">' +
                '<i class="ri-repeat-line"></i>' +
            '</div>' +
            '<div class="ov-row-item-main">' +
                '<div class="ov-row-item-name">' + escHtml(f.name) + '</div>' +
                '<div class="ov-row-item-sub">' + dateStr + ' · ' + (rhythmusShort[f.haeufigkeit] || f.haeufigkeit) + (f.kategorie ? ' · ' + escHtml(f.kategorie) : '') + '</div>' +
            '</div>' +
            '<div class="ov-row-item-right">' +
                '<div class="ov-row-item-amount negative">−' + fmtEur.format(f.betrag) + '</div>' +
                '<div class="ov-badge ' + badgeClass + '" style="margin-top:3px;">' + badgeText + '</div>' +
            '</div>' +
        '</div>';
    }).join('');
}

// ── Offene Rechnungen ────────────────────────────────────────

function renderBills() {
    const el = document.getElementById('ovBillsList');
    if (!el) return;

    const openBills = allDokumenteOv
        .filter(d => d.typ === 'rechnungen' && getEffectiveStatus(d) !== 'bezahlt')
        .sort((a, b) => {
            // Überfällige zuerst, dann nach Fälligkeitsdatum
            const sa = getEffectiveStatus(a), sb = getEffectiveStatus(b);
            if (sa === 'ueberfaellig' && sb !== 'ueberfaellig') return -1;
            if (sa !== 'ueberfaellig' && sb === 'ueberfaellig') return 1;
            return (a.faellig_datum || a.datum || '').localeCompare(b.faellig_datum || b.datum || '');
        })
        .slice(0, 8);

    if (!openBills.length) {
        el.innerHTML = '<div class="ov-empty"><i class="ri-checkbox-circle-line"></i>Keine offenen Rechnungen</div>';
        return;
    }

    el.innerHTML = openBills.map(d => {
        const status = getEffectiveStatus(d);
        const faelligStr = d.faellig_datum
            ? new Date(d.faellig_datum).toLocaleDateString('de-DE', { day: '2-digit', month: 'short' })
            : (d.datum ? new Date(d.datum).toLocaleDateString('de-DE', { day: '2-digit', month: 'short' }) : '—');
        const statusLabel = { ueberfaellig: 'Überfällig', offen: 'Offen' };

        return '<div class="ov-row-item link" onclick="window.location.href=\'/users/dokumente/' + d.id + '/detail\'">' +
            '<div class="ov-row-item-icon" style="background:rgba(245,158,11,0.12);color:#f59e0b;">' +
                '<i class="ri-file-text-line"></i>' +
            '</div>' +
            '<div class="ov-row-item-main">' +
                '<div class="ov-row-item-name">' + escHtml(d.name) + '</div>' +
                '<div class="ov-row-item-sub">' + (d.aussteller ? escHtml(d.aussteller) + ' · ' : '') + 'Fällig: ' + faelligStr + '</div>' +
            '</div>' +
            '<div class="ov-row-item-right">' +
                (d.betrag ? '<div class="ov-row-item-amount negative">−' + fmtEur.format(d.betrag) + '</div>' : '') +
                '<div class="ov-badge ' + status + '" style="margin-top:3px;">' + (statusLabel[status] || status) + '</div>' +
            '</div>' +
        '</div>';
    }).join('');
}

// ── Todos & Events ───────────────────────────────────────────

function renderTodosEvents() {
    const el = document.getElementById('ovTodosEvents');
    if (!el) return;

    const today = new Date().toISOString().split('T')[0];
    const prioOrder = { hoch: 0, mittel: 1, niedrig: 2 };

    // Offene Todos: sortiert nach Priorität, dann Fälligkeit – max. 4
    const openTodos = allTodosOv
        .filter(t => !t.completed)
        .sort((a, b) => {
            const pd = (prioOrder[a.priority] ?? 1) - (prioOrder[b.priority] ?? 1);
            if (pd !== 0) return pd;
            if (a.due_date && !b.due_date) return -1;
            if (!a.due_date && b.due_date) return  1;
            return (a.due_date || '').localeCompare(b.due_date || '');
        })
        .slice(0, 4);

    // Heutige Events
    const todayEvents = allEventsOv.filter(e => (e.start || '').split('T')[0] === today).slice(0, 2);

    if (!openTodos.length && !todayEvents.length) {
        el.innerHTML = '<div class="ov-empty"><i class="ri-checkbox-line"></i>Alles erledigt – keine offenen Aufgaben</div>';
        return;
    }

    const prioCfg = {
        hoch:    { color: '#ef4444', bg: 'rgba(239,68,68,0.12)',  label: 'Hoch'    },
        mittel:  { color: '#f59e0b', bg: 'rgba(245,158,11,0.12)', label: 'Mittel'  },
        niedrig: { color: '#22c55e', bg: 'rgba(34,197,94,0.12)',  label: 'Niedrig' },
    };

    let html = '';

    openTodos.forEach(t => {
        const prio   = t.priority || 'mittel';
        const cfg    = prioCfg[prio] || prioCfg.mittel;
        const isOverdue = t.due_date && t.due_date < today;
        const isToday   = t.due_date && t.due_date === today;

        // Sub-Zeile: Fälligkeit + ggf. Fortschritt
        let sub = '';
        if (isOverdue)    sub += '<span style="color:#ef4444;font-weight:600;">⚠ Überfällig</span>';
        else if (isToday) sub += '<span style="color:#f59e0b;font-weight:600;">● Heute fällig</span>';
        else if (t.due_date) {
            const d = new Date(t.due_date);
            sub += '<span style="color:var(--text-3)"><i class="ri-calendar-line"></i> ' +
                d.toLocaleDateString('de-DE', { day: '2-digit', month: 'short' }) + '</span>';
        }
        if (t.quantity > 0) {
            if (sub) sub += ' · ';
            sub += t.current_count + '/' + t.quantity;
        }
        if (t.label) {
            if (sub) sub += ' · ';
            sub += escHtml(t.label);
        }
        if (!sub) sub = 'Aufgabe';

        html +=
            '<div class="ov-row-item link" onclick="window.location.href=\'/users/todo\'" style="border-left:3px solid ' + cfg.color + ';padding-left:10px;">' +
                '<div class="ov-row-item-icon" style="background:' + cfg.bg + ';color:' + cfg.color + ';">' +
                    '<i class="ri-checkbox-blank-circle-line"></i>' +
                '</div>' +
                '<div class="ov-row-item-main">' +
                    '<div class="ov-row-item-name">' + escHtml(t.task) + '</div>' +
                    '<div class="ov-row-item-sub" style="display:flex;align-items:center;gap:5px;">' + sub + '</div>' +
                '</div>' +
                '<span style="font-size:0.7rem;font-weight:700;padding:2px 8px;border-radius:10px;background:' + cfg.bg + ';color:' + cfg.color + ';white-space:nowrap;">' + cfg.label + '</span>' +
            '</div>';
    });

    // Heutige Events
    todayEvents.forEach(e => {
        const timeStr = e.start && e.start.includes('T') ? e.start.split('T')[1].slice(0, 5) : 'Ganztag';
        const endStr  = e.end && e.end.includes('T') ? ' – ' + e.end.split('T')[1].slice(0, 5) : '';
        html +=
            '<div class="ov-row-item link" onclick="window.location.href=\'/users/kalender\'">' +
                '<div class="ov-row-item-icon" style="background:rgba(59,130,246,0.12);color:#3b82f6;">' +
                    '<i class="ri-calendar-event-line"></i>' +
                '</div>' +
                '<div class="ov-row-item-main">' +
                    '<div class="ov-row-item-name">' + escHtml(e.text || e.title || '—') + '</div>' +
                    '<div class="ov-row-item-sub">' + timeStr + endStr + '</div>' +
                '</div>' +
                '<span class="ov-badge normal">Heute</span>' +
            '</div>';
    });

    el.innerHTML = html;
}

// ── Schulden-Widget ──────────────────────────────────────────

function renderSchulden() {
    renderSchuldenList();
    renderSchuldenChart();
    renderSchuldenRaten();
}

function renderSchuldenList() {
    const el = document.getElementById('ovSchuldenList');
    if (!el) return;

    if (!allSchuldenOv.length) {
        el.innerHTML = '<div class="ov-empty"><i class="ri-scales-line"></i>Keine Schulden erfasst</div>';
        return;
    }

    // Nach Restbetrag sortiert (höchste zuerst)
    const sorted = [...allSchuldenOv].sort((a, b) => b.restbetrag - a.restbetrag).slice(0, 6);

    const TYP_LABELS = {
        kredit: 'Kredit', kreditkarte: 'Kreditkarte', privatdarlehen: 'Privatdarlehen',
        ratenkauf: 'Ratenkauf', studienkredit: 'Studienkredit'
    };

    el.innerHTML = sorted.map(s => {
        const pct    = s.gesamtbetrag > 0 ? Math.round((1 - s.restbetrag / s.gesamtbetrag) * 100) : 0;
        const typ    = TYP_LABELS[s.typ] || s.typ;
        return '<div class="ov-row-item link" onclick="window.location.href=\'/users/schulden\'">' +
            '<div class="ov-row-item-icon" style="background:rgba(168,85,247,0.12);color:#a855f7;">' +
                '<i class="ri-scales-line"></i>' +
            '</div>' +
            '<div class="ov-row-item-main">' +
                '<div class="ov-row-item-name">' + escHtml(s.name) + '</div>' +
                '<div style="display:flex;align-items:center;gap:8px;margin-top:4px;">' +
                    '<div style="flex:1;height:4px;background:var(--border);border-radius:2px;overflow:hidden;">' +
                        '<div style="height:100%;width:' + pct + '%;background:#a855f7;border-radius:2px;transition:width 0.4s;"></div>' +
                    '</div>' +
                    '<span style="font-size:0.68rem;color:var(--text-3);white-space:nowrap;">' + pct + '%</span>' +
                '</div>' +
                '<div class="ov-row-item-sub">' + typ + (s.zinssatz ? ' · ' + parseFloat(s.zinssatz).toFixed(1) + '% p.a.' : '') + '</div>' +
            '</div>' +
            '<div class="ov-row-item-right">' +
                '<div class="ov-row-item-amount" style="color:#ef4444;">' + fmtEur.format(s.restbetrag) + '</div>' +
                '<div style="font-size:0.7rem;color:var(--text-3);margin-top:2px;">' + fmtEur.format(s.gesamtbetrag) + ' ges.</div>' +
            '</div>' +
        '</div>';
    }).join('');
}

function renderSchuldenChart() {
    const canvas = document.getElementById('ovSchuldenChart');
    const empty  = document.getElementById('ovSchuldenChartEmpty');
    const totalEl = document.getElementById('ovSchuldenTotal');
    if (!canvas) return;

    if (schuldenChartInst) { schuldenChartInst.destroy(); schuldenChartInst = null; }

    if (!allSchuldenOv.length) {
        canvas.style.display = 'none';
        if (empty) empty.style.display = '';
        return;
    }
    canvas.style.display = '';
    if (empty) empty.style.display = 'none';

    const TYP_LABELS = {
        kredit: 'Kredit', kreditkarte: 'Kreditkarte', privatdarlehen: 'Privatdarlehen',
        ratenkauf: 'Ratenkauf', studienkredit: 'Studienkredit'
    };
    const COLORS = ['#a855f7','#ef4444','#f59e0b','#3b82f6','#22c55e','#ec4899'];

    // Nach Typ gruppieren
    const byTyp = {};
    allSchuldenOv.forEach(s => {
        const t = TYP_LABELS[s.typ] || s.typ;
        byTyp[t] = (byTyp[t] || 0) + (parseFloat(s.restbetrag) || 0);
    });
    const keys = Object.keys(byTyp);
    const vals = keys.map(k => byTyp[k]);
    const total = vals.reduce((s, v) => s + v, 0);

    if (totalEl) totalEl.textContent = fmtEur.format(total) + ' gesamt';

    schuldenChartInst = new Chart(canvas, {
        type: 'doughnut',
        data: {
            labels: keys,
            datasets: [{
                data: vals,
                backgroundColor: keys.map((_, i) => COLORS[i % COLORS.length]),
                borderWidth: 3,
                borderColor: 'var(--surface)',
                hoverBorderWidth: 3,
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '68%',
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        color: 'rgba(255,255,255,0.7)',
                        font: { family: 'Plus Jakarta Sans', size: 11 },
                        padding: 10,
                        boxWidth: 12,
                        boxHeight: 12,
                    }
                },
                tooltip: {
                    callbacks: {
                        label: ctx => ' ' + fmtEur.format(ctx.parsed) + ' (' + Math.round(ctx.parsed / total * 100) + '%)'
                    }
                }
            }
        }
    });
}

function renderSchuldenRaten() {
    const el     = document.getElementById('ovSchuldenRaten');
    const lbl    = document.getElementById('ovSchuldenRatenLabel');
    if (!el) return;

    if (!allSchuldenOv.length) {
        el.innerHTML = '<div class="ov-empty"><i class="ri-calendar-schedule-line"></i>Keine Raten eingetragen</div>';
        return;
    }

    const mitRate = allSchuldenOv.filter(s => s.monatsrate > 0)
        .sort((a, b) => b.monatsrate - a.monatsrate);

    const gesamtRate = mitRate.reduce((s, d) => s + (parseFloat(d.monatsrate) || 0), 0);
    if (lbl) lbl.textContent = fmtEur.format(gesamtRate) + ' / Monat';

    if (!mitRate.length) {
        el.innerHTML = '<div class="ov-empty"><i class="ri-calendar-schedule-line"></i>Keine monatlichen Raten</div>';
        return;
    }

    el.innerHTML = mitRate.map(s => {
        const ratePct = gesamtRate > 0 ? Math.round(s.monatsrate / gesamtRate * 100) : 0;
        return '<div class="ov-row-item">' +
            '<div class="ov-row-item-icon" style="background:rgba(168,85,247,0.12);color:#a855f7;">' +
                '<i class="ri-money-euro-circle-line"></i>' +
            '</div>' +
            '<div class="ov-row-item-main">' +
                '<div class="ov-row-item-name">' + escHtml(s.name) + '</div>' +
                '<div style="display:flex;align-items:center;gap:8px;margin-top:4px;">' +
                    '<div style="flex:1;height:4px;background:var(--border);border-radius:2px;overflow:hidden;">' +
                        '<div style="height:100%;width:' + ratePct + '%;background:rgba(168,85,247,0.6);border-radius:2px;"></div>' +
                    '</div>' +
                    '<span style="font-size:0.68rem;color:var(--text-3);">' + ratePct + '%</span>' +
                '</div>' +
                '<div class="ov-row-item-sub">' + (s.zinssatz ? parseFloat(s.zinssatz).toFixed(1) + '% Zinsen' : 'Keine Zinsen') + '</div>' +
            '</div>' +
            '<div class="ov-row-item-right">' +
                '<div class="ov-row-item-amount" style="color:#a855f7;">' + fmtEur.format(s.monatsrate) + '</div>' +
                '<div style="font-size:0.7rem;color:var(--text-3);margin-top:2px;">pro Monat</div>' +
            '</div>' +
        '</div>';
    }).join('');
}

// ── Helpers ──────────────────────────────────────────────────

function escHtml(str) {
    return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Init ─────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
    setGreeting();
    applyWidgets(); // Widget-Sichtbarkeit sofort anwenden

    // ESC schließt Drawer
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') closeWidgetConfig();
    });

    // Dropdown außerhalb schließen
    document.addEventListener('click', e => {
        const w = document.getElementById('overviewFilterWrap');
        if (w && !w.contains(e.target)) {
            const dd  = document.getElementById('overviewFilterDropdown');
            const btn = document.getElementById('overviewFilterBtn');
            if (dd) dd.classList.remove('open');
            if (btn) btn.classList.remove('open');
        }
    });

    try {
        // Alle Daten parallel laden
        const [txRes, accRes, fixRes, dokRes, todoRes, evRes, schuldenRes] = await Promise.all([
            fetch('/users/getTransactions'),
            fetch('/users/accounts'),
            fetch('/users/fixkosten/unified'),
            fetch('/users/dokumente/data'),
            fetch('/users/todos', { headers: { Accept: 'application/json' } }),
            fetch('/users/events'),
            fetch('/users/schulden/data'),
        ]);

        allTransactionsOv = await txRes.json();
        allAccountsOv     = await accRes.json();
        allFixkostenOv    = await fixRes.json();
        allDokumenteOv    = dokRes.ok ? await dokRes.json() : [];
        allTodosOv        = todoRes.ok ? await todoRes.json() : [];
        allEventsOv       = evRes.ok  ? await evRes.json()  : [];
        allSchuldenOv     = schuldenRes.ok ? await schuldenRes.json() : [];

        ensureNewAccountsActiveOv();
        buildOverviewFilterUI();
        renderAll();
    } catch (err) {
        console.error('Dashboard Fehler:', err);
    }
});
// ── Financial Insights ───────────────────────────────────────

function renderInsights() {
    const wrap    = document.getElementById('ovInsightsWrap');
    const listEl  = document.getElementById('ovInsightsList');
    const countEl = document.getElementById('ovInsightsCount');
    if (!wrap || !listEl) return;

    const insights = generateInsights();

    if (!insights.length) {
        wrap.style.display = 'none';
        return;
    }

    wrap.style.display = '';
    if (countEl) countEl.textContent = insights.length + ' Hinweis' + (insights.length !== 1 ? 'e' : '');

    listEl.innerHTML = insights.map(ins => {
        const colors = {
            warning: { bg: 'rgba(245,158,11,0.09)', border: 'rgba(245,158,11,0.25)', icon: '#f59e0b', iconBg: 'rgba(245,158,11,0.15)' },
            danger:  { bg: 'rgba(239,68,68,0.08)',  border: 'rgba(239,68,68,0.22)',  icon: '#ef4444', iconBg: 'rgba(239,68,68,0.12)' },
            success: { bg: 'rgba(34,197,94,0.07)',  border: 'rgba(34,197,94,0.2)',   icon: '#22c55e', iconBg: 'rgba(34,197,94,0.12)' },
            info:    { bg: 'rgba(99,88,230,0.08)',  border: 'rgba(99,88,230,0.2)',   icon: 'var(--accent)', iconBg: 'rgba(99,88,230,0.12)' },
        };
        const c = colors[ins.type] || colors.info;
        const link = ins.url ? ` onclick="window.location.href='${ins.url}'" style="cursor:pointer;"` : '';
        return `<div class="ov-insight-card" style="background:${c.bg};border:1px solid ${c.border};"${link}>
            <div class="ov-insight-icon" style="background:${c.iconBg};color:${c.icon};">
                <i class="${ins.icon}"></i>
            </div>
            <div class="ov-insight-body">
                <div class="ov-insight-title">${escHtml(ins.title)}</div>
                <div class="ov-insight-sub">${escHtml(ins.sub)}</div>
            </div>
            ${ins.url ? `<i class="ri-arrow-right-s-line" style="color:${c.icon};font-size:1rem;flex-shrink:0;opacity:0.7;"></i>` : ''}
        </div>`;
    }).join('');
}

function generateInsights() {
    const insights = [];
    const thisMonth = new Date().toISOString().substring(0, 7);
    const prevMonth = (() => {
        const d = new Date(); d.setMonth(d.getMonth() - 1);
        return d.toISOString().substring(0, 7);
    })();

    const thisTx = allTransactionsOv.filter(t => (t.date || '').startsWith(thisMonth));
    const prevTx = allTransactionsOv.filter(t => (t.date || '').startsWith(prevMonth));

    const thisInc  = thisTx.filter(t => t.type === 'Einnahmen').reduce((s, t) => s + t.amount, 0);
    const thisExp  = thisTx.filter(t => t.type === 'Ausgaben').reduce((s, t) => s + t.amount, 0);
    const prevInc  = prevTx.filter(t => t.type === 'Einnahmen').reduce((s, t) => s + t.amount, 0);
    const prevExp  = prevTx.filter(t => t.type === 'Ausgaben').reduce((s, t) => s + t.amount, 0);

    // ── 1. Sparquote gesunken / gestiegen ──
    if (thisInc > 0 && prevInc > 0) {
        const thisSpar = (thisInc - thisExp) / thisInc;
        const prevSpar = (prevInc - prevExp) / prevInc;
        const delta    = thisSpar - prevSpar;
        if (thisSpar < 0) {
            insights.push({
                type: 'danger', icon: 'ri-arrow-down-line',
                title: 'Ausgaben übersteigen Einnahmen',
                sub: `Diesen Monat ${fmtEur.format(thisExp - thisInc)} mehr ausgegeben als eingenommen.`,
                url: '/users/ausgabentracker'
            });
        } else if (delta < -0.10 && prevSpar > 0.05) {
            insights.push({
                type: 'warning', icon: 'ri-percent-line',
                title: 'Sparquote gesunken',
                sub: `Von ${Math.round(prevSpar * 100)}% auf ${Math.round(thisSpar * 100)}% diesen Monat.`,
                url: '/users/budget'
            });
        } else if (thisSpar >= 0.20) {
            insights.push({
                type: 'success', icon: 'ri-trophy-line',
                title: 'Starke Sparquote',
                sub: `${Math.round(thisSpar * 100)}% Sparquote diesen Monat — sehr gut!`,
                url: null
            });
        }
    }

    // ── 2. Kategorie deutlich mehr als Vormonat ──
    const thisKat = {}, prevKat = {};
    thisTx.filter(t => t.type === 'Ausgaben').forEach(t => { thisKat[t.category] = (thisKat[t.category] || 0) + t.amount; });
    prevTx.filter(t => t.type === 'Ausgaben').forEach(t => { prevKat[t.category] = (prevKat[t.category] || 0) + t.amount; });

    const katInsights = [];
    Object.entries(thisKat).forEach(([kat, betrag]) => {
        if (kat === 'Kontostandskorrektur') return;
        const prev = prevKat[kat] || 0;
        if (prev > 10 && betrag > prev * 1.30 && betrag > 20) {
            const pct = Math.round((betrag / prev - 1) * 100);
            katInsights.push({ pct, kat, betrag, prev });
        }
    });
    // Nur den stärksten Anstieg zeigen
    katInsights.sort((a, b) => b.pct - a.pct);
    if (katInsights.length > 0) {
        const k = katInsights[0];
        insights.push({
            type: 'warning', icon: 'ri-bar-chart-grouped-line',
            title: `${k.pct}% mehr bei „${k.kat}"`,
            sub: `${fmtEur.format(k.betrag)} diesen Monat vs. ${fmtEur.format(k.prev)} im Vormonat.`,
            url: '/users/ausgabentracker'
        });
    }

    // ── 3. Hohe Fixkosten/Abos ──
    const aboKosten = allFixkostenOv
        .filter(f => (f.subtyp === 'abo' || f.haeufigkeit === 'monatlich') && f.betrag > 0)
        .reduce((s, f) => s + parseFloat(f.betrag), 0);
    const aboAnzahl = allFixkostenOv.filter(f => f.subtyp === 'abo').length;
    if (aboAnzahl >= 3 && aboKosten > 50) {
        insights.push({
            type: 'info', icon: 'ri-repeat-line',
            title: `${aboAnzahl} Abos · ${fmtEur.format(aboKosten)}/Monat`,
            sub: 'Lohnt sich ein Blick, ob alle noch aktiv genutzt werden.',
            url: '/users/fixkosten'
        });
    }

    // ── 4. Überfällige Rechnungen ──
    const ueberfaellig = allDokumenteOv.filter(d =>
        d.typ === 'rechnungen' &&
        d.status !== 'bezahlt' &&
        d.faellig_datum && new Date(d.faellig_datum) < new Date()
    );
    if (ueberfaellig.length > 0) {
        insights.push({
            type: 'danger', icon: 'ri-bill-line',
            title: `${ueberfaellig.length} überfällige Rechnung${ueberfaellig.length > 1 ? 'en' : ''}`,
            sub: 'Offene Rechnungen die bereits fällig waren.',
            url: '/users/dokumente'
        });
    }

    // ── 5. Schulden-Zinslast ──
    const hochverzinst = allSchuldenOv.filter(s => parseFloat(s.zinssatz) > 8 && parseFloat(s.restbetrag) > 0);
    if (hochverzinst.length > 0) {
        const summe = hochverzinst.reduce((s, d) => s + parseFloat(d.restbetrag), 0);
        insights.push({
            type: 'warning', icon: 'ri-percent-line',
            title: `Hochverzinste Schulden: ${fmtEur.format(summe)}`,
            sub: `${hochverzinst.length} Schuld${hochverzinst.length > 1 ? 'en' : ''} mit über 8% Zinsen — Tilgung priorisieren.`,
            url: '/users/schulden'
        });
    }

    // ── 6. Kein Eingang diesen Monat ──
    if (allTransactionsOv.length > 0 && thisInc === 0) {
        const d = new Date();
        if (d.getDate() > 10) {
            insights.push({
                type: 'info', icon: 'ri-question-line',
                title: 'Noch keine Einnahmen diesen Monat',
                sub: 'Wurde das Gehalt oder eine andere Einnahme bereits verbucht?',
                url: '/users/ausgabentracker'
            });
        }
    }

    // ── 7. Sparziel fast erreicht ──
    // (allSparziele nicht verfügbar im Overview — wäre ein separater Fetch nötig, daher weglassen)

    // ── 8. Positiver Trend: Ausgaben gesunken ──
    if (prevExp > 50 && thisExp > 0 && thisExp < prevExp * 0.85) {
        const ersparnis = prevExp - thisExp;
        insights.push({
            type: 'success', icon: 'ri-arrow-down-circle-line',
            title: `${fmtEur.format(ersparnis)} weniger Ausgaben als letzten Monat`,
            sub: 'Super — du hast diesen Monat deutlich weniger ausgegeben.',
            url: null
        });
    }

    return insights.slice(0, 6); // max. 6 Insights
}

// ══════════════════════════════════════════════════════════════
//  PHASE 5 — Finanz-Score
// ══════════════════════════════════════════════════════════════

function renderFinanzScore() {
    const canvas   = document.getElementById('scoreGauge');
    const numEl    = document.getElementById('scoreNumber');
    const lblEl    = document.getElementById('scoreLabel');
    const tipEl    = document.getElementById('scoreTip');
    if (!canvas || !numEl) return;

    const active      = getActiveAccountsOv();
    const thisMonth   = new Date().toISOString().substring(0, 7);
    const prevMonth   = (() => {
        const d = new Date(); d.setMonth(d.getMonth() - 1);
        return d.toISOString().substring(0, 7);
    })();

    const monthTx = allTransactionsOv.filter(t => (t.date || '').startsWith(thisMonth));
    const income  = monthTx.filter(t => t.type === 'Einnahmen').reduce((s, t) => s + t.amount, 0);
    const expense = monthTx.filter(t => t.type === 'Ausgaben').reduce((s, t) => s + t.amount, 0);

    const wealth      = active.reduce((s, a) => s + (a.currentBalance ?? a.balance ?? 0), 0);
    const totalDebt   = allSchuldenOv.reduce((s, d) => s + (parseFloat(d.restbetrag) || 0), 0);

    // 1. Sparquote (0-30 Punkte): gespart / einnahmen
    let sparPts = 0, sparPct = 0, sparTip = '';
    if (income > 0) {
        sparPct = Math.max(0, (income - expense) / income);
        sparPts = Math.round(Math.min(sparPct / 0.20, 1) * 30); // 20% = voll
        if (sparPct < 0.05)      sparTip = 'Sparquote unter 5% – versuche mehr zu sparen';
        else if (sparPct < 0.10) sparTip = 'Sparquote unter 10% – noch etwas Luft nach oben';
        else if (sparPct >= 0.20) sparTip = 'Sehr gute Sparquote – weiter so!';
    } else { sparTip = 'Noch keine Einnahmen diesen Monat'; }

    // 2. Budget-Einhaltung (0-25 Punkte): wie viele Kategorien im Budget
    let budgetPts = 12; // neutral wenn keine Budgets

    // 3. Notgroschen-Ratio (0-25 Punkte): 3 Monatsausgaben als Ziel
    let notgrosPts = 0, noTip = '';
    const avgExpense = expense || 1;
    const notgroschenZiel = avgExpense * 3;
    if (wealth > 0 && notgroschenZiel > 0) {
        notgrosPts = Math.round(Math.min(wealth / notgroschenZiel, 1) * 25);
        if (wealth < avgExpense)       noTip = 'Notgroschen aufbauen – mindestens 1 Monatsgehalt als Reserve';
        else if (wealth < avgExpense * 3) noTip = 'Notgroschen fast erreicht – Ziel: 3 Monatsausgaben';
    }

    // 4. Schuldenquote (0-20 Punkte): keine Schulden = voll, viel = 0
    let schuldenPts = 20, schulTip = '';
    if (totalDebt > 0 && wealth > 0) {
        const ratio = Math.min(totalDebt / Math.max(wealth, 1), 2);
        schuldenPts = Math.round(Math.max(0, (1 - ratio / 2)) * 20);
        if (ratio > 1.5)      schulTip = 'Schulden deutlich über Vermögen – Schulden reduzieren hat Priorität';
        else if (ratio > 0.5) schulTip = 'Schuldenquote mittel – weiter tilgen';
    } else if (totalDebt > 0) {
        schuldenPts = 0;
        schulTip = 'Schulden ohne positives Vermögen – fokussiere dich aufs Tilgen';
    }

    const score     = Math.min(100, sparPts + budgetPts + notgrosPts + schuldenPts);
    const scoreColor = score >= 75 ? '#22c55e' : score >= 50 ? '#f59e0b' : '#ef4444';
    const scoreLabel = score >= 80 ? 'Ausgezeichnet' : score >= 65 ? 'Gut' : score >= 45 ? 'Okay' : 'Verbesserungsbedarf';

    numEl.textContent = score;
    numEl.style.color = scoreColor;
    if (lblEl) { lblEl.textContent = scoreLabel; lblEl.style.color = scoreColor; }

    // Gauge zeichnen
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, 180, 100);
    const cx = 90, cy = 96, r = 72;
    // Hintergrundbogen (Halbkreis)
    ctx.beginPath();
    ctx.arc(cx, cy, r, Math.PI, 0, false);
    ctx.lineWidth = 14;
    ctx.strokeStyle = 'rgba(255,255,255,0.07)';
    ctx.lineCap = 'round';
    ctx.stroke();
    // Wertbogen
    const angle = Math.PI + (score / 100) * Math.PI;
    ctx.beginPath();
    ctx.arc(cx, cy, r, Math.PI, angle, false);
    ctx.strokeStyle = scoreColor;
    ctx.shadowColor = scoreColor;
    ctx.shadowBlur  = 12;
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Details befüllen
    const fill = (id, label, pts, max) => {
        const el = document.getElementById(id);
        if (!el) return;
        const pct = Math.round(pts / max * 100);
        const c   = pct >= 75 ? '#22c55e' : pct >= 45 ? '#f59e0b' : '#ef4444';
        el.innerHTML = '<span>' + label + '</span>' +
            '<span style="color:' + c + ';font-weight:700;">' + pts + ' / ' + max + '</span>';
    };
    fill('sdSparquote',   '💰 Sparquote',       sparPts,    30);
    fill('sdBudget',      '📊 Budget',           budgetPts,  25);
    fill('sdNotgroschen', '🛡 Notgroschen',      notgrosPts, 25);
    fill('sdSchulden',    '📉 Schuldenquote',    schuldenPts, 20);

    // Tipp
    const tip = sparTip || noTip || schulTip || 'Deine Finanzen sind auf einem guten Weg!';
    if (tipEl) tipEl.textContent = '💡 ' + tip;
}

function toggleScoreDetails() {
    const el  = document.getElementById('scoreDetails');
    const btn = document.getElementById('scoreDetailsBtn');
    if (!el) return;
    const show = el.style.display === 'none';
    el.style.display = show ? '' : 'none';
    if (btn) btn.textContent = show ? 'Schließen' : 'Details';
}

// ══════════════════════════════════════════════════════════════
//  PHASE 5 — Cashflow-Widget
// ══════════════════════════════════════════════════════════════

function renderCashflow() {
    const barsEl  = document.getElementById('cashflowBars');
    const netEl   = document.getElementById('cashflowNet');
    const lblEl   = document.getElementById('cashflowMonatLabel');
    if (!barsEl) return;

    const thisMonth = new Date().toISOString().substring(0, 7);
    const monthTx   = allTransactionsOv.filter(t => (t.date || '').startsWith(thisMonth));
    const income    = monthTx.filter(t => t.type === 'Einnahmen').reduce((s, t) => s + t.amount, 0);
    const expense   = monthTx.filter(t => t.type === 'Ausgaben').reduce((s, t) => s + t.amount, 0);
    const net       = income - expense;
    const maxVal    = Math.max(income, expense, 1);

    const monatName = new Date(thisMonth + '-01').toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
    if (lblEl) lblEl.textContent = monatName;

    const inPct  = Math.round(income  / maxVal * 100);
    const expPct = Math.round(expense / maxVal * 100);

    barsEl.innerHTML =
        '<div class="ov-cashflow-bar-row">' +
            '<div class="ov-cashflow-bar-label"><i class="ri-arrow-up-line" style="color:#22c55e;"></i> Einnahmen</div>' +
            '<div class="ov-cashflow-bar-track"><div class="ov-cashflow-bar-fill" style="width:' + inPct + '%;background:#22c55e;"></div></div>' +
            '<div class="ov-cashflow-bar-val" style="color:#22c55e;">' + fmtEur.format(income) + '</div>' +
        '</div>' +
        '<div class="ov-cashflow-bar-row">' +
            '<div class="ov-cashflow-bar-label"><i class="ri-arrow-down-line" style="color:#ef4444;"></i> Ausgaben</div>' +
            '<div class="ov-cashflow-bar-track"><div class="ov-cashflow-bar-fill" style="width:' + expPct + '%;background:#ef4444;"></div></div>' +
            '<div class="ov-cashflow-bar-val" style="color:#ef4444;">' + fmtEur.format(expense) + '</div>' +
        '</div>';

    const netColor = net >= 0 ? '#22c55e' : '#ef4444';
    const netIcon  = net >= 0 ? 'ri-arrow-up-circle-line' : 'ri-arrow-down-circle-line';
    const netLabel = net >= 0 ? 'Positiver Cashflow' : 'Negativer Cashflow';
    if (netEl) {
        netEl.style.background = net >= 0 ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)';
        netEl.style.borderColor = net >= 0 ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)';
        netEl.innerHTML =
            '<span style="color:' + netColor + ';"><i class="' + netIcon + '"></i> ' + netLabel + '</span>' +
            '<span style="color:' + netColor + ';font-size:1rem;">' + fmtEurSign.format(net) + '</span>';
    }
}

// ══════════════════════════════════════════════════════════════
//  PHASE 5 — Monatsvergleich
// ══════════════════════════════════════════════════════════════

function renderMonthCompare() {
    const el = document.getElementById('ovMonthCompare');
    if (!el) return;

    const now   = new Date();
    const thisM = now.toISOString().substring(0, 7);
    const prevM = (() => { const d = new Date(now); d.setMonth(d.getMonth() - 1); return d.toISOString().substring(0, 7); })();

    const txThis = allTransactionsOv.filter(t => (t.date || '').startsWith(thisM));
    const txPrev = allTransactionsOv.filter(t => (t.date || '').startsWith(prevM));

    const sum = (arr, type) => arr.filter(t => t.type === type).reduce((s, t) => s + t.amount, 0);

    const rows = [
        { label: 'Einnahmen', icon: 'ri-arrow-up-line',   iconColor: '#22c55e',
          this: sum(txThis, 'Einnahmen'), prev: sum(txPrev, 'Einnahmen'), higherIsBetter: true },
        { label: 'Ausgaben',  icon: 'ri-arrow-down-line', iconColor: '#ef4444',
          this: sum(txThis, 'Ausgaben'),  prev: sum(txPrev, 'Ausgaben'),  higherIsBetter: false },
        { label: 'Sparrate',  icon: 'ri-safe-line',       iconColor: '#8b7ff5',
          this: sum(txThis, 'Einnahmen') - sum(txThis, 'Ausgaben'),
          prev: sum(txPrev, 'Einnahmen') - sum(txPrev, 'Ausgaben'),
          higherIsBetter: true, signed: true },
    ];

    el.innerHTML = rows.map(r => {
        const diff = r.this - r.prev;
        const pct  = r.prev !== 0 ? Math.round(Math.abs(diff) / Math.abs(r.prev) * 100) : null;
        let deltaClass = 'neu', deltaText = 'Neu';
        if (pct !== null) {
            const better = r.higherIsBetter ? diff > 0 : diff < 0;
            deltaClass = diff === 0 ? 'neu' : better ? 'pos' : 'neg';
            deltaText  = (diff > 0 ? '+' : '') + pct + '%';
        }
        return '<div class="ov-compare-row">' +
            '<div class="ov-compare-label"><i class="' + r.icon + '" style="color:' + r.iconColor + ';margin-right:5px;"></i>' + r.label + '</div>' +
            '<div class="ov-compare-vals">' +
                '<div class="ov-compare-this" style="color:' + r.iconColor + ';">' +
                    (r.signed ? fmtEurSign.format(r.this) : fmtEur.format(r.this)) +
                '</div>' +
                '<div class="ov-compare-prev">Vormonat: ' + fmtEur.format(Math.abs(r.prev)) + '</div>' +
            '</div>' +
            '<span class="ov-compare-delta ' + deltaClass + '">' + deltaText + '</span>' +
        '</div>';
    }).join('');
}

// ══════════════════════════════════════════════════════════════
//  PHASE 5 — Schnellerfassung
// ══════════════════════════════════════════════════════════════

let qaType = 'Ausgaben';
let qaCategories = [];
let qaAccounts   = [];

async function openQuickAdd() {
    const overlay = document.getElementById('quickAddOverlay');
    if (!overlay) return;

    // Datum auf heute setzen
    document.getElementById('qaDate').value = new Date().toISOString().split('T')[0];
    document.getElementById('qaName').value    = '';
    document.getElementById('qaAmount').value  = '';
    document.getElementById('qaStatus').style.display = 'none';
    setQaType('Ausgaben');

    // Kategorien + Konten laden (einmalig cachen)
    if (!qaCategories.length) {
        try {
            const r = await fetch('/users/categories');
            qaCategories = r.ok ? await r.json() : [];
        } catch { qaCategories = []; }
    }
    if (!qaAccounts.length && allAccountsOv.length) {
        qaAccounts = allAccountsOv;
    } else if (!qaAccounts.length) {
        try {
            const r = await fetch('/users/accounts');
            qaAccounts = r.ok ? await r.json() : [];
        } catch { qaAccounts = []; }
    }

    const catSel = document.getElementById('qaCategory');
    catSel.innerHTML = '<option value="">Keine Kategorie</option>' +
        qaCategories.map(c => '<option value="' + escHtml(c.name || c) + '">' + escHtml(c.name || c) + '</option>').join('');

    const accSel = document.getElementById('qaAccount');
    accSel.innerHTML = '<option value="">Kein Konto</option>' +
        qaAccounts.map(a => '<option value="' + a.id + '">' + escHtml(a.name) + '</option>').join('');

    overlay.style.display = 'flex';
    setTimeout(() => document.getElementById('qaName')?.focus(), 80);
}

function closeQuickAdd(e) {
    if (e && e.target !== document.getElementById('quickAddOverlay')) return;
    document.getElementById('quickAddOverlay').style.display = 'none';
}

function setQaType(type) {
    qaType = type;
    document.getElementById('qaBtnAusgabe').classList.toggle('active',  type === 'Ausgaben');
    document.getElementById('qaBtnEinnahme').classList.toggle('active', type === 'Einnahmen');
    if (type === 'Einnahmen') {
        document.getElementById('qaBtnEinnahme').style.background = '#22c55e';
        document.getElementById('qaBtnEinnahme').style.borderColor = '#22c55e';
        document.getElementById('qaBtnEinnahme').style.color = '#fff';
        document.getElementById('qaBtnEinnahme').style.boxShadow = '0 0 14px rgba(34,197,94,0.35)';
        document.getElementById('qaBtnAusgabe').style.cssText = '';
    } else {
        document.getElementById('qaBtnAusgabe').style.background = 'var(--accent)';
        document.getElementById('qaBtnAusgabe').style.borderColor = 'var(--accent)';
        document.getElementById('qaBtnAusgabe').style.color = '#fff';
        document.getElementById('qaBtnAusgabe').style.boxShadow = '0 0 14px var(--accent-glow)';
        document.getElementById('qaBtnEinnahme').style.cssText = '';
    }
}

async function submitQuickAdd() {
    const name      = document.getElementById('qaName').value.trim();
    const amount    = parseFloat(document.getElementById('qaAmount').value);
    const date      = document.getElementById('qaDate').value;
    const category  = document.getElementById('qaCategory').value;
    const accountId = document.getElementById('qaAccount').value || null;
    const statusEl  = document.getElementById('qaStatus');

    if (!name || isNaN(amount) || amount <= 0 || !date) {
        statusEl.textContent = 'Bitte Name, Betrag und Datum ausfüllen.';
        statusEl.style.display = '';
        return;
    }

    try {
        const res = await fetch('/users/addTransaction', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, amount, date, category, type: qaType, account_id: accountId })
        });
        if (!res.ok) throw new Error((await res.json()).message || 'Fehler');

        // Lokal in allTransactionsOv einfügen und neu rendern
        const newTx = { name, amount, date, category, type: qaType, account_id: accountId };
        allTransactionsOv.push(newTx);

        document.getElementById('quickAddOverlay').style.display = 'none';
        renderAll();
    } catch (err) {
        statusEl.textContent = 'Fehler: ' + err.message;
        statusEl.style.display = '';
    }
}

// ══════════════════════════════════════════════════════════════
//  CASHFLOW-PROGNOSE
// ══════════════════════════════════════════════════════════════

let prognoseHorizont  = 3;   // 3 oder 12 Monate
let prognoseChartInst = null;

function setPrognoseHorizont(n) {
    prognoseHorizont = n;
    // Buttons aktualisieren
    document.getElementById('progBtn3') ?.classList.toggle('prog-horizon-btn--active', n === 3);
    document.getElementById('progBtn12')?.classList.toggle('prog-horizon-btn--active', n === 12);
    renderPrognose();
}

function renderPrognose() {
    const canvas = document.getElementById('prognoseChart');
    if (!canvas) return;

    // ── Aktueller Kontostand (alle aktiven Konten) ────────────
    const active  = getActiveAccountsOv();
    const startBalance = active.reduce((s, a) => s + (a.currentBalance ?? a.balance ?? 0), 0);

    // ── Durchschnittliche monatliche Einnahmen (letzte 3 Monate) ─
    const now = new Date();
    const last3Months = [];
    for (let i = 1; i <= 3; i++) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        last3Months.push(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'));
    }
    let totalInc3 = 0;
    last3Months.forEach(m => {
        allTransactionsOv
            .filter(t => (t.date || '').startsWith(m) && t.type === 'Einnahmen')
            .forEach(t => { totalInc3 += t.amount; });
    });
    const avgMonthlyInc = totalInc3 / 3;

    // ── Monatliche Fixkosten berechnen ────────────────────────
    let totalFixMonthly = 0;
    let totalFixIncMonthly = 0; // Fixe Einnahmen (z.B. Gehalt als Fixposten)
    const fixDetails = [];
    const fixIncDetails = [];
    allFixkostenOv.forEach(f => {
        const b = parseFloat(f.betrag) || 0;
        if (!b) return;
        let monthly = 0;
        const hz = (f.haeufigkeit || '').toLowerCase();
        if      (hz === 'monatlich')        monthly = b;
        else if (hz === 'woechentlich')     monthly = b * 4.33;
        else if (hz === 'jaehrlich')        monthly = b / 12;
        else if (hz === 'vierteljaehrlich') monthly = b / 3;
        else if (hz === 'halbjaehrlich')    monthly = b / 6;
        else if (!hz)                       monthly = b; // Fallback
        if (monthly <= 0) return;

        const isEinnahme = (f.tx_type || '').toLowerCase() === 'einnahmen';
        if (isEinnahme) {
            totalFixIncMonthly += monthly;
            fixIncDetails.push({ name: f.name, monthly });
        } else {
            totalFixMonthly += monthly;
            fixDetails.push({ name: f.name, monthly });
        }
    });
    // Auf Top 4 beschränken für die Anzeige
    fixDetails.sort((a, b) => b.monthly - a.monthly);
    fixIncDetails.sort((a, b) => b.monthly - a.monthly);

    // ── Monatliche Schuldenraten ──────────────────────────────
    let totalSchuldenMonthly = 0;
    const schuldenDetails = [];
    allSchuldenOv.forEach(s => {
        const rate = parseFloat(s.monatsrate) || 0;
        if (rate > 0) {
            totalSchuldenMonthly += rate;
            schuldenDetails.push({ name: s.name, monthly: rate });
        }
    });

    // ── Netto pro Monat ───────────────────────────────────────
    // Einnahmen = Ø historische Transaktionen + fixe Einnahmen (Gehalt etc.)
    // Ausgaben  = Fixkosten-Ausgaben + Schuldenraten
    const totalMonthlyInc = avgMonthlyInc + totalFixIncMonthly;
    const netMonthly = totalMonthlyInc - totalFixMonthly - totalSchuldenMonthly;

    // ── Prognose-Datenpunkte berechnen ────────────────────────
    const horizont = prognoseHorizont;
    const labels   = [];
    const dataPoints = [startBalance]; // Startpunkt = aktueller Stand
    const today = new Date();

    for (let i = 1; i <= horizont; i++) {
        const d = new Date(today.getFullYear(), today.getMonth() + i, 1);
        labels.push(d.toLocaleDateString('de-DE', { month: 'short', year: horizont > 3 ? '2-digit' : undefined }));
        dataPoints.push(parseFloat((startBalance + netMonthly * i).toFixed(2)));
    }
    labels.unshift(today.toLocaleDateString('de-DE', { month: 'short', year: horizont > 3 ? '2-digit' : undefined }));

    // ── Kritischer Punkt: wann wird Kontostand < 0 ? ─────────
    let kritischMonat = null;
    if (netMonthly < 0) {
        const monthsToZero = Math.floor(startBalance / Math.abs(netMonthly));
        if (monthsToZero <= horizont) kritischMonat = monthsToZero;
    }

    // ── Chart rendern ─────────────────────────────────────────
    if (prognoseChartInst) { prognoseChartInst.destroy(); prognoseChartInst = null; }

    const ctx = canvas.getContext('2d');
    const minVal = Math.min(...dataPoints);
    const maxVal = Math.max(...dataPoints);

    // Farbverlauf: grün → rot je nach Verlauf
    const gradient = ctx.createLinearGradient(0, 0, 0, 220);
    const isNegativeTrend = netMonthly < 0;
    gradient.addColorStop(0, isNegativeTrend ? 'rgba(239,68,68,0.25)' : 'rgba(34,197,94,0.25)');
    gradient.addColorStop(1, 'rgba(0,0,0,0)');

    const lineColor = isNegativeTrend ? '#ef4444' : '#22c55e';

    // Nulllinie als Plugin nur wenn nötig
    const zeroLinePlugin = {
        id: 'zeroLine',
        beforeDraw(chart) {
            if (minVal >= 0) return;
            const { ctx: c, scales: { y } } = chart;
            const yZero = y.getPixelForValue(0);
            c.save();
            c.beginPath();
            c.setLineDash([5, 4]);
            c.moveTo(chart.chartArea.left, yZero);
            c.lineTo(chart.chartArea.right, yZero);
            c.strokeStyle = 'rgba(239,68,68,0.5)';
            c.lineWidth = 1.5;
            c.stroke();
            c.restore();
        }
    };

    prognoseChartInst = new Chart(canvas, {
        type: 'line',
        data: {
            labels,
            datasets: [{
                label: 'Kontostand',
                data: dataPoints,
                borderColor: lineColor,
                backgroundColor: gradient,
                fill: true,
                tension: 0.35,
                pointRadius: (ctx) => ctx.dataIndex === 0 ? 5 : 3,
                pointBackgroundColor: dataPoints.map(v => v >= 0 ? '#22c55e' : '#ef4444'),
                pointBorderColor: 'var(--surface)',
                pointBorderWidth: 2,
                borderWidth: 2.5,
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: c => ' ' + fmtEur.format(c.parsed.y),
                        title: c => c[0].label
                    }
                }
            },
            scales: {
                y: {
                    ticks: { color: '#aaa', callback: v => fmtEur.format(v), font: { size: 10 }, maxTicksLimit: 5 },
                    grid:  { color: 'rgba(255,255,255,0.06)' }
                },
                x: {
                    ticks: { color: '#aaa', font: { size: 10 } },
                    grid:  { display: false }
                }
            }
        },
        plugins: [zeroLinePlugin]
    });

    // ── Aufschlüsselung rendern ───────────────────────────────
    const incRow = document.getElementById('progIncomeRows');
    if (incRow) {
        let html = '';
        if (avgMonthlyInc > 0) {
            html += `<div class="prog-breakdown-row">
                <span class="prog-breakdown-row-name">Ø Transaktionen</span>
                <span class="prog-breakdown-row-val" style="color:#22c55e;">+${fmtEur.format(avgMonthlyInc)}</span>
             </div>`;
        }
        fixIncDetails.forEach(f => {
            html += `<div class="prog-breakdown-row">
                <span class="prog-breakdown-row-name">${escHtml(f.name)}</span>
                <span class="prog-breakdown-row-val" style="color:#22c55e;">+${fmtEur.format(f.monthly)}</span>
            </div>`;
        });
        if (!html) html = `<div class="prog-breakdown-row"><span class="prog-breakdown-row-name" style="color:var(--text-3);">Keine Einnahmen erfasst</span></div>`;
        incRow.innerHTML = html;
    }

    const fixRow = document.getElementById('progFixRows');
    if (fixRow) {
        if (!fixDetails.length) {
            fixRow.innerHTML = `<div class="prog-breakdown-row"><span class="prog-breakdown-row-name" style="color:var(--text-3);">Keine Fixkosten</span></div>`;
        } else {
            fixRow.innerHTML = fixDetails.slice(0, 4).map(f =>
                `<div class="prog-breakdown-row">
                    <span class="prog-breakdown-row-name">${escHtml(f.name)}</span>
                    <span class="prog-breakdown-row-val" style="color:#ef4444;">−${fmtEur.format(f.monthly)}</span>
                </div>`
            ).join('') + (fixDetails.length > 4
                ? `<div class="prog-breakdown-row"><span class="prog-breakdown-row-name" style="color:var(--text-3);">+ ${fixDetails.length - 4} weitere</span><span class="prog-breakdown-row-val" style="color:#ef4444;">−${fmtEur.format(fixDetails.slice(4).reduce((s,f)=>s+f.monthly,0))}</span></div>`
                : '');
        }
    }

    const schulRow = document.getElementById('progSchuldenRows');
    if (schulRow) {
        if (!schuldenDetails.length) {
            schulRow.innerHTML = `<div class="prog-breakdown-row"><span class="prog-breakdown-row-name" style="color:var(--text-3);">Keine Raten</span></div>`;
        } else {
            schulRow.innerHTML = schuldenDetails.slice(0, 3).map(s =>
                `<div class="prog-breakdown-row">
                    <span class="prog-breakdown-row-name">${escHtml(s.name)}</span>
                    <span class="prog-breakdown-row-val" style="color:#a855f7;">−${fmtEur.format(s.monthly)}</span>
                </div>`
            ).join('') + (schuldenDetails.length > 3
                ? `<div class="prog-breakdown-row"><span class="prog-breakdown-row-name" style="color:var(--text-3);">+ ${schuldenDetails.length - 3} weitere</span><span class="prog-breakdown-row-val" style="color:#a855f7;">−${fmtEur.format(schuldenDetails.slice(3).reduce((s,f)=>s+f.monthly,0))}</span></div>`
                : '');
        }
    }

    // ── Netto-Ergebnis ────────────────────────────────────────
    const resultEl = document.getElementById('progResult');
    if (resultEl) {
        const netColor = netMonthly >= 0 ? '#22c55e' : '#ef4444';
        const netSign  = netMonthly >= 0 ? '+' : '';
        resultEl.style.background = netMonthly >= 0 ? 'rgba(34,197,94,0.07)' : 'rgba(239,68,68,0.07)';
        resultEl.style.borderColor = netMonthly >= 0 ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)';
        resultEl.innerHTML =
            `<span style="color:var(--text-2);">Netto / Monat</span>
             <span style="color:${netColor};font-size:1rem;">${netSign}${fmtEur.format(netMonthly)}</span>`;
    }

    // ── Ampel ─────────────────────────────────────────────────
    const ampelEl = document.getElementById('progAmpel');
    if (ampelEl) {
        let ampelBg, ampelColor, ampelIcon, ampelText;
        if (netMonthly >= 0) {
            // Positiver Cashflow
            const endeBalance = dataPoints[dataPoints.length - 1];
            ampelBg    = 'rgba(34,197,94,0.08)';
            ampelColor = '#22c55e';
            ampelIcon  = 'ri-checkbox-circle-line';
            ampelText  = `Guter Cashflow. In ${horizont} Monat${horizont > 1 ? 'en' : ''} voraussichtlich <strong style="color:#22c55e;">${fmtEur.format(endeBalance)}</strong>.`;
        } else if (kritischMonat !== null && kritischMonat <= horizont) {
            // Kontostand wird negativ
            ampelBg    = 'rgba(239,68,68,0.08)';
            ampelColor = '#ef4444';
            ampelIcon  = 'ri-alarm-warning-line';
            ampelText  = kritischMonat <= 1
                ? `<strong>Kritisch:</strong> Der Kontostand könnte bereits nächsten Monat ins Minus rutschen.`
                : `<strong>Warnung:</strong> Bei aktuellem Verlauf wird der Kontostand in ca. <strong>${kritischMonat} Monaten</strong> negativ.`;
        } else {
            // Negativer Cashflow aber noch nicht kritisch
            ampelBg    = 'rgba(245,158,11,0.08)';
            ampelColor = '#f59e0b';
            ampelIcon  = 'ri-error-warning-line';
            ampelText  = `Die monatlichen Ausgaben übersteigen die Einnahmen um <strong style="color:#ef4444;">${fmtEur.format(Math.abs(netMonthly))}</strong>. Langfristig nicht nachhaltig.`;
        }
        ampelEl.style.background   = ampelBg;
        ampelEl.style.color        = 'var(--text-2)';
        ampelEl.style.border       = `1px solid ${ampelColor}33`;
        ampelEl.style.borderRadius = '9px';
        ampelEl.innerHTML = `<i class="${ampelIcon}" style="color:${ampelColor};"></i><span>${ampelText}</span>`;
    }
}

// ══════════════════════════════════════════════════════════════
//  WIDGET-KONFIGURATION
// ══════════════════════════════════════════════════════════════

const WIDGETS = [
    { id: 'widget-stats',            label: 'Stat-Karten',             icon: 'ri-dashboard-line',       default: true },
    { id: 'widget-prognose',         label: 'Cashflow-Prognose',        icon: 'ri-funds-line',           default: true },
    { id: 'widget-phase5',           label: 'Finanz-Score & Cashflow', icon: 'ri-award-line',           default: true },
    { id: 'widget-insights',         label: 'Financial Insights',      icon: 'ri-lightbulb-flash-line', default: true },
    { id: 'widget-vermoegensverlauf',label: 'Vermögensverlauf',         icon: 'ri-line-chart-line',      default: true },
    { id: 'widget-aufgaben',         label: 'Aufgaben & Termine',       icon: 'ri-checkbox-line',        default: true },
    { id: 'widget-schulden',         label: 'Schuldenübersicht',        icon: 'ri-scales-line',          default: true },
];

function getWidgetConfig() {
    try {
        const raw = localStorage.getItem('ggc_widget_config');
        return raw ? JSON.parse(raw) : {};
    } catch { return {}; }
}

function saveWidgetConfig(cfg) {
    localStorage.setItem('ggc_widget_config', JSON.stringify(cfg));
}

function applyWidgets() {
    const cfg = getWidgetConfig();
    WIDGETS.forEach(w => {
        const el = document.getElementById(w.id);
        if (!el) return;
        const visible = cfg[w.id] !== false; // default sichtbar
        el.style.display = visible ? '' : 'none';
    });
}

function openWidgetConfig() {
    const cfg  = getWidgetConfig();
    const list = document.getElementById('widgetToggleList');
    if (!list) return;

    list.innerHTML = WIDGETS.map(w => {
        const visible = cfg[w.id] !== false;
        return `<label class="widget-toggle-row" onclick="toggleWidget('${w.id}', this.querySelector('.widget-toggle-switch'))">
            <div class="widget-toggle-info">
                <div class="widget-toggle-icon"><i class="${w.icon}"></i></div>
                <span>${w.label}</span>
            </div>
            <div class="widget-toggle-switch ${visible ? 'on' : ''}" data-id="${w.id}">
                <div class="widget-toggle-knob"></div>
            </div>
        </label>`;
    }).join('');

    document.getElementById('widgetDrawerBackdrop').classList.add('open');
    document.getElementById('widgetDrawer').classList.add('open');
    document.body.style.overflow = 'hidden';
}

function closeWidgetConfig(e) {
    document.getElementById('widgetDrawerBackdrop').classList.remove('open');
    document.getElementById('widgetDrawer').classList.remove('open');
    document.body.style.overflow = '';
}

function toggleWidget(id, switchEl) {
    const cfg     = getWidgetConfig();
    const wasOn   = cfg[id] !== false;
    cfg[id]       = !wasOn;
    saveWidgetConfig(cfg);
    switchEl.classList.toggle('on', !wasOn);
    const el = document.getElementById(id);
    if (el) el.style.display = !wasOn ? '' : 'none';
}

function resetWidgets() {
    saveWidgetConfig({});
    applyWidgets();
    document.querySelectorAll('.widget-toggle-switch').forEach(sw => sw.classList.add('on'));
}