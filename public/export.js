// ══════════════════════════════════════════════════════════════
//  EXPORT.JS  –  Golden Goat Capital Datenexport
// ══════════════════════════════════════════════════════════════

const fmtExp = new Intl.NumberFormat(window.GGC_LOCALE||'de-DE', { style: 'currency', currency: (window.GGC_CURRENCY||'EUR') });

let _exportData        = null; // gecachte Privat-Daten
let _exportDataHaushalt = null; // gecachte Haushalt-Daten
let _exportMode        = 'privat'; // 'privat' | 'haushalt'

// ── Modus-Umschalter ─────────────────────────────────────────

async function setExportMode(mode) {
    _exportMode = mode;
    const isHaus = mode === 'haushalt';

    // Button-Klassen explizit setzen (toggle kann in manchen Browsern unzuverlässig sein)
    const btnP = document.getElementById('expModeBtnPrivat');
    const btnH = document.getElementById('expModeBtnHaushalt');
    if (btnP) {
        btnP.classList.remove('exp-mode-btn--active', 'exp-mode-btn--active-haus');
        if (!isHaus) btnP.classList.add('exp-mode-btn--active');
    }
    if (btnH) {
        btnH.classList.remove('exp-mode-btn--active', 'exp-mode-btn--active-haus');
        if (isHaus) btnH.classList.add('exp-mode-btn--active-haus');
    }

    // Banner tauschen
    const banner = document.getElementById('hausModeBanner');
    const privatBanner = document.getElementById('privatInfoBanner');
    if (banner) banner.style.display = isHaus ? 'flex' : 'none';
    if (privatBanner) privatBanner.style.display = isHaus ? 'none' : 'flex';

    // Backup-Tags tauschen
    const tagsP = document.getElementById('backupTagsPrivat');
    const tagsH = document.getElementById('backupTagsHaushalt');
    if (tagsP) tagsP.style.display = isHaus ? 'none' : '';
    if (tagsH) tagsH.style.display = isHaus ? '' : 'none';

    // Backup-Button Label
    const lbl = document.getElementById('backupBtnLabel');
    if (lbl) lbl.textContent = isHaus ? 'Haushalt-Backup (JSON)' : 'Backup herunterladen (JSON)';

    // Single-Export-Listen tauschen
    const listP = document.getElementById('singleExportList');
    const listH = document.getElementById('singleExportListHaushalt');
    if (listP) listP.style.display = isHaus ? 'none' : 'flex';
    if (listH) listH.style.display = isHaus ? 'flex' : 'none';

    // Haushalt-Daten laden wenn noch nicht gecacht
    if (isHaus && !_exportDataHaushalt) {
        await loadExportDataHaushalt();
        buildHaushaltFilters();
        buildHaushaltSingleExportList();
        buildHausMonatSelect();

        // Haushalt-Name im Banner
        const nameEl = document.getElementById('hausModeName');
        if (nameEl && _exportDataHaushalt?.haushalt_name) {
            nameEl.textContent = _exportDataHaushalt.haushalt_name;
        }
    }

    // Konto-Filter, Monat-Select und Zähler aktualisieren
    if (isHaus) {
        buildHaushaltFilters();
        buildHausMonatSelect();
        updateHausTxCount();
    } else {
        buildAccountFilter();
        buildPdfAccountFilter();
        buildMonatSelect();
        updateTxCount();
    }
}

// ── Init ─────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
    await loadExportData();
    buildAccountFilter();
    buildPdfAccountFilter();
    buildMonthSelects();
    buildMonatSelect();
    buildSingleExportList();
    updateTxCount();

    document.querySelectorAll('input[name="txFormat"]').forEach(r => {
        r.addEventListener('change', updateTxCount);
    });
    document.getElementById('txDateFrom')?.addEventListener('change', updateTxCount);
    document.getElementById('txDateTo')?.addEventListener('change',   updateTxCount);
});

// ── Daten laden ───────────────────────────────────────────────

async function loadExportData() {
    try {
        const res = await fetch('/users/export/data');
        if (!res.ok) throw new Error('HTTP ' + res.status);
        _exportData = await res.json();
    } catch (err) {
        showStatus('Fehler beim Laden der Daten: ' + err.message, true);
    }
}

async function loadExportDataHaushalt() {
    try {
        const res = await fetch('/users/export/haushalt-data');
        if (!res.ok) throw new Error('HTTP ' + res.status);
        _exportDataHaushalt = await res.json();
    } catch (err) {
        showStatus('Fehler beim Laden der Haushalt-Daten: ' + err.message, true);
        _exportDataHaushalt = { transaktionen: [], konten: [], fixkosten: [], todos: [], dokumente: [] };
    }
}

// ── Haushalt-Filter ───────────────────────────────────────────

function buildHaushaltFilters() {
    _buildAccFilterFor(
        document.getElementById('txAccountFilter'),
        _exportDataHaushalt?.konten || [],
        _exportDataHaushalt?.transaktionen || [],
        'txAccId', '#10b981', updateHausTxCount
    );
    _buildAccFilterFor(
        document.getElementById('pdfAccountFilter'),
        _exportDataHaushalt?.konten || [],
        _exportDataHaushalt?.transaktionen || [],
        'pdfAccId', '#10b981', null
    );
}

function _buildAccFilterFor(el, konten, txs, inputName, fallbackColor, onChangeFn) {
    if (!el) return;
    const fmtLocal = new Intl.NumberFormat(window.GGC_LOCALE||'de-DE', { style: 'currency', currency: (window.GGC_CURRENCY||'EUR') });
    if (!konten.length) {
        el.innerHTML = '<div style="font-size:0.8rem;color:var(--text-3);">Keine Konten vorhanden</div>';
        return;
    }
    el.innerHTML = konten.map(acc => {
        const bal = acc.currentBalance ?? acc.balance ?? 0;
        const balColor = bal >= 0 ? '#22c55e' : '#ef4444';
        const color = acc.color || fallbackColor;
        return `<label class="exp-acc-filter-item">
            <input type="checkbox" name="${inputName}" value="${acc.id}" checked
                ${onChangeFn ? `onchange="${onChangeFn.name}()"` : ''}>
            <span class="exp-acc-filter-dot" style="background:${color};"></span>
            <span class="exp-acc-filter-name">${acc.name}</span>
            <span class="exp-acc-filter-bal" style="color:${balColor};">${fmtLocal.format(bal)}</span>
        </label>`;
    }).join('');
}

function buildHausMonatSelect() {
    const sel = document.getElementById('monatSelect');
    if (!sel || !_exportDataHaushalt?.transaktionen?.length) return;
    const months = [...new Set(
        _exportDataHaushalt.transaktionen.map(t => (t.date || '').substring(0, 7)).filter(Boolean)
    )].sort().reverse();
    if (!months.length) return;
    sel.innerHTML = months.map(m => {
        const label = new Date(m + '-01').toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
        return `<option value="${m}">${label}</option>`;
    }).join('');
}

function updateHausTxCount() {
    const el = document.getElementById('txCount');
    if (!el) return;
    const filtered = getHausFilteredTx();
    el.textContent = filtered.length + ' Transaktion' + (filtered.length !== 1 ? 'en' : '') + ' im gewählten Zeitraum';
}

function getHausFilteredTx() {
    if (!_exportDataHaushalt?.transaktionen) return [];
    const from = document.getElementById('txDateFrom')?.value || '';
    const to   = document.getElementById('txDateTo')?.value   || '';
    const selectedIds = new Set([...document.querySelectorAll('input[name="txAccId"]:checked')].map(el => el.value));
    return _exportDataHaushalt.transaktionen.filter(t => {
        const m = (t.date || '').substring(0, 7);
        if (from && m < from) return false;
        if (to   && m > to)   return false;
        const accKey = t.konto_id ? String(t.konto_id) : '__unassigned__';
        if (!selectedIds.has(accKey) && !selectedIds.has(String(t.account_id))) return false;
        return true;
    });
}

// ── Haushalt Single-Export ────────────────────────────────────

