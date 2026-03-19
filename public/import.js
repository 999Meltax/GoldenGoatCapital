// ══════════════════════════════════════════════════════════════
//  CSV-IMPORT  –  Golden Goat Capital
// ══════════════════════════════════════════════════════════════

const fmt = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });

let csvRawRows    = [];   // { [header]: value } for each data row
let csvHeaders    = [];   // original header names
let selectedPreset = 'auto';
let allRegeln     = [];
let allKonten     = [];
let parsedRows    = [];   // final mapped rows ready for import

// Column mapping: fieldKey → csvHeader string
let colMap = {};

// ── Bank Presets ───────────────────────────────────────────────
const PRESETS = {
    auto: {},
    ggc: {
        date: 'date', name: 'name', amount: 'amount', type: 'type', category: 'category'
    },
    dkb: {
        date: 'Buchungsdatum', name: 'Zahlungspflichtige*r',
        amount: 'Betrag (€)', nameAlt: 'Verwendungszweck'
    },
    ing: {
        date: 'Buchung', name: 'Auftraggeber/Empfänger',
        amount: 'Betrag', nameAlt: 'Verwendungszweck'
    },
    sparkasse: {
        date: 'Buchungstag', name: 'Beguenstigter/Zahlungspflichtiger',
        amount: 'Betrag', nameAlt: 'Verwendungszweck'
    },
    n26: {
        date: 'Datum', name: 'Empfänger', amount: 'Betrag (EUR)'
    },
    custom: {}
};

// Required & optional fields for mapping UI
const REQUIRED_FIELDS = [
    { key: 'date',   label: 'Datum *',        hint: 'z.B. 01.01.2024' },
    { key: 'name',   label: 'Bezeichnung *',   hint: 'Empfänger / Verwendungszweck' },
    { key: 'amount', label: 'Betrag *',        hint: 'Numerischer Wert' },
];
const OPTIONAL_FIELDS = [
    { key: 'type',     label: 'Typ',      hint: 'Einnahmen / Ausgaben' },
    { key: 'category', label: 'Kategorie', hint: 'Wird durch Regeln gesetzt' },
    { key: 'name2',    label: 'Bezeichn. 2', hint: 'Ergänzungsfeld (wird angehängt)' },
];

// ── Init ───────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
    await Promise.all([loadRegeln(), loadKonten()]);
    buildKontoSelect();
});

async function loadRegeln() {
    try {
        const res = await fetch('/users/regeln/list');
        allRegeln = res.ok ? await res.json() : [];
    } catch { allRegeln = []; }
}

async function loadKonten() {
    try {
        const res = await fetch('/users/accounts');
        allKonten = res.ok ? await res.json() : [];
    } catch { allKonten = []; }
}

function buildKontoSelect() {
    // Called later when rendering preview rows
}

// ── Step indicators ────────────────────────────────────────────
function setStep(n) {
    [1, 2, 3].forEach(i => {
        const el = document.getElementById('step-ind-' + i);
        if (!el) return;
        el.classList.remove('active', 'done');
        if (i < n)  el.classList.add('done');
        if (i === n) el.classList.add('active');
    });
    document.getElementById('step1').style.display    = n === 1 ? '' : 'none';
    document.getElementById('step2').style.display    = n === 2 ? '' : 'none';
    document.getElementById('step3').style.display    = n === 3 ? '' : 'none';
    document.getElementById('stepDone').style.display = n === 4 ? '' : 'none';
}

