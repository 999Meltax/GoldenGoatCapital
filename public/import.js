// ══════════════════════════════════════════════════════════════
//  CSV-IMPORT  –  Golden Goat Capital
// ══════════════════════════════════════════════════════════════

const fmt = new Intl.NumberFormat(window.GGC_LOCALE||'de-DE', { style: 'currency', currency: (window.GGC_CURRENCY||'EUR') });

function esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

let csvRawRows    = [];   // { [header]: value } for each data row
let csvHeaders    = [];   // original header names
let selectedPreset = 'auto';
let allRegeln     = [];
let allKonten     = [];
let parsedRows    = [];   // final mapped rows ready for import
let _existingHashes = new Set();  // for client-side duplicate detection
let _pendingSaldo  = null;        // detected saldo (client-only, never sent to server)

// Column mapping: fieldKey → csvHeader string
let colMap = {};

// ── Bank Presets ───────────────────────────────────────────────
const PRESETS = {
    auto: {},
    ggc:      { date: 'date',          name: 'name',                             amount: 'amount',    type: 'type', notes: 'notes' },
    ing:      { date: 'Buchung',       name: 'Auftraggeber/Empfänger',           amount: 'Betrag',    notes: 'Verwendungszweck' },
    c24:      { date: 'Buchungsdatum', name: 'Zahlungsempfänger',                amount: 'Betrag',    notes: 'Verwendungszweck' },
    dkb:      { date: 'Buchungsdatum', name: 'Zahlungspflichtige*r',             amount: 'Betrag (€)',notes: 'Verwendungszweck' },
    sparkasse:{ date: 'Buchungstag',   name: 'Beguenstigter/Zahlungspflichtiger',amount: 'Betrag',    notes: 'Verwendungszweck' },
    n26:      { date: 'Datum',         name: 'Empfänger',                        amount: 'Betrag (EUR)', notes: 'Betreff' },
    custom:   {}
};

const PRESET_LABELS = {
    auto: 'Auto', ggc: 'GoldenGoat', ing: 'ING', c24: 'C24', dkb: 'DKB',
    sparkasse: 'Sparkasse', n26: 'N26', custom: 'Eigenes Format'
};

// Required & optional fields for mapping UI
// NOTE: category is intentionally excluded — server applies rules to set it
const REQUIRED_FIELDS = [
    { key: 'date',   label: 'Datum *',      hint: 'z.B. 01.01.2024' },
    { key: 'name',   label: 'Empfänger *',  hint: 'Name des Auftraggebers / Empfängers' },
    { key: 'amount', label: 'Betrag *',     hint: 'Numerischer Wert' },
];
const OPTIONAL_FIELDS = [
    { key: 'notes', label: 'Verwendungszweck', hint: 'Wird als Notiz gespeichert' },
    { key: 'type',  label: 'Typ',              hint: 'Einnahmen / Ausgaben' },
];

// ── Init ───────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
    loadKonten();                // sync: reads from server-rendered select
    await loadRegeln();          // async: fetch rules
    buildKontoSelect();
});

function getDefaultAccountId() {
    const sel = document.getElementById('defaultAccountSelect');
    return sel && sel.value ? parseInt(sel.value) : null;
}

async function loadRegeln() {
    try {
        const res = await fetch('/users/regeln/list');
        allRegeln = res.ok ? await res.json() : [];
    } catch { allRegeln = []; }
}

function loadKonten() {
    // Read accounts from the server-rendered select — no fetch needed
    const sel = document.getElementById('defaultAccountSelect');
    if (sel) {
        allKonten = Array.from(sel.options)
            .filter(o => o.value)
            .map(o => ({ id: parseInt(o.value), name: o.textContent.trim() }));
    }
}

