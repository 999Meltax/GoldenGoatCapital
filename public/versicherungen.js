// ══════════════════════════════════════════════════════════════
//  VERSICHERUNGEN.JS  –  Golden Goat Capital
// ══════════════════════════════════════════════════════════════

const KAT = {
    kranken:     { label: 'Kranken',        icon: 'ri-heart-pulse-line',   bg: 'rgba(239,68,68,0.12)',   color: '#ef4444' },
    haftpflicht: { label: 'Haftpflicht',    icon: 'ri-shield-user-line',   bg: 'rgba(99,88,230,0.15)',   color: '#8b7ff5' },
    kfz:         { label: 'KFZ',            icon: 'ri-car-line',            bg: 'rgba(245,158,11,0.15)', color: '#f59e0b' },
    leben:       { label: 'Leben & Rente',  icon: 'ri-user-heart-line',     bg: 'rgba(34,197,94,0.15)',  color: '#22c55e' },
    hausrat:     { label: 'Hausrat',        icon: 'ri-home-3-line',         bg: 'rgba(59,130,246,0.15)', color: '#3b82f6' },
    berufs:      { label: 'Berufsunfähig',  icon: 'ri-briefcase-line',      bg: 'rgba(168,85,247,0.15)', color: '#a855f7' },
    rechtsschutz:{ label: 'Rechtsschutz',   icon: 'ri-scales-3-line',       bg: 'rgba(20,184,166,0.15)', color: '#14b8a6' },
    reise:       { label: 'Reise',          icon: 'ri-flight-takeoff-line', bg: 'rgba(249,115,22,0.15)', color: '#f97316' },
    unfall:      { label: 'Unfall',         icon: 'ri-first-aid-kit-line',  bg: 'rgba(236,72,153,0.15)', color: '#ec4899' },
    sonstiges:   { label: 'Sonstiges',      icon: 'ri-shield-line',         bg: 'rgba(107,114,128,0.15)',color: '#9ca3af' },
};

const RHYTHMUS_FAK   = { monatlich: 12, vierteljaehrlich: 4, halbjaehrlich: 2, jaehrlich: 1 };
const RHYTHMUS_LABEL = { monatlich: 'monatlich', vierteljaehrlich: 'vierteljährl.', halbjaehrlich: 'halbjährl.', jaehrlich: 'jährlich' };
const STATUS_LABEL   = { aktiv: 'Aktiv', pausiert: 'Pausiert', gekuendigt: 'Gekündigt' };

const fmtEur = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });
const fmtK   = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });

let allVers   = [];
let activeKat = 'alle';
let curId     = null;
let selKat    = 'sonstiges';

// ── Init ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    buildKatPicker();
    load();
});

// ── Daten laden ───────────────────────────────────────────────
async function load() {
    try {
        const r = await fetch('/users/versicherungen/data');
        if (!r.ok) throw new Error();
        allVers = await r.json();
    } catch { allVers = []; }
    renderStats();
    renderGrid();
}

// ── Statistiken ───────────────────────────────────────────────
function renderStats() {
    const aktiv = allVers.filter(v => v.status === 'aktiv');
    const jahrGesamt  = aktiv.reduce((s, v) => s + jahrBeitrag(v), 0);
    const monatGesamt = jahrGesamt / 12;

    document.getElementById('sAktiv').textContent = aktiv.length;
    document.getElementById('sJahr').textContent  = fmtK.format(jahrGesamt);
    document.getElementById('sMonat').textContent = fmtEur.format(monatGesamt);

    // Handlungsbedarf: Kündigungsfrist läuft ab oder Vertrag endet bald
    const warn = allVers.filter(v => {
        if (!v.ende) return false;
        const d = daysUntil(v.ende);
        if (v.kuendigungsfrist) {
            return (d - parseFristTage(v.kuendigungsfrist)) <= 14;
        }
        return d >= 0 && d <= 60;
    });

    const warnEl   = document.getElementById('sWarn');
    const warnCard = document.getElementById('sWarnCard');
    if (warn.length > 0) {
        warnEl.textContent        = warn.length + ' Vertrag' + (warn.length > 1 ? 'e' : '') + ' beachten';
        warnEl.style.color        = 'var(--red)';
        warnCard.style.borderColor = 'rgba(239,68,68,0.35)';
        warnCard.style.background  = 'rgba(239,68,68,0.04)';
    } else {
        warnEl.textContent         = 'Alles OK';
        warnEl.style.color         = 'var(--green)';
        warnCard.style.borderColor = '';
        warnCard.style.background  = '';
    }
}