const HAUSHALT_SINGLE_EXPORTS = [
    { key: 'transaktionen', name: 'Transaktionen',  icon: 'ri-exchange-2-line',   color: '#10b981', bg: 'rgba(16,185,129,0.12)', csvFn: hausTxToCsv },
    { key: 'konten',        name: 'Konten',          icon: 'ri-bank-card-line',    color: '#3b82f6', bg: 'rgba(59,130,246,0.12)', csvFn: hausKontenToCsv },
    { key: 'fixkosten',     name: 'Fixkosten',       icon: 'ri-repeat-line',       color: '#f59e0b', bg: 'rgba(245,158,11,0.12)', csvFn: hausFixkostenToCsv },
    { key: 'todos',         name: 'Aufgaben',        icon: 'ri-checkbox-line',     color: '#22c55e', bg: 'rgba(34,197,94,0.12)',  csvFn: hausTodosToCsv },
    { key: 'dokumente',     name: 'Dokumente',       icon: 'ri-file-line',         color: '#94a3b8', bg: 'rgba(148,163,184,0.12)',csvFn: dokumenteToCsv },
];

function buildHaushaltSingleExportList() {
    const el = document.getElementById('singleExportListHaushalt');
    if (!el) return;
    el.innerHTML = HAUSHALT_SINGLE_EXPORTS.map(exp => {
        const count = _exportDataHaushalt?.[exp.key]?.length ?? 0;
        return `<div class="exp-single-row">
            <div class="exp-single-left">
                <div class="exp-single-icon" style="background:${exp.bg};color:${exp.color};">
                    <i class="${exp.icon}"></i>
                </div>
                <div>
                    <div class="exp-single-name">${exp.name}</div>
                    <div class="exp-single-count">${count} Eintr${count !== 1 ? 'äge' : 'ag'}</div>
                </div>
            </div>
            <div class="exp-single-btns">
                <button class="exp-dl-btn" onclick="exportHausSingle('${exp.key}', 'csv')">
                    <i class="ri-file-excel-2-line"></i> CSV
                </button>
                <button class="exp-dl-btn" onclick="exportHausSingle('${exp.key}', 'json')">
                    <i class="ri-braces-line"></i> JSON
                </button>
            </div>
        </div>`;
    }).join('');
}

function exportHausSingle(key, format) {
    const exp  = HAUSHALT_SINGLE_EXPORTS.find(e => e.key === key);
    const data = _exportDataHaushalt?.[key];
    if (!exp || !data) { showStatus('Keine Daten vorhanden.', true); return; }
    const fname = 'haushalt_' + key + '_' + dateStamp();
    if (format === 'csv') downloadCSV(exp.csvFn(data), fname + '.csv');
    else downloadJSON({ exportiert_am: new Date().toISOString(), [key]: data }, fname + '.json');
    showStatus(data.length + ' ' + exp.name + '-Einträge exportiert.', false);
}

// ── Haushalt CSV-Konverter ────────────────────────────────────

function hausTxToCsv(rows) {
    const h = ['ID', 'Name', 'Kategorie', 'Betrag', 'Typ', 'Datum', 'Konto-ID', 'Eingetragen von'];
    const r = rows.map(t => [t.id, csvEsc(t.name), csvEsc(t.category), str(t.amount),
        csvEsc(t.type), t.date || '', t.konto_id || '', csvEsc(t.eingetragen_von_name || '')]);
    return toCsv(h, r);
}

function hausKontenToCsv(rows) {
    const h = ['ID', 'Name', 'Startguthaben', 'Aktueller Stand', 'Farbe'];
    const r = rows.map(k => [k.id, csvEsc(k.name), str(k.balance), str(k.currentBalance ?? k.balance), csvEsc(k.color)]);
    return toCsv(h, r);
}

function hausFixkostenToCsv(rows) {
    const h = ['ID', 'Name', 'Betrag', 'Kategorie', 'Aktiv'];
    const r = rows.map(f => [f.id, csvEsc(f.name), str(f.betrag), csvEsc(f.kategorie || ''), f.aktiv ? 'Ja' : 'Nein']);
    return toCsv(h, r);
}

function hausTodosToCsv(rows) {
    const h = ['ID', 'Aufgabe', 'Priorität', 'Fälligkeit', 'Erledigt', 'Label'];
    const r = rows.map(t => [t.id, csvEsc(t.task), csvEsc(t.priority), t.due_date || '',
        t.completed ? 'Ja' : 'Nein', csvEsc(t.label || '')]);
    return toCsv(h, r);
}

// ── Konto-Filter aufbauen ─────────────────────────────────────

function buildAccountFilter() {
    const el = document.getElementById('txAccountFilter');
    if (!el) return;

    const konten = _exportData?.konten || [];
    if (!konten.length) {
        el.innerHTML = '<div style="font-size:0.8rem;color:var(--text-3);">Keine Konten vorhanden</div>';
        return;
    }

    const fmtLocal = new Intl.NumberFormat(window.GGC_LOCALE||'de-DE', { style: 'currency', currency: (window.GGC_CURRENCY||'EUR') });

    el.innerHTML = konten.map(acc => {
        const bal = acc.currentBalance ?? acc.balance ?? 0;
        const balColor = bal >= 0 ? '#22c55e' : '#ef4444';
        return `<label class="exp-acc-filter-item">
            <input type="checkbox" name="txAccId" value="${acc.id}" checked
                onchange="updateTxCount()">
            <span class="exp-acc-filter-dot" style="background:${acc.color || '#6358e6'};"></span>
            <span class="exp-acc-filter-name">${acc.name}</span>
            <span class="exp-acc-filter-bal" style="color:${balColor};">${fmtLocal.format(bal)}</span>
        </label>`;
    }).join('');

    // "Ohne Konto" Option — wenn es Transaktionen ohne Konto gibt
    const hasUnassigned = (_exportData?.transaktionen || []).some(t => !t.account_id);
    if (hasUnassigned) {
        el.innerHTML += `<label class="exp-acc-filter-item">
            <input type="checkbox" name="txAccId" value="__unassigned__" checked
                onchange="updateTxCount()">
            <span class="exp-acc-filter-dot" style="background:#94a3b8;"></span>
            <span class="exp-acc-filter-name">Ohne Konto</span>
            <span class="exp-acc-filter-bal" style="color:var(--text-3);">–</span>
        </label>`;
    }
}

function getSelectedTxAccountIds() {
    const checked = document.querySelectorAll('input[name="txAccId"]:checked');
    return new Set([...checked].map(el => el.value));
}

function selectAllTxAccounts() {
    document.querySelectorAll('input[name="txAccId"]').forEach(el => el.checked = true);
    updateTxCount();
}

function selectNoneTxAccounts() {
    document.querySelectorAll('input[name="txAccId"]').forEach(el => el.checked = false);
    updateTxCount();
}

function selectAllPdfAccounts() {
    document.querySelectorAll('input[name="pdfAccId"]').forEach(el => el.checked = true);
}
function selectNonePdfAccounts() {
    document.querySelectorAll('input[name="pdfAccId"]').forEach(el => el.checked = false);
}

function buildPdfAccountFilter() {
    const el = document.getElementById('pdfAccountFilter');
    if (!el) return;
    const konten = _exportData?.konten || [];
    if (!konten.length) { el.innerHTML = '<div style="font-size:0.8rem;color:var(--text-3);">Keine Konten vorhanden</div>'; return; }
    const fmtLocal = new Intl.NumberFormat(window.GGC_LOCALE||'de-DE', { style: 'currency', currency: (window.GGC_CURRENCY||'EUR') });
    el.innerHTML = konten.map(acc => {
        const bal = acc.currentBalance ?? acc.balance ?? 0;
        const balColor = bal >= 0 ? '#22c55e' : '#ef4444';
        return `<label class="exp-acc-filter-item">
            <input type="checkbox" name="pdfAccId" value="${acc.id}" checked onchange="">
            <span class="exp-acc-filter-dot" style="background:${acc.color || '#6358e6'};"></span>
            <span class="exp-acc-filter-name">${acc.name}</span>
            <span class="exp-acc-filter-bal" style="color:${balColor};">${fmtLocal.format(bal)}</span>
        </label>`;
    }).join('');
    const hasUnassigned = (_exportData?.transaktionen || []).some(t => !t.account_id);
    if (hasUnassigned) {
        el.innerHTML += `<label class="exp-acc-filter-item">
            <input type="checkbox" name="pdfAccId" value="__unassigned__" checked onchange="">
            <span class="exp-acc-filter-dot" style="background:#94a3b8;"></span>
            <span class="exp-acc-filter-name">Ohne Konto</span>
            <span class="exp-acc-filter-bal" style="color:var(--text-3);">–</span>
        </label>`;
    }
}

