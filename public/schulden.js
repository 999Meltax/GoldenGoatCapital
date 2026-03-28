// ─────────────────────────────────────────────────────────────
//  schulden.js  –  Golden Goat Capital  –  Schulden-Tracker
// ─────────────────────────────────────────────────────────────

const fmt     = new Intl.NumberFormat(window.GGC_LOCALE||'de-DE', { style: 'currency', currency: (window.GGC_CURRENCY||'EUR') });
const fmtPct  = v => v != null ? v.toFixed(2).replace('.', ',') + ' %' : '—';

const TYP_CONFIG = {
    kredit:        { label: 'Kredit',          color: '#ef4444', bg: 'rgba(239,68,68,0.12)' },
    kreditkarte:   { label: 'Kreditkarte',     color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
    privatdarlehen:{ label: 'Privatdarlehen',  color: '#3b82f6', bg: 'rgba(59,130,246,0.12)' },
    ratenkauf:     { label: 'Ratenkauf',       color: '#8b5cf6', bg: 'rgba(139,92,246,0.12)' },
    studienkredit: { label: 'Studienkredit',   color: '#22c55e', bg: 'rgba(34,197,94,0.12)' },
};

let alleSchulden  = [];
let aktiverFilter = 'alle';
let schuldenChart = null;
let alleKonten    = [];

// ── Laden ─────────────────────────────────────────────────────

async function loadSchulden() {
    try {
        // Konten parallel laden fuer das Zahlung-Modal
        fetch('/users/accounts').then(r => r.ok ? r.json() : []).then(data => {
            alleKonten = Array.isArray(data) ? data : [];
        }).catch(() => {});

        const res = await fetch('/users/schulden/data');
        if (!res.ok) throw new Error();
        alleSchulden = await res.json();
        renderAlles();
    } catch {
        document.getElementById('schuldenListe').innerHTML =
            '<div class="card" style="text-align:center;padding:40px;color:var(--text-3);">Fehler beim Laden.</div>';
    }
}

// ── Render ────────────────────────────────────────────────────

function renderAlles() {
    renderStatCards();
    renderSchuldenListe();
    renderStrategie();
    renderChart();
}

function renderStatCards() {
    const gesamtRest     = alleSchulden.reduce((s, d) => s + (d.restbetrag || 0), 0);
    const gesamtRate     = alleSchulden.reduce((s, d) => s + (d.monatsrate || 0), 0);
    const aktiveMitZins  = alleSchulden.filter(d => d.zinssatz > 0);
    const avgZins        = aktiveMitZins.length
        ? aktiveMitZins.reduce((s, d) => s + d.zinssatz, 0) / aktiveMitZins.length
        : 0;

    document.getElementById('statGesamtschulden').textContent  = fmt.format(gesamtRest);
    document.getElementById('statMonatlicheRate').textContent  = fmt.format(gesamtRate);
    document.getElementById('statAvgZins').textContent         = fmtPct(avgZins);

    // Frühestes schuldenfreies Datum (längste Laufzeit)
    let maxMonate = 0;
    alleSchulden.forEach(d => {
        const m = berechneMonateBisAbbezahlt(d);
        if (m > maxMonate) maxMonate = m;
    });
    if (alleSchulden.length > 0 && maxMonate < 9999) {
        const datum = new Date();
        datum.setMonth(datum.getMonth() + maxMonate);
        document.getElementById('statSchuldenfreiDatum').textContent =
            datum.toLocaleDateString('de-DE', { month: 'short', year: 'numeric' });
    } else {
        document.getElementById('statSchuldenfreiDatum').textContent = alleSchulden.length ? '> 50 Jahre' : '—';
    }
}

function renderSchuldenListe() {
    const container = document.getElementById('schuldenListe');
    const gefiltert = aktiverFilter === 'alle'
        ? alleSchulden
        : alleSchulden.filter(d => d.typ === aktiverFilter);

    if (gefiltert.length === 0) {
        container.innerHTML =
            '<div class="card" style="text-align:center;padding:48px;color:var(--text-3);">' +
                '<i class="ri-checkbox-blank-circle-line" style="font-size:2rem;display:block;margin-bottom:12px;opacity:0.3;"></i>' +
                '<div style="font-weight:600;margin-bottom:4px;">Keine Schulden eingetragen</div>' +
                '<div style="font-size:0.82rem;">Klicke auf „Schuld hinzufügen", um zu starten.</div>' +
            '</div>';
        return;
    }

    container.innerHTML = gefiltert.map(d => schuldenKarteHtml(d)).join('');
}

function schuldenKarteHtml(d) {
    const cfg        = TYP_CONFIG[d.typ] || TYP_CONFIG.kredit;
    const getsamtPct = d.gesamtbetrag > 0
        ? Math.round((1 - d.restbetrag / d.gesamtbetrag) * 100)
        : 0;
    const monate     = berechneMonateBisAbbezahlt(d);
    const zinsKosten = berechneGesamtzinsen(d);

    const fertigDatum = monate < 9999
        ? (() => { const dt = new Date(); dt.setMonth(dt.getMonth() + monate); return dt.toLocaleDateString('de-DE', { month: 'short', year: 'numeric' }); })()
        : '> 50 J.';

    return '<div class="schuld-card" data-id="' + d.id + '" data-typ="' + d.typ + '">' +

        '<div class="schuld-card-header">' +
            '<div style="width:42px;height:42px;border-radius:12px;background:' + cfg.bg + ';color:' + cfg.color + ';display:flex;align-items:center;justify-content:center;font-size:1.1rem;flex-shrink:0;">' +
                '<i class="' + typIcon(d.typ) + '"></i>' +
            '</div>' +
            '<div style="flex:1;min-width:0;">' +
                '<div style="font-weight:700;font-size:0.95rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + esc(d.name) + '</div>' +
                (d.glaeubiger ? '<div style="font-size:0.75rem;color:var(--text-3);">' + esc(d.glaeubiger) + '</div>' : '') +
            '</div>' +
            '<span class="schuld-typ-badge" style="background:' + cfg.bg + ';color:' + cfg.color + ';">' + cfg.label + '</span>' +
        '</div>' +

        // Fortschrittsbalken
        '<div style="display:flex;justify-content:space-between;font-size:0.75rem;margin-bottom:4px;">' +
            '<span style="color:var(--text-3);">Getilgt</span>' +
            '<span style="font-weight:700;color:' + cfg.color + ';">' + getsamtPct + ' %</span>' +
        '</div>' +
        '<div class="schuld-progress-wrap">' +
            '<div class="schuld-progress-bar" style="width:' + getsamtPct + '%;background:' + cfg.color + ';"></div>' +
        '</div>' +

        // Metadaten
        '<div class="schuld-meta-row">' +
            '<div class="schuld-meta-item">' +
                '<div class="schuld-meta-label">Restbetrag</div>' +
                '<div class="schuld-meta-value" style="color:#ef4444;">' + fmt.format(d.restbetrag) + '</div>' +
            '</div>' +
            '<div class="schuld-meta-item">' +
                '<div class="schuld-meta-label">Monatsrate</div>' +
                '<div class="schuld-meta-value">' + fmt.format(d.monatsrate) + '</div>' +
            '</div>' +
            '<div class="schuld-meta-item">' +
                '<div class="schuld-meta-label">Zinssatz</div>' +
                '<div class="schuld-meta-value">' + fmtPct(d.zinssatz) + '</div>' +
            '</div>' +
            '<div class="schuld-meta-item">' +
                '<div class="schuld-meta-label">Gesamtbetrag</div>' +
                '<div class="schuld-meta-value">' + fmt.format(d.gesamtbetrag) + '</div>' +
            '</div>' +
            '<div class="schuld-meta-item">' +
                '<div class="schuld-meta-label">Abbezahlt</div>' +
                '<div class="schuld-meta-value">' + fertigDatum + '</div>' +
            '</div>' +
            '<div class="schuld-meta-item">' +
                '<div class="schuld-meta-label">Gesamtzinsen</div>' +
                '<div class="schuld-meta-value" style="color:#f59e0b;">' + (zinsKosten > 0 ? fmt.format(zinsKosten) : '—') + '</div>' +
            '</div>' +
        '</div>' +

        // Aktionen
        '<div class="schuld-actions">' +
            '<button class="schuld-btn" onclick="zeigeRatenzahlung(' + d.id + ')">' +
                '<i class="ri-table-line"></i> Tilgungsplan' +
            '</button>' +
            '<button class="schuld-btn" onclick="zeigeZahlungshistorie(' + d.id + ')">' +
                '<i class="ri-history-line"></i> Historie' +
            '</button>' +
            '<button class="schuld-btn primary" onclick="openSchuldenModal(' + d.id + ')">' +
                '<i class="ri-edit-line"></i> Bearbeiten' +
            '</button>' +
        '</div>' +

    '</div>';
}

function typIcon(typ) {
    const icons = {
        kredit: 'ri-bank-line',
        kreditkarte: 'ri-bank-card-line',
        privatdarlehen: 'ri-user-line',
        ratenkauf: 'ri-shopping-cart-line',
        studienkredit: 'ri-graduation-cap-line',
    };
    return icons[typ] || 'ri-money-euro-circle-line';
}

// ── Strategie-Rechner ─────────────────────────────────────────

function renderStrategie() {
    const container = document.getElementById('strategieResult');
    if (alleSchulden.length < 2) {
        container.innerHTML =
            '<div style="text-align:center;padding:20px;color:var(--text-3);font-size:0.85rem;">' +
                '<i class="ri-add-circle-line" style="font-size:1.5rem;display:block;margin-bottom:8px;opacity:0.4;"></i>' +
                'Füge mindestens zwei Schulden hinzu, um die Strategien zu vergleichen.' +
            '</div>';
        return;
    }

    const avalanche = berechneStrategie('avalanche');
    const snowball  = berechneStrategie('snowball');
    const zinsErsparnis = avalanche.gesamtzinsen - snowball.gesamtzinsen;
    // Hinweis: avalanche hat normalerweise weniger Zinsen; falls nicht, Differenz anzeigen

    container.innerHTML =
        '<div class="strategie-box avalanche">' +
            '<div class="strategie-title" style="color:var(--accent);">' +
                '<i class="ri-arrow-up-circle-line"></i> Avalanche (teuerste zuerst)' +
            '</div>' +
            '<div class="strategie-detail">' +
                '<strong>' + avalanche.monate + ' Monate</strong> bis schuldenfrei · ' +
                'Gesamtzinsen: <strong>' + fmt.format(avalanche.gesamtzinsen) + '</strong>' +
                '<br>Reihenfolge: ' + avalanche.reihenfolge.map(d => esc(d.name)).join(' → ') +
            '</div>' +
        '</div>' +

        '<div class="strategie-box snowball">' +
            '<div class="strategie-title" style="color:#22c55e;">' +
                '<i class="ri-snowflake-line"></i> Snowball (kleinste zuerst)' +
            '</div>' +
            '<div class="strategie-detail">' +
                '<strong>' + snowball.monate + ' Monate</strong> bis schuldenfrei · ' +
                'Gesamtzinsen: <strong>' + fmt.format(snowball.gesamtzinsen) + '</strong>' +
                '<br>Reihenfolge: ' + snowball.reihenfolge.map(d => esc(d.name)).join(' → ') +
            '</div>' +
        '</div>' +

        (Math.abs(zinsErsparnis) > 1
            ? '<div style="background:rgba(99,88,230,0.08);border-radius:var(--radius-md);padding:12px 14px;font-size:0.82rem;color:var(--text-2);border:1px solid rgba(99,88,230,0.15);">' +
                '<i class="ri-lightbulb-line" style="color:var(--accent);margin-right:6px;"></i>' +
                (zinsErsparnis < 0
                    ? 'Avalanche spart dir <strong>' + fmt.format(Math.abs(zinsErsparnis)) + '</strong> an Zinsen.'
                    : 'Snowball spart dir <strong>' + fmt.format(Math.abs(zinsErsparnis)) + '</strong> an Zinsen.') +
              '</div>'
            : '');
}

function berechneStrategie(typ) {
    // Schulden kopieren
    let schulden = alleSchulden.map(d => ({
        ...d,
        rest: d.restbetrag,
        rate: d.monatsrate,
        zinssatz: d.zinssatz || 0,
    }));

    // Sortierung
    if (typ === 'avalanche') {
        schulden.sort((a, b) => b.zinssatz - a.zinssatz);
    } else {
        schulden.sort((a, b) => a.rest - b.rest);
    }

    const reihenfolge     = [...schulden];
    let gesamtmonate     = 0;
    let gesamtzinsen     = 0;
    let freigWordeneRate = 0;  // Rate die durch abbezahlte Schulden frei wird

    while (schulden.some(d => d.rest > 0.01)) {
        gesamtmonate++;
        if (gesamtmonate > 600) break; // max 50 Jahre

        // Freie Rate auf erste Schuld draufschlagen
        let extra = freigWordeneRate;
        freigWordeneRate = 0;

        for (let i = 0; i < schulden.length; i++) {
            const d = schulden[i];
            if (d.rest <= 0.01) continue;

            const monatszins = d.rest * (d.zinssatz / 100 / 12);
            gesamtzinsen += monatszins;

            let zahlung = d.rate + (i === 0 ? extra : 0);
            const tilgung = zahlung - monatszins;

            if (d.rest <= zahlung) {
                // Schuld vollständig abbezahlt
                freigWordeneRate += d.rate;
                d.rest = 0;
            } else {
                d.rest = d.rest - tilgung;
                if (d.rest < 0) d.rest = 0;
            }
        }
        // Abbezahlte Schulden filtern
        schulden = schulden.filter(d => d.rest > 0.01);
    }

    return { monate: gesamtmonate, gesamtzinsen, reihenfolge };
}

// ── Chart ─────────────────────────────────────────────────────

function renderChart() {
    const card = document.getElementById('schuldenChartCard');
    if (alleSchulden.length === 0) { card.style.display = 'none'; return; }
    card.style.display = '';

    // Schuldenverlauf simulieren (Avalanche)
    const maxMonate = 120;
    let schulden = alleSchulden.map(d => ({
        ...d,
        rest: d.restbetrag,
        zinssatz: d.zinssatz || 0,
    }));
    schulden.sort((a, b) => b.zinssatz - a.zinssatz);

    const labels  = [];
    const data    = [];
    let freieRate = 0;

    for (let m = 0; m <= maxMonate; m++) {
        const total = schulden.reduce((s, d) => s + Math.max(0, d.rest), 0);
        if (m === 0 || m % 3 === 0) {
            const dt = new Date();
            dt.setMonth(dt.getMonth() + m);
            labels.push(dt.toLocaleDateString('de-DE', { month: 'short', year: 'numeric' }));
            data.push(parseFloat(total.toFixed(2)));
        }
        if (total <= 0.01) break;

        let extra = freieRate;
        freieRate = 0;

        for (let i = 0; i < schulden.length; i++) {
            const d = schulden[i];
            if (d.rest <= 0.01) continue;
            const monatszins = d.rest * (d.zinssatz / 100 / 12);
            let zahlung = d.rate + (i === 0 ? extra : 0);
            if (d.rest <= zahlung) {
                freieRate += d.rate;
                d.rest = 0;
            } else {
                d.rest -= (zahlung - monatszins);
                if (d.rest < 0) d.rest = 0;
            }
        }
        schulden = schulden.filter(d => d.rest > 0.01);
    }

    if (schuldenChart) { schuldenChart.destroy(); schuldenChart = null; }

    requestAnimationFrame(() => requestAnimationFrame(() => {
        const canvas = document.getElementById('schuldenChart');
        if (!canvas) return;
        schuldenChart = new Chart(canvas, {
            type: 'line',
            data: {
                labels,
                datasets: [{
                    label: 'Restschuld',
                    data,
                    borderColor: '#ef4444',
                    backgroundColor: 'rgba(239,68,68,0.08)',
                    fill: true,
                    tension: 0.3,
                    pointRadius: 2,
                    pointBackgroundColor: '#ef4444',
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    y: {
                        ticks: { color: '#aaa', callback: v => fmt.format(v) },
                        grid:  { color: 'rgba(255,255,255,0.07)' },
                        min: 0,
                    },
                    x: {
                        ticks: { color: '#aaa', maxTicksLimit: 8 },
                        grid:  { color: 'rgba(255,255,255,0.07)' },
                    }
                }
            }
        });
    }));
}

// ── Tilgungsplan Modal ────────────────────────────────────────

function zeigeRatenzahlung(id) {
    const d = alleSchulden.find(s => s.id === id);
    if (!d) return;

    const cfg  = TYP_CONFIG[d.typ] || TYP_CONFIG.kredit;
    let rest   = d.restbetrag;
    let monat  = 0;
    const rows = [];

    while (rest > 0.01 && monat < 600) {
        monat++;
        const zins    = rest * ((d.zinssatz || 0) / 100 / 12);
        const tilgung = Math.min(d.monatsrate - zins, rest);
        const zahlung = Math.min(d.monatsrate, rest + zins);
        rest          = Math.max(0, rest - tilgung);

        const dt = new Date();
        dt.setMonth(dt.getMonth() + monat);
        rows.push({ monat, datum: dt.toLocaleDateString('de-DE', { month: 'short', year: 'numeric' }), zahlung, zins, tilgung, rest });

        if (rows.length >= 120) { // max 10 Jahre anzeigen
            rows.push(null); // Trennzeile
            break;
        }
    }

    document.getElementById('tilgungsModalTitle').textContent = 'Tilgungsplan – ' + d.name;
    document.getElementById('tilgungsplanInhalt').innerHTML =
        '<div style="display:flex;gap:16px;margin-bottom:16px;flex-wrap:wrap;">' +
            '<div style="flex:1;min-width:120px;background:var(--surface-2);border-radius:var(--radius-md);padding:12px;border:1px solid var(--border);">' +
                '<div style="font-size:0.7rem;color:var(--text-3);margin-bottom:4px;">Restbetrag</div>' +
                '<div style="font-weight:700;color:#ef4444;">' + fmt.format(d.restbetrag) + '</div>' +
            '</div>' +
            '<div style="flex:1;min-width:120px;background:var(--surface-2);border-radius:var(--radius-md);padding:12px;border:1px solid var(--border);">' +
                '<div style="font-size:0.7rem;color:var(--text-3);margin-bottom:4px;">Monatsrate</div>' +
                '<div style="font-weight:700;">' + fmt.format(d.monatsrate) + '</div>' +
            '</div>' +
            '<div style="flex:1;min-width:120px;background:var(--surface-2);border-radius:var(--radius-md);padding:12px;border:1px solid var(--border);">' +
                '<div style="font-size:0.7rem;color:var(--text-3);margin-bottom:4px;">Zinssatz</div>' +
                '<div style="font-weight:700;">' + fmtPct(d.zinssatz) + '</div>' +
            '</div>' +
            '<div style="flex:1;min-width:120px;background:var(--surface-2);border-radius:var(--radius-md);padding:12px;border:1px solid var(--border);">' +
                '<div style="font-size:0.7rem;color:var(--text-3);margin-bottom:4px;">Gesamtzinsen</div>' +
                '<div style="font-weight:700;color:#f59e0b;">' + fmt.format(berechneGesamtzinsen(d)) + '</div>' +
            '</div>' +
        '</div>' +
        '<table class="tilgung-table">' +
            '<thead><tr>' +
                '<th>#</th><th>Monat</th><th>Rate</th><th>Zinsen</th><th>Tilgung</th><th>Restschuld</th>' +
            '</tr></thead>' +
            '<tbody>' +
            rows.map(r => {
                if (!r) return '<tr><td colspan="6" style="text-align:center;color:var(--text-3);font-size:0.8rem;padding:12px;">... weitere Monate ...</td></tr>';
                return '<tr>' +
                    '<td style="color:var(--text-3);">' + r.monat + '</td>' +
                    '<td>' + r.datum + '</td>' +
                    '<td>' + fmt.format(r.zahlung) + '</td>' +
                    '<td style="color:#f59e0b;">' + fmt.format(r.zins) + '</td>' +
                    '<td style="color:#22c55e;">' + fmt.format(r.tilgung) + '</td>' +
                    '<td style="font-weight:700;color:' + (r.rest < 1 ? '#22c55e' : '#ef4444') + ';">' + fmt.format(r.rest) + '</td>' +
                '</tr>';
            }).join('') +
            '</tbody>' +
        '</table>';

    document.getElementById('tilgungsModalOverlay').classList.add('active');
}

function closeTilgungsModal(e) {
    if (!e || e.target === document.getElementById('tilgungsModalOverlay') || e.currentTarget.tagName === 'BUTTON') {
        document.getElementById('tilgungsModalOverlay').classList.remove('active');
    }
}

// ── Berechnungen ──────────────────────────────────────────────

function berechneMonateBisAbbezahlt(d) {
    if (!d.monatsrate || d.monatsrate <= 0) return 9999;
    const r = (d.zinssatz || 0) / 100 / 12;
    if (r <= 0) {
        return Math.ceil(d.restbetrag / d.monatsrate);
    }
    // Annuitätenformel: n = -log(1 - r*P/R) / log(1+r)
    const P = d.restbetrag;
    const R = d.monatsrate;
    if (R <= r * P) return 9999; // Rate deckt nicht mal die Zinsen
    return Math.ceil(-Math.log(1 - r * P / R) / Math.log(1 + r));
}

function berechneGesamtzinsen(d) {
    if (!d.zinssatz || d.zinssatz <= 0) return 0;
    let rest     = d.restbetrag;
    let zinsSumme = 0;
    let m        = 0;
    while (rest > 0.01 && m < 600) {
        const zins = rest * (d.zinssatz / 100 / 12);
        zinsSumme += zins;
        rest -= (d.monatsrate - zins);
        if (rest < 0) rest = 0;
        m++;
    }
    return zinsSumme;
}

// ── Filter ────────────────────────────────────────────────────

function filterSchulden(filter, btn) {
    aktiverFilter = filter;
    document.querySelectorAll('.schulden-tab').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
    renderSchuldenListe();
}

// ── Modal ─────────────────────────────────────────────────────

function openSchuldenModal(id) {
    const overlay = document.getElementById('schuldenModalOverlay');
    const deleteBtn = document.getElementById('schuldenDeleteBtn');

    if (id) {
        const d = alleSchulden.find(s => s.id === id);
        if (!d) return;
        document.getElementById('schuldenModalTitle').textContent = 'Schuld bearbeiten';
        document.getElementById('schuldenEditId').value        = d.id;
        document.getElementById('schuldenName').value          = d.name;
        document.getElementById('schuldenTyp').value           = d.typ;
        document.getElementById('schuldenGlaeubiger').value    = d.glaeubiger || '';
        document.getElementById('schuldenFaelligkeitstag').value = d.faelligkeitstag || '';
        document.getElementById('schuldenGesamtbetrag').value  = d.gesamtbetrag;
        document.getElementById('schuldenRestbetrag').value    = d.restbetrag;
        document.getElementById('schuldenZinssatz').value      = d.zinssatz || '';
        document.getElementById('schuldenMonatsrate').value    = d.monatsrate;
        document.getElementById('schuldenNotiz').value         = d.notiz || '';
        deleteBtn.style.display = '';
    } else {
        document.getElementById('schuldenModalTitle').textContent = 'Schuld hinzufügen';
        document.getElementById('schuldenEditId').value        = '';
        document.getElementById('schuldenName').value          = '';
        document.getElementById('schuldenTyp').value           = 'kredit';
        document.getElementById('schuldenGlaeubiger').value    = '';
        document.getElementById('schuldenFaelligkeitstag').value = '';
        document.getElementById('schuldenGesamtbetrag').value  = '';
        document.getElementById('schuldenRestbetrag').value    = '';
        document.getElementById('schuldenZinssatz').value      = '';
        document.getElementById('schuldenMonatsrate').value    = '';
        document.getElementById('schuldenNotiz').value         = '';
        deleteBtn.style.display = 'none';
    }
    overlay.classList.add('active');
}

function closeSchuldenModal(e) {
    if (!e || e.target === document.getElementById('schuldenModalOverlay') || e.currentTarget.tagName === 'BUTTON') {
        document.getElementById('schuldenModalOverlay').classList.remove('active');
    }
}

// ── Speichern ─────────────────────────────────────────────────

async function saveSchuld() {
    const id            = document.getElementById('schuldenEditId').value;
    const name          = document.getElementById('schuldenName').value.trim();
    const typ           = document.getElementById('schuldenTyp').value;
    const glaeubiger    = document.getElementById('schuldenGlaeubiger').value.trim();
    const faelligkeitstag = parseInt(document.getElementById('schuldenFaelligkeitstag').value) || null;
    const gesamtbetrag  = parseFloat(document.getElementById('schuldenGesamtbetrag').value);
    const restbetrag    = parseFloat(document.getElementById('schuldenRestbetrag').value);
    const zinssatz      = parseFloat(document.getElementById('schuldenZinssatz').value) || 0;
    const monatsrate    = parseFloat(document.getElementById('schuldenMonatsrate').value);
    const notiz         = document.getElementById('schuldenNotiz').value.trim();

    if (!name || isNaN(gesamtbetrag) || isNaN(restbetrag) || isNaN(monatsrate)) {
        alert('Bitte alle Pflichtfelder ausfüllen.');
        return;
    }

    const payload = { name, typ, glaeubiger, faelligkeitstag, gesamtbetrag, restbetrag, zinssatz, monatsrate, notiz };

    try {
        let res;
        if (id) {
            res = await fetch('/users/schulden/' + id, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
        } else {
            res = await fetch('/users/schulden/add', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
        }
        if (!res.ok) throw new Error();
        closeSchuldenModal();
        await loadSchulden();
    } catch {
        alert('Fehler beim Speichern.');
    }
}

// ── Löschen ───────────────────────────────────────────────────

async function deleteSchuld() {
    const id = document.getElementById('schuldenEditId').value;
    if (!id || !confirm('Schuld wirklich löschen?')) return;
    try {
        const res = await fetch('/users/schulden/' + id, { method: 'DELETE' });
        if (!res.ok) throw new Error();
        closeSchuldenModal();
        await loadSchulden();
    } catch {
        alert('Fehler beim Löschen.');
    }
}

// ── Hilfsfunktionen ───────────────────────────────────────────

function esc(str) {
    return String(str || '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Init ──────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', loadSchulden);
// ══════════════════════════════════════════════════════════════
//  ZAHLUNGSHISTORIE
// ══════════════════════════════════════════════════════════════

let historieSchuldId = null;

async function zeigeZahlungshistorie(id) {
    historieSchuldId = id;
    const d = alleSchulden.find(s => s.id === id);
    if (!d) return;

    document.getElementById('historieModalTitle').textContent = 'Zahlungshistorie – ' + d.bezeichnung;
    document.getElementById('historieBtnBuchen').dataset.id = id;

    // Zahlungsformular zuruecksetzen
    document.getElementById('historieZahlungsBetrag').value = d.monatsrate || '';
    document.getElementById('historieZahlungsDatum').value  = new Date().toISOString().split('T')[0];
    document.getElementById('historieZahlungsNotiz').value  = '';
    document.getElementById('historieStatus').style.display = 'none';

    // Konto-Dropdown befuellen
    const sel = document.getElementById('historieTxKonto');
    if (sel) {
        sel.innerHTML = '<option value="">Kein Konto (nur Schuld reduzieren)</option>' +
            alleKonten.map(k => '<option value="' + k.id + '">' + escHtml(k.name) + '</option>').join('');
        if (alleKonten.length > 0) sel.value = String(alleKonten[0].id);
    }
    // Checkbox standardmaessig aktiv wenn Konten vorhanden
    const cb = document.getElementById('historieTxCheckbox');
    if (cb) {
        cb.checked = alleKonten.length > 0;
        toggleTxKonto(cb.checked);
    }

    await ladeHistorie(id);
    document.getElementById('historieModalOverlay').classList.add('active');
}

async function ladeHistorie(id) {
    const listEl = document.getElementById('historieListeInhalt');
    listEl.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-3);">Lade...</div>';
    try {
        const res = await fetch('/users/schulden/' + id + '/zahlungen');
        if (!res.ok) throw new Error();
        const zahlungen = await res.json();
        renderHistorieListe(zahlungen, id);
    } catch {
        listEl.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-3);">Fehler beim Laden.</div>';
    }
}

function renderHistorieListe(zahlungen, schuldenId) {
    const listEl  = document.getElementById('historieListeInhalt');
    const summEl  = document.getElementById('historieSumme');
    const d       = alleSchulden.find(s => s.id === schuldenId);

    const gesamtGezahlt = zahlungen.reduce((s, z) => s + (parseFloat(z.betrag) || 0), 0);
    if (summEl && d) {
        summEl.innerHTML =
            '<span><i class="ri-coins-line" style="color:#22c55e;margin-right:4px;"></i>Gesamt gezahlt: <strong style="color:#22c55e;">' + fmt.format(gesamtGezahlt) + '</strong></span>' +
            '<span style="color:var(--text-3);">' + zahlungen.length + ' Zahlung' + (zahlungen.length !== 1 ? 'en' : '') + '</span>';
    }

    if (!zahlungen.length) {
        listEl.innerHTML =
            '<div style="text-align:center;padding:28px;color:var(--text-3);font-size:0.85rem;">' +
                '<i class="ri-history-line" style="font-size:1.8rem;display:block;margin-bottom:8px;opacity:0.3;"></i>' +
                'Noch keine Zahlungen erfasst.' +
            '</div>';
        return;
    }

    listEl.innerHTML = zahlungen.map(z => {
        const datumStr = new Date(z.datum).toLocaleDateString('de-DE', { day: '2-digit', month: 'short', year: 'numeric' });
        const kontoName = z.account_id ? (alleKonten.find(k => k.id === z.account_id)?.name || '') : '';
        const txBadge = z.transaction_id
            ? '<span style="font-size:0.7rem;background:rgba(99,88,230,0.12);color:var(--accent);border-radius:6px;padding:2px 7px;margin-left:6px;" title="Transaktion #' + z.transaction_id + ' im Ausgabentracker">' +
              '<i class="ri-exchange-dollar-line" style="margin-right:2px;"></i>Transaktion' +
              (kontoName ? ' · ' + esc(kontoName) : '') + '</span>'
            : '';
        return '<div class="historie-zeile">' +
            '<div class="historie-zeile-icon"><i class="ri-checkbox-circle-line"></i></div>' +
            '<div class="historie-zeile-info">' +
                '<div class="historie-zeile-datum">' + datumStr + txBadge + '</div>' +
                (z.notiz ? '<div class="historie-zeile-notiz">' + esc(z.notiz) + '</div>' : '') +
            '</div>' +
            '<div class="historie-zeile-betrag">' + fmt.format(z.betrag) + '</div>' +
            '<button class="historie-delete-btn" onclick="loescheZahlung(' + z.id + ',' + schuldenId + ')" title="Löschen">' +
                '<i class="ri-delete-bin-line"></i>' +
            '</button>' +
        '</div>';
    }).join('');
}

async function buchungSpeichern() {
    const id           = historieSchuldId;
    const betrag       = parseFloat(document.getElementById('historieZahlungsBetrag').value);
    const datum        = document.getElementById('historieZahlungsDatum').value;
    const notiz        = document.getElementById('historieZahlungsNotiz').value.trim();
    const statEl       = document.getElementById('historieStatus');
    const alsTransCb   = document.getElementById('historieTxCheckbox');
    const alsTransaktion = alsTransCb ? alsTransCb.checked : false;
    const kontoSel     = document.getElementById('historieTxKonto');
    const account_id   = (alsTransaktion && kontoSel && kontoSel.value) ? parseInt(kontoSel.value) : null;

    if (isNaN(betrag) || betrag <= 0 || !datum) {
        statEl.textContent = 'Bitte Betrag und Datum angeben.';
        statEl.style.display = '';
        return;
    }

    try {
        const res = await fetch('/users/schulden/' + id + '/zahlungen', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ betrag, datum, notiz, account_id, als_transaktion: alsTransaktion })
        });
        if (!res.ok) throw new Error((await res.json()).message || 'Fehler');

        statEl.style.display = 'none';
        document.getElementById('historieZahlungsBetrag').value = '';
        document.getElementById('historieZahlungsNotiz').value  = '';

        // Restbetrag lokal aktualisieren
        const schuld = alleSchulden.find(s => s.id === id);
        if (schuld) schuld.restbetrag = Math.max(0, schuld.restbetrag - betrag);

        // Erfolgsmeldung
        if (alsTransaktion) {
            const kontoName = account_id ? (alleKonten.find(k => k.id === account_id)?.name || '') : '';
            ggcToast('Zahlung gespeichert' + (kontoName ? ' – Transaktion auf „' + kontoName + '“ gebucht' : ''));
        }

        await ladeHistorie(id);
        renderAlles(); // Stat-Karten + Karten neu zeichnen
    } catch (err) {
        statEl.textContent = 'Fehler: ' + err.message;
        statEl.style.display = '';
    }
}

function toggleTxKonto(checked) {
    const wrap = document.getElementById('historieTxKontoWrap');
    if (wrap) wrap.style.display = checked ? '' : 'none';
}

function loescheZahlung(zahlungId, schuldenId) {
    ggcConfirm('Zahlung wirklich löschen? Eine verknüpfte Transaktion im Ausgabentracker wird ebenfalls gelöscht.', async () => {
        try {
            const res = await fetch('/users/schulden/zahlungen/' + zahlungId, { method: 'DELETE' });
            if (!res.ok) throw new Error();
            await loadSchulden();
            await ladeHistorie(schuldenId);
        } catch {
            ggcToast('Fehler beim Löschen.', true);
        }
    }, { label: 'Löschen' });
}

function closeHistorieModal(e) {
    if (!e || e.target === document.getElementById('historieModalOverlay') || e.currentTarget?.tagName === 'BUTTON') {
        document.getElementById('historieModalOverlay').classList.remove('active');
        historieSchuldId = null;
    }
}