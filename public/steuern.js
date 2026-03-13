// ══════════════════════════════════════════════════════════════
//  STEUERN.JS  –  Golden Goat Capital
// ══════════════════════════════════════════════════════════════

const fmt    = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });
const fmtK   = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const fmtPct = new Intl.NumberFormat('de-DE', { style: 'percent', maximumFractionDigits: 1 });

let aktuellesJahr = new Date().getFullYear() - 1; // Standard: letztes Jahr
let alleWerbungskosten = [];
let aktiveWbkKat = 'alle';
let assistentChecks = {};

// ── WBK-Kategorien ────────────────────────────────────────────
const WBK_KAT = {
    fahrtkosten:  { label: 'Fahrtkosten',   icon: 'ri-car-line',         bg: 'rgba(59,130,246,0.12)',  color: '#3b82f6' },
    arbeitsmittel:{ label: 'Arbeitsmittel', icon: 'ri-tools-line',        bg: 'rgba(99,88,230,0.12)',   color: '#8b7ff5' },
    fortbildung:  { label: 'Fortbildung',   icon: 'ri-book-open-line',    bg: 'rgba(34,197,94,0.12)',   color: '#22c55e' },
    homeoffice:   { label: 'Homeoffice',    icon: 'ri-home-office-line',  bg: 'rgba(245,158,11,0.12)', color: '#f59e0b' },
    bewerbung:    { label: 'Bewerbungen',   icon: 'ri-mail-send-line',    bg: 'rgba(236,72,153,0.12)', color: '#ec4899' },
    sonstiges:    { label: 'Sonstiges',     icon: 'ri-briefcase-4-line',  bg: 'rgba(107,114,128,0.12)',color: '#9ca3af' },
};

// ── Assistent-Checkliste ───────────────────────────────────────
const ASSISTENT_GRUPPEN = [
    {
        gruppe: 'Einkommensnachweise',
        items: [
            { id: 'lohnsteuerbescheiniung', text: 'Lohnsteuerbescheinigung vom Arbeitgeber', tipp: 'Erhältst du automatisch im Januar, auch im ELSTER-Portal abrufbar.' },
            { id: 'riesternachweis', text: 'Riester-/Rürup-Zulagenbescheinigung', tipp: 'Wenn du einen Altersvorsorgevertrag hast.' },
            { id: 'kapitalertraege', text: 'Kapitalerträge / Jahressteuerbescheinigung Bank', tipp: 'Relevant bei Konten/Depots mit Erträgen über Freistellungsauftrag.' },
            { id: 'nebeneinkuenfte', text: 'Nachweise über Nebeneinkünfte', tipp: 'Selbstständige Tätigkeiten, Vermietung etc. separat ausweisen.' },
        ]
    },
    {
        gruppe: 'Werbungskosten',
        items: [
            { id: 'fahrkarten', text: 'Fahrtennachweis / Tickets für Fahrten zur Arbeit', tipp: 'Ab 21 km einfacher Weg lohnt Einzelnachweis. ÖPNV-Jahresticket als Beleg.' },
            { id: 'arbeitsmittelbelege', text: 'Belege für Arbeitsmittel (Laptop, Bürostuhl…)', tipp: 'Beträge über 952 € netto müssen abgeschrieben werden.' },
            { id: 'homeoffice', text: 'Homeoffice-Tage dokumentiert', tipp: 'Pauschale 6 €/Tag, max. 1.260 € – oder anteilige Raumkosten bei eigenem Bürozimmer.' },
            { id: 'fortbildungsnachweise', text: 'Rechnungen für Weiterbildungen, Bücher', tipp: 'Beruflich veranlasste Fort- und Weiterbildungen voll absetzbar.' },
            { id: 'gewerkschaft', text: 'Gewerkschaftsbeiträge / Berufsverbände', tipp: 'Mitgliedsbeiträge sind Werbungskosten.' },
        ]
    },
    {
        gruppe: 'Sonderausgaben & Versicherungen',
        items: [
            { id: 'krankenversicherung', text: 'Nachweis Kranken-/Pflegeversicherungsbeiträge', tipp: 'Wird oft automatisch über Lohnsteuerbescheinigung übermittelt.' },
            { id: 'altersvorsorge', text: 'Beiträge zur Altersvorsorge', tipp: 'Gesetzliche Rentenversicherung, Riester, Rürup.' },
            { id: 'spenden', text: 'Spendenquittungen', tipp: 'Bis 300 € reicht Kontoauszug, darüber Zuwendungsbestätigung.' },
            { id: 'schulgeld', text: 'Schulgeld / Kinderbetreuungskosten', tipp: 'Bis zu 4.000 € pro Kind abzugsfähig.' },
        ]
    },
    {
        gruppe: 'Außergewöhnliche Belastungen',
        items: [
            { id: 'arztkosten', text: 'Arzt- und Krankheitskosten', tipp: 'Nur der Teil über der zumutbaren Belastung (je nach Einkommen/Familienstand).' },
            { id: 'pflegekosten', text: 'Pflegekosten für Angehörige', tipp: 'Als außergewöhnliche Belastung oder Pflegepauschbetrag.' },
            { id: 'behinderung', text: 'Schwerbehindertenausweis / Behinderungspauschbetrag', tipp: 'Pauschbetrag je nach GdB, kein Einzelnachweis nötig.' },
        ]
    },
    {
        gruppe: 'Sonstiges',
        items: [
            { id: 'kontonummer', text: 'IBAN für Rückzahlung hinterlegt (ELSTER)', tipp: 'Damit du eine Rückerstattung auf dein Konto erhältst.' },
            { id: 'vorjahresbescheid', text: 'Steuerbescheid des Vorjahres bereitgelegt', tipp: 'Für Verlustvortrag, Vergleichswerte und Einspruchsdaten.' },
        ]
    },
];