function buildMonatSelect() {
    const sel = document.getElementById('monatSelect');
    if (!sel || !_exportData?.transaktionen?.length) return;
    const months = [...new Set(
        _exportData.transaktionen.map(t => (t.date || '').substring(0, 7)).filter(Boolean)
    )].sort().reverse();
    sel.innerHTML = months.map(m => {
        const label = new Date(m + '-01').toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
        return `<option value="${m}">${label}</option>`;
    }).join('');
}

// ── Hilfsfunktionen (Week) ────────────────────────────────────

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

// ── PDF Export (Haupt-Bericht) ────────────────────────────────

async function exportPDF() {
    const { jsPDF } = window.jspdf;
    if (!jsPDF) { showStatus('PDF-Bibliothek wird geladen, bitte kurz warten.', true); return; }

    const chartTypes = [...document.querySelectorAll('input[name="pdfChartType"]:checked')].map(el => el.value);
    if (chartTypes.length === 0) chartTypes.push('bar');
    const groupBy    = document.querySelector('input[name="pdfGroupBy"]:checked')?.value || 'month';
    const showGesamt = document.getElementById('pdfShowGesamt')?.checked ?? true;

    const checkedAccIds      = [...document.querySelectorAll('input[name="pdfAccId"]:checked')].map(el => el.value);
    const includeUnassigned  = checkedAccIds.includes('__unassigned__');
    const selectedAccIds     = new Set(checkedAccIds.filter(v => v !== '__unassigned__'));

    const activeData = _exportMode === 'haushalt' ? _exportDataHaushalt : _exportData;
    const allTx     = activeData?.transaktionen || [];
    const allKonten = activeData?.konten || [];

    const filtered = allTx.filter(t => {
        // Haushalt-Transaktionen nutzen konto_id statt account_id
        const accKey = (t.account_id ?? t.konto_id) ? String(t.account_id ?? t.konto_id) : '__unassigned__';
        return checkedAccIds.includes(accKey) || (checkedAccIds.length === 0);
    });

    if (filtered.length === 0) { showStatus('Keine Transaktionen für die Auswahl.', true); return; }

    const accountsToExport = allKonten.filter(a => selectedAccIds.has(String(a.id)));
    const unassignedTx     = includeUnassigned ? allTx.filter(t => !t.account_id) : [];

    // ─── Designkonstanten ──────────────────────────────────────
    const fmtEur  = v => new Intl.NumberFormat(window.GGC_LOCALE||'de-DE', { style: 'currency', currency: (window.GGC_CURRENCY||'EUR') }).format(v);
    const fmtDate = s => s ? new Date(s).toLocaleDateString('de-DE') : '';

    const W = 210, H = 297, M = 16;
    const white      = [255, 255, 255];
    const pagesBg    = [250, 251, 253];
    const navy       = [17,  24,  39];
    const accentBlue = [37,  99, 235];
    const slate      = [107, 114, 128];
    const lineGrey   = [229, 231, 235];
    const rowAlt     = [249, 250, 251];
    const inkDark    = [17,  24,  39];
    const inkMid     = [75,  85,  99];
    const greenInk   = [21, 128,  61];
    const redInk     = [185,  28,  28];
    const greenBg    = [240, 253, 244];
    const redBg      = [254, 242, 242];

    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

    const filterDesc = _exportMode === 'haushalt'
        ? ('Haushalt · ' + (_exportDataHaushalt?.haushalt_name || ''))
        : 'Alle Transaktionen';

    function paintBg() { doc.setFillColor(...pagesBg); doc.rect(0, 0, W, H, 'F'); }

    function drawHeader(opts) {
        paintBg();
        doc.setFillColor(...white); doc.rect(0, 0, W, 44, 'F');
        doc.setFillColor(...accentBlue); doc.rect(0, 43, W, 1, 'F');
        doc.setTextColor(...navy);
        doc.setFontSize(13); doc.setFont('helvetica', 'bold');
        doc.text('Golden Goat Capital', M, 13);
        doc.setFontSize(7.5); doc.setFont('helvetica', 'normal');
        doc.setTextColor(...slate);
        doc.text('Finanzbericht · ' + filterDesc, M, 20);
        doc.text('Erstellt am ' + new Date().toLocaleDateString('de-DE'), M, 26);
        if (opts.type === 'account' && opts.account) {
            const acc = opts.account;
            const ATYPES = { girokonto:'Girokonto', sparkonto:'Sparkonto', haushaltskonto:'Haushaltskonto', bargeld:'Bargeld', depot:'Depot', sonstiges:'Sonstiges' };
            const bal = acc.currentBalance ?? acc.balance ?? 0;
            doc.setFillColor(...hexToRgb(acc.color || '#6358e6'));
            doc.circle(W - M - 2, 11, 2, 'F');
            doc.setTextColor(...navy); doc.setFontSize(11); doc.setFont('helvetica', 'bold');
            doc.text(acc.name, W - M - 6, 13, { align: 'right' });
            doc.setFontSize(7.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(...slate);
            doc.text(ATYPES[acc.type] || acc.type, W - M, 20, { align: 'right' });
            doc.setFontSize(11); doc.setFont('helvetica', 'bold');
            doc.setTextColor(...(bal >= 0 ? greenInk : redInk));
            doc.text(fmtEur(bal), W - M, 29, { align: 'right' });
            doc.setFontSize(6.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(...slate);
            doc.text('Aktueller Kontostand', W - M, 35, { align: 'right' });
        } else if (opts.type === 'gesamt') {
            doc.setTextColor(...navy); doc.setFontSize(11); doc.setFont('helvetica', 'bold');
            doc.text('Gesamtübersicht', W - M, 13, { align: 'right' });
            doc.setFontSize(7.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(...slate);
            doc.text(accountsToExport.length + ' Konto' + (accountsToExport.length !== 1 ? 'en' : ''), W - M, 20, { align: 'right' });
        } else if (opts.type === 'sonstige') {
            doc.setTextColor(...navy); doc.setFontSize(11); doc.setFont('helvetica', 'bold');
            doc.text('Sonstige Transaktionen', W - M, 13, { align: 'right' });
            doc.setFontSize(7.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(...slate);
            doc.text('Ohne Kontozuordnung', W - M, 20, { align: 'right' });
        }
        doc.setTextColor(...slate); doc.setFontSize(7); doc.setFont('helvetica', 'normal');
        doc.text('Seite ' + opts.localPage, W - M, 39, { align: 'right' });
    }

    function drawFooter() {
        doc.setFillColor(...white); doc.rect(0, H - 14, W, 14, 'F');
        doc.setFillColor(...accentBlue); doc.rect(0, H - 14, W, 0.7, 'F');
        doc.setTextColor(...slate); doc.setFontSize(6.5); doc.setFont('helvetica', 'normal');
        doc.text('Golden Goat Capital · Vertraulich', M, H - 5);
        doc.text(new Date().toLocaleDateString('de-DE'), W - M, H - 5, { align: 'right' });
    }

    function addTxPage(headerOpts) {
        doc.addPage(); drawHeader(headerOpts); drawFooter();
        doc.setFillColor(239, 246, 255); doc.rect(0, 44, W, 7, 'F');
        doc.setTextColor(...accentBlue); doc.setFontSize(6.5); doc.setFont('helvetica', 'bold');
        const lbl = headerOpts.account ? headerOpts.account.name : (headerOpts.type === 'gesamt' ? 'Gesamtübersicht' : 'Sonstige Transaktionen');
        doc.text('TRANSAKTIONEN · ' + lbl.toUpperCase() + ' · Seite ' + headerOpts.localPage, W / 2, 49, { align: 'center' });
        return 54;
    }

    function hexToRgb(hex) {
        return [parseInt(hex.slice(1,3),16), parseInt(hex.slice(3,5),16), parseInt(hex.slice(5,7),16)];
    }

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
            doc.setFillColor(...t.bg); doc.roundedRect(x, y, tW, 19, 1.5, 1.5, 'F');
            doc.setDrawColor(...lineGrey); doc.setLineWidth(0.25); doc.roundedRect(x, y, tW, 19, 1.5, 1.5, 'S');
            doc.setFillColor(...t.col); doc.roundedRect(x, y, tW, 2, 1, 1, 'F');
            doc.setTextColor(...t.col); doc.setFontSize(9.5); doc.setFont('helvetica', 'bold');
            doc.text(t.val, x + tW/2, y + 11.5, { align:'center' });
            doc.setTextColor(...inkMid); doc.setFontSize(6); doc.setFont('helvetica', 'normal');
            doc.text(t.label, x + tW/2, y + 16.5, { align:'center' });
        });
        return y + 23;
    }

    async function renderChart(txList, cType, mmW, mmH) {
        return new Promise(resolve => {
            if (!txList.length) { resolve(null); return; }
            const CW = 1200, CH = Math.round(CW * (mmH / mmW));
            const canvas = document.createElement('canvas');
            canvas.width = CW; canvas.height = CH;
            canvas.style.cssText = 'position:absolute;left:-9999px;top:-9999px;';
            document.body.appendChild(canvas);
            const ctx = canvas.getContext('2d');
            const kfn = groupBy==='day' ? t=>t.date?.substring(0,10) : groupBy==='week' ? t=>getWeekKey(new Date(t.date?.substring(0,10))) : t=>t.date?.substring(0,7);
            const lfn = groupBy==='day' ? k=>new Date(k).toLocaleDateString('de-DE',{day:'2-digit',month:'short'}) : groupBy==='week' ? k=>'KW '+parseInt(k.split('-W')[1]) : k=>new Date(k+'-01').toLocaleDateString('de-DE',{month:'short',year:'numeric'});
            const isDoughnut = cType === 'doughnut';
            let labels, datasets;
            if (isDoughnut) {
                const catMap = {};
                txList.filter(t=>t.type==='Ausgaben').forEach(t => { catMap[t.category] = (catMap[t.category]||0) + t.amount; });
                const totalExp = Object.values(catMap).reduce((s,v)=>s+v, 0);
                const ck = Object.keys(catMap).sort((a,b)=>catMap[b]-catMap[a]);
                const cols = ['#1d4ed8','#dc2626','#d97706','#16a34a','#7c3aed','#0891b2','#db2777','#ea580c','#65a30d','#0369a1'];
                labels   = ck.map(c => c + '  ' + (totalExp>0 ? (catMap[c]/totalExp*100).toFixed(1) : '0.0') + '%');
                datasets = [{ data: ck.map(c=>catMap[c]), backgroundColor: ck.map((_,i)=>cols[i%cols.length]), borderWidth: 3, borderColor: '#ffffff' }];
            } else {
                const g = {};
                txList.forEach(t => { const k = kfn(t); if (!g[k]) g[k]={income:0,expense:0}; if (t.type==='Einnahmen') g[k].income+=t.amount; else g[k].expense+=t.amount; });
                const sk = Object.keys(g).sort();
                labels = sk.map(lfn);
                const isLine = cType === 'line';
                datasets = [
                    { label:'Einnahmen', data:sk.map(k=>g[k].income), backgroundColor: isLine ? 'rgba(21,128,61,0.12)' : 'rgba(21,128,61,0.85)', borderColor:'#15803d', borderWidth:isLine?3:0, fill:isLine, tension:0.35, pointBackgroundColor:'#15803d', pointBorderColor:'#fff', pointBorderWidth:2, pointRadius:isLine?5:0, borderRadius:isLine?0:5, borderSkipped:false },
                    { label:'Ausgaben',  data:sk.map(k=>g[k].expense), backgroundColor: isLine ? 'rgba(185,28,28,0.12)' : 'rgba(185,28,28,0.85)', borderColor:'#b91c1c', borderWidth:isLine?3:0, fill:isLine, tension:0.35, pointBackgroundColor:'#b91c1c', pointBorderColor:'#fff', pointBorderWidth:2, pointRadius:isLine?5:0, borderRadius:isLine?0:5, borderSkipped:false }
                ];
            }
            const FS_TICK = Math.round(CW * 0.022), FS_LEGEND = Math.round(CW * 0.025), FS_DLEG = Math.round(CW * 0.019);
            const fmtShort = v => { if (v>=1000000) return (v/1000000).toFixed(1).replace('.',',')+' Mio€'; if (v>=1000) return (v/1000).toFixed(v%1000===0?0:1).replace('.',',')+' k€'; return v.toLocaleString('de-DE')+'€'; };
            const bgPlugin = { id:'whitebg', beforeDraw(ch) { const c=ch.ctx; c.save(); c.fillStyle='#f9fafb'; c.fillRect(0,0,CW,CH); c.fillStyle='#ffffff'; c.beginPath(); c.roundRect(10,10,CW-20,CH-20,14); c.fill(); c.restore(); } };
            const ch = new Chart(ctx, {
                type: isDoughnut ? 'doughnut' : cType,
                data: { labels, datasets },
                options: {
                    responsive: false, animation: false,
                    layout: { padding: { top:28, right:28, bottom:20, left:20 } },
                    plugins: { legend: { position: isDoughnut ? 'right' : 'bottom', labels: { color:'#1f2937', font:{ size:isDoughnut?FS_DLEG:FS_LEGEND, family:'Arial, sans-serif', weight:'500' }, boxWidth:isDoughnut?20:22, boxHeight:isDoughnut?20:16, padding:isDoughnut?16:26, usePointStyle:!isDoughnut, pointStyleWidth:22 } }, tooltip: { enabled: false } },
                    scales: isDoughnut ? {} : { y: { beginAtZero:true, grid:{color:'rgba(0,0,0,0.06)',lineWidth:1.5}, border:{display:false}, ticks:{color:'#4b5563',font:{size:FS_TICK,family:'Arial, sans-serif'},callback:v=>fmtShort(v),maxTicksLimit:6,padding:10} }, x: { grid:{display:false}, border:{display:false}, ticks:{color:'#4b5563',font:{size:FS_TICK,family:'Arial, sans-serif'},maxRotation:0,maxTicksLimit:12,padding:8} } }
                },
                plugins: [bgPlugin]
            });
            setTimeout(() => { const img = canvas.toDataURL('image/png', 1.0); ch.destroy(); document.body.removeChild(canvas); resolve(img); }, 400);
        });
    }

    async function drawOverviewPage(txList, headerOpts) {
        drawHeader(headerOpts); drawFooter();
        let y = 49;
        doc.setTextColor(...slate); doc.setFontSize(6.5); doc.setFont('helvetica', 'bold');
        doc.text('ZUSAMMENFASSUNG', M, y); y += 5;
        y = drawSummaryKacheln(txList, y); y += 5;
        doc.setDrawColor(...lineGrey); doc.setLineWidth(0.3); doc.line(M, y, W-M, y); y += 5;
        doc.setTextColor(...slate); doc.setFontSize(6.5); doc.setFont('helvetica', 'bold');
        doc.text('AUSWERTUNG', M, y); y += 4;
        const CHART_H = 47, CHART_GAP = 4, cW = W - M*2;
        if (txList.length > 0) {
            for (const cType of chartTypes) {
                const img = await renderChart(txList, cType, cW, CHART_H);
                if (img) {
                    doc.setFillColor(...white); doc.setDrawColor(...lineGrey); doc.setLineWidth(0.25);
                    doc.roundedRect(M, y, cW, CHART_H, 2, 2, 'FD');
                    doc.addImage(img, 'PNG', M + 1, y + 1, cW - 2, CHART_H - 2);
                    y += CHART_H + CHART_GAP;
                }
            }
        }
    }

    function groupTx(txList) {
        const g = {};
        txList.forEach(t => {
            let k = groupBy==='day' ? (t.date?.substring(0,10)||'?') : groupBy==='week' ? getWeekKey(new Date(t.date?.substring(0,10))) : (t.date?.substring(0,7)||'?');
            if (!g[k]) g[k]=[];
            g[k].push(t);
        });
        return g;
    }

    async function drawTransactionPages(txList, headerOpts) {
        let localPage = headerOpts.localPage;
        let y = addTxPage({ ...headerOpts, localPage });
        const grouped = groupTx(txList);
        const keys = Object.keys(grouped).sort();
        const colX = { date:M+2, name:M+24, cat:M+91, konto:M+132, amt:W-M-2 };

        for (const key of keys) {
            if (y > H - 46) { localPage++; y = addTxPage({ ...headerOpts, localPage }); }
            let grpLabel = key;
            if (groupBy==='month') grpLabel = new Date(key+'-01').toLocaleDateString('de-DE',{month:'long',year:'numeric'});
            else if (groupBy==='week') grpLabel = 'KW ' + parseInt(key.split('-W')[1]) + ' · ' + key.split('-W')[0];
            else grpLabel = fmtDate(key);
            const gInc = grouped[key].filter(t=>t.type==='Einnahmen').reduce((s,t)=>s+t.amount,0);
            const gExp = grouped[key].filter(t=>t.type==='Ausgaben').reduce((s,t)=>s+t.amount,0);
            const gNet = gInc - gExp;
            const grpH = 13;
            doc.setFillColor(239, 246, 255); doc.rect(M, y, W-M*2, grpH, 'F');
            doc.setDrawColor(196, 219, 255); doc.setLineWidth(0.25); doc.rect(M, y, W-M*2, grpH, 'S');
            doc.setFillColor(...accentBlue); doc.rect(M, y, 2.5, grpH, 'F');
            doc.setTextColor(...navy); doc.setFontSize(7.5); doc.setFont('helvetica', 'bold');
            doc.text(grpLabel, M + 5, y + 5);
            doc.setFontSize(6); doc.setFont('helvetica', 'normal');
            const rX = W - M - 3;
            const netColor = gNet >= 0 ? greenInk : redInk;
            const netVal = (gNet>=0?'+':'') + fmtEur(gNet);
            doc.setTextColor(...netColor); doc.text(netVal, rX, y + 10.5, { align:'right' });
            const netValW = doc.getTextWidth(netVal);
            doc.setTextColor(...inkMid); doc.text('Saldo: ', rX - netValW, y + 10.5, { align:'right' });
            const netTotalW = doc.getTextWidth('Saldo: ') + netValW + 8;
            const expVal = fmtEur(gExp);
            doc.setTextColor(...redInk); doc.text(expVal, rX - netTotalW, y + 10.5, { align:'right' });
            const expValW = doc.getTextWidth(expVal);
            doc.setTextColor(...inkMid); doc.text('Ausgaben: ', rX - netTotalW - expValW, y + 10.5, { align:'right' });
            const expTotalW = doc.getTextWidth('Ausgaben: ') + expValW + 8;
            const incVal = fmtEur(gInc);
            doc.setTextColor(...greenInk); doc.text(incVal, rX - netTotalW - expTotalW, y + 10.5, { align:'right' });
            doc.setTextColor(...inkMid); doc.text('Einnahmen: ', rX - netTotalW - expTotalW - doc.getTextWidth(incVal), y + 10.5, { align:'right' });
            y += grpH + 1.5;
            doc.setFillColor(243, 244, 246); doc.rect(M, y, W-M*2, 5.5, 'F');
            doc.setTextColor(...inkMid); doc.setFontSize(5.5); doc.setFont('helvetica', 'bold');
            doc.text('DATUM', colX.date, y + 3.8); doc.text('BEZEICHNUNG', colX.name, y + 3.8);
            doc.text('KATEGORIE', colX.cat, y + 3.8); doc.text('KONTO', colX.konto, y + 3.8);
            doc.text('BETRAG', colX.amt, y + 3.8, { align:'right' });
            y += 6.5;
            for (let ri = 0; ri < grouped[key].length; ri++) {
                if (y > H - 20) { localPage++; y = addTxPage({ ...headerOpts, localPage }); }
                const t = grouped[key][ri];
                const isInc = t.type === 'Einnahmen';
                const rowH = 6;
                doc.setFillColor(...(ri % 2 === 0 ? white : rowAlt)); doc.rect(M, y, W-M*2, rowH, 'F');
                doc.setFontSize(6.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(...inkDark);
                doc.text(fmtDate(t.date?.substring(0,10)), colX.date, y + 4);
                const nm = (t.name||'').length > 34 ? t.name.substring(0,32)+'…' : (t.name||'');
                doc.text(nm, colX.name, y + 4);
                doc.setTextColor(...inkMid);
                const cat = (t.category||'').length > 18 ? t.category.substring(0,16)+'…' : (t.category||'');
                doc.text(cat, colX.cat, y + 4);
                const accName = t.account_id ? (allKonten.find(a=>String(a.id)===String(t.account_id))?.name || '—') : 'Ohne Konto';
                doc.text(accName.length>16 ? accName.substring(0,14)+'…' : accName, colX.konto, y + 4);
                doc.setTextColor(...(isInc ? greenInk : redInk)); doc.setFont('helvetica', 'bold');
                doc.text((isInc ? '+' : '-') + fmtEur(t.amount), colX.amt, y + 4, { align:'right' });
                y += rowH;
            }
            doc.setDrawColor(...lineGrey); doc.setLineWidth(0.2); doc.line(M, y + 0.5, W-M, y + 0.5); y += 4;
        }
    }

    // ─── Hauptlogik ─────────────────────────────────────────────
    let isFirst = true;
    for (const acc of accountsToExport) {
        const accTx = filtered.filter(t => String(t.account_id) === String(acc.id));
        if (!accTx.length) continue;
        if (!isFirst) doc.addPage(); isFirst = false;
        const hOpts = { type:'account', account:acc, localPage:1 };
        await drawOverviewPage(accTx, hOpts);
        await drawTransactionPages(accTx, { ...hOpts, localPage:2 });
    }
    if (unassignedTx.length > 0) {
        if (!isFirst) doc.addPage(); isFirst = false;
        const hOpts = { type:'sonstige', localPage:1 };
        drawHeader(hOpts); drawFooter();
        await drawTransactionPages(unassignedTx, { ...hOpts, localPage:2 });
    }
    if (showGesamt && accountsToExport.length > 0) {
        if (!isFirst) doc.addPage();
        const gesamtTx = filtered;
        const hOpts = { type:'gesamt', localPage:1 };
        await drawOverviewPage(gesamtTx, hOpts);
        await drawTransactionPages(gesamtTx, { ...hOpts, localPage:2 });
    }

    doc.save((_exportMode === 'haushalt' ? 'haushalt_export_' : 'ausgaben_export_') + dateStamp() + '.pdf');
    showStatus('PDF erfolgreich erstellt.', false);
}

// ── Monatsanalyse PDF ─────────────────────────────────────────

async function exportMonatsanalyse() {
    const { jsPDF } = window.jspdf;
    if (!jsPDF) { showStatus('PDF-Bibliothek wird geladen, bitte kurz warten.', true); return; }

    const monat     = document.getElementById('monatSelect')?.value;
    const chartType = document.querySelector('input[name="monatChartType"]:checked')?.value || 'bar';
    if (!monat) { showStatus('Bitte einen Monat auswählen.', true); return; }

    const allTx     = (_exportMode === 'haushalt' ? _exportDataHaushalt : _exportData)?.transaktionen || [];
    const monatTxs  = allTx.filter(t => (t.date || '').startsWith(monat));
    const monatLabel = new Date(monat + '-01').toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });

    if (monatTxs.length === 0) { showStatus('Keine Transaktionen für ' + monatLabel + '.', true); return; }

    const W = 210, H = 297, M = 16;
    const navy       = [15,  30,  70];
    const accentBlue = [37,  99, 235];
    const white      = [255, 255, 255];
    const lineGrey   = [226, 232, 240];
    const rowAlt     = [248, 250, 252];
    const inkDark    = [30,  41,  59];
    const inkMid     = [71,  85, 105];
    const greenInk   = [22, 163,  74];
    const redInk     = [220,  38,  38];
    const greenBg    = [220, 252, 231];
    const redBg      = [254, 226, 226];

    const fmtEur  = v => new Intl.NumberFormat(window.GGC_LOCALE||'de-DE', { style: 'currency', currency: (window.GGC_CURRENCY||'EUR') }).format(v);
    const fmtDate = s => s ? new Date(s).toLocaleDateString('de-DE') : '';

    const totalInc = monatTxs.filter(t => t.type === 'Einnahmen').reduce((s, t) => s + t.amount, 0);
    const totalExp = monatTxs.filter(t => t.type === 'Ausgaben').reduce((s, t) => s + t.amount, 0);
    const net      = totalInc - totalExp;
    const byKat    = {};
    monatTxs.filter(t => t.type === 'Ausgaben').forEach(t => { const k = t.category || 'Sonstiges'; byKat[k] = (byKat[k] || 0) + t.amount; });
    const topKats  = Object.entries(byKat).sort((a, b) => b[1] - a[1]);
    const byDay    = {};
    monatTxs.forEach(t => { const d = (t.date || '').substring(0, 10); if (!byDay[d]) byDay[d] = { inc: 0, exp: 0 }; if (t.type === 'Einnahmen') byDay[d].inc += t.amount; else byDay[d].exp += t.amount; });
    const dayKeys   = Object.keys(byDay).sort();
    const dayLabels = dayKeys.map(d => new Date(d).toLocaleDateString('de-DE', { day: '2-digit', month: 'short' }));

    async function renderMonatChart() {
        return new Promise(resolve => {
            const canvas = document.createElement('canvas');
            canvas.width = 900; canvas.height = 320;
            canvas.style.cssText = 'position:absolute;left:-9999px;';
            document.body.appendChild(canvas);
            const isDoughnut = chartType === 'doughnut', isLine = chartType === 'line';
            const colors = ['#6358e6','#ef4444','#f59e0b','#22c55e','#3b82f6','#ec4899','#14b8a6','#a855f7'];
            let datasets, labels;
            if (isDoughnut) {
                labels = topKats.map(([k]) => k);
                datasets = [{ label: 'Ausgaben', data: topKats.map(([, v]) => v), backgroundColor: labels.map((_, i) => colors[i % colors.length]), borderWidth: 2, borderColor: '#fff' }];
            } else {
                labels = dayLabels;
                datasets = [
                    { label: 'Einnahmen', data: dayKeys.map(k => byDay[k].inc), backgroundColor: isLine ? 'rgba(34,197,94,0.12)' : 'rgba(34,197,94,0.75)', borderColor: '#16a34a', borderWidth: 2, fill: isLine, tension: 0.35, pointRadius: isLine ? 3 : 0, borderRadius: 4 },
                    { label: 'Ausgaben',  data: dayKeys.map(k => byDay[k].exp), backgroundColor: isLine ? 'rgba(220,38,38,0.12)' : 'rgba(220,38,38,0.75)',  borderColor: '#dc2626', borderWidth: 2, fill: isLine, tension: 0.35, pointRadius: isLine ? 3 : 0, borderRadius: 4 }
                ];
            }
            const bgPlugin = { id: 'bg', beforeDraw(ch) { const c = ch.ctx; c.save(); c.fillStyle = '#ffffff'; c.fillRect(0,0,ch.width,ch.height); c.restore(); } };
            const ch = new Chart(canvas.getContext('2d'), {
                type: isDoughnut ? 'doughnut' : chartType, data: { labels, datasets },
                options: { responsive: false, animation: false, plugins: { legend: { labels: { color: '#475569', font: { size: 12, family: 'helvetica' } } } }, scales: isDoughnut ? {} : { y: { ticks: { color: '#64748b', callback: v => v + ' €', font: { size: 10 } }, grid: { color: 'rgba(0,0,0,0.06)' } }, x: { ticks: { color: '#64748b', font: { size: 10 }, maxRotation: 45 }, grid: { color: 'rgba(0,0,0,0.04)' } } } },
                plugins: [bgPlugin]
            });
            setTimeout(() => { const img = canvas.toDataURL('image/png'); ch.destroy(); document.body.removeChild(canvas); resolve(img); }, 300);
        });
    }

    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    doc.setFillColor(252, 252, 254); doc.rect(0, 0, W, H, 'F');
    doc.setFillColor(...accentBlue); doc.rect(0, 0, W, 38, 'F');
    doc.setTextColor(...white); doc.setFontSize(18); doc.setFont('helvetica', 'bold');
    doc.text('Monatsanalyse', M, 16);
    doc.setFontSize(11); doc.setFont('helvetica', 'normal'); doc.text(monatLabel, M, 25);
    doc.setFontSize(8); doc.text('Golden Goat Capital  ·  Erstellt am ' + new Date().toLocaleDateString('de-DE'), M, 33);

    let y = 46;
    const tileW = (W - M * 2 - 10) / 3;
    const tiles = [
        { label: 'EINNAHMEN', val: fmtEur(totalInc), col: greenInk, bg: greenBg },
        { label: 'AUSGABEN',  val: fmtEur(totalExp), col: redInk,   bg: redBg   },
        { label: 'SALDO',     val: (net>=0?'+':'') + fmtEur(net), col: net>=0?greenInk:redInk, bg: net>=0?greenBg:redBg },
    ];
    tiles.forEach((tile, i) => {
        const x = M + i * (tileW + 5);
        doc.setFillColor(...tile.bg); doc.roundedRect(x, y, tileW, 22, 2, 2, 'F');
        doc.setTextColor(...tile.col); doc.setFontSize(7); doc.setFont('helvetica', 'bold');
        doc.text(tile.label, x + 4, y + 6);
        doc.setFontSize(13); doc.setFont('helvetica', 'bold');
        doc.text(tile.val, x + 4, y + 16);
    });
    y += 28;

    doc.setFillColor(...white); doc.setDrawColor(...lineGrey); doc.setLineWidth(0.3);
    doc.roundedRect(M, y, W - M*2, 62, 2, 2, 'FD');
    doc.setTextColor(...navy); doc.setFontSize(9); doc.setFont('helvetica', 'bold');
    doc.text('Einnahmen & Ausgaben im ' + monatLabel, M + 4, y + 6);
    const chartImg = await renderMonatChart();
    if (chartImg) doc.addImage(chartImg, 'PNG', M + 1, y + 8, W - M*2 - 2, 52);
    y += 68;

    if (topKats.length > 0) {
        doc.setTextColor(...navy); doc.setFontSize(9); doc.setFont('helvetica', 'bold');
        doc.text('Ausgaben nach Kategorie', M, y + 1); y += 6;
        const barW = W - M*2 - 60;
        const colors = ['#6358e6','#ef4444','#f59e0b','#22c55e','#3b82f6','#ec4899'];
        topKats.slice(0, 8).forEach(([kat, val], i) => {
            if (y > H - 30) return;
            const pct = totalExp > 0 ? val / totalExp : 0;
            const filled = barW * pct;
            doc.setTextColor(...inkDark); doc.setFontSize(7.5); doc.setFont('helvetica', 'normal');
            doc.text(kat.length > 22 ? kat.substring(0, 20) + '…' : kat, M, y + 4);
            doc.setFillColor(...lineGrey); doc.roundedRect(M + 52, y, barW, 5, 1, 1, 'F');
            const hex = colors[i % colors.length];
            doc.setFillColor(parseInt(hex.slice(1,3),16), parseInt(hex.slice(3,5),16), parseInt(hex.slice(5,7),16));
            if (filled > 0) doc.roundedRect(M + 52, y, filled, 5, 1, 1, 'F');
            doc.setTextColor(...inkMid); doc.setFontSize(7); doc.setFont('helvetica', 'bold');
            doc.text(fmtEur(val) + ' (' + (pct * 100).toFixed(1) + '%)', W - M, y + 4, { align: 'right' });
            y += 9;
        });
        y += 4;
    }

    if (y > H - 60) { doc.addPage(); y = 20; }
    doc.setDrawColor(...lineGrey); doc.setLineWidth(0.3); doc.line(M, y, W - M, y); y += 5;
    doc.setTextColor(...navy); doc.setFontSize(9); doc.setFont('helvetica', 'bold');
    doc.text('Alle Transaktionen (' + monatTxs.length + ')', M, y); y += 5;
    doc.setFillColor(...accentBlue); doc.rect(M, y, W - M*2, 7, 'F');
    doc.setTextColor(...white); doc.setFontSize(6.5); doc.setFont('helvetica', 'bold');
    const colX = { date: M + 2, name: M + 24, cat: M + 88, amt: W - M - 2 };
    doc.text('DATUM', colX.date, y + 4.5); doc.text('BEZEICHNUNG', colX.name, y + 4.5);
    doc.text('KATEGORIE', colX.cat, y + 4.5); doc.text('BETRAG', colX.amt, y + 4.5, { align: 'right' });
    y += 8;
    monatTxs.slice().sort((a, b) => (a.date||'') < (b.date||'') ? -1 : 1).forEach((t, ri) => {
        if (y > H - 15) { doc.addPage(); doc.setFillColor(252,252,254); doc.rect(0,0,W,H,'F'); y = 16; doc.setFillColor(...accentBlue); doc.rect(M,y,W-M*2,7,'F'); doc.setTextColor(...white); doc.setFontSize(6.5); doc.setFont('helvetica','bold'); doc.text('DATUM',colX.date,y+4.5); doc.text('BEZEICHNUNG',colX.name,y+4.5); doc.text('KATEGORIE',colX.cat,y+4.5); doc.text('BETRAG',colX.amt,y+4.5,{align:'right'}); y+=8; }
        const isInc = t.type === 'Einnahmen', rowH = 6.5;
        if (ri % 2 === 1) { doc.setFillColor(...rowAlt); doc.rect(M, y - 0.5, W - M*2, rowH, 'F'); }
        doc.setFontSize(7); doc.setFont('helvetica', 'normal'); doc.setTextColor(...inkDark);
        doc.text(fmtDate(t.date?.substring(0,10)), colX.date, y + 4);
        const nm = (t.name||'').length > 34 ? t.name.substring(0,32)+'…' : (t.name||'');
        doc.text(nm, colX.name, y + 4);
        doc.setTextColor(...inkMid);
        const cat = (t.category||'').length > 16 ? t.category.substring(0,14)+'…' : (t.category||'');
        doc.text(cat, colX.cat, y + 4);
        doc.setTextColor(...(isInc ? greenInk : redInk)); doc.setFont('helvetica', 'bold');
        doc.text((isInc ? '+' : '−') + fmtEur(t.amount), colX.amt, y + 4, { align: 'right' });
        y += rowH;
    });

    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setDrawColor(...lineGrey); doc.setLineWidth(0.3); doc.line(M, H - 12, W - M, H - 12);
        doc.setTextColor(180, 180, 180); doc.setFontSize(7); doc.setFont('helvetica', 'normal');
        doc.text('Golden Goat Capital · Monatsanalyse ' + monatLabel, M, H - 7);
        doc.text('Seite ' + i + ' / ' + pageCount, W - M, H - 7, { align: 'right' });
    }

    doc.save('monatsanalyse_' + monat + '.pdf');
    showStatus('Monatsanalyse erstellt.', false);
}