// ── Preset ────────────────────────────────────────────────────
function selectPreset(preset, btn) {
    selectedPreset = preset;
    document.querySelectorAll('.imp-preset-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
}

// ── File handling ──────────────────────────────────────────────
function handleDrop(e) {
    e.preventDefault();
    document.getElementById('dropzone').classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
}

function handleFileSelect(e) {
    const file = e.target.files[0];
    if (file) processFile(file);
}

function processFile(file) {
    const msg = document.getElementById('step1Msg');
    if (file.size > 5 * 1024 * 1024) { msg.textContent = 'Datei zu groß (max. 5 MB).'; return; }
    msg.textContent = '';

    const reader = new FileReader();
    reader.onload = e => {
        try {
            parseCSV(e.target.result);
            // Show file info
            const info = document.getElementById('step1FileInfo');
            info.style.display = 'flex';
            info.innerHTML =
                '<div class="imp-badge"><i class="ri-file-excel-2-line"></i>' + esc(file.name) + '</div>' +
                '<div class="imp-badge"><i class="ri-table-line"></i>' + csvRawRows.length + ' Zeilen</div>' +
                '<div class="imp-badge"><i class="ri-layout-column-line"></i>' + csvHeaders.length + ' Spalten</div>';
            document.getElementById('toStep2Btn').disabled = false;
        } catch (err) {
            msg.textContent = 'Fehler beim Lesen: ' + err.message;
        }
    };
    reader.readAsText(file, 'UTF-8');
}

// ── CSV Parser ─────────────────────────────────────────────────
function parseCSV(text) {
    // Normalize line endings
    text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    // Skip empty/comment lines at start (DKB has metadata lines)
    const lines = text.split('\n').filter(l => l.trim() !== '');

    // Detect delimiter
    const delimiters = [';', ',', '\t', '|'];
    let delimiter = ';';
    let maxCols = 0;
    for (const d of delimiters) {
        const cols = parseLine(lines[0], d).length;
        if (cols > maxCols) { maxCols = cols; delimiter = d; }
    }

    // Find header row (first row with at least 3 fields)
    let headerIdx = 0;
    for (let i = 0; i < Math.min(lines.length, 10); i++) {
        if (parseLine(lines[i], delimiter).length >= 3) { headerIdx = i; break; }
    }

    csvHeaders = parseLine(lines[headerIdx], delimiter).map(h => h.trim());
    csvRawRows = [];
    for (let i = headerIdx + 1; i < lines.length; i++) {
        const fields = parseLine(lines[i], delimiter);
        if (fields.every(f => f.trim() === '')) continue;
        const row = {};
        csvHeaders.forEach((h, j) => row[h] = (fields[j] || '').trim());
        csvRawRows.push(row);
    }
}

function parseLine(line, delimiter) {
    const result = [];
    let inQuote = false, cur = '';
    for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (c === '"') {
            if (inQuote && line[i + 1] === '"') { cur += '"'; i++; }
            else inQuote = !inQuote;
        } else if (c === delimiter && !inQuote) {
            result.push(cur); cur = '';
        } else { cur += c; }
    }
    result.push(cur);
    return result;
}

// ── Step navigation ────────────────────────────────────────────
function goToStep1() { setStep(1); }

function goToStep2() {
    if (csvRawRows.length === 0) return;
    setStep(2);
    buildMappingUI();
    renderSampleTable();
}

function goToStep3() {
    if (!validateMapping()) return;
    buildParsedRows();
    renderPreview();
    setStep(3);
}

// ── Mapping UI ─────────────────────────────────────────────────
function buildMappingUI() {
    const preset = PRESETS[selectedPreset] || {};

    // Auto-detect: try to match headers case-insensitively
    const autoMap = autoDetectColumns();
    const effective = { ...autoMap, ...preset };

    // Build colMap from effective preset
    colMap = {};
    REQUIRED_FIELDS.concat(OPTIONAL_FIELDS).forEach(f => {
        colMap[f.key] = effective[f.key] || '';
    });

    renderMappingFields('requiredMappings', REQUIRED_FIELDS);
    renderMappingFields('optionalMappings', OPTIONAL_FIELDS);
}

function autoDetectColumns() {
    const map = {};
    const lc = h => h.toLowerCase();
    csvHeaders.forEach(h => {
        const hl = lc(h);
        if (!map.date   && /datum|date|buchung|valuta/.test(hl)) map.date = h;
        if (!map.name   && /empfänger|empfaenger|auftraggeber|name|payee|zahlungspflichtige|beguenstigt/.test(hl)) map.name = h;
        if (!map.name2  && /verwendungszweck|betreff|memo|notiz|purpose/.test(hl)) map.name2 = h;
        if (!map.amount && /betrag|amount|umsatz|wert|summe/.test(hl)) map.amount = h;
        if (!map.type   && /typ|type|art\b/.test(hl)) map.type = h;
        if (!map.category && /kategorie|category|konto/.test(hl)) map.category = h;
    });
    return map;
}

