// ═══════════════════════════════════════════════════════════
// GLOBAL STATE
// ═══════════════════════════════════════════════════════════
const fmt = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });

let allEintraege = [];
let allAccounts  = [];
let activeFilter = 'alle';
let buchId       = null;

// ═══════════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', async () => {
    await Promise.all([loadEintraege(), loadAccounts()]);
});

async function loadEintraege() {
    try {
        const res = await fetch('/users/fixkosten/unified');
        allEintraege = res.ok ? await res.json() : [];
    } catch(e) {
        allEintraege = [];
    }
    renderStats();
    renderList();
}

async function loadAccounts() {
    try {
        const res = await fetch('/users/accounts/all');
        allAccounts = res.ok ? await res.json() : [];
    } catch(e) {
        allAccounts = [];
    }
    // Konten in Privat und Haushalt aufteilen
    const privat   = allAccounts.filter(a => a._source !== 'haushalt');
    const haushalt = allAccounts.filter(a => a._source === 'haushalt');

    function buildOptsGrouped(includeEmpty, emptyLabel) {
        let html = includeEmpty ? `<option value="">${emptyLabel}</option>` : '';
        if (privat.length) {
            html += `<optgroup label="── Privat">` +
                privat.map(a => `<option value="${a.id}" data-source="privat">${esc(a.name)}</option>`).join('') +
                `</optgroup>`;
        }
        if (haushalt.length) {
            html += `<optgroup label="── Haushalt">` +
                haushalt.map(a => `<option value="${a.id}" data-source="haushalt" data-haushalt-id="${a._haushalt_id}">${esc(a.name)}</option>`).join('') +
                `</optgroup>`;
        }
        return html;
    }

    document.getElementById('fkKonto').innerHTML    = buildOptsGrouped(true, 'Kein Konto verknüpft');
    const toSel = document.getElementById('fkTransferTo');
    if (toSel) toSel.innerHTML = buildOptsGrouped(true, 'Bitte Zielkonto wählen');
}

// ═══════════════════════════════════════════════════════════
// STATISTIKEN
// ═══════════════════════════════════════════════════════════
function calcMonatlich(e) {
    const b = e.betrag || 0;
    switch(e.haeufigkeit) {
        case 'woechentlich': return b * 4.33;
        case 'monatlich':    return b;
        case 'viertelj':     return b / 3;
        case 'halbjaehrl':   return b / 6;
        case 'jaehrlich':    return b / 12;
        default:             return b;
    }
}

function renderStats() {
    const aktive = allEintraege.filter(e => e.aktiv);
    const monatlich = aktive.reduce((s, e) => {
        // Einnahmen nicht in Ausgaben-Summe
        if (e.tx_type === 'Einnahmen') return s;
        return s + calcMonatlich(e);
    }, 0);

    const heute = new Date();
    const in7 = new Date(); in7.setDate(in7.getDate() + 7);
    const faellig = aktive.filter(e => {
        if (!e.naechste_faelligkeit) return false;
        const d = new Date(e.naechste_faelligkeit);
        return d >= heute && d <= in7;
    }).length;

    document.getElementById('statMonatlich').textContent = fmt.format(monatlich);
    document.getElementById('statJaehrlich').textContent = fmt.format(monatlich * 12);
    document.getElementById('statAnzahl').textContent    = aktive.length;
    document.getElementById('statFaellig').textContent   = faellig;
}

