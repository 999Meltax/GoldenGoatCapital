const fmt = new Intl.NumberFormat('de-DE');

// DEFAULT_CATEGORIES entfernt (Phase 1-E) — Kategorien kommen vollständig aus der DB

let allRegeln    = [];
let allCategories = [];

// ═══════════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════════
async function init() {
    const [regelnRes, catRes, hausCatRes] = await Promise.all([
        fetch('/users/regeln/list'),
        fetch('/users/categories'),
        fetch('/users/haushalt/tracker/categories')
    ]);
    allRegeln = regelnRes.ok ? await regelnRes.json() : [];
    const userCats = catRes.ok ? await catRes.json() : [];
    const hausCats = hausCatRes.ok ? await hausCatRes.json() : [];
    const privNames = userCats.map(c => c.name);
    const hausNames = hausCats.map(c => c.name || c);
    // Merge and deduplicate, sorted alphabetically
    allCategories = [...new Set([...privNames, ...hausNames])].sort();
    populateCategorySelect();
    render();
}

function populateCategorySelect() {
    const sel = document.getElementById('mKategorie');
    sel.innerHTML = '<option value="">(nicht ändern)</option>' +
        allCategories.map(c => `<option value="${escHtml(c)}">${escHtml(c)}</option>`).join('');
    const quickSel = document.getElementById('quickRuleKat');
    if (quickSel) {
        quickSel.innerHTML = '<option value="">Bitte wählen…</option>' +
            allCategories.map(c => `<option value="${escHtml(c)}">${escHtml(c)}</option>`).join('');
    }
}

async function saveQuickRule() {
    const wert = (document.getElementById('quickRuleWert')?.value || '').trim();
    const kat  = document.getElementById('quickRuleKat')?.value || '';
    const msg  = document.getElementById('quickRuleMsg');
    if (!wert) { if (msg) { msg.textContent = 'Bitte einen Suchbegriff eingeben.'; msg.style.color = '#ef4444'; } return; }
    if (!kat)  { if (msg) { msg.textContent = 'Bitte eine Kategorie wählen.'; msg.style.color = '#ef4444'; } return; }
    try {
        const res = await fetch('/users/regeln/add', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ bedingung_operator: 'enthält', bedingung_wert: wert, aktion_kategorie: kat, aktion_typ: '', modus: 'beide', priority: 0 })
        });
        if (!res.ok) throw new Error('Fehler');
        if (msg) { msg.textContent = `Regel „${wert} → ${kat}" wurde angelegt.`; msg.style.color = '#22c55e'; }
        document.getElementById('quickRuleWert').value = '';
        document.getElementById('quickRuleKat').value = '';
        setTimeout(() => { if (msg) msg.textContent = ''; }, 3000);
        await init();
    } catch {
        if (msg) { msg.textContent = 'Fehler beim Anlegen der Regel.'; msg.style.color = '#ef4444'; }
    }
}

// ═══════════════════════════════════════════════════════════
// RENDER
// ═══════════════════════════════════════════════════════════
const OPERATOR_LABEL = {
    enthält:     'enthält',
    beginnt_mit: 'beginnt mit',
    endet_mit:   'endet mit',
    gleich:      'ist gleich'
};

const MODUS_BADGE = {
    beide:     { label: 'Beide',        icon: 'ri-global-line',     bg: 'rgba(99,88,230,.12)',  color: 'var(--accent)' },
    privat:    { label: 'Nur Privat',   icon: 'ri-user-line',       bg: 'rgba(99,88,230,.12)',  color: '#6358e6' },
    haushalt:  { label: 'Nur Haushalt', icon: 'ri-home-heart-line', bg: 'rgba(34,197,94,.12)',  color: '#22c55e' },
};