// ══════════════════════════════════════════════════════════════
//  INIT
// ══════════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
    buildJahrSelect();
    switchTab('uebersicht', document.querySelector('.steuer-tab.active'));
    ladeWerbungskosten();
    ladeAssistentChecks();
});

function buildJahrSelect() {
    const sel = document.getElementById('jahrSelect');
    const aktJahr = new Date().getFullYear();
    for (let j = aktJahr - 1; j >= aktJahr - 6; j--) {
        const opt = document.createElement('option');
        opt.value = j;
        opt.textContent = 'Steuerjahr ' + j;
        if (j === aktuellesJahr) opt.selected = true;
        sel.appendChild(opt);
    }
    // Auch Werbungskosten-Modal befüllen
    const wbkJahrSel = document.getElementById('wbkJahr');
    if (wbkJahrSel) {
        for (let j = aktJahr; j >= aktJahr - 5; j--) {
            const opt = document.createElement('option');
            opt.value = j;
            opt.textContent = j;
            if (j === aktJahr - 1) opt.selected = true;
            wbkJahrSel.appendChild(opt);
        }
    }
}

function jahrWechseln() {
    aktuellesJahr = parseInt(document.getElementById('jahrSelect').value);
    ladeUebersicht();
    filterWbk(aktiveWbkKat, document.querySelector('.steuer-kat-tab.active'));
}

function switchTab(tab, btn) {
    document.querySelectorAll('.steuer-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.steuer-tab-content').forEach(c => c.style.display = 'none');
    if (btn) btn.classList.add('active');
    const el = document.getElementById('tab-' + tab);
    if (el) { el.style.display = 'block'; el.classList.add('active'); }

    if (tab === 'uebersicht') ladeUebersicht();
    if (tab === 'dokumente')  ladeSteuerDokumente();
}