// ── Grid rendern ───────────────────────────────────────────────
function renderGrid() {
    const grid  = document.getElementById('vsGrid');
    const empty = document.getElementById('vsEmpty');
    if (!grid) return;

    const list = activeKat === 'alle' ? allVers : allVers.filter(v => v.kategorie === activeKat);

    if (!list.length) {
        grid.innerHTML = '';
        empty.style.display = '';
        return;
    }
    empty.style.display = 'none';

    // Sortierung: aktiv zuerst, dann alphabetisch
    const sorted = [...list].sort((a, b) => {
        if (a.status === 'aktiv' && b.status !== 'aktiv') return -1;
        if (a.status !== 'aktiv' && b.status === 'aktiv') return 1;
        return (a.name || '').localeCompare(b.name || '');
    });

    grid.innerHTML = sorted.map(v => cardHtml(v)).join('');
}

// ── Karte bauen ────────────────────────────────────────────────
function cardHtml(v) {
    const cfg = KAT[v.kategorie] || KAT.sonstiges;
    const jb  = jahrBeitrag(v);

    // Warnstreifen
    let strips = '';
    if (v.ende) {
        const d = daysUntil(v.ende);
        if (d < 0) {
            strips += '<div class="vs-warn-strip"><i class="ri-time-line"></i> Vertrag abgelaufen</div>';
        } else if (v.kuendigungsfrist) {
            const fristTage = parseFristTage(v.kuendigungsfrist);
            const kuendBis  = d - fristTage;
            if (kuendBis <= 0) {
                strips += '<div class="vs-warn-strip"><i class="ri-alarm-warning-line"></i> Kündigungsfrist abgelaufen!</div>';
            } else if (kuendBis <= 30) {
                strips += '<div class="vs-kuend-strip"><i class="ri-calendar-close-line"></i> Kündigung bis in ' + kuendBis + ' Tagen möglich</div>';
            }
        } else if (d <= 60) {
            strips += '<div class="vs-warn-strip"><i class="ri-alarm-warning-line"></i> Läuft in ' + d + ' Tagen ab</div>';
        }
    }

    return '<div class="vs-card" data-id="' + v.id + '" onclick="openDetail(' + v.id + ')">' +
        '<style>.vs-card[data-id="' + v.id + '"]::before{background:linear-gradient(90deg,' + cfg.color + '55,' + cfg.color + ');}</style>' +
        // Hover-Buttons
        '<div class="vs-card-actions" onclick="event.stopPropagation()">' +
            '<button class="vs-act-btn" onclick="startEdit(' + v.id + ')" title="Bearbeiten"><i class="ri-edit-line"></i></button>' +
            '<button class="vs-act-btn del" onclick="deleteVers(' + v.id + ')" title="Löschen"><i class="ri-delete-bin-line"></i></button>' +
        '</div>' +
        // Kopf
        '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px;">' +
            '<div style="display:flex;gap:12px;align-items:flex-start;">' +
                '<div class="vs-card-icon" style="background:' + cfg.bg + ';color:' + cfg.color + ';"><i class="' + cfg.icon + '"></i></div>' +
                '<div>' +
                    '<div class="vs-card-name">' + esc(v.name) + '</div>' +
                    '<div class="vs-card-anbieter">' + (v.anbieter ? esc(v.anbieter) : cfg.label) + '</div>' +
                '</div>' +
            '</div>' +
            '<span class="vs-badge ' + (v.status || 'aktiv') + '">' + (STATUS_LABEL[v.status] || 'Aktiv') + '</span>' +
        '</div>' +
        // Daten-Zeilen
        '<div style="display:flex;flex-direction:column;gap:5px;">' +
            '<div class="vs-card-row"><span class="vs-card-row-lbl">Beitrag</span><span class="vs-card-row-val">' + (v.beitrag ? fmtEur.format(v.beitrag) + ' / ' + (RHYTHMUS_LABEL[v.rhythmus] || v.rhythmus) : '—') + '</span></div>' +
            '<div class="vs-card-row"><span class="vs-card-row-lbl">Jahreskosten</span><span class="vs-card-row-val" style="color:var(--accent-2);">' + (v.beitrag ? fmtK.format(jb) : '—') + '</span></div>' +
            (v.ende ? '<div class="vs-card-row"><span class="vs-card-row-lbl">Vertragsende</span><span class="vs-card-row-val">' + fmtDate(v.ende) + '</span></div>' : '') +
            (v.kuendigungsfrist ? '<div class="vs-card-row"><span class="vs-card-row-lbl">Kündigung</span><span class="vs-card-row-val">' + esc(v.kuendigungsfrist) + '</span></div>' : '') +
        '</div>' +
        strips +
    '</div>';
}