function buildKontoSelect() {
    // Step-1 and Step-3 selects are server-side rendered — nothing to do here.
    // allKonten is still used for per-row account selects in the preview table.
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
    const existing = document.getElementById('saldoToast');
    if (existing) existing.remove();

    const reader = new FileReader();
    reader.onload = e => {
        try {
            parseCSV(e.target.result);

            // Auto-detect bank
            const detected = autoDetectBank();
            if (detected !== 'auto') {
                selectedPreset = detected;
                document.querySelectorAll('.imp-preset-btn').forEach(b => {
                    b.classList.toggle('active', b.dataset.preset === detected);
                });
                msg.style.color = '#10b981';
                msg.textContent = 'Bank erkannt: ' + (PRESET_LABELS[detected] || detected);
            }

            // Show file info
            const info = document.getElementById('step1FileInfo');
            info.style.display = 'flex';
            info.innerHTML =
                '<div class="imp-badge"><i class="ri-file-excel-2-line"></i>' + esc(file.name) + '</div>' +
                '<div class="imp-badge"><i class="ri-table-line"></i>' + csvRawRows.length + ' Zeilen</div>' +
                '<div class="imp-badge"><i class="ri-layout-column-line"></i>' + csvHeaders.length + ' Spalten</div>';
            document.getElementById('toStep2Btn').disabled = false;

            // Saldo-Toast (privacy: extracted client-side, never sent to server)
            const saldo = extractSaldo();
            if (saldo !== null) showSaldoToast(saldo);
        } catch (err) {
            msg.textContent = 'Fehler beim Lesen: ' + err.message;
        }
    };
    reader.readAsText(file, 'UTF-8');
}

// ── Bank auto-detection ────────────────────────────────────────
function autoDetectBank() {
    const lc = csvHeaders.map(h => h.toLowerCase());
    const has = pat => lc.some(h => pat.test(h));
    if (has(/^buchung$/) && has(/auftraggeber/) && has(/^betrag$/)) return 'ing';
    if (has(/buchungsdatum/) && has(/zahlungsempfänger|zahlungsempfaenger/) && (has(/^iban$/) || has(/^bic$/))) return 'c24';
    if (has(/buchungsdatum/) && has(/zahlungspflichtige/)) return 'dkb';
    if (has(/buchungstag/) && has(/beguenst/)) return 'sparkasse';
    if (has(/^datum$/) && has(/empf.nger|empfänger/) && has(/betrag.*eur/)) return 'n26';
    if (has(/^date$/) && has(/^amount$/) && has(/^type$/)) return 'ggc';
    return 'auto';
}

// ── Saldo extraction (client-side only, never sent to server) ──
function extractSaldo() {
    const saldoCol = csvHeaders.find(h => /\bsaldo\b/i.test(h));
    if (!saldoCol) return null;
    for (const row of csvRawRows) {
        const val = (row[saldoCol] || '').trim();
        if (val && val !== '-' && val !== '') {
            const amount = parseAmount(val);
            if (!isNaN(amount) && amount !== 0) return amount;
        }
    }
    return null;
}