function esc(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ══════════════════════════════════════════════════════════════
//  1. JAHRESÜBERSICHT
// ══════════════════════════════════════════════════════════════
async function ladeUebersicht() {
    const root = document.getElementById('uebersichtRoot');
    root.innerHTML = '<div class="steuer-loading"><i class="ri-loader-4-line steuer-spin"></i> Lade Daten…</div>';

    try {
        const [txRes, gehaeltRes, wbkRes] = await Promise.all([
            fetch('/users/getTransactions').then(r => r.json()).catch(() => []),
            fetch('/users/steuer/jahresübersicht/' + aktuellesJahr).then(r => r.json()).catch(() => ({})),
            fetch('/users/steuer/werbungskosten?jahr=' + aktuellesJahr).then(r => r.json()).catch(() => []),
        ]);

        // Transaktionen des Jahres filtern
        const jahresTx = txRes.filter(t => (t.date || '').startsWith(String(aktuellesJahr)));
        const einnahmen = jahresTx.filter(t => t.type === 'Einnahmen').reduce((s, t) => s + t.amount, 0);
        const ausgaben  = jahresTx.filter(t => t.type === 'Ausgaben').reduce((s, t) => s + t.amount, 0);

        // Werbungskosten-Summe
        const wbkGesamt = wbkRes.reduce((s, w) => s + (parseFloat(w.betrag) || 0), 0);
        const wbkNetto  = Math.max(wbkGesamt, 1230); // Pauschbetrag mind. 1.230 €

        // Monatliche Aufschlüsselung für Chart
        const monateEin = Array(12).fill(0);
        const monateAus = Array(12).fill(0);
        jahresTx.forEach(t => {
            const m = parseInt((t.date || '').substring(5, 7)) - 1;
            if (m < 0 || m > 11) return;
            if (t.type === 'Einnahmen') monateEin[m] += t.amount;
            else monateAus[m] += t.amount;
        });

        const monatsNamen = ['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'];

        root.innerHTML =
            // Stat-Cards
            '<div class="steuer-stats-grid">' +
                statCard('ri-money-euro-circle-line', 'rgba(34,197,94,0.12)', '#22c55e', 'Gesamteinnahmen', fmt.format(einnahmen)) +
                statCard('ri-exchange-dollar-line', 'rgba(239,68,68,0.1)', '#ef4444', 'Gesamtausgaben', fmt.format(ausgaben)) +
                statCard('ri-briefcase-4-line', 'rgba(99,88,230,0.12)', '#8b7ff5', 'Werbungskosten', fmt.format(wbkGesamt) + '<span style="font-size:0.7rem;color:var(--text-3);font-weight:400;margin-left:6px;">(anrechenbar: ' + fmtK.format(wbkNetto) + ')</span>') +
                statCard('ri-scales-line', 'rgba(245,158,11,0.12)', '#f59e0b', 'Netto-Saldo', fmt.format(einnahmen - ausgaben)) +
            '</div>' +

            // Hinweis-Banner
            '<div style="background:rgba(99,88,230,0.07);border:1px solid rgba(99,88,230,0.2);border-radius:var(--radius-md);padding:12px 16px;display:flex;align-items:center;gap:10px;font-size:0.82rem;color:var(--text-2);margin-bottom:20px;">' +
                '<i class="ri-information-line" style="color:var(--accent);font-size:1.1rem;flex-shrink:0;"></i>' +
                'Die Einnahmen/Ausgaben stammen aus deinem Ausgabentracker für ' + aktuellesJahr + '. Für die Steuererklärung ist das Bruttogehalt aus der Lohnsteuerbescheinigung maßgeblich.' +
            '</div>' +

            // Charts
            '<div class="steuer-jahres-grid">' +
                '<div class="card" style="padding:20px;">' +
                    '<h4 style="margin:0 0 16px;">Einnahmen & Ausgaben ' + aktuellesJahr + '</h4>' +
                    '<div style="height:220px;position:relative;"><canvas id="jahresChart"></canvas></div>' +
                '</div>' +
                '<div class="card" style="padding:20px;">' +
                    '<h4 style="margin:0 0 16px;">Werbungskosten nach Kategorie</h4>' +
                    '<div id="wbkChartArea">' +
                        (wbkRes.length === 0 ?
                            '<div style="text-align:center;color:var(--text-3);padding:40px 0;font-size:0.85rem;">Noch keine Werbungskosten für ' + aktuellesJahr + ' erfasst.</div>' :
                            renderWbkBalken(wbkRes)) +
                    '</div>' +
                '</div>' +
            '</div>' +

            // Monatliche Detail-Tabelle
            '<div class="card" style="padding:20px;">' +
                '<h4 style="margin:0 0 16px;">Monatliche Aufschlüsselung</h4>' +
                '<div style="overflow-x:auto;">' +
                    '<table style="width:100%;border-collapse:collapse;font-size:0.82rem;">' +
                        '<thead><tr>' +
                            '<th style="text-align:left;padding:8px 10px;color:var(--text-3);font-weight:600;border-bottom:1px solid var(--border);">Monat</th>' +
                            '<th style="text-align:right;padding:8px 10px;color:var(--text-3);font-weight:600;border-bottom:1px solid var(--border);">Einnahmen</th>' +
                            '<th style="text-align:right;padding:8px 10px;color:var(--text-3);font-weight:600;border-bottom:1px solid var(--border);">Ausgaben</th>' +
                            '<th style="text-align:right;padding:8px 10px;color:var(--text-3);font-weight:600;border-bottom:1px solid var(--border);">Saldo</th>' +
                        '</tr></thead>' +
                        '<tbody>' +
                            monatsNamen.map((m, i) => {
                                const saldo = monateEin[i] - monateAus[i];
                                return '<tr style="border-bottom:1px solid var(--border);">' +
                                    '<td style="padding:8px 10px;font-weight:500;">' + m + ' ' + aktuellesJahr + '</td>' +
                                    '<td style="padding:8px 10px;text-align:right;color:#22c55e;">' + (monateEin[i] > 0 ? fmt.format(monateEin[i]) : '—') + '</td>' +
                                    '<td style="padding:8px 10px;text-align:right;color:#ef4444;">' + (monateAus[i] > 0 ? fmt.format(monateAus[i]) : '—') + '</td>' +
                                    '<td style="padding:8px 10px;text-align:right;font-weight:700;color:' + (saldo >= 0 ? '#22c55e' : '#ef4444') + ';">' +
                                        (monateEin[i] > 0 || monateAus[i] > 0 ? fmt.format(saldo) : '—') +
                                    '</td>' +
                                '</tr>';
                            }).join('') +
                        '</tbody>' +
                    '</table>' +
                '</div>' +
            '</div>';

        // Chart rendern
        requestAnimationFrame(() => {
            const canvas = document.getElementById('jahresChart');
            if (!canvas) return;
            new Chart(canvas, {
                type: 'bar',
                data: {
                    labels: monatsNamen,
                    datasets: [
                        { label: 'Einnahmen', data: monateEin, backgroundColor: 'rgba(34,197,94,0.6)', borderColor: '#22c55e', borderRadius: 4 },
                        { label: 'Ausgaben',  data: monateAus, backgroundColor: 'rgba(239,68,68,0.5)',  borderColor: '#ef4444', borderRadius: 4 },
                    ]
                },
                options: {
                    responsive: true, maintainAspectRatio: false,
                    plugins: { legend: { labels: { color: '#aaa', font: { size: 11 } } } },
                    scales: {
                        y: { ticks: { color: '#aaa', callback: v => fmtK.format(v) }, grid: { color: 'rgba(255,255,255,0.06)' } },
                        x: { ticks: { color: '#aaa' }, grid: { color: 'rgba(255,255,255,0.06)' } }
                    }
                }
            });
        });

    } catch (err) {
        root.innerHTML = '<div class="card" style="text-align:center;padding:60px;color:#ef4444;">Fehler beim Laden der Jahresübersicht.</div>';
    }
}

function statCard(icon, bg, color, label, value) {
    return '<div class="steuer-stat-card">' +
        '<div class="steuer-stat-icon" style="background:' + bg + ';color:' + color + ';"><i class="' + icon + '"></i></div>' +
        '<div><div class="steuer-stat-label">' + label + '</div><div class="steuer-stat-value">' + value + '</div></div>' +
    '</div>';
}

function renderWbkBalken(wbks) {
    const byKat = {};
    wbks.forEach(w => {
        const k = w.kategorie || 'sonstiges';
        byKat[k] = (byKat[k] || 0) + parseFloat(w.betrag || 0);
    });
    const total = Object.values(byKat).reduce((s, v) => s + v, 0);
    const sorted = Object.entries(byKat).sort((a, b) => b[1] - a[1]);
    return sorted.map(([k, v]) => {
        const cfg = WBK_KAT[k] || WBK_KAT.sonstiges;
        const pct = total > 0 ? (v / total * 100) : 0;
        return '<div style="margin-bottom:12px;">' +
            '<div style="display:flex;justify-content:space-between;font-size:0.82rem;margin-bottom:5px;">' +
                '<span style="display:flex;align-items:center;gap:6px;"><i class="' + cfg.icon + '" style="color:' + cfg.color + ';"></i>' + cfg.label + '</span>' +
                '<span style="font-weight:600;">' + fmt.format(v) + '</span>' +
            '</div>' +
            '<div style="background:var(--surface-2);border-radius:4px;height:6px;overflow:hidden;">' +
                '<div style="height:100%;width:' + pct + '%;background:' + cfg.color + ';border-radius:4px;transition:width 0.4s;"></div>' +
            '</div>' +
        '</div>';
    }).join('');
}

// ══════════════════════════════════════════════════════════════
//  2. ERSTATTUNGSSCHÄTZER
// ══════════════════════════════════════════════════════════════
function berechneSchaetzer() {
    const brutto       = parseFloat(document.getElementById('schaetzerBrutto')?.value) || 0;
    const stklasse     = parseInt(document.getElementById('schaetzerStklasse')?.value) || 1;
    const kirchePct    = parseFloat(document.getElementById('schaetzerKirche')?.value) || 0;
    const werbungInput = parseFloat(document.getElementById('schaetzerWerbung')?.value);
    const sonder       = parseFloat(document.getElementById('schaetzerSonder')?.value) || 0;
    const belastung    = parseFloat(document.getElementById('schaetzerBelastung')?.value) || 0;
    const gezahlt      = parseFloat(document.getElementById('schaetzerGezahlt')?.value) || 0;

    const root = document.getElementById('schaetzerErgebnis');
    if (!brutto) {
        root.innerHTML = '<div style="text-align:center;color:var(--text-3);padding:40px 0;"><i class="ri-calculator-line" style="font-size:2.5rem;display:block;margin-bottom:12px;opacity:0.3;"></i>Gib dein Bruttoeinkommen ein, um eine Schätzung zu erhalten.</div>';
        return;
    }

    // Werbungskosten: mind. 1.230 € Pauschbetrag
    const werbung = Math.max(werbungInput || 1230, 1230);

    // Grundfreibetrag 2024
    const grundfreibetrag = stklasse === 3 ? 23208 : 11604;

    // Zu versteuerndes Einkommen
    const zve = Math.max(0, brutto - werbung - sonder - belastung - grundfreibetrag);

    // Vereinfachte Einkommensteuerberechnung (Progressionszonen 2024)
    let est = berechnESt(zve, stklasse);

    // Solidaritätszuschlag (entfällt für ~90% bei Beträgen unter ~18.130 € ESt)
    const solidaFreigrenze = 18130;
    let soli = 0;
    if (est > solidaFreigrenze) soli = est * 0.055;
    else if (est > solidaFreigrenze * 0.9) soli = (est - solidaFreigrenze * 0.9) * 0.055 * (est / solidaFreigrenze - 0.9) / 0.1;

    // Kirchensteuer
    const kirche = est * kirchePct / 100;

    // Steuerersparnis durch Werbungskosten (grober Grenzsteuersatz)
    const grenzsteuersatz = berechneGrenzsteuersatz(zve);
    const wbkErsparnisExtra = Math.max(0, werbung - 1230) * grenzsteuersatz;

    const gesamtSchuld = est + soli + kirche;
    const differenz    = gezahlt - gesamtSchuld;
    const positiv      = differenz >= 0;

    root.innerHTML =
        '<h4 style="margin:0 0 18px;display:flex;align-items:center;gap:8px;">' +
            '<i class="ri-calculator-line" style="color:var(--accent);"></i> Schätzung für ' + brutto.toLocaleString('de-DE') + ' € Brutto' +
        '</h4>' +
        '<div style="background:' + (positiv ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.06)') + ';border:1px solid ' + (positiv ? 'rgba(34,197,94,0.25)' : 'rgba(239,68,68,0.2)') + ';border-radius:var(--radius-lg);padding:18px;margin-bottom:18px;text-align:center;">' +
            '<div style="font-size:0.78rem;color:var(--text-3);text-transform:uppercase;letter-spacing:0.06em;">' + (positiv ? 'Geschätzte Erstattung' : 'Geschätzte Nachzahlung') + '</div>' +
            '<div style="font-size:2.2rem;font-weight:800;color:' + (positiv ? '#22c55e' : '#ef4444') + ';margin-top:6px;">' +
                (positiv ? '+' : '-') + fmt.format(Math.abs(differenz)) +
            '</div>' +
            (gezahlt === 0 ? '<div style="font-size:0.76rem;color:var(--text-3);margin-top:6px;">Trage deine gezahlte Lohnsteuer ein für eine Differenzberechnung</div>' : '') +
        '</div>' +
        '<div style="border-top:1px solid var(--border);padding-top:14px;">' +
            zeileSchaetzer('Zu versteuerndes Einkommen', fmt.format(zve), '') +
            zeileSchaetzer('Einkommensteuer (geschätzt)', fmt.format(est), '') +
            (soli > 0 ? zeileSchaetzer('Solidaritätszuschlag', fmt.format(soli), '') : '') +
            (kirche > 0 ? zeileSchaetzer('Kirchensteuer (' + kirchePct + '%)', fmt.format(kirche), '') : '') +
            '<div class="schaetzer-result-row total">' +
                '<span>Steuerbelastung gesamt</span>' +
                '<span style="color:#ef4444;">' + fmt.format(gesamtSchuld) + '</span>' +
            '</div>' +
            (wbkErsparnisExtra > 0 ? zeileSchaetzer('💡 Ersparnis durch Werbungskosten über Pauschale', '+' + fmt.format(wbkErsparnisExtra), '#22c55e') : '') +
            (gezahlt > 0 ? zeileSchaetzer('Gezahlte Lohnsteuer', fmt.format(gezahlt), '') : '') +
        '</div>';
}

function zeileSchaetzer(label, value, color) {
    return '<div class="schaetzer-result-row">' +
        '<span style="color:var(--text-2);">' + label + '</span>' +
        '<span style="font-weight:700;color:' + (color || 'var(--text-1)') + ';">' + value + '</span>' +
    '</div>';
}

function berechnESt(zve, stklasse) {
    // Einkommensteuer-Grundtabelle 2024 (vereinfacht, linear-progressiv)
    // Für Steuerklasse 3 wird Splitting-Vorteil simuliert (Faktor ~0.6 auf Klasse 1)
    if (stklasse === 3) {
        const zveSplit = zve / 2;
        return berechnEStGrundtabelle(zveSplit) * 2;
    }
    return berechnEStGrundtabelle(zve);
}

function berechnEStGrundtabelle(zve) {
    if (zve <= 0) return 0;
    if (zve <= 17005) {
        const y = (zve - 11604) / 10000;
        return Math.max(0, (922.98 * y + 1400) * y);
    }
    if (zve <= 66760) {
        const z = (zve - 17005) / 10000;
        return (181.19 * z + 2397) * z + 1025.38;
    }
    if (zve <= 277825) {
        return 0.42 * zve - 10602.13;
    }
    return 0.45 * zve - 18936.88;
}

function berechneGrenzsteuersatz(zve) {
    if (zve <= 17005) return 0.14 + (zve - 11604) / 10000 * 0.2398;
    if (zve <= 66760) return 0.24;
    if (zve <= 277825) return 0.42;
    return 0.45;
}

// ══════════════════════════════════════════════════════════════
//  3. WERBUNGSKOSTEN
// ══════════════════════════════════════════════════════════════
async function ladeWerbungskosten() {
    try {
        const res = await fetch('/users/steuer/werbungskosten');
        alleWerbungskosten = await res.json();
    } catch { alleWerbungskosten = []; }
    renderWerbungskosten();
}

function filterWbk(kat, btn) {
    aktiveWbkKat = kat;
    document.querySelectorAll('.steuer-kat-tab').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    renderWerbungskosten();
}

function renderWerbungskosten() {
    const root = document.getElementById('wbkRoot');
    const jahrFilter = aktuellesJahr;
    let filtered = alleWerbungskosten.filter(w => parseInt(w.steuerjahr) === jahrFilter);
    if (aktiveWbkKat !== 'alle') filtered = filtered.filter(w => w.kategorie === aktiveWbkKat);

    // Summen-Badges
    const jahrGesamt = alleWerbungskosten.filter(w => parseInt(w.steuerjahr) === jahrFilter).reduce((s, w) => s + parseFloat(w.betrag || 0), 0);
    const wbkNetto   = Math.max(jahrGesamt, 1230);
    document.getElementById('wbkSumBadge').innerHTML =
        '<div style="background:rgba(99,88,230,0.1);border:1px solid rgba(99,88,230,0.2);border-radius:var(--radius-md);padding:8px 16px;font-size:0.83rem;">' +
            '<span style="font-weight:700;color:var(--accent);">' + fmt.format(jahrGesamt) + '</span> erfasst ' + jahrFilter +
        '</div>' +
        '<div style="background:rgba(34,197,94,0.08);border:1px solid rgba(34,197,94,0.15);border-radius:var(--radius-md);padding:8px 16px;font-size:0.83rem;">' +
            '<span style="font-weight:700;color:#22c55e;">' + fmt.format(wbkNetto) + '</span> anrechenbar' +
            (jahrGesamt < 1230 ? ' <span style="color:var(--text-3);font-size:0.75rem;">(Pauschale)</span>' : '') +
        '</div>';

    if (filtered.length === 0) {
        root.innerHTML = '<div class="card" style="text-align:center;padding:40px;color:var(--text-3);">' +
            '<i class="ri-briefcase-4-line" style="font-size:2rem;display:block;margin-bottom:10px;opacity:0.3;"></i>' +
            'Keine Werbungskosten für ' + jahrFilter + (aktiveWbkKat !== 'alle' ? ' in dieser Kategorie' : '') + ' erfasst.' +
        '</div>';
        return;
    }

    // Nach Kategorie gruppieren
    const gruppen = {};
    filtered.forEach(w => {
        const k = w.kategorie || 'sonstiges';
        if (!gruppen[k]) gruppen[k] = [];
        gruppen[k].push(w);
    });

    root.innerHTML = Object.entries(gruppen).map(([kat, items]) => {
        const cfg     = WBK_KAT[kat] || WBK_KAT.sonstiges;
        const summe   = items.reduce((s, w) => s + parseFloat(w.betrag || 0), 0);
        return '<div class="card" style="padding:20px;margin-bottom:14px;">' +
            '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">' +
                '<div style="display:flex;align-items:center;gap:10px;">' +
                    '<div style="width:36px;height:36px;border-radius:10px;background:' + cfg.bg + ';color:' + cfg.color + ';display:flex;align-items:center;justify-content:center;">' +
                        '<i class="' + cfg.icon + '"></i>' +
                    '</div>' +
                    '<div>' +
                        '<div style="font-weight:700;font-size:0.9rem;">' + cfg.label + '</div>' +
                        '<div style="font-size:0.75rem;color:var(--text-3);">' + items.length + ' Posten</div>' +
                    '</div>' +
                '</div>' +
                '<div style="font-weight:800;font-size:1.1rem;color:' + cfg.color + ';">' + fmt.format(summe) + '</div>' +
            '</div>' +
            '<div>' +
                items.map(w =>
                    '<div class="wbk-item">' +
                        '<div style="flex:1;min-width:0;">' +
                            '<div style="font-weight:600;font-size:0.85rem;">' + esc(w.bezeichnung) + '</div>' +
                            '<div style="font-size:0.74rem;color:var(--text-3);margin-top:2px;">' +
                                (w.datum ? new Date(w.datum).toLocaleDateString('de-DE') : '—') +
                                (w.notiz ? ' · ' + esc(w.notiz) : '') +
                            '</div>' +
                        '</div>' +
                        '<div style="display:flex;align-items:center;gap:8px;">' +
                            '<span style="font-weight:700;font-size:0.88rem;color:' + cfg.color + ';">' + fmt.format(parseFloat(w.betrag || 0)) + '</span>' +
                            '<button onclick="openWbkModal(' + w.id + ')" style="width:26px;height:26px;border-radius:6px;background:var(--surface-2);border:none;color:var(--text-3);cursor:pointer;"><i class="ri-edit-line"></i></button>' +
                            '<button onclick="deleteWbk(' + w.id + ')" style="width:26px;height:26px;border-radius:6px;background:rgba(239,68,68,0.1);border:none;color:#ef4444;cursor:pointer;"><i class="ri-delete-bin-line"></i></button>' +
                        '</div>' +
                    '</div>'
                ).join('') +
            '</div>' +
        '</div>';
    }).join('');
}

function openWbkModal(id) {
    const existing = id ? alleWerbungskosten.find(w => w.id == id) : null;
    document.getElementById('wbkId').value         = existing?.id || '';
    document.getElementById('wbkKat').value         = existing?.kategorie || 'fahrtkosten';
    document.getElementById('wbkBezeichnung').value = existing?.bezeichnung || '';
    document.getElementById('wbkBetrag').value      = existing?.betrag || '';
    document.getElementById('wbkDatum').value       = existing?.datum || '';
    document.getElementById('wbkNotiz').value       = existing?.notiz || '';
    document.getElementById('wbkJahr').value        = existing?.steuerjahr || aktuellesJahr;
    document.getElementById('wbkModalTitle').innerHTML =
        '<i class="ri-briefcase-4-line"></i> ' + (existing ? 'Posten bearbeiten' : 'Posten hinzufügen');
    document.getElementById('wbkModal').classList.add('active');
}

function closeWbkModal(e) {
    if (e && e.target !== document.getElementById('wbkModal')) return;
    document.getElementById('wbkModal').classList.remove('active');
}

async function saveWbk() {
    const id       = document.getElementById('wbkId').value;
    const bezeich  = document.getElementById('wbkBezeichnung').value.trim();
    if (!bezeich) { alert('Bitte Bezeichnung eingeben.'); return; }

    const btn = document.getElementById('wbkSaveBtn');
    btn.disabled = true;
    btn.innerHTML = '<i class="ri-loader-4-line" style="animation:spin 1s linear infinite;display:inline-block;"></i>';

    const payload = {
        kategorie:   document.getElementById('wbkKat').value,
        bezeichnung: bezeich,
        betrag:      parseFloat(document.getElementById('wbkBetrag').value) || 0,
        datum:       document.getElementById('wbkDatum').value || null,
        steuerjahr:  parseInt(document.getElementById('wbkJahr').value),
        notiz:       document.getElementById('wbkNotiz').value.trim(),
    };

    try {
        const url    = id ? '/users/steuer/werbungskosten/' + id : '/users/steuer/werbungskosten/add';
        const method = id ? 'PUT' : 'POST';
        const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        if (!r.ok) throw new Error();
        closeWbkModal();
        await ladeWerbungskosten();
    } catch { alert('Fehler beim Speichern.'); }
    finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="ri-save-line"></i> Speichern';
    }
}

