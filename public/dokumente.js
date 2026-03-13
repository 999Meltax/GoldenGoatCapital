// ══════════════════════════════════════════════════════════════
//  DOKUMENTE.JS  –  Golden Goat Capital Dokumentenportal
// ══════════════════════════════════════════════════════════════

const TYP_CONFIG = {
    rechnungen: { label: 'Rechnung',          icon: 'ri-file-text-line',          bg: 'rgba(99,88,230,0.15)',  color: '#8b7ff5' },
    gehalt:     { label: 'Gehaltsabrechnung', icon: 'ri-money-euro-circle-line',   bg: 'rgba(34,197,94,0.15)', color: '#22c55e' },
    steuer:     { label: 'Steuerdokument',    icon: 'ri-government-line',          bg: 'rgba(245,158,11,0.15)',color: '#f59e0b' },
    sonstiges:  { label: 'Sonstiges',         icon: 'ri-folder-line',              bg: 'rgba(239,68,68,0.12)', color: '#ef4444' },
};

const STEUER_CHECKLISTE = [
    { key: 'lohnsteuerbescheinigung', label: 'Lohnsteuerbescheinigung' },
    { key: 'steuerbescheid',          label: 'Steuerbescheid' },
    { key: 'spendenquittung',         label: 'Spendenquittung' },
    { key: 'versicherungsnachweis',   label: 'Versicherungsnachweis' },
    { key: 'werbungskosten',          label: 'Werbungskosten-Beleg' },
];

const fmt = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });

let allDokumente  = [];
let activeTab     = 'alle';
let currentView   = 'grid';
let currentDocId  = null;
let selectedFile  = null;
let ctxMenu       = null;

// ── Init ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    loadDokumente();
    setupDatumSync();

    // Klick außerhalb schließt Kontextmenü
    document.addEventListener('click', () => removeCtxMenu());

    // Stat-Karten → Tab-Wechsel
    document.querySelectorAll('.dok-stat-card[data-tab]').forEach(card => {
        card.addEventListener('click', () => {
            const tab = card.dataset.tab;
            const btn = document.querySelector('.dok-tab[data-tab="' + tab + '"]');
            if (btn) switchTab(tab, btn);
        });
    });
});

function setupDatumSync() {
    const datumInput = document.getElementById('uploadDatum');
    const jahrInput  = document.getElementById('uploadJahr');
    if (datumInput && jahrInput) {
        datumInput.addEventListener('change', () => {
            if (datumInput.value) jahrInput.value = datumInput.value.split('-')[0];
        });
        // Heutiges Datum vorausfüllen
        const today = new Date().toISOString().split('T')[0];
        datumInput.value = today;
        jahrInput.value  = today.split('-')[0];
    }
}

// ── API ──────────────────────────────────────────────────────
async function loadDokumente() {
    try {
        const res = await fetch('/users/dokumente/data');
        if (!res.ok) throw new Error();
        allDokumente = await res.json();
        buildJahrFilter();
        buildSteuerJahrSelect();
        renderStats();
        filterDokumente();
    } catch (err) {
        console.error('Fehler beim Laden der Dokumente:', err);
        allDokumente = [];
        renderStats();
        filterDokumente();
    }
}

// ── Statistiken ──────────────────────────────────────────────
function renderStats() {
    const count = (typ) => allDokumente.filter(d => d.typ === typ).length;
    document.getElementById('statRechnungen').textContent = count('rechnungen');
    document.getElementById('statGehalt').textContent     = count('gehalt');
    document.getElementById('statSteuer').textContent     = count('steuer');
    document.getElementById('statSonstiges').textContent  = count('sonstiges');

    // Offene Rechnungen Badge
    const offen = allDokumente.filter(d => d.typ === 'rechnungen' && getEffectiveStatus(d) !== 'bezahlt').length;
    const offenBadge = document.getElementById('statRechnungenOffen');
    if (offenBadge) {
        if (offen > 0) { offenBadge.textContent = offen + ' offen'; offenBadge.style.display = ''; }
        else             { offenBadge.style.display = 'none'; }
    }
}