function render() {
    const el = document.getElementById('regelnList');
    if (allRegeln.length === 0) {
        el.innerHTML = `
            <div style="text-align:center;padding:64px 24px;">
                <i class="ri-magic-line" style="font-size:3rem;display:block;margin-bottom:14px;color:var(--text-3);opacity:0.4;"></i>
                <div style="font-weight:700;font-size:1.05rem;margin-bottom:8px;color:var(--text-1);">Noch keine Regeln</div>
                <div style="color:var(--text-3);font-size:0.875rem;max-width:360px;margin:0 auto 20px;line-height:1.6;">
                    Regeln kategorisieren neue Transaktionen automatisch — einmal einrichten, dauerhaft Zeit sparen.
                </div>
                <button onclick="document.getElementById('addRegelBtn')?.click()||document.querySelector('[data-action=add-regel]')?.click()" style="display:inline-flex;align-items:center;gap:6px;padding:9px 18px;background:var(--accent,#6c63ff);color:#fff;border:none;border-radius:8px;font-size:0.875rem;font-weight:600;cursor:pointer;font-family:inherit;">
                    <i class="ri-add-line"></i> Erste Regel erstellen
                </button>
            </div>`;
        return;
    }

    el.innerHTML = `
        <div style="display:grid;grid-template-columns:auto 1fr 1fr auto;gap:0;font-size:0.75rem;font-weight:600;color:var(--text-3);text-transform:uppercase;letter-spacing:.05em;padding:12px 20px;border-bottom:1px solid var(--border);">
            <div style="padding-right:16px;">#</div>
            <div>Wenn Name…</div>
            <div>Dann…</div>
            <div></div>
        </div>` +
        allRegeln.map((r, i) => {
            const aktionParts = [];
            if (r.aktion_kategorie) aktionParts.push(`<span class="badge" style="background:rgba(99,88,230,.15);color:var(--accent);">Kategorie: ${escHtml(r.aktion_kategorie)}</span>`);
            if (r.aktion_typ)       aktionParts.push(`<span class="badge" style="background:${r.aktion_typ === 'Einnahmen' ? 'rgba(34,197,94,.15)' : 'rgba(239,68,68,.15)'};color:${r.aktion_typ === 'Einnahmen' ? '#22c55e' : '#ef4444'};">${escHtml(r.aktion_typ)}</span>`);
            const mb = MODUS_BADGE[r.modus || 'beide'] || MODUS_BADGE.beide;
            aktionParts.push(`<span class="badge" style="background:${mb.bg};color:${mb.color};"><i class="${mb.icon}"></i> ${mb.label}</span>`);

            const prio = parseInt(r.priority) || 0;
            return `
            <div style="display:grid;grid-template-columns:auto 1fr 1fr auto;gap:0;align-items:center;padding:14px 20px;border-bottom:1px solid var(--border);${!r.aktiv ? 'opacity:.45;' : ''}">
                <div style="padding-right:16px;font-size:0.78rem;color:var(--text-3);font-weight:600;display:flex;flex-direction:column;align-items:center;gap:2px;">
                    <span>${i + 1}</span>
                    ${prio !== 0 ? `<span style="font-size:0.65rem;padding:1px 5px;border-radius:4px;background:${prio > 0 ? 'rgba(34,197,94,.15)' : 'rgba(239,68,68,.1)'};color:${prio > 0 ? '#22c55e' : '#ef4444'};">${prio > 0 ? '+' : ''}${prio}</span>` : ''}
                </div>
                <div style="font-size:0.88rem;">
                    <span style="color:var(--text-3);">${OPERATOR_LABEL[r.bedingung_operator] || r.bedingung_operator}</span>
                    <span style="font-weight:600;color:var(--text-1);margin-left:5px;">"${escHtml(r.bedingung_wert)}"</span>
                </div>
                <div style="display:flex;flex-wrap:wrap;gap:6px;">${aktionParts.join('') || '<span style="color:var(--text-3);font-size:0.8rem;">–</span>'}</div>
                <div style="display:flex;align-items:center;gap:6px;">
                    <button onclick="toggleAktiv(${r.id}, ${r.aktiv ? 0 : 1})" title="${r.aktiv ? 'Deaktivieren' : 'Aktivieren'}"
                        style="background:${r.aktiv ? 'rgba(34,197,94,.1)' : 'var(--surface-2)'};border:1px solid ${r.aktiv ? 'rgba(34,197,94,.3)' : 'var(--border)'};color:${r.aktiv ? '#22c55e' : 'var(--text-3)'};padding:4px 10px;border-radius:6px;cursor:pointer;font-size:0.75rem;">
                        <i class="ri-${r.aktiv ? 'checkbox-circle-line' : 'checkbox-blank-circle-line'}"></i>
                    </button>
                    <button onclick="openModal(${r.id})" style="background:var(--surface-2);border:1px solid var(--border);color:var(--text-3);padding:4px 10px;border-radius:6px;cursor:pointer;font-size:0.75rem;">
                        <i class="ri-edit-line"></i>
                    </button>
                    <button onclick="deleteRegel(${r.id})" style="background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.2);color:#ef4444;padding:4px 10px;border-radius:6px;cursor:pointer;font-size:0.75rem;">
                        <i class="ri-delete-bin-line"></i>
                    </button>
                </div>
            </div>`;
        }).join('');
}

// ═══════════════════════════════════════════════════════════
// MODAL
// ═══════════════════════════════════════════════════════════
function openModal(id = null) {
    document.getElementById('regelModal').style.display = 'flex';
    document.getElementById('modalMsg').textContent = '';
    document.getElementById('mEditId').value = id || '';

    if (id) {
        const r = allRegeln.find(r => r.id === id);
        if (!r) return;
        document.getElementById('modalTitle').textContent = 'Regel bearbeiten';
        document.getElementById('mOperator').value  = r.bedingung_operator;
        document.getElementById('mWert').value       = r.bedingung_wert;
        document.getElementById('mKategorie').value  = r.aktion_kategorie || '';
        document.getElementById('mTyp').value        = r.aktion_typ || '';
        document.getElementById('mPriority').value   = r.priority ?? 0;
        selectModus(r.modus || 'beide');
    } else {
        document.getElementById('modalTitle').textContent = 'Neue Regel';
        document.getElementById('mOperator').value  = 'enthält';
        document.getElementById('mWert').value       = '';
        document.getElementById('mKategorie').value  = '';
        document.getElementById('mTyp').value        = '';
        document.getElementById('mPriority').value   = 0;
        selectModus('beide');
    }
    document.getElementById('mWert').focus();
}

