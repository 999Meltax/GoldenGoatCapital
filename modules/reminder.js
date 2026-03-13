// ─────────────────────────────────────────────────────────────
//  reminder.js  –  Golden Goat Capital  –  E-Mail-Scheduler
//
//  Einbinden in app.js / server.js:
//    import './modules/reminder.js';
//
//  Läuft täglich um 08:00 Uhr und prüft:
//    1. Offene Rechnungen mit Fälligkeitsdatum (14d / 7d / 1d vorher)
//    2. Budgetwarnungen (≥ 80 % verbraucht im lfd. Monat)
//    3. Sparziele (monatlich am 1. des Monats)
// ─────────────────────────────────────────────────────────────

import Database       from './database.js';
import { sendMail, greetingHtml, ctaButtonHtml, dividerHtml,
         itemCardHtml, sectionTitleHtml, progressHtml, statRowHtml } from './mailer.js';

const fmt = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });

// ── Hilfsfunktionen ───────────────────────────────────────────

function daysBetween(dateStr) {
    const today = new Date(); today.setHours(0,0,0,0);
    const target = new Date(dateStr); target.setHours(0,0,0,0);
    return Math.round((target - today) / 86400000);
}

function currentMonth() {
    const now = new Date();
    return now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
}

function todayStr() {
    return new Date().toISOString().substring(0, 10);
}

// ── 1. Rechnungs-Erinnerungen ─────────────────────────────────

async function checkRechnungen(db, userId, email, displayName) {
    const REMIND_DAYS = [14, 7, 3, 1]; // Tage vorher

    let dokumente;
    try {
        const rows = await db._database.query(
            `SELECT * FROM dokumente
             WHERE user_id = ? AND typ = 'rechnungen'
               AND status != 'bezahlt'
               AND faellig_datum IS NOT NULL
               AND faellig_datum >= date('now')
             ORDER BY faellig_datum ASC`,
            { replacements: [userId], type: 'SELECT' }
        );
        dokumente = rows;
    } catch { return; }

    if (!dokumente || dokumente.length === 0) return;

    // Nur Rechnungen, die genau heute an einem der Erinnerungs-Tage fällig sind
    const toRemind = dokumente.filter(d => {
        const days = daysBetween(d.faellig_datum);
        return REMIND_DAYS.includes(days);
    });

    if (toRemind.length === 0) return;

    const itemsHtml = toRemind.map(d => {
        const days  = daysBetween(d.faellig_datum);
        const datum = new Date(d.faellig_datum).toLocaleDateString('de-DE');
        let badgeText, badgeClass;
        if (days <= 1)  { badgeText = 'Morgen fällig!';    badgeClass = 'badge-red'; }
        else if (days <= 3) { badgeText = 'In ' + days + ' Tagen'; badgeClass = 'badge-red'; }
        else if (days <= 7) { badgeText = 'In ' + days + ' Tagen'; badgeClass = 'badge-amber'; }
        else                { badgeText = 'In ' + days + ' Tagen'; badgeClass = 'badge-blue'; }

        return itemCardHtml({
            name: d.name,
            sub:  (d.aussteller ? d.aussteller + ' · ' : '') + 'Fällig: ' + datum,
            badgeText, badgeClass,
            amountText: d.betrag ? fmt.format(d.betrag) : null,
            amountClass: 'amount-red'
        });
    }).join('');

    const urgentCount = toRemind.filter(d => daysBetween(d.faellig_datum) <= 3).length;
    const subject = urgentCount > 0
        ? `⚠️ ${urgentCount} Rechnung${urgentCount > 1 ? 'en' : ''} bald fällig – Golden Goat Capital`
        : `📋 Rechnungserinnerung – ${toRemind.length} offene Rechnung${toRemind.length > 1 ? 'en' : ''}`;

    const bodyHtml =
        greetingHtml(displayName) +
        `<p>Du hast <strong>${toRemind.length} offene Rechnung${toRemind.length > 1 ? 'en' : ''}</strong>, die demnächst fällig ${toRemind.length > 1 ? 'sind' : 'ist'}. Damit du nichts verpasst, hier ein kurzer Überblick:</p>` +
        sectionTitleHtml('Fällige Rechnungen') +
        itemsHtml +
        dividerHtml() +
        `<p style="font-size:13px;color:#64748b;">Du kannst Rechnungen direkt in der App als bezahlt markieren.</p>` +
        ctaButtonHtml('Rechnungen ansehen →', '/users/dokumente');

    await sendMail({
        to: email, subject,
        title: 'Rechnungserinnerung',
        preheader: toRemind.length + ' Rechnung(en) werden demnächst fällig.',
        bodyHtml
    });

    console.log('[Reminder] Rechnungs-Mail an', email, '–', toRemind.length, 'Einträge');
}