async function deleteWbk(id) {
    if (!confirm('Werbungskosten-Posten löschen?')) return;
    try {
        await fetch('/users/steuer/werbungskosten/delete/' + id, { method: 'DELETE' });
        await ladeWerbungskosten();
    } catch { alert('Fehler beim Löschen.'); }
}

// ══════════════════════════════════════════════════════════════
//  4. STEUERERKLÄRUNG-ASSISTENT
// ══════════════════════════════════════════════════════════════
async function ladeAssistentChecks() {
    try {
        const res = await fetch('/users/steuer/assistent/checks');
        const data = await res.json();
        assistentChecks = data || {};
    } catch { assistentChecks = {}; }
    renderAssistent();
}

function renderAssistent() {
    const root = document.getElementById('assistentRoot');
    let gesamtItems = 0;
    let erledigtItems = 0;

    root.innerHTML = ASSISTENT_GRUPPEN.map(g => {
        const itemsHtml = g.items.map(item => {
            const checked = !!assistentChecks[item.id];
            gesamtItems++;
            if (checked) erledigtItems++;
            return '<div class="assistent-check-item">' +
                '<div class="assistent-checkbox ' + (checked ? 'checked' : '') + '" onclick="toggleCheck(\'' + item.id + '\')">' +
                    (checked ? '<i class="ri-check-line" style="font-size:0.8rem;"></i>' : '') +
                '</div>' +
                '<div>' +
                    '<div style="font-weight:600;font-size:0.87rem;' + (checked ? 'text-decoration:line-through;color:var(--text-3);' : '') + '">' + esc(item.text) + '</div>' +
                    '<div style="font-size:0.76rem;color:var(--text-3);margin-top:3px;line-height:1.5;">' + esc(item.tipp) + '</div>' +
                '</div>' +
            '</div>';
        }).join('');
        return '<div class="card" style="padding:20px;margin-bottom:14px;">' +
            '<div class="assistent-group-label">' + esc(g.gruppe) + '</div>' +
            itemsHtml +
        '</div>';
    }).join('');

    // Progress
    const pct = gesamtItems > 0 ? (erledigtItems / gesamtItems * 100) : 0;
    const pt  = document.getElementById('progressText');
    const pb  = document.getElementById('progressBar');
    if (pt) pt.textContent = erledigtItems + ' / ' + gesamtItems;
    if (pb) pb.style.width = pct + '%';

    // Tipp-Text
    const tipps = document.getElementById('assistentTipps');
    if (tipps) {
        if (pct === 0) tipps.textContent = 'Hake Schritt für Schritt ab was du bereits erledigt hast.';
        else if (pct < 50) tipps.textContent = 'Guter Start! Fokussiere dich auf die Einkommensnachweise zuerst.';
        else if (pct < 100) tipps.textContent = 'Du bist auf dem richtigen Weg. Fast fertig!';
        else tipps.innerHTML = '<span style="color:#22c55e;font-weight:700;">✓ Alles erledigt!</span> Du kannst deine Steuererklärung abgeben.';
    }
}