function getEffectiveStatus(doc) {
    if (doc.status === 'bezahlt') return 'bezahlt';
    if (doc.faellig_datum && new Date(doc.faellig_datum) < new Date()) return 'ueberfaellig';
    return doc.status || 'offen';
}

// ── Jahr-Filter aufbauen ─────────────────────────────────────
function buildJahrFilter() {
    const select = document.getElementById('dokJahrFilter');
    const years = [...new Set(allDokumente.map(d => d.jahr).filter(Boolean))].sort((a,b) => b-a);
    select.innerHTML = '<option value="">Alle Jahre</option>' +
        years.map(y => '<option value="' + y + '">' + y + '</option>').join('');
}

function buildSteuerJahrSelect() {
    const select = document.getElementById('steuerJahrSelect');
    const steuerDoks = allDokumente.filter(d => d.typ === 'steuer');
    const years = [...new Set(steuerDoks.map(d => d.steuerjahr || d.jahr).filter(Boolean))].sort((a,b) => b-a);
    const currentYear = new Date().getFullYear();
    const allYears = [...new Set([currentYear - 1, currentYear, ...years])].sort((a,b) => b-a);
    select.innerHTML = allYears.map(y => '<option value="' + y + '">' + y + '</option>').join('');
    renderSteuerChecklist();
}

// ── Steuer-Checkliste ────────────────────────────────────────
function renderSteuerChecklist() {
    const select = document.getElementById('steuerJahrSelect');
    const container = document.getElementById('steuerChecklistItems');
    if (!select || !container) return;
    const jahr = parseInt(select.value);
    const steuerDoks = allDokumente.filter(d => d.typ === 'steuer' && (d.steuerjahr == jahr || d.jahr == jahr));
    const vorhandenKeys = new Set(steuerDoks.map(d => d.steuer_art).filter(Boolean));

    container.innerHTML = STEUER_CHECKLISTE.map(item => {
        const done = vorhandenKeys.has(item.key);
        return '<div class="dok-checklist-item ' + (done ? 'done' : '') + '">' +
            '<i class="dok-check-icon ' + (done ? 'ri-checkbox-circle-fill' : 'ri-checkbox-blank-circle-line') + '"></i>' +
            '<span>' + item.label + '</span>' +
        '</div>';
    }).join('');

    const doneCount = STEUER_CHECKLISTE.filter(i => vorhandenKeys.has(i.key)).length;
    const badge = document.getElementById('statSteuerChecklist');
    if (badge) {
        badge.textContent = doneCount + '/' + STEUER_CHECKLISTE.length;
        badge.style.display = '';
        badge.style.background = doneCount === STEUER_CHECKLISTE.length ? 'var(--green)' : 'var(--amber)';
    }
}

// ── Tab-Wechsel ──────────────────────────────────────────────
function switchTab(tab, el) {
    activeTab = tab;
    document.querySelectorAll('.dok-tab').forEach(t => t.classList.remove('active'));
    if (el) el.classList.add('active');

    const steuerChecklist = document.getElementById('steuerChecklist');
    if (steuerChecklist) steuerChecklist.style.display = tab === 'steuer' ? '' : 'none';

    // Status-Filter nur bei Rechnungen sinnvoll
    const statusFilter = document.getElementById('dokStatusFilter');
    if (statusFilter) statusFilter.style.display = (tab === 'rechnungen' || tab === 'alle') ? '' : 'none';

    filterDokumente();
}