// ── 2. Budget-Warnungen ───────────────────────────────────────

async function checkBudgets(db, userId, email, displayName) {
    const WARN_THRESHOLD = 0.80; // 80 %

    let budgets, transactions;
    try {
        budgets = await db._database.query(
            'SELECT * FROM budgets WHERE user_id = ?',
            { replacements: [userId], type: 'SELECT' }
        );
        const monat = currentMonth();
        transactions = await db._database.query(
            `SELECT category, SUM(amount) as total FROM ausgabenDB
             WHERE user_id = ? AND type = 'Ausgaben' AND date LIKE ?
             GROUP BY category`,
            { replacements: [userId, monat + '%'], type: 'SELECT' }
        );
    } catch { return; }

    if (!budgets || budgets.length === 0) return;

    const spendMap = {};
    (transactions || []).forEach(t => { spendMap[t.category] = t.total || 0; });

    const warnings = budgets
        .map(b => {
            const spent = spendMap[b.kategorie] || 0;
            const pct   = b.betrag > 0 ? spent / b.betrag : 0;
            return { ...b, spent, pct };
        })
        .filter(b => b.pct >= WARN_THRESHOLD)
        .sort((a, b) => b.pct - a.pct);

    if (warnings.length === 0) return;

    // Nur einmal pro Monat pro Budget senden → über reminder_log prüfen
    const sentToday = [];
    for (const w of warnings) {
        const alreadySent = await wasReminderSentThisMonth(db, userId, 'budget', String(w.id));
        if (!alreadySent) sentToday.push(w);
    }
    if (sentToday.length === 0) return;

    const itemsHtml = sentToday.map(w => {
        const pctDisplay = Math.round(w.pct * 100);
        const isOver     = w.pct >= 1;
        const color      = isOver ? '#ef4444' : w.pct >= 0.95 ? '#f97316' : '#f59e0b';
        return itemCardHtml({
            name: w.kategorie,
            sub: fmt.format(w.spent) + ' von ' + fmt.format(w.betrag) + ' verbraucht',
            badgeText: isOver ? 'Überschritten!' : pctDisplay + ' % verbraucht',
            badgeClass: isOver ? 'badge-red' : 'badge-amber',
        }) + progressHtml(w.pct * 100, color);
    }).join('');

    const overCount = sentToday.filter(w => w.pct >= 1).length;
    const subject   = overCount > 0
        ? `🚨 ${overCount} Budget${overCount > 1 ? 's' : ''} überschritten – Golden Goat Capital`
        : `⚠️ Budgetwarnung – ${sentToday.length} Kategorie${sentToday.length > 1 ? 'n' : ''} fast aufgebraucht`;

    const monatLabel = new Date(currentMonth() + '-01').toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });

    const bodyHtml =
        greetingHtml(displayName) +
        `<p>Im <strong>${monatLabel}</strong> hast du in ${sentToday.length === 1 ? 'einer Kategorie' : sentToday.length + ' Kategorien'} dein Budget fast oder vollständig aufgebraucht:</p>` +
        sectionTitleHtml('Budget-Übersicht') +
        itemsHtml +
        dividerHtml() +
        `<p style="font-size:13px;color:#64748b;">Budgets kannst du jederzeit in der App anpassen.</p>` +
        ctaButtonHtml('Budget & Sparziele öffnen →', '/users/budget');

    await sendMail({
        to: email, subject,
        title: 'Budgetwarnung ' + monatLabel,
        preheader: sentToday.length + ' Budget(s) haben 80 % oder mehr erreicht.',
        bodyHtml
    });

    // Log speichern
    for (const w of sentToday) {
        await markReminderSent(db, userId, 'budget', String(w.id));
    }

    console.log('[Reminder] Budget-Mail an', email, '–', sentToday.length, 'Warnungen');
}