// ── Kategorie-Tabs ─────────────────────────────────────────────
function switchKat(kat, el) {
    activeKat = kat;
    document.querySelectorAll('.vs-tab').forEach(t => t.classList.remove('active'));
    if (el) el.classList.add('active');
    renderGrid();
}

// ── Kategorie-Picker (Modal) ───────────────────────────────────
function buildKatPicker() {
    const picker = document.getElementById('katPicker');
    if (!picker) return;
    picker.innerHTML = Object.entries(KAT).map(([key, c]) =>
        '<button type="button" class="vs-kat-btn" data-kat="' + key + '" onclick="pickKat(\'' + key + '\')">' +
            '<i class="' + c.icon + '" style="color:' + c.color + ';"></i>' + c.label +
        '</button>'
    ).join('');
}

function pickKat(kat) {
    selKat = kat;
    document.querySelectorAll('.vs-kat-btn').forEach(b => b.classList.toggle('active', b.dataset.kat === kat));
}

// ── Add Modal ──────────────────────────────────────────────────
function openAddModal() {
    clearForm();
    document.getElementById('fId').value = '';
    document.getElementById('modalHeadline').innerHTML = '<i class="ri-shield-plus-line"></i> Versicherung hinzufügen';
    pickKat('sonstiges');
    document.getElementById('vsModal').classList.add('active');
}

function closeModal(e) {
    if (e && e.target !== document.getElementById('vsModal')) return;
    document.getElementById('vsModal').classList.remove('active');
}

function clearForm() {
    ['fName','fAnbieter','fVertragsnr','fBeitrag','fBeginn','fEnde','fNotiz','fSB','fVS'].forEach(id => {
        const el = document.getElementById(id); if (el) el.value = '';
    });
    const s = document.getElementById('fStatus');  if (s) s.value = 'aktiv';
    const r = document.getElementById('fRhythmus'); if (r) r.value = 'monatlich';
    const k = document.getElementById('fKfrist');  if (k) k.value = '';
}

// ── Edit ───────────────────────────────────────────────────────
function startEdit(id) {
    const v = allVers.find(x => x.id === id);
    if (!v) return;
    clearForm();
    document.getElementById('fId').value         = v.id;
    document.getElementById('fName').value        = v.name || '';
    document.getElementById('fAnbieter').value    = v.anbieter || '';
    document.getElementById('fVertragsnr').value  = v.vertragsnr || '';
    document.getElementById('fBeitrag').value     = v.beitrag || '';
    document.getElementById('fBeginn').value      = v.beginn || '';
    document.getElementById('fEnde').value        = v.ende || '';
    document.getElementById('fNotiz').value       = v.notiz || '';
    document.getElementById('fSB').value          = v.selbstbeteiligung || '';
    document.getElementById('fVS').value          = v.versicherungssumme || '';
    document.getElementById('fStatus').value      = v.status || 'aktiv';
    document.getElementById('fRhythmus').value    = v.rhythmus || 'monatlich';
    document.getElementById('fKfrist').value      = v.kuendigungsfrist || '';
    pickKat(v.kategorie || 'sonstiges');
    document.getElementById('modalHeadline').innerHTML = '<i class="ri-edit-line"></i> Versicherung bearbeiten';
    document.getElementById('vsModal').classList.add('active');
}