// ── Filter + Render ──────────────────────────────────────────
function filterDokumente() {
    const search = (document.getElementById('dokSearch')?.value || '').toLowerCase();
    const jahr   = document.getElementById('dokJahrFilter')?.value || '';
    const status = document.getElementById('dokStatusFilter')?.value || '';

    let filtered = allDokumente.filter(d => {
        if (activeTab !== 'alle' && d.typ !== activeTab) return false;
        if (jahr && String(d.jahr) !== String(jahr)) return false;
        if (status && getEffectiveStatus(d) !== status) return false;
        if (search) {
            const haystack = [d.name, d.aussteller, d.arbeitgeber, d.kategorie, d.notiz].join(' ').toLowerCase();
            if (!haystack.includes(search)) return false;
        }
        return true;
    });

    // Sortierung: neueste zuerst
    filtered.sort((a, b) => (b.datum || '').localeCompare(a.datum || ''));

    renderDokumente(filtered);
    renderStats();
}

function renderDokumente(docs) {
    const container = document.getElementById('dokumenteContainer');
    const empty     = document.getElementById('dokEmpty');
    if (!container) return;

    if (!docs.length) {
        container.innerHTML = '';
        container.className = '';
        if (empty) empty.style.display = '';
        return;
    }
    if (empty) empty.style.display = 'none';

    if (currentView === 'grid') {
        container.className = 'dok-grid';
        container.innerHTML = docs.map(d => renderGridCard(d)).join('');
    } else {
        container.className = 'dok-list';
        container.innerHTML =
            '<div class="dok-list-row" style="pointer-events:none;opacity:0.5;font-size:0.72rem;text-transform:uppercase;letter-spacing:0.06em;color:var(--text-3);">' +
                '<div style="width:34px;flex-shrink:0;"></div>' +
                '<div style="flex:1;">Bezeichnung</div>' +
                '<div style="width:130px;flex-shrink:0;">Typ</div>' +
                '<div style="width:90px;flex-shrink:0;">Datum</div>' +
                '<div style="width:90px;flex-shrink:0;text-align:right;">Betrag</div>' +
            '</div>' +
            docs.map(d => renderListRow(d)).join('');
    }
}

function renderGridCard(d) {
    const cfg = TYP_CONFIG[d.typ] || TYP_CONFIG.sonstiges;
    const status = getEffectiveStatus(d);
    const statusLabel = { offen: 'Offen', bezahlt: 'Bezahlt', ueberfaellig: 'Überfällig' };
    const showStatus = d.typ === 'rechnungen';

    return '<div class="dok-card" data-typ="' + d.typ + '" onclick="openDetail(' + d.id + ')">' +
        '<div class="dok-card-top">' +
            '<div class="dok-card-icon" style="background:' + cfg.bg + ';color:' + cfg.color + ';">' +
                '<i class="' + cfg.icon + '"></i>' +
            '</div>' +
            '<button class="dok-card-menu" onclick="openCtxMenu(event,' + d.id + ')" title="Optionen">' +
                '<i class="ri-more-2-fill"></i>' +
            '</button>' +
        '</div>' +
        '<div>' +
            '<div class="dok-card-name" title="' + escHtml(d.name) + '">' + escHtml(d.name) + '</div>' +
            '<div class="dok-card-sub">' +
                cfg.label +
                (d.aussteller ? ' · ' + escHtml(d.aussteller) : '') +
                (d.arbeitgeber ? ' · ' + escHtml(d.arbeitgeber) : '') +
            '</div>' +
        '</div>' +
        '<div class="dok-card-meta">' +
            '<span style="color:var(--text-3);font-size:0.75rem;">' +
                (d.datum ? new Date(d.datum).toLocaleDateString('de-DE') : '—') +
            '</span>' +
            (showStatus
                ? '<span class="dok-status-badge ' + status + '">' + (statusLabel[status] || status) + '</span>'
                : (d.betrag ? '<span style="font-weight:700;font-size:0.85rem;color:var(--text-1);">' + fmt.format(d.betrag) + '</span>' : '')
            ) +
        '</div>' +
    '</div>';
}