function renderMappingFields(containerId, fields) {
    const container = document.getElementById(containerId);
    container.innerHTML = '';
    fields.forEach(f => {
        const label = document.createElement('div');
        label.className = 'imp-map-label';
        label.textContent = f.label;

        const arrow = document.createElement('div');
        arrow.className = 'imp-map-arrow';
        arrow.innerHTML = '<i class="ri-arrow-right-line"></i>';

        const sel = document.createElement('select');
        sel.id = 'map_' + f.key;
        sel.style.width = '100%';
        sel.style.padding = '6px 10px';
        sel.style.borderRadius = 'var(--radius-md)';
        sel.style.background = 'var(--surface-2)';
        sel.style.border = '1px solid var(--border)';
        sel.style.color = 'var(--text-1)';
        sel.style.fontFamily = 'inherit';
        sel.style.fontSize = '0.82rem';
        sel.onchange = () => {
            colMap[f.key] = sel.value;
            renderSampleTable();
        };

        const emptyOpt = document.createElement('option');
        emptyOpt.value = '';
        emptyOpt.textContent = '— nicht zuordnen —';
        sel.appendChild(emptyOpt);

        csvHeaders.forEach(h => {
            const opt = document.createElement('option');
            opt.value = h;
            opt.textContent = h;
            if (colMap[f.key] === h) opt.selected = true;
            sel.appendChild(opt);
        });

        container.appendChild(label);
        container.appendChild(arrow);
        container.appendChild(sel);
    });
}

function renderSampleTable() {
    const table = document.getElementById('sampleTable');
    const sample = csvRawRows.slice(0, 3);

    let html = '<thead><tr>';
    csvHeaders.forEach(h => { html += '<th>' + esc(h) + '</th>'; });
    html += '</tr></thead><tbody>';
    sample.forEach(row => {
        html += '<tr>';
        csvHeaders.forEach(h => { html += '<td style="max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + esc(row[h] || '') + '</td>'; });
        html += '</tr>';
    });
    html += '</tbody>';
    table.innerHTML = html;
}

function validateMapping() {
    const msg = document.getElementById('step2Msg');
    for (const f of REQUIRED_FIELDS) {
        const val = document.getElementById('map_' + f.key)?.value;
        colMap[f.key] = val || '';
        if (!val) { msg.textContent = `Pflichtfeld „${f.label.replace(' *', '')}" muss zugeordnet werden.`; return false; }
    }
    OPTIONAL_FIELDS.forEach(f => {
        const val = document.getElementById('map_' + f.key)?.value;
        colMap[f.key] = val || '';
    });
    msg.textContent = '';
    return true;
}

// ── Parse mapped rows ──────────────────────────────────────────
function buildParsedRows() {
    parsedRows = csvRawRows.map((raw, idx) => {
        const dateRaw   = raw[colMap.date]   || '';
        const nameRaw   = raw[colMap.name]   || '';
        const name2Raw  = raw[colMap.name2]  || '';
        const amountRaw = raw[colMap.amount] || '';
        const typeRaw   = raw[colMap.type]   || '';
        const catRaw    = raw[colMap.category] || '';

        const date    = parseDate(dateRaw);
        const amount  = parseAmount(amountRaw);
        const name    = [nameRaw, name2Raw].filter(Boolean).join(' · ').trim() || 'Transaktion';
        const type    = detectType(typeRaw, amount, amountRaw);
        const absAmt  = Math.abs(amount);

        // Apply rules
        const { category, ruleName } = applyRegelLocal(name);
        const finalCat = catRaw || category || 'Sonstiges';

        return {
            _idx: idx,
            _include: true,
            _ruleName: ruleName,
            date,
            name,
            amount: absAmt,
            type,
            category: finalCat,
            account_id: null,
        };
    }).filter(r => r.date && r.amount >= 0);
}

function parseDate(raw) {
    if (!raw) return null;
    raw = raw.trim();
    // DD.MM.YYYY or DD.MM.YY
    let m = raw.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})$/);
    if (m) {
        let y = parseInt(m[3]);
        if (y < 100) y += y < 50 ? 2000 : 1900;
        return `${y}-${String(m[2]).padStart(2,'0')}-${String(m[1]).padStart(2,'0')}`;
    }
    // YYYY-MM-DD
    m = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    // MM/DD/YYYY
    m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (m) return `${m[3]}-${String(m[1]).padStart(2,'0')}-${String(m[2]).padStart(2,'0')}`;
    return null;
}

function parseAmount(raw) {
    if (!raw) return 0;
    // Remove currency symbols and spaces
    let s = raw.replace(/[€$£EUR\s]/gi, '').trim();
    // German format: 1.234,56 → 1234.56
    if (/\d[.,]\d/.test(s)) {
        if (/\d\.\d{3}[,]/.test(s) || (s.includes(',') && s.indexOf(',') > s.lastIndexOf('.'))) {
            s = s.replace(/\./g, '').replace(',', '.');
        } else if (/\d,\d{3}[.]/.test(s) || (s.includes('.') && s.indexOf('.') > s.lastIndexOf(','))) {
            s = s.replace(/,/g, '').replace('.', '.');
        } else {
            s = s.replace(/\./g, '').replace(',', '.');
        }
    }
    return parseFloat(s) || 0;
}

