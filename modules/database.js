import { Sequelize } from 'sequelize';
import bcrypt from 'bcryptjs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import Profil from './profil.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default class Database {
    constructor(database) {
        if (typeof database === 'undefined') {
            throw new Error('Cannot be called directly');
        }
        this._database = database;
    }

    static async _init() {
        const database = new Sequelize({
            dialect: 'sqlite',
            storage: path.join(__dirname, '..', 'db', 'webengDB.db')
        });

        try {
            await database.authenticate();
            await database.query('PRAGMA foreign_keys = ON;');
            console.log('Connection has been established successfully.');

            await database.query(`
                CREATE TABLE IF NOT EXISTS finanzen_investments (
                    user_id INTEGER,
                    monat TEXT,
                    portfoliowert REAL DEFAULT 0,
                    cash_ruecklagen REAL DEFAULT 3000,
                    PRIMARY KEY (user_id, monat)
                )
            `);

            await database.query(`
                CREATE TABLE IF NOT EXISTS accounts (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL,
                    name TEXT NOT NULL,
                    type TEXT NOT NULL,
                    balance REAL DEFAULT 0,
                    color TEXT DEFAULT '#6358e6',
                    icon TEXT DEFAULT 'ri-bank-line'
                )
            `);

            // Profil-Erweiterungen für die users-Tabelle
            await database.query(`
                CREATE TABLE IF NOT EXISTS user_profiles (
                    user_id INTEGER PRIMARY KEY,
                    display_name TEXT DEFAULT '',
                    avatar_url TEXT DEFAULT '',
                    tarif TEXT DEFAULT 'basis'
                )
            `);

            // Einstellungen-Tabelle
            await database.query(`
                CREATE TABLE IF NOT EXISTS user_settings (
                    user_id INTEGER PRIMARY KEY,
                    language TEXT DEFAULT 'de',
                    theme TEXT DEFAULT 'dark',
                    currency TEXT DEFAULT 'EUR',
                    date_format TEXT DEFAULT 'DD.MM.YYYY',
                    notifications_email INTEGER DEFAULT 0,
                    notifications_browser INTEGER DEFAULT 0,
                    two_factor INTEGER DEFAULT 0
                )
            `);

            await database.query(`
                CREATE TABLE IF NOT EXISTS analysen (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL,
                    title TEXT NOT NULL,
                    short_desc TEXT DEFAULT '',
                    long_desc TEXT DEFAULT '',
                    image TEXT DEFAULT ''
                )
            `);

            // ── Dokumentenportal ──────────────────────────────────────
            await database.query(`
                CREATE TABLE IF NOT EXISTS dokumente (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL,
                    typ TEXT NOT NULL DEFAULT 'sonstiges',
                    name TEXT NOT NULL,
                    datum TEXT,
                    jahr INTEGER,
                    notiz TEXT DEFAULT '',
                    file_data TEXT DEFAULT '',
                    file_ext TEXT DEFAULT '',
                    file_mime TEXT DEFAULT '',
                    betrag REAL,
                    faellig_datum TEXT,
                    aussteller TEXT DEFAULT '',
                    status TEXT DEFAULT 'offen',
                    kategorie TEXT DEFAULT '',
                    brutto REAL,
                    netto REAL,
                    arbeitgeber TEXT DEFAULT '',
                    monat TEXT DEFAULT '',
                    steuer_art TEXT DEFAULT '',
                    steuerjahr INTEGER,
                    created_at TEXT DEFAULT (datetime('now'))
                )
            `);

            try { await database.query('ALTER TABLE ausgabenDB ADD COLUMN account_id INTEGER'); } catch(e) {}
            try { await database.query('ALTER TABLE ausgabenDB ADD COLUMN recurring_id INTEGER DEFAULT NULL'); } catch(e) {}

            // ── Wiederkehrende Transaktionen ──────────────────────────
            await database.query(`
                CREATE TABLE IF NOT EXISTS recurring_transactions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL,
                    name TEXT NOT NULL,
                    category TEXT NOT NULL,
                    amount REAL NOT NULL,
                    type TEXT NOT NULL DEFAULT 'Ausgaben',
                    account_id INTEGER DEFAULT NULL,
                    rhythmus TEXT DEFAULT 'monatlich',
                    naechste_faelligkeit TEXT DEFAULT NULL,
                    aktiv INTEGER DEFAULT 1,
                    notiz TEXT DEFAULT '',
                    created_at TEXT DEFAULT (datetime('now'))
                )
            `);
            try { await database.query('ALTER TABLE fixkosten ADD COLUMN account_id INTEGER'); } catch(e) {}
            try { await database.query("ALTER TABLE todos ADD COLUMN priority TEXT DEFAULT 'mittel'"); } catch(e) {}
            try { await database.query('ALTER TABLE todos ADD COLUMN due_date TEXT DEFAULT NULL'); } catch(e) {}
            try { await database.query("ALTER TABLE todos ADD COLUMN label TEXT DEFAULT ''"); } catch(e) {}
            try { await database.query("ALTER TABLE todos ADD COLUMN notes TEXT DEFAULT ''"); } catch(e) {}

            // ── Reminder-Einstellungen (Spalten nachrüsten) ───────────────
            try { await database.query("ALTER TABLE user_settings ADD COLUMN reminder_rechnungen INTEGER DEFAULT 1"); } catch(e) {}
            try { await database.query("ALTER TABLE user_settings ADD COLUMN reminder_budget     INTEGER DEFAULT 1"); } catch(e) {}
            try { await database.query("ALTER TABLE user_settings ADD COLUMN reminder_sparziele  INTEGER DEFAULT 1"); } catch(e) {}

            // ── Passwort-Reset-Token ─────────────────────────────────────
            try { await database.query("ALTER TABLE users ADD COLUMN reset_token TEXT DEFAULT NULL"); } catch(e) {}
            try { await database.query("ALTER TABLE users ADD COLUMN reset_token_expires INTEGER DEFAULT NULL"); } catch(e) {}
            try { await database.query("ALTER TABLE users ADD COLUMN email_verified INTEGER DEFAULT 0"); } catch(e) {}
            try { await database.query("ALTER TABLE users ADD COLUMN email_verify_token TEXT DEFAULT NULL"); } catch(e) {}
            try { await database.query("ALTER TABLE users ADD COLUMN is_new_user INTEGER DEFAULT 1"); } catch(e) {}
            // Bestehende User (vor E-Mail-Bestätigung) als bereits verifiziert markieren
            await database.query("UPDATE users SET email_verified=1, is_new_user=0 WHERE email_verify_token IS NULL AND email_verified=0");

            // ── Reminder-Log (verhindert Doppel-Versand) ──────────────────
            await database.query(`
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

            // ── Budget-Tabelle ─────────────────────────────────────────
            await database.query(`
                CREATE TABLE IF NOT EXISTS budgets (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL,
                    kategorie TEXT NOT NULL,
                    betrag REAL DEFAULT 0,
                    UNIQUE(user_id, kategorie)
                )
            `);

            // ── Sparziele-Tabelle ──────────────────────────────────────
            await database.query(`
                CREATE TABLE IF NOT EXISTS sparziele (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL,
                    name TEXT NOT NULL,
                    zielbetrag REAL DEFAULT 0,
                    gespart REAL DEFAULT 0,
                    datum TEXT DEFAULT NULL,
                    farbe TEXT DEFAULT '#6358e6',
                    created_at TEXT DEFAULT (datetime('now'))
                )
            `);

            // ── Abonnements-Tabelle ────────────────────────────────────
            await database.query(`
                CREATE TABLE IF NOT EXISTS abos (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL,
                    name TEXT NOT NULL,
                    kategorie TEXT DEFAULT 'sonstiges',
                    betrag REAL DEFAULT 0,
                    rhythmus TEXT DEFAULT 'monatlich',
                    naechste_abbuchung TEXT DEFAULT NULL,
                    notiz TEXT DEFAULT '',
                    created_at TEXT DEFAULT (datetime('now'))
                )
            `);

            // ── Notizen-Tabelle ────────────────────────────────────────
            await database.query(`
                CREATE TABLE IF NOT EXISTS notizen (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL,
                    titel TEXT DEFAULT 'Neue Notiz',
                    inhalt TEXT DEFAULT '',
                    kategorie TEXT DEFAULT 'allgemein',
                    pinned INTEGER DEFAULT 0,
                    updated_at TEXT DEFAULT (datetime('now')),
                    created_at TEXT DEFAULT (datetime('now'))
                )
            `);

            // ── Gewohnheiten-Tabelle ───────────────────────────────────
            await database.query(`
                CREATE TABLE IF NOT EXISTS gewohnheiten (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL,
                    name TEXT NOT NULL,
                    emoji TEXT DEFAULT '⭐',
                    farbe TEXT DEFAULT '#6358e6',
                    haeufigkeit TEXT DEFAULT 'taeglich',
                    checks TEXT DEFAULT '[]',
                    created_at TEXT DEFAULT (datetime('now'))
                )
            `);

            // ── Ziele-Tabelle ──────────────────────────────────────────
            await database.query(`
                CREATE TABLE IF NOT EXISTS ziele (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL,
                    titel TEXT NOT NULL,
                    kategorie TEXT DEFAULT 'sonstiges',
                    beschreibung TEXT DEFAULT '',
                    datum TEXT DEFAULT NULL,
                    fortschritt INTEGER DEFAULT 0,
                    created_at TEXT DEFAULT (datetime('now'))
                )
            `);

            // ══════════════════════════════════════════════════════════
            // ── HAUSHALT-TABELLEN ──────────────────────────────────────
            // ══════════════════════════════════════════════════════════

            // Haushalt: Verbund zweier User
            await database.query(`
                CREATE TABLE IF NOT EXISTS haushalte (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT DEFAULT 'Unser Haushalt',
                    erstellt_von INTEGER NOT NULL,
                    created_at TEXT DEFAULT (datetime('now'))
                )
            `);

            // Mitglieder eines Haushalts
            await database.query(`
                CREATE TABLE IF NOT EXISTS haushalt_mitglieder (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    haushalt_id INTEGER NOT NULL,
                    user_id INTEGER NOT NULL,
                    anzeigename TEXT DEFAULT '',
                    rolle TEXT DEFAULT 'mitglied',
                    UNIQUE(haushalt_id, user_id)
                )
            `);

            // Einladungen (per E-Mail-Code)
            await database.query(`
                CREATE TABLE IF NOT EXISTS haushalt_einladungen (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    haushalt_id INTEGER NOT NULL,
                    eingeladen_von INTEGER NOT NULL,
                    email TEXT NOT NULL,
                    code TEXT NOT NULL UNIQUE,
                    angenommen INTEGER DEFAULT 0,
                    created_at TEXT DEFAULT (datetime('now'))
                )
            `);

            // Gemeinsame Fixkosten (Miete, Strom, etc.) mit prozentualem Split
            await database.query(`
                CREATE TABLE IF NOT EXISTS haushalt_fixkosten (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    haushalt_id INTEGER NOT NULL,
                    name TEXT NOT NULL,
                    betrag REAL DEFAULT 0,
                    rhythmus TEXT DEFAULT 'monatlich',
                    kategorie TEXT DEFAULT 'wohnen',
                    anteil_user1 REAL DEFAULT 50,
                    anteil_user2 REAL DEFAULT 50,
                    created_at TEXT DEFAULT (datetime('now'))
                )
            `);

            // Monatliche Überschreibungen für Fixkosten (falls ein Monat abweicht)
            await database.query(`
                CREATE TABLE IF NOT EXISTS haushalt_fixkosten_monat (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    haushalt_id INTEGER NOT NULL,
                    fixkosten_id INTEGER NOT NULL,
                    monat TEXT NOT NULL,
                    betrag REAL,
                    anteil_user1 REAL,
                    anteil_user2 REAL,
                    UNIQUE(haushalt_id, fixkosten_id, monat)
                )
            `);

            // Persönliche Fixkosten der einzelnen Mitglieder (nur für sie selbst)
            await database.query(`
                CREATE TABLE IF NOT EXISTS haushalt_persoenliche_fixkosten (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    haushalt_id INTEGER NOT NULL,
                    user_id INTEGER NOT NULL,
                    name TEXT NOT NULL,
                    betrag REAL DEFAULT 0,
                    kategorie TEXT DEFAULT 'sonstiges',
                    created_at TEXT DEFAULT (datetime('now'))
                )
            `);

            // Gehälter der Mitglieder (pro Monat überschreibbar)
            await database.query(`
                CREATE TABLE IF NOT EXISTS haushalt_gehaelter (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    haushalt_id INTEGER NOT NULL,
                    user_id INTEGER NOT NULL,
                    monat TEXT NOT NULL,
                    gehalt REAL DEFAULT 0,
                    sparbetrag REAL DEFAULT 0,
                    UNIQUE(haushalt_id, user_id, monat)
                )
            `);

            // Standard-Gehalt (Basis-Wert, wenn kein Monatsoverride existiert)
            await database.query(`
                CREATE TABLE IF NOT EXISTS haushalt_gehaelter_default (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    haushalt_id INTEGER NOT NULL,
                    user_id INTEGER NOT NULL,
                    gehalt REAL DEFAULT 0,
                    sparbetrag REAL DEFAULT 0,
                    UNIQUE(haushalt_id, user_id)
                )
            `);

            // Gemeinsame Ausgaben (frei eingetragen, nicht Fixkosten)
            await database.query(`
                CREATE TABLE IF NOT EXISTS haushalt_ausgaben (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    haushalt_id INTEGER NOT NULL,
                    eingetragen_von INTEGER NOT NULL,
                    name TEXT NOT NULL,
                    betrag REAL DEFAULT 0,
                    kategorie TEXT DEFAULT 'sonstiges',
                    datum TEXT,
                    anteil_user1 REAL DEFAULT 50,
                    anteil_user2 REAL DEFAULT 50,
                    notiz TEXT DEFAULT '',
                    created_at TEXT DEFAULT (datetime('now'))
                )
            `);

            // Haushalt-Todos
            await database.query(`
                CREATE TABLE IF NOT EXISTS haushalt_todos (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    haushalt_id INTEGER NOT NULL,
                    erstellt_von INTEGER NOT NULL,
                    task TEXT NOT NULL,
                    completed INTEGER DEFAULT 0,
                    priority TEXT DEFAULT 'mittel',
                    due_date TEXT DEFAULT NULL,
                    label TEXT DEFAULT '',
                    notes TEXT DEFAULT '',
                    created_at TEXT DEFAULT (datetime('now'))
                )
            `);

            // Haushalt-Dokumente (komplett getrennt von privaten Dokumenten)
            await database.query(`
                CREATE TABLE IF NOT EXISTS haushalt_dokumente (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    haushalt_id INTEGER NOT NULL,
                    hochgeladen_von INTEGER NOT NULL,
                    typ TEXT NOT NULL DEFAULT 'sonstiges',
                    name TEXT NOT NULL,
                    datum TEXT,
                    jahr INTEGER,
                    notiz TEXT DEFAULT '',
                    file_data TEXT DEFAULT '',
                    file_ext TEXT DEFAULT '',
                    file_mime TEXT DEFAULT '',
                    betrag REAL,
                    faellig_datum TEXT,
                    aussteller TEXT DEFAULT '',
                    status TEXT DEFAULT 'offen',
                    kategorie TEXT DEFAULT '',
                    created_at TEXT DEFAULT (datetime('now'))
                )
            `);

            // Migrations: datum_tag nachrüsten falls noch nicht vorhanden
            try { await database.query('ALTER TABLE haushalt_fixkosten ADD COLUMN datum_tag INTEGER DEFAULT 1'); } catch(e) {}
            try { await database.query('ALTER TABLE haushalt_fixkosten ADD COLUMN erstellt_von INTEGER DEFAULT 0'); } catch(e) {}
            // haushalt_transaktionen: Aufteilung + Migration
            try { await database.query('ALTER TABLE haushalt_transaktionen ADD COLUMN ausgabe_id INTEGER DEFAULT NULL'); } catch(e) {}
            try { await database.query('ALTER TABLE haushalt_ausgaben ADD COLUMN tx_id INTEGER DEFAULT NULL'); } catch(e) {}
            try { await database.query('ALTER TABLE haushalt_transaktionen ADD COLUMN anteil_user1 REAL DEFAULT 50'); } catch(e) {}
            try { await database.query('ALTER TABLE haushalt_transaktionen ADD COLUMN anteil_user2 REAL DEFAULT 50'); } catch(e) {}

            // ── HAUSHALTSKONTO ─────────────────────────────────────────────
            // Gemeinsames Konto des Haushalts (separat von privaten Konten)
            await database.query(`
                CREATE TABLE IF NOT EXISTS haushalt_konten (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    haushalt_id INTEGER NOT NULL UNIQUE,
                    name TEXT NOT NULL DEFAULT 'Gemeinsames Konto',
                    balance REAL DEFAULT 0,
                    color TEXT DEFAULT '#10b981',
                    linked_account_id INTEGER DEFAULT NULL,
                    created_at TEXT DEFAULT (datetime('now'))
                )
            `);

            // Transaktionen für das Haushaltskonto
            await database.query(`
                CREATE TABLE IF NOT EXISTS haushalt_transaktionen (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    haushalt_id INTEGER NOT NULL,
                    eingetragen_von INTEGER NOT NULL,
                    name TEXT NOT NULL,
                    category TEXT DEFAULT 'Sonstiges',
                    amount REAL NOT NULL,
                    type TEXT NOT NULL DEFAULT 'Ausgaben',
                    date TEXT NOT NULL,
                    is_fixkost INTEGER DEFAULT 0,
                    fixkost_id INTEGER DEFAULT NULL,
                    notiz TEXT DEFAULT '',
                    created_at TEXT DEFAULT (datetime('now'))
                )
            `);

            // ── Schulden-Zahlungshistorie ──────────────────────────────
            await database.query(`
                CREATE TABLE IF NOT EXISTS haushalt_tracker_categories (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    haushalt_id INTEGER NOT NULL,
                    name TEXT NOT NULL,
                    UNIQUE(haushalt_id, name)
                )
            `);

            await database.query(`
                CREATE TABLE IF NOT EXISTS schulden_zahlungen (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    schulden_id INTEGER NOT NULL,
                    user_id INTEGER NOT NULL,
                    betrag REAL NOT NULL,
                    datum TEXT NOT NULL,
                    notiz TEXT DEFAULT '',
                    created_at TEXT DEFAULT (datetime('now'))
                )
            `);
            try { await database.query('ALTER TABLE schulden ADD COLUMN gesamt_gezahlt REAL DEFAULT 0'); } catch(e) {}
            try { await database.query('ALTER TABLE schulden_zahlungen ADD COLUMN transaction_id INTEGER DEFAULT NULL'); } catch(e) {}
            try { await database.query('ALTER TABLE schulden_zahlungen ADD COLUMN account_id INTEGER DEFAULT NULL'); } catch(e) {}

            // ── Steuer-Tabellen ──────────────────────────────────
            await database.query(`
                CREATE TABLE IF NOT EXISTS steuer_werbungskosten (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL,
                    kategorie TEXT NOT NULL DEFAULT 'sonstiges',
                    bezeichnung TEXT NOT NULL,
                    betrag REAL NOT NULL DEFAULT 0,
                    datum TEXT,
                    steuerjahr INTEGER NOT NULL,
                    notiz TEXT DEFAULT '',
                    created_at TEXT DEFAULT (datetime('now'))
                )
            `);
            await database.query(`
                CREATE TABLE IF NOT EXISTS steuer_assistent (
                    user_id INTEGER PRIMARY KEY,
                    checks_json TEXT DEFAULT '{}',
                    updated_at TEXT DEFAULT (datetime('now'))
                )
            `);

        } catch (error) {
            console.error('Unable to connect to the database:', error);
        }

        return database;
    }

    static async getInstance() {
        if (!Database.instance) {
            const database = await Database._init();
            Database.instance = new Database(database);
        }
        return Database.instance;
    }

    async getUserByEmail(email) {
        const rows = await this._database.query(
            'SELECT id, Benutzername as email, email_verified, is_new_user FROM users WHERE Benutzername=?',
            { replacements: [email], type: Sequelize.QueryTypes.SELECT }
        );
        return rows[0] || null;
    }

    async validateUser(user, passwd) {
        const userinfos = await this._database.query(
            'SELECT * FROM users WHERE Benutzername = ?',
            { replacements: [user], type: Sequelize.QueryTypes.SELECT }
        );

        if (userinfos.length === 0) {
            return false;
        }

        const userRecord = userinfos[0];
        return await bcrypt.compare(passwd, userRecord.Passwort);
    }

    async getUserIdByName(username) {
        const userinfo = await this._database.query(
            'SELECT id FROM users WHERE Benutzername = ?',
            { replacements: [username], type: Sequelize.QueryTypes.SELECT }
        );

        if (userinfo.length === 0) {
            return -1;
        }

        return userinfo[0].id;
    }

    async userExists(user) {
        const userinfos = await this._database.query(
            'SELECT * FROM users WHERE Benutzername = ?',
            { replacements: [user], type: Sequelize.QueryTypes.SELECT }
        );

        return userinfos.length > 0;
    }

    async registerUser(user, passwd) {
        const hashedPassword = await bcrypt.hash(passwd, 10);
        await this._database.query(
            'INSERT INTO users (Benutzername, Passwort) VALUES (?, ?)',
            { replacements: [user, hashedPassword], type: Sequelize.QueryTypes.INSERT }
        );
    }

    async getProfil(user) {
        const userinfos = await this._database.query(
            'SELECT * FROM users WHERE Benutzername = ?',
            { replacements: [user], type: Sequelize.QueryTypes.SELECT }
        );

        if (userinfos.length === 0) {
            return null;
        }

        const userRecord = userinfos[0];
        return new Profil(userRecord.Benutzername);
    }

    // ── Profil-Methoden ────────────────────────────────────────

    async getUserPlan(userId) {
        const profile = await this.getUserProfile(userId);
        const tarif = profile.tarif || 'basis';
        // 'basis' und 'free' = Free-Tarif, alles andere = Pro
        return (tarif === 'pro') ? 'pro' : 'free';
    }

    async setUserPlan(userId, plan) {
        const tarif = (plan === 'pro') ? 'pro' : 'basis';
        await this._database.query(
            `INSERT INTO user_profiles (user_id, tarif)
             VALUES (?, ?)
             ON CONFLICT(user_id) DO UPDATE SET tarif = excluded.tarif`,
            { replacements: [userId, tarif], type: Sequelize.QueryTypes.INSERT }
        );
    }

    async getUserProfile(userId) {
        const rows = await this._database.query(
            'SELECT * FROM user_profiles WHERE user_id = ?',
            { replacements: [userId], type: Sequelize.QueryTypes.SELECT }
        );
        return rows[0] || { user_id: userId, display_name: '', avatar_url: '', tarif: 'basis' };
    }

    async upsertUserProfile(userId, { display_name, avatar_url, tarif }) {
        await this._database.query(
            `INSERT INTO user_profiles (user_id, display_name, avatar_url, tarif)
             VALUES (?, ?, ?, ?)
             ON CONFLICT(user_id) DO UPDATE SET
               display_name = excluded.display_name,
               avatar_url   = excluded.avatar_url,
               tarif        = excluded.tarif`,
            { replacements: [userId, display_name || '', avatar_url || '', tarif || 'basis'], type: Sequelize.QueryTypes.INSERT }
        );
    }

    async updateUserEmail(userId, newEmail) {
        const existing = await this._database.query(
            'SELECT id FROM users WHERE Benutzername = ? AND id != ?',
            { replacements: [newEmail, userId], type: Sequelize.QueryTypes.SELECT }
        );
        if (existing.length > 0) throw new Error('E-Mail bereits vergeben');
        await this._database.query(
            'UPDATE users SET Benutzername = ? WHERE id = ?',
            { replacements: [newEmail, userId], type: Sequelize.QueryTypes.UPDATE }
        );
    }

    async updateUserPassword(userId, currentPassword, newPassword) {
        const rows = await this._database.query(
            'SELECT Passwort FROM users WHERE id = ?',
            { replacements: [userId], type: Sequelize.QueryTypes.SELECT }
        );
        if (rows.length === 0) throw new Error('Benutzer nicht gefunden');
        const valid = await bcrypt.compare(currentPassword, rows[0].Passwort);
        if (!valid) throw new Error('Aktuelles Passwort ist falsch');
        const hashed = await bcrypt.hash(newPassword, 10);
        await this._database.query(
            'UPDATE users SET Passwort = ? WHERE id = ?',
            { replacements: [hashed, userId], type: Sequelize.QueryTypes.UPDATE }
        );
    }

    async getUserEmail(userId) {
        const rows = await this._database.query(
            'SELECT Benutzername FROM users WHERE id = ?',
            { replacements: [userId], type: Sequelize.QueryTypes.SELECT }
        );
        return rows[0]?.Benutzername || '';
    }

    // ── Einstellungen-Methoden ─────────────────────────────────

    async getUserSettings(userId) {
        const rows = await this._database.query(
            'SELECT * FROM user_settings WHERE user_id = ?',
            { replacements: [userId], type: Sequelize.QueryTypes.SELECT }
        );
        return rows[0] || {
            user_id: userId,
            language: 'de',
            theme: 'dark',
            currency: 'EUR',
            date_format: 'DD.MM.YYYY',
            notifications_email: 0,
            notifications_browser: 0,
            two_factor: 0,
            reminder_rechnungen: 1,
            reminder_budget: 1,
            reminder_sparziele: 1,
        };
    }

    async upsertUserSettings(userId, settings) {
        const {
            language, theme, currency, date_format,
            notifications_email, notifications_browser, two_factor,
            reminder_rechnungen, reminder_budget, reminder_sparziele
        } = settings;
        await this._database.query(
            `INSERT INTO user_settings
                (user_id, language, theme, currency, date_format,
                 notifications_email, notifications_browser, two_factor,
                 reminder_rechnungen, reminder_budget, reminder_sparziele)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(user_id) DO UPDATE SET
               language               = excluded.language,
               theme                  = excluded.theme,
               currency               = excluded.currency,
               date_format            = excluded.date_format,
               notifications_email    = excluded.notifications_email,
               notifications_browser  = excluded.notifications_browser,
               two_factor             = excluded.two_factor,
               reminder_rechnungen    = excluded.reminder_rechnungen,
               reminder_budget        = excluded.reminder_budget,
               reminder_sparziele     = excluded.reminder_sparziele`,
            {
                replacements: [
                    userId,
                    language || 'de',
                    theme || 'dark',
                    currency || 'EUR',
                    date_format || 'DD.MM.YYYY',
                    notifications_email  ? 1 : 0,
                    notifications_browser ? 1 : 0,
                    two_factor           ? 1 : 0,
                    reminder_rechnungen !== false ? 1 : 0,
                    reminder_budget     !== false ? 1 : 0,
                    reminder_sparziele  !== false ? 1 : 0,
                ],
                type: Sequelize.QueryTypes.INSERT
            }
        );
    }

    async saveTransaction(userId, name, category, date, amount, type, accountId = null) {
        console.log(userId, name, category, date, amount, type, accountId);
        const result = await this._database.query(
            'INSERT INTO ausgabenDB (user_id, name, category, date, amount, type, account_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
            { replacements: [userId, name, category, date, amount, type, accountId], type: Sequelize.QueryTypes.INSERT }
        );
        return result[0];
    }

    async deleteTransaction(userId, transactionId) {
        try {
            const existsBefore = await this._database.query(
                'SELECT id FROM ausgabenDB WHERE user_id = ? AND id = ?',
                { replacements: [userId, transactionId], type: Sequelize.QueryTypes.SELECT }
            );

            await this._database.query(
                'DELETE FROM ausgabenDB WHERE user_id = ? AND id = ?',
                { replacements: [userId, transactionId], type: Sequelize.QueryTypes.DELETE }
            );

            const existsAfter = await this._database.query(
                'SELECT id FROM ausgabenDB WHERE user_id = ? AND id = ?',
                { replacements: [userId, transactionId], type: Sequelize.QueryTypes.SELECT }
            );

            const wasDeleted = existsBefore.length > 0 && existsAfter.length === 0;
            return wasDeleted;
        } catch (error) {
            console.error('Fehler beim Löschen der Transaktion:', error);
            throw error;
        }
    }

    async getTransactionsForUser(userId) {
        const transactions = await this._database.query('SELECT * FROM ausgabenDB WHERE user_id = ?', {
            replacements: [userId], type: Sequelize.QueryTypes.SELECT
        });
        return transactions;
    }

    async addTodo(userId, task, quantity = 0, priority = 'mittel', due_date = null, label = '', notes = '') {
        const result = await this._database.query(
            'INSERT INTO todos (user_id, task, quantity, current_count, completed, priority, due_date, label, notes) VALUES (?, ?, ?, 0, 0, ?, ?, ?, ?)',
            { replacements: [userId, task, quantity, priority, due_date, label, notes], type: Sequelize.QueryTypes.INSERT }
        );
        return result[0];
    }

    async incrementTodo(userId, todoId) {
        const todo = await this._database.query(
            'SELECT quantity, current_count FROM todos WHERE id = ? AND user_id = ?',
            { replacements: [todoId, userId], type: Sequelize.QueryTypes.SELECT }
        );
        if (todo.length === 0) return false;
        const { quantity, current_count } = todo[0];
        if (current_count < quantity) {
            await this._database.query(
                'UPDATE todos SET current_count = current_count + 1 WHERE id = ? AND user_id = ?',
                { replacements: [todoId, userId], type: Sequelize.QueryTypes.UPDATE }
            );
            if (current_count + 1 === quantity) {
                await this._database.query(
                    'UPDATE todos SET completed = 1 WHERE id = ? AND user_id = ?',
                    { replacements: [todoId, userId], type: Sequelize.QueryTypes.UPDATE }
                );
            }
            return true;
        }
        return false;
    }

    async completeTodo(userId, todoId) {
        await this._database.query(
            'UPDATE todos SET completed = 1 WHERE id = ? AND user_id = ?',
            { replacements: [todoId, userId], type: Sequelize.QueryTypes.UPDATE }
        );
    }

    async deleteTodo(userId, todoId) {
        await this._database.query(
            'DELETE FROM todos WHERE id = ? AND user_id = ?',
            { replacements: [todoId, userId], type: Sequelize.QueryTypes.DELETE }
        );
    }

    async updateTodo(userId, todoId, { task, priority, due_date, label, notes, quantity }) {
        await this._database.query(
            'UPDATE todos SET task=?, priority=?, due_date=?, label=?, notes=?, quantity=? WHERE id=? AND user_id=?',
            { replacements: [task, priority, due_date || null, label, notes, parseInt(quantity) || 0, todoId, userId], type: Sequelize.QueryTypes.UPDATE }
        );
    }

    async uncompleteTodo(userId, todoId) {
        await this._database.query(
            'UPDATE todos SET completed = 0, current_count = 0 WHERE id = ? AND user_id = ?',
            { replacements: [todoId, userId], type: Sequelize.QueryTypes.UPDATE }
        );
    }

    async getTodosForUser(userId) {
        return await this._database.query(
            'SELECT * FROM todos WHERE user_id = ?',
            { replacements: [userId], type: Sequelize.QueryTypes.SELECT }
        );
    }

    async addCategory(userId, name) {
        await this._database.query(
            'INSERT INTO categories (user_id, name) VALUES (?, ?)',
            { replacements: [userId, name], type: Sequelize.QueryTypes.INSERT }
        );
    }

    async getCategories(userId) {
        return await this._database.query(
            'SELECT * FROM categories WHERE user_id = ? AND is_deleted = 0',
            { replacements: [userId], type: Sequelize.QueryTypes.SELECT }
        );
    }

    async updateCategory(userId, categoryId, newName) {
        try {
            const category = await this._database.query(
                'SELECT name FROM categories WHERE id = ? AND user_id = ?',
                { replacements: [categoryId, userId], type: Sequelize.QueryTypes.SELECT }
            );

            if (category.length === 0) {
                return false;
            }

            await this._database.query(
                'UPDATE categories SET name = ? WHERE id = ? AND user_id = ?',
                { replacements: [newName, categoryId, userId], type: Sequelize.QueryTypes.UPDATE }
            );

            const oldName = category[0].name;
            await this._database.query(
                'UPDATE ausgabenDB SET category = ? WHERE user_id = ? AND category = ?',
                { replacements: [newName, userId, oldName], type: Sequelize.QueryTypes.UPDATE }
            );

            return true;
        } catch (error) {
            console.error('Fehler beim Bearbeiten der Kategorie:', error);
            throw error;
        }
    }

    async deleteCategory(userId, categoryId) {
        try {
            const category = await this._database.query(
                'SELECT name FROM categories WHERE id = ? AND user_id = ?',
                { replacements: [categoryId, userId], type: Sequelize.QueryTypes.SELECT }
            );

            if (category.length === 0) {
                return false;
            }

            const categoryName = category[0].name;
            const transactions = await this._database.query(
                'SELECT id FROM ausgabenDB WHERE user_id = ? AND category = ?',
                { replacements: [userId, categoryName], type: Sequelize.QueryTypes.SELECT }
            );

            if (transactions.length > 0) {
                throw new Error('Kategorie kann nicht gelöscht werden, da sie in Transaktionen verwendet wird.');
            }

            await this._database.query(
                'DELETE FROM categories WHERE id = ? AND user_id = ?',
                { replacements: [categoryId, userId], type: Sequelize.QueryTypes.DELETE }
            );
            return true;
        } catch (error) {
            console.error('Fehler beim Löschen der Kategorie:', error);
            throw error;
        }
    }

    async deleteCategoryByName(userId, categoryName) {
        try {
            await this._database.query(
                'DELETE FROM categories WHERE user_id = ? AND name = ?',
                { replacements: [userId, categoryName], type: Sequelize.QueryTypes.DELETE }
            );
            return true;
        } catch (error) {
            console.error('Fehler beim Löschen der Kategorie nach Name:', error);
            throw error;
        }
    }

    // Kalender-Methoden
    async addEvent(userId, start, end, text, color) {
        try {
            const result = await this._database.query(
                'INSERT INTO calendar_events (user_id, start, end, text, color) VALUES (?, ?, ?, ?, ?)',
                { replacements: [userId, start, end, text, color], type: Sequelize.QueryTypes.INSERT }
            );
            return result[0];
        } catch (error) {
            console.error('Fehler beim Hinzufügen des Events:', error);
            throw error;
        }
    }

    async getEventsForUser(userId) {
        try {
            return await this._database.query(
                'SELECT * FROM calendar_events WHERE user_id = ?',
                { replacements: [userId], type: Sequelize.QueryTypes.SELECT }
            );
        } catch (error) {
            console.error('Fehler beim Abrufen der Events:', error);
            throw error;
        }
    }

    async updateEvent(userId, eventId, start, end, text, color) {
        try {
            await this._database.query(
                'UPDATE calendar_events SET start = ?, end = ?, text = ?, color = ? WHERE id = ? AND user_id = ?',
                { replacements: [start, end, text, color, eventId, userId], type: Sequelize.QueryTypes.UPDATE }
            );
        } catch (error) {
            console.error('Fehler beim Aktualisieren des Events:', error);
            throw error;
        }
    }

    async deleteEvent(userId, eventId) {
        try {
            await this._database.query(
                'DELETE FROM calendar_events WHERE id = ? AND user_id = ?',
                { replacements: [eventId, userId], type: Sequelize.QueryTypes.DELETE }
            );
            return true;
        } catch (error) {
            console.error('Fehler beim Löschen des Events:', error);
            throw error;
        }
    }

    // ==================== FINANZEN-METHODEN ====================

    async getMonatlicheAusgaben(userId) {
        return await this._database.query(
            `SELECT 
                strftime('%Y-%m', date) as monat,
                category as kategorie,
                SUM(amount) as betrag
            FROM ausgabenDB 
            WHERE user_id = ? AND type = 'Ausgaben'
            GROUP BY strftime('%Y-%m', date), category
            ORDER BY monat DESC`,
            { replacements: [userId], type: Sequelize.QueryTypes.SELECT }
        );
    }

    async getFinanzenZusammenfassung(userId) {
        const ausgaben = await this.getMonatlicheAusgaben(userId);
        const investments = await this.getFinanzenInvestments(userId);
        const initial = await this.getInitialwerte(userId);
        const manuelle = await this.getManuelleEintraege(userId);
        const fixkostenSum = await this.getFixkostenSummeProMonat(userId);

        const monate = [...new Set([...ausgaben.map(a => a.monat), ...investments.map(i => i.monat)])].sort();
        const zusammenfassungen = [];

        for (let monat of monate) {
            const monatsAusgaben = ausgaben.filter(a => a.monat === monat);
            const gesamtausgaben = monatsAusgaben.reduce((sum, a) => sum + a.betrag, 0);
            const gehalt = monatsAusgaben.find(a => a.kategorie === 'Gehalt')?.betrag || 0;
            const inv = investments.find(i => i.monat === monat) || { portfoliowert: 0, cash_ruecklagen: initial.bargeld_initial || 3000 };
            const konto = initial.sparkonto_initial + initial.girokonto_initial + gesamtausgaben + gehalt;
            const bargeld = initial.bargeld_initial || 300;
            const fixSum = fixkostenSum.find(f => f.monat === monat)?.summe || 0;
            const gesamtvermoegen = konto + bargeld + inv.portfoliowert + inv.cash_ruecklagen;

            const manuellMonat = manuelle.filter(m => m.monat === monat);
            manuellMonat.forEach(m => {
                if (m.spalte_name === 'Gesamtvermögen') gesamtvermoegen = m.wert;
            });

            zusammenfassungen.push({
                monat,
                gesamtvermoegen,
                geld_gesamt: gesamtvermoegen - inv.portfoliowert - inv.cash_ruecklagen,
                konto,
                bargeld,
                investments: inv.portfoliowert,
                cash_ruecklagen: inv.cash_ruecklagen,
                gehalt,
                gesamtausgaben,
                fixkosten_sum: fixSum
            });
        }

        return zusammenfassungen;
    }

    async getFinanzenInvestments(userId) {
        return await this._database.query(
            `SELECT monat, portfoliowert, cash_ruecklagen 
             FROM finanzen_investments 
             WHERE user_id = ? 
             ORDER BY monat ASC`,
            { replacements: [userId], type: Sequelize.QueryTypes.SELECT }
        );
    }

    async addAutomatischeEintrage(userId) {
        const today = new Date();
        const day   = today.getDate();
        const monat = today.toISOString().slice(0, 7); // YYYY-MM
        const fixkosten = await this.getFixkosten(userId);

        for (const fix of fixkosten) {
            if (fix.haeufigkeit === 'monatlich' && day === fix.datum_tag) {
                // Duplikatschutz: prüfen ob dieser Monat für diese Fixkost schon eingetragen
                const existing = await this._database.query(
                    "SELECT id FROM ausgabenDB WHERE user_id=? AND recurring_id=? AND date LIKE ?",
                    { replacements: [userId, fix.id, monat + '%'], type: Sequelize.QueryTypes.SELECT }
                );
                if (existing.length > 0) continue;

                // Mit recurring_id speichern, damit Fixkosten-Badge angezeigt werden kann
                await this._database.query(
                    'INSERT INTO ausgabenDB (user_id, name, category, date, amount, type, account_id, recurring_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                    {
                        replacements: [userId, fix.name, fix.kategorie, today.toISOString(), fix.betrag, 'Ausgaben', fix.account_id || null, fix.id],
                        type: Sequelize.QueryTypes.INSERT
                    }
                );
            }
        }
    }

    dateToExcelSerial(date = new Date()) {
        const excelStart = new Date(Date.UTC(1899, 11, 30));
        const diff = date - excelStart;
        return Math.floor(diff / (1000 * 60 * 60 * 24));
    }

    async addFixkost(userId, name, betrag, datum_tag, haeufigkeit, kategorie) {
        await this._database.query(
            'INSERT INTO fixkosten (user_id, name, betrag, datum_tag, haeufigkeit, kategorie) VALUES (?, ?, ?, ?, ?, ?)',
            { replacements: [userId, name, betrag, datum_tag, haeufigkeit, kategorie], type: Sequelize.QueryTypes.INSERT }
        );
    }

    async getFixkosten(userId) {
        return await this._database.query(
            'SELECT * FROM fixkosten WHERE user_id = ?',
            { replacements: [userId], type: Sequelize.QueryTypes.SELECT }
        );
    }

    async updateFixkost(userId, id, name, betrag, datum_tag, haeufigkeit, kategorie) {
        await this._database.query(
            'UPDATE fixkosten SET name = ?, betrag = ?, datum_tag = ?, haeufigkeit = ?, kategorie = ? WHERE id = ? AND user_id = ?',
            { replacements: [name, betrag, datum_tag, haeufigkeit, kategorie, id, userId], type: Sequelize.QueryTypes.UPDATE }
        );
    }

    async deleteFixkost(userId, id) {
        await this._database.query(
            'DELETE FROM fixkosten WHERE id = ? AND user_id = ?',
            { replacements: [id, userId], type: Sequelize.QueryTypes.DELETE }
        );
    }

    async getFixkostenSummeProMonat(userId) {
        return await this._database.query(
            `SELECT strftime('%Y-%m', date) as monat, SUM(amount) as summe
             FROM ausgabenDB WHERE user_id = ? AND type = 'Ausgaben' AND category IN (SELECT kategorie FROM fixkosten WHERE user_id = ?)
             GROUP BY monat`,
            { replacements: [userId, userId], type: Sequelize.QueryTypes.SELECT }
        );
    }

    async setInitialwerte(userId, sparkonto_initial, girokonto_initial, bargeld_initial) {
        await this._database.query(
            'INSERT OR REPLACE INTO finanzen_konfig (user_id, sparkonto_initial, girokonto_initial, bargeld_initial) VALUES (?, ?, ?, ?)',
            { replacements: [userId, sparkonto_initial, girokonto_initial, bargeld_initial], type: Sequelize.QueryTypes.INSERT }
        );
    }

    async getInitialwerte(userId) {
        const res = await this._database.query(
            'SELECT * FROM finanzen_konfig WHERE user_id = ?',
            { replacements: [userId], type: Sequelize.QueryTypes.SELECT }
        );
        return res[0] || { sparkonto_initial: 0, girokonto_initial: 0, bargeld_initial: 300 };
    }

    async addManuelleEintrag(userId, monat, spalte_name, wert) {
        await this._database.query(
            'INSERT OR REPLACE INTO finanzen_manuelle_eintraege (user_id, monat, spalte_name, wert) VALUES (?, ?, ?, ?)',
            { replacements: [userId, monat, spalte_name, wert], type: Sequelize.QueryTypes.INSERT }
        );
    }

    async getManuelleEintraege(userId) {
        return await this._database.query(
            'SELECT * FROM finanzen_manuelle_eintraege WHERE user_id = ?',
            { replacements: [userId], type: Sequelize.QueryTypes.SELECT }
        );
    }

    async updateTransaction(userId, transactionId, name, category, amount, date, type, accountId = null) {
        await this._database.query(
            'UPDATE ausgabenDB SET name=?, category=?, amount=?, date=?, type=?, account_id=? WHERE id=? AND user_id=?',
            { replacements: [name, category, amount, date, type, accountId, transactionId, userId], type: Sequelize.QueryTypes.UPDATE }
        );
    }

    // ── Konten ─────────────────────────────────────────────────
    async getAccountsWithBalance(userId) {
        const accounts = await this._database.query(
            'SELECT * FROM accounts WHERE user_id=? ORDER BY id ASC',
            { replacements: [userId], type: Sequelize.QueryTypes.SELECT }
        );
        return await Promise.all(accounts.map(async acc => {
            const rows = await this._database.query(
                `SELECT COALESCE(SUM(CASE WHEN type='Einnahmen' THEN amount ELSE -amount END),0) AS delta
                 FROM ausgabenDB WHERE user_id=? AND account_id=?`,
                { replacements: [userId, acc.id], type: Sequelize.QueryTypes.SELECT }
            );
            return { ...acc, currentBalance: acc.balance + (rows[0]?.delta || 0) };
        }));
    }

    async addAccount(userId, name, type, balance, color, icon) {
        const result = await this._database.query(
            'INSERT INTO accounts (user_id, name, type, balance, color, icon) VALUES (?,?,?,?,?,?)',
            { replacements: [userId, name, type, balance, color, icon], type: Sequelize.QueryTypes.INSERT }
        );
        return result[0];
    }

    async updateAccount(userId, accountId, name, type, balance, color, icon) {
        await this._database.query(
            'UPDATE accounts SET name=?, type=?, balance=?, color=?, icon=? WHERE id=? AND user_id=?',
            { replacements: [name, type, balance, color, icon, accountId, userId], type: Sequelize.QueryTypes.UPDATE }
        );
    }

    async deleteAccount(userId, accountId) {
        await this._database.query(
            'UPDATE ausgabenDB SET account_id=NULL WHERE account_id=? AND user_id=?',
            { replacements: [accountId, userId], type: Sequelize.QueryTypes.UPDATE }
        );
        await this._database.query(
            'DELETE FROM accounts WHERE id=? AND user_id=?',
            { replacements: [accountId, userId], type: Sequelize.QueryTypes.DELETE }
        );
    }

    async getTransactionsForAccount(userId, accountId) {
        return await this._database.query(
            'SELECT * FROM ausgabenDB WHERE user_id=? AND account_id=? ORDER BY date DESC',
            { replacements: [userId, accountId], type: Sequelize.QueryTypes.SELECT }
        );
    }

    // Für Haushalt-Import: Transaktionen des Kontos + ggf. nicht zugewiesene (account_id IS NULL) mitnehmen
    async getTransactionsForImport(userId, accountId) {
        // Wie viele Konten hat der User?
        const accounts = await this._database.query(
            'SELECT id FROM accounts WHERE user_id=?',
            { replacements: [userId], type: Sequelize.QueryTypes.SELECT }
        );
        // Falls User nur ein Konto hat: auch account_id=NULL-Transaktionen (Legacy) mitnehmen
        if (accounts.length <= 1) {
            return await this._database.query(
                'SELECT * FROM ausgabenDB WHERE user_id=? AND (account_id=? OR account_id IS NULL) ORDER BY date DESC',
                { replacements: [userId, accountId], type: Sequelize.QueryTypes.SELECT }
            );
        }
        // Mehrere Konten: nur explizit verknüpfte Transaktionen
        return await this._database.query(
            'SELECT * FROM ausgabenDB WHERE user_id=? AND account_id=? ORDER BY date DESC',
            { replacements: [userId, accountId], type: Sequelize.QueryTypes.SELECT }
        );
    }

    // ── Outlook OAuth Tokens ───────────────────────────────────
    async saveOutlookTokens(userId, accessToken, refreshToken, expiresIn) {
        await this._database.query(`CREATE TABLE IF NOT EXISTS outlook_tokens (user_id INTEGER PRIMARY KEY, access_token TEXT, refresh_token TEXT, expiry INTEGER)`, { type: Sequelize.QueryTypes.RAW });
        await this._database.query(
            'INSERT OR REPLACE INTO outlook_tokens (user_id, access_token, refresh_token, expiry) VALUES (?,?,?,?)',
            { replacements: [userId, accessToken, refreshToken, Date.now() + expiresIn*1000], type: Sequelize.QueryTypes.INSERT }
        );
    }

    async getOutlookTokens(userId) {
        await this._database.query(`CREATE TABLE IF NOT EXISTS outlook_tokens (user_id INTEGER PRIMARY KEY, access_token TEXT, refresh_token TEXT, expiry INTEGER)`, { type: Sequelize.QueryTypes.RAW });
        const rows = await this._database.query(
            'SELECT access_token AS accessToken, refresh_token AS refreshToken, expiry FROM outlook_tokens WHERE user_id=?',
            { replacements: [userId], type: Sequelize.QueryTypes.SELECT }
        );
        return rows[0] || null;
    }

    // ── Analysen ───────────────────────────────────────────────
    async getAnalysen(userId) {
        return await this._database.query(
            'SELECT id, title, short_desc, long_desc, image FROM analysen WHERE user_id = ? ORDER BY id DESC',
            { replacements: [userId], type: Sequelize.QueryTypes.SELECT }
        );
    }

    async addAnalyse(userId, title, shortDesc, longDesc, image) {
        const result = await this._database.query(
            'INSERT INTO analysen (user_id, title, short_desc, long_desc, image) VALUES (?, ?, ?, ?, ?)',
            { replacements: [userId, title, shortDesc, longDesc, image], type: Sequelize.QueryTypes.INSERT }
        );
        return result[0];
    }

    async deleteAnalyse(userId, analyseId) {
        await this._database.query(
            'DELETE FROM analysen WHERE id = ? AND user_id = ?',
            { replacements: [analyseId, userId], type: Sequelize.QueryTypes.DELETE }
        );
    }

    async removeOutlookTokens(userId) {
        await this._database.query('DELETE FROM outlook_tokens WHERE user_id=?', { replacements: [userId], type: Sequelize.QueryTypes.DELETE });
    }

    // ── Dokumente ──────────────────────────────────────────────

    async getDokumente(userId) {
        return await this._database.query(
            `SELECT id, typ, name, datum, jahr, notiz, file_ext, file_mime,
                    betrag, faellig_datum, aussteller, status, kategorie,
                    brutto, netto, arbeitgeber, monat,
                    steuer_art, steuerjahr, created_at
             FROM dokumente
             WHERE user_id = ?
             ORDER BY datum DESC, id DESC`,
            { replacements: [userId], type: Sequelize.QueryTypes.SELECT }
        );
    }

    async getDokumentById(userId, dokumentId) {
        const rows = await this._database.query(
            'SELECT * FROM dokumente WHERE id = ? AND user_id = ?',
            { replacements: [dokumentId, userId], type: Sequelize.QueryTypes.SELECT }
        );
        return rows[0] || null;
    }

    async addDokument(userId, data) {
        const {
            typ, name, datum, jahr, notiz, file_data, file_ext, file_mime,
            betrag, faellig_datum, aussteller, status, kategorie,
            brutto, netto, arbeitgeber, monat,
            steuer_art, steuerjahr
        } = data;

        const result = await this._database.query(
            `INSERT INTO dokumente
             (user_id, typ, name, datum, jahr, notiz, file_data, file_ext, file_mime,
              betrag, faellig_datum, aussteller, status, kategorie,
              brutto, netto, arbeitgeber, monat,
              steuer_art, steuerjahr)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            {
                replacements: [
                    userId, typ || 'sonstiges', name, datum || null, jahr || null,
                    notiz || '', file_data || '', file_ext || '', file_mime || '',
                    betrag || null, faellig_datum || null, aussteller || '', status || 'offen', kategorie || '',
                    brutto || null, netto || null, arbeitgeber || '', monat || '',
                    steuer_art || '', steuerjahr || null
                ],
                type: Sequelize.QueryTypes.INSERT
            }
        );
        return result[0];
    }

    async updateDokumentStatus(userId, dokumentId, status) {
        await this._database.query(
            'UPDATE dokumente SET status = ? WHERE id = ? AND user_id = ?',
            { replacements: [status, dokumentId, userId], type: Sequelize.QueryTypes.UPDATE }
        );
    }

    async deleteDokument(userId, dokumentId) {
        await this._database.query(
            'DELETE FROM dokumente WHERE id = ? AND user_id = ?',
            { replacements: [dokumentId, userId], type: Sequelize.QueryTypes.DELETE }
        );
    }

    // ── Versicherungen ─────────────────────────────────────────
    async getVersicherungen(userId) {
        return await this._database.query(
            `SELECT * FROM versicherungen WHERE user_id = ? ORDER BY status ASC, name ASC`,
            { replacements: [userId], type: Sequelize.QueryTypes.SELECT }
        );
    }

    async addVersicherung(userId, data) {
        const { kategorie, name, anbieter, vertragsnr, status, beitrag, rhythmus,
                beginn, ende, kuendigungsfrist, selbstbeteiligung, versicherungssumme, notiz } = data;
        const result = await this._database.query(
            `INSERT INTO versicherungen
             (user_id, kategorie, name, anbieter, vertragsnr, status, beitrag, rhythmus,
              beginn, ende, kuendigungsfrist, selbstbeteiligung, versicherungssumme, notiz)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            {
                replacements: [
                    userId, kategorie || 'sonstiges', name,
                    anbieter || '', vertragsnr || '', status || 'aktiv',
                    beitrag || null, rhythmus || 'monatlich',
                    beginn || null, ende || null,
                    kuendigungsfrist || '', selbstbeteiligung || null,
                    versicherungssumme || null, notiz || ''
                ],
                type: Sequelize.QueryTypes.INSERT
            }
        );
        return result[0];
    }

    async updateVersicherung(userId, id, data) {
        const { kategorie, name, anbieter, vertragsnr, status, beitrag, rhythmus,
                beginn, ende, kuendigungsfrist, selbstbeteiligung, versicherungssumme, notiz } = data;
        await this._database.query(
            `UPDATE versicherungen SET
             kategorie=?, name=?, anbieter=?, vertragsnr=?, status=?, beitrag=?,
             rhythmus=?, beginn=?, ende=?, kuendigungsfrist=?,
             selbstbeteiligung=?, versicherungssumme=?, notiz=?
             WHERE id=? AND user_id=?`,
            {
                replacements: [
                    kategorie || 'sonstiges', name, anbieter || '', vertragsnr || '',
                    status || 'aktiv', beitrag || null, rhythmus || 'monatlich',
                    beginn || null, ende || null, kuendigungsfrist || '',
                    selbstbeteiligung || null, versicherungssumme || null, notiz || '',
                    id, userId
                ],
                type: Sequelize.QueryTypes.UPDATE
            }
        );
    }

    async deleteVersicherung(userId, id) {
        await this._database.query(
            'DELETE FROM versicherungen WHERE id=? AND user_id=?',
            { replacements: [id, userId], type: Sequelize.QueryTypes.DELETE }
        );
    }

    // ── Steuer-Methoden ────────────────────────────────────────
    async getSteuerWerbungskosten(userId, jahr) {
        const where = jahr ? 'AND steuerjahr=?' : '';
        const replacements = jahr ? [userId, jahr] : [userId];
        return await this._database.query(
            `SELECT * FROM steuer_werbungskosten WHERE user_id=? ${where} ORDER BY datum DESC, id DESC`,
            { replacements, type: Sequelize.QueryTypes.SELECT }
        );
    }

    async addSteuerWerbungskosten(userId, data) {
        const { kategorie, bezeichnung, betrag, datum, steuerjahr, notiz } = data;
        const result = await this._database.query(
            `INSERT INTO steuer_werbungskosten (user_id, kategorie, bezeichnung, betrag, datum, steuerjahr, notiz)
             VALUES (?,?,?,?,?,?,?)`,
            { replacements: [userId, kategorie, bezeichnung, betrag || 0, datum || null, steuerjahr, notiz || ''], type: Sequelize.QueryTypes.INSERT }
        );
        return result[0];
    }

    async updateSteuerWerbungskosten(userId, id, data) {
        const { kategorie, bezeichnung, betrag, datum, steuerjahr, notiz } = data;
        await this._database.query(
            `UPDATE steuer_werbungskosten SET kategorie=?, bezeichnung=?, betrag=?, datum=?, steuerjahr=?, notiz=?
             WHERE id=? AND user_id=?`,
            { replacements: [kategorie, bezeichnung, betrag || 0, datum || null, steuerjahr, notiz || '', id, userId], type: Sequelize.QueryTypes.UPDATE }
        );
    }

    async deleteSteuerWerbungskosten(userId, id) {
        await this._database.query(
            'DELETE FROM steuer_werbungskosten WHERE id=? AND user_id=?',
            { replacements: [id, userId], type: Sequelize.QueryTypes.DELETE }
        );
    }

    async getSteuerAssistentChecks(userId) {
        const rows = await this._database.query(
            'SELECT checks_json FROM steuer_assistent WHERE user_id=?',
            { replacements: [userId], type: Sequelize.QueryTypes.SELECT }
        );
        if (rows.length === 0) return {};
        try { return JSON.parse(rows[0].checks_json || '{}'); } catch { return {}; }
    }

    async saveSteuerAssistentChecks(userId, checksObj) {
        const json = JSON.stringify(checksObj || {});
        await this._database.query(
            `INSERT INTO steuer_assistent (user_id, checks_json) VALUES (?,?)
             ON CONFLICT(user_id) DO UPDATE SET checks_json=excluded.checks_json`,
            { replacements: [userId, json], type: Sequelize.QueryTypes.INSERT }
        );
    }

    // ── Budget-Methoden ────────────────────────────────────────
    async getBudgets(userId) {
        return await this._database.query(
            'SELECT * FROM budgets WHERE user_id=? ORDER BY kategorie ASC',
            { replacements: [userId], type: Sequelize.QueryTypes.SELECT }
        );
    }

    async addBudget(userId, kategorie, betrag) {
        const result = await this._database.query(
            'INSERT OR REPLACE INTO budgets (user_id, kategorie, betrag) VALUES (?,?,?)',
            { replacements: [userId, kategorie, betrag], type: Sequelize.QueryTypes.INSERT }
        );
        return result[0];
    }

    async updateBudget(userId, id, kategorie, betrag) {
        await this._database.query(
            'UPDATE budgets SET kategorie=?, betrag=? WHERE id=? AND user_id=?',
            { replacements: [kategorie, betrag, id, userId], type: Sequelize.QueryTypes.UPDATE }
        );
    }

    async deleteBudget(userId, id) {
        await this._database.query(
            'DELETE FROM budgets WHERE id=? AND user_id=?',
            { replacements: [id, userId], type: Sequelize.QueryTypes.DELETE }
        );
    }

    // ── Sparziele-Methoden ─────────────────────────────────────
    async getSparziele(userId) {
        return await this._database.query(
            'SELECT * FROM sparziele WHERE user_id=? ORDER BY created_at DESC',
            { replacements: [userId], type: Sequelize.QueryTypes.SELECT }
        );
    }

    async addSparziel(userId, name, zielbetrag, gespart, datum, farbe) {
        const result = await this._database.query(
            'INSERT INTO sparziele (user_id, name, zielbetrag, gespart, datum, farbe) VALUES (?,?,?,?,?,?)',
            { replacements: [userId, name, zielbetrag, gespart || 0, datum || null, farbe || '#6358e6'], type: Sequelize.QueryTypes.INSERT }
        );
        return result[0];
    }

    async updateSparziel(userId, id, name, zielbetrag, gespart, datum, farbe) {
        await this._database.query(
            'UPDATE sparziele SET name=?, zielbetrag=?, gespart=?, datum=?, farbe=? WHERE id=? AND user_id=?',
            { replacements: [name, zielbetrag, gespart, datum || null, farbe, id, userId], type: Sequelize.QueryTypes.UPDATE }
        );
    }

    async addToSparziel(userId, id, betrag) {
        await this._database.query(
            'UPDATE sparziele SET gespart = MIN(gespart + ?, zielbetrag) WHERE id=? AND user_id=?',
            { replacements: [betrag, id, userId], type: Sequelize.QueryTypes.UPDATE }
        );
    }

    async deleteSparziel(userId, id) {
        await this._database.query(
            'DELETE FROM sparziele WHERE id=? AND user_id=?',
            { replacements: [id, userId], type: Sequelize.QueryTypes.DELETE }
        );
    }

    // ── Abonnements-Methoden ───────────────────────────────────
    async getAbos(userId) {
        return await this._database.query(
            'SELECT * FROM abos WHERE user_id=? ORDER BY name ASC',
            { replacements: [userId], type: Sequelize.QueryTypes.SELECT }
        );
    }

    async addAbo(userId, name, kategorie, betrag, rhythmus, naechste_abbuchung, notiz) {
        const result = await this._database.query(
            'INSERT INTO abos (user_id, name, kategorie, betrag, rhythmus, naechste_abbuchung, notiz) VALUES (?,?,?,?,?,?,?)',
            { replacements: [userId, name, kategorie, betrag, rhythmus, naechste_abbuchung || null, notiz || ''], type: Sequelize.QueryTypes.INSERT }
        );
        return result[0];
    }

    async updateAbo(userId, id, name, kategorie, betrag, rhythmus, naechste_abbuchung, notiz) {
        await this._database.query(
            'UPDATE abos SET name=?, kategorie=?, betrag=?, rhythmus=?, naechste_abbuchung=?, notiz=? WHERE id=? AND user_id=?',
            { replacements: [name, kategorie, betrag, rhythmus, naechste_abbuchung || null, notiz || '', id, userId], type: Sequelize.QueryTypes.UPDATE }
        );
    }

    async deleteAbo(userId, id) {
        await this._database.query(
            'DELETE FROM abos WHERE id=? AND user_id=?',
            { replacements: [id, userId], type: Sequelize.QueryTypes.DELETE }
        );
    }

    // ── Notizen-Methoden ───────────────────────────────────────
    async getNotizen(userId) {
        return await this._database.query(
            'SELECT * FROM notizen WHERE user_id=? ORDER BY pinned DESC, updated_at DESC',
            { replacements: [userId], type: Sequelize.QueryTypes.SELECT }
        );
    }

    async addNotiz(userId, titel, inhalt, kategorie) {
        const result = await this._database.query(
            'INSERT INTO notizen (user_id, titel, inhalt, kategorie) VALUES (?,?,?,?)',
            { replacements: [userId, titel || 'Neue Notiz', inhalt || '', kategorie || 'allgemein'], type: Sequelize.QueryTypes.INSERT }
        );
        return result[0];
    }

    async updateNotiz(userId, id, titel, inhalt, kategorie) {
        await this._database.query(
            "UPDATE notizen SET titel=?, inhalt=?, kategorie=?, updated_at=datetime('now') WHERE id=? AND user_id=?",
            { replacements: [titel, inhalt, kategorie, id, userId], type: Sequelize.QueryTypes.UPDATE }
        );
    }

    async updateNotizPin(userId, id, pinned) {
        await this._database.query(
            'UPDATE notizen SET pinned=? WHERE id=? AND user_id=?',
            { replacements: [pinned ? 1 : 0, id, userId], type: Sequelize.QueryTypes.UPDATE }
        );
    }

    async deleteNotiz(userId, id) {
        await this._database.query(
            'DELETE FROM notizen WHERE id=? AND user_id=?',
            { replacements: [id, userId], type: Sequelize.QueryTypes.DELETE }
        );
    }

    // ── Gewohnheiten-Methoden ──────────────────────────────────
    async getGewohnheiten(userId) {
        return await this._database.query(
            'SELECT * FROM gewohnheiten WHERE user_id=? ORDER BY created_at ASC',
            { replacements: [userId], type: Sequelize.QueryTypes.SELECT }
        );
    }

    async addGewohnheit(userId, name, emoji, farbe, haeufigkeit) {
        const result = await this._database.query(
            "INSERT INTO gewohnheiten (user_id, name, emoji, farbe, haeufigkeit, checks) VALUES (?,?,?,?,?,'[]')",
            { replacements: [userId, name, emoji || '⭐', farbe || '#6358e6', haeufigkeit || 'taeglich'], type: Sequelize.QueryTypes.INSERT }
        );
        return result[0];
    }

    async updateGewohnheit(userId, id, name, emoji, farbe, haeufigkeit) {
        await this._database.query(
            'UPDATE gewohnheiten SET name=?, emoji=?, farbe=?, haeufigkeit=? WHERE id=? AND user_id=?',
            { replacements: [name, emoji || '⭐', farbe, haeufigkeit, id, userId], type: Sequelize.QueryTypes.UPDATE }
        );
    }

    async updateGewohnheitChecks(userId, id, checks) {
        await this._database.query(
            'UPDATE gewohnheiten SET checks=? WHERE id=? AND user_id=?',
            { replacements: [checks, id, userId], type: Sequelize.QueryTypes.UPDATE }
        );
    }

    async deleteGewohnheit(userId, id) {
        await this._database.query(
            'DELETE FROM gewohnheiten WHERE id=? AND user_id=?',
            { replacements: [id, userId], type: Sequelize.QueryTypes.DELETE }
        );
    }

    // ── Ziele-Methoden ─────────────────────────────────────────
    async getZiele(userId) {
        return await this._database.query(
            'SELECT * FROM ziele WHERE user_id=? ORDER BY kategorie ASC, created_at DESC',
            { replacements: [userId], type: Sequelize.QueryTypes.SELECT }
        );
    }

    async addZiel(userId, titel, kategorie, beschreibung, datum, fortschritt) {
        const result = await this._database.query(
            'INSERT INTO ziele (user_id, titel, kategorie, beschreibung, datum, fortschritt) VALUES (?,?,?,?,?,?)',
            { replacements: [userId, titel, kategorie || 'sonstiges', beschreibung || '', datum || null, fortschritt || 0], type: Sequelize.QueryTypes.INSERT }
        );
        return result[0];
    }

    async updateZiel(userId, id, titel, kategorie, beschreibung, datum, fortschritt) {
        await this._database.query(
            'UPDATE ziele SET titel=?, kategorie=?, beschreibung=?, datum=?, fortschritt=? WHERE id=? AND user_id=?',
            { replacements: [titel, kategorie, beschreibung || '', datum || null, fortschritt || 0, id, userId], type: Sequelize.QueryTypes.UPDATE }
        );
    }

    async deleteZiel(userId, id) {
        await this._database.query(
            'DELETE FROM ziele WHERE id=? AND user_id=?',
            { replacements: [id, userId], type: Sequelize.QueryTypes.DELETE }
        );
    }

    // ── Schulden-Methoden ──────────────────────────────────────
    async getSchulden(userId) {
        return await this._database.query(
            'SELECT * FROM schulden WHERE user_id=? ORDER BY restbetrag DESC',
            { replacements: [userId], type: Sequelize.QueryTypes.SELECT }
        );
    }

    async addSchuld(userId, data) {
        const { name, typ, glaeubiger, faelligkeitstag, gesamtbetrag, restbetrag, zinssatz, monatsrate, notiz } = data;
        const result = await this._database.query(
            'INSERT INTO schulden (user_id, name, typ, glaeubiger, faelligkeitstag, gesamtbetrag, restbetrag, zinssatz, monatsrate, notiz) VALUES (?,?,?,?,?,?,?,?,?,?)',
            { replacements: [userId, name, typ || 'kredit', glaeubiger || '', faelligkeitstag || null, gesamtbetrag || 0, restbetrag || 0, zinssatz || 0, monatsrate || 0, notiz || ''], type: Sequelize.QueryTypes.INSERT }
        );
        return result[0];
    }

    async updateSchuld(userId, id, data) {
        const { name, typ, glaeubiger, faelligkeitstag, gesamtbetrag, restbetrag, zinssatz, monatsrate, notiz } = data;
        await this._database.query(
            'UPDATE schulden SET name=?, typ=?, glaeubiger=?, faelligkeitstag=?, gesamtbetrag=?, restbetrag=?, zinssatz=?, monatsrate=?, notiz=? WHERE id=? AND user_id=?',
            { replacements: [name, typ || 'kredit', glaeubiger || '', faelligkeitstag || null, gesamtbetrag || 0, restbetrag || 0, zinssatz || 0, monatsrate || 0, notiz || '', id, userId], type: Sequelize.QueryTypes.UPDATE }
        );
    }

    async deleteSchuld(userId, id) {
        await this._database.query(
            'DELETE FROM schulden WHERE id=? AND user_id=?',
            { replacements: [id, userId], type: Sequelize.QueryTypes.DELETE }
        );
        // Zugehörige Zahlungen mitlöschen
        await this._database.query(
            'DELETE FROM schulden_zahlungen WHERE schulden_id=? AND user_id=?',
            { replacements: [id, userId], type: Sequelize.QueryTypes.DELETE }
        );
    }

    // ── Schulden-Zahlungshistorie ──────────────────────────────
    async getSchuldenZahlungen(userId, schuldenId) {
        return await this._database.query(
            'SELECT * FROM schulden_zahlungen WHERE schulden_id=? AND user_id=? ORDER BY datum DESC, created_at DESC',
            { replacements: [schuldenId, userId], type: Sequelize.QueryTypes.SELECT }
        );
    }

    async addSchuldenZahlung(userId, schuldenId, betrag, datum, notiz, accountId = null, alsTransaktion = false) {
        // Schuldenbezeichnung fuer Transaktion
        let transactionId = null;
        if (alsTransaktion) {
            const schuld = await this._database.query(
                'SELECT bezeichnung FROM schulden WHERE id=? AND user_id=?',
                { replacements: [schuldenId, userId], type: Sequelize.QueryTypes.SELECT }
            );
            const schuldenName = schuld.length ? `Schuldentilgung: ${schuld[0].bezeichnung}` : 'Schuldentilgung';
            const txResult = await this._database.query(
                'INSERT INTO ausgabenDB (user_id, name, category, date, amount, type, account_id) VALUES (?,?,?,?,?,?,?)',
                { replacements: [userId, schuldenName, 'Schuldentilgung', datum, betrag, 'Ausgaben', accountId || null], type: Sequelize.QueryTypes.INSERT }
            );
            transactionId = txResult[0];
        }
        const result = await this._database.query(
            'INSERT INTO schulden_zahlungen (schulden_id, user_id, betrag, datum, notiz, account_id, transaction_id) VALUES (?,?,?,?,?,?,?)',
            { replacements: [schuldenId, userId, betrag, datum, notiz || '', accountId || null, transactionId], type: Sequelize.QueryTypes.INSERT }
        );
        // Restbetrag der Schuld reduzieren
        await this._database.query(
            'UPDATE schulden SET restbetrag = MAX(0, restbetrag - ?) WHERE id=? AND user_id=?',
            { replacements: [betrag, schuldenId, userId], type: Sequelize.QueryTypes.UPDATE }
        );
        return result[0];
    }

    async deleteSchuldenZahlung(userId, zahlungId) {
        const rows = await this._database.query(
            'SELECT betrag, schulden_id, transaction_id FROM schulden_zahlungen WHERE id=? AND user_id=?',
            { replacements: [zahlungId, userId], type: Sequelize.QueryTypes.SELECT }
        );
        if (!rows.length) return false;
        const { betrag, schulden_id, transaction_id } = rows[0];
        // Restbetrag zurueckbuchen (max. Gesamtbetrag)
        await this._database.query(
            'UPDATE schulden SET restbetrag = MIN(gesamtbetrag, restbetrag + ?) WHERE id=? AND user_id=?',
            { replacements: [betrag, schulden_id, userId], type: Sequelize.QueryTypes.UPDATE }
        );
        // Verknuepfte Transaktion mitloeschen
        if (transaction_id) {
            await this._database.query(
                'DELETE FROM ausgabenDB WHERE id=? AND user_id=?',
                { replacements: [transaction_id, userId], type: Sequelize.QueryTypes.DELETE }
            );
        }
        await this._database.query(
            'DELETE FROM schulden_zahlungen WHERE id=? AND user_id=?',
            { replacements: [zahlungId, userId], type: Sequelize.QueryTypes.DELETE }
        );
        return true;
    }

    // ── Wiederkehrende Transaktionen ──────────────────────────
    async getRecurring(userId) {
        return await this._database.query(
            'SELECT * FROM recurring_transactions WHERE user_id=? ORDER BY naechste_faelligkeit ASC',
            { replacements: [userId], type: Sequelize.QueryTypes.SELECT }
        );
    }

    async addRecurring(userId, data) {
        const { name, category, amount, type, account_id, rhythmus, naechste_faelligkeit, notiz } = data;
        const result = await this._database.query(
            'INSERT INTO recurring_transactions (user_id, name, category, amount, type, account_id, rhythmus, naechste_faelligkeit, notiz) VALUES (?,?,?,?,?,?,?,?,?)',
            { replacements: [userId, name, category, parseFloat(amount), type || 'Ausgaben', account_id || null, rhythmus || 'monatlich', naechste_faelligkeit || null, notiz || ''], type: Sequelize.QueryTypes.INSERT }
        );
        return result[0];
    }

    async updateRecurring(userId, id, data) {
        const { name, category, amount, type, account_id, rhythmus, naechste_faelligkeit, aktiv, notiz } = data;
        await this._database.query(
            'UPDATE recurring_transactions SET name=?, category=?, amount=?, type=?, account_id=?, rhythmus=?, naechste_faelligkeit=?, aktiv=?, notiz=? WHERE id=? AND user_id=?',
            { replacements: [name, category, parseFloat(amount), type || 'Ausgaben', account_id || null, rhythmus || 'monatlich', naechste_faelligkeit || null, aktiv !== false ? 1 : 0, notiz || '', id, userId], type: Sequelize.QueryTypes.UPDATE }
        );
    }

    async deleteRecurring(userId, id) {
        await this._database.query(
            'DELETE FROM recurring_transactions WHERE id=? AND user_id=?',
            { replacements: [id, userId], type: Sequelize.QueryTypes.DELETE }
        );
    }

    async bookRecurring(userId, recurringId) {
        const rows = await this._database.query(
            'SELECT * FROM recurring_transactions WHERE id=? AND user_id=?',
            { replacements: [recurringId, userId], type: Sequelize.QueryTypes.SELECT }
        );
        if (!rows.length) throw new Error('Vorlage nicht gefunden');
        const r = rows[0];

        const today = new Date().toISOString().substring(0, 10);
        const txId = await this.saveTransaction(userId, r.name, r.category, today, r.amount, r.type, r.account_id);

        const base = r.naechste_faelligkeit ? new Date(r.naechste_faelligkeit) : new Date();
        let next = new Date(base);
        if (r.rhythmus === 'woechentlich')    next.setDate(next.getDate() + 7);
        else if (r.rhythmus === 'monatlich')  next.setMonth(next.getMonth() + 1);
        else if (r.rhythmus === 'viertelj')   next.setMonth(next.getMonth() + 3);
        else if (r.rhythmus === 'halbjaehrl') next.setMonth(next.getMonth() + 6);
        else if (r.rhythmus === 'jaehrlich')  next.setFullYear(next.getFullYear() + 1);
        const nextStr = next.toISOString().substring(0, 10);

        await this._database.query(
            'UPDATE recurring_transactions SET naechste_faelligkeit=? WHERE id=? AND user_id=?',
            { replacements: [nextStr, recurringId, userId], type: Sequelize.QueryTypes.UPDATE }
        );

        return { txId, nextFaelligkeit: nextStr };
    }

    // ══════════════════════════════════════════════════════════
    // ── HAUSHALT-METHODEN ──────────────────────────────────────
    // ══════════════════════════════════════════════════════════

    // Haushalt für User holen (oder null wenn keiner)
    async getHaushaltForUser(userId) {
        const rows = await this._database.query(
            `SELECT h.*, hm.anzeigename, hm.rolle
             FROM haushalte h
             JOIN haushalt_mitglieder hm ON h.id = hm.haushalt_id
             WHERE hm.user_id = ?
             LIMIT 1`,
            { replacements: [userId], type: Sequelize.QueryTypes.SELECT }
        );
        return rows[0] || null;
    }

    // Alle Mitglieder eines Haushalts (mit Profilinfos)
    async getHaushaltMitglieder(haushaltId) {
        return await this._database.query(
            `SELECT hm.user_id, hm.anzeigename, hm.rolle,
                    u.Benutzername as email,
                    up.display_name, up.avatar_url
             FROM haushalt_mitglieder hm
             JOIN users u ON hm.user_id = u.id
             LEFT JOIN user_profiles up ON hm.user_id = up.user_id
             WHERE hm.haushalt_id = ?
             ORDER BY hm.id ASC`,
            { replacements: [haushaltId], type: Sequelize.QueryTypes.SELECT }
        );
    }

    // Haushalt erstellen
    async createHaushalt(userId, name, anzeigename) {
        const result = await this._database.query(
            'INSERT INTO haushalte (name, erstellt_von) VALUES (?,?)',
            { replacements: [name || 'Unser Haushalt', userId], type: Sequelize.QueryTypes.INSERT }
        );
        const haushaltId = result[0];
        await this._database.query(
            'INSERT INTO haushalt_mitglieder (haushalt_id, user_id, anzeigename, rolle) VALUES (?,?,?,?)',
            { replacements: [haushaltId, userId, anzeigename || '', 'admin'], type: Sequelize.QueryTypes.INSERT }
        );
        return haushaltId;
    }

    // Haushalt verlassen (letztes Mitglied → Haushalt + Daten löschen)
    async leaveHaushalt(haushaltId, userId) {
        // Mitglied entfernen
        await this._database.query(
            'DELETE FROM haushalt_mitglieder WHERE haushalt_id=? AND user_id=?',
            { replacements: [haushaltId, userId], type: Sequelize.QueryTypes.DELETE }
        );
        // Verbleibende Mitglieder prüfen
        const remaining = await this._database.query(
            'SELECT id FROM haushalt_mitglieder WHERE haushalt_id=?',
            { replacements: [haushaltId], type: Sequelize.QueryTypes.SELECT }
        );
        // Wenn niemand mehr übrig: Haushalt komplett löschen
        if (remaining.length === 0) {
            const tables = [
                'haushalt_transaktionen', 'haushalt_konten', 'haushalt_ausgaben',
                'haushalt_fixkosten', 'haushalt_fixkosten_monat', 'haushalt_persoenliche_fixkosten',
                'haushalt_gehaelter', 'haushalt_gehaelter_default', 'haushalt_todos',
                'haushalt_dokumente', 'haushalt_einladungen'
            ];
            for (const t of tables) {
                await this._database.query(
                    `DELETE FROM ${t} WHERE haushalt_id=?`,
                    { replacements: [haushaltId], type: Sequelize.QueryTypes.DELETE }
                );
            }
            await this._database.query(
                'DELETE FROM haushalte WHERE id=?',
                { replacements: [haushaltId], type: Sequelize.QueryTypes.DELETE }
            );
        } else {
            // Wenn der Admin geht: nächstes Mitglied zum Admin machen
            const isAdmin = await this._database.query(
                'SELECT id FROM haushalte WHERE id=? AND erstellt_von=?',
                { replacements: [haushaltId, userId], type: Sequelize.QueryTypes.SELECT }
            );
            if (isAdmin.length > 0) {
                const newAdmin = remaining[0];
                await this._database.query(
                    'UPDATE haushalte SET erstellt_von=? WHERE id=?',
                    { replacements: [newAdmin.id, haushaltId], type: Sequelize.QueryTypes.UPDATE }
                );
                await this._database.query(
                    'UPDATE haushalt_mitglieder SET rolle=? WHERE id=?',
                    { replacements: ['admin', newAdmin.id], type: Sequelize.QueryTypes.UPDATE }
                );
            }
        }
    }

    // Einladung erstellen
    async createHaushaltEinladung(haushaltId, eingeladenVon, email, code) {
        await this._database.query(
            'INSERT OR REPLACE INTO haushalt_einladungen (haushalt_id, eingeladen_von, email, code) VALUES (?,?,?,?)',
            { replacements: [haushaltId, eingeladenVon, email, code], type: Sequelize.QueryTypes.INSERT }
        );
    }

    // Einladung per Code holen
    async getEinladungByCode(code) {
        const rows = await this._database.query(
            `SELECT e.*, h.name as haushalt_name, u.Benutzername as eingeladen_von_email
             FROM haushalt_einladungen e
             JOIN haushalte h ON e.haushalt_id = h.id
             JOIN users u ON e.eingeladen_von = u.id
             WHERE e.code = ? AND e.angenommen = 0`,
            { replacements: [code], type: Sequelize.QueryTypes.SELECT }
        );
        return rows[0] || null;
    }

    // Einladung annehmen
    async acceptEinladung(code, userId, anzeigename) {
        const einladung = await this.getEinladungByCode(code);
        if (!einladung) throw new Error('Einladung ungültig oder bereits verwendet');

        // Prüfen ob User bereits Mitglied ist
        const existing = await this._database.query(
            'SELECT id FROM haushalt_mitglieder WHERE haushalt_id=? AND user_id=?',
            { replacements: [einladung.haushalt_id, userId], type: Sequelize.QueryTypes.SELECT }
        );
        if (existing.length > 0) throw new Error('Du bist bereits Mitglied dieses Haushalts');

        await this._database.query(
            'INSERT INTO haushalt_mitglieder (haushalt_id, user_id, anzeigename, rolle) VALUES (?,?,?,?)',
            { replacements: [einladung.haushalt_id, userId, anzeigename || '', 'mitglied'], type: Sequelize.QueryTypes.INSERT }
        );
        await this._database.query(
            'UPDATE haushalt_einladungen SET angenommen=1 WHERE code=?',
            { replacements: [code], type: Sequelize.QueryTypes.UPDATE }
        );
        return einladung.haushalt_id;
    }

    // Anzeigenamen aktualisieren
    async updateHaushaltAnzeigename(haushaltId, userId, anzeigename) {
        await this._database.query(
            'UPDATE haushalt_mitglieder SET anzeigename=? WHERE haushalt_id=? AND user_id=?',
            { replacements: [anzeigename, haushaltId, userId], type: Sequelize.QueryTypes.UPDATE }
        );
    }

    // Haushalt umbenennen
    async updateHaushaltName(haushaltId, name) {
        await this._database.query(
            'UPDATE haushalte SET name=? WHERE id=?',
            { replacements: [name, haushaltId], type: Sequelize.QueryTypes.UPDATE }
        );
    }

    // ── Haushalt-Fixkosten ─────────────────────────────────────

    async getHaushaltFixkosten(haushaltId) {
        return await this._database.query(
            'SELECT * FROM haushalt_fixkosten WHERE haushalt_id=? ORDER BY kategorie ASC, name ASC',
            { replacements: [haushaltId], type: Sequelize.QueryTypes.SELECT }
        );
    }

    async addHaushaltFixkost(haushaltId, data) {
        const { name, betrag, rhythmus, kategorie, anteil_user1, anteil_user2 } = data;
        const result = await this._database.query(
            'INSERT INTO haushalt_fixkosten (haushalt_id, name, betrag, rhythmus, kategorie, anteil_user1, anteil_user2) VALUES (?,?,?,?,?,?,?)',
            { replacements: [haushaltId, name, betrag || 0, rhythmus || 'monatlich', kategorie || 'wohnen', anteil_user1 ?? 50, anteil_user2 ?? 50], type: Sequelize.QueryTypes.INSERT }
        );
        return result[0];
    }

    async updateHaushaltFixkost(haushaltId, id, data) {
        const { name, betrag, rhythmus, kategorie, anteil_user1, anteil_user2 } = data;
        await this._database.query(
            'UPDATE haushalt_fixkosten SET name=?, betrag=?, rhythmus=?, kategorie=?, anteil_user1=?, anteil_user2=? WHERE id=? AND haushalt_id=?',
            { replacements: [name, betrag || 0, rhythmus || 'monatlich', kategorie || 'wohnen', anteil_user1 ?? 50, anteil_user2 ?? 50, id, haushaltId], type: Sequelize.QueryTypes.UPDATE }
        );
    }

    async deleteHaushaltFixkost(haushaltId, id) {
        await this._database.query(
            'DELETE FROM haushalt_fixkosten WHERE id=? AND haushalt_id=?',
            { replacements: [id, haushaltId], type: Sequelize.QueryTypes.DELETE }
        );
        await this._database.query(
            'DELETE FROM haushalt_fixkosten_monat WHERE fixkosten_id=? AND haushalt_id=?',
            { replacements: [id, haushaltId], type: Sequelize.QueryTypes.DELETE }
        );
    }

    // Monats-Override für Fixkosten (falls ein Monat abweicht)
    async getHaushaltFixkostenMonat(haushaltId, monat) {
        return await this._database.query(
            'SELECT * FROM haushalt_fixkosten_monat WHERE haushalt_id=? AND monat=?',
            { replacements: [haushaltId, monat], type: Sequelize.QueryTypes.SELECT }
        );
    }

    async setHaushaltFixkostMonat(haushaltId, fixkostenId, monat, data) {
        const { betrag, anteil_user1, anteil_user2 } = data;
        await this._database.query(
            `INSERT INTO haushalt_fixkosten_monat (haushalt_id, fixkosten_id, monat, betrag, anteil_user1, anteil_user2)
             VALUES (?,?,?,?,?,?)
             ON CONFLICT(haushalt_id, fixkosten_id, monat) DO UPDATE SET
               betrag = excluded.betrag,
               anteil_user1 = excluded.anteil_user1,
               anteil_user2 = excluded.anteil_user2`,
            { replacements: [haushaltId, fixkostenId, monat, betrag ?? null, anteil_user1 ?? null, anteil_user2 ?? null], type: Sequelize.QueryTypes.INSERT }
        );
    }

    async deleteHaushaltFixkostMonat(haushaltId, fixkostenId, monat) {
        await this._database.query(
            'DELETE FROM haushalt_fixkosten_monat WHERE haushalt_id=? AND fixkosten_id=? AND monat=?',
            { replacements: [haushaltId, fixkostenId, monat], type: Sequelize.QueryTypes.DELETE }
        );
    }

    // ── Persönliche Fixkosten ──────────────────────────────────

    async getHaushaltPersoenlicheFixkosten(haushaltId) {
        return await this._database.query(
            'SELECT * FROM haushalt_persoenliche_fixkosten WHERE haushalt_id=? ORDER BY user_id ASC, name ASC',
            { replacements: [haushaltId], type: Sequelize.QueryTypes.SELECT }
        );
    }

    async addHaushaltPersoenlicheFixkost(haushaltId, userId, data) {
        const { name, betrag, kategorie } = data;
        const result = await this._database.query(
            'INSERT INTO haushalt_persoenliche_fixkosten (haushalt_id, user_id, name, betrag, kategorie) VALUES (?,?,?,?,?)',
            { replacements: [haushaltId, userId, name, betrag || 0, kategorie || 'sonstiges'], type: Sequelize.QueryTypes.INSERT }
        );
        return result[0];
    }

    async updateHaushaltPersoenlicheFixkost(haushaltId, userId, id, data) {
        const { name, betrag, kategorie } = data;
        await this._database.query(
            'UPDATE haushalt_persoenliche_fixkosten SET name=?, betrag=?, kategorie=? WHERE id=? AND haushalt_id=? AND user_id=?',
            { replacements: [name, betrag || 0, kategorie || 'sonstiges', id, haushaltId, userId], type: Sequelize.QueryTypes.UPDATE }
        );
    }

    async deleteHaushaltPersoenlicheFixkost(haushaltId, userId, id) {
        await this._database.query(
            'DELETE FROM haushalt_persoenliche_fixkosten WHERE id=? AND haushalt_id=? AND user_id=?',
            { replacements: [id, haushaltId, userId], type: Sequelize.QueryTypes.DELETE }
        );
    }

    // ── Gehälter ───────────────────────────────────────────────

    async getHaushaltGehaelterDefault(haushaltId) {
        return await this._database.query(
            'SELECT * FROM haushalt_gehaelter_default WHERE haushalt_id=?',
            { replacements: [haushaltId], type: Sequelize.QueryTypes.SELECT }
        );
    }

    async setHaushaltGehaltDefault(haushaltId, userId, gehalt, sparbetrag) {
        await this._database.query(
            `INSERT INTO haushalt_gehaelter_default (haushalt_id, user_id, gehalt, sparbetrag)
             VALUES (?,?,?,?)
             ON CONFLICT(haushalt_id, user_id) DO UPDATE SET
               gehalt = excluded.gehalt,
               sparbetrag = excluded.sparbetrag`,
            { replacements: [haushaltId, userId, gehalt || 0, sparbetrag || 0], type: Sequelize.QueryTypes.INSERT }
        );
    }

    async getHaushaltGehaltMonat(haushaltId, monat) {
        return await this._database.query(
            'SELECT * FROM haushalt_gehaelter WHERE haushalt_id=? AND monat=?',
            { replacements: [haushaltId, monat], type: Sequelize.QueryTypes.SELECT }
        );
    }

    async setHaushaltGehaltMonat(haushaltId, userId, monat, gehalt, sparbetrag) {
        await this._database.query(
            `INSERT INTO haushalt_gehaelter (haushalt_id, user_id, monat, gehalt, sparbetrag)
             VALUES (?,?,?,?,?)
             ON CONFLICT(haushalt_id, user_id, monat) DO UPDATE SET
               gehalt = excluded.gehalt,
               sparbetrag = excluded.sparbetrag`,
            { replacements: [haushaltId, userId, monat, gehalt || 0, sparbetrag || 0], type: Sequelize.QueryTypes.INSERT }
        );
    }

    // ── Haushalt-Ausgaben (freie Ausgaben) ──────────────────────

    async getHaushaltAusgaben(haushaltId) {
        return await this._database.query(
            'SELECT * FROM haushalt_ausgaben WHERE haushalt_id=? ORDER BY datum DESC, id DESC',
            { replacements: [haushaltId], type: Sequelize.QueryTypes.SELECT }
        );
    }

    async addHaushaltAusgabe(haushaltId, userId, data) {
        const { name, betrag, kategorie, datum, anteil_user1, anteil_user2, notiz } = data;
        const result = await this._database.query(
            'INSERT INTO haushalt_ausgaben (haushalt_id, eingetragen_von, name, betrag, kategorie, datum, anteil_user1, anteil_user2, notiz) VALUES (?,?,?,?,?,?,?,?,?)',
            { replacements: [haushaltId, userId, name, betrag || 0, kategorie || 'sonstiges', datum || new Date().toISOString().substring(0,10), anteil_user1 ?? 50, anteil_user2 ?? 50, notiz || ''], type: Sequelize.QueryTypes.INSERT }
        );
        return result[0];
    }

    async updateHaushaltAusgabe(haushaltId, id, data) {
        const { name, betrag, kategorie, datum, anteil_user1, anteil_user2, notiz } = data;
        await this._database.query(
            'UPDATE haushalt_ausgaben SET name=?, betrag=?, kategorie=?, datum=?, anteil_user1=?, anteil_user2=?, notiz=? WHERE id=? AND haushalt_id=?',
            { replacements: [name, betrag || 0, kategorie || 'sonstiges', datum, anteil_user1 ?? 50, anteil_user2 ?? 50, notiz || '', id, haushaltId], type: Sequelize.QueryTypes.UPDATE }
        );
    }

    async deleteHaushaltAusgabe(haushaltId, id) {
        await this._database.query(
            'DELETE FROM haushalt_ausgaben WHERE id=? AND haushalt_id=?',
            { replacements: [id, haushaltId], type: Sequelize.QueryTypes.DELETE }
        );
    }

    // ── Haushalt-Todos ──────────────────────────────────────────

    async getHaushaltTodos(haushaltId) {
        return await this._database.query(
            'SELECT * FROM haushalt_todos WHERE haushalt_id=? ORDER BY completed ASC, priority DESC, due_date ASC',
            { replacements: [haushaltId], type: Sequelize.QueryTypes.SELECT }
        );
    }

    async addHaushaltTodo(haushaltId, userId, data) {
        const { task, priority, due_date, label, notes } = data;
        const result = await this._database.query(
            'INSERT INTO haushalt_todos (haushalt_id, erstellt_von, task, priority, due_date, label, notes) VALUES (?,?,?,?,?,?,?)',
            { replacements: [haushaltId, userId, task, priority || 'mittel', due_date || null, label || '', notes || ''], type: Sequelize.QueryTypes.INSERT }
        );
        return result[0];
    }

    async updateHaushaltTodo(haushaltId, id, data) {
        const { task, priority, due_date, label, notes } = data;
        await this._database.query(
            'UPDATE haushalt_todos SET task=?, priority=?, due_date=?, label=?, notes=? WHERE id=? AND haushalt_id=?',
            { replacements: [task, priority || 'mittel', due_date || null, label || '', notes || '', id, haushaltId], type: Sequelize.QueryTypes.UPDATE }
        );
    }

    async completeHaushaltTodo(haushaltId, id) {
        await this._database.query(
            'UPDATE haushalt_todos SET completed=1 WHERE id=? AND haushalt_id=?',
            { replacements: [id, haushaltId], type: Sequelize.QueryTypes.UPDATE }
        );
    }

    async uncompleteHaushaltTodo(haushaltId, id) {
        await this._database.query(
            'UPDATE haushalt_todos SET completed=0 WHERE id=? AND haushalt_id=?',
            { replacements: [id, haushaltId], type: Sequelize.QueryTypes.UPDATE }
        );
    }

    async deleteHaushaltTodo(haushaltId, id) {
        await this._database.query(
            'DELETE FROM haushalt_todos WHERE id=? AND haushalt_id=?',
            { replacements: [id, haushaltId], type: Sequelize.QueryTypes.DELETE }
        );
    }

    // ── Haushalt-Dokumente ──────────────────────────────────────

    async getHaushaltDokumente(haushaltId) {
        return await this._database.query(
            `SELECT id, typ, name, datum, jahr, notiz, file_ext, file_mime,
                    betrag, faellig_datum, aussteller, status, kategorie, created_at, hochgeladen_von
             FROM haushalt_dokumente
             WHERE haushalt_id=?
             ORDER BY datum DESC, id DESC`,
            { replacements: [haushaltId], type: Sequelize.QueryTypes.SELECT }
        );
    }

    async getHaushaltDokumentById(haushaltId, dokumentId) {
        const rows = await this._database.query(
            'SELECT * FROM haushalt_dokumente WHERE id=? AND haushalt_id=?',
            { replacements: [dokumentId, haushaltId], type: Sequelize.QueryTypes.SELECT }
        );
        return rows[0] || null;
    }

    async addHaushaltDokument(haushaltId, userId, data) {
        const { typ, name, datum, jahr, notiz, file_data, file_ext, file_mime,
                betrag, faellig_datum, aussteller, status, kategorie } = data;
        const result = await this._database.query(
            `INSERT INTO haushalt_dokumente
             (haushalt_id, hochgeladen_von, typ, name, datum, jahr, notiz, file_data, file_ext, file_mime,
              betrag, faellig_datum, aussteller, status, kategorie)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            {
                replacements: [
                    haushaltId, userId, typ || 'sonstiges', name, datum || null, jahr || null,
                    notiz || '', file_data || '', file_ext || '', file_mime || '',
                    betrag || null, faellig_datum || null, aussteller || '', status || 'offen', kategorie || ''
                ],
                type: Sequelize.QueryTypes.INSERT
            }
        );
        return result[0];
    }

    async updateHaushaltDokumentStatus(haushaltId, dokumentId, status) {
        await this._database.query(
            'UPDATE haushalt_dokumente SET status=? WHERE id=? AND haushalt_id=?',
            { replacements: [status, dokumentId, haushaltId], type: Sequelize.QueryTypes.UPDATE }
        );
    }

    async deleteHaushaltDokument(haushaltId, dokumentId) {
        await this._database.query(
            'DELETE FROM haushalt_dokumente WHERE id=? AND haushalt_id=?',
            { replacements: [dokumentId, haushaltId], type: Sequelize.QueryTypes.DELETE }
        );
    }

    // ══════════════════════════════════════════════════════════
    // ── HAUSHALTSKONTO ─────────────────────────────────────────
    // ══════════════════════════════════════════════════════════

    async getHaushaltKonto(haushaltId) {
        const rows = await this._database.query(
            'SELECT * FROM haushalt_konten WHERE haushalt_id = ? LIMIT 1',
            { replacements: [haushaltId], type: Sequelize.QueryTypes.SELECT }
        );
        return rows[0] || null;
    }

    async createHaushaltKonto(haushaltId, name, balance, color) {
        const result = await this._database.query(
            'INSERT INTO haushalt_konten (haushalt_id, name, balance, color) VALUES (?,?,?,?)',
            { replacements: [haushaltId, name || 'Gemeinsames Konto', parseFloat(balance) || 0, color || '#10b981'], type: Sequelize.QueryTypes.INSERT }
        );
        return result[0];
    }

    async updateHaushaltKonto(haushaltId, name, balance, color) {
        await this._database.query(
            'UPDATE haushalt_konten SET name=?, balance=?, color=? WHERE haushalt_id=?',
            { replacements: [name, parseFloat(balance) || 0, color, haushaltId], type: Sequelize.QueryTypes.UPDATE }
        );
    }

    async linkHaushaltKonto(haushaltId, linkedAccountId) {
        await this._database.query(
            'UPDATE haushalt_konten SET linked_account_id=? WHERE haushalt_id=?',
            { replacements: [linkedAccountId || null, haushaltId], type: Sequelize.QueryTypes.UPDATE }
        );
    }

    async deleteHaushaltKonto(haushaltId) {
        await this._database.query(
            'DELETE FROM haushalt_konten WHERE haushalt_id=?',
            { replacements: [haushaltId], type: Sequelize.QueryTypes.DELETE }
        );
        await this._database.query(
            'DELETE FROM haushalt_transaktionen WHERE haushalt_id=?',
            { replacements: [haushaltId], type: Sequelize.QueryTypes.DELETE }
        );
    }

    // ── Haushalt-Transaktionen ─────────────────────────────────

    async getHaushaltTransaktionen(haushaltId) {
        return await this._database.query(
            `SELECT ht.*,
                    COALESCE(ht.anteil_user1, 50) as anteil_user1,
                    COALESCE(ht.anteil_user2, 50) as anteil_user2,
                    u.Benutzername as email,
                    COALESCE(hm.anzeigename, up.display_name, u.Benutzername) as eingetragen_von_name
             FROM haushalt_transaktionen ht
             LEFT JOIN users u ON ht.eingetragen_von = u.id
             LEFT JOIN haushalt_mitglieder hm ON hm.user_id = ht.eingetragen_von AND hm.haushalt_id = ht.haushalt_id
             LEFT JOIN user_profiles up ON up.user_id = ht.eingetragen_von
             WHERE ht.haushalt_id = ?
             ORDER BY ht.date DESC, ht.created_at DESC`,
            { replacements: [haushaltId], type: Sequelize.QueryTypes.SELECT }
        );
    }

    async addHaushaltTransaktion(haushaltId, userId, data) {
        const { name, category, amount, type, date, notiz, ausgabe_id, anteil_user1, anteil_user2 } = data;
        const result = await this._database.query(
            'INSERT INTO haushalt_transaktionen (haushalt_id, eingetragen_von, name, category, amount, type, date, notiz, ausgabe_id, anteil_user1, anteil_user2) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
            {
                replacements: [haushaltId, userId, name, category || 'Sonstiges', parseFloat(amount), type || 'Ausgaben', date, notiz || '', ausgabe_id || null, anteil_user1 ?? 50, anteil_user2 ?? 50],
                type: Sequelize.QueryTypes.INSERT
            }
        );
        return result[0];
    }

    async updateHaushaltTransaktion(haushaltId, id, data) {
        const { name, category, amount, type, date, notiz, anteil_user1, anteil_user2 } = data;
        await this._database.query(
            'UPDATE haushalt_transaktionen SET name=?, category=?, amount=?, type=?, date=?, notiz=?, anteil_user1=?, anteil_user2=? WHERE id=? AND haushalt_id=?',
            { replacements: [name, category || 'Sonstiges', parseFloat(amount), type || 'Ausgaben', date, notiz || '', anteil_user1 ?? 50, anteil_user2 ?? 50, id, haushaltId], type: Sequelize.QueryTypes.UPDATE }
        );
    }

    async deleteHaushaltTransaktion(haushaltId, id) {
        await this._database.query(
            'DELETE FROM haushalt_transaktionen WHERE id=? AND haushalt_id=?',
            { replacements: [id, haushaltId], type: Sequelize.QueryTypes.DELETE }
        );
    }

    // Kontostand berechnen (Startguthaben +/- alle Transaktionen)
    async getHaushaltKontoMitStand(haushaltId) {
        const konto = await this.getHaushaltKonto(haushaltId);
        if (!konto) return null;
        const txs = await this.getHaushaltTransaktionen(haushaltId);
        let currentBalance = konto.balance || 0;
        txs.forEach(t => {
            if (t.type === 'Einnahmen') currentBalance += t.amount;
            else currentBalance -= t.amount;
        });
        return { ...konto, currentBalance: parseFloat(currentBalance.toFixed(2)), transaktionen: txs };
    }

    // Auto-Einträge: Haushalt-Fixkosten in Transaktionen eintragen (täglich via Cron)
    async addHaushaltFixkostenTransaktionen(haushaltId) {
        const today = new Date();
        const monat = today.toISOString().slice(0, 7);
        const tag   = today.getDate();

        const fixkosten = await this.getHaushaltFixkosten(haushaltId);
        for (const fix of fixkosten) {
            const fixTag = parseInt(fix.datum_tag || 1);
            if (fixTag !== tag) continue;
            // Prüfen ob für diesen Monat bereits eingetragen
            const existing = await this._database.query(
                'SELECT id FROM haushalt_transaktionen WHERE haushalt_id=? AND fixkost_id=? AND date LIKE ?',
                { replacements: [haushaltId, fix.id, monat + '%'], type: Sequelize.QueryTypes.SELECT }
            );
            if (existing.length > 0) continue;
            await this._database.query(
                'INSERT INTO haushalt_transaktionen (haushalt_id, eingetragen_von, name, category, amount, type, date, is_fixkost, fixkost_id) VALUES (?,?,?,?,?,?,?,1,?)',
                {
                    replacements: [haushaltId, 0, fix.name, fix.kategorie || 'Sonstiges', fix.betrag, 'Ausgaben', today.toISOString().slice(0, 10), fix.id],
                    type: Sequelize.QueryTypes.INSERT
                }
            );
        }
    }

    // ── Passwort-Reset-Methoden ────────────────────────────────

    async setResetToken(email, token, expires) {
        await this._database.query(
            'UPDATE users SET reset_token=?, reset_token_expires=? WHERE Benutzername=?',
            { replacements: [token, expires, email], type: Sequelize.QueryTypes.UPDATE }
        );
    }

    async getUserByResetToken(token) {
        const rows = await this._database.query(
            'SELECT id, Benutzername as email, reset_token_expires FROM users WHERE reset_token=?',
            { replacements: [token], type: Sequelize.QueryTypes.SELECT }
        );
        return rows[0] || null;
    }

    async resetPassword(token, hashedPassword) {
        await this._database.query(
            'UPDATE users SET Passwort=?, reset_token=NULL, reset_token_expires=NULL WHERE reset_token=?',
            { replacements: [hashedPassword, token], type: Sequelize.QueryTypes.UPDATE }
        );
    }

    // ── Account löschen (DSGVO) ───────────────────────────────

    async setVerifyToken(userId, token) {
        await this._database.query(
            'UPDATE users SET email_verify_token=? WHERE id=?',
            { replacements: [token, userId], type: Sequelize.QueryTypes.UPDATE }
        );
    }

    async getUserByVerifyToken(token) {
        const rows = await this._database.query(
            'SELECT id, Benutzername as email, email_verified FROM users WHERE email_verify_token=?',
            { replacements: [token], type: Sequelize.QueryTypes.SELECT }
        );
        return rows[0] || null;
    }

    async verifyEmail(token) {
        await this._database.query(
            'UPDATE users SET email_verified=1, email_verify_token=NULL WHERE email_verify_token=?',
            { replacements: [token], type: Sequelize.QueryTypes.UPDATE }
        );
    }

    async getHaushaltTrackerCategories(haushaltId) {
        return await this._database.query(
            'SELECT id, name FROM haushalt_tracker_categories WHERE haushalt_id=? ORDER BY name ASC',
            { replacements: [haushaltId], type: Sequelize.QueryTypes.SELECT }
        );
    }

    async addHaushaltTrackerCategory(haushaltId, name) {
        try {
            await this._database.query(
                'INSERT OR IGNORE INTO haushalt_tracker_categories (haushalt_id, name) VALUES (?,?)',
                { replacements: [haushaltId, name], type: Sequelize.QueryTypes.INSERT }
            );
        } catch (e) { /* UNIQUE-Konflikt ignorieren */ }
    }

    async deleteHaushaltTrackerCategory(haushaltId, name) {
        await this._database.query(
            'DELETE FROM haushalt_tracker_categories WHERE haushalt_id=? AND name=?',
            { replacements: [haushaltId, name], type: Sequelize.QueryTypes.DELETE }
        );
    }

    async renameHaushaltTrackerCategory(haushaltId, oldName, newName) {
        await this._database.query(
            'UPDATE haushalt_tracker_categories SET name=? WHERE haushalt_id=? AND name=?',
            { replacements: [newName, haushaltId, oldName], type: Sequelize.QueryTypes.UPDATE }
        );
        // Bestehende Transaktionen ebenfalls umbenennen
        await this._database.query(
            'UPDATE haushalt_transaktionen SET category=? WHERE haushalt_id=? AND category=?',
            { replacements: [newName, haushaltId, oldName], type: Sequelize.QueryTypes.UPDATE }
        );
    }

    async completeOnboarding(userId) {
        await this._database.query(
            'UPDATE users SET is_new_user=0 WHERE id=?',
            { replacements: [userId], type: Sequelize.QueryTypes.UPDATE }
        );
    }

    async deleteUserAccount(userId) {
        const tables = [
            ['ausgabenDB',                    'user_id'],
            ['todos',                         'user_id'],
            ['categories',                    'user_id'],
            ['calendar_events',               'user_id'],
            ['fixkosten',                     'user_id'],
            ['accounts',                      'user_id'],
            ['user_profiles',                 'user_id'],
            ['user_settings',                 'user_id'],
            ['analysen',                      'user_id'],
            ['dokumente',                     'user_id'],
            ['versicherungen',                'user_id'],
            ['budgets',                       'user_id'],
            ['sparziele',                     'user_id'],
            ['abos',                          'user_id'],
            ['notizen',                       'user_id'],
            ['gewohnheiten',                  'user_id'],
            ['ziele',                         'user_id'],
            ['schulden',                      'user_id'],
            ['schulden_zahlungen',            'user_id'],
            ['recurring_transactions',        'user_id'],
            ['steuer_werbungskosten',         'user_id'],
            ['steuer_assistent',              'user_id'],
            ['finanzen_investments',          'user_id'],
            ['finanzen_konfig',               'user_id'],
            ['finanzen_manuelle_eintraege',   'user_id'],
            ['outlook_tokens',               'user_id'],
            ['reminder_log',                 'user_id'],
        ];

        for (const [table, col] of tables) {
            try {
                await this._database.query(
                    `DELETE FROM ${table} WHERE ${col}=?`,
                    { replacements: [userId], type: Sequelize.QueryTypes.DELETE }
                );
            } catch (e) { /* Tabelle existiert evtl. noch nicht */ }
        }

        // Haushalt-Mitgliedschaft beenden (leaveHaushalt übernimmt ggf. Löschung)
        try {
            const haushalt = await this.getHaushaltForUser(userId);
            if (haushalt) await this.leaveHaushalt(haushalt.id, userId);
        } catch (e) {}

        // User selbst löschen
        await this._database.query(
            'DELETE FROM users WHERE id=?',
            { replacements: [userId], type: Sequelize.QueryTypes.DELETE }
        );
    }
}