// ── Monat-Selects befüllen ────────────────────────────────────

function buildMonthSelects() {
    if (!_exportData?.transaktionen?.length) return;

    const months = [...new Set(
        _exportData.transaktionen
            .map(t => (t.date || '').substring(0, 7))
            .filter(Boolean)
    )].sort();

    const fromSel = document.getElementById('txDateFrom');
    const toSel   = document.getElementById('txDateTo');
    if (!fromSel || !toSel) return;

    const makeLabel = m => {
        const d = new Date(m + '-01');
        return d.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
    };

    months.forEach(m => {
        const o1 = new Option(makeLabel(m), m);
        const o2 = new Option(makeLabel(m), m);
        fromSel.appendChild(o1);
        toSel.appendChild(o2);
    });

    // Default: letzten Monat als To, Anfang als From
    if (months.length) {
        toSel.value = months[months.length - 1];
    }
}

// ── Transaktionen filtern ─────────────────────────────────────

function getFilteredTx() {
    if (!_exportData?.transaktionen) return [];
    const from       = document.getElementById('txDateFrom')?.value || '';
    const to         = document.getElementById('txDateTo')?.value   || '';
    const selectedIds = getSelectedTxAccountIds();

    return _exportData.transaktionen.filter(t => {
        const m = (t.date || '').substring(0, 7);
        if (from && m < from) return false;
        if (to   && m > to)   return false;
        // Konto-Filter
        const accKey = t.account_id ? String(t.account_id) : '__unassigned__';
        if (!selectedIds.has(accKey)) return false;
        return true;
    });
}