function detectType(typeRaw, amount, amountRaw) {
    const tl = typeRaw.toLowerCase();
    if (/einnahm|income|credit|gutschr|haben/.test(tl)) return 'Einnahmen';
    if (/ausgab|expens|debit|soll/.test(tl))             return 'Ausgaben';
    // Fall back on sign of original amount string
    if (amountRaw.trim().startsWith('+') || amount > 0 && !amountRaw.trim().startsWith('-')) {
        // Only mark as income if original had explicit + sign
        if (amountRaw.trim().startsWith('+')) return 'Einnahmen';
    }
    return amount >= 0 ? 'Ausgaben' : 'Einnahmen';
}

// ── Apply rules (client-side) ──────────────────────────────────
function applyRegelLocal(txName) {
    const name = (txName || '').toLowerCase();
    for (const r of allRegeln) {
        if (!r.aktiv) continue;
        const modus = r.modus || 'beide';
        if (modus === 'haushalt') continue; // only privat/beide rules
        const wert = (r.bedingung_wert || '').toLowerCase();
        let match = false;
        if (r.bedingung_operator === 'enthält')     match = name.includes(wert);
        if (r.bedingung_operator === 'beginnt_mit') match = name.startsWith(wert);
        if (r.bedingung_operator === 'endet_mit')   match = name.endsWith(wert);
        if (r.bedingung_operator === 'gleich')      match = name === wert;
        if (match) {
            return {
                category: r.aktion_kategorie || null,
                ruleName: r.bedingung_wert,
            };
        }
    }
    return { category: null, ruleName: null };
}

// ── Render Preview ─────────────────────────────────────────────
function renderPreview() {
    updatePreviewSummary();

    const autoCount = parsedRows.filter(r => r._ruleName).length;
    const bannerEl  = document.getElementById('rulesInfoBanner');
    if (autoCount > 0) {
        bannerEl.style.display = '';
        document.getElementById('rulesInfoText').textContent =
            `${autoCount} von ${parsedRows.length} Transaktionen wurden automatisch kategorisiert (Regeln & Automationen).`;
    } else {
        bannerEl.style.display = 'none';
    }

    document.getElementById('previewTitle').textContent =
        `${parsedRows.length} Transaktionen prüfen`;

    const body = document.getElementById('previewBody');
    body.innerHTML = parsedRows.map((r, i) => {
        const kontoOptions = allKonten.map(k =>
            `<option value="${k.id}" ${r.account_id == k.id ? 'selected' : ''}>${esc(k.name)}</option>`
        ).join('');

        return `<tr id="prow-${i}" class="${r._include ? '' : 'skip'}">
            <td><input type="checkbox" ${r._include ? 'checked' : ''} onchange="toggleRow(${i},this.checked)" style="cursor:pointer;accent-color:var(--accent);"></td>
            <td style="white-space:nowrap;">${r.date || '—'}</td>
            <td>
                <input type="text" value="${esc(r.name)}" onchange="updateRow(${i},'name',this.value)" style="width:220px;max-width:100%;">
                ${r._ruleName ? `<div class="imp-rule-badge" style="margin-top:3px;"><i class="ri-magic-line"></i>${esc(r._ruleName)}</div>` : ''}
            </td>
            <td style="white-space:nowrap;font-weight:700;color:${r.type==='Einnahmen'?'#22c55e':'#ef4444'};">${fmt.format(r.amount)}</td>
            <td>
                <select onchange="updateRow(${i},'type',this.value)" style="width:110px;">
                    <option value="Ausgaben"  ${r.type==='Ausgaben'  ? 'selected':''}>Ausgaben</option>
                    <option value="Einnahmen" ${r.type==='Einnahmen' ? 'selected':''}>Einnahmen</option>
                </select>
            </td>
            <td>
                <input type="text" value="${esc(r.category)}" onchange="updateRow(${i},'category',this.value)" style="width:130px;">
            </td>
            <td>
                <select onchange="updateRow(${i},'account_id',this.value)" style="width:120px;">
                    <option value="">— kein —</option>
                    ${kontoOptions}
                </select>
            </td>
        </tr>`;
    }).join('');

    updateImportCountLabel();
}