// ═══════════════════════════════════════════════════════════
// FILTER & SORT
// ═══════════════════════════════════════════════════════════
function setFilter(filter, btn) {
    activeFilter = filter;
    document.querySelectorAll('.fk-filter-tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    renderList();
}

function renderList() {
    const search = (document.getElementById('searchInput').value || '').toLowerCase();
    const sort   = document.getElementById('sortSelect').value;

    let list = allEintraege.filter(e => {
        if (activeFilter !== 'alle' && e.subtyp !== activeFilter) return false;
        if (search && !e.name.toLowerCase().includes(search) && !(e.kategorie||'').toLowerCase().includes(search)) return false;
        return true;
    });

    list.sort((a, b) => {
        if (sort === 'betrag_desc') return (b.betrag||0) - (a.betrag||0);
        if (sort === 'betrag_asc')  return (a.betrag||0) - (b.betrag||0);
        if (sort === 'faellig') {
            const da = a.naechste_faelligkeit ? new Date(a.naechste_faelligkeit) : new Date('9999');
            const db = b.naechste_faelligkeit ? new Date(b.naechste_faelligkeit) : new Date('9999');
            return da - db;
        }
        return (a.name||'').localeCompare(b.name||'', 'de');
    });

    const el = document.getElementById('fkList');

    if (list.length === 0) {
        el.innerHTML = `<div class="fk-empty">
            <i class="ri-repeat-line"></i>
            <div style="font-weight:700;font-size:1rem;">Keine Einträge gefunden</div>
            <div style="font-size:0.83rem;margin-top:6px;">
                ${allEintraege.length === 0
                    ? 'Erstelle deinen ersten Eintrag über den Button oben.'
                    : 'Versuche einen anderen Filter oder Suchbegriff.'}
            </div>
        </div>`;
        return;
    }

    el.innerHTML = list.map(e => renderItem(e)).join('');
}

function renderItem(e) {
    const isEinnahme = e.tx_type === 'Einnahmen';
    const heute      = new Date();
    const rhythmusLabels = {
        woechentlich: 'wöchentlich', monatlich: 'monatlich',
        viertelj: 'vierteljährlich', halbjaehrl: 'halbjährlich', jaehrlich: 'jährlich'
    };

    // Badge
    const badges = {
        fixkosten: '<span class="fk-item-badge badge-fixkosten"><i class="ri-home-2-line"></i> Fixkosten</span>',
        abo:       '<span class="fk-item-badge badge-abo"><i class="ri-repeat-line"></i> Abo</span>',
        recurring: `<span class="fk-item-badge badge-recurring ${isEinnahme ? 'einnahme' : ''}"><i class="${isEinnahme ? 'ri-arrow-down-line' : 'ri-arrow-up-line'}"></i> ${isEinnahme ? 'Einnahme' : 'Ausgabe'}</span>`,
        transfer:  '<span class="fk-item-badge badge-transfer"><i class="ri-arrow-left-right-line"></i> Überweisung</span>',
    };

    // Zielkonto-Info für Transfers
    const transferZiel = e.transfer_to_account_id
        ? allAccounts.find(a => a.id == e.transfer_to_account_id)
        : null;

    // Icon & Farbe
    const iconMap = {
        wohnen: 'ri-home-2-line', versicherung: 'ri-shield-check-line',
        streaming: 'ri-film-line', software: 'ri-code-box-line',
        fitness: 'ri-heart-pulse-line', lebensmittel: 'ri-shopping-cart-line',
        transport: 'ri-car-line', kommunikation: 'ri-phone-line',
        gesundheit: 'ri-hospital-line', bildung: 'ri-book-line',
        unterhaltung: 'ri-gamepad-line', sonstiges: 'ri-repeat-line',
    };
    const colorMap = {
        wohnen: '#6358e6', versicherung: '#3b82f6', streaming: '#ef4444',
        software: '#8b5cf6', fitness: '#22c55e', lebensmittel: '#f59e0b',
        transport: '#0ea5e9', kommunikation: '#ec4899', gesundheit: '#14b8a6',
        bildung: '#f97316', unterhaltung: '#a855f7', sonstiges: '#64748b',
    };
    const kat    = e.kategorie || 'sonstiges';
    const icon   = e.icon || iconMap[kat] || 'ri-repeat-line';
    const color  = colorMap[kat] || '#64748b';
    const bgCol  = color + '22';

    // Fälligkeit
    let faelligHtml = '';
    if (e.naechste_faelligkeit) {
        const d    = new Date(e.naechste_faelligkeit);
        const tage = Math.ceil((d - heute) / (1000*60*60*24));
        const dStr = d.toLocaleDateString('de-DE', { day:'2-digit', month:'2-digit', year:'numeric' });
        if (tage <= 0)       faelligHtml = `<span class="fk-faellig-badge fk-faellig-heute">Heute fällig</span>`;
        else if (tage <= 3)  faelligHtml = `<span class="fk-faellig-badge fk-faellig-heute">in ${tage} Tagen</span>`;
        else if (tage <= 7)  faelligHtml = `<span class="fk-faellig-badge fk-faellig-bald">in ${tage} Tagen</span>`;
        else                 faelligHtml = `<span class="fk-faellig-badge fk-faellig-ok">${dStr}</span>`;
    }

    // Konto-Name / Transfer-Info
    const konto = allAccounts.find(a => a.id == e.account_id);
    let kontoInfo = konto ? `<span><i class="ri-bank-card-line"></i> ${esc(konto.name)}</span>` : '';
    if (e.subtyp === 'transfer' && transferZiel) {
        const vonName = konto ? esc(konto.name) : 'Extern';
        kontoInfo = `<span style="color:var(--accent);"><i class="ri-bank-card-line"></i> ${vonName} <i class="ri-arrow-right-line"></i> ${esc(transferZiel.name)}</span>`;
    }

    return `<div class="fk-item${e.aktiv ? '' : ' inaktiv'}">
        <div class="fk-item-icon" style="background:${bgCol};color:${color};">
            <i class="${icon}"></i>
        </div>
        <div class="fk-item-body">
            <div class="fk-item-name">${esc(e.name)}</div>
            <div class="fk-item-meta">
                ${badges[e.subtyp] || ''}
                <span>${esc(e.kategorie || 'Sonstiges')}</span>
                ${kontoInfo}
                ${faelligHtml}
                ${e.notiz ? `<span style="color:var(--text-3);">${esc(e.notiz)}</span>` : ''}
                ${!e.aktiv ? '<span style="color:var(--text-3);">(inaktiv)</span>' : ''}
            </div>
        </div>
        <div class="fk-item-right">
            <div class="fk-item-betrag ${e.subtyp === 'transfer' ? 'transfer' : (isEinnahme ? 'einnahme' : 'ausgabe')}">
                ${e.subtyp === 'transfer' ? '<i class="ri-arrow-left-right-line"></i> ' : (isEinnahme ? '+' : '-') + ' '}${fmt.format(e.betrag)}
            </div>
            <div class="fk-item-rhythmus">${rhythmusLabels[e.haeufigkeit] || e.haeufigkeit}</div>
        </div>
        <div class="fk-item-actions">
            <button class="fk-btn-sm book" onclick="openBuchModal(${e.id})" title="Jetzt buchen">
                <i class="ri-play-line"></i>
            </button>
            <button class="fk-btn-sm" onclick="openModal(${e.id})" title="Bearbeiten">
                <i class="ri-edit-line"></i>
            </button>
            <button class="fk-btn-sm danger" onclick="deleteEintrag(${e.id})" title="Löschen">
                <i class="ri-delete-bin-line"></i>
            </button>
        </div>
    </div>`;
}

// ═══════════════════════════════════════════════════════════
// MODAL ÖFFNEN / SCHLIESSEN
// ═══════════════════════════════════════════════════════════
function openModal(id = null) {
    const modal = document.getElementById('fkModal');
    modal.style.display = 'flex';

    if (id) {
        const e = allEintraege.find(x => x.id === id);
        if (!e) return;
        document.getElementById('modalTitle').textContent = 'Eintrag bearbeiten';
        document.getElementById('fkName').value       = e.name;
        document.getElementById('fkBetrag').value     = e.betrag;
        document.getElementById('fkRhythmus').value   = e.haeufigkeit || 'monatlich';
        document.getElementById('fkKategorie').value  = e.kategorie || 'sonstiges';
        document.getElementById('fkFaelligkeit').value= e.naechste_faelligkeit ? e.naechste_faelligkeit.substring(0,10) : '';
        document.getElementById('fkDatumTag').value   = e.datum_tag || 1;
        document.getElementById('fkTxType').value     = e.tx_type || 'Ausgaben';
        document.getElementById('fkKonto').value      = e.account_id || '';
        document.getElementById('fkNotiz').value      = e.notiz || '';
        document.getElementById('fkAktiv').checked    = !!e.aktiv;
        document.getElementById('fkEditId').value     = e.id;
        document.getElementById('fkSubtyp').value     = e.subtyp || 'fixkosten';
        const toSel = document.getElementById('fkTransferTo');
        if (toSel) toSel.value = e.transfer_to_account_id || '';
        selectType(e.subtyp || 'fixkosten', null, true);
    } else {
        document.getElementById('modalTitle').textContent = 'Neuer Eintrag';
        resetModal();
    }
    document.getElementById('fkName').focus();
}

function resetModal() {
    document.getElementById('fkName').value        = '';
    document.getElementById('fkBetrag').value      = '';
    document.getElementById('fkRhythmus').value    = 'monatlich';
    document.getElementById('fkKategorie').value   = 'sonstiges';
    document.getElementById('fkFaelligkeit').value = '';
    document.getElementById('fkDatumTag').value    = 1;
    document.getElementById('fkTxType').value      = 'Ausgaben';
    document.getElementById('fkKonto').value       = '';
    document.getElementById('fkNotiz').value       = '';
    document.getElementById('fkAktiv').checked     = true;
    document.getElementById('fkEditId').value      = '';
    document.getElementById('fkSubtyp').value      = 'fixkosten';
    document.getElementById('fkMsg').textContent   = '';
    const toSel = document.getElementById('fkTransferTo');
    if (toSel) toSel.value = '';
    selectType('fixkosten', null, true);
}

function closeModal() {
    document.getElementById('fkModal').style.display = 'none';
}

function closeModalBackdrop(e) {
    if (e.target === document.getElementById('fkModal')) closeModal();
}

function selectType(type, btn, silent = false) {
    document.getElementById('fkSubtyp').value = type;
    if (!silent) {
        document.querySelectorAll('.fk-type-btn').forEach(b => b.classList.remove('active'));
        if (btn) btn.classList.add('active');
        else {
            const b = document.querySelector(`.fk-type-btn[data-type="${type}"]`);
            if (b) b.classList.add('active');
        }
    } else {
        document.querySelectorAll('.fk-type-btn').forEach(b => b.classList.remove('active'));
        const b = document.querySelector(`.fk-type-btn[data-type="${type}"]`);
        if (b) b.classList.add('active');
    }

    // Felder ein-/ausblenden
    document.getElementById('fieldDatumTag').style.display   = (type === 'fixkosten') ? '' : 'none';
    document.getElementById('fieldTxType').style.display     = (type === 'recurring')  ? '' : 'none';
    document.getElementById('fieldTransferTo').style.display = (type === 'transfer')   ? '' : 'none';

    // Konto-Label anpassen
    const kontoLabel = document.querySelector('#fkKonto')?.closest('.form-group')?.querySelector('.form-label');
    if (kontoLabel) {
        kontoLabel.textContent = type === 'transfer' ? 'Von Konto (Quellkonto)' : 'Konto (optional)';
    }
}

// ═══════════════════════════════════════════════════════════
// SPEICHERN / LÖSCHEN
// ═══════════════════════════════════════════════════════════
async function saveEintrag() {
    const name     = document.getElementById('fkName').value.trim();
    const betrag   = parseFloat(document.getElementById('fkBetrag').value);
    const subtyp   = document.getElementById('fkSubtyp').value;
    const editId   = document.getElementById('fkEditId').value;

    if (!name || isNaN(betrag) || betrag < 0) {
        showMsg('Bitte Bezeichnung und einen gültigen Betrag eingeben.', true);
        return;
    }

    const transferToId = document.getElementById('fkTransferTo')?.value || null;
    if (subtyp === 'transfer' && !transferToId) {
        showMsg('Bitte ein Zielkonto für die Überweisung auswählen.', true);
        return;
    }
    const fromId = document.getElementById('fkKonto').value || null;
    if (subtyp === 'transfer' && fromId && fromId === transferToId) {
        showMsg('Quell- und Zielkonto dürfen nicht identisch sein.', true);
        return;
    }

    // _source und _haushalt_id aus den data-Attributen der gewählten Option lesen
    function getOptMeta(selId) {
        const sel = document.getElementById(selId);
        const opt = sel?.options[sel.selectedIndex];
        return {
            source:     opt?.dataset?.source     || 'privat',
            haushaltId: opt?.dataset?.haushaltId || null,
        };
    }
    const fromMeta = getOptMeta('fkKonto');
    const toMeta   = getOptMeta('fkTransferTo');

    const payload = {
        name,
        betrag,
        haeufigkeit:                document.getElementById('fkRhythmus').value,
        kategorie:                  document.getElementById('fkKategorie').value,
        naechste_faelligkeit:       document.getElementById('fkFaelligkeit').value || null,
        datum_tag:                  parseInt(document.getElementById('fkDatumTag').value) || 1,
        tx_type:                    document.getElementById('fkTxType').value,
        account_id:                 fromId,
        transfer_to_account_id:     subtyp === 'transfer' ? (transferToId || null) : null,
        transfer_to_source:         subtyp === 'transfer' ? toMeta.source   : null,
        transfer_to_haushalt_id:    subtyp === 'transfer' ? (toMeta.haushaltId || null) : null,
        notiz:                      document.getElementById('fkNotiz').value.trim(),
        aktiv:                      document.getElementById('fkAktiv').checked,
        subtyp,
    };

    try {
        let res;
        if (editId) {
            res = await fetch(`/users/fixkosten/unified/${editId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
        } else {
            res = await fetch('/users/fixkosten/unified/add', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
        }
        if (!res.ok) throw new Error();
        closeModal();
        await loadEintraege();
    } catch(e) {
        showMsg('Fehler beim Speichern.', true);
    }
}

async function deleteEintrag(id) {
    if (!confirm('Eintrag wirklich löschen?')) return;
    try {
        await fetch(`/users/fixkosten/unified/${id}`, { method: 'DELETE' });
        await loadEintraege();
    } catch(e) {
        alert('Fehler beim Löschen.');
    }
}

// ═══════════════════════════════════════════════════════════
// BUCHEN-MODAL
// ═══════════════════════════════════════════════════════════
function openBuchModal(id) {
    const e = allEintraege.find(x => x.id === id);
    if (!e) return;
    buchId = id;
    document.getElementById('buchInfo').textContent =
        `„${e.name}" – ${fmt.format(e.betrag)} wird als Transaktion gebucht.`;
    document.getElementById('buchModal').style.display = 'flex';
}

function closeBuchModal(ev) {
    if (ev && ev.target !== document.getElementById('buchModal')) return;
    document.getElementById('buchModal').style.display = 'none';
    buchId = null;
}

async function confirmBuchen() {
    if (!buchId) return;
    const id = buchId;
    document.getElementById('buchModal').style.display = 'none';
    buchId = null;
    try {
        const res = await fetch(`/users/fixkosten/unified/${id}/book`, { method: 'POST' });
        if (!res.ok) throw new Error();
        await loadEintraege();
    } catch(e) {
        alert('Fehler beim Buchen.');
    }
}

// ═══════════════════════════════════════════════════════════
// HILFSFUNKTIONEN
// ═══════════════════════════════════════════════════════════
function esc(str) {
    return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function showMsg(msg, isErr) {
    const el = document.getElementById('fkMsg');
    el.textContent = msg;
    el.style.color = isErr ? 'var(--red)' : 'var(--green)';
    setTimeout(() => { el.textContent = ''; }, 3000);
}