function updateTxCount() {
    if (_exportMode === 'haushalt') { updateHausTxCount(); return; }
    const el = document.getElementById('txCount');
    if (!el) return;
    const count = getFilteredTx().length;
    el.textContent = count + ' Transaktion' + (count !== 1 ? 'en' : '') + ' im gewählten Zeitraum';
}

// ── Export: Transaktionen ─────────────────────────────────────

function exportTransaktionen() {
    const txs    = _exportMode === 'haushalt' ? getHausFilteredTx() : getFilteredTx();
    const format = document.querySelector('input[name="txFormat"]:checked')?.value || 'csv';
    const prefix = _exportMode === 'haushalt' ? 'haushalt_transaktionen_' : 'transaktionen_';

    if (!txs.length) {
        showStatus('Keine Transaktionen im gewählten Zeitraum.', true);
        return;
    }

    if (format === 'csv') {
        const csvFn = _exportMode === 'haushalt' ? hausTxToCsv : txsToCsv;
        downloadCSV(csvFn(txs), prefix + dateStamp() + '.csv');
    } else {
        downloadJSON({ exportiert_am: new Date().toISOString(), transaktionen: txs }, prefix + dateStamp() + '.json');
    }
    showStatus(txs.length + ' Transaktionen erfolgreich exportiert.', false);
}