function renderListRow(d) {
    const cfg = TYP_CONFIG[d.typ] || TYP_CONFIG.sonstiges;
    const betragStr = d.betrag ? fmt.format(d.betrag) : (d.netto ? fmt.format(d.netto) : '—');
    return '<div class="dok-list-row" onclick="openDetail(' + d.id + ')">' +
        '<div class="dok-list-icon" style="background:' + cfg.bg + ';color:' + cfg.color + ';">' +
            '<i class="' + cfg.icon + '"></i>' +
        '</div>' +
        '<div class="dok-list-name" title="' + escHtml(d.name) + '">' + escHtml(d.name) + '</div>' +
        '<div class="dok-list-typ">' + cfg.label + '</div>' +
        '<div class="dok-list-date">' + (d.datum ? new Date(d.datum).toLocaleDateString('de-DE') : '—') + '</div>' +
        '<div class="dok-list-betrag">' + betragStr + '</div>' +
    '</div>';
}

// ── Ansicht ──────────────────────────────────────────────────
function setView(v) {
    currentView = v;
    document.getElementById('viewGrid').classList.toggle('active', v === 'grid');
    document.getElementById('viewList').classList.toggle('active', v === 'list');
    filterDokumente();
}

// ── Upload Modal ─────────────────────────────────────────────
function openUploadModal() {
    document.getElementById('uploadModal').classList.add('active');
    document.getElementById('uploadDatum').value = new Date().toISOString().split('T')[0];
    document.getElementById('uploadJahr').value  = new Date().getFullYear();
    document.getElementById('uploadSteuerjahr') && (document.getElementById('uploadSteuerjahr').value = new Date().getFullYear() - 1);
    updateFormFields();
}

function closeUploadModal(e) {
    if (e && e.target !== document.getElementById('uploadModal')) return;
    document.getElementById('uploadModal').classList.remove('active');
    clearFile();
    clearUploadForm();
}