function showSaldoToast(amount) {
    // Statt Toast: Wert direkt ins Eingabefeld vorausfüllen
    const input = document.getElementById('manualSaldoInput');
    const hint  = document.getElementById('saldoHint');
    if (input) {
        // Deutschen Format: 1234.56 → "1.234,56"
        input.value = String(parseFloat(amount)).replace('.', ',');
    }
    if (hint) {
        hint.textContent = '✓ Automatisch aus CSV erkannt';
        hint.style.color = '#10b981';
        hint.style.display = 'block';
    }
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

    // Find header row: first row with ≥4 non-empty fields (skips ING/DKB metadata rows)
    let headerIdx = 0;
    for (let i = 0; i < Math.min(lines.length, 20); i++) {
        const fields = parseLine(lines[i], delimiter);
        const nonEmpty = fields.filter(f => f.trim()).length;
        if (nonEmpty >= 4) { headerIdx = i; break; }
    }

    csvHeaders = parseLine(lines[headerIdx], delimiter).map(h => h.trim());
    csvRawRows = [];
    for (let i = headerIdx + 1; i < lines.length; i++) {
        let fields = parseLine(lines[i], delimiter);
        if (fields.every(f => f.trim() === '')) continue;
        // C24 quirk: entire row wrapped in outer quotes → single field containing inner CSV
        // Re-parse the inner content as a CSV line
        if (fields.length === 1 && csvHeaders.length > 1 && fields[0].includes(delimiter)) {
            const inner = parseLine(fields[0], delimiter);
            if (inner.length >= Math.floor(csvHeaders.length * 0.5)) fields = inner;
        }
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

async function goToStep3() {
    if (!validateMapping()) return;
    buildParsedRows();
    // Fetch existing transactions for client-side duplicate warning (hashes only, no sensitive data)
    try {
        const txs = await fetch('/users/getTransactions').then(r => r.ok ? r.json() : []);
        _existingHashes = new Set((txs.transactions || txs).map(t =>
            `${t.name}|${parseFloat(t.amount).toFixed(2)}|${t.date}`
        ));
    } catch { _existingHashes = new Set(); }
    parsedRows.forEach(r => {
        const h = `${r.name}|${r.amount.toFixed(2)}|${r.date}`;
        r._isDuplicate = _existingHashes.has(h);
    });
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
        if (!map.name   && /empfänger|empfaenger|auftraggeber|zahlungsempfänger|zahlungsempfaenger|name|payee|zahlungspflichtige|beguenstigt/.test(hl)) map.name = h;
        if (!map.notes  && /verwendungszweck|betreff|memo|notiz|purpose|beschreibung/.test(hl)) map.notes = h;
        if (!map.amount && /betrag|amount|umsatz|wert|summe/.test(hl)) map.amount = h;
        if (!map.type   && /^typ$|^type$|transaktionstyp/.test(hl)) map.type = h;
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
    const defaultAccountId = getDefaultAccountId();
    parsedRows = csvRawRows.map((raw, idx) => {
        const dateRaw   = raw[colMap.date]   || '';
        const nameRaw   = raw[colMap.name]   || '';
        const notesRaw  = raw[colMap.notes]  || '';
        const amountRaw = raw[colMap.amount] || '';
        const typeRaw   = raw[colMap.type]   || '';

        // Fallback: wenn primäre Datumsspalte leer/unparseable ist (z.B. leerer Karteneinsatz),
        // bekannte Fallback-Spalten probieren
        const DATE_FALLBACKS = ['Buchungsdatum', 'Buchung', 'Valutadatum', 'Wertstellungsdatum'];
        let date = parseDate(dateRaw);
        if (!date) {
            for (const fb of DATE_FALLBACKS) {
                if (fb !== colMap.date && raw[fb]) {
                    date = parseDate(raw[fb]);
                    if (date) break;
                }
            }
        }
        const amount = parseAmount(amountRaw);
        const name   = nameRaw.trim() || 'Transaktion';
        // ING and some banks use '-' for empty fields
        const notes  = (notesRaw.trim() === '-' || notesRaw.trim() === '') ? '' : notesRaw.trim();
        const type   = detectType(typeRaw, amount, amountRaw);
        const absAmt = Math.abs(amount);

        // Apply rules client-side for preview (server re-applies on import)
        const { category, ruleName } = applyRegelLocal(name + ' ' + notes);
        const finalCat = category || 'Sonstiges';

        return {
            _idx: idx,
            _include: true,
            _isDuplicate: false,
            _ruleName: ruleName,
            date,
            name,
            notes,
            amount: absAmt,
            type,
            category: finalCat,   // display only — not sent to server
            account_id: defaultAccountId,
        };
    }).filter(r => r.date && r.amount > 0);
}

function parseDate(raw) {
    if (!raw) return null;
    raw = raw.trim();
    // DD.MM.YYYY HH:MM (e.g. C24 Karteneinsatz: "20.03.2026 20:37") — strip time
    let m = raw.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})\s+\d{1,2}:\d{2}/);
    if (m) {
        let y = parseInt(m[3]);
        if (y < 100) y += y < 50 ? 2000 : 1900;
        return `${y}-${String(m[2]).padStart(2,'0')}-${String(m[1]).padStart(2,'0')}`;
    }
    // DD.MM.YYYY or DD.MM.YY
    m = raw.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})$/);
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
    // Use sign of original raw amount string as ground truth
    if (amountRaw.trim().startsWith('+')) return 'Einnahmen';
    if (amountRaw.trim().startsWith('-') || amount < 0) return 'Ausgaben';
    // Positive amount without explicit sign → Einnahmen
    if (amount > 0) return 'Einnahmen';
    return 'Ausgaben';
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
    populateBulkAccountSelect();
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

    const dupCount = parsedRows.filter(r => r._isDuplicate).length;
    document.getElementById('previewTitle').textContent =
        `${parsedRows.length} Transaktionen prüfen` + (dupCount > 0 ? ` · ${dupCount} mögliche Duplikate` : '');

    const body = document.getElementById('previewBody');
    body.innerHTML = parsedRows.map((r, i) => {
        const kontoOptions = allKonten.map(k =>
            `<option value="${k.id}" ${r.account_id == k.id ? 'selected' : ''}>${esc(k.name)}</option>`
        ).join('');

        return `<tr id="prow-${i}" class="${r._include ? '' : 'skip'}${r._isDuplicate ? ' dup-row' : ''}">
            <td><input type="checkbox" ${r._include ? 'checked' : ''} onchange="toggleRow(${i},this.checked)" style="cursor:pointer;accent-color:var(--accent);"></td>
            <td style="white-space:nowrap;">${r.date || '—'}</td>
            <td>
                <input type="text" value="${esc(r.name)}" onchange="updateRow(${i},'name',this.value)" style="width:180px;max-width:100%;">
                ${r._isDuplicate ? '<div style="font-size:0.7rem;color:#f59e0b;margin-top:2px;"><i class="ri-error-warning-line"></i> mögliches Duplikat</div>' : ''}
                ${r._ruleName ? `<div class="imp-rule-badge" style="margin-top:3px;"><i class="ri-magic-line"></i>${esc(r._ruleName)}</div>` : ''}
            </td>
            <td style="font-size:0.78rem;color:var(--text-3);max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(r.notes)}</td>
            <td style="white-space:nowrap;font-weight:700;color:${r.type==='Einnahmen'?'#22c55e':'#ef4444'};">${fmt.format(r.amount)}</td>
            <td>
                <select onchange="updateRow(${i},'type',this.value)" style="width:110px;">
                    <option value="Ausgaben"  ${r.type==='Ausgaben'  ? 'selected':''}>Ausgaben</option>
                    <option value="Einnahmen" ${r.type==='Einnahmen' ? 'selected':''}>Einnahmen</option>
                </select>
            </td>
            <td style="font-size:0.78rem;color:var(--text-3);">${esc(r.category)}</td>
            <td>
                <select id="acc_sel_${i}" onchange="updateRow(${i},'account_id',this.value)" style="width:120px;">
                    <option value="">— kein —</option>
                    ${kontoOptions}
                </select>
            </td>
        </tr>`;
    }).join('');

    updateImportCountLabel();
}