function txsToCsv(txs) {
    const headers = ['ID', 'Datum', 'Name', 'Kategorie', 'Betrag', 'Typ', 'Konto-ID'];
    const rows = txs.map(t => [
        t.id,
        (t.date || '').substring(0, 10),
        csvEsc(t.name),
        csvEsc(t.category),
        String(t.amount || 0).replace('.', ','),
        t.type === 'Einnahmen' ? 'Einnahmen' : 'Ausgaben',
        t.account_id || ''
    ]);
    return [headers, ...rows].map(r => r.join(';')).join('\r\n');
}

// ── Export: Vollständiges Backup ──────────────────────────────

async function exportBackup() {
    if (_exportMode === 'haushalt') {
        if (!_exportDataHaushalt) { showStatus('Daten werden noch geladen…', true); return; }
        downloadJSON(_exportDataHaushalt, 'haushalt_backup_' + dateStamp() + '.json');
        showStatus('Haushalt-Backup heruntergeladen.', false);
        return;
    }
    if (!_exportData) { showStatus('Daten werden noch geladen…', true); return; }
    downloadJSON(_exportData, 'golden_goat_backup_' + dateStamp() + '.json');
    showStatus('Vollständiges Backup heruntergeladen.', false);
}

// ── Einzelne Bereiche ─────────────────────────────────────────