function updatePreviewSummary() {
    const included = parsedRows.filter(r => r._include);
    const einnahmen = included.filter(r => r.type === 'Einnahmen').reduce((s, r) => s + r.amount, 0);
    const ausgaben  = included.filter(r => r.type === 'Ausgaben').reduce((s, r) => s + r.amount, 0);
    document.getElementById('previewSummary').innerHTML =
        `<div class="imp-stat"><div class="imp-stat-label">Transaktionen</div><div class="imp-stat-value">${included.length}</div></div>` +
        `<div class="imp-stat"><div class="imp-stat-label">Einnahmen</div><div class="imp-stat-value" style="color:#22c55e;">${fmt.format(einnahmen)}</div></div>` +
        `<div class="imp-stat"><div class="imp-stat-label">Ausgaben</div><div class="imp-stat-value" style="color:#ef4444;">${fmt.format(ausgaben)}</div></div>` +
        `<div class="imp-stat"><div class="imp-stat-label">Saldo</div><div class="imp-stat-value" style="color:${einnahmen-ausgaben>=0?'#22c55e':'#ef4444'};">${fmt.format(einnahmen-ausgaben)}</div></div>`;
}

function toggleRow(idx, include) {
    parsedRows[idx]._include = include;
    const row = document.getElementById('prow-' + idx);
    if (row) row.className = include ? '' : 'skip';
    updatePreviewSummary();
    updateImportCountLabel();
}

function updateRow(idx, field, value) {
    parsedRows[idx][field] = field === 'account_id' ? (value || null) : value;
    if (field === 'type') {
        const td = document.querySelector(`#prow-${idx} td:nth-child(4)`);
        if (td) td.style.color = value === 'Einnahmen' ? '#22c55e' : '#ef4444';
    }
    updatePreviewSummary();
}

function selectAll(include) {
    parsedRows.forEach((r, i) => {
        r._include = include;
        const row = document.getElementById('prow-' + i);
        if (row) {
            row.className = include ? '' : 'skip';
            const cb = row.querySelector('input[type=checkbox]');
            if (cb) cb.checked = include;
        }
    });
    const master = document.getElementById('selectAllCb');
    if (master) master.checked = include;
    updatePreviewSummary();
    updateImportCountLabel();
}

function updateImportCountLabel() {
    const n = parsedRows.filter(r => r._include).length;
    document.getElementById('importCountLabel').textContent = `${n} Transaktion(en) ausgewählt`;
}

// ── Import ─────────────────────────────────────────────────────
async function doImport() {
    const toImport = parsedRows.filter(r => r._include).map(({ date, name, amount, type, category, account_id }) =>
        ({ date, name, amount, type, category, account_id })
    );
    if (toImport.length === 0) { ggcToast('Keine Transaktionen ausgewählt.', true); return; }

    const btn = document.getElementById('importBtn');
    btn.disabled = true;
    btn.innerHTML = '<i class="ri-loader-4-line" style="animation:spin 1s linear infinite;display:inline-block;"></i> Importiere…';

    try {
        const res = await fetch('/users/import/transactions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ transactions: toImport })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || 'Fehler');

        document.getElementById('doneTitle').textContent = `${data.imported} Transaktion(en) importiert!`;
        document.getElementById('doneMsg').textContent =
            'Deine Transaktionen wurden erfolgreich in den Ausgabentracker importiert.';
        setStep(4);
        // Update step indicators
        [1, 2, 3].forEach(i => {
            const el = document.getElementById('step-ind-' + i);
            if (el) { el.classList.remove('active'); el.classList.add('done'); }
        });
    } catch (err) {
        ggcToast('Fehler beim Import: ' + err.message, true);
        btn.disabled = false;
        btn.innerHTML = '<i class="ri-upload-cloud-2-line"></i> Importieren';
    }
}

function resetImport() {
    csvRawRows = [];
    csvHeaders = [];
    parsedRows = [];
    colMap = {};
    selectedPreset = 'auto';
    document.getElementById('csvFileInput').value = '';
    document.getElementById('step1FileInfo').style.display = 'none';
    document.getElementById('step1FileInfo').innerHTML = '';
    document.getElementById('step1Msg').textContent = '';
    document.getElementById('toStep2Btn').disabled = true;
    document.querySelectorAll('.imp-preset-btn').forEach(b => b.classList.remove('active'));
    document.querySelector('[data-preset="auto"]').classList.add('active');
    setStep(1);
}

// ── Utils ──────────────────────────────────────────────────────
function esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