function populateBulkAccountSelect() {
    // Sync the bulk-select value to match the default account chosen in Step 1
    const bulkSel = document.getElementById('bulkAccountSelect');
    const defaultId = getDefaultAccountId();
    if (bulkSel && defaultId) bulkSel.value = defaultId;
}

function applyBulkAccount() {
    const sel = document.getElementById('bulkAccountSelect');
    if (!sel || !sel.value) return;
    const accountId = parseInt(sel.value);
    parsedRows.forEach((r, i) => {
        r.account_id = accountId;
        const rowSel = document.getElementById(`acc_sel_${i}`);
        if (rowSel) rowSel.value = accountId;
    });
}

function updatePreviewSummary() {
    const included = parsedRows.filter(r => r._include);
    const einnahmen = included.filter(r => r.type === 'Einnahmen').reduce((s, r) => s + r.amount, 0);
    const ausgaben  = included.filter(r => r.type === 'Ausgaben').reduce((s, r) => s + r.amount, 0);
    const manualSaldoVal = document.getElementById('manualSaldoInput')?.value.trim();
    const targetSaldo = manualSaldoVal ? parseAmount(manualSaldoVal) : null;
    document.getElementById('previewSummary').innerHTML =
        `<div class="imp-stat"><div class="imp-stat-label">Transaktionen</div><div class="imp-stat-value">${included.length}</div></div>` +
        `<div class="imp-stat"><div class="imp-stat-label">Einnahmen</div><div class="imp-stat-value" style="color:#22c55e;">${fmt.format(einnahmen)}</div></div>` +
        `<div class="imp-stat"><div class="imp-stat-label">Ausgaben</div><div class="imp-stat-value" style="color:#ef4444;">${fmt.format(ausgaben)}</div></div>` +
        `<div class="imp-stat"><div class="imp-stat-label">Netto</div><div class="imp-stat-value" style="color:${einnahmen-ausgaben>=0?'#22c55e':'#ef4444'};">${fmt.format(einnahmen-ausgaben)}</div></div>`;

    // Saldo-Modus-Row ein-/ausblenden
    const saldoModeRow = document.getElementById('saldoModeRow');
    const saldoModeLabel = document.getElementById('saldoModeTargetLabel');
    if (saldoModeRow) {
        if (targetSaldo !== null) {
            saldoModeRow.style.display = 'flex';
            if (saldoModeLabel) saldoModeLabel.textContent = fmt.format(targetSaldo);
        } else {
            saldoModeRow.style.display = 'none';
        }
    }
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
    // Privacy: only send the allowed fields — IBAN, Saldo, Kontonummer etc. are never included
    const toImport = parsedRows.filter(r => r._include).map(({ date, name, notes, amount, type, account_id }) =>
        ({ date, name, notes, amount, type, account_id })
    );
    if (toImport.length === 0) { ggcToast('Keine Transaktionen ausgewählt.', true); return; }

    const btn = document.getElementById('importBtn');
    btn.disabled = true;
    btn.innerHTML = '<i class="ri-loader-4-line" style="animation:spin 1s linear infinite;display:inline-block;"></i> Importiere…';

    try {
        const mode = document.getElementById('importMode')?.value || 'privat';
        const endpoint = mode === 'haushalt' ? '/users/haushalt/import/transactions' : '/users/import/transactions';
        const res = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ transactions: toImport })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || 'Fehler');

        // Saldo-Anpassung ZUERST, bevor setStep(4) zeigt (verhindert Abbruch durch Navigation)
        const manualInput = document.getElementById('manualSaldoInput');
        const manualVal = manualInput?.value.trim();
        if (manualVal) _pendingSaldo = parseAmount(manualVal);

        const saldoMode = document.querySelector('input[name="saldoMode"]:checked')?.value || 'target';
        const appliedSaldoValue = _pendingSaldo;
        let saldoApplied = false;
        const saldoAccId = toImport.find(r => r.account_id)?.account_id || getDefaultAccountId();
        if (appliedSaldoValue !== null && saldoAccId && saldoMode === 'target') {
            saldoApplied = await applyDetectedSaldo(appliedSaldoValue, saldoAccId);
        }

        document.getElementById('doneTitle').textContent = `${data.imported} Transaktion(en) importiert!`;
        let doneMsg = 'Deine Transaktionen wurden erfolgreich in den Ausgabentracker importiert.';
        if (data.duplicates > 0) doneMsg += ` ${data.duplicates} Duplikat(e) wurden übersprungen.`;
        if (saldoApplied) doneMsg += ` Kontostand wurde auf ${fmt.format(appliedSaldoValue)} aktualisiert.`;
        document.getElementById('doneMsg').textContent = doneMsg;
        setStep(4);
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

