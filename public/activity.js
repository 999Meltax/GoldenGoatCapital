// ═══════════════════════════════════════════════════════════
// ACTIVITY LOG
// ═══════════════════════════════════════════════════════════
const fmt = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });

let currentFilter  = '';
let currentOffset  = 0;
const PAGE_SIZE    = 50;
let allEntries     = [];

// Entity-Icon-Map
const ENTITY_ICONS = {
    'Transaktion':          'ri-exchange-dollar-line',
    'Konto':                'ri-bank-line',
    'Finanzziel':           'ri-flag-line',
    'Budget':               'ri-bar-chart-box-line',
    'Schuld':               'ri-scales-line',
    'Fixkosten':            'ri-repeat-line',
    'Haushalt-Transaktion': 'ri-home-heart-line',
};

// Aktion → Icon
const AKTION_ICONS = {
    'erstellt':  'ri-add-circle-line',
    'geändert':  'ri-edit-line',
    'gelöscht':  'ri-delete-bin-line',
};

document.addEventListener('DOMContentLoaded', () => {
    // URL-Parameter ?filter=... vorbelegen
    const urlFilter = new URLSearchParams(window.location.search).get('filter');
    if (urlFilter) {
        currentFilter = urlFilter;
        const btn = document.querySelector(`.activity-filter-btn[data-entity="${CSS.escape(urlFilter)}"]`);
        if (btn) {
            document.querySelectorAll('.activity-filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        }
    }
    loadActivity(true);
});

function setFilter(entity, btn) {
    currentFilter = entity;
    currentOffset = 0;
    allEntries    = [];
    document.querySelectorAll('.activity-filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    loadActivity(true);
}

async function loadMore() {
    await loadActivity(false);
}

async function loadActivity(reset) {
    if (reset) {
        currentOffset = 0;
        allEntries    = [];
    }

    const params = new URLSearchParams({ limit: PAGE_SIZE, offset: currentOffset });
    if (currentFilter) params.set('entity', currentFilter);

    try {
        const res = await fetch('/users/activity/list?' + params.toString());
        const entries = res.ok ? await res.json() : [];

        allEntries    = allEntries.concat(entries);
        currentOffset += entries.length;

        render(allEntries);

        const loadMoreEl = document.getElementById('activityLoadMore');
        if (loadMoreEl) {
            loadMoreEl.style.display = entries.length >= PAGE_SIZE ? '' : 'none';
        }
    } catch (e) {
        console.error('Fehler beim Laden des Aktivitätsprotokolls:', e);
        document.getElementById('activityTimeline').innerHTML =
            '<div class="activity-empty"><i class="ri-error-warning-line" style="font-size:2rem;display:block;margin-bottom:8px;opacity:0.5;"></i>Fehler beim Laden.</div>';
    }
}

function render(entries) {
    const el = document.getElementById('activityTimeline');
    if (!el) return;

    if (entries.length === 0) {
        el.innerHTML = '<div class="activity-empty">' +
            '<i class="ri-history-line" style="font-size:2.5rem;display:block;margin-bottom:12px;opacity:0.3;"></i>' +
            '<div style="font-weight:600;">Noch keine Aktivitäten</div>' +
            '<div style="font-size:0.82rem;margin-top:6px;">Aktionen wie das Erstellen von Transaktionen oder Konten werden hier protokolliert.</div>' +
            '</div>';
        return;
    }

    // Gruppiere nach Datum
    const groups = {};
    entries.forEach(e => {
        const day = (e.created_at || '').slice(0, 10);
        if (!groups[day]) groups[day] = [];
        groups[day].push(e);
    });

    const today     = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

    el.innerHTML = Object.entries(groups).map(([day, dayEntries]) => {
        let dayLabel;
        if (day === today)     dayLabel = 'Heute';
        else if (day === yesterday) dayLabel = 'Gestern';
        else {
            const d = new Date(day + 'T00:00:00');
            dayLabel = d.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
        }

        const items = dayEntries.map(e => renderItem(e)).join('');
        return `<div class="activity-day-group">
            <div class="activity-day-label">${dayLabel}</div>
            ${items}
        </div>`;
    }).join('');
}

function renderItem(e) {
    const aktionClass = e.aktion === 'erstellt' ? 'erstellt' : e.aktion === 'geändert' ? 'geaendert' : 'geloescht';
    const aktionIcon  = AKTION_ICONS[e.aktion] || 'ri-information-line';
    const entityIcon  = ENTITY_ICONS[e.entity] || 'ri-file-line';

    // Titel aufbauen
    let title = `${e.entity} ${e.aktion}`;
    let detailHtml = '';

    try {
        const d = e.details ? JSON.parse(e.details) : null;
        if (d) {
            if (d.name)      title = `„${escHtml(d.name)}" ${e.aktion}`;
            if (d.kategorie) title = `Budget „${escHtml(d.kategorie)}" ${e.aktion}`;

            const tags = [];
            if (d.amount  !== undefined) tags.push({ icon: 'ri-money-euro-circle-line', text: fmt.format(d.amount) });
            if (d.betrag  !== undefined && d.name) tags.push({ icon: 'ri-money-euro-circle-line', text: fmt.format(d.betrag) });
            if (d.zielbetrag !== undefined) tags.push({ icon: 'ri-flag-line', text: 'Ziel: ' + fmt.format(d.zielbetrag) });
            if (d.type)   tags.push({ icon: d.type === 'Einnahmen' ? 'ri-arrow-up-line' : 'ri-arrow-down-line', text: d.type });
            if (d.category) tags.push({ icon: 'ri-price-tag-3-line', text: escHtml(d.category) });
            if (d.date)     tags.push({ icon: 'ri-calendar-line', text: formatDate(d.date) });

            detailHtml = tags.map(t =>
                `<span class="activity-detail-tag"><i class="${t.icon}"></i>${t.text}</span>`
            ).join(' ');
        }
    } catch (_) {}

    // Uhrzeit
    const time = (e.created_at || '').slice(11, 16);

    return `<div class="activity-item">
        <div class="activity-icon ${aktionClass}">
            <i class="${aktionIcon}"></i>
        </div>
        <div class="activity-body">
            <div class="activity-title">
                <i class="${entityIcon}" style="font-size:0.82rem;color:var(--text-3);margin-right:3px;"></i>
                ${title}
            </div>
            ${detailHtml ? `<div style="margin-top:4px;">${detailHtml}</div>` : ''}
            <div class="activity-meta">${time} Uhr</div>
        </div>
    </div>`;
}

function formatDate(dateStr) {
    if (!dateStr) return '';
    try {
        return new Date(dateStr).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
    } catch (_) { return dateStr; }
}

function escHtml(str) {
    return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
