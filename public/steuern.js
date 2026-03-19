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
let alleKapitalertraege = [];
let alleSonderausgaben = [];
let aktiveSonderKat = 'alle';
let alleAltersvorsorge = [];

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
    ladeKapitalertraege();
    ladeSonderausgaben();
    ladeAltersvorsorge();
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
    // Modal-Jahr-Selects befüllen
    ['wbkJahr', 'kapitalJahr', 'avJahr', 'sonderJahr'].forEach(selId => {
        const s = document.getElementById(selId);
        if (!s) return;
        for (let j = aktJahr; j >= aktJahr - 5; j--) {
            const opt = document.createElement('option');
            opt.value = j;
            opt.textContent = j;
            if (j === aktJahr - 1) opt.selected = true;
            s.appendChild(opt);
        }
    });
}

function jahrWechseln() {
    aktuellesJahr = parseInt(document.getElementById('jahrSelect').value);
    ladeUebersicht();
    filterWbk(aktiveWbkKat, null);
    renderKapital();
    renderAltersvorsorge();
    renderSonder();
}

function switchTab(tab, btn) {
    document.querySelectorAll('.steuer-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.steuer-tab-content').forEach(c => c.style.display = 'none');
    if (btn) btn.classList.add('active');
    const el = document.getElementById('tab-' + tab);
    if (el) { el.style.display = 'block'; el.classList.add('active'); }

    if (tab === 'uebersicht')    ladeUebersicht();
    if (tab === 'dokumente')     ladeSteuerDokumente();
    if (tab === 'kapital')       renderKapital();
    if (tab === 'altersvorsorge') renderAltersvorsorge();
    if (tab === 'sonder')        renderSonder();
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
    const kapital      = parseFloat(document.getElementById('schaetzerKapital')?.value) || 0;
    const kapitalFSA   = parseFloat(document.getElementById('schaetzerKapitalFSA')?.value);
    const ruerupInput  = parseFloat(document.getElementById('schaetzerRuerup')?.value) || 0;
    const riesterInput = parseFloat(document.getElementById('schaetzerRiester')?.value) || 0;

    const root = document.getElementById('schaetzerErgebnis');
    if (!brutto) {
        root.innerHTML = '<div style="text-align:center;color:var(--text-3);padding:40px 0;"><i class="ri-calculator-line" style="font-size:2.5rem;display:block;margin-bottom:12px;opacity:0.3;"></i>Gib dein Bruttoeinkommen ein, um eine Schätzung zu erhalten.</div>';
        return;
    }

    // Werbungskosten: mind. 1.230 € Pauschbetrag
    const werbung = Math.max(werbungInput || 1230, 1230);

    // Altersvorsorge-Abzüge
    const sparerpauschbetrag = stklasse === 3 ? 2000 : 1000;
    const fsa = kapitalFSA !== undefined ? kapitalFSA : sparerpauschbetrag;
    const kapitalSteuerpflichtig = Math.max(0, kapital - fsa);
    const abgeltungssteuer = kapitalSteuerpflichtig * 0.25;
    const abgeltungsSoli   = abgeltungssteuer > 972.5 ? abgeltungssteuer * 0.055 : 0; // Soli-Freigrenze Abgeltung

    // Rürup: 94% des Beitrags abzugsfähig, max. 27.565 € (2024)
    const ruerupAbzug = Math.min(ruerupInput * 0.94, 27565 * 0.94);
    // Riester: max. 2.100 €
    const riesterAbzug = Math.min(riesterInput, 2100);
    const avAbzug = ruerupAbzug + riesterAbzug;

    // Grundfreibetrag 2024
    const grundfreibetrag = stklasse === 3 ? 23208 : 11604;

    // Zu versteuerndes Einkommen
    const zve = Math.max(0, brutto - werbung - sonder - belastung - avAbzug - grundfreibetrag);

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

    const gesamtSchuld = est + soli + kirche + abgeltungssteuer + abgeltungsSoli;
    const differenz    = gezahlt - (est + soli + kirche);
    const positiv      = differenz >= 0;

    root.innerHTML =
        '<h4 style="margin:0 0 18px;display:flex;align-items:center;gap:8px;">' +
            '<i class="ri-calculator-line" style="color:var(--accent);"></i> Schätzung für ' + brutto.toLocaleString('de-DE') + ' € Brutto' +
        '</h4>' +
        '<div style="background:' + (positiv ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.06)') + ';border:1px solid ' + (positiv ? 'rgba(34,197,94,0.25)' : 'rgba(239,68,68,0.2)') + ';border-radius:var(--radius-lg);padding:18px;margin-bottom:18px;text-align:center;">' +
            '<div style="font-size:0.78rem;color:var(--text-3);text-transform:uppercase;letter-spacing:0.06em;">' + (positiv ? 'Geschätzte Erstattung (Einkommensteuer)' : 'Geschätzte Nachzahlung (Einkommensteuer)') + '</div>' +
            '<div style="font-size:2.2rem;font-weight:800;color:' + (positiv ? '#22c55e' : '#ef4444') + ';margin-top:6px;">' +
                (positiv ? '+' : '-') + fmt.format(Math.abs(differenz)) +
            '</div>' +
            (gezahlt === 0 ? '<div style="font-size:0.76rem;color:var(--text-3);margin-top:6px;">Trage deine gezahlte Lohnsteuer ein für eine Differenzberechnung</div>' : '') +
        '</div>' +
        '<div style="border-top:1px solid var(--border);padding-top:14px;">' +
            zeileSchaetzer('Zu versteuerndes Einkommen', fmt.format(zve), '') +
            (avAbzug > 0 ? zeileSchaetzer('Altersvorsorge-Abzug (Rürup + Riester)', '−' + fmt.format(avAbzug), '#22c55e') : '') +
            zeileSchaetzer('Einkommensteuer (geschätzt)', fmt.format(est), '') +
            (soli > 0 ? zeileSchaetzer('Solidaritätszuschlag', fmt.format(soli), '') : '') +
            (kirche > 0 ? zeileSchaetzer('Kirchensteuer (' + kirchePct + '%)', fmt.format(kirche), '') : '') +
            (kapital > 0 ? '<div style="margin-top:10px;padding-top:10px;border-top:1px dashed var(--border);">' +
                zeileSchaetzer('Kapitalerträge', fmt.format(kapital), '') +
                zeileSchaetzer('Sparerpauschbetrag (genutzt)', '−' + fmt.format(Math.min(kapital, fsa)), '#22c55e') +
                (kapitalSteuerpflichtig > 0 ? zeileSchaetzer('Steuerpflichtige Kapitalerträge', fmt.format(kapitalSteuerpflichtig), '') : '') +
                (abgeltungssteuer > 0 ? zeileSchaetzer('Abgeltungssteuer (25%)', fmt.format(abgeltungssteuer), '#ef4444') : '') +
                (abgeltungsSoli > 0 ? zeileSchaetzer('Soli auf Abgeltungssteuer', fmt.format(abgeltungsSoli), '') : '') +
            '</div>' : '') +
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

function deleteWbk(id) {
    const w = alleWerbungskosten.find(w => w.id == id);
    if (!w) return;
    alleWerbungskosten = alleWerbungskosten.filter(w => w.id != id);
    renderWerbungskosten();
    let timer = setTimeout(async () => {
        try { await fetch('/users/steuer/werbungskosten/delete/' + id, { method: 'DELETE' }); }
        catch { alleWerbungskosten.push(w); renderWerbungskosten(); }
    }, 5000);
    showUndoToast('„' + w.bezeichnung + '" gelöscht', () => {
        clearTimeout(timer);
        alleWerbungskosten.push(w);
        renderWerbungskosten();
    });
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
//  5. KAPITALERTRÄGE
// ══════════════════════════════════════════════════════════════
async function ladeKapitalertraege() {
    try {
        const res = await fetch('/users/steuer/kapitalertraege');
        alleKapitalertraege = res.ok ? await res.json() : [];
    } catch { alleKapitalertraege = []; }
    renderKapital();
}

function renderKapital() {
    const root = document.getElementById('kapitalRoot');
    if (!root) return;
    const filtered = alleKapitalertraege.filter(k => parseInt(k.steuerjahr) === aktuellesJahr);

    const sparerpauschbetrag = 1000; // Standard ledig
    const gesamtErtraege = filtered.reduce((s, k) => s + (parseFloat(k.dividenden)||0) + (parseFloat(k.zinsen)||0) + (parseFloat(k.kursgewinne)||0), 0);
    const gesamtFSA      = filtered.reduce((s, k) => s + (parseFloat(k.freistellungsauftrag)||0), 0);
    const steuerpflichtig = Math.max(0, gesamtErtraege - gesamtFSA);
    const abgeltung      = steuerpflichtig * 0.25;

    // Badge
    const badge = document.getElementById('kapitalSumBadge');
    if (badge) {
        badge.innerHTML =
            '<div style="background:rgba(99,88,230,0.1);border:1px solid rgba(99,88,230,0.2);border-radius:var(--radius-md);padding:8px 16px;font-size:0.83rem;">' +
                '<span style="font-weight:700;color:var(--accent);">' + fmt.format(gesamtErtraege) + '</span> Erträge ' + aktuellesJahr +
            '</div>' +
            (abgeltung > 0 ?
            '<div style="background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.2);border-radius:var(--radius-md);padding:8px 16px;font-size:0.83rem;">' +
                '<span style="font-weight:700;color:#ef4444;">' + fmt.format(abgeltung) + '</span> Abgeltungssteuer (25%)' +
            '</div>' : '') +
            (gesamtFSA > 0 ?
            '<div style="background:rgba(34,197,94,0.08);border:1px solid rgba(34,197,94,0.15);border-radius:var(--radius-md);padding:8px 16px;font-size:0.83rem;">' +
                '<span style="font-weight:700;color:#22c55e;">' + fmt.format(gesamtFSA) + '</span> Freistellungsaufträge' +
            '</div>' : '');
    }

    if (filtered.length === 0) {
        root.innerHTML = '<div class="card" style="text-align:center;padding:50px;">' +
            '<i class="ri-stock-line" style="font-size:2.5rem;display:block;margin-bottom:14px;opacity:0.25;"></i>' +
            '<h3 style="margin-bottom:8px;">Keine Kapitalerträge erfasst</h3>' +
            '<p style="color:var(--text-3);">Trage deine Depots und Konten mit Erträgen ein. Dividenden, Zinsen und Kursgewinne werden automatisch mit deinem Freistellungsauftrag verrechnet.</p>' +
            '<button class="btn-primary" style="margin-top:12px;" onclick="openKapitalModal()"><i class="ri-add-line"></i> Depot hinzufügen</button>' +
        '</div>';
        return;
    }

    // Info-Banner wenn FSA < Sparerpauschbetrag
    const fsa_hinweis = gesamtFSA < sparerpauschbetrag ?
        '<div style="background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.2);border-radius:var(--radius-md);padding:12px 16px;display:flex;align-items:center;gap:10px;font-size:0.82rem;color:var(--text-2);margin-bottom:16px;">' +
            '<i class="ri-information-line" style="color:#f59e0b;font-size:1.1rem;flex-shrink:0;"></i>' +
            'Tipp: Der Sparerpauschbetrag beträgt 1.000 € (ledig) / 2.000 € (verheiratet). Du kannst Freistellungsaufträge bei mehreren Banken stellen.' +
        '</div>' : '';

    root.innerHTML = fsa_hinweis + filtered.map(k => {
        const gesErtraege = (parseFloat(k.dividenden)||0) + (parseFloat(k.zinsen)||0) + (parseFloat(k.kursgewinne)||0);
        const kFSA = parseFloat(k.freistellungsauftrag)||0;
        const kSteuerpflichtig = Math.max(0, gesErtraege - kFSA);
        return '<div class="card" style="padding:20px;margin-bottom:14px;">' +
            '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">' +
                '<div style="display:flex;align-items:center;gap:12px;">' +
                    '<div style="width:42px;height:42px;border-radius:12px;background:rgba(99,88,230,0.12);color:var(--accent);display:flex;align-items:center;justify-content:center;font-size:1.1rem;">' +
                        '<i class="ri-stock-line"></i>' +
                    '</div>' +
                    '<div>' +
                        '<div style="font-weight:700;font-size:0.95rem;">' + esc(k.institution) + '</div>' +
                        '<div style="font-size:0.75rem;color:var(--text-3);">Steuerjahr ' + k.steuerjahr + '</div>' +
                    '</div>' +
                '</div>' +
                '<div style="display:flex;align-items:center;gap:8px;">' +
                    '<button onclick="openKapitalModal(' + k.id + ')" style="width:30px;height:30px;border-radius:6px;background:var(--surface-2);border:none;color:var(--text-3);cursor:pointer;"><i class="ri-edit-line"></i></button>' +
                    '<button onclick="deleteKapital(' + k.id + ')" style="width:30px;height:30px;border-radius:6px;background:rgba(239,68,68,0.1);border:none;color:#ef4444;cursor:pointer;"><i class="ri-delete-bin-line"></i></button>' +
                '</div>' +
            '</div>' +
            '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:12px;">' +
                kapitalCell('Dividenden', k.dividenden, '#f59e0b') +
                kapitalCell('Zinsen', k.zinsen, '#3b82f6') +
                kapitalCell('Kursgewinne', k.kursgewinne, '#22c55e') +
                '<div style="background:var(--surface-2);border-radius:var(--radius-md);padding:12px;">' +
                    '<div style="font-size:0.7rem;color:var(--text-3);font-weight:600;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:6px;">FSA</div>' +
                    '<div style="font-size:0.88rem;font-weight:700;color:' + (kFSA >= gesErtraege ? '#22c55e' : 'var(--text-1)') + ';">' + fmt.format(kFSA) + '</div>' +
                '</div>' +
                (kSteuerpflichtig > 0 ? '<div style="background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.18);border-radius:var(--radius-md);padding:12px;">' +
                    '<div style="font-size:0.7rem;color:#ef4444;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:6px;">Steuerpflichtig</div>' +
                    '<div style="font-size:0.88rem;font-weight:700;color:#ef4444;">' + fmt.format(kSteuerpflichtig) + '</div>' +
                '</div>' : '') +
            '</div>' +
        '</div>';
    }).join('');
}

function kapitalCell(label, val, color) {
    const v = parseFloat(val) || 0;
    return '<div style="background:var(--surface-2);border-radius:var(--radius-md);padding:12px;">' +
        '<div style="font-size:0.7rem;color:var(--text-3);font-weight:600;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:6px;">' + label + '</div>' +
        '<div style="font-size:0.88rem;font-weight:700;color:' + (v > 0 ? color : 'var(--text-3)') + ';">' + fmt.format(v) + '</div>' +
    '</div>';
}

function openKapitalModal(id) {
    const existing = id ? alleKapitalertraege.find(k => k.id == id) : null;
    document.getElementById('kapitalId').value          = existing?.id || '';
    document.getElementById('kapitalInstitution').value = existing?.institution || '';
    document.getElementById('kapitalJahr').value        = existing?.steuerjahr || aktuellesJahr;
    document.getElementById('kapitalFSA').value         = existing?.freistellungsauftrag || '';
    document.getElementById('kapitalDiv').value         = existing?.dividenden || '';
    document.getElementById('kapitalZins').value        = existing?.zinsen || '';
    document.getElementById('kapitalKurs').value        = existing?.kursgewinne || '';
    document.getElementById('kapitalModalTitle').innerHTML =
        '<i class="ri-stock-line"></i> ' + (existing ? 'Depot bearbeiten' : 'Depot / Konto hinzufügen');
    document.getElementById('kapitalModal').classList.add('active');
    document.getElementById('kapitalInstitution').focus();
}

function closeKapitalModal(e) {
    if (e && e.target !== document.getElementById('kapitalModal')) return;
    document.getElementById('kapitalModal').classList.remove('active');
}

async function saveKapital() {
    const institution = document.getElementById('kapitalInstitution').value.trim();
    if (!institution) { alert('Bitte Institution eingeben.'); return; }
    const btn = document.getElementById('kapitalSaveBtn');
    btn.disabled = true;
    const id = document.getElementById('kapitalId').value;
    const payload = {
        institution,
        steuerjahr:          parseInt(document.getElementById('kapitalJahr').value),
        freistellungsauftrag: parseFloat(document.getElementById('kapitalFSA').value) || 0,
        dividenden:           parseFloat(document.getElementById('kapitalDiv').value) || 0,
        zinsen:               parseFloat(document.getElementById('kapitalZins').value) || 0,
        kursgewinne:          parseFloat(document.getElementById('kapitalKurs').value) || 0,
    };
    try {
        const url    = id ? '/users/steuer/kapitalertraege/' + id : '/users/steuer/kapitalertraege/add';
        const method = id ? 'PUT' : 'POST';
        const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        if (!r.ok) throw new Error();
        closeKapitalModal();
        await ladeKapitalertraege();
    } catch { alert('Fehler beim Speichern.'); }
    finally { btn.disabled = false; }
}

function deleteKapital(id) {
    const k = alleKapitalertraege.find(k => k.id == id);
    if (!k) return;
    alleKapitalertraege = alleKapitalertraege.filter(k => k.id != id);
    renderKapital();
    let timer = setTimeout(async () => {
        try { await fetch('/users/steuer/kapitalertraege/' + id, { method: 'DELETE' }); }
        catch { alleKapitalertraege.push(k); renderKapital(); }
    }, 5000);
    showUndoToast('„' + k.institution + '" gelöscht', () => {
        clearTimeout(timer);
        alleKapitalertraege.push(k);
        renderKapital();
    });
}

// ══════════════════════════════════════════════════════════════
//  6. ALTERSVORSORGE
// ══════════════════════════════════════════════════════════════
const AV_CFG = {
    riester:  { label: 'Riester-Rente',             icon: 'ri-secure-payment-line',  bg: 'rgba(99,88,230,0.12)',  color: 'var(--accent)',  hinweis: 'Abzugsfähig als Sonderausgabe bis max. 2.100 € (inkl. Zulagen). Grundzulage: 175 €/Jahr.' },
    ruerup:   { label: 'Rürup / Basisrente',         icon: 'ri-shield-user-line',     bg: 'rgba(59,130,246,0.12)',  color: '#3b82f6',       hinweis: 'Beiträge zu 94% absetzbar (2024), bis max. 27.565 € p.a. Keine staatliche Zulage, aber hohe Steuerersparnis.' },
    bav:      { label: 'Betriebliche AV (bAV)',      icon: 'ri-building-4-line',      bg: 'rgba(34,197,94,0.12)',  color: '#22c55e',        hinweis: 'AN-Beiträge bis 4% der BBG (3.624 €, 2024) steuerfrei. AG-Beiträge oft zusätzlich. Entgeltumwandlung möglich.' },
    gkv:      { label: 'Gesetzliche Rentenvers.',    icon: 'ri-government-line',      bg: 'rgba(245,158,11,0.12)', color: '#f59e0b',        hinweis: 'Beiträge fließen automatisch in die Rentenversicherung und werden über die Lohnsteuerbescheinigung berücksichtigt.' },
};

async function ladeAltersvorsorge() {
    try {
        const res = await fetch('/users/steuer/altersvorsorge');
        alleAltersvorsorge = res.ok ? await res.json() : [];
    } catch { alleAltersvorsorge = []; }
    renderAltersvorsorge();
}

function renderAltersvorsorge() {
    const root = document.getElementById('avRoot');
    if (!root) return;
    const filtered = alleAltersvorsorge.filter(a => parseInt(a.steuerjahr) === aktuellesJahr);

    const gesamtEigenbeitrag = filtered.reduce((s, a) => s + (parseFloat(a.eigenbeitrag)||0), 0);
    const gesamtAgBeitrag    = filtered.reduce((s, a) => s + (parseFloat(a.ag_beitrag)||0), 0);
    const gesamtZulagen      = filtered.reduce((s, a) => s + (parseFloat(a.zulage)||0), 0);

    const badge = document.getElementById('avSumBadge');
    if (badge) {
        badge.innerHTML =
            '<div style="background:rgba(99,88,230,0.1);border:1px solid rgba(99,88,230,0.2);border-radius:var(--radius-md);padding:8px 16px;font-size:0.83rem;">' +
                '<span style="font-weight:700;color:var(--accent);">' + fmt.format(gesamtEigenbeitrag) + '</span> Eigenbeiträge ' + aktuellesJahr +
            '</div>' +
            (gesamtZulagen > 0 ?
            '<div style="background:rgba(34,197,94,0.08);border:1px solid rgba(34,197,94,0.15);border-radius:var(--radius-md);padding:8px 16px;font-size:0.83rem;">' +
                '<span style="font-weight:700;color:#22c55e;">' + fmt.format(gesamtZulagen) + '</span> staatliche Zulagen' +
            '</div>' : '');
    }

    if (filtered.length === 0) {
        root.innerHTML = '<div class="card" style="text-align:center;padding:50px;">' +
            '<i class="ri-shield-user-line" style="font-size:2.5rem;display:block;margin-bottom:14px;opacity:0.25;"></i>' +
            '<h3 style="margin-bottom:8px;">Keine Altersvorsorge-Verträge erfasst</h3>' +
            '<p style="color:var(--text-3);">Erfasse Riester, Rürup, bAV und GRV-Beiträge um deine steuerlichen Abzüge im Blick zu behalten.</p>' +
            '<button class="btn-primary" style="margin-top:12px;" onclick="openAvModal()"><i class="ri-add-line"></i> Vertrag hinzufügen</button>' +
        '</div>';
        return;
    }

    const byTyp = {};
    filtered.forEach(a => { const t = a.typ || 'riester'; if (!byTyp[t]) byTyp[t] = []; byTyp[t].push(a); });

    root.innerHTML = Object.entries(byTyp).map(([typ, items]) => {
        const cfg = AV_CFG[typ] || AV_CFG.riester;
        const sumEigen = items.reduce((s, a) => s + (parseFloat(a.eigenbeitrag)||0), 0);
        const sumAG    = items.reduce((s, a) => s + (parseFloat(a.ag_beitrag)||0), 0);
        const sumZulage = items.reduce((s, a) => s + (parseFloat(a.zulage)||0), 0);
        return '<div class="card" style="padding:20px;margin-bottom:14px;">' +
            '<div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;">' +
                '<div style="width:40px;height:40px;border-radius:12px;background:' + cfg.bg + ';color:' + cfg.color + ';display:flex;align-items:center;justify-content:center;font-size:1.1rem;flex-shrink:0;">' +
                    '<i class="' + cfg.icon + '"></i>' +
                '</div>' +
                '<div style="flex:1;">' +
                    '<div style="font-weight:700;">' + cfg.label + '</div>' +
                    '<div style="font-size:0.75rem;color:var(--text-3);">' + items.length + ' Vertrag' + (items.length !== 1 ? '&#8203;&#8203;&#8203;e' : '') + '</div>' +
                '</div>' +
                '<div style="text-align:right;">' +
                    '<div style="font-weight:800;color:' + cfg.color + ';">' + fmt.format(sumEigen) + '</div>' +
                    '<div style="font-size:0.73rem;color:var(--text-3);">Eigenbeitrag</div>' +
                '</div>' +
            '</div>' +
            items.map(a =>
                '<div class="wbk-item">' +
                    '<div style="flex:1;min-width:0;">' +
                        '<div style="font-weight:600;font-size:0.85rem;">' + esc(a.bezeichnung) + '</div>' +
                        '<div style="font-size:0.74rem;color:var(--text-3);margin-top:2px;">' +
                            (parseFloat(a.ag_beitrag) > 0 ? 'AG-Beitrag: ' + fmt.format(a.ag_beitrag) : '') +
                            (parseFloat(a.zulage) > 0 ? ' · Zulage: ' + fmt.format(a.zulage) : '') +
                        '</div>' +
                    '</div>' +
                    '<div style="display:flex;align-items:center;gap:8px;">' +
                        '<span style="font-weight:700;font-size:0.88rem;color:' + cfg.color + ';">' + fmt.format(parseFloat(a.eigenbeitrag)||0) + '</span>' +
                        '<button onclick="openAvModal(' + a.id + ')" style="width:26px;height:26px;border-radius:6px;background:var(--surface-2);border:none;color:var(--text-3);cursor:pointer;"><i class="ri-edit-line"></i></button>' +
                        '<button onclick="deleteAv(' + a.id + ')" style="width:26px;height:26px;border-radius:6px;background:rgba(239,68,68,0.1);border:none;color:#ef4444;cursor:pointer;"><i class="ri-delete-bin-line"></i></button>' +
                    '</div>' +
                '</div>'
            ).join('') +
        '</div>';
    }).join('');
}

function updateAvHinweis() {
    const typ = document.getElementById('avTyp')?.value || 'riester';
    const cfg = AV_CFG[typ] || AV_CFG.riester;
    const el = document.getElementById('avHinweis');
    if (el) el.innerHTML = '<i class="' + cfg.icon + '" style="color:' + cfg.color + ';margin-right:6px;"></i>' + cfg.hinweis;
    const agGroup = document.getElementById('avAgBeitragGroup');
    const zulageGroup = document.getElementById('avZulageGroup');
    if (agGroup) agGroup.style.display = typ === 'bav' ? '' : 'none';
    if (zulageGroup) zulageGroup.style.display = typ === 'riester' ? '' : 'none';
}

function openAvModal(id) {
    const existing = id ? alleAltersvorsorge.find(a => a.id == id) : null;
    document.getElementById('avId').value          = existing?.id || '';
    document.getElementById('avTyp').value         = existing?.typ || 'riester';
    document.getElementById('avBezeichnung').value = existing?.bezeichnung || '';
    document.getElementById('avJahr').value        = existing?.steuerjahr || aktuellesJahr;
    document.getElementById('avEigenbeitrag').value = existing?.eigenbeitrag || '';
    document.getElementById('avAgBeitrag').value   = existing?.ag_beitrag || '';
    document.getElementById('avZulage').value      = existing?.zulage || '';
    document.getElementById('avModalTitle').innerHTML =
        '<i class="ri-shield-user-line"></i> ' + (existing ? 'Vertrag bearbeiten' : 'Altersvorsorge-Vertrag hinzufügen');
    updateAvHinweis();
    document.getElementById('avModal').classList.add('active');
    document.getElementById('avBezeichnung').focus();
}

function closeAvModal(e) {
    if (e && e.target !== document.getElementById('avModal')) return;
    document.getElementById('avModal').classList.remove('active');
}

async function saveAv() {
    const bezeichnung = document.getElementById('avBezeichnung').value.trim();
    if (!bezeichnung) { alert('Bitte Bezeichnung eingeben.'); return; }
    const btn = document.getElementById('avSaveBtn');
    btn.disabled = true;
    const id = document.getElementById('avId').value;
    const payload = {
        typ:         document.getElementById('avTyp').value,
        bezeichnung,
        steuerjahr:  parseInt(document.getElementById('avJahr').value),
        eigenbeitrag: parseFloat(document.getElementById('avEigenbeitrag').value) || 0,
        ag_beitrag:   parseFloat(document.getElementById('avAgBeitrag').value) || 0,
        zulage:       parseFloat(document.getElementById('avZulage').value) || 0,
    };
    try {
        const url    = id ? '/users/steuer/altersvorsorge/' + id : '/users/steuer/altersvorsorge/add';
        const method = id ? 'PUT' : 'POST';
        const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        if (!r.ok) throw new Error();
        closeAvModal();
        await ladeAltersvorsorge();
    } catch { alert('Fehler beim Speichern.'); }
    finally { btn.disabled = false; }
}

function deleteAv(id) {
    const a = alleAltersvorsorge.find(a => a.id == id);
    if (!a) return;
    alleAltersvorsorge = alleAltersvorsorge.filter(a => a.id != id);
    renderAltersvorsorge();
    let timer = setTimeout(async () => {
        try { await fetch('/users/steuer/altersvorsorge/' + id, { method: 'DELETE' }); }
        catch { alleAltersvorsorge.push(a); renderAltersvorsorge(); }
    }, 5000);
    showUndoToast('„' + a.bezeichnung + '" gelöscht', () => {
        clearTimeout(timer);
        alleAltersvorsorge.push(a);
        renderAltersvorsorge();
    });
}

// ══════════════════════════════════════════════════════════════
//  7. SONDERAUSGABEN
// ══════════════════════════════════════════════════════════════
const SONDER_KAT = {
    kirchensteuer: { label: 'Kirchensteuer',              icon: 'ri-building-line',        bg: 'rgba(245,158,11,0.12)',  color: '#f59e0b',  hinweis: 'Bereits gezahlte Kirchensteuer ist selbst als Sonderausgabe absetzbar.' },
    spenden:       { label: 'Spenden',                    icon: 'ri-heart-line',           bg: 'rgba(239,68,68,0.12)',   color: '#ef4444',  hinweis: 'Bis 300 € reicht Kontoauszug. Darüber: Zuwendungsbestätigung. Max. 20% des Einkommens.' },
    schulgeld:     { label: 'Schulgeld / Kinderbetreuung', icon: 'ri-graduation-cap-line',  bg: 'rgba(34,197,94,0.12)',   color: '#22c55e', hinweis: '2/3 der Kosten bis max. 4.000 € pro Kind absetzbar (Kinder unter 14).' },
    ausbildung:    { label: 'Berufsausbildungskosten',    icon: 'ri-book-open-line',       bg: 'rgba(99,88,230,0.12)',   color: 'var(--accent)', hinweis: 'Kosten für Erstausbildung / Studium bis 6.000 € als Sonderausgabe (nicht als Werbungskosten).' },
    unterhalt:     { label: 'Unterhaltszahlungen',        icon: 'ri-parent-line',          bg: 'rgba(59,130,246,0.12)',  color: '#3b82f6',  hinweis: 'Unterhaltszahlungen an Ex-Partner bis 13.805 € als Sonderausgabe mit Zustimmung des Empfängers (Anlage U).' },
    sonstiges:     { label: 'Sonstiges',                  icon: 'ri-more-line',            bg: 'rgba(107,114,128,0.12)', color: '#9ca3af', hinweis: '' },
};

async function ladeSonderausgaben() {
    try {
        const res = await fetch('/users/steuer/sonderausgaben');
        alleSonderausgaben = res.ok ? await res.json() : [];
    } catch { alleSonderausgaben = []; }
    renderSonder();
}

function filterSonder(kat, btn) {
    aktiveSonderKat = kat;
    document.querySelectorAll('#sonderKatTabs .steuer-kat-tab').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    renderSonder();
}

function renderSonder() {
    const root = document.getElementById('sonderRoot');
    if (!root) return;
    let filtered = alleSonderausgaben.filter(s => parseInt(s.steuerjahr) === aktuellesJahr);
    const gesamtJahr = filtered.reduce((s, a) => s + (parseFloat(a.betrag)||0), 0);

    const badge = document.getElementById('sonderSumBadge');
    if (badge) {
        badge.innerHTML = '<div style="background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.2);border-radius:var(--radius-md);padding:8px 16px;font-size:0.83rem;">' +
            '<span style="font-weight:700;color:#ef4444;">' + fmt.format(gesamtJahr) + '</span> Sonderausgaben ' + aktuellesJahr +
        '</div>';
    }

    if (aktiveSonderKat !== 'alle') filtered = filtered.filter(s => s.kategorie === aktiveSonderKat);

    if (filtered.length === 0) {
        root.innerHTML = '<div class="card" style="text-align:center;padding:40px;color:var(--text-3);">' +
            '<i class="ri-heart-line" style="font-size:2rem;display:block;margin-bottom:10px;opacity:0.3;"></i>' +
            'Keine Sonderausgaben für ' + aktuellesJahr + (aktiveSonderKat !== 'alle' ? ' in dieser Kategorie' : '') + ' erfasst.' +
        '</div>';
        return;
    }

    const gruppen = {};
    filtered.forEach(s => { const k = s.kategorie || 'sonstiges'; if (!gruppen[k]) gruppen[k] = []; gruppen[k].push(s); });

    root.innerHTML = Object.entries(gruppen).map(([kat, items]) => {
        const cfg   = SONDER_KAT[kat] || SONDER_KAT.sonstiges;
        const summe = items.reduce((s, a) => s + (parseFloat(a.betrag)||0), 0);
        return '<div class="card" style="padding:20px;margin-bottom:14px;">' +
            '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">' +
                '<div style="display:flex;align-items:center;gap:10px;">' +
                    '<div style="width:36px;height:36px;border-radius:10px;background:' + cfg.bg + ';color:' + cfg.color + ';display:flex;align-items:center;justify-content:center;">' +
                        '<i class="' + cfg.icon + '"></i>' +
                    '</div>' +
                    '<div>' +
                        '<div style="font-weight:700;font-size:0.9rem;">' + cfg.label + '</div>' +
                        (cfg.hinweis ? '<div style="font-size:0.72rem;color:var(--text-3);max-width:400px;">' + cfg.hinweis + '</div>' : '') +
                    '</div>' +
                '</div>' +
                '<div style="font-weight:800;font-size:1.1rem;color:' + cfg.color + ';">' + fmt.format(summe) + '</div>' +
            '</div>' +
            '<div>' +
                items.map(s =>
                    '<div class="wbk-item">' +
                        '<div style="flex:1;min-width:0;">' +
                            '<div style="font-weight:600;font-size:0.85rem;">' + esc(s.bezeichnung) + '</div>' +
                            '<div style="font-size:0.74rem;color:var(--text-3);margin-top:2px;">' +
                                (s.notiz ? esc(s.notiz) : '&nbsp;') +
                            '</div>' +
                        '</div>' +
                        '<div style="display:flex;align-items:center;gap:8px;">' +
                            '<span style="font-weight:700;font-size:0.88rem;color:' + cfg.color + ';">' + fmt.format(parseFloat(s.betrag)||0) + '</span>' +
                            '<button onclick="openSonderModal(' + s.id + ')" style="width:26px;height:26px;border-radius:6px;background:var(--surface-2);border:none;color:var(--text-3);cursor:pointer;"><i class="ri-edit-line"></i></button>' +
                            '<button onclick="deleteSonder(' + s.id + ')" style="width:26px;height:26px;border-radius:6px;background:rgba(239,68,68,0.1);border:none;color:#ef4444;cursor:pointer;"><i class="ri-delete-bin-line"></i></button>' +
                        '</div>' +
                    '</div>'
                ).join('') +
            '</div>' +
        '</div>';
    }).join('');
}

function openSonderModal(id) {
    const existing = id ? alleSonderausgaben.find(s => s.id == id) : null;
    document.getElementById('sonderId').value         = existing?.id || '';
    document.getElementById('sonderKat').value        = existing?.kategorie || 'kirchensteuer';
    document.getElementById('sonderBezeichnung').value = existing?.bezeichnung || '';
    document.getElementById('sonderBetrag').value     = existing?.betrag || '';
    document.getElementById('sonderJahr').value       = existing?.steuerjahr || aktuellesJahr;
    document.getElementById('sonderNotiz').value      = existing?.notiz || '';
    document.getElementById('sonderModalTitle').innerHTML =
        '<i class="ri-heart-line"></i> ' + (existing ? 'Posten bearbeiten' : 'Sonderausgaben-Posten hinzufügen');
    document.getElementById('sonderModal').classList.add('active');
    document.getElementById('sonderBezeichnung').focus();
}

function closeSonderModal(e) {
    if (e && e.target !== document.getElementById('sonderModal')) return;
    document.getElementById('sonderModal').classList.remove('active');
}

async function saveSonder() {
    const bezeichnung = document.getElementById('sonderBezeichnung').value.trim();
    if (!bezeichnung) { alert('Bitte Bezeichnung eingeben.'); return; }
    const btn = document.getElementById('sonderSaveBtn');
    btn.disabled = true;
    const id = document.getElementById('sonderId').value;
    const payload = {
        kategorie:   document.getElementById('sonderKat').value,
        bezeichnung,
        betrag:      parseFloat(document.getElementById('sonderBetrag').value) || 0,
        steuerjahr:  parseInt(document.getElementById('sonderJahr').value),
        notiz:       document.getElementById('sonderNotiz').value.trim(),
    };
    try {
        const url    = id ? '/users/steuer/sonderausgaben/' + id : '/users/steuer/sonderausgaben/add';
        const method = id ? 'PUT' : 'POST';
        const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        if (!r.ok) throw new Error();
        closeSonderModal();
        await ladeSonderausgaben();
    } catch { alert('Fehler beim Speichern.'); }
    finally { btn.disabled = false; }
}

function deleteSonder(id) {
    const s = alleSonderausgaben.find(s => s.id == id);
    if (!s) return;
    alleSonderausgaben = alleSonderausgaben.filter(s => s.id != id);
    renderSonder();
    let timer = setTimeout(async () => {
        try { await fetch('/users/steuer/sonderausgaben/' + id, { method: 'DELETE' }); }
        catch { alleSonderausgaben.push(s); renderSonder(); }
    }, 5000);
    showUndoToast('„' + s.bezeichnung + '" gelöscht', () => {
        clearTimeout(timer);
        alleSonderausgaben.push(s);
        renderSonder();
    });
}

// ══════════════════════════════════════════════════════════════
//  8. STEUER-DOKUMENTE
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