// ── 3. Sparziel-Erinnerungen (monatlich am 1.) ────────────────

async function checkSparziele(db, userId, email, displayName) {
    const today = new Date();
    if (today.getDate() !== 1) return; // Nur am 1. des Monats

    let sparziele;
    try {
        sparziele = await db.getSparziele(userId);
    } catch { return; }

    if (!sparziele || sparziele.length === 0) return;

    // Nur unvollendete Ziele
    const active = sparziele.filter(s => s.gespart < s.zielbetrag);
    if (active.length === 0) return;

    const monatLabel = today.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });

    const itemsHtml = active.map(s => {
        const pct      = s.zielbetrag > 0 ? s.gespart / s.zielbetrag : 0;
        const missing  = s.zielbetrag - s.gespart;
        const subParts = ['Gespart: ' + fmt.format(s.gespart) + ' / ' + fmt.format(s.zielbetrag)];
        if (s.datum) {
            const days = daysBetween(s.datum);
            if (days > 0) subParts.push('Noch ' + days + ' Tage bis zum Zieldatum');
            else if (days === 0) subParts.push('Zieldatum: heute!');
            else subParts.push('Zieldatum überschritten');
        }
        return itemCardHtml({
            name: s.name,
            sub:  subParts.join(' · '),
            badgeText: Math.round(pct * 100) + ' % erreicht',
            badgeClass: pct >= 0.9 ? 'badge-green' : pct >= 0.5 ? 'badge-blue' : 'badge-amber',
            amountText: 'Noch ' + fmt.format(missing),
            amountClass: 'amount-blue'
        }) + progressHtml(pct * 100, s.farbe || '#6358e6');
    }).join('');

    const totalMissing = active.reduce((s, z) => s + Math.max(0, z.zielbetrag - z.gespart), 0);

    const bodyHtml =
        greetingHtml(displayName) +
        `<p>Neuer Monat, neues Momentum! 🚀 Hier ist dein monatlicher Überblick über deine <strong>${active.length} aktive${active.length > 1 ? 'n' : ''} Spar${active.length > 1 ? 'ziele' : 'ziel'}</strong>:</p>` +
        statRowHtml([
            { val: active.length,        lbl: 'Aktive Ziele',  color: '#818cf8' },
            { val: fmt.format(totalMissing), lbl: 'Noch zu sparen', color: '#f59e0b' },
        ]) +
        sectionTitleHtml('Deine Sparziele – ' + monatLabel) +
        itemsHtml +
        dividerHtml() +
        `<p style="font-size:13px;color:#64748b;">Regelmäßig kleine Beträge einzahlen macht den Unterschied. Du schaffst das!</p>` +
        ctaButtonHtml('Sparziele verwalten →', '/users/budget');

    await sendMail({
        to: email,
        subject: `🎯 Deine Sparziele im ${monatLabel} – Golden Goat Capital`,
        title: 'Monatliche Sparziel-Übersicht',
        preheader: active.length + ' aktive Sparziel(e) warten auf dich.',
        bodyHtml
    });

    console.log('[Reminder] Sparziel-Mail an', email);
}

// ── Reminder-Log (verhindert Doppel-Versand) ─────────────────

