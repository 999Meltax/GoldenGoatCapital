const fmt = new Intl.NumberFormat('de-DE');

const DEFAULT_CATEGORIES = [
    'Essen & Trinken', 'Lebensmittel', 'Klamotten', 'Freizeit', 'Tanken',
    'Wohnen', 'Transport', 'Gesundheit', 'Gehalt', 'Sonstiges'
];

let allRegeln    = [];
let allCategories = [];

// ═══════════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════════
async function init() {
    const [regelnRes, catRes] = await Promise.all([
        fetch('/users/regeln/list'),
        fetch('/users/categories')
    ]);
    allRegeln     = regelnRes.ok ? await regelnRes.json() : [];
    const userCats = catRes.ok ? await catRes.json() : [];
    allCategories = [...new Set([...DEFAULT_CATEGORIES, ...userCats.map(c => c.name)])].sort();
    populateCategorySelect();
    render();
}

function populateCategorySelect() {
    const sel = document.getElementById('mKategorie');
    sel.innerHTML = '<option value="">(nicht ändern)</option>' +
        allCategories.map(c => `<option value="${escHtml(c)}">${escHtml(c)}</option>`).join('');
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
            <div style="text-align:center;padding:60px 24px;color:var(--text-3);">
                <i class="ri-robot-line" style="font-size:2rem;display:block;margin-bottom:12px;opacity:.4;"></i>
                Noch keine Regeln angelegt.<br>
                <span style="font-size:0.85rem;">Erstelle eine Regel um Transaktionen automatisch zu kategorisieren.</span>
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

            return `
            <div style="display:grid;grid-template-columns:auto 1fr 1fr auto;gap:0;align-items:center;padding:14px 20px;border-bottom:1px solid var(--border);${!r.aktiv ? 'opacity:.45;' : ''}">
                <div style="padding-right:16px;font-size:0.78rem;color:var(--text-3);font-weight:600;">${i + 1}</div>
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
        selectModus(r.modus || 'beide');
    } else {
        document.getElementById('modalTitle').textContent = 'Neue Regel';
        document.getElementById('mOperator').value  = 'enthält';
        document.getElementById('mWert').value       = '';
        document.getElementById('mKategorie').value  = '';
        document.getElementById('mTyp').value        = '';
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

    const modus = document.getElementById('mModus')?.value || 'beide';
    const body = { bedingung_operator: operator, bedingung_wert: wert, aktion_kategorie: kategorie || null, aktion_typ: typ || null, modus };

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
            modus:              r.modus || 'beide'
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

async function applyAll() {
    const btn = document.getElementById('applyAllBtn');
    btn.disabled = true;
    btn.innerHTML = '<i class="ri-loader-4-line"></i> Wird angewendet…';
    try {
        const res  = await fetch('/users/regeln/apply-all', { method: 'POST' });
        const data = await res.json();
        btn.innerHTML = `<i class="ri-check-line"></i> ${data.updated} Transaktion(en) aktualisiert`;
        setTimeout(() => {
            btn.disabled = false;
            btn.innerHTML = '<i class="ri-refresh-line"></i> Auf bestehende Transaktionen anwenden';
        }, 3000);
    } catch {
        btn.disabled = false;
        btn.innerHTML = '<i class="ri-refresh-line"></i> Auf bestehende Transaktionen anwenden';
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