const SINGLE_EXPORTS = [
    {
        key: 'konten',
        name: 'Konten',
        icon: 'ri-bank-line',
        color: '#3b82f6',
        bg: 'rgba(59,130,246,0.12)',
        csvFn: kontenToCsv,
    },
    {
        key: 'sparziele',
        name: 'Sparziele',
        icon: 'ri-flag-fill',
        color: '#6358e6',
        bg: 'rgba(99,88,230,0.12)',
        csvFn: sparzieleToCsv,
    },
    {
        key: 'fixkosten',
        name: 'Fixkosten & Abos',
        icon: 'ri-repeat-line',
        color: '#a855f7',
        bg: 'rgba(168,85,247,0.12)',
        csvFn: fixkostenToCsv,
    },
    {
        key: 'schulden',
        name: 'Schulden',
        icon: 'ri-scales-line',
        color: '#ef4444',
        bg: 'rgba(239,68,68,0.12)',
        csvFn: schuldenToCsv,
    },
    {
        key: 'versicherungen',
        name: 'Versicherungen',
        icon: 'ri-shield-check-line',
        color: '#f59e0b',
        bg: 'rgba(245,158,11,0.12)',
        csvFn: versicherungenToCsv,
    },
    {
        key: 'todos',
        name: 'Todos',
        icon: 'ri-checkbox-line',
        color: '#22c55e',
        bg: 'rgba(34,197,94,0.12)',
        csvFn: todosToCsv,
    },
    {
        key: 'notizen',
        name: 'Notizen',
        icon: 'ri-sticky-note-line',
        color: '#ec4899',
        bg: 'rgba(236,72,153,0.12)',
        csvFn: notizenToCsv,
    },
    {
        key: 'dokumente',
        name: 'Dokumente (Metadaten)',
        icon: 'ri-file-line',
        color: '#94a3b8',
        bg: 'rgba(148,163,184,0.12)',
        csvFn: dokumenteToCsv,
    },
];