async function applyDetectedSaldo(saldo, accountId) {
    try {
        const res = await fetch(`/users/accounts/${accountId}/set-balance`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ targetBalance: saldo })
        });
        const d = await res.json();
        if (!res.ok) throw new Error(d.message);
        _pendingSaldo = null;
        return true;
    } catch (err) {
        console.error('Kontostand-Anpassung fehlgeschlagen:', err.message);
        ggcToast('Kontostand konnte nicht angepasst werden: ' + err.message, true);
        return false;
    }
}

function resetImport() {
    csvRawRows = [];
    csvHeaders = [];
    parsedRows = [];
    colMap = {};
    selectedPreset = 'auto';
    _existingHashes = new Set();
    _pendingSaldo = null;
    const manualSaldo = document.getElementById('manualSaldoInput');
    if (manualSaldo) manualSaldo.value = '';
    const saldoHint = document.getElementById('saldoHint');
    if (saldoHint) { saldoHint.style.display = 'none'; saldoHint.textContent = ''; }
    const saldoModeRow = document.getElementById('saldoModeRow');
    if (saldoModeRow) saldoModeRow.style.display = 'none';
    const targetRadio = document.querySelector('input[name="saldoMode"][value="target"]');
    if (targetRadio) targetRadio.checked = true;
    const defSel = document.getElementById('defaultAccountSelect');
    if (defSel) defSel.value = '';
    document.getElementById('csvFileInput').value = '';
    document.getElementById('step1FileInfo').style.display = 'none';
    document.getElementById('step1FileInfo').innerHTML = '';
    document.getElementById('step1Msg').textContent = '';
    document.getElementById('toStep2Btn').disabled = true;
    document.querySelectorAll('.imp-preset-btn').forEach(b => b.classList.remove('active'));
    document.querySelector('[data-preset="auto"]').classList.add('active');
    setStep(1);
}