function clearUploadForm() {
    ['uploadName','uploadBetrag','uploadFaellig','uploadAussteller','uploadNotiz',
     'uploadBrutto','uploadNetto','uploadArbeitgeber'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    const uploadStatus = document.getElementById('uploadStatus');
    if (uploadStatus) uploadStatus.value = 'offen';
}

function updateFormFields() {
    const typ = document.getElementById('uploadTyp')?.value;
    document.getElementById('fieldsetRechnung').style.display = typ === 'rechnungen' ? 'flex' : 'none';
    document.getElementById('fieldsetGehalt').style.display   = typ === 'gehalt'     ? 'flex' : 'none';
    document.getElementById('fieldsetSteuer').style.display   = typ === 'steuer'     ? 'flex' : 'none';

    // Status-Filter im Toolbar
    const statusFilter = document.getElementById('dokStatusFilter');
    if (statusFilter) statusFilter.style.display = (activeTab === 'rechnungen' || activeTab === 'alle') ? '' : 'none';
}

// ── Datei-Handling ───────────────────────────────────────────
function handleDrop(e) {
    e.preventDefault();
    document.getElementById('dropzone').classList.remove('drag');
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
}

function handleFileSelect(e) {
    const file = e.target.files[0];
    if (file) processFile(file);
}

function processFile(file) {
    if (file.size > 10 * 1024 * 1024) { ggcToast('Datei zu groß. Max. 10 MB.', true); return; }
    selectedFile = file;

    // Icons je Dateityp
    const ext = file.name.split('.').pop().toLowerCase();
    const iconMap = { pdf: 'ri-file-pdf-line', jpg: 'ri-image-line', jpeg: 'ri-image-line', png: 'ri-image-line', doc: 'ri-file-word-line', docx: 'ri-file-word-line' };

    document.getElementById('previewIcon').innerHTML = '<i class="' + (iconMap[ext] || 'ri-file-line') + '"></i>';
    document.getElementById('previewName').textContent = file.name;
    document.getElementById('previewSize').textContent = formatBytes(file.size);
    document.getElementById('filePreview').style.display = 'flex';
    document.getElementById('dropzone').style.display = 'none';

    // Namen vorausfüllen
    if (!document.getElementById('uploadName').value) {
        document.getElementById('uploadName').value = file.name.replace(/\.[^/.]+$/, '');
    }
}

function clearFile() {
    selectedFile = null;
    document.getElementById('fileInput').value = '';
    document.getElementById('filePreview').style.display = 'none';
    document.getElementById('dropzone').style.display = '';
}

// ── Upload speichern ─────────────────────────────────────────
async function submitUpload() {
    const btn  = document.getElementById('uploadSubmitBtn');
    const name = document.getElementById('uploadName').value.trim();
    const typ  = document.getElementById('uploadTyp').value;
    const datum = document.getElementById('uploadDatum').value;

    if (!name) { ggcToast('Bitte eine Bezeichnung eingeben.', true); return; }
    if (!datum) { ggcToast('Bitte ein Datum wählen.', true); return; }

    btn.disabled = true;
    btn.innerHTML = '<i class="ri-loader-4-line" style="animation:spin 1s linear infinite;"></i> Wird hochgeladen…';

    try {
        let fileData = null;
        let fileExt  = null;
        let fileMime = null;

        if (selectedFile) {
            fileData = await toBase64(selectedFile);
            fileExt  = selectedFile.name.split('.').pop().toLowerCase();
            fileMime = selectedFile.type;
        }

        const payload = {
            typ, name, datum,
            jahr:        datum ? parseInt(datum.split('-')[0]) : null,
            notiz:       document.getElementById('uploadNotiz')?.value.trim() || '',
            file_data:   fileData,
            file_ext:    fileExt,
            file_mime:   fileMime,
        };

        if (typ === 'rechnungen') {
            payload.betrag       = parseFloat(document.getElementById('uploadBetrag')?.value) || null;
            payload.faellig_datum = document.getElementById('uploadFaellig')?.value || null;
            payload.aussteller   = document.getElementById('uploadAussteller')?.value.trim() || '';
            payload.status       = document.getElementById('uploadStatus')?.value || 'offen';
            payload.kategorie    = document.getElementById('uploadKategorie')?.value || '';
        }
        if (typ === 'gehalt') {
            payload.brutto       = parseFloat(document.getElementById('uploadBrutto')?.value) || null;
            payload.netto        = parseFloat(document.getElementById('uploadNetto')?.value) || null;
            payload.arbeitgeber  = document.getElementById('uploadArbeitgeber')?.value.trim() || '';
            payload.monat        = document.getElementById('uploadMonat')?.value || '';
        }
        if (typ === 'steuer') {
            payload.steuer_art   = document.getElementById('uploadSteuerArt')?.value || '';
            payload.steuerjahr   = parseInt(document.getElementById('uploadSteuerjahr')?.value) || null;
        }

        const res = await fetch('/users/dokumente/add', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!res.ok) throw new Error((await res.json()).message || 'Fehler');

        closeUploadModal();
        clearUploadForm();
        await loadDokumente();
    } catch (err) {
        ggcToast('Fehler beim Hochladen: ' + err.message, true);
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="ri-upload-2-line"></i> Hochladen';
    }
}

function toBase64(file) {
    return new Promise((res, rej) => {
        const r = new FileReader();
        r.onload  = () => res(r.result);
        r.onerror = rej;
        r.readAsDataURL(file);
    });
}

// ── Detail: Navigation zur Detailseite ───────────────────────
function openDetail(id) {
    window.location.href = '/users/dokumente/' + id + '/detail';
}

function closeDetailModal(e) {
    // nicht mehr verwendet – bleibt für Rückwärtskompatibilität
}

function downloadCurrentDoc() {
    // nicht mehr verwendet
}

// ── Kontextmenü ──────────────────────────────────────────────
function openCtxMenu(e, id) {
    e.stopPropagation();
    removeCtxMenu();
    const d   = allDokumente.find(x => x.id === id);
    if (!d) return;
    const status = getEffectiveStatus(d);

    ctxMenu = document.createElement('div');
    ctxMenu.className = 'dok-ctx-menu';
    ctxMenu.style.left = e.pageX + 'px';
    ctxMenu.style.top  = e.pageY + 'px';

    let html = '<button class="dok-ctx-item" onclick="openDetail(' + id + ');removeCtxMenu()"><i class="ri-eye-line"></i> Details</button>';
    if (d.file_data) {
        html += '<button class="dok-ctx-item" onclick="downloadDoc(' + id + ');removeCtxMenu()"><i class="ri-download-line"></i> Herunterladen</button>';
    }
    if (d.typ === 'rechnungen' && status !== 'bezahlt') {
        html += '<button class="dok-ctx-item" onclick="markBezahlt(' + id + ');removeCtxMenu()"><i class="ri-checkbox-circle-line"></i> Als bezahlt</button>';
    }
    html += '<button class="dok-ctx-item danger" onclick="deleteDokument(' + id + ');removeCtxMenu()"><i class="ri-delete-bin-line"></i> Löschen</button>';

    ctxMenu.innerHTML = html;
    document.body.appendChild(ctxMenu);

    // Overflow-Check
    requestAnimationFrame(() => {
        if (!ctxMenu) return;
        const rect = ctxMenu.getBoundingClientRect();
        if (rect.right  > window.innerWidth)  ctxMenu.style.left = (e.pageX - rect.width)  + 'px';
        if (rect.bottom > window.innerHeight) ctxMenu.style.top  = (e.pageY - rect.height) + 'px';
    });
}

function removeCtxMenu() {
    if (ctxMenu) { ctxMenu.remove(); ctxMenu = null; }
}

function downloadDoc(id) {
    const d = allDokumente.find(x => x.id === id);
    if (!d || !d.file_data) return;
    const a = document.createElement('a');
    a.href = d.file_data;
    a.download = d.name + '.' + (d.file_ext || 'pdf');
    a.click();
}

// ── CRUD-Aktionen ────────────────────────────────────────────
async function markBezahlt(id) {
    try {
        const res = await fetch('/users/dokumente/' + id + '/status', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'bezahlt' })
        });
        if (!res.ok) throw new Error();
        await loadDokumente();
        // Detail-Modal aktualisieren falls offen
        if (currentDocId === id) openDetail(id);
    } catch { ggcToast('Fehler beim Aktualisieren.', true); }
}

async function deleteDokument(id) {
    ggcConfirm('Dokument wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.', async () => {
        try {
            const res = await fetch('/users/dokumente/delete/' + id, { method: 'DELETE' });
            if (!res.ok) throw new Error();
            document.getElementById('detailModal').classList.remove('active');
            currentDocId = null;
            await loadDokumente();
        } catch { ggcToast('Fehler beim Löschen.', true); }
    });
}

// ── Hilfsfunktionen ──────────────────────────────────────────
function escHtml(str) {
    return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function formatBytes(bytes) {
    if (bytes < 1024)         return bytes + ' B';
    if (bytes < 1024 * 1024)  return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function monatName(m) {
    const namen = ['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'];
    return namen[parseInt(m) - 1] || m;
}

function steuerArtLabel(key) {
    const map = {
        lohnsteuerbescheinigung: 'Lohnsteuerbescheinigung',
        steuerbescheid:          'Steuerbescheid',
        spendenquittung:         'Spendenquittung',
        versicherungsnachweis:   'Versicherungsnachweis',
        werbungskosten:          'Werbungskosten-Beleg',
        sonstiges:               'Sonstiges',
    };
    return map[key] || key;
}