function closeModal() {
    document.getElementById('regelModal').style.display = 'none';
}

async function saveRegel() {
    const operator  = document.getElementById('mOperator').value;
    const wert      = document.getElementById('mWert').value.trim();
    const kategorie = document.getElementById('mKategorie').value;
    const typ       = document.getElementById('mTyp').value;
    const editId    = document.getElementById('mEditId').value;
    const msgEl     = document.getElementById('modalMsg');

    if (!wert) { msgEl.style.color = '#ef4444'; msgEl.textContent = 'Bitte einen Bedingungswert eingeben.'; return; }
    if (!kategorie && !typ) { msgEl.style.color = '#ef4444'; msgEl.textContent = 'Bitte mindestens eine Aktion auswählen.'; return; }

    const modus    = document.getElementById('mModus')?.value || 'beide';
    const priority = parseInt(document.getElementById('mPriority')?.value) || 0;
    const body = { bedingung_operator: operator, bedingung_wert: wert, aktion_kategorie: kategorie || null, aktion_typ: typ || null, modus, priority };

    try {
        let res;
        if (editId) {
            const r = allRegeln.find(r => r.id === parseInt(editId));
            res = await fetch(`/users/regeln/${editId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...body, aktiv: r ? r.aktiv : 1 })
            });
        } else {
            res = await fetch('/users/regeln/add', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
        }
        if (!res.ok) throw new Error((await res.json()).message);
        closeModal();
        await reload();
    } catch (err) {
        msgEl.style.color = '#ef4444';
        msgEl.textContent = err.message || 'Fehler beim Speichern.';
    }
}

async function deleteRegel(id) {
    if (!confirm('Regel wirklich löschen?')) return;
    await fetch(`/users/regeln/${id}`, { method: 'DELETE' });
    await reload();
}

async function toggleAktiv(id, newAktiv) {
    const r = allRegeln.find(r => r.id === id);
    if (!r) return;
    await fetch(`/users/regeln/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            bedingung_operator: r.bedingung_operator,
            bedingung_wert:     r.bedingung_wert,
            aktion_kategorie:   r.aktion_kategorie,
            aktion_typ:         r.aktion_typ,
            aktiv:              newAktiv,
            modus:              r.modus || 'beide',
            priority:           r.priority ?? 0
        })
    });
    await reload();
}

function selectModus(modus) {
    document.getElementById('mModus').value = modus;
    const MODUS_COLORS = { beide: 'var(--accent)', privat: '#6358e6', haushalt: 'var(--haus-accent, #22c55e)' };
    document.querySelectorAll('#mModusGrid button').forEach(btn => {
        const active = btn.dataset.modus === modus;
        btn.style.background   = active ? `${MODUS_COLORS[modus]}22` : 'var(--surface-2)';
        btn.style.borderColor  = active ? MODUS_COLORS[modus] : 'var(--border)';
        btn.style.color        = active ? MODUS_COLORS[modus] : 'var(--text-3)';
        btn.style.fontWeight   = active ? '700' : '400';
    });
}

async function applyAll(modus = 'privat') {
    const isHaus = modus === 'haushalt';
    const btnId = isHaus ? 'applyAllHausBtn' : 'applyAllBtn';
    const btn = document.getElementById(btnId);
    const onlyEmpty = document.getElementById('applyOnlyEmptyCheck')?.checked ?? false;
    const endpoint = isHaus ? '/users/haushalt/regeln/apply-all' : '/users/regeln/apply-all';
    const labelDefault = isHaus
        ? '<i class="ri-home-heart-line"></i> Auf Haushalt-Transaktionen anwenden'
        : '<i class="ri-refresh-line"></i> Auf Privat-Transaktionen anwenden';
    btn.disabled = true;
    btn.innerHTML = '<i class="ri-loader-4-line"></i> Wird angewendet…';
    try {
        const res = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ onlyEmpty })
        });
        const data = await res.json();
        btn.innerHTML = `<i class="ri-check-line"></i> ${data.updated} Transaktion(en) aktualisiert`;
        setTimeout(() => {
            btn.disabled = false;
            btn.innerHTML = labelDefault;
        }, 3000);
    } catch {
        btn.disabled = false;
        btn.innerHTML = labelDefault;
    }
}

async function reload() {
    const res = await fetch('/users/regeln/list');
    allRegeln = res.ok ? await res.json() : [];
    render();
}

function escHtml(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// Klick außerhalb Modal schließt es
document.getElementById('regelModal').addEventListener('click', e => {
    if (e.target === document.getElementById('regelModal')) closeModal();
});

init();