function buildSingleExportList() {
    const el = document.getElementById('singleExportList');
    if (!el) return;

    el.innerHTML = SINGLE_EXPORTS.map(exp => {
        const count = _exportData?.[exp.key]?.length ?? 0;
        return `<div class="exp-single-row">
            <div class="exp-single-left">
                <div class="exp-single-icon" style="background:${exp.bg};color:${exp.color};">
                    <i class="${exp.icon}"></i>
                </div>
                <div>
                    <div class="exp-single-name">${exp.name}</div>
                    <div class="exp-single-count">${count} Eintr${count !== 1 ? 'äge' : 'ag'}</div>
                </div>
            </div>
            <div class="exp-single-btns">
                <button class="exp-dl-btn" onclick="exportSingle('${exp.key}', 'csv')">
                    <i class="ri-file-excel-2-line"></i> CSV
                </button>
                <button class="exp-dl-btn" onclick="exportSingle('${exp.key}', 'json')">
                    <i class="ri-braces-line"></i> JSON
                </button>
            </div>
        </div>`;
    }).join('');
}

function exportSingle(key, format) {
    const exp  = SINGLE_EXPORTS.find(e => e.key === key);
    const data = _exportData?.[key];
    if (!exp || !data) { showStatus('Keine Daten vorhanden.', true); return; }

    const fname = key + '_' + dateStamp();
    if (format === 'csv') {
        const csv = exp.csvFn(data);
        downloadCSV(csv, fname + '.csv');
    } else {
        downloadJSON({ exportiert_am: new Date().toISOString(), [key]: data }, fname + '.json');
    }
    showStatus(data.length + ' ' + exp.name + '-Einträge exportiert.', false);
}

// ── CSV-Konverter ─────────────────────────────────────────────

function kontenToCsv(rows) {
    const h = ['ID', 'Name', 'Typ', 'Startguthaben', 'Aktueller Stand', 'Farbe'];
    const r = rows.map(a => [a.id, csvEsc(a.name), csvEsc(a.type),
        str(a.balance), str(a.currentBalance ?? a.balance), csvEsc(a.color)]);
    return toCsv(h, r);
}

function sparzieleToCsv(rows) {
    const h = ['ID', 'Name', 'Zielbetrag', 'Gespart', 'Zieldatum', 'Farbe', 'Konto-ID'];
    const r = rows.map(s => [s.id, csvEsc(s.name), str(s.zielbetrag), str(s.gespart),
        s.datum || '', csvEsc(s.farbe), s.account_id || '']);
    return toCsv(h, r);
}

function fixkostenToCsv(rows) {
    const h = ['ID', 'Name', 'Betrag', 'Kategorie', 'Häufigkeit', 'Datum-Tag', 'Subtyp', 'Aktiv'];
    const r = rows.map(f => [f.id, csvEsc(f.name), str(f.betrag), csvEsc(f.kategorie),
        csvEsc(f.haeufigkeit), f.datum_tag || '', csvEsc(f.subtyp), f.aktiv ? 'Ja' : 'Nein']);
    return toCsv(h, r);
}

function schuldenToCsv(rows) {
    const h = ['ID', 'Name', 'Typ', 'Gläubiger', 'Gesamtbetrag', 'Restbetrag', 'Zinssatz', 'Monatsrate'];
    const r = rows.map(s => [s.id, csvEsc(s.name), csvEsc(s.typ), csvEsc(s.glaeubiger),
        str(s.gesamtbetrag), str(s.restbetrag), str(s.zinssatz), str(s.monatsrate)]);
    return toCsv(h, r);
}

function versicherungenToCsv(rows) {
    const h = ['ID', 'Name', 'Kategorie', 'Anbieter', 'Status', 'Beitrag', 'Rhythmus', 'Beginn', 'Ende'];
    const r = rows.map(v => [v.id, csvEsc(v.name), csvEsc(v.kategorie), csvEsc(v.anbieter),
        csvEsc(v.status), str(v.beitrag), csvEsc(v.rhythmus), v.beginn || '', v.ende || '']);
    return toCsv(h, r);
}

function todosToCsv(rows) {
    const h = ['ID', 'Aufgabe', 'Priorität', 'Fälligkeit', 'Erledigt', 'Label', 'Notizen'];
    const r = rows.map(t => [t.id, csvEsc(t.task), csvEsc(t.priority), t.due_date || '',
        t.completed ? 'Ja' : 'Nein', csvEsc(t.label), csvEsc(t.notes)]);
    return toCsv(h, r);
}

function notizenToCsv(rows) {
    const h = ['ID', 'Titel', 'Kategorie', 'Inhalt', 'Gepinnt', 'Erstellt'];
    const r = rows.map(n => [n.id, csvEsc(n.titel), csvEsc(n.kategorie),
        csvEsc((n.inhalt || '').substring(0, 200)), n.pinned ? 'Ja' : 'Nein', n.created_at || '']);
    return toCsv(h, r);
}

function dokumenteToCsv(rows) {
    const h = ['ID', 'Name', 'Typ', 'Datum', 'Aussteller', 'Status', 'Betrag', 'Fällig am', 'Notiz'];
    const r = rows.map(d => [d.id, csvEsc(d.name), csvEsc(d.typ), d.datum || '',
        csvEsc(d.aussteller), csvEsc(d.status), str(d.betrag), d.faellig_datum || '', csvEsc(d.notiz)]);
    return toCsv(h, r);
}

// ── Hilfsfunktionen ───────────────────────────────────────────

function toCsv(headers, rows) {
    return [headers, ...rows].map(r => r.join(';')).join('\r\n');
}

function csvEsc(val) {
    const s = String(val || '');
    if (s.includes(';') || s.includes('"') || s.includes('\n')) {
        return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
}

function str(val) {
    if (val === null || val === undefined) return '';
    return String(parseFloat(val) || 0).replace('.', ',');
}

function dateStamp() {
    return new Date().toISOString().substring(0, 10);
}

function downloadCSV(content, filename) {
    const bom  = '\uFEFF'; // BOM für Excel-Kompatibilität
    const blob = new Blob([bom + content], { type: 'text/csv;charset=utf-8;' });
    triggerDownload(blob, filename);
}

function downloadJSON(data, filename) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    triggerDownload(blob, filename);
}

function triggerDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a   = document.createElement('a');
    a.href     = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function showStatus(msg, isError) {
    const el = document.getElementById('exportStatus');
    if (!el) return;
    el.style.display = '';
    el.style.padding = '14px 18px';
    el.style.background = isError ? 'rgba(239,68,68,0.08)' : 'rgba(34,197,94,0.08)';
    el.style.border     = isError ? '1px solid rgba(239,68,68,0.2)' : '1px solid rgba(34,197,94,0.2)';
    el.style.borderRadius = 'var(--radius-md)';
    el.style.fontSize   = '0.85rem';
    el.style.color      = isError ? '#ef4444' : '#22c55e';
    el.style.display    = 'flex';
    el.style.alignItems = 'center';
    el.style.gap        = '8px';
    el.innerHTML = (isError ? '<i class="ri-error-warning-line"></i>' : '<i class="ri-checkbox-circle-line"></i>') + msg;
    setTimeout(() => { el.style.display = 'none'; }, 4000);
}