async function toggleCheck(id) {
    assistentChecks[id] = !assistentChecks[id];
    renderAssistent();
    try {
        await fetch('/users/steuer/assistent/checks', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ checks: assistentChecks })
        });
    } catch {}
}

// ══════════════════════════════════════════════════════════════
//  5. STEUER-DOKUMENTE
// ══════════════════════════════════════════════════════════════
async function ladeSteuerDokumente() {
    const root = document.getElementById('dokRoot');
    root.innerHTML = '<div class="steuer-loading"><i class="ri-loader-4-line steuer-spin"></i> Lade Dokumente…</div>';

    try {
        const res = await fetch('/users/dokumente/data');
        const alle = await res.json();

        // Nur Steuer-relevante Dokumente
        const steuerDoks = alle.filter(d => d.typ === 'steuer' || d.typ === 'gehalt');

        // Nach Jahr gruppieren
        const byJahr = {};
        steuerDoks.forEach(d => {
            const j = d.steuerjahr || d.jahr || new Date(d.datum || d.created_at || Date.now()).getFullYear();
            if (!byJahr[j]) byJahr[j] = [];
            byJahr[j].push(d);
        });

        const sortedJahre = Object.keys(byJahr).sort((a, b) => b - a);

        if (steuerDoks.length === 0) {
            root.innerHTML =
                '<div class="card" style="text-align:center;padding:50px;">' +
                    '<i class="ri-folder-open-line" style="font-size:2.5rem;display:block;margin-bottom:14px;opacity:0.25;"></i>' +
                    '<h3 style="margin-bottom:8px;">Keine Steuer-Dokumente</h3>' +
                    '<p style="color:var(--text-3);margin-bottom:20px;">Lade Lohnsteuerbescheinigungen, Steuerbescheide und weitere steuerrelevante Dokumente im Dokumente-Bereich hoch.</p>' +
                    '<a href="/users/dokumente" class="btn-primary" style="text-decoration:none;display:inline-flex;align-items:center;gap:6px;">' +
                        '<i class="ri-folder-add-line"></i> Zu den Dokumenten' +
                    '</a>' +
                '</div>';
            return;
        }

        const DOK_CFG = {
            steuer: { label: 'Steuerdokument',    icon: 'ri-government-line',         bg: 'rgba(245,158,11,0.12)', color: '#f59e0b' },
            gehalt: { label: 'Gehaltsabrechnung',  icon: 'ri-money-euro-circle-line',  bg: 'rgba(34,197,94,0.12)',  color: '#22c55e' },
        };

        root.innerHTML =
            '<div style="display:flex;gap:10px;margin-bottom:16px;flex-wrap:wrap;">' +
                '<div style="background:rgba(99,88,230,0.08);border:1px solid rgba(99,88,230,0.18);border-radius:var(--radius-md);padding:8px 16px;font-size:0.83rem;">' +
                    '<span style="font-weight:700;color:var(--accent);">' + steuerDoks.length + '</span> Dokumente gefunden' +
                '</div>' +
                '<a href="/users/dokumente" style="display:flex;align-items:center;gap:6px;padding:8px 14px;border-radius:var(--radius-md);background:var(--surface-2);color:var(--text-2);border:1px solid var(--border);font-size:0.83rem;text-decoration:none;">' +
                    '<i class="ri-folder-add-line"></i> Dokument hinzufügen' +
                '</a>' +
            '</div>' +
            sortedJahre.map(j => {
                const doks = byJahr[j];
                return '<div class="card" style="padding:20px;margin-bottom:14px;">' +
                    '<div style="font-size:0.72rem;font-weight:700;color:var(--text-3);text-transform:uppercase;letter-spacing:0.07em;margin-bottom:14px;">' + j + '</div>' +
                    doks.map(d => {
                        const cfg = DOK_CFG[d.typ] || DOK_CFG.steuer;
                        return '<div class="steuer-dok-row">' +
                            '<div style="width:36px;height:36px;border-radius:10px;background:' + cfg.bg + ';color:' + cfg.color + ';display:flex;align-items:center;justify-content:center;flex-shrink:0;">' +
                                '<i class="' + cfg.icon + '"></i>' +
                            '</div>' +
                            '<div style="flex:1;min-width:0;">' +
                                '<div style="font-weight:600;font-size:0.87rem;">' + esc(d.name) + '</div>' +
                                '<div style="font-size:0.74rem;color:var(--text-3);margin-top:2px;">' +
                                    cfg.label +
                                    (d.datum ? ' · ' + new Date(d.datum).toLocaleDateString('de-DE') : '') +
                                    (d.arbeitgeber ? ' · ' + esc(d.arbeitgeber) : '') +
                                '</div>' +
                            '</div>' +
                            '<a href="/users/dokumente/' + d.id + '/view" style="display:flex;align-items:center;gap:5px;padding:6px 12px;border-radius:var(--radius-md);background:var(--surface-2);color:var(--text-2);border:1px solid var(--border);font-size:0.78rem;text-decoration:none;">' +
                                '<i class="ri-eye-line"></i> Ansehen' +
                            '</a>' +
                        '</div>';
                    }).join('') +
                '</div>';
            }).join('');

    } catch (err) {
        root.innerHTML = '<div class="card" style="text-align:center;padding:60px;color:#ef4444;">Fehler beim Laden der Dokumente.</div>';
    }
}