async function wasReminderSentThisMonth(db, userId, type, refId) {
    try {
        const monat = currentMonth();
        const rows = await db._database.query(
            `SELECT id FROM reminder_log
             WHERE user_id=? AND type=? AND ref_id=? AND monat=?`,
            { replacements: [userId, type, refId, monat], type: 'SELECT' }
        );
        return rows.length > 0;
    } catch { return false; }
}

async function markReminderSent(db, userId, type, refId) {
    try {
        const monat = currentMonth();
        await db._database.query(
            `INSERT OR IGNORE INTO reminder_log (user_id, type, ref_id, monat, sent_at)
             VALUES (?, ?, ?, ?, datetime('now'))`,
            { replacements: [userId, type, refId, monat] }
        );
    } catch (e) { console.warn('[Reminder] Log-Fehler:', e.message); }
}

// ── Alle Nutzer prüfen ────────────────────────────────────────

async function runAllReminders() {
    console.log('[Reminder] Start –', new Date().toLocaleString('de-DE'));
    try {
        const db = await Database.getInstance();

        // reminder_log-Tabelle sicherstellen
        await db._database.query(`
            CREATE TABLE IF NOT EXISTS reminder_log (
                id       INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id  INTEGER NOT NULL,
                type     TEXT NOT NULL,
                ref_id   TEXT NOT NULL,
                monat    TEXT NOT NULL,
                sent_at  TEXT DEFAULT (datetime('now')),
                UNIQUE(user_id, type, ref_id, monat)
            )
        `);

        // Alle Nutzer mit aktivierten E-Mail-Benachrichtigungen
        const users = await db._database.query(
            `SELECT u.id, u.Benutzername AS email,
                    COALESCE(p.display_name, '') AS display_name,
                    s.notifications_email,
                    s.reminder_rechnungen,
                    s.reminder_budget,
                    s.reminder_sparziele
             FROM users u
             LEFT JOIN user_settings s ON s.user_id = u.id
             LEFT JOIN user_profiles p ON p.user_id = u.id
             WHERE s.notifications_email = 1`,
            { type: 'SELECT' }
        );

        for (const user of (users || [])) {
            const { id: userId, email, display_name } = user;

            // Rechnungen
            if (user.reminder_rechnungen !== 0) { // Standard: aktiv
                await checkRechnungen(db, userId, email, display_name).catch(e =>
                    console.error('[Reminder] Rechnungen Fehler für', email, e.message)
                );
            }

            // Budgets
            if (user.reminder_budget !== 0) {
                await checkBudgets(db, userId, email, display_name).catch(e =>
                    console.error('[Reminder] Budget Fehler für', email, e.message)
                );
            }

            // Sparziele
            if (user.reminder_sparziele !== 0) {
                await checkSparziele(db, userId, email, display_name).catch(e =>
                    console.error('[Reminder] Sparziele Fehler für', email, e.message)
                );
            }
        }

        console.log('[Reminder] Fertig – ', (users || []).length, 'Nutzer geprüft');
    } catch (err) {
        console.error('[Reminder] Kritischer Fehler:', err);
    }
}

// ── Scheduler: täglich um 08:00 Uhr ──────────────────────────

function scheduleDaily(hour = 8, minute = 0) {
    function msUntilNext() {
        const now  = new Date();
        const next = new Date();
        next.setHours(hour, minute, 0, 0);
        if (next <= now) next.setDate(next.getDate() + 1);
        return next - now;
    }

    function tick() {
        runAllReminders();
        setTimeout(tick, 24 * 60 * 60 * 1000); // nächster Tag
    }

    setTimeout(tick, msUntilNext());
    console.log('[Reminder] Scheduler gestartet – nächster Lauf um', hour + ':' + String(minute).padStart(2,'0'), 'Uhr');
}

scheduleDaily(8, 0);

// Manueller Aufruf per Route (nur in dev): GET /users/reminders/run
export { runAllReminders };