function editCurrent() {
    closeDetail();
    if (curId) startEdit(curId);
}

// ── Speichern ──────────────────────────────────────────────────
async function saveVers() {
    const btn  = document.getElementById('saveBtn');
    const id   = document.getElementById('fId').value;
    const name = document.getElementById('fName').value.trim();
    if (!name) { ggcToast('Bitte einen Namen eingeben.', true); return; }

    btn.disabled = true;
    btn.innerHTML = '<i class="ri-loader-4-line" style="animation:spin 1s linear infinite;display:inline-block;"></i> Speichern…';

    const payload = {
        kategorie:          selKat,
        name,
        anbieter:           document.getElementById('fAnbieter').value.trim(),
        vertragsnr:         document.getElementById('fVertragsnr').value.trim(),
        status:             document.getElementById('fStatus').value,
        beitrag:            parseFloat(document.getElementById('fBeitrag').value) || null,
        rhythmus:           document.getElementById('fRhythmus').value,
        beginn:             document.getElementById('fBeginn').value || null,
        ende:               document.getElementById('fEnde').value || null,
        kuendigungsfrist:   document.getElementById('fKfrist').value || null,
        selbstbeteiligung:  parseFloat(document.getElementById('fSB').value) || null,
        versicherungssumme: parseFloat(document.getElementById('fVS').value) || null,
        notiz:              document.getElementById('fNotiz').value.trim(),
    };

    try {
        const url    = id ? '/users/versicherungen/' + id : '/users/versicherungen/add';
        const method = id ? 'PUT' : 'POST';
        const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        if (!r.ok) throw new Error((await r.json()).message || 'Fehler');
        closeModal();
        await load();
    } catch (err) {
        ggcToast('Fehler beim Speichern: ' + err.message, true);
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="ri-save-line"></i> Speichern';
    }
}

// ── Löschen ────────────────────────────────────────────────────
async function deleteVers(id) {
    ggcConfirm('Versicherung wirklich löschen?', async () => {
        try {
            const r = await fetch('/users/versicherungen/delete/' + id, { method: 'DELETE' });
            if (!r.ok) throw new Error();
            if (curId === id) closeDetail();
            await load();
        } catch { ggcToast('Fehler beim Löschen.', true); }
    });
}

// ── Detail: Navigation zur Detailseite ────────────────────────
function openDetail(id) {
    window.location.href = '/users/versicherungen/' + id + '/detail';
}

function closeDetail(e) {
    // nicht mehr verwendet – bleibt für Rückwärtskompatibilität
    const el = document.getElementById('vsDetail');
    if (el) el.classList.remove('active');
    curId = null;
}

// ── Hilfs-Funktionen ──────────────────────────────────────────
function jahrBeitrag(v) {
    return (parseFloat(v.beitrag) || 0) * (RHYTHMUS_FAK[v.rhythmus] || 12);
}
function daysUntil(d) {
    return Math.ceil((new Date(d) - new Date()) / 86400000);
}
function parseFristTage(f) {
    if (!f) return 0;
    return parseInt(f) * (f.includes('Monat') ? 30 : 1);
}
function fmtDate(d) {
    return d ? new Date(d).toLocaleDateString('de-DE') : '—';
}
function esc(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function costRow(label, val, max, color) {
    const pct = max > 0 ? Math.round((val / max) * 100) : 0;
    return '<div class="vs-cost-row">' +
        '<div class="vs-cost-lbl">' + label + '</div>' +
        '<div class="vs-cost-track"><div class="vs-cost-fill" style="width:' + pct + '%;background:' + color + ';"></div></div>' +
        '<div class="vs-cost-val">' + fmtEur.format(val) + '</div>' +
    '</div>';
}