import express from 'express';
import { check, validationResult } from 'express-validator';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import Database from '../modules/database.js';
import { sendMail, greetingHtml, ctaButtonHtml, dividerHtml, sectionTitleHtml } from '../modules/mailer.js';
import Stripe from 'stripe';

const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;

const __filename = fileURLToPath(import.meta.url);
const __dirRoutes = dirname(__filename);

// ── Multer-Setup für Dokumenten-Upload ───────────────────────
const dokStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = path.join(__dirRoutes, '..', 'uploads', `user_${req.session.userId}`);
        fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        cb(null, Date.now() + '-' + Math.round(Math.random() * 1e9) + ext);
    }
});
const dokUpload = multer({
    storage: dokStorage,
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowed = ['.pdf', '.jpg', '.jpeg', '.png', '.gif', '.webp', '.doc', '.docx', '.xlsx', '.csv', '.txt'];
        const ext = path.extname(file.originalname).toLowerCase();
        allowed.includes(ext) ? cb(null, true) : cb(new Error('Dateityp nicht erlaubt'));
    }
});

const router = express.Router();

// ── TOTP Hilfsfunktionen (RFC 6238, kein externes Paket) ──────

// Korrekte Base32-Kodierung (RFC 4648)
function base32Encode(buf) {
    const alpha = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    let bits = 0, value = 0, output = '';
    for (const byte of buf) {
        value = (value << 8) | byte;
        bits += 8;
        while (bits >= 5) {
            bits -= 5;
            output += alpha[(value >> bits) & 0x1f];
        }
    }
    if (bits > 0) output += alpha[(value << (5 - bits)) & 0x1f];
    return output;
}

// Generiert ein sauberes 32-Zeichen Base32-Secret (20 Bytes = 160 Bit)
function totpGenerateSecret() {
    return base32Encode(crypto.randomBytes(20)); // ergibt exakt 32 Base32-Zeichen
}

function base32Decode(s) {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    let bits = 0, value = 0;
    const output = [];
    for (const c of s.toUpperCase().replace(/=| /g, '')) {
        const idx = alphabet.indexOf(c);
        if (idx === -1) continue;
        value = (value << 5) | idx;
        bits += 5;
        if (bits >= 8) { bits -= 8; output.push((value >> bits) & 0xff); }
    }
    return Buffer.from(output);
}

function totpVerify(secret, token, window = 1) {
    const key    = base32Decode(secret);
    const epoch  = Math.floor(Date.now() / 1000);
    const step   = 30;
    const digits = 6;
    const tokenStr = String(token).replace(/\s/g, '').trim();
    for (let w = -window; w <= window; w++) {
        const counter = Math.floor(epoch / step) + w;
        const buf = Buffer.alloc(8);
        buf.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
        buf.writeUInt32BE(counter >>> 0, 4);
        const hmac   = crypto.createHmac('sha1', key).update(buf).digest();
        const offset = hmac[hmac.length - 1] & 0x0f;
        // Multiplication statt Bitshift vermeidet signed 32-bit Overflow
        const code   = (
            (hmac[offset]   & 0x7f) * 0x1000000 +
             hmac[offset+1]         * 0x10000   +
             hmac[offset+2]         * 0x100     +
             hmac[offset+3]
        ) % (10 ** digits);
        if (String(code).padStart(digits, '0') === tokenStr) return true;
    }
    return false;
}

function totpOtpAuthUrl(secret, email, issuer = 'Golden Goat Capital') {
    const label = encodeURIComponent(`${issuer}:${email}`);
    const params = `secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
    return `otpauth://totp/${label}?${params}`;
}

function generateBackupCodes(count = 8) {
    const codes = [];
    for (let i = 0; i < count; i++) {
        const raw = crypto.randomBytes(4).toString('hex').toUpperCase();
        codes.push(`${raw.slice(0,4)}-${raw.slice(4)}`);
    }
    return codes;
}

// Stelle sicher, dass JSON und URL-encoded Daten geparsed werden
router.use(express.json({ limit: "15mb" }));
router.use(express.urlencoded({ extended: true, limit: "15mb" }));

// Hilfsfunktion, um isLoggedIn zu bestimmen
const getIsLoggedIn = (req) => !!req.session.username;

// Route für Startseite (kleingeschrieben)
router.get('/startseite', async (req, res) => {
    if (!req.session.username) {
        return res.redirect('/users/login');
    }
    try {
        const db = await Database.getInstance();
        const profil = await db.getProfil(req.session.username);
        if (profil) {
            res.render('startseite', { profil, isLoggedIn: true });
        } else {
            res.status(404).send('Profil nicht gefunden');
        }
    } catch (error) {
        console.error(error);
        res.status(500).send('Interner Serverfehler');
    }
});

// GET-Route für Registrierung
router.get('/register', (req, res) => {
    res.render('register_tpl', { errors: [], success: false, isLoggedIn: getIsLoggedIn(req) });
});

// GET-Route für Login
router.get('/login', (req, res) => {
    if (req.session.username) {
        const redirect = req.query.redirect;
        return res.redirect(redirect || '/users/overview');
    }
    res.render('login_tpl', { isLoggedIn: false, error: null, twoFactor: false, redirectUrl: req.query.redirect || '' });
});

// Route für Login
router.post('/check_login', async (req, res) => {
    const username = req.body.user;
    const password = req.body.pw;
    try {
        const db = await Database.getInstance();
        const isValid = await db.validateUser(username, password);
        if (isValid) {
            const user = await db.getUserByEmail(username);
            if (!user || !user.email_verified) {
                return res.render('login_tpl', { isLoggedIn: false, error: 'Bitte bestätige zuerst deine E-Mail-Adresse. Schau in dein Postfach.', twoFactor: false });
            }
            // 2FA prüfen
            const settings = await db.getUserSettings(user.id);
            if (settings && settings.two_factor && settings.totp_secret) {
                // Passwort korrekt, aber 2FA nötig → in Session merken, noch nicht einloggen
                req.session.pending2faUserId   = user.id;
                req.session.pending2faUsername = username;
                req.session.pending2faNewUser  = !!user.is_new_user;
                return res.render('login_tpl', { isLoggedIn: false, error: null, twoFactor: true });
            }
            req.session.username = username;
            req.session.userId = user.id;
            req.session.isNewUser = !!user.is_new_user;
            if (user.is_new_user) return res.redirect('/users/onboarding');
            const redirectTo = req.body.redirect || '/users/overview';
            res.redirect(redirectTo);
        } else {
            res.render('login_tpl', { isLoggedIn: false, error: 'Benutzer existiert nicht oder Passwort ist ungültig', twoFactor: false });
        }
    } catch (error) {
        console.error(error);
        res.status(500).send('Interner Serverfehler');
    }
});

// 2FA-Code beim Login verifizieren
router.post('/verify-2fa', async (req, res) => {
    const { code } = req.body;
    const userId   = req.session.pending2faUserId;
    const username = req.session.pending2faUsername;
    if (!userId || !username) {
        return res.render('login_tpl', { isLoggedIn: false, error: 'Sitzung abgelaufen. Bitte erneut anmelden.', twoFactor: false });
    }
    try {
        const db       = await Database.getInstance();
        const settings = await db.getTotpSecret(userId);
        if (!settings?.totp_secret) {
            return res.render('login_tpl', { isLoggedIn: false, error: 'Fehler bei der 2FA-Verifizierung.', twoFactor: false });
        }
        // TOTP prüfen
        const valid = totpVerify(settings.totp_secret, code);
        if (valid) {
            req.session.pending2faUserId   = null;
            req.session.pending2faUsername = null;
            req.session.username = username;
            req.session.userId   = userId;
            const isNewUser = req.session.pending2faNewUser;
            req.session.pending2faNewUser = null;
            if (isNewUser) return res.redirect('/users/onboarding');
            return res.redirect('/users/overview');
        }
        // Backup-Code prüfen
        const usedBackup = await db.consumeBackupCode(userId, code.replace(/\s/g, ''));
        if (usedBackup) {
            req.session.pending2faUserId   = null;
            req.session.pending2faUsername = null;
            req.session.username = username;
            req.session.userId   = userId;
            return res.redirect('/users/overview');
        }
        res.render('login_tpl', { isLoggedIn: false, error: 'Ungültiger Code. Bitte versuche es erneut.', twoFactor: true });
    } catch (err) {
        console.error(err);
        res.render('login_tpl', { isLoggedIn: false, error: 'Fehler bei der Verifizierung.', twoFactor: true });
    }
});

// Route für Registrierung
router.post('/register', [
    check('user').trim().notEmpty().isEmail().withMessage('Bitte geben Sie eine gültige E-Mail-Adresse ein'),
    check('pw')
        .notEmpty().withMessage('Passwort fehlt')
        .isLength({ min: 8 }).withMessage('Passwort muss mindestens 8 Zeichen lang sein')
        .matches(/[A-Z]/).withMessage('Passwort muss mindestens einen Großbuchstaben enthalten')
        .matches(/[0-9!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/).withMessage('Passwort muss mindestens eine Zahl oder ein Sonderzeichen enthalten'),
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.render('register_tpl', { errors: errors.array(), success: false, isLoggedIn: getIsLoggedIn(req) });
    }
    const username = req.body.user;
    const password = req.body.pw;
    try {
        const db = await Database.getInstance();
        const exists = await db.userExists(username);
        if (exists) {
            return res.render('register_tpl', { errors: [{ msg: 'E-Mail-Adresse bereits vergeben' }], success: false, isLoggedIn: getIsLoggedIn(req) });
        }
        await db.registerUser(username, password);
        const userId = await db.getUserIdByName(username);
        await db.setTrial(userId);
        const token = crypto.randomBytes(32).toString('hex');
        await db.setVerifyToken(userId, token);
        const verifyUrl = `${process.env.APP_URL || 'http://localhost:3000'}/users/verify-email?token=${token}`;
        await sendMail({
            to: username,
            subject: 'E-Mail-Adresse bestätigen – Golden Goat Capital',
            title: 'E-Mail bestätigen',
            preheader: 'Bitte bestätige deine E-Mail-Adresse bei Golden Goat Capital.',
            bodyHtml: `
                ${greetingHtml('Willkommen bei Golden Goat Capital!')}
                <p>Bitte bestätige deine E-Mail-Adresse, um dein Konto zu aktivieren.</p>
                ${`<div style="text-align:center;margin-top:8px;"><a href="${verifyUrl}" class="cta-btn">E-Mail bestätigen</a></div>`}
                ${dividerHtml()}
                <p style="font-size:12px;color:#64748b;">Falls du kein Konto erstellt hast, kannst du diese E-Mail ignorieren.</p>
            `
        });
        res.render('register_tpl', { errors: [], success: true, isLoggedIn: getIsLoggedIn(req) });
    } catch (error) {
        console.error(error);
        res.status(500).send('Interner Serverfehler');
    }
});


router.get('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            return res.status(500).send('Interner Serverfehler');
        }
        res.redirect('/');
    });
});

router.get('/getTransactions', async (req, res) => {
    console.log('GET /users/getTransactions aufgerufen');
    console.log('Session:', req.session);
    if (!req.session.username) {
        console.log('Keine Session gefunden, Benutzer nicht autorisiert');
        return res.status(401).json({ message: 'Nicht autorisiert, bitte erneut einloggen' });
    }

    try {
        const db = await Database.getInstance();
        const userId = await db.getUserIdByName(req.session.username);
        console.log('User ID:', userId);
        if (userId === -1) {
            console.log('Benutzer nicht gefunden für Username:', req.session.username);
            return res.status(404).json({ message: 'Benutzer nicht gefunden' });
        }

        const transactions = await db.getTransactionsForUser(userId);
        console.log('Transaktionen:', transactions);
        res.json(transactions.map(t => ({
            ...t,
            type: (t.type === 'outbound' || t.type === 'Ausgaben') ? 'Ausgaben' : 'Einnahmen'
        })));
    } catch (error) {
        console.error('Fehler beim Abrufen der Transaktionen:', error);
        res.status(500).json({ message: 'Interner Serverfehler', error: error.message });
    }
});

router.post('/addTransaction', async (req, res) => {
    if (!req.session.username || !req.session.userId) {
        console.error('Session-Daten fehlen:', req.session);
        return res.status(401).json({ message: 'Nicht autorisiert' });
    }

    const { type, name, category, amount, date, account_id } = req.body;

    console.log('Empfangene Transaktionsdaten:', { type, name, category, amount, date });

    if (!name || !category || !amount || !date || !type) {
        const missingFields = [];
        if (!name) missingFields.push('name');
        if (!category) missingFields.push('category');
        if (!amount) missingFields.push('amount');
        if (!date) missingFields.push('date');
        if (!type) missingFields.push('type');
        console.log('Fehlende Felder:', missingFields);
        return res.status(400).json({
            message: `Alle Felder müssen ausgefüllt werden. Fehlende Felder: ${missingFields.join(', ')}`
        });
    }

    try {
        const db = await Database.getInstance();
        const userId = req.session.userId;
        let transactionType = type === "inbound" ? "Einnahmen" : "Ausgaben";
        let finalCategory = category;

        // Regeln anwenden
        const applied = await db.applyRegeln(userId, name, finalCategory, transactionType, 'privat');
        finalCategory    = applied.category;
        transactionType  = applied.type;

        const transactionId = await db.createTransaction(
            userId, name, finalCategory, date, parseFloat(amount), transactionType,
            account_id ? parseInt(account_id) : null
        );
        db.logActivity(userId, 'erstellt', 'Transaktion', transactionId, { name, category: finalCategory, amount: parseFloat(amount), type: transactionType, date });
        res.status(201).json({ message: 'Transaktion erfolgreich hinzugefügt', transactionId, appliedRule: applied.category !== category || applied.type !== transactionType });
    } catch (error) {
        console.error('Fehler beim Hinzufügen der Transaktion:', error);
        res.status(500).json({ message: 'Interner Serverfehler' });
    }
});

router.get('/loadTransactions', async (req, res) => {
    if (!req.session.username) {
        return res.status(401).send('Nicht autorisiert');
    }

    try {
        const db = await Database.getInstance();
        const userId = await db.getUserIdByName(req.session.username);

        if (userId) {
            const transactions = await db.getTransactionsForUser(userId);
            res.json(transactions);
        } else {
            res.status(404).send('Benutzer nicht gefunden');
        }
    } catch (error) {
        console.error(error);
        res.status(500).send('Interner Serverfehler');
    }
});

router.delete('/deleteTransaction/:id', async (req, res) => {
    if (!req.session.username) {
        console.error('Nicht autorisiert');
        return res.status(401).json({ message: 'Nicht autorisiert' });
    }

    const transactionId = req.params.id;
    console.log('Lösche Transaktion mit ID:', transactionId);

    try {
        const db = await Database.getInstance();
        const userId = await db.getUserIdByName(req.session.username);

        if (userId !== -1) {
            console.log('Benutzer ID:', userId);
            const txs = await db.getTransactionsForUser(userId);
            const txToDelete = txs.find(t => t.id == transactionId);
            const deleteResult = await db.deleteTransaction(userId, transactionId);
            console.log('Löschergebnis:', deleteResult);
            if (deleteResult) {
                if (txToDelete) db.logActivity(userId, 'gelöscht', 'Transaktion', transactionId, { name: txToDelete.name, amount: txToDelete.amount, type: txToDelete.type });
                res.status(200).json({ message: 'Transaktion erfolgreich gelöscht' });
            } else {
                res.status(404).json({ message: 'Transaktion nicht gefunden' });
            }
        } else {
            console.error('Benutzer nicht gefunden');
            res.status(404).json({ message: 'Benutzer nicht gefunden' });
        }
    } catch (error) {
        console.error('Fehler beim Löschen der Transaktion:', error);
        res.status(500).json({ message: 'Interner Serverfehler' });
    }
});

// Privat-ToDo entfernt (Phase 0-A) — ToDo existiert nur noch im Haushalt-Kontext (/users/haushalt/todos)

router.get('/ausgabentracker', (req, res) => {
    const isLoggedIn = !!req.session.username;
    if (!isLoggedIn) {
        return res.redirect('/users/login');
    }
    res.render('ausgabentracker', { isLoggedIn });
});

router.get('/zinseszinsrechner', (req, res) => {
    const isLoggedIn = !!req.session.username;
    if (!isLoggedIn) {
        return res.redirect('/users/login');
    }
    res.render('zinseszinsrechner', { isLoggedIn });
});

router.get('/overview', (req, res) => {
    const isLoggedIn = !!req.session.username;
    if (!isLoggedIn) {
        return res.redirect('/users/login');
    }
    res.render('overview', { isLoggedIn });
});

router.get('/analysen', async (req, res) => {
    const isLoggedIn = !!req.session.username;
    if (!isLoggedIn) return res.redirect('/users/login');
    res.render('analysen', { isLoggedIn });
});

router.get('/elliottwave', (req, res) => {
    const isLoggedIn = !!req.session.username;
    if (!isLoggedIn) {
        return res.redirect('/users/login');
    }
    res.render('elliottwave', { isLoggedIn });
});

router.get('/tradingview', (req, res) => {
    const isLoggedIn = !!req.session.username;
    if (!isLoggedIn) {
        return res.redirect('/users/login');
    }
    res.render('tradingview', { isLoggedIn });
});

router.post('/categories/add', async (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({ message: 'Nicht autorisiert' });
    }

    const { name } = req.body;

    if (!name) {
        return res.status(400).json({ message: 'Kategoriename erforderlich' });
    }

    try {
        const db = await Database.getInstance();
        await db.addCategory(req.session.userId, name);
        res.status(201).json({ message: 'Kategorie hinzugefügt' });
    } catch (error) {
        console.error('Fehler beim Hinzufügen der Kategorie:', error);
        res.status(500).json({ message: 'Interner Serverfehler' });
    }
});

router.get('/categories', async (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({ message: 'Nicht autorisiert' });
    }

    try {
        const db = await Database.getInstance();
        const categories = await db.getCategories(req.session.userId);
        res.json(categories);
    } catch (error) {
        console.error('Fehler beim Abrufen der Kategorien:', error);
        res.status(500).json({ message: 'Interner Serverfehler' });
    }
});

router.delete('/categories/delete/:name', async (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({ message: 'Nicht autorisiert' });
    }

    try {
        const db = await Database.getInstance();
        const categoryName = decodeURIComponent(req.params.name);
        const transactions = await db.getTransactionsForUser(req.session.userId);
        const relatedTransactions = transactions.filter(t => t.category === categoryName);

        if (relatedTransactions.length > 0) {
            for (const transaction of relatedTransactions) {
                await db.deleteTransaction(req.session.userId, transaction.id);
            }
        }

        const success = await db.deleteCategoryByName(req.session.userId, categoryName);
        if (success) {
            res.status(200).json({ message: 'Kategorie gelöscht', transactionCount: relatedTransactions.length });
        } else {
            res.status(404).json({ message: 'Kategorie nicht gefunden oder gehört nicht dir' });
        }
    } catch (error) {
        console.error('Fehler beim Löschen der Kategorie:', error);
        res.status(400).json({ message: error.message || 'Fehler beim Löschen der Kategorie' });
    }
});

// Neue Kalender-Routen
router.get('/kalender', (req, res) => {
    const isLoggedIn = !!req.session.username;
    if (!isLoggedIn) {
        return res.redirect('/users/login');
    }
    res.render('kalender', { isLoggedIn });
});

router.get('/events', async (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({ message: 'Nicht autorisiert' });
    }
    try {
        const db = await Database.getInstance();
        const events = await db.getEventsForUser(req.session.userId);
        res.json(events);
    } catch (error) {
        console.error('Fehler beim Abrufen der Events:', error);
        res.status(500).json({ message: 'Interner Serverfehler' });
    }
});

router.post('/events/add', async (req, res) => {
    console.log('Empfangene Daten:', JSON.stringify(req.body, null, 2));
    if (!req.session.userId) {
        return res.status(401).json({ message: 'Nicht autorisiert' });
    }
    const { start, end, text, color } = req.body;
    console.log('Validierung:', { start, end, text, color });
    if (!start || !text || !color) {
        return res.status(400).json({ message: 'Startzeit, Text und Farbe erforderlich' });
    }
    try {
        const db = await Database.getInstance();
        const newId = await db.addEvent(req.session.userId, start, end, text, color);
        res.status(201).json({ id: newId, message: 'Event hinzugefügt' });
    } catch (error) {
        console.error('Fehler beim Hinzufügen:', error);
        res.status(500).json({ message: 'Interner Serverfehler' });
    }
});

router.put('/events/:id', async (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({ message: 'Nicht autorisiert' });
    }
    const { id } = req.params;
    const { start, end, text, color } = req.body;
    try {
        const db = await Database.getInstance();
        await db.updateEvent(req.session.userId, id, start, end, text, color);
        res.status(200).json({ message: 'Event aktualisiert' });
    } catch (error) {
        console.error('Fehler beim Aktualisieren:', error);
        res.status(500).json({ message: 'Interner Serverfehler' });
    }
});

router.delete('/events/:id', async (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({ message: 'Nicht autorisiert' });
    }
    const { id } = req.params;
    try {
        const db = await Database.getInstance();
        await db.deleteEvent(req.session.userId, id);
        res.status(200).json({ message: 'Event gelöscht' });
    } catch (error) {
        console.error('Fehler beim Löschen:', error);
        res.status(500).json({ message: 'Interner Serverfehler' });
    }
});

// ──────────────────────────────
// MEINE FINANZEN BEREICH
// ──────────────────────────────

// Middleware: Nur eingeloggte User
const requireLogin = (req, res, next) => {
    if (!req.session.userId) {
        return res.status(401).json({ message: 'Nicht eingeloggt' });
    }
    next();
};

// Neue User zum Onboarding zwingen (nur GET-Seitenanfragen, nicht API-Calls)
router.use((req, res, next) => {
    if (req.method !== 'GET') return next();
    if (!req.session.userId || !req.session.isNewUser) return next();
    const skipPaths = ['/onboarding', '/login', '/logout', '/register', '/verify-email',
                       '/impressum', '/datenschutz', '/agb', '/startseite', '/stripe'];
    if (skipPaths.some(p => req.path.startsWith(p))) return next();
    // API-artige Pfade überspringen (enthalten Dateiendungen oder bekannte API-Segmente)
    if (req.path.includes('.')) return next();
    return res.redirect('/users/onboarding');
});

// ══════════════════════════════════════════════════════════════════
// ── IN-APP NOTIFICATIONS ──────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════

router.get('/pending-deletes', requireLogin, async (req, res) => {
    try {
        const db = await Database.getInstance();
        const userId = await db.getUserIdByName(req.session.username);
        if (userId === -1) return res.json([]);
        const pending = await db.getAndCleanPendingDeletes(userId);
        res.json(pending);
    } catch (err) { res.json([]); }
});

router.post('/transactions/:id/pending-delete', requireLogin, async (req, res) => {
    try {
        const db = await Database.getInstance();
        const userId = await db.getUserIdByName(req.session.username);
        if (userId === -1) return res.status(404).json({ message: 'Benutzer nicht gefunden' });
        await db.setPendingDelete(userId, req.params.id);
        res.json({ ok: true });
    } catch (err) { res.status(500).json({ message: err.message }); }
});

router.post('/transactions/:id/undo-delete', requireLogin, async (req, res) => {
    try {
        const db = await Database.getInstance();
        const userId = await db.getUserIdByName(req.session.username);
        if (userId === -1) return res.status(404).json({ message: 'Benutzer nicht gefunden' });
        await db.undoPendingDelete(userId, req.params.id);
        res.json({ ok: true });
    } catch (err) { res.status(500).json({ message: err.message }); }
});

router.get('/notifications', requireLogin, async (req, res) => {
    try {
        const db = await Database.getInstance();
        await db.generateNotifications(req.session.userId);
        const notifs = await db.getNotifications(req.session.userId);
        res.json(notifs);
    } catch (err) { res.json([]); }
});

router.post('/notifications/read-all', requireLogin, async (req, res) => {
    try {
        const db = await Database.getInstance();
        await db.markAllNotificationsRead(req.session.userId);
        res.json({ ok: true });
    } catch (err) { res.status(500).json({ message: err.message }); }
});

router.post('/notifications/:id/read', requireLogin, async (req, res) => {
    try {
        const db = await Database.getInstance();
        await db.markNotificationRead(req.session.userId, req.params.id);
        res.json({ ok: true });
    } catch (err) { res.status(500).json({ message: err.message }); }
});

// ══════════════════════════════════════════════════════════════════
// ── BULK TRANSACTION ACTIONS ──────────────────────────────────────
// ══════════════════════════════════════════════════════════════════

router.post('/transactions/bulk-delete', requireLogin, async (req, res) => {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ message: 'Keine IDs angegeben' });
    try {
        const db = await Database.getInstance();
        let deleted = 0;
        for (const id of ids) {
            const ok = await db.deleteTransaction(req.session.userId, id);
            if (ok) deleted++;
        }
        res.json({ deleted });
    } catch (err) { res.status(500).json({ message: err.message }); }
});

router.post('/transactions/bulk-categorize', requireLogin, async (req, res) => {
    const { ids, category } = req.body;
    if (!Array.isArray(ids) || ids.length === 0 || !category) return res.status(400).json({ message: 'Fehlende Parameter' });
    try {
        const db = await Database.getInstance();
        let updated = 0;
        for (const id of ids) {
            const tx = await db.getTransactionById(req.session.userId, id);
            if (tx) {
                await db.updateTransaction(req.session.userId, id, tx.name, category, tx.amount, tx.date.substring(0,10), tx.type, tx.account_id);
                updated++;
            }
        }
        res.json({ updated });
    } catch (err) { res.status(500).json({ message: err.message }); }
});

router.post('/transactions/bulk-update', requireLogin, async (req, res) => {
    const { ids, category, account_id, type } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ message: 'Keine IDs angegeben' });
    if (category === undefined && account_id === undefined && type === undefined)
        return res.status(400).json({ message: 'Mindestens ein Feld angeben' });
    try {
        const db = await Database.getInstance();
        let updated = 0;
        for (const id of ids) {
            const tx = await db.getTransactionById(req.session.userId, id);
            if (!tx) continue;
            await db.updateTransaction(
                req.session.userId, id,
                tx.name,
                category !== undefined ? category : tx.category,
                tx.amount,
                tx.date.substring(0, 10),
                type     !== undefined ? type     : tx.type,
                account_id !== undefined ? (account_id || null) : tx.account_id
            );
            updated++;
        }
        res.json({ updated });
    } catch (err) { res.status(500).json({ message: err.message }); }
});

router.post('/transactions/categorize-by-name', requireLogin, async (req, res) => {
    const { name, category } = req.body;
    if (!name || !category) return res.status(400).json({ message: 'Fehlende Parameter' });
    try {
        const db = await Database.getInstance();
        const txs = await db.getTransactionsForUser(req.session.userId);
        const nameLower = name.toLowerCase();
        const matching = txs.filter(tx => tx.name.toLowerCase() === nameLower);
        let updated = 0;
        for (const tx of matching) {
            await db.updateTransaction(req.session.userId, tx.id, tx.name, category, tx.amount, tx.date.substring(0, 10), tx.type, tx.account_id);
            updated++;
        }
        res.json({ updated });
    } catch (err) { res.status(500).json({ message: err.message }); }
});

// ── Umbuchung zwischen Konten ─────────────────────────────────
router.post('/transfer', requireLogin, async (req, res) => {
    try {
        const db = await Database.getInstance();
        const { from_account_id, from_source, to_account_id, to_source,
                to_haushalt_id, amount, date, name, notiz } = req.body;
        const txId = await db.addTransfer(req.session.userId, {
            from_account_id, from_source: from_source || 'privat',
            to_account_id,   to_source:   to_source   || 'privat',
            to_haushalt_id:  to_haushalt_id || null,
            amount, date, name, notiz,
        });
        res.json({ ok: true, txId });
    } catch (err) {
        console.error('Transfer-Fehler:', err);
        res.status(500).json({ message: err.message || 'Fehler beim Transfer' });
    }
});

router.delete('/transfer/:id', requireLogin, async (req, res) => {
    try {
        const db = await Database.getInstance();
        await db.deleteTransfer(req.session.userId, req.params.id);
        res.json({ ok: true });
    } catch (err) {
        console.error('Transfer-Löschen-Fehler:', err);
        res.status(500).json({ message: 'Fehler beim Löschen' });
    }
});

// ── Plan-Helper ───────────────────────────────────────────────

async function getUserPlan(userId) {
    const db = await Database.getInstance();
    return db.getUserPlan(userId);
}

// ── Tarif / Upgrade Routen ────────────────────────────────────

router.get('/tarife', requireLogin, async (req, res) => {
    const db = await Database.getInstance();
    const plan = await getUserPlan(req.session.userId);
    const trialInfo = await db.getTrialInfo(req.session.userId);
    const profile = await db.getUserProfile(req.session.userId);
    const reason = req.query.reason || null;
    const success = req.query.success || null;
    const error = req.query.error || null;
    const stripeEnabled = !!(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_PRICE_MONTHLY);
    const hasStripeCustomer = !!profile.stripe_customer_id;
    res.render('tarife', { isLoggedIn: true, currentPlan: plan, reason, trialInfo, success, error, stripeEnabled, hasStripeCustomer });
});

router.post('/upgrade', requireLogin, async (req, res) => {
    try {
        const { plan } = req.body;
        if (!['free', 'pro'].includes(plan)) return res.status(400).json({ message: 'Ungültiger Plan' });
        const db = await Database.getInstance();
        await db.setUserPlan(req.session.userId, plan);
        req.session.userPlan = plan;
        res.json({ success: true, plan });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// ── Stripe-Routen ─────────────────────────────────────────────

router.get('/stripe/checkout', requireLogin, async (req, res) => {
    if (!stripe || !process.env.STRIPE_PRICE_MONTHLY) {
        return res.redirect('/users/tarife?error=payment_unavailable');
    }
    const billing = req.query.billing === 'yearly' ? 'yearly' : 'monthly';
    const priceId = billing === 'yearly' ? process.env.STRIPE_PRICE_YEARLY : process.env.STRIPE_PRICE_MONTHLY;
    if (!priceId) return res.redirect('/users/tarife?error=payment_unavailable');

    const db = await Database.getInstance();
    const profile = await db.getUserProfile(req.session.userId);
    try {
        const sessionConfig = {
            mode: 'subscription',
            line_items: [{ price: priceId, quantity: 1 }],
            success_url: `${process.env.APP_URL || 'http://localhost:3001'}/users/stripe/success?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${process.env.APP_URL || 'http://localhost:3001'}/users/tarife`,
            metadata: { userId: String(req.session.userId) },
            subscription_data: { metadata: { userId: String(req.session.userId) } },
        };
        if (profile.stripe_customer_id) {
            sessionConfig.customer = profile.stripe_customer_id;
        } else {
            sessionConfig.customer_email = req.session.username;
        }
        const session = await stripe.checkout.sessions.create(sessionConfig);
        res.redirect(303, session.url);
    } catch (err) {
        console.error('[Stripe] Checkout error:', err.message);
        res.redirect('/users/tarife?error=payment_error');
    }
});

router.get('/stripe/success', requireLogin, async (req, res) => {
    res.redirect('/users/tarife?success=upgraded');
});

router.get('/stripe/portal', requireLogin, async (req, res) => {
    if (!stripe) return res.redirect('/users/tarife');
    const db = await Database.getInstance();
    const profile = await db.getUserProfile(req.session.userId);
    if (!profile.stripe_customer_id) return res.redirect('/users/tarife');
    try {
        const portalSession = await stripe.billingPortal.sessions.create({
            customer: profile.stripe_customer_id,
            return_url: `${process.env.APP_URL || 'http://localhost:3001'}/users/tarife`,
        });
        res.redirect(303, portalSession.url);
    } catch (err) {
        console.error('[Stripe] Portal error:', err.message);
        res.redirect('/users/tarife');
    }
});

router.post('/stripe/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
    if (!stripe || !process.env.STRIPE_WEBHOOK_SECRET) {
        return res.status(400).send('Stripe nicht konfiguriert');
    }
    const sig = req.headers['stripe-signature'];
    let event;
    try {
        event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
    } catch (err) {
        console.error('[Stripe] Webhook-Signatur-Fehler:', err.message);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }
    try {
        const db = await Database.getInstance();
        if (event.type === 'checkout.session.completed') {
            const session = event.data.object;
            const userId = parseInt(session.metadata?.userId);
            if (userId) {
                await db.setUserPlan(userId, 'pro');
                if (session.customer) await db.setStripeInfo(userId, { customerId: session.customer });
                if (session.subscription) await db.setStripeInfo(userId, { subscriptionId: session.subscription });
                console.log(`[Stripe] User ${userId} auf Pro upgraded`);
            }
        } else if (event.type === 'customer.subscription.deleted') {
            const subscription = event.data.object;
            const userId = parseInt(subscription.metadata?.userId);
            if (userId) {
                await db.setUserPlan(userId, 'free');
                console.log(`[Stripe] User ${userId} Abo beendet → Free`);
            }
        } else if (event.type === 'invoice.payment_failed') {
            console.warn('[Stripe] Zahlung fehlgeschlagen:', event.data.object.customer);
        }
    } catch (err) {
        console.error('[Stripe] Webhook-Verarbeitung fehlgeschlagen:', err);
    }
    res.json({ received: true });
});

router.get('/me/plan', requireLogin, async (req, res) => {
    try {
        const plan = await getUserPlan(req.session.userId);
        res.json({ plan });
    } catch { res.json({ plan: 'free' }); }
});

// ── Sidebar-Modus (serverseitig per Session) ───────────────────
router.get('/me/mode', requireLogin, (req, res) => {
    res.json({ mode: req.session.sidebar_mode || 'privat' });
});

router.post('/me/mode', requireLogin, (req, res) => {
    const { mode } = req.body;
    if (mode === 'privat' || mode === 'haushalt') {
        req.session.sidebar_mode = mode;
    }
    res.json({ mode: req.session.sidebar_mode || 'privat' });
});


router.get('/analysen/data', requireLogin, async (req, res) => {
    try {
        const db = await Database.getInstance();
        res.json(await db.getAnalysen(req.session.userId));
    } catch { res.json([]); }
});

router.post('/analysen/add', requireLogin, async (req, res) => {
    const { image, title, shortDesc, longDesc } = req.body;
    if (!title || !image) return res.status(400).json({ message: 'Titel und Bild erforderlich' });
    try {
        const db = await Database.getInstance();
        const id = await db.addAnalyse(req.session.userId, title, shortDesc || '', longDesc || '', image);
        res.status(201).json({ id, message: 'Analyse gespeichert' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Interner Serverfehler' });
    }
});

router.delete('/analysen/delete/:id', requireLogin, async (req, res) => {
    try {
        const db = await Database.getInstance();
        await db.deleteAnalyse(req.session.userId, req.params.id);
        res.json({ message: 'Analyse gelöscht' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Interner Serverfehler' });
    }
});

// Detailseite für eine einzelne Analyse
router.get('/analysen/:id', requireLogin, (req, res) => {
    res.render('analyse-detail', { isLoggedIn: true });
});

// API: einzelne Analyse laden
router.get('/analysen/:id/data', requireLogin, async (req, res) => {
    try {
        const db = await Database.getInstance();
        const rows = await db._database.query(
            'SELECT id, title, short_desc, long_desc, image FROM analysen WHERE id = ? AND user_id = ?',
            { replacements: [req.params.id, req.session.userId], type: (await import('sequelize')).Sequelize.QueryTypes.SELECT }
        );
        if (!rows.length) return res.status(404).json({ message: 'Nicht gefunden' });
        res.json(rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Fehler' });
    }
});

// Seite: Konten (ehemals meine-finanzen)
router.get('/konten', requireLogin, (req, res) => {
    res.render('konten');
});
// Legacy-Redirect
router.get('/meine-finanzen', (req, res) => {
    res.redirect(301, '/users/konten');
});

// ── Konto & Einstellungen (unified entry point) ─────────────────
router.get('/konto', requireLogin, (req, res) => {
    res.redirect(302, '/users/profil');
});

router.get('/konto/:id', requireLogin, (req, res) => {
    res.render('konto-detail', { isLoggedIn: true });
});

// API: Zusammenfassung laden
router.get('/finanzen/zusammenfassung', requireLogin, async (req, res) => {
    const db = await Database.getInstance();
    const data = await db.getFinanzenZusammenfassung(req.session.userId);
    res.json(data);
});

// API: Alle Ausgaben laden
router.get('/finanzen/ausgaben', requireLogin, async (req, res) => {
    const db = await Database.getInstance();
    const data = await db.getMonatlicheAusgaben(req.session.userId);
    res.json(data);
});

// API: Investments laden
router.get('/finanzen/investments', requireLogin, async (req, res) => {
    const db = await Database.getInstance();
    const data = await db.getFinanzenInvestments(req.session.userId);
    res.json(data);
});

// ====================== FEHLENDE ROUTEN HINZUFÜGEN ======================

// 1. Fixkosten laden
// Neue Version (die du jetzt hast – rendert HTML!)
router.get('/fixkosten', requireLogin, (req, res) => {
    res.render('fixkosten', { isLoggedIn: true });
});

// 2. Initialwerte laden
router.get('/initialwerte', requireLogin, async (req, res) => {
    try {
        const db = await Database.getInstance();
        const initial = await db.getInitialwerte(req.session.userId);
        res.json(initial);
    } catch (err) {
        console.error(err);
        res.status(500).json({ sparkonto_initial: 0, girokonto_initial: 0, bargeld_initial: 300 });
    }
});

// 3. Manuelle Einträge laden
router.get('/manuelle-eintraege', requireLogin, async (req, res) => {
    try {
        const db = await Database.getInstance();
        const manuelle = await db.getManuelleEintraege(req.session.userId);
        res.json(manuelle || []);
    } catch (err) {
        console.error(err);
        res.status(500).json([]);
    }
});

// Fixkosten hinzufügen
router.post('/fixkosten/add', requireLogin, async (req, res) => {
    const { name, betrag, datum_tag, haeufigkeit, kategorie } = req.body;
    try {
        const db = await Database.getInstance();
        await db.addFixkost(req.session.userId, name, parseFloat(betrag), parseInt(datum_tag), haeufigkeit, kategorie);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false });
    }
});

// Initialwerte speichern
router.post('/initialwerte', requireLogin, async (req, res) => {
    const { sparkonto_initial, girokonto_initial, bargeld_initial } = req.body;
    try {
        const db = await Database.getInstance();
        await db.setInitialwerte(req.session.userId,
            parseFloat(sparkonto_initial) || 0,
            parseFloat(girokonto_initial) || 0,
            parseFloat(bargeld_initial) || 300
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false });
    }
});

// Manuelle Einträge
router.post('/manuelle-eintraege', requireLogin, async (req, res) => {
    const { monat, spalte_name, wert } = req.body;
    try {
        const db = await Database.getInstance();
        await db.addManuelleEintrag(req.session.userId, monat, spalte_name, parseFloat(wert));
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false });
    }
});

// ── Transaktion bearbeiten ─────────────────────────────────────
router.put('/updateTransaction/:id', async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ message: 'Nicht autorisiert' });
    const { name, category, amount, date, type, account_id } = req.body;
    if (!name || !category || !amount || !date || !type)
        return res.status(400).json({ message: 'Alle Felder müssen ausgefüllt sein.' });
    try {
        const db = await Database.getInstance();
        const vorher = await db.getTransactionById(req.session.userId, req.params.id);
        await db.updateTransaction(req.session.userId, req.params.id, name, category, parseFloat(amount), date, type, account_id || null);
        if (vorher) {
            db.logActivity(req.session.userId, 'bearbeitet', 'Transaktion', parseInt(req.params.id), {
                vorher: { name: vorher.name, amount: vorher.amount, category: vorher.category, type: vorher.type },
                nachher: { name, amount: parseFloat(amount), category, type }
            });
        }
        res.json({ message: 'Transaktion aktualisiert' });
    } catch (err) { res.status(500).json({ message: 'Interner Serverfehler' }); }
});

// ── Kategorie umbenennen ───────────────────────────────────────
router.put('/categories/update', async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ message: 'Nicht autorisiert' });
    const { oldName, newName } = req.body;
    if (!oldName || !newName) return res.status(400).json({ message: 'Felder erforderlich' });
    try {
        const db = await Database.getInstance();
        const cats = await db.getCategories(req.session.userId);
        const cat = cats.find(c => c.name === oldName);
        if (!cat) return res.status(404).json({ message: 'Nicht gefunden' });
        await db.updateCategory(req.session.userId, cat.id, newName);
        res.json({ message: 'Kategorie aktualisiert' });
    } catch (err) { res.status(500).json({ message: 'Interner Serverfehler' }); }
});

// ── Fixkosten bearbeiten + löschen ─────────────────────────────
router.put('/fixkosten/:id', requireLogin, async (req, res) => {
    const { name, betrag, datum_tag, haeufigkeit, kategorie, account_id } = req.body;
    try {
        const db = await Database.getInstance();
        await db.updateFixkost(req.session.userId, req.params.id, name, parseFloat(betrag), parseInt(datum_tag), haeufigkeit, kategorie);
        // account_id separat setzen falls vorhanden
        if (account_id !== undefined) {
            await db._database.query(
                'UPDATE fixkosten SET account_id=? WHERE id=? AND user_id=?',
                { replacements: [account_id || null, req.params.id, req.session.userId], type: (await import('sequelize')).Sequelize.QueryTypes.UPDATE }
            );
        }
        res.json({ message: 'Fixkosten aktualisiert' });
    } catch (err) { res.status(500).json({ message: 'Interner Serverfehler' }); }
});

router.delete('/fixkosten/:id', requireLogin, async (req, res) => {
    try {
        const db = await Database.getInstance();
        await db.deleteFixkost(req.session.userId, req.params.id);
        res.json({ message: 'Fixkosten gelöscht' });
    } catch (err) { res.status(500).json({ message: 'Interner Serverfehler' }); }
});

// ── Konten ─────────────────────────────────────────────────────
router.get('/accounts', requireLogin, async (req, res) => {
    try {
        const db = await Database.getInstance();
        const showArchived = req.query.showArchived === 'true';
        res.json(await db.getAccountsWithBalance(req.session.userId, { showArchived }));
    } catch (err) {
        console.error('GET /accounts error:', err.message);
        res.status(500).json({ message: 'Fehler beim Laden', detail: err.message });
    }
});

// Kombinierte Konten: privat + Haushalt — für Transfer-Dropdowns
router.get('/accounts/all', requireLogin, async (req, res) => {
    try {
        const db = await Database.getInstance();
        const privat = await db.getAccountsWithBalance(req.session.userId);
        const privatMapped = privat.map(a => ({ ...a, _source: 'privat', _haushalt_id: null }));

        const haushalt = await db.getHaushaltForUser(req.session.userId);
        let hausMapped = [];
        if (haushalt) {
            const hausKonten = await db.getHaushaltKonten(haushalt.id);
            hausMapped = hausKonten.map(k => ({
                ...k,
                _source:      'haushalt',
                _haushalt_id: haushalt.id,
                // Felder angleichen damit Frontend einheitlich arbeiten kann
                color:  k.color || '#10b981',
                type:   'haushaltskonto',
            }));
        }
        res.json([...privatMapped, ...hausMapped]);
    } catch (err) { res.status(500).json({ message: 'Fehler beim Laden' }); }
});

router.post('/accounts/add', requireLogin, async (req, res) => {
    const { name, type, balance, color, icon } = req.body;
    if (!name || !type) return res.status(400).json({ message: 'Name und Typ erforderlich' });
    try {
        const db = await Database.getInstance();
        // Free-Tarif: max. 3 Konten
        const plan = await db.getUserPlan(req.session.userId);
        if (plan === 'free') {
            const existing = await db.getAccountsWithBalance(req.session.userId);
            if (existing.length >= 3) {
                return res.status(403).json({ limitReached: true, message: 'Im Free-Tarif sind maximal 3 Konten erlaubt.' });
            }
        }
        const id = await db.addAccount(req.session.userId, name, type, parseFloat(balance)||0, color||'#6358e6', icon||'ri-bank-line');
        db.logActivity(req.session.userId, 'erstellt', 'Konto', id, { name, type });
        res.status(201).json({ message: 'Konto hinzugefügt', id });
    } catch (err) { res.status(500).json({ message: 'Fehler' }); }
});

router.put('/accounts/:id', requireLogin, async (req, res) => {
    const { name, type, balance, color, icon } = req.body;
    try {
        const db = await Database.getInstance();
        await db.updateAccount(req.session.userId, req.params.id, name, type, parseFloat(balance)||0, color, icon);
        db.logActivity(req.session.userId, 'geändert', 'Konto', parseInt(req.params.id), { name, type });
        res.json({ message: 'Konto aktualisiert' });
    } catch (err) { res.status(500).json({ message: 'Fehler' }); }
});

// Setzt den Startbetrag so, dass currentBalance == targetBalance
router.post('/accounts/:id/set-balance', requireLogin, async (req, res) => {
    const { targetBalance } = req.body;
    if (targetBalance === undefined || isNaN(parseFloat(targetBalance))) {
        return res.status(400).json({ message: 'targetBalance fehlt' });
    }
    try {
        const db = await Database.getInstance();
        const userId = req.session.userId;
        const accountId = parseInt(req.params.id);
        // Verify account belongs to user
        const accounts = await db.getAccountsWithBalance(userId);
        const acc = accounts.find(a => a.id === accountId);
        if (!acc) return res.status(404).json({ message: 'Konto nicht gefunden' });
        // currentBalance = balance + delta  →  new balance = targetBalance - delta
        const delta = acc.currentBalance - acc.balance;
        const newStartBalance = parseFloat(targetBalance) - delta;
        await db.updateAccount(userId, accountId, acc.name, acc.type, newStartBalance, acc.color, acc.icon);
        db.logActivity(userId, 'geändert', 'Konto', accountId, { balance_adjusted_to: parseFloat(targetBalance) });
        res.json({ message: 'Kontostand angepasst', newStartBalance, currentBalance: parseFloat(targetBalance) });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Fehler beim Anpassen' });
    }
});

router.patch('/accounts/:id/archive', requireLogin, async (req, res) => {
    try {
        const db = await Database.getInstance();
        await db.archiveAccount(req.session.userId, req.params.id, 1);
        db.logActivity(req.session.userId, 'archiviert', 'Konto', parseInt(req.params.id), {});
        res.json({ message: 'Konto archiviert' });
    } catch (err) { res.status(500).json({ message: 'Fehler' }); }
});

router.patch('/accounts/:id/unarchive', requireLogin, async (req, res) => {
    try {
        const db = await Database.getInstance();
        await db.archiveAccount(req.session.userId, req.params.id, 0);
        db.logActivity(req.session.userId, 'wiederhergestellt', 'Konto', parseInt(req.params.id), {});
        res.json({ message: 'Konto wiederhergestellt' });
    } catch (err) { res.status(500).json({ message: 'Fehler' }); }
});

router.delete('/accounts/:id', requireLogin, async (req, res) => {
    try {
        const db = await Database.getInstance();
        const force = req.query.force === 'true';
        if (!force) {
            const txCount = await db.getAccountTransactionCount(req.session.userId, req.params.id);
            if (txCount > 0) {
                return res.status(409).json({ message: `Konto hat ${txCount} Transaktion(en) und kann nicht gelöscht werden. Bitte zuerst archivieren.`, hasTransactions: true });
            }
        }
        const allAccounts = await db.getAccountsWithBalance(req.session.userId, { showArchived: true });
        const acc = allAccounts.find(a => a.id == req.params.id);
        await db.deleteAccount(req.session.userId, req.params.id);
        if (acc) db.logActivity(req.session.userId, 'gelöscht', 'Konto', parseInt(req.params.id), { name: acc.name });
        res.json({ message: 'Konto gelöscht' });
    } catch (err) { res.status(500).json({ message: 'Fehler' }); }
});

router.get('/accounts/:id/transactions', requireLogin, async (req, res) => {
    try {
        const db = await Database.getInstance();
        const txs = await db.getTransactionsForAccount(req.session.userId, req.params.id);
        res.json(txs.map(t => ({ ...t, type: (t.type==='outbound'||t.type==='Ausgaben') ? 'Ausgaben' : 'Einnahmen' })));
    } catch (err) { res.status(500).json({ message: 'Fehler' }); }
});

// ── Kontostand-Abgleich ──────────────────────────────────────────
router.post('/accounts/:id/abgleich', requireLogin, async (req, res) => {
    const accountId = parseInt(req.params.id);
    const { echter_stand } = req.body;
    if (echter_stand === undefined || echter_stand === null || isNaN(parseFloat(echter_stand))) {
        return res.status(400).json({ message: 'Echter Kontostand erforderlich' });
    }
    try {
        const db     = await Database.getInstance();
        const userId = req.session.userId;

        const accounts = await db.getAccountsWithBalance(userId);
        const account  = accounts.find(a => a.id === accountId);
        if (!account) return res.status(404).json({ message: 'Konto nicht gefunden' });

        const berechnet = account.currentBalance;
        const echt      = parseFloat(parseFloat(echter_stand).toFixed(2));
        const differenz = parseFloat((echt - berechnet).toFixed(2));

        if (differenz === 0) {
            return res.json({ message: 'Kontostand ist bereits korrekt', differenz: 0, transactionId: null });
        }

        const typ   = differenz > 0 ? 'Einnahmen' : 'Ausgaben';
        const heute = new Date().toISOString().substring(0, 10);
        const name  = `Kontostandskorrektur: ${account.name}`;

        const txId = await db.createTransaction(
            userId, name, 'Kontostandskorrektur', heute,
            Math.abs(differenz), typ, accountId
        );

        res.json({ message: 'Korrekturbuchung angelegt', differenz, transactionId: txId, typ });
    } catch (err) {
        console.error('Abgleich-Fehler:', err);
        res.status(500).json({ message: 'Fehler beim Abgleich' });
    }
});

// ── Analysen ───────────────────────────────────────────────────
router.get('/analysen/list', requireLogin, async (req, res) => {
    try {
        const db = await Database.getInstance();
        const analysen = await db._database.query(
            'SELECT id, title, short_desc, long_desc, image FROM analysen WHERE user_id = ? ORDER BY id DESC',
            { replacements: [req.session.userId], type: (await import('sequelize')).Sequelize.QueryTypes.SELECT }
        );
        res.json(analysen);
    } catch (err) { res.status(500).json([]); }
});

// ── Profil-Seite ────────────────────────────────────────────────
router.get('/profil', requireLogin, (req, res) => {
    res.render('profil', { isLoggedIn: true });
});

// API: Profildaten laden
router.get('/profil/data', requireLogin, async (req, res) => {
    try {
        const db = await Database.getInstance();
        const [profile, email] = await Promise.all([
            db.getUserProfile(req.session.userId),
            db.getUserEmail(req.session.userId)
        ]);
        res.json({ ...profile, email });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Fehler beim Laden' });
    }
});

// API: Profil aktualisieren
router.put('/profil/update', requireLogin, async (req, res) => {
    const { display_name, avatar_url, tarif } = req.body;
    try {
        const db = await Database.getInstance();
        await db.upsertUserProfile(req.session.userId, { display_name, avatar_url, tarif });
        res.json({ message: 'Profil aktualisiert' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Fehler beim Aktualisieren' });
    }
});

// API: E-Mail ändern
router.put('/profil/email', requireLogin, async (req, res) => {
    const { newEmail } = req.body;
    if (!newEmail) return res.status(400).json({ message: 'E-Mail erforderlich' });
    try {
        const db = await Database.getInstance();
        await db.updateUserEmail(req.session.userId, newEmail);
        req.session.username = newEmail; // Session aktualisieren
        res.json({ message: 'E-Mail aktualisiert' });
    } catch (err) {
        console.error(err);
        res.status(400).json({ message: err.message || 'Fehler' });
    }
});

// API: Passwort ändern
router.put('/profil/password', requireLogin, async (req, res) => {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) return res.status(400).json({ message: 'Alle Felder erforderlich' });
    if (newPassword.length < 8) return res.status(400).json({ message: 'Passwort muss mindestens 8 Zeichen lang sein' });
    if (!/[A-Z]/.test(newPassword)) return res.status(400).json({ message: 'Passwort muss mindestens einen Großbuchstaben enthalten' });
    if (!/[0-9!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(newPassword)) return res.status(400).json({ message: 'Passwort muss mindestens eine Zahl oder ein Sonderzeichen enthalten' });
    try {
        const db = await Database.getInstance();
        await db.updateUserPassword(req.session.userId, currentPassword, newPassword);
        res.json({ message: 'Passwort geändert' });
    } catch (err) {
        console.error(err);
        res.status(400).json({ message: err.message || 'Fehler' });
    }
});

// ── Konto löschen ───────────────────────────────────────────────
router.delete('/account', requireLogin, async (req, res) => {
    const userId = req.session.userId;
    try {
        const db = await Database.getInstance();
        const { Sequelize: Seq } = await import('sequelize');
        const tables = [
            'ausgabenDB', 'accounts', 'user_profiles', 'user_settings',
            'analysen', 'dokumente', 'recurring_transactions', 'reminder_log',
            'budgets', 'sparziele', 'kategorisierungs_regeln', 'activity_log',
            'abos', 'notizen', 'gewohnheiten', 'ziele', 'notifications',
            'steuer_werbungskosten', 'steuer_assistent', 'steuer_kapitalertraege',
            'steuer_sonderausgaben', 'steuer_altersvorsorge', 'outlook_tokens',
            'finanzen_investments', 'schulden_zahlungen'
        ];
        for (const table of tables) {
            try {
                await db._database.query(`DELETE FROM ${table} WHERE user_id = :uid`, {
                    replacements: { uid: userId },
                    type: Seq.QueryTypes.DELETE
                });
            } catch (e) { /* Tabelle existiert nicht oder kein user_id-Feld – ignorieren */ }
        }
        // Haushalt-Mitgliedschaft entfernen
        try {
            await db._database.query(`DELETE FROM haushalt_mitglieder WHERE user_id = :uid`, {
                replacements: { uid: userId }, type: Seq.QueryTypes.DELETE
            });
        } catch (e) {}
        // Benutzer selbst löschen
        await db._database.query(`DELETE FROM users WHERE id = :uid`, {
            replacements: { uid: userId }, type: Seq.QueryTypes.DELETE
        });
        req.session.destroy();
        res.json({ ok: true });
    } catch (err) {
        console.error('deleteAccount:', err);
        res.status(500).json({ message: 'Fehler beim Löschen des Kontos' });
    }
});

// ── Einstellungen-Seite ─────────────────────────────────────────
router.get('/einstellungen', requireLogin, (req, res) => {
    res.render('einstellungen', { isLoggedIn: true });
});

// ── CSV-Import ───────────────────────────────────────────────────
router.get('/haushalt/import', requireLogin, async (req, res) => {
    try {
        const db = await Database.getInstance();
        const haushalt = await db.getHaushaltForUser(req.session.userId);
        const konten = haushalt ? await db.getHaushaltKonten(haushalt.id) : [];
        res.render('import', { isLoggedIn: true, konten, mode: 'haushalt' });
    } catch (err) {
        res.render('import', { isLoggedIn: true, konten: [], mode: 'haushalt' });
    }
});

router.post('/haushalt/import/transactions', requireLogin, async (req, res) => {
    const { transactions } = req.body;
    if (!Array.isArray(transactions) || transactions.length === 0)
        return res.status(400).json({ message: 'Keine Transaktionen übergeben' });

    const ALLOWED = ['date', 'amount', 'type', 'name', 'notes', 'account_id'];
    const clean = transactions.map(tx =>
        Object.fromEntries(ALLOWED.map(k => [k, tx[k]]).filter(([, v]) => v !== undefined))
    );

    try {
        const db = await Database.getInstance();
        const haushalt = await db.getHaushaltForUser(req.session.userId);
        if (!haushalt) return res.status(404).json({ message: 'Kein Haushalt' });

        // Build duplicate hash set from existing haushalt transactions
        const existing = await db.getHaushaltTransaktionen(haushalt.id);
        const txHash = (t) => `${t.name}|${t.date}|${parseFloat(t.amount).toFixed(2)}|${(t.notiz || '').trim()}`;
        const existingHashes = new Set(existing.map(txHash));

        let imported = 0, duplicates = 0;

        for (const tx of clean) {
            if (!tx.name || !tx.date) continue;
            const amount = Math.abs(parseFloat(tx.amount)) || 0;
            const hash = `${tx.name}|${tx.date}|${amount.toFixed(2)}|${(tx.notes || '').trim()}`;
            if (existingHashes.has(hash)) { duplicates++; continue; }
            existingHashes.add(hash); // prevent duplicates within the same import batch

            const txType = tx.type || 'Ausgaben';
            const applied = await db.applyRegeln(req.session.userId, tx.name + ' ' + (tx.notes || ''), null, txType, 'haushalt');
            const finalCategory = applied.category || 'Sonstiges';
            const finalType = applied.type || txType;

            await db.addHaushaltTransaktion(haushalt.id, req.session.userId, {
                name: tx.name, category: finalCategory, amount,
                type: finalType, date: tx.date,
                notiz: tx.notes || '', konto_id: tx.account_id || null,
                anteil_user1: 50, anteil_user2: 50
            });
            imported++;
        }
        res.json({ imported, duplicates, message: `${imported} importiert${duplicates > 0 ? `, ${duplicates} Duplikat(e) übersprungen` : ''}` });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Fehler beim Import' });
    }
});

router.get('/import', requireLogin, async (req, res) => {
    try {
        const db = await Database.getInstance();
        const konten = await db.getAccountsWithBalance(req.session.userId);
        res.render('import', { isLoggedIn: true, konten, mode: 'privat' });
    } catch (err) {
        console.error('GET /import error:', err.message);
        res.render('import', { isLoggedIn: true, konten: [], mode: 'privat' });
    }
});

router.post('/import/transactions', requireLogin, async (req, res) => {
    const { transactions } = req.body;
    if (!Array.isArray(transactions) || transactions.length === 0) {
        return res.status(400).json({ message: 'Keine Transaktionen übergeben' });
    }
    // Privacy: whitelist — only these fields are accepted, all others silently dropped
    const ALLOWED = ['date', 'amount', 'type', 'name', 'notes', 'account_id'];
    const clean = transactions.map(tx =>
        Object.fromEntries(ALLOWED.map(k => [k, tx[k]]).filter(([, v]) => v !== undefined))
    );

    try {
        const db = await Database.getInstance();
        const userId = req.session.userId;

        // Build duplicate hash set from existing transactions
        const existing = await db.getTransactionsForUser(userId);
        const txHash = (t) => `${t.name}|${t.date}|${parseFloat(t.amount).toFixed(2)}|${(t.notes || '').trim()}`;
        const existingHashes = new Set(existing.map(txHash));

        let imported = 0, duplicates = 0;

        for (const tx of clean) {
            if (!tx.name || !tx.date) continue;
            const amount = Math.abs(parseFloat(tx.amount)) || 0;
            const hash = `${tx.name}|${tx.date}|${amount.toFixed(2)}|${(tx.notes || '').trim()}`;
            if (existingHashes.has(hash)) { duplicates++; continue; }
            existingHashes.add(hash); // prevent duplicates within the same import batch

            // Server applies rules to set category (client preview is only for display)
            const txType = tx.type || 'Ausgaben';
            const applied = await db.applyRegeln(userId, tx.name + ' ' + (tx.notes || ''), null, txType, 'privat');
            const finalCategory = applied.category || 'Sonstiges';
            const finalType     = applied.type     || txType;

            await db.createTransaction(
                userId, tx.name, finalCategory, tx.date, amount, finalType,
                tx.account_id || null, tx.notes || ''
            );
            imported++;
        }
        if (imported > 0) {
            db.logActivity(userId, 'erstellt', 'Transaktion', null, { bulk_import: imported, quelle: 'CSV-Import' });
        }
        res.json({ imported, duplicates, message: `${imported} importiert${duplicates > 0 ? `, ${duplicates} Duplikat(e) übersprungen` : ''}` });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Fehler beim Import' });
    }
});

// ── Datenexport ──────────────────────────────────────────────────
router.get('/export', requireLogin, (req, res) => {
    res.render('export', { isLoggedIn: true });
});

router.get('/export/data', requireLogin, async (req, res) => {
    try {
        const db     = await Database.getInstance();
        const userId = req.session.userId;

        const [
            transaktionen,
            konten,
            sparziele,
            fixkosten,
            schulden,
            dokumente,
            versicherungen,
            todos,
            notizen,
            kategorien,
            budgets,
        ] = await Promise.all([
            db.getTransactionsForUser(userId),
            db.getAccountsWithBalance(userId),
            db.getSparziele(userId),
            db.getFixkosten(userId),
            db.getSchulden(userId),
            db.getDokumente(userId),       // ohne file_data (Binärdaten)
            db.getVersicherungen(userId),
            db.getTodosForUser(userId),
            db.getNotizen(userId),
            db.getCategories(userId),
            db.getBudgets(userId),
        ]);

        res.json({
            exportiert_am: new Date().toISOString(),
            version: '1.0',
            transaktionen,
            konten,
            sparziele,
            fixkosten,
            schulden,
            dokumente,   // Metadaten — kein Base64
            versicherungen,
            todos,
            notizen,
            kategorien,
            budgets,
        });
    } catch (err) {
        console.error('Export-Fehler:', err);
        res.status(500).json({ message: 'Fehler beim Exportieren' });
    }
});

router.get('/export/haushalt-data', requireLogin, async (req, res) => {
    try {
        const db       = await Database.getInstance();
        const userId   = req.session.userId;
        const haushalt = await db.getHaushaltForUser(userId);
        if (!haushalt) return res.json({
            exportiert_am: new Date().toISOString(),
            version: '1.0',
            haushalt_name: null,
            transaktionen: [], konten: [], fixkosten: [], todos: [], dokumente: [],
        });

        const [transaktionen, konten, fixkosten, todos, dokumente] = await Promise.all([
            db.getHaushaltTransaktionen(haushalt.id),
            db.getHaushaltKonten(haushalt.id),
            db.getHaushaltFixkosten(haushalt.id).catch(() => []),
            db.getHaushaltTodos(haushalt.id).catch(() => []),
            db.getHaushaltDokumente(haushalt.id).catch(() => []),
        ]);

        res.json({
            exportiert_am: new Date().toISOString(),
            version: '1.0',
            haushalt_name: haushalt.name,
            transaktionen,
            konten,
            fixkosten,
            todos,
            dokumente,
        });
    } catch (err) {
        console.error('Haushalt-Export-Fehler:', err);
        res.status(500).json({ message: 'Fehler beim Laden der Haushalt-Exportdaten' });
    }
});
router.get('/einstellungen/data', requireLogin, async (req, res) => {
    try {
        const db = await Database.getInstance();
        const settings = await db.getUserSettings(req.session.userId);
        res.json(settings);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Fehler beim Laden' });
    }
});

// API: Einstellungen speichern
router.put('/einstellungen/update', requireLogin, async (req, res) => {
    try {
        const db = await Database.getInstance();
        await db.upsertUserSettings(req.session.userId, req.body);
        res.json({ message: 'Einstellungen gespeichert' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Fehler beim Speichern' });
    }
});

// ── 2FA / TOTP ────────────────────────────────────────────────

// Schritt 1: Secret generieren + QR-Code-URL zurückgeben
router.post('/2fa/setup', requireLogin, async (req, res) => {
    try {
        const db      = await Database.getInstance();
        const userId  = req.session.userId;
        const email   = await db.getUserEmail(userId);
        const secret  = totpGenerateSecret();
        const codes   = generateBackupCodes(8);
        // Secret temporär in Session speichern bis bestätigt
        req.session.pending2faSecret = secret;
        req.session.pending2faCodes  = codes;
        const otpauthUrl = totpOtpAuthUrl(secret, email);
        res.json({ secret, otpauthUrl, backupCodes: codes });
    } catch (err) {
        console.error(err); res.status(500).json({ message: 'Fehler beim Setup' });
    }
});

// Schritt 2: Code bestätigen → 2FA aktivieren
router.post('/2fa/enable', requireLogin, async (req, res) => {
    const { code } = req.body;
    const secret   = req.session.pending2faSecret;
    const codes    = req.session.pending2faCodes;
    if (!secret) return res.status(400).json({ message: 'Kein Setup-Prozess aktiv. Bitte neu starten.' });
    if (!totpVerify(secret, code)) return res.status(400).json({ message: 'Ungültiger Code. Bitte versuche es erneut.' });
    try {
        const db = await Database.getInstance();
        await db.setTotpSecret(req.session.userId, secret, codes);
        await db.enableTotp(req.session.userId);
        req.session.pending2faSecret = null;
        req.session.pending2faCodes  = null;
        res.json({ message: '2FA aktiviert', backupCodes: codes });
    } catch (err) {
        console.error(err); res.status(500).json({ message: 'Fehler beim Aktivieren' });
    }
});

// 2FA deaktivieren (mit Passwort-Bestätigung)
router.post('/2fa/disable', requireLogin, async (req, res) => {
    const { password } = req.body;
    try {
        const db    = await Database.getInstance();
        const email = await db.getUserEmail(req.session.userId);
        const valid = await db.validateUser(email, password);
        if (!valid) return res.status(401).json({ message: 'Passwort falsch' });
        await db.disableTotp(req.session.userId);
        res.json({ message: '2FA deaktiviert' });
    } catch (err) {
        console.error(err); res.status(500).json({ message: 'Fehler beim Deaktivieren' });
    }
});

// Status abfragen
router.get('/2fa/status', requireLogin, async (req, res) => {
    try {
        const db       = await Database.getInstance();
        const settings = await db.getUserSettings(req.session.userId);
        res.json({ enabled: !!(settings?.two_factor && settings?.totp_secret) });
    } catch (err) {
        res.json({ enabled: false });
    }
});

// ── Outlook ────────────────────────────────────────────────────
const MS_CLIENT_ID     = process.env.MICROSOFT_CLIENT_ID     || '';
const MS_CLIENT_SECRET = process.env.MICROSOFT_CLIENT_SECRET || '';
const MS_REDIRECT_URI  = process.env.MICROSOFT_REDIRECT_URI  || 'http://localhost:3001/users/outlook/callback';

router.get('/outlook/connect', (req, res) => {
    if (!req.session.userId) return res.status(401).json({ message: 'Nicht autorisiert' });
    const p = new URLSearchParams({ client_id: MS_CLIENT_ID, response_type: 'code', redirect_uri: MS_REDIRECT_URI, response_mode: 'query', scope: 'Calendars.Read offline_access', state: String(req.session.userId) });
    res.redirect(`https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${p}`);
});

router.get('/outlook/callback', async (req, res) => {
    const { code } = req.query;
    if (!code) return res.redirect('/users/kalender?outlook=error');
    try {
        const r = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', { method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'}, body: new URLSearchParams({ client_id: MS_CLIENT_ID, client_secret: MS_CLIENT_SECRET, code, redirect_uri: MS_REDIRECT_URI, grant_type: 'authorization_code' }) });
        const t = await r.json();
        if (!t.access_token) throw new Error('Kein Token');
        const db = await Database.getInstance();
        await db.saveOutlookTokens(req.session.userId, t.access_token, t.refresh_token, t.expires_in);
        res.redirect('/users/kalender?outlook=connected');
    } catch (err) { res.redirect('/users/kalender?outlook=error'); }
});

router.get('/outlook/disconnect', async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ message: 'Nicht autorisiert' });
    const db = await Database.getInstance();
    await db.removeOutlookTokens(req.session.userId);
    res.json({ message: 'Outlook getrennt' });
});

router.get('/outlook/events', async (req, res) => {
    if (!req.session.userId) return res.json({ connected: false, events: [] });
    try {
        const db = await Database.getInstance();
        let tokens = await db.getOutlookTokens(req.session.userId);
        if (!tokens?.accessToken) return res.json({ connected: false, events: [] });
        let { accessToken, refreshToken, expiry } = tokens;
        if (Date.now() > expiry - 60000) {
            const r = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', { method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'}, body: new URLSearchParams({ client_id: MS_CLIENT_ID, client_secret: MS_CLIENT_SECRET, refresh_token: refreshToken, grant_type: 'refresh_token' }) });
            const ref = await r.json();
            if (ref.access_token) { accessToken = ref.access_token; await db.saveOutlookTokens(req.session.userId, accessToken, ref.refresh_token||refreshToken, ref.expires_in); }
        }
        const now = new Date().toISOString(), later = new Date(Date.now()+60*24*60*60*1000).toISOString();
        const g = await fetch(`https://graph.microsoft.com/v1.0/me/calendarView?startDateTime=${now}&endDateTime=${later}&$select=subject,start,end&$orderby=start/dateTime&$top=50`, { headers: { Authorization: `Bearer ${accessToken}` } });
        const gd = await g.json();
        if (gd.error) throw new Error(gd.error.message);
        res.json({ connected: true, events: (gd.value||[]).map(e => ({ id: 'outlook_'+Buffer.from(e.id||'').toString('base64').substring(0,16), title: e.subject||'(kein Titel)', start: e.start?.dateTime??e.start?.date, end: e.end?.dateTime??e.end?.date, color: '#0078d4', source: 'outlook' })) });
    } catch (err) { res.json({ connected: false, events: [] }); }
});

router.get('/outlook/status', async (req, res) => {
    if (!req.session.userId) return res.json({ connected: false });
    try { const db = await Database.getInstance(); const t = await db.getOutlookTokens(req.session.userId); res.json({ connected: !!(t?.accessToken) }); }
    catch { res.json({ connected: false }); }
});


// ── Dokumentenportal ────────────────────────────────────────

// ── Dokumentenportal ────────────────────────────────────────

router.get('/dokumente', requireLogin, (req, res) => {
    res.render('dokumente', { isLoggedIn: true });
});

// API: Alle Dokumente laden — MUSS vor /:id/file stehen!
router.get('/dokumente/data', requireLogin, async (req, res) => {
    try {
        const db = await Database.getInstance();
        const docs = await db.getDokumente(req.session.userId);
        res.json(docs);
    } catch (err) {
        console.error(err);
        res.status(500).json([]);
    }
});

// API: Dokument hochladen — MUSS vor /:id Routen stehen!
router.post('/dokumente/add', requireLogin, dokUpload.single('file'), async (req, res) => {
    const { name, typ } = req.body;
    if (!name || !typ) return res.status(400).json({ message: 'Name und Typ erforderlich' });
    try {
        const db = await Database.getInstance();
        const fileData = req.file
            ? `uploads/user_${req.session.userId}/${req.file.filename}`
            : '';
        const fileExt  = req.file ? path.extname(req.file.originalname).toLowerCase().replace('.', '') : '';
        const fileMime = req.file ? req.file.mimetype : '';
        const id = await db.addDokument(req.session.userId, { ...req.body, file_data: fileData, file_ext: fileExt, file_mime: fileMime });
        res.status(201).json({ id, message: 'Dokument gespeichert' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Interner Serverfehler' });
    }
});

// API: Dokument löschen — MUSS vor /:id Routen stehen!
router.delete('/dokumente/delete/:id', requireLogin, async (req, res) => {
    try {
        const db = await Database.getInstance();
        const doc = await db.getDokumentById(req.session.userId, req.params.id);
        if (doc?.file_data) {
            const filePath = path.join(__dirRoutes, '..', doc.file_data);
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        }
        await db.deleteDokument(req.session.userId, req.params.id);
        res.json({ message: 'Dokument gelöscht' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Fehler beim Löschen' });
    }
});

// API: Datei herunterladen / anzeigen — MUSS vor /:id/file stehen!
router.get('/dokumente/:id/download', requireLogin, async (req, res) => {
    try {
        const db = await Database.getInstance();
        const doc = await db.getDokumentById(req.session.userId, req.params.id);
        if (!doc || !doc.file_data) return res.status(404).json({ message: 'Keine Datei vorhanden' });
        const filePath = path.join(__dirRoutes, '..', doc.file_data);
        if (!fs.existsSync(filePath)) return res.status(404).json({ message: 'Datei nicht gefunden' });
        res.setHeader('Content-Disposition', `inline; filename="${path.basename(filePath)}"`);
        res.setHeader('Content-Type', doc.file_mime || 'application/octet-stream');
        res.sendFile(filePath);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Fehler' });
    }
});

// API: Status aktualisieren
router.patch('/dokumente/:id/status', requireLogin, async (req, res) => {
    const { status } = req.body;
    if (!status) return res.status(400).json({ message: 'Status erforderlich' });
    try {
        const db = await Database.getInstance();
        await db.updateDokumentStatus(req.session.userId, req.params.id, status);
        res.json({ message: 'Status aktualisiert' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Fehler' });
    }
});

// Seite: Dokument-Detailansicht — MUSS vor /:id/file stehen!
router.get('/dokumente/:id/detail', requireLogin, (req, res) => {
    res.render('dokument-detail', { isLoggedIn: true });
});

// API: Einzelnes Dokument mit file_data laden
router.get('/dokumente/:id/file', requireLogin, async (req, res) => {
    try {
        const db = await Database.getInstance();
        const doc = await db.getDokumentById(req.session.userId, req.params.id);
        if (!doc) return res.status(404).json({ message: 'Nicht gefunden' });
        res.json(doc);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Fehler' });
    }
});

// ── Versicherungen ──────────────────────────────────────────────
router.get('/versicherungen', requireLogin, (req, res) => {
    res.render('versicherungen', { isLoggedIn: true });
});

router.get('/versicherungen/data', requireLogin, async (req, res) => {
    try {
        const db   = await Database.getInstance();
        const data = await db.getVersicherungen(req.session.userId);
        res.json(data);
    } catch (err) {
        console.error(err);
        res.status(500).json([]);
    }
});

// ── Versicherung Detail-Seite ──────────────────────────────────
router.get('/versicherungen/:id/detail', requireLogin, (req, res) => {
    res.render('versicherung-detail', { isLoggedIn: true });
});

router.post('/versicherungen/add', requireLogin, async (req, res) => {
    const { name } = req.body;
    if (!name) return res.status(400).json({ message: 'Name erforderlich' });
    try {
        const db = await Database.getInstance();
        const id = await db.addVersicherung(req.session.userId, req.body);
        res.status(201).json({ id, message: 'Gespeichert' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Interner Fehler' });
    }
});

router.put('/versicherungen/:id', requireLogin, async (req, res) => {
    try {
        const db = await Database.getInstance();
        await db.updateVersicherung(req.session.userId, req.params.id, req.body);
        res.json({ message: 'Aktualisiert' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Fehler' });
    }
});

router.delete('/versicherungen/delete/:id', requireLogin, async (req, res) => {
    try {
        const db = await Database.getInstance();
        await db.deleteVersicherung(req.session.userId, req.params.id);
        res.json({ message: 'Gelöscht' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Fehler' });
    }
});

// ── Steuer-Modul ──────────────────────────────────────────────
router.get('/steuern', requireLogin, (req, res) => {
    res.render('steuern', { isLoggedIn: true });
});

// Jahresübersicht (wird client-seitig aus TX-Daten gebaut, aber Endpoint für spätere Erweiterung)
router.get('/steuer/jahresübersicht/:jahr', requireLogin, async (req, res) => {
    try {
        res.json({ jahr: req.params.jahr });
    } catch (err) {
        res.status(500).json({});
    }
});

// Steuer-relevante Transaktionen eines Jahres abrufen
router.get('/steuern/transaktionen/:jahr', requireLogin, async (req, res) => {
    try {
        const db   = await Database.getInstance();
        const jahr = parseInt(req.params.jahr);
        const rows = await db._database.query(
            `SELECT a.id, a.name, a.amount, a.date, a.type, a.steuer_relevant,
                    COALESCE(c.name, a.category) AS category
             FROM ausgabenDB a
             LEFT JOIN categories c ON c.id = a.category_id AND c.user_id = a.user_id
             WHERE a.user_id = ? AND a.steuer_relevant = 1
               AND strftime('%Y', a.date) = ?
             ORDER BY a.date DESC`,
            { replacements: [req.session.userId, String(jahr)], type: db._database.constructor.QueryTypes.SELECT }
        );
        res.json(rows);
    } catch (err) { res.status(500).json([]); }
});

// Steuer-Flag toggeln
router.patch('/transactions/:id/steuer-flag', requireLogin, async (req, res) => {
    try {
        const db  = await Database.getInstance();
        const row = await db._database.query(
            'SELECT steuer_relevant FROM ausgabenDB WHERE id=? AND user_id=?',
            { replacements: [req.params.id, req.session.userId], type: db._database.constructor.QueryTypes.SELECT }
        );
        if (!row.length) return res.status(404).json({ message: 'Nicht gefunden' });
        const newVal = row[0].steuer_relevant ? 0 : 1;
        await db._database.query(
            'UPDATE ausgabenDB SET steuer_relevant=? WHERE id=? AND user_id=?',
            { replacements: [newVal, req.params.id, req.session.userId], type: db._database.constructor.QueryTypes.UPDATE }
        );
        res.json({ steuer_relevant: newVal });
    } catch (err) { res.status(500).json({ message: 'Fehler' }); }
});

// Werbungskosten
router.get('/steuer/werbungskosten', requireLogin, async (req, res) => {
    try {
        const db   = await Database.getInstance();
        const jahr = req.query.jahr ? parseInt(req.query.jahr) : null;
        const data = await db.getSteuerWerbungskosten(req.session.userId, jahr);
        res.json(data);
    } catch (err) {
        console.error(err);
        res.status(500).json([]);
    }
});

router.post('/steuer/werbungskosten/add', requireLogin, async (req, res) => {
    if (!req.body.bezeichnung) return res.status(400).json({ message: 'Bezeichnung erforderlich' });
    try {
        const db = await Database.getInstance();
        const id = await db.addSteuerWerbungskosten(req.session.userId, req.body);
        res.status(201).json({ id, message: 'Gespeichert' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Fehler' });
    }
});

router.put('/steuer/werbungskosten/:id', requireLogin, async (req, res) => {
    try {
        const db = await Database.getInstance();
        await db.updateSteuerWerbungskosten(req.session.userId, req.params.id, req.body);
        res.json({ message: 'Aktualisiert' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Fehler' });
    }
});

router.delete('/steuer/werbungskosten/delete/:id', requireLogin, async (req, res) => {
    try {
        const db = await Database.getInstance();
        await db.deleteSteuerWerbungskosten(req.session.userId, req.params.id);
        res.json({ message: 'Gelöscht' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Fehler' });
    }
});

// Assistent-Checks
router.get('/steuer/assistent/checks', requireLogin, async (req, res) => {
    try {
        const db   = await Database.getInstance();
        const data = await db.getSteuerAssistentChecks(req.session.userId);
        res.json(data);
    } catch (err) {
        res.json({});
    }
});

router.put('/steuer/assistent/checks', requireLogin, async (req, res) => {
    try {
        const db = await Database.getInstance();
        await db.saveSteuerAssistentChecks(req.session.userId, req.body.checks || {});
        res.json({ message: 'Gespeichert' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Fehler' });
    }
});

// ── Kapitalerträge ───────────────────────────────────────────────
router.get('/steuer/kapitalertraege', requireLogin, async (req, res) => {
    try {
        const db = await Database.getInstance();
        const jahr = req.query.jahr ? parseInt(req.query.jahr) : null;
        res.json(await db.getKapitalertraege(req.session.userId, jahr));
    } catch (err) { console.error(err); res.status(500).json([]); }
});
router.post('/steuer/kapitalertraege/add', requireLogin, async (req, res) => {
    if (!req.body.institution) return res.status(400).json({ message: 'Institution erforderlich' });
    try {
        const db = await Database.getInstance();
        const id = await db.addKapitalertrag(req.session.userId, req.body);
        res.status(201).json({ id, message: 'Gespeichert' });
    } catch (err) { console.error(err); res.status(500).json({ message: 'Fehler' }); }
});
router.put('/steuer/kapitalertraege/:id', requireLogin, async (req, res) => {
    try {
        const db = await Database.getInstance();
        await db.updateKapitalertrag(req.session.userId, req.params.id, req.body);
        res.json({ message: 'Aktualisiert' });
    } catch (err) { console.error(err); res.status(500).json({ message: 'Fehler' }); }
});
router.delete('/steuer/kapitalertraege/:id', requireLogin, async (req, res) => {
    try {
        const db = await Database.getInstance();
        await db.deleteKapitalertrag(req.session.userId, req.params.id);
        res.json({ message: 'Gelöscht' });
    } catch (err) { console.error(err); res.status(500).json({ message: 'Fehler' }); }
});

// ── Sonderausgaben ───────────────────────────────────────────────
router.get('/steuer/sonderausgaben', requireLogin, async (req, res) => {
    try {
        const db = await Database.getInstance();
        const jahr = req.query.jahr ? parseInt(req.query.jahr) : null;
        res.json(await db.getSonderausgaben(req.session.userId, jahr));
    } catch (err) { console.error(err); res.status(500).json([]); }
});
router.post('/steuer/sonderausgaben/add', requireLogin, async (req, res) => {
    if (!req.body.bezeichnung) return res.status(400).json({ message: 'Bezeichnung erforderlich' });
    try {
        const db = await Database.getInstance();
        const id = await db.addSonderausgabe(req.session.userId, req.body);
        res.status(201).json({ id, message: 'Gespeichert' });
    } catch (err) { console.error(err); res.status(500).json({ message: 'Fehler' }); }
});
router.put('/steuer/sonderausgaben/:id', requireLogin, async (req, res) => {
    try {
        const db = await Database.getInstance();
        await db.updateSonderausgabe(req.session.userId, req.params.id, req.body);
        res.json({ message: 'Aktualisiert' });
    } catch (err) { console.error(err); res.status(500).json({ message: 'Fehler' }); }
});
router.delete('/steuer/sonderausgaben/:id', requireLogin, async (req, res) => {
    try {
        const db = await Database.getInstance();
        await db.deleteSonderausgabe(req.session.userId, req.params.id);
        res.json({ message: 'Gelöscht' });
    } catch (err) { console.error(err); res.status(500).json({ message: 'Fehler' }); }
});

// ── Altersvorsorge ───────────────────────────────────────────────
router.get('/steuer/altersvorsorge', requireLogin, async (req, res) => {
    try {
        const db = await Database.getInstance();
        const jahr = req.query.jahr ? parseInt(req.query.jahr) : null;
        res.json(await db.getAltersvorsorge(req.session.userId, jahr));
    } catch (err) { console.error(err); res.status(500).json([]); }
});
router.post('/steuer/altersvorsorge/add', requireLogin, async (req, res) => {
    if (!req.body.bezeichnung) return res.status(400).json({ message: 'Bezeichnung erforderlich' });
    try {
        const db = await Database.getInstance();
        const id = await db.addAltersvorsorge(req.session.userId, req.body);
        res.status(201).json({ id, message: 'Gespeichert' });
    } catch (err) { console.error(err); res.status(500).json({ message: 'Fehler' }); }
});
router.put('/steuer/altersvorsorge/:id', requireLogin, async (req, res) => {
    try {
        const db = await Database.getInstance();
        await db.updateAltersvorsorge(req.session.userId, req.params.id, req.body);
        res.json({ message: 'Aktualisiert' });
    } catch (err) { console.error(err); res.status(500).json({ message: 'Fehler' }); }
});
router.delete('/steuer/altersvorsorge/:id', requireLogin, async (req, res) => {
    try {
        const db = await Database.getInstance();
        await db.deleteAltersvorsorge(req.session.userId, req.params.id);
        res.json({ message: 'Gelöscht' });
    } catch (err) { console.error(err); res.status(500).json({ message: 'Fehler' }); }
});

// ── Budget-Seite ────────────────────────────────────────────────
router.get('/budget', requireLogin, (req, res) => {
    res.render('budget', { isLoggedIn: true });
});

// API: Budgets
router.get('/budgets', requireLogin, async (req, res) => {
    try {
        const db = await Database.getInstance();
        res.json(await db.getBudgets(req.session.userId));
    } catch (err) { res.status(500).json([]); }
});

router.post('/budgets/add', requireLogin, async (req, res) => {
    const { kategorie, betrag } = req.body;
    if (!kategorie || betrag === undefined) return res.status(400).json({ message: 'Kategorie und Betrag erforderlich' });
    try {
        const db = await Database.getInstance();
        const id = await db.addBudget(req.session.userId, kategorie, parseFloat(betrag));
        db.logActivity(req.session.userId, 'erstellt', 'Budget', id, { kategorie, betrag: parseFloat(betrag) });
        res.status(201).json({ id, message: 'Budget gespeichert' });
    } catch (err) { res.status(500).json({ message: 'Fehler' }); }
});

router.put('/budgets/:id', requireLogin, async (req, res) => {
    const { kategorie, betrag } = req.body;
    try {
        const db = await Database.getInstance();
        await db.updateBudget(req.session.userId, req.params.id, kategorie, parseFloat(betrag));
        db.logActivity(req.session.userId, 'geändert', 'Budget', parseInt(req.params.id), { kategorie, betrag: parseFloat(betrag) });
        res.json({ message: 'Budget aktualisiert' });
    } catch (err) { res.status(500).json({ message: 'Fehler' }); }
});

router.delete('/budgets/:id', requireLogin, async (req, res) => {
    try {
        const db = await Database.getInstance();
        await db.deleteBudget(req.session.userId, req.params.id);
        db.logActivity(req.session.userId, 'gelöscht', 'Budget', parseInt(req.params.id), null);
        res.json({ message: 'Budget gelöscht' });
    } catch (err) { res.status(500).json({ message: 'Fehler' }); }
});

// ── Sparziele ───────────────────────────────────────────────────
router.get('/sparziele', requireLogin, async (req, res) => {
    try {
        const db = await Database.getInstance();
        res.json(await db.getSparziele(req.session.userId));
    } catch (err) { res.status(500).json([]); }
});

router.post('/sparziele/add', requireLogin, async (req, res) => {
    const { name, zielbetrag, gespart, datum, farbe, account_id, typ } = req.body;
    if (!name || !zielbetrag) return res.status(400).json({ message: 'Name und Zielbetrag erforderlich' });
    try {
        const db = await Database.getInstance();
        const id = await db.addSparziel(req.session.userId, name, parseFloat(zielbetrag), parseFloat(gespart) || 0, datum || null, farbe || '#6358e6', account_id || null, typ || 'sonstiges');
        db.logActivity(req.session.userId, 'erstellt', 'Finanzziel', id, { name, zielbetrag: parseFloat(zielbetrag) });

        // Initial deposit → create transaction
        if (parseFloat(gespart) > 0) {
            const today = new Date().toISOString().slice(0, 10);
            const txId = await db.createTransaction(req.session.userId, `Sparziel: ${name}`, 'Sparziele', today, parseFloat(gespart), 'Ausgaben', account_id || null);
            db.logActivity(req.session.userId, 'erstellt', 'Transaktion', txId, { name: `Sparziel: ${name}`, amount: parseFloat(gespart), type: 'Ausgaben', category: 'Sparziele', date: today });
        }

        res.status(201).json({ id, message: 'Sparziel erstellt' });
    } catch (err) { res.status(500).json({ message: 'Fehler' }); }
});

router.put('/sparziele/:id', requireLogin, async (req, res) => {
    const { name, zielbetrag, gespart, datum, farbe, account_id, typ } = req.body;
    try {
        const db = await Database.getInstance();
        await db.updateSparziel(req.session.userId, req.params.id, name, parseFloat(zielbetrag), parseFloat(gespart) || 0, datum || null, farbe, account_id || null, typ || 'sonstiges');
        db.logActivity(req.session.userId, 'geändert', 'Finanzziel', parseInt(req.params.id), { name, zielbetrag: parseFloat(zielbetrag) });
        res.json({ message: 'Aktualisiert' });
    } catch (err) { res.status(500).json({ message: 'Fehler' }); }
});

router.post('/sparziele/:id/add', requireLogin, async (req, res) => {
    const { betrag, createTransaction = true } = req.body;
    if (!betrag) return res.status(400).json({ message: 'Betrag erforderlich' });
    try {
        const db = await Database.getInstance();
        const szList = await db.getSparziele(req.session.userId);
        const sz = szList.find(s => s.id == req.params.id);
        if (!sz) return res.status(404).json({ message: 'Sparziel nicht gefunden' });

        await db.addToSparziel(req.session.userId, req.params.id, parseFloat(betrag));

        let txId = null;
        if (createTransaction !== false) {
            const today = new Date().toISOString().slice(0, 10);
            txId = await db.createTransaction(
                req.session.userId,
                `Sparziel: ${sz.name}`,
                'Sparziele',
                today,
                parseFloat(betrag),
                'Ausgaben',
                sz.account_id || null
            );
            db.logActivity(req.session.userId, 'erstellt', 'Transaktion', txId, {
                name: `Sparziel: ${sz.name}`, amount: parseFloat(betrag), type: 'Ausgaben', category: 'Sparziele', date: today
            });
        }

        db.logActivity(req.session.userId, 'geändert', 'Finanzziel', parseInt(req.params.id), { name: sz.name, betrag: parseFloat(betrag) });
        res.json({ message: 'Betrag hinzugefügt', txId });
    } catch (err) { console.error(err); res.status(500).json({ message: 'Fehler' }); }
});

router.delete('/sparziele/:id', requireLogin, async (req, res) => {
    try {
        const db = await Database.getInstance();
        const szList = await db.getSparziele(req.session.userId);
        const sz = szList.find(s => s.id == req.params.id);
        await db.deleteSparziel(req.session.userId, req.params.id);
        if (sz) db.logActivity(req.session.userId, 'gelöscht', 'Finanzziel', parseInt(req.params.id), { name: sz.name });
        res.json({ message: 'Gelöscht' });
    } catch (err) { res.status(500).json({ message: 'Fehler' }); }
});

// ── Kategorisierungs-Regeln ──────────────────────────────────────
router.get('/regeln', requireLogin, (req, res) => {
    res.render('regeln', { isLoggedIn: true });
});

// ── Activity Log ─────────────────────────────────────────────────
router.get('/activity', requireLogin, (req, res) => {
    res.render('activity', { isLoggedIn: true });
});

router.get('/activity/list', requireLogin, async (req, res) => {
    try {
        const db = await Database.getInstance();
        const { entity, limit = 100, offset = 0 } = req.query;
        const entries = await db.getActivityLog(req.session.userId, {
            limit: parseInt(limit),
            offset: parseInt(offset),
            entity: entity || null
        });
        res.json(entries);
    } catch (err) { res.status(500).json([]); }
});

router.get('/regeln/list', requireLogin, async (req, res) => {
    try {
        const db = await Database.getInstance();
        res.json(await db.getRegeln(req.session.userId));
    } catch (err) { res.status(500).json([]); }
});

router.post('/regeln/add', requireLogin, async (req, res) => {
    const { bedingung_operator, bedingung_wert, aktion_kategorie, aktion_typ, modus, priority } = req.body;
    if (!bedingung_operator || !bedingung_wert) return res.status(400).json({ message: 'Bedingung erforderlich' });
    if (!aktion_kategorie && !aktion_typ) return res.status(400).json({ message: 'Mindestens eine Aktion erforderlich' });
    try {
        const db = await Database.getInstance();
        const id = await db.addRegel(req.session.userId, bedingung_operator, bedingung_wert, aktion_kategorie || null, aktion_typ || null, modus || 'beide', parseInt(priority) || 0);
        res.status(201).json({ id, message: 'Regel erstellt' });
    } catch (err) { res.status(500).json({ message: 'Fehler' }); }
});

router.put('/regeln/:id', requireLogin, async (req, res) => {
    const { bedingung_operator, bedingung_wert, aktion_kategorie, aktion_typ, aktiv, modus, priority } = req.body;
    try {
        const db = await Database.getInstance();
        await db.updateRegel(req.session.userId, req.params.id, bedingung_operator, bedingung_wert, aktion_kategorie || null, aktion_typ || null, aktiv == null ? 1 : (aktiv ? 1 : 0), modus || 'beide', parseInt(priority) || 0);
        res.json({ message: 'Regel aktualisiert' });
    } catch (err) { res.status(500).json({ message: 'Fehler' }); }
});

router.delete('/regeln/:id', requireLogin, async (req, res) => {
    try {
        const db = await Database.getInstance();
        await db.deleteRegel(req.session.userId, req.params.id);
        res.json({ message: 'Regel gelöscht' });
    } catch (err) { res.status(500).json({ message: 'Fehler' }); }
});

// Bulk: Regeln auf alle bestehenden Transaktionen anwenden
router.post('/regeln/apply-all', requireLogin, async (req, res) => {
    try {
        const db = await Database.getInstance();
        const userId = req.session.userId;
        const onlyEmpty = req.body.onlyEmpty === true;
        let txs = await db.getTransactionsForUser(userId);
        if (onlyEmpty) txs = txs.filter(tx => !tx.category || tx.category.trim() === '');
        let updated = 0;
        for (const tx of txs) {
            const applied = await db.applyRegeln(userId, tx.name, tx.category, tx.type);
            if (applied.category !== tx.category || applied.type !== tx.type) {
                await db.updateTransaction(userId, tx.id, tx.name, applied.category, tx.amount, tx.date, applied.type, tx.account_id);
                updated++;
            }
        }
        res.json({ message: `${updated} Transaktion(en) aktualisiert`, updated });
    } catch (err) { res.status(500).json({ message: 'Fehler' }); }
});

// Bulk: Regeln auf alle bestehenden Haushalt-Transaktionen anwenden
router.post('/haushalt/regeln/apply-all', requireLogin, async (req, res) => {
    try {
        const db = await Database.getInstance();
        const userId = req.session.userId;
        const haushalt = await db.getHaushaltForUser(userId);
        if (!haushalt) return res.status(404).json({ message: 'Kein Haushalt' });
        const onlyEmpty = req.body.onlyEmpty === true;
        let txs = await db.getHaushaltTransaktionen(haushalt.id);
        if (onlyEmpty) txs = txs.filter(tx => !tx.category || tx.category.trim() === '' || tx.category === 'Sonstiges');
        let updated = 0;
        for (const tx of txs) {
            const applied = await db.applyRegeln(userId, tx.name + ' ' + (tx.notiz || ''), tx.category, tx.type, 'haushalt');
            if (applied.category !== tx.category || applied.type !== tx.type) {
                await db.updateHaushaltTransaktion(haushalt.id, tx.id, { ...tx, category: applied.category, type: applied.type });
                updated++;
            }
        }
        res.json({ message: `${updated} Transaktion(en) aktualisiert`, updated });
    } catch (err) { res.status(500).json({ message: 'Fehler' }); }
});


// ── Abonnements ─────────────────────────────────────────────────
router.get('/abos', requireLogin, async (req, res) => {
    try {
        const db = await Database.getInstance();
        res.json(await db.getAbos(req.session.userId));
    } catch (err) { res.status(500).json([]); }
});

router.post('/abos/add', requireLogin, async (req, res) => {
    const { name, kategorie, betrag, rhythmus, naechste_abbuchung, notiz } = req.body;
    if (!name || betrag === undefined) return res.status(400).json({ message: 'Name und Betrag erforderlich' });
    try {
        const db = await Database.getInstance();
        const id = await db.addAbo(req.session.userId, name, kategorie || 'sonstiges', parseFloat(betrag), rhythmus || 'monatlich', naechste_abbuchung || null, notiz || '');
        res.status(201).json({ id, message: 'Abo hinzugefügt' });
    } catch (err) { res.status(500).json({ message: 'Fehler' }); }
});

router.put('/abos/:id', requireLogin, async (req, res) => {
    const { name, kategorie, betrag, rhythmus, naechste_abbuchung, notiz } = req.body;
    try {
        const db = await Database.getInstance();
        await db.updateAbo(req.session.userId, req.params.id, name, kategorie, parseFloat(betrag), rhythmus, naechste_abbuchung || null, notiz || '');
        res.json({ message: 'Aktualisiert' });
    } catch (err) { res.status(500).json({ message: 'Fehler' }); }
});

router.delete('/abos/:id', requireLogin, async (req, res) => {
    try {
        const db = await Database.getInstance();
        await db.deleteAbo(req.session.userId, req.params.id);
        res.json({ message: 'Gelöscht' });
    } catch (err) { res.status(500).json({ message: 'Fehler' }); }
});

// ── Produktivitäts-Seite ─────────────────────────────────────────
router.get('/produktivitaet', requireLogin, (req, res) => {
    res.render('produktivitaet', { isLoggedIn: true });
});

// ── Notizen ─────────────────────────────────────────────────────
router.get('/notizen', requireLogin, async (req, res) => {
    try {
        const db = await Database.getInstance();
        res.json(await db.getNotizen(req.session.userId));
    } catch (err) { res.status(500).json([]); }
});

router.post('/notizen/add', requireLogin, async (req, res) => {
    const { titel, inhalt, kategorie } = req.body;
    try {
        const db = await Database.getInstance();
        const id = await db.addNotiz(req.session.userId, titel, inhalt, kategorie);
        res.status(201).json({ id, message: 'Notiz erstellt' });
    } catch (err) { res.status(500).json({ message: 'Fehler' }); }
});

router.put('/notizen/:id', requireLogin, async (req, res) => {
    const { titel, inhalt, kategorie } = req.body;
    try {
        const db = await Database.getInstance();
        await db.updateNotiz(req.session.userId, req.params.id, titel, inhalt, kategorie);
        res.json({ message: 'Gespeichert' });
    } catch (err) { res.status(500).json({ message: 'Fehler' }); }
});

router.patch('/notizen/:id/pin', requireLogin, async (req, res) => {
    const { pinned } = req.body;
    try {
        const db = await Database.getInstance();
        await db.updateNotizPin(req.session.userId, req.params.id, pinned);
        res.json({ message: 'Pin aktualisiert' });
    } catch (err) { res.status(500).json({ message: 'Fehler' }); }
});

router.delete('/notizen/:id', requireLogin, async (req, res) => {
    try {
        const db = await Database.getInstance();
        await db.deleteNotiz(req.session.userId, req.params.id);
        res.json({ message: 'Gelöscht' });
    } catch (err) { res.status(500).json({ message: 'Fehler' }); }
});

// ── Gewohnheiten ────────────────────────────────────────────────
router.get('/gewohnheiten', requireLogin, async (req, res) => {
    try {
        const db = await Database.getInstance();
        res.json(await db.getGewohnheiten(req.session.userId));
    } catch (err) { res.status(500).json([]); }
});

router.post('/gewohnheiten/add', requireLogin, async (req, res) => {
    const { name, emoji, farbe, haeufigkeit } = req.body;
    if (!name) return res.status(400).json({ message: 'Name erforderlich' });
    try {
        const db = await Database.getInstance();
        const id = await db.addGewohnheit(req.session.userId, name, emoji, farbe, haeufigkeit);
        res.status(201).json({ id, message: 'Gewohnheit erstellt' });
    } catch (err) { res.status(500).json({ message: 'Fehler' }); }
});

router.put('/gewohnheiten/:id', requireLogin, async (req, res) => {
    const { name, emoji, farbe, haeufigkeit } = req.body;
    try {
        const db = await Database.getInstance();
        await db.updateGewohnheit(req.session.userId, req.params.id, name, emoji, farbe, haeufigkeit);
        res.json({ message: 'Aktualisiert' });
    } catch (err) { res.status(500).json({ message: 'Fehler' }); }
});

router.patch('/gewohnheiten/:id/check', requireLogin, async (req, res) => {
    const { checks } = req.body;
    try {
        const db = await Database.getInstance();
        await db.updateGewohnheitChecks(req.session.userId, req.params.id, checks);
        res.json({ message: 'Check aktualisiert' });
    } catch (err) { res.status(500).json({ message: 'Fehler' }); }
});

router.delete('/gewohnheiten/:id', requireLogin, async (req, res) => {
    try {
        const db = await Database.getInstance();
        await db.deleteGewohnheit(req.session.userId, req.params.id);
        res.json({ message: 'Gelöscht' });
    } catch (err) { res.status(500).json({ message: 'Fehler' }); }
});

// ── Ziele ───────────────────────────────────────────────────────
router.get('/ziele', requireLogin, async (req, res) => {
    try {
        const db = await Database.getInstance();
        res.json(await db.getZiele(req.session.userId));
    } catch (err) { res.status(500).json([]); }
});

router.post('/ziele/add', requireLogin, async (req, res) => {
    const { titel, kategorie, beschreibung, datum, fortschritt } = req.body;
    if (!titel) return res.status(400).json({ message: 'Titel erforderlich' });
    try {
        const db = await Database.getInstance();
        const id = await db.addZiel(req.session.userId, titel, kategorie, beschreibung, datum || null, parseInt(fortschritt) || 0);
        res.status(201).json({ id, message: 'Ziel erstellt' });
    } catch (err) { res.status(500).json({ message: 'Fehler' }); }
});

router.put('/ziele/:id', requireLogin, async (req, res) => {
    const { titel, kategorie, beschreibung, datum, fortschritt } = req.body;
    try {
        const db = await Database.getInstance();
        await db.updateZiel(req.session.userId, req.params.id, titel, kategorie, beschreibung, datum || null, parseInt(fortschritt) || 0);
        res.json({ message: 'Aktualisiert' });
    } catch (err) { res.status(500).json({ message: 'Fehler' }); }
});

router.delete('/ziele/:id', requireLogin, async (req, res) => {
    try {
        const db = await Database.getInstance();
        await db.deleteZiel(req.session.userId, req.params.id);
        res.json({ message: 'Gelöscht' });
    } catch (err) { res.status(500).json({ message: 'Fehler' }); }
});


// ── Schulden-Tracker ─────────────────────────────────────────────
router.get('/schulden', requireLogin, (req, res) => {
    res.render('schulden', { isLoggedIn: true });
});

router.get('/schulden/data', requireLogin, async (req, res) => {
    try {
        const db = await Database.getInstance();
        res.json(await db.getSchulden(req.session.userId));
    } catch (err) { res.status(500).json([]); }
});

router.post('/schulden/add', requireLogin, async (req, res) => {
    const { name, monatsrate, restbetrag, gesamtbetrag } = req.body;
    if (!name || monatsrate === undefined || restbetrag === undefined || gesamtbetrag === undefined)
        return res.status(400).json({ message: 'Pflichtfelder fehlen' });
    try {
        const db = await Database.getInstance();
        const id = await db.addSchuld(req.session.userId, req.body);
        db.logActivity(req.session.userId, 'erstellt', 'Schuld', id, { name });
        res.status(201).json({ id, message: 'Schuld gespeichert' });
    } catch (err) { res.status(500).json({ message: 'Interner Fehler' }); }
});

// ── Schulden-Zahlungshistorie ─────────────────────────────────────
// WICHTIG: spezifische Routen VOR /:id Wildcards!
router.get('/schulden/:id/zahlungen', requireLogin, async (req, res) => {
    try {
        const db = await Database.getInstance();
        const zahlungen = await db.getSchuldenZahlungen(req.session.userId, req.params.id);
        res.json(zahlungen);
    } catch (err) { res.status(500).json([]); }
});

router.post('/schulden/:id/zahlungen', requireLogin, async (req, res) => {
    const { betrag, datum, notiz, account_id, als_transaktion } = req.body;
    if (!betrag || !datum || isNaN(parseFloat(betrag)))
        return res.status(400).json({ message: 'Betrag und Datum erforderlich' });
    try {
        const db = await Database.getInstance();
        const newId = await db.addSchuldenZahlung(
            req.session.userId, req.params.id,
            parseFloat(betrag), datum, notiz || '',
            account_id ? parseInt(account_id) : null,
            als_transaktion === true || als_transaktion === 'true'
        );
        res.status(201).json({ id: newId, message: 'Zahlung gespeichert' });
    } catch (err) { res.status(500).json({ message: err.message }); }
});

router.delete('/schulden/zahlungen/:id', requireLogin, async (req, res) => {
    try {
        const db = await Database.getInstance();
        const ok = await db.deleteSchuldenZahlung(req.session.userId, req.params.id);
        if (!ok) return res.status(404).json({ message: 'Zahlung nicht gefunden' });
        db.logActivity(req.session.userId, 'gelöscht', 'Schulden-Zahlung', parseInt(req.params.id), {});
        res.json({ message: 'Gelöscht' });
    } catch (err) { res.status(500).json({ message: err.message }); }
});

router.put('/schulden/:id', requireLogin, async (req, res) => {
    try {
        const db = await Database.getInstance();
        await db.updateSchuld(req.session.userId, req.params.id, req.body);
        res.json({ message: 'Aktualisiert' });
    } catch (err) { res.status(500).json({ message: 'Fehler' }); }
});

router.delete('/schulden/:id', requireLogin, async (req, res) => {
    try {
        const db = await Database.getInstance();
        const schulden = await db.getSchulden(req.session.userId);
        const schuld = schulden.find(s => s.id == req.params.id);
        await db.deleteSchuld(req.session.userId, req.params.id);
        if (schuld) db.logActivity(req.session.userId, 'gelöscht', 'Schuld', parseInt(req.params.id), { name: schuld.name });
        res.json({ message: 'Gelöscht' });
    } catch (err) { res.status(500).json({ message: 'Fehler' }); }
});

// GET /users/reminders/run  (dev only)
router.get('/reminders/run', requireLogin, async (req, res) => {
    try {
        const { runAllReminders } = await import('../modules/reminder.js');
        await runAllReminders();
        res.json({ ok: true, message: 'Reminder-Lauf abgeschlossen. Prüfe Server-Log.' });
    } catch (err) {
        res.status(500).json({ ok: false, message: err.message });
    }
});

// ── Reminder: manuellen Test-Lauf auslösen ───────────────────

// ── Wiederkehrende Transaktionen ─────────────────────────────────
router.get('/recurring', requireLogin, async (req, res) => {
    try {
        const db = await Database.getInstance();
        res.json(await db.getRecurring(req.session.userId));
    } catch (err) { res.status(500).json([]); }
});

router.post('/recurring/add', requireLogin, async (req, res) => {
    const { name, category, amount } = req.body;
    if (!name || !category || amount === undefined)
        return res.status(400).json({ message: 'Name, Kategorie und Betrag erforderlich' });
    try {
        const db = await Database.getInstance();
        const id = await db.addRecurring(req.session.userId, req.body);
        res.status(201).json({ id, message: 'Vorlage gespeichert' });
    } catch (err) { res.status(500).json({ message: 'Fehler' }); }
});

router.put('/recurring/:id', requireLogin, async (req, res) => {
    try {
        const db = await Database.getInstance();
        await db.updateRecurring(req.session.userId, req.params.id, req.body);
        res.json({ message: 'Aktualisiert' });
    } catch (err) { res.status(500).json({ message: 'Fehler' }); }
});

router.delete('/recurring/:id', requireLogin, async (req, res) => {
    try {
        const db = await Database.getInstance();
        await db.deleteRecurring(req.session.userId, req.params.id);
        res.json({ message: 'Gelöscht' });
    } catch (err) { res.status(500).json({ message: 'Fehler' }); }
});

router.post('/recurring/:id/book', requireLogin, async (req, res) => {
    try {
        const db = await Database.getInstance();
        const result = await db.bookRecurring(req.session.userId, req.params.id);
        res.json({ message: 'Gebucht', ...result });
    } catch (err) { res.status(500).json({ message: err.message || 'Fehler' }); }
});

// GET /users/reminders/run  (dev only)
router.get('/reminders/run', requireLogin, async (req, res) => {
    try {
        const { runAllReminders } = await import('../modules/reminder.js');
        await runAllReminders();
        res.json({ ok: true, message: 'Reminder-Lauf abgeschlossen. Prüfe Server-Log.' });
    } catch (err) {
        res.status(500).json({ ok: false, message: err.message });
    }
});

// ══════════════════════════════════════════════════════════════════
// ── GLOBALE SUCHE ─────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════
router.get('/search', requireLogin, async (req, res) => {
    const q = (req.query.q || '').trim().toLowerCase();
    if (q.length < 2) return res.json({ results: [] });

    try {
        const db = await Database.getInstance();
        const userId = req.session.userId;
        const results = [];

        // ── Transaktionen ──
        const txAll = await db.getTransactionsForUser(userId);
        txAll.forEach(t => {
            if (
                (t.name  && t.name.toLowerCase().includes(q)) ||
                (t.category && t.category.toLowerCase().includes(q))
            ) {
                results.push({
                    type: 'transaktion',
                    icon: t.type === 'Einnahmen' ? 'ri-arrow-down-circle-line' : 'ri-arrow-up-circle-line',
                    title: t.name,
                    sub: `${t.category} · ${t.type === 'Einnahmen' ? '+' : '-'}${Number(t.amount).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}`,
                    date: t.date ? t.date.substring(0, 10) : '',
                    url: '/users/ausgabentracker',
                    color: t.type === 'Einnahmen' ? '#22c55e' : '#ef4444'
                });
            }
        });

        // ── Sparziele ──
        const sparziele = await db.getSparziele(userId);
        sparziele.forEach(s => {
            if (s.name && s.name.toLowerCase().includes(q)) {
                results.push({
                    type: 'sparziel',
                    icon: 'ri-flag-fill',
                    title: s.name,
                    sub: `${Number(s.gespart).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })} von ${Number(s.zielbetrag).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}`,
                    date: s.datum ? s.datum.substring(0, 10) : '',
                    url: '/users/budget#sparzieleTab',
                    color: s.farbe || '#6358e6'
                });
            }
        });

        // ── Dokumente ──
        const dokumente = await db.getDokumente(userId);
        dokumente.forEach(d => {
            if (
                (d.name       && d.name.toLowerCase().includes(q)) ||
                (d.aussteller && d.aussteller.toLowerCase().includes(q)) ||
                (d.notiz      && d.notiz.toLowerCase().includes(q)) ||
                (d.kategorie  && d.kategorie.toLowerCase().includes(q))
            ) {
                results.push({
                    type: 'dokument',
                    icon: 'ri-file-line',
                    title: d.name,
                    sub: `${d.typ || 'Dokument'}${d.aussteller ? ' · ' + d.aussteller : ''}`,
                    date: d.datum ? d.datum.substring(0, 10) : '',
                    url: '/users/dokumente',
                    color: '#3b82f6'
                });
            }
        });

        // ── Versicherungen ──
        const versicherungen = await db.getVersicherungen(userId);
        versicherungen.forEach(v => {
            if (
                (v.name     && v.name.toLowerCase().includes(q)) ||
                (v.anbieter && v.anbieter.toLowerCase().includes(q)) ||
                (v.kategorie && v.kategorie.toLowerCase().includes(q))
            ) {
                results.push({
                    type: 'versicherung',
                    icon: 'ri-shield-check-line',
                    title: v.name,
                    sub: `${v.kategorie || 'Versicherung'}${v.anbieter ? ' · ' + v.anbieter : ''}`,
                    date: '',
                    url: '/users/versicherungen',
                    color: '#f59e0b'
                });
            }
        });

        // ── Notizen ──
        const notizen = await db.getNotizen(userId);
        notizen.forEach(n => {
            if (
                (n.titel  && n.titel.toLowerCase().includes(q)) ||
                (n.inhalt && n.inhalt.toLowerCase().includes(q))
            ) {
                results.push({
                    type: 'notiz',
                    icon: 'ri-sticky-note-line',
                    title: n.titel || 'Notiz',
                    sub: n.inhalt ? n.inhalt.substring(0, 60) + (n.inhalt.length > 60 ? '…' : '') : '',
                    date: '',
                    url: '/users/produktivitaet',
                    color: '#a855f7'
                });
            }
        });

        // ── Schulden ──
        const schulden = await db.getSchulden(userId);
        schulden.forEach(s => {
            if (
                (s.name      && s.name.toLowerCase().includes(q)) ||
                (s.glaeubiger && s.glaeubiger.toLowerCase().includes(q))
            ) {
                results.push({
                    type: 'schuld',
                    icon: 'ri-scales-line',
                    title: s.name,
                    sub: `${s.glaeubiger ? s.glaeubiger + ' · ' : ''}Restbetrag: ${Number(s.restbetrag).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}`,
                    date: '',
                    url: '/users/schulden',
                    color: '#ef4444'
                });
            }
        });

        // ── Todos ──
        const todos = await db.getTodosForUser(userId);
        todos.forEach(t => {
            if (
                (t.task  && t.task.toLowerCase().includes(q)) ||
                (t.label && t.label.toLowerCase().includes(q)) ||
                (t.notes && t.notes.toLowerCase().includes(q))
            ) {
                results.push({
                    type: 'todo',
                    icon: t.completed ? 'ri-checkbox-circle-line' : 'ri-checkbox-blank-circle-line',
                    title: t.task,
                    sub: `${t.label ? t.label + ' · ' : ''}${t.completed ? 'Erledigt' : 'Offen'}`,
                    date: t.due_date ? t.due_date.substring(0, 10) : '',
                    url: '/users/todo',
                    color: '#10b981'
                });
            }
        });

        // Auf max. 30 Ergebnisse begrenzen
        res.json({ results: results.slice(0, 30) });
    } catch (err) {
        console.error('Suchfehler:', err);
        res.status(500).json({ results: [] });
    }
});

// ══════════════════════════════════════════════════════════════════
// ── HAUSHALT-ROUTEN ───────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════

// Hilfsfunktion: Haushalt holen und Zugriff prüfen
async function getHaushaltForUser(userId) {
    const db = await Database.getInstance();
    const haushalt = await db.getHaushaltForUser(userId);
    return haushalt;
}

// ── Seiten-Routen ─────────────────────────────────────────────────

router.get('/haushalt', requireLogin, async (req, res) => {
    const db = await Database.getInstance();
    const plan = await db.getUserPlan(req.session.userId);
    if (plan === 'free') return res.redirect('/users/tarife?reason=haushalt');
    const haushalt = await getHaushaltForUser(req.session.userId);
    res.render('haushalt-dashboard', { isLoggedIn: true, haushalt });
});

router.get('/haushalt/ausgaben', requireLogin, async (req, res) => {
    const db = await Database.getInstance();
    const plan = await db.getUserPlan(req.session.userId);
    if (plan === 'free') return res.redirect('/users/tarife?reason=haushalt');
    const haushalt = await getHaushaltForUser(req.session.userId);
    res.render('haushalt-ausgaben', { isLoggedIn: true, haushalt });
});

router.get('/haushalt/dokumente', requireLogin, async (req, res) => {
    const db = await Database.getInstance();
    const plan = await db.getUserPlan(req.session.userId);
    if (plan === 'free') return res.redirect('/users/tarife?reason=haushalt');
    const haushalt = await getHaushaltForUser(req.session.userId);
    res.render('haushalt-dokumente', { isLoggedIn: true, haushalt });
});

router.get('/haushalt/todos', requireLogin, async (req, res) => {
    const db = await Database.getInstance();
    const plan = await db.getUserPlan(req.session.userId);
    if (plan === 'free') return res.redirect('/users/tarife?reason=haushalt');
    const haushalt = await getHaushaltForUser(req.session.userId);
    res.render('haushalt-todos', { isLoggedIn: true, haushalt });
});

router.get('/haushalt/kostenplan', requireLogin, async (req, res) => {
    const db = await Database.getInstance();
    const plan = await db.getUserPlan(req.session.userId);
    if (plan === 'free') return res.redirect('/users/tarife?reason=haushalt');
    const haushalt = await getHaushaltForUser(req.session.userId);
    res.render('haushalt-kostenplan', { isLoggedIn: true, haushalt });
});

router.get('/haushalt/einstellungen', requireLogin, async (req, res) => {
    const db = await Database.getInstance();
    const plan = await db.getUserPlan(req.session.userId);
    if (plan === 'free') return res.redirect('/users/tarife?reason=haushalt');
    const haushalt = await getHaushaltForUser(req.session.userId);
    res.render('haushalt-einstellungen', { isLoggedIn: true, haushalt });
});

// ── Haushalt Setup & Status ───────────────────────────────────────

// Status: Hat der User einen Haushalt?
router.get('/haushalt/status', requireLogin, async (req, res) => {
    try {
        const db = await Database.getInstance();
        const haushalt = await db.getHaushaltForUser(req.session.userId);
        if (!haushalt) return res.json({ haushalt: null });
        const [mitglieder, konten, settings] = await Promise.all([
            db.getHaushaltMitglieder(haushalt.id),
            db.getHaushaltKonten(haushalt.id),
            db.getHaushaltSettings(haushalt.id),
        ]);
        const gesamtBalance = konten.reduce((s, k) => s + (k.currentBalance || 0), 0);
        res.json({ haushalt, mitglieder, konto: konten[0] || null, konten, gesamtBalance, settings, current_user_id: req.session.userId });
    } catch (err) { res.status(500).json({ message: err.message }); }
});

// Haushalt erstellen
router.post('/haushalt/create', requireLogin, async (req, res) => {
    const { name, anzeigename } = req.body;
    try {
        const db = await Database.getInstance();
        // Prüfen ob bereits ein Haushalt existiert
        const existing = await db.getHaushaltForUser(req.session.userId);
        if (existing) return res.status(400).json({ message: 'Du bist bereits in einem Haushalt' });
        const id = await db.createHaushalt(req.session.userId, name, anzeigename);
        res.status(201).json({ id, message: 'Haushalt erstellt' });
    } catch (err) { res.status(500).json({ message: err.message }); }
});

// Haushalt verlassen
router.post('/haushalt/leave', requireLogin, async (req, res) => {
    try {
        const db = await Database.getInstance();
        const haushalt = await db.getHaushaltForUser(req.session.userId);
        if (!haushalt) return res.status(404).json({ message: 'Kein Haushalt gefunden' });
        await db.leaveHaushalt(haushalt.id, req.session.userId);
        res.json({ message: 'Haushalt verlassen' });
    } catch (err) { res.status(500).json({ message: err.message }); }
});

// Einladung erstellen
router.post('/haushalt/invite', requireLogin, async (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: 'E-Mail erforderlich' });
    try {
        const db = await Database.getInstance();
        const haushalt = await db.getHaushaltForUser(req.session.userId);
        if (!haushalt) return res.status(404).json({ message: 'Kein Haushalt gefunden' });
        const code = Math.random().toString(36).substring(2, 10).toUpperCase();
        await db.createHaushaltEinladung(haushalt.id, req.session.userId, email, code);
        const baseUrl = process.env.APP_URL || 'http://localhost:3000';
        const joinLink = `${baseUrl}/users/haushalt/join/${code}`;
        // E-Mail senden wenn echte Adresse angegeben
        const isPlaceholder = !email || email === 'partner@example.com';
        if (!isPlaceholder) {
            try {
                await sendMail({
                    to: email,
                    subject: `${req.session.username} lädt dich zu Golden Goat Capital ein`,
                    title: 'Haushalt-Einladung',
                    preheader: `${req.session.username} möchte gemeinsam Finanzen im Haushalt verwalten.`,
                    bodyHtml: `
                        ${greetingHtml('')}
                        <p><strong>${req.session.username}</strong> hat dich eingeladen, gemeinsam den Haushalt in <strong>Golden Goat Capital</strong> zu verwalten.</p>
                        <p>Klicke auf den Button, um der Einladung beizutreten. Der Link ist <strong>7 Tage</strong> gültig.</p>
                        ${ctaButtonHtml('Einladung annehmen →', `/users/haushalt/join/${code}`)}
                        ${dividerHtml()}
                        <p style="font-size:12px;color:#64748b;">Falls du keinen Button siehst, kopiere diesen Link:<br>${joinLink}</p>
                        <p style="font-size:12px;color:#64748b;">Einladungscode: <strong>${code}</strong></p>
                    `,
                });
            } catch (mailErr) {
                console.warn('[Invite] E-Mail konnte nicht gesendet werden:', mailErr.message);
            }
        }
        res.json({ code, link: joinLink, emailSent: !isPlaceholder, message: 'Einladung erstellt' });
    } catch (err) { res.status(500).json({ message: err.message }); }
});

// Einladungs-Join-Seite (öffentlich — kein requireLogin, damit Link in E-Mail funktioniert)
router.get('/haushalt/join/:code', async (req, res) => {
    try {
        const db = await Database.getInstance();
        const einladung = await db.getEinladungByCode(req.params.code);
        const isLoggedIn = getIsLoggedIn(req);
        res.render('haushalt-join', {
            einladung: einladung || null,
            code: req.params.code,
            isLoggedIn,
            username: req.session.username || null,
            error: einladung ? null : 'Diese Einladung ist ungültig, abgelaufen oder wurde bereits verwendet.'
        });
    } catch (err) {
        res.render('haushalt-join', { einladung: null, code: req.params.code, isLoggedIn: false, username: null, error: 'Fehler beim Laden der Einladung.' });
    }
});

// Einladung per Code prüfen (GET, damit man die Info anzeigen kann)
router.get('/haushalt/einladung/:code', requireLogin, async (req, res) => {
    try {
        const db = await Database.getInstance();
        const einladung = await db.getEinladungByCode(req.params.code);
        if (!einladung) return res.status(404).json({ message: 'Einladung nicht gefunden oder bereits verwendet' });
        res.json(einladung);
    } catch (err) { res.status(500).json({ message: err.message }); }
});

// Einladung annehmen
router.post('/haushalt/einladung/:code/accept', requireLogin, async (req, res) => {
    const { anzeigename } = req.body;
    try {
        const db = await Database.getInstance();
        const existing = await db.getHaushaltForUser(req.session.userId);
        if (existing) return res.status(400).json({ message: 'Du bist bereits in einem Haushalt' });
        const haushaltId = await db.acceptEinladung(req.params.code, req.session.userId, anzeigename);
        res.json({ haushaltId, message: 'Haushalt beigetreten' });
    } catch (err) { res.status(400).json({ message: err.message }); }
});

// Anzeigenamen aktualisieren
router.patch('/haushalt/anzeigename', requireLogin, async (req, res) => {
    const { anzeigename } = req.body;
    try {
        const db = await Database.getInstance();
        const haushalt = await db.getHaushaltForUser(req.session.userId);
        if (!haushalt) return res.status(404).json({ message: 'Kein Haushalt' });
        await db.updateHaushaltAnzeigename(haushalt.id, req.session.userId, anzeigename);
        res.json({ message: 'Aktualisiert' });
    } catch (err) { res.status(500).json({ message: err.message }); }
});

// Haushaltsnamen aktualisieren
router.patch('/haushalt/name', requireLogin, async (req, res) => {
    const { name } = req.body;
    try {
        const db = await Database.getInstance();
        const haushalt = await db.getHaushaltForUser(req.session.userId);
        if (!haushalt) return res.status(404).json({ message: 'Kein Haushalt' });
        await db.updateHaushaltName(haushalt.id, name);
        res.json({ message: 'Aktualisiert' });
    } catch (err) { res.status(500).json({ message: err.message }); }
});

// ── Haushalt-Fixkosten ─────────────────────────────────────────────

router.get('/haushalt/fixkosten', requireLogin, async (req, res) => {
    try {
        const db = await Database.getInstance();
        const haushalt = await db.getHaushaltForUser(req.session.userId);
        if (!haushalt) return res.json([]);
        res.json(await db.getHaushaltFixkosten(haushalt.id));
    } catch (err) { res.status(500).json([]); }
});

router.post('/haushalt/fixkosten/add', requireLogin, async (req, res) => {
    try {
        const db = await Database.getInstance();
        const haushalt = await db.getHaushaltForUser(req.session.userId);
        if (!haushalt) return res.status(404).json({ message: 'Kein Haushalt' });
        const id = await db.addHaushaltFixkost(haushalt.id, req.body);
        res.status(201).json({ id });
    } catch (err) { res.status(500).json({ message: err.message }); }
});

router.put('/haushalt/fixkosten/:id', requireLogin, async (req, res) => {
    try {
        const db = await Database.getInstance();
        const haushalt = await db.getHaushaltForUser(req.session.userId);
        if (!haushalt) return res.status(404).json({ message: 'Kein Haushalt' });
        await db.updateHaushaltFixkost(haushalt.id, req.params.id, req.body);
        res.json({ message: 'Aktualisiert' });
    } catch (err) { res.status(500).json({ message: err.message }); }
});

router.delete('/haushalt/fixkosten/:id', requireLogin, async (req, res) => {
    try {
        const db = await Database.getInstance();
        const haushalt = await db.getHaushaltForUser(req.session.userId);
        if (!haushalt) return res.status(404).json({ message: 'Kein Haushalt' });
        await db.deleteHaushaltFixkost(haushalt.id, req.params.id);
        res.json({ message: 'Gelöscht' });
    } catch (err) { res.status(500).json({ message: err.message }); }
});

// Monats-Override für Fixkosten
router.get('/haushalt/fixkosten/monat/:monat', requireLogin, async (req, res) => {
    try {
        const db = await Database.getInstance();
        const haushalt = await db.getHaushaltForUser(req.session.userId);
        if (!haushalt) return res.json([]);
        res.json(await db.getHaushaltFixkostenMonat(haushalt.id, req.params.monat));
    } catch (err) { res.status(500).json([]); }
});

router.post('/haushalt/fixkosten/:id/monat/:monat', requireLogin, async (req, res) => {
    try {
        const db = await Database.getInstance();
        const haushalt = await db.getHaushaltForUser(req.session.userId);
        if (!haushalt) return res.status(404).json({ message: 'Kein Haushalt' });
        await db.setHaushaltFixkostMonat(haushalt.id, req.params.id, req.params.monat, req.body);
        res.json({ message: 'Override gesetzt' });
    } catch (err) { res.status(500).json({ message: err.message }); }
});

router.delete('/haushalt/fixkosten/:id/monat/:monat', requireLogin, async (req, res) => {
    try {
        const db = await Database.getInstance();
        const haushalt = await db.getHaushaltForUser(req.session.userId);
        if (!haushalt) return res.status(404).json({ message: 'Kein Haushalt' });
        await db.deleteHaushaltFixkostMonat(haushalt.id, req.params.id, req.params.monat);
        res.json({ message: 'Override entfernt' });
    } catch (err) { res.status(500).json({ message: err.message }); }
});

// ── Persönliche Fixkosten ──────────────────────────────────────────

router.get('/haushalt/persoenlich', requireLogin, async (req, res) => {
    try {
        const db = await Database.getInstance();
        const haushalt = await db.getHaushaltForUser(req.session.userId);
        if (!haushalt) return res.json([]);
        res.json(await db.getHaushaltPersoenlicheFixkosten(haushalt.id));
    } catch (err) { res.status(500).json([]); }
});

router.post('/haushalt/persoenlich/add', requireLogin, async (req, res) => {
    try {
        const db = await Database.getInstance();
        const haushalt = await db.getHaushaltForUser(req.session.userId);
        if (!haushalt) return res.status(404).json({ message: 'Kein Haushalt' });
        const mitglieder = await db.getHaushaltMitglieder(haushalt.id);
        const targetUserId = req.body.user_id && mitglieder.some(m => m.user_id == req.body.user_id)
            ? parseInt(req.body.user_id)
            : req.session.userId;
        const id = await db.addHaushaltPersoenlicheFixkost(haushalt.id, targetUserId, req.body);
        res.status(201).json({ id });
    } catch (err) { res.status(500).json({ message: err.message }); }
});

router.put('/haushalt/persoenlich/:id', requireLogin, async (req, res) => {
    try {
        const db = await Database.getInstance();
        const haushalt = await db.getHaushaltForUser(req.session.userId);
        if (!haushalt) return res.status(404).json({ message: 'Kein Haushalt' });
        await db.updateHaushaltPersoenlicheFixkost(haushalt.id, req.session.userId, req.params.id, req.body);
        res.json({ message: 'Aktualisiert' });
    } catch (err) { res.status(500).json({ message: err.message }); }
});

router.delete('/haushalt/persoenlich/:id', requireLogin, async (req, res) => {
    try {
        const db = await Database.getInstance();
        const haushalt = await db.getHaushaltForUser(req.session.userId);
        if (!haushalt) return res.status(404).json({ message: 'Kein Haushalt' });
        await db.deleteHaushaltPersoenlicheFixkost(haushalt.id, req.session.userId, req.params.id);
        res.json({ message: 'Gelöscht' });
    } catch (err) { res.status(500).json({ message: err.message }); }
});

// ── Gehälter ───────────────────────────────────────────────────────

router.get('/haushalt/gehaelter', requireLogin, async (req, res) => {
    try {
        const db = await Database.getInstance();
        const haushalt = await db.getHaushaltForUser(req.session.userId);
        if (!haushalt) return res.json({ defaults: [], monat: [] });
        const defaults = await db.getHaushaltGehaelterDefault(haushalt.id);
        const monat = req.query.monat ? await db.getHaushaltGehaltMonat(haushalt.id, req.query.monat) : [];
        res.json({ defaults, monat });
    } catch (err) { res.status(500).json({ defaults: [], monat: [] }); }
});

router.post('/haushalt/gehaelter/default', requireLogin, async (req, res) => {
    const { gehalt, sparbetrag } = req.body;
    try {
        const db = await Database.getInstance();
        const haushalt = await db.getHaushaltForUser(req.session.userId);
        if (!haushalt) return res.status(404).json({ message: 'Kein Haushalt' });
        const mitglieder = await db.getHaushaltMitglieder(haushalt.id);
        const targetUserId = req.body.user_id && mitglieder.some(m => m.user_id == req.body.user_id)
            ? parseInt(req.body.user_id)
            : req.session.userId;
        await db.setHaushaltGehaltDefault(haushalt.id, targetUserId, gehalt, sparbetrag);
        res.json({ message: 'Gespeichert' });
    } catch (err) { res.status(500).json({ message: err.message }); }
});

router.post('/haushalt/gehaelter/monat/:monat', requireLogin, async (req, res) => {
    const { gehalt, sparbetrag } = req.body;
    try {
        const db = await Database.getInstance();
        const haushalt = await db.getHaushaltForUser(req.session.userId);
        if (!haushalt) return res.status(404).json({ message: 'Kein Haushalt' });
        const mitglieder = await db.getHaushaltMitglieder(haushalt.id);
        const targetUserId = req.body.user_id && mitglieder.some(m => m.user_id == req.body.user_id)
            ? parseInt(req.body.user_id)
            : req.session.userId;
        await db.setHaushaltGehaltMonat(haushalt.id, targetUserId, req.params.monat, gehalt, sparbetrag);
        res.json({ message: 'Gespeichert' });
    } catch (err) { res.status(500).json({ message: err.message }); }
});

// ── Haushalt-Ausgaben ──────────────────────────────────────────────

// haushalt/ausgaben/* → konsolidiert auf haushalt_transaktionen
// Rückwärtskompatibilität: ausgaben/data gibt transaktionen im ausgaben-Format zurück
router.get('/haushalt/ausgaben/data', requireLogin, async (req, res) => {
    try {
        const db = await Database.getInstance();
        const haushalt = await db.getHaushaltForUser(req.session.userId);
        if (!haushalt) return res.json([]);
        const txs = await db.getHaushaltTransaktionen(haushalt.id);
        res.json(txs.filter(t => t.type === 'Ausgaben').map(t => ({
            id: t.id, name: t.name, betrag: t.amount, kategorie: t.category,
            datum: t.date, anteil_user1: t.anteil_user1 ?? 50,
            anteil_user2: t.anteil_user2 ?? 50, notiz: t.notiz,
            eingetragen_von: t.eingetragen_von, eingetragen_von_name: t.eingetragen_von_name,
        })));
    } catch (err) { res.status(500).json([]); }
});

router.post('/haushalt/ausgaben/add', requireLogin, async (req, res) => {
    try {
        const db = await Database.getInstance();
        const haushalt = await db.getHaushaltForUser(req.session.userId);
        if (!haushalt) return res.status(404).json({ message: 'Kein Haushalt' });
        const konto = await db.getHaushaltKonto(haushalt.id);
        if (!konto) return res.status(404).json({ message: 'Kein Haushaltskonto vorhanden. Bitte zuerst ein Konto einrichten.' });
        const amount = Math.abs(parseFloat(req.body.betrag || req.body.amount) || 0);
        const txType = req.body.type || 'Ausgaben';
        const id = await db.addHaushaltTransaktion(haushalt.id, req.session.userId, {
            name:         req.body.name,
            category:     req.body.kategorie || req.body.category || 'Sonstiges',
            amount,
            type:         txType,
            date:         req.body.datum || req.body.date || new Date().toISOString().slice(0, 10),
            notiz:        req.body.notiz || '',
            anteil_user1: req.body.anteil_user1 ?? 50,
            anteil_user2: req.body.anteil_user2 ?? 50,
        });
        res.status(201).json({ id });

        // E-Mail-Benachrichtigung bei großen Ausgaben (async, non-blocking)
        if (txType === 'Ausgaben' && amount > 0) {
            (async () => {
                try {
                    const settings = await db.getHaushaltSettings(haushalt.id);
                    const schwelle = settings.benachrichtigung_schwelle || 0;
                    if (schwelle <= 0 || amount < schwelle) return;
                    const mitglieder = await db.getHaushaltMitglieder(haushalt.id);
                    const eintraeger = mitglieder.find(m => m.user_id === req.session.userId);
                    const fmt = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });
                    for (const m of mitglieder) {
                        const userRow = await db._database.query(
                            'SELECT Benutzername AS email FROM users WHERE id=?',
                            { replacements: [m.user_id], type: 'SELECT' }
                        );
                        if (!userRow?.[0]?.email) continue;
                        const recipName = m.anzeigename || m.display_name || 'Haushaltsmitglied';
                        const eintraegerName = eintraeger ? (eintraeger.anzeigename || eintraeger.display_name || 'Jemand') : 'Jemand';
                        await sendMail({
                            to: userRow[0].email,
                            subject: `💸 Große Ausgabe im Haushalt: ${fmt.format(amount)} – ${req.body.name || 'Ausgabe'}`,
                            title: 'Große Ausgabe eingetragen',
                            preheader: `${eintraegerName} hat ${fmt.format(amount)} für "${req.body.name || 'Ausgabe'}" eingetragen.`,
                            bodyHtml:
                                greetingHtml(recipName) +
                                `<p><strong>${eintraegerName}</strong> hat im Haushalt <strong>${haushalt.name}</strong> eine Ausgabe eingetragen, die über eurer Benachrichtigungs-Schwelle von ${fmt.format(schwelle)} liegt:</p>` +
                                sectionTitleHtml('Ausgabe') +
                                `<div style="background:#1e2030;border:1px solid #2a2d3a;border-radius:10px;padding:16px 18px;margin-bottom:16px;">` +
                                `<div style="font-size:1.3rem;font-weight:800;color:#ef4444;margin-bottom:6px;">${fmt.format(amount)}</div>` +
                                `<div style="font-size:0.9rem;color:#94a3b8;">${req.body.name || 'Ausgabe'}` +
                                (req.body.kategorie || req.body.category ? ` · ${req.body.kategorie || req.body.category}` : '') + `</div>` +
                                `</div>` +
                                dividerHtml() +
                                ctaButtonHtml('Haushalt öffnen →', '/users/haushalt')
                        });
                    }
                } catch (e) { console.error('[Haushalt-Benachrichtigung] Fehler:', e.message); }
            })();
        }
    } catch (err) { res.status(500).json({ message: err.message }); }
});

router.put('/haushalt/ausgaben/:id', requireLogin, async (req, res) => {
    try {
        const db = await Database.getInstance();
        const haushalt = await db.getHaushaltForUser(req.session.userId);
        if (!haushalt) return res.status(404).json({ message: 'Kein Haushalt' });
        await db.updateHaushaltTransaktion(haushalt.id, req.params.id, {
            name:         req.body.name,
            category:     req.body.kategorie || req.body.category || 'Sonstiges',
            amount:       Math.abs(parseFloat(req.body.betrag || req.body.amount) || 0),
            type:         req.body.type || 'Ausgaben',
            date:         req.body.datum || req.body.date,
            notiz:        req.body.notiz || '',
            anteil_user1: req.body.anteil_user1 ?? 50,
            anteil_user2: req.body.anteil_user2 ?? 50,
        });
        res.json({ message: 'Aktualisiert' });
    } catch (err) { res.status(500).json({ message: err.message }); }
});

router.delete('/haushalt/ausgaben/:id', requireLogin, async (req, res) => {
    try {
        const db = await Database.getInstance();
        const haushalt = await db.getHaushaltForUser(req.session.userId);
        if (!haushalt) return res.status(404).json({ message: 'Kein Haushalt' });
        await db.deleteHaushaltTransaktion(haushalt.id, req.params.id);
        res.json({ message: 'Gelöscht' });
    } catch (err) { res.status(500).json({ message: err.message }); }
});

// ── Haushalt-Todos ─────────────────────────────────────────────────

router.get('/haushalt/todos/data', requireLogin, async (req, res) => {
    try {
        const db = await Database.getInstance();
        const haushalt = await db.getHaushaltForUser(req.session.userId);
        if (!haushalt) return res.json([]);
        res.json(await db.getHaushaltTodos(haushalt.id));
    } catch (err) { res.status(500).json([]); }
});

router.post('/haushalt/todos/add', requireLogin, async (req, res) => {
    try {
        const db = await Database.getInstance();
        const haushalt = await db.getHaushaltForUser(req.session.userId);
        if (!haushalt) return res.status(404).json({ message: 'Kein Haushalt' });
        const id = await db.addHaushaltTodo(haushalt.id, req.session.userId, req.body);
        res.status(201).json({ id });
    } catch (err) { res.status(500).json({ message: err.message }); }
});

router.put('/haushalt/todos/:id', requireLogin, async (req, res) => {
    try {
        const db = await Database.getInstance();
        const haushalt = await db.getHaushaltForUser(req.session.userId);
        if (!haushalt) return res.status(404).json({ message: 'Kein Haushalt' });
        await db.updateHaushaltTodo(haushalt.id, req.params.id, req.body);
        res.json({ message: 'Aktualisiert' });
    } catch (err) { res.status(500).json({ message: err.message }); }
});

router.patch('/haushalt/todos/:id/complete', requireLogin, async (req, res) => {
    try {
        const db = await Database.getInstance();
        const haushalt = await db.getHaushaltForUser(req.session.userId);
        if (!haushalt) return res.status(404).json({ message: 'Kein Haushalt' });

        // Todo laden um Wiederholung zu prüfen
        const todos = await db.getHaushaltTodos(haushalt.id);
        const todo = todos.find(t => String(t.id) === String(req.params.id));

        await db.completeHaushaltTodo(haushalt.id, req.params.id);

        // Bei Wiederholung: neue Instanz mit nächstem Fälligkeitsdatum erstellen
        if (todo && todo.wiederholung && todo.wiederholung !== 'keine') {
            const base = todo.due_date ? new Date(todo.due_date) : new Date();
            let next = new Date(base);
            if (todo.wiederholung === 'täglich')      next.setDate(next.getDate() + 1);
            else if (todo.wiederholung === 'wöchentlich') next.setDate(next.getDate() + 7);
            else if (todo.wiederholung === 'monatlich')   next.setMonth(next.getMonth() + 1);
            const nextDate = next.toISOString().slice(0, 10);
            await db.addHaushaltTodo(haushalt.id, req.session.userId, {
                task:         todo.task,
                priority:     todo.priority,
                due_date:     nextDate,
                label:        todo.label,
                notes:        todo.notes,
                zugewiesen_an: todo.zugewiesen_an,
                wiederholung: todo.wiederholung,
            });
        }

        res.json({ message: 'Erledigt' });
    } catch (err) { res.status(500).json({ message: err.message }); }
});

router.patch('/haushalt/todos/:id/uncomplete', requireLogin, async (req, res) => {
    try {
        const db = await Database.getInstance();
        const haushalt = await db.getHaushaltForUser(req.session.userId);
        if (!haushalt) return res.status(404).json({ message: 'Kein Haushalt' });
        await db.uncompleteHaushaltTodo(haushalt.id, req.params.id);
        res.json({ message: 'Zurückgesetzt' });
    } catch (err) { res.status(500).json({ message: err.message }); }
});

router.delete('/haushalt/todos/:id', requireLogin, async (req, res) => {
    try {
        const db = await Database.getInstance();
        const haushalt = await db.getHaushaltForUser(req.session.userId);
        if (!haushalt) return res.status(404).json({ message: 'Kein Haushalt' });
        await db.deleteHaushaltTodo(haushalt.id, req.params.id);
        res.json({ message: 'Gelöscht' });
    } catch (err) { res.status(500).json({ message: err.message }); }
});

// ── Haushalt-Dokumente ─────────────────────────────────────────────

router.get('/haushalt/dokumente/data', requireLogin, async (req, res) => {
    try {
        const db = await Database.getInstance();
        const haushalt = await db.getHaushaltForUser(req.session.userId);
        if (!haushalt) return res.json([]);
        res.json(await db.getHaushaltDokumente(haushalt.id));
    } catch (err) { res.status(500).json([]); }
});

router.get('/haushalt/dokumente/:id/detail', requireLogin, (req, res) => {
    res.render('haushalt-dokument-detail', { isLoggedIn: true });
});

router.get('/haushalt/dokumente/:id/file', requireLogin, async (req, res) => {
    try {
        const db = await Database.getInstance();
        const haushalt = await db.getHaushaltForUser(req.session.userId);
        if (!haushalt) return res.status(404).json({ message: 'Kein Haushalt' });
        const dok = await db.getHaushaltDokumentById(haushalt.id, req.params.id);
        if (!dok) return res.status(404).json({ message: 'Nicht gefunden' });
        res.json(dok);
    } catch (err) { res.status(500).json({ message: err.message }); }
});

router.post('/haushalt/dokumente/add', requireLogin, async (req, res) => {
    try {
        const db = await Database.getInstance();
        const haushalt = await db.getHaushaltForUser(req.session.userId);
        if (!haushalt) return res.status(404).json({ message: 'Kein Haushalt' });
        const id = await db.addHaushaltDokument(haushalt.id, req.session.userId, req.body);
        res.status(201).json({ id });
    } catch (err) { res.status(500).json({ message: err.message }); }
});

router.patch('/haushalt/dokumente/:id/status', requireLogin, async (req, res) => {
    try {
        const db = await Database.getInstance();
        const haushalt = await db.getHaushaltForUser(req.session.userId);
        if (!haushalt) return res.status(404).json({ message: 'Kein Haushalt' });
        await db.updateHaushaltDokumentStatus(haushalt.id, req.params.id, req.body.status);
        res.json({ message: 'Status aktualisiert' });
    } catch (err) { res.status(500).json({ message: err.message }); }
});

router.delete('/haushalt/dokumente/delete/:id', requireLogin, async (req, res) => {
    try {
        const db = await Database.getInstance();
        const haushalt = await db.getHaushaltForUser(req.session.userId);
        if (!haushalt) return res.status(404).json({ message: 'Kein Haushalt' });
        await db.deleteHaushaltDokument(haushalt.id, req.params.id);
        res.json({ message: 'Gelöscht' });
    } catch (err) { res.status(500).json({ message: err.message }); }
});

// ═══════════════════════════════════════════════════════════════
// HAUSHALTSKONTO & TRANSAKTIONEN
// ═══════════════════════════════════════════════════════════════

// Seiten-Route
router.get('/haushalt/konto', requireLogin, async (req, res) => {
    res.render('haushalt-konto', { isLoggedIn: true });
});

// Haushalt-Zahlungskalender
router.get('/haushalt/kalender', requireLogin, async (req, res) => {
    res.render('haushalt-kalender', { isLoggedIn: true });
});

// Vollwertiger Haushalt-Ausgabentracker
router.get('/haushalt/tracker', requireLogin, async (req, res) => {
    res.render('haushalt-tracker', { isLoggedIn: true });
});

// Haushalt-Tracker: Kategorien (Standard-Set, kein custom per User)
const HAUSHALT_DEFAULT_CATEGORIES = [
    'Lebensmittel', 'Miete', 'Nebenkosten', 'Strom & Energie', 'Internet & Telefon',
    'Versicherungen', 'Haushalt & Reinigung', 'Freizeit & Unterhaltung',
    'Restaurant & Café', 'Kleidung', 'Gesundheit', 'Transport', 'Sonstiges'
];

router.get('/haushalt/tracker/categories', requireLogin, async (req, res) => {
    try {
        const db = await Database.getInstance();
        const haushalt = await db.getHaushaltForUser(req.session.userId);
        if (!haushalt) return res.json([]);

        let cats = await db.getHaushaltTrackerCategories(haushalt.id);

        // Seed defaults on first use
        if (cats.length === 0) {
            for (const name of HAUSHALT_DEFAULT_CATEGORIES) {
                await db.addHaushaltTrackerCategory(haushalt.id, name);
            }
            cats = await db.getHaushaltTrackerCategories(haushalt.id);
        }

        // Also include any category used in transactions but not yet in the list
        const txs = await db.getHaushaltTransaktionen(haushalt.id);
        const existing = new Set(cats.map(c => c.name));
        for (const tx of txs) {
            if (tx.category && !existing.has(tx.category)) {
                await db.addHaushaltTrackerCategory(haushalt.id, tx.category);
                cats.push({ name: tx.category, is_default: 0 });
                existing.add(tx.category);
            }
        }

        cats.sort((a, b) => a.name.localeCompare(b.name, 'de'));
        res.json(cats);
    } catch (err) { res.status(500).json({ message: err.message }); }
});

// Haushalt-Tracker: Konten (haushalt_konten_v2 mit currentBalance)
router.get('/haushalt/tracker/accounts', requireLogin, async (req, res) => {
    try {
        const db = await Database.getInstance();
        const haushalt = await db.getHaushaltForUser(req.session.userId);
        if (!haushalt) return res.json([]);
        const konten = await db.getHaushaltKonten(haushalt.id);
        res.json(konten);
    } catch (err) { res.status(500).json({ message: err.message }); }
});

// Haushalt-Tracker: Kategorien CRUD
router.post('/haushalt/tracker/categories/add', requireLogin, async (req, res) => {
    try {
        const { name } = req.body;
        if (!name || !name.trim()) return res.status(400).json({ message: 'Name fehlt' });
        const db = await Database.getInstance();
        const haushalt = await db.getHaushaltForUser(req.session.userId);
        if (!haushalt) return res.status(404).json({ message: 'Kein Haushalt' });
        await db.addHaushaltTrackerCategory(haushalt.id, name.trim());
        res.json({ message: 'Kategorie gespeichert' });
    } catch (err) { res.status(500).json({ message: err.message }); }
});

router.post('/haushalt/tracker/categories/update', requireLogin, async (req, res) => {
    try {
        const { oldName, newName } = req.body;
        if (!oldName || !newName) return res.status(400).json({ message: 'Name fehlt' });
        const db = await Database.getInstance();
        const haushalt = await db.getHaushaltForUser(req.session.userId);
        if (!haushalt) return res.status(404).json({ message: 'Kein Haushalt' });
        await db.renameHaushaltTrackerCategory(haushalt.id, oldName.trim(), newName.trim());
        res.json({ message: 'Kategorie umbenannt' });
    } catch (err) { res.status(500).json({ message: err.message }); }
});

router.delete('/haushalt/tracker/categories/delete/:name', requireLogin, async (req, res) => {
    try {
        const db = await Database.getInstance();
        const haushalt = await db.getHaushaltForUser(req.session.userId);
        if (!haushalt) return res.status(404).json({ message: 'Kein Haushalt' });
        await db.deleteHaushaltTrackerCategory(haushalt.id, decodeURIComponent(req.params.name));
        res.json({ message: 'Kategorie gelöscht' });
    } catch (err) { res.status(500).json({ message: err.message }); }
});

// --- Konto CRUD ---

// Konto-Status abrufen (mit aktuellem Stand, alle Konten)
router.get('/haushalt/konto/data', requireLogin, async (req, res) => {
    try {
        const db = await Database.getInstance();
        const haushalt = await db.getHaushaltForUser(req.session.userId);
        if (!haushalt) return res.json({ konten: [], konto: null });
        const konten = await db.getHaushaltKonten(haushalt.id);
        // Rückwärtskompatibilität: konto = erstes Konto
        res.json({ konten, konto: konten[0] || null });
    } catch (err) { res.status(500).json({ message: err.message }); }
});

// Konto anlegen
router.post('/haushalt/konto/create', requireLogin, async (req, res) => {
    try {
        const db = await Database.getInstance();
        const haushalt = await db.getHaushaltForUser(req.session.userId);
        if (!haushalt) return res.status(404).json({ message: 'Kein Haushalt gefunden' });
        const { name, balance, color } = req.body;
        const id = await db.createHaushaltKonto(haushalt.id, name, parseFloat(balance) || 0, color || '#10b981');
        res.json({ id, message: 'Haushaltskonto erstellt' });
    } catch (err) { res.status(500).json({ message: err.message }); }
});

// Konto aus privatem Konto importieren (nur eigenes Konto!) – inkl. aller Transaktionen
router.post('/haushalt/konto/import', requireLogin, async (req, res) => {
    try {
        const db = await Database.getInstance();
        const haushalt = await db.getHaushaltForUser(req.session.userId);
        if (!haushalt) return res.status(404).json({ message: 'Kein Haushalt gefunden' });

        const { account_id } = req.body;
        // Sicherheit: Nur eigene Konten dürfen importiert werden!
        const accounts = await db.getAccountsWithBalance(req.session.userId);
        const acc = accounts.find(a => String(a.id) === String(account_id));
        if (!acc) return res.status(403).json({ message: 'Konto nicht gefunden oder gehört nicht dir' });

        // Haushaltskonto anlegen (mit Startguthaben des privaten Kontos)
        const id = await db.createHaushaltKonto(haushalt.id, acc.name, acc.balance || 0, acc.color || '#10b981');
        await db.linkHaushaltKonto(haushalt.id, acc.id);

        // Alle Transaktionen des privaten Kontos importieren (inkl. Legacy-Transaktionen ohne account_id)
        const privateTxs = await db.getTransactionsForImport(req.session.userId, acc.id);
        for (const tx of privateTxs) {
            await db.addHaushaltTransaktion(haushalt.id, req.session.userId, {
                name:     tx.name,
                category: tx.category || 'Sonstiges',
                amount:   Math.abs(tx.amount),
                type:     tx.type || 'Ausgaben',
                date:     tx.date ? tx.date.slice(0, 10) : new Date().toISOString().slice(0, 10),
                notiz:    tx.notiz || ''
            });
        }

        res.json({ id, imported: privateTxs.length, message: `Konto importiert (${privateTxs.length} Transaktionen übernommen)` });
    } catch (err) { res.status(500).json({ message: err.message }); }
});

// Konto bearbeiten (per ID)
router.patch('/haushalt/konto/:id', requireLogin, async (req, res) => {
    try {
        const db = await Database.getInstance();
        const haushalt = await db.getHaushaltForUser(req.session.userId);
        if (!haushalt) return res.status(404).json({ message: 'Kein Haushalt' });
        const { name, balance, color } = req.body;
        await db.updateHaushaltKontoById(haushalt.id, req.params.id, name, parseFloat(balance) || 0, color);
        res.json({ message: 'Gespeichert' });
    } catch (err) { res.status(500).json({ message: err.message }); }
});

// Kontostand manuell setzen
router.post('/haushalt/konto/:id/set-balance', requireLogin, async (req, res) => {
    try {
        const db = await Database.getInstance();
        const haushalt = await db.getHaushaltForUser(req.session.userId);
        if (!haushalt) return res.status(404).json({ message: 'Kein Haushalt' });
        const desiredBalance = parseFloat(req.body.balance);
        if (isNaN(desiredBalance)) return res.status(400).json({ message: 'Ungültiger Betrag' });
        // Aktuellen Stand ermitteln
        const konten = await db.getHaushaltKonten(haushalt.id);
        const konto  = konten.find(k => k.id == req.params.id);
        if (!konto) return res.status(404).json({ message: 'Konto nicht gefunden' });
        // Neues Startguthaben so setzen, dass currentBalance = desiredBalance
        // currentBalance = balance + delta  →  newBalance = desiredBalance - delta
        const delta       = konto.currentBalance - konto.balance;
        const newBalance  = desiredBalance - delta;
        await db.updateHaushaltKontoById(haushalt.id, req.params.id, konto.name, newBalance, konto.color);
        res.json({ message: 'Kontostand aktualisiert' });
    } catch (err) { res.status(500).json({ message: err.message }); }
});

// Einzelnes Haushalt-Konto löschen (inkl. zugehörige Transaktionen)
router.delete('/haushalt/konto/:id', requireLogin, async (req, res) => {
    try {
        const db = await Database.getInstance();
        const haushalt = await db.getHaushaltForUser(req.session.userId);
        if (!haushalt) return res.status(404).json({ message: 'Kein Haushalt' });
        await db.deleteHaushaltKontoById(haushalt.id, req.params.id);
        res.json({ message: 'Konto gelöscht' });
    } catch (err) { res.status(400).json({ message: err.message }); }
});

// Konto löschen
router.delete('/haushalt/konto', requireLogin, async (req, res) => {
    try {
        const db = await Database.getInstance();
        const haushalt = await db.getHaushaltForUser(req.session.userId);
        if (!haushalt) return res.status(404).json({ message: 'Kein Haushalt' });
        await db.deleteHaushaltKonto(haushalt.id);
        res.json({ message: 'Konto gelöscht' });
    } catch (err) { res.status(500).json({ message: err.message }); }
});

// Eigene private Konten für Import-Auswahl liefern
router.get('/haushalt/konto/meine-privaten', requireLogin, async (req, res) => {
    try {
        const db = await Database.getInstance();
        const accounts = await db.getAccountsWithBalance(req.session.userId);
        res.json(accounts);
    } catch (err) { res.status(500).json({ message: err.message }); }
});

// --- Transaktionen ---

router.get('/haushalt/transaktionen', requireLogin, async (req, res) => {
    try {
        const db = await Database.getInstance();
        const haushalt = await db.getHaushaltForUser(req.session.userId);
        if (!haushalt) return res.json([]);
        res.json(await db.getHaushaltTransaktionen(haushalt.id));
    } catch (err) { res.status(500).json({ message: err.message }); }
});

router.post('/haushalt/transaktionen/add', requireLogin, async (req, res) => {
    try {
        const db = await Database.getInstance();
        const haushalt = await db.getHaushaltForUser(req.session.userId);
        if (!haushalt) return res.status(404).json({ message: 'Kein Haushalt' });
        const konto = await db.getHaushaltKonto(haushalt.id);
        if (!konto) return res.status(404).json({ message: 'Kein Haushaltskonto vorhanden' });
        // Regeln anwenden (modus='haushalt')
        let txBody = { ...req.body, konto_id: req.body.konto_id || req.body.account_id || null };
        const appliedH = await db.applyRegeln(req.session.userId, txBody.name, txBody.category, txBody.type === 'inbound' ? 'Einnahmen' : 'Ausgaben', 'haushalt');
        if (appliedH.category !== (txBody.category)) txBody.category = appliedH.category;
        if (appliedH.type === 'Einnahmen') txBody.type = 'inbound';
        else if (appliedH.type === 'Ausgaben') txBody.type = 'outbound';
        const id = await db.addHaushaltTransaktion(haushalt.id, req.session.userId, txBody);
        db.logActivity(req.session.userId, 'erstellt', 'Haushalt-Transaktion', id, { name: txBody.name, amount: parseFloat(txBody.amount||txBody.betrag||0), type: txBody.type });
        res.json({ id, message: 'Transaktion hinzugefügt' });
    } catch (err) { res.status(500).json({ message: err.message }); }
});

router.post('/haushalt/transaktionen/bulk-update', requireLogin, async (req, res) => {
    const { ids, category, konto_id, account_id, type } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ message: 'Fehlende Parameter: ids' });
    try {
        const db = await Database.getInstance();
        const haushalt = await db.getHaushaltForUser(req.session.userId);
        if (!haushalt) return res.status(404).json({ message: 'Kein Haushalt' });
        const { Sequelize } = await import('sequelize');
        const resolvedKontoId = konto_id !== undefined ? konto_id : (account_id !== undefined ? account_id : undefined);
        let updated = 0;
        for (const id of ids) {
            const rows = await db._database.query(
                'SELECT * FROM haushalt_transaktionen WHERE id=? AND haushalt_id=?',
                { replacements: [id, haushalt.id], type: Sequelize.QueryTypes.SELECT }
            );
            if (!rows.length) continue;
            const cur = rows[0];
            const updateData = {
                name:         cur.name,
                category:     category !== undefined ? category : cur.category,
                amount:       cur.amount,
                type:         type !== undefined ? type : cur.type,
                date:         cur.date,
                notiz:        cur.notiz || '',
                anteil_user1: cur.anteil_user1 ?? 50,
                anteil_user2: cur.anteil_user2 ?? 50,
                konto_id:     resolvedKontoId !== undefined ? (resolvedKontoId || null) : cur.konto_id,
            };
            await db.updateHaushaltTransaktion(haushalt.id, id, updateData);
            updated++;
        }
        res.json({ message: 'Aktualisiert', count: updated });
    } catch (err) { res.status(500).json({ message: err.message }); }
});

router.post('/haushalt/transaktionen/bulk-delete', requireLogin, async (req, res) => {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ message: 'Keine IDs angegeben' });
    try {
        const db = await Database.getInstance();
        const haushalt = await db.getHaushaltForUser(req.session.userId);
        if (!haushalt) return res.status(404).json({ message: 'Kein Haushalt' });
        let deleted = 0;
        for (const id of ids) {
            await db.deleteHaushaltTransaktion(haushalt.id, id);
            deleted++;
        }
        res.json({ message: 'Gelöscht', count: deleted });
    } catch (err) { res.status(500).json({ message: err.message }); }
});

router.put('/haushalt/transaktionen/:id', requireLogin, async (req, res) => {
    try {
        const db = await Database.getInstance();
        const haushalt = await db.getHaushaltForUser(req.session.userId);
        if (!haushalt) return res.status(404).json({ message: 'Kein Haushalt' });
        const body = { ...req.body, konto_id: req.body.konto_id || req.body.account_id || null };
        await db.updateHaushaltTransaktion(haushalt.id, req.params.id, body);
        res.json({ message: 'Aktualisiert' });
    } catch (err) { res.status(500).json({ message: err.message }); }
});

router.get('/haushalt/pending-deletes', requireLogin, async (req, res) => {
    try {
        const db = await Database.getInstance();
        const haushalt = await db.getHaushaltForUser(req.session.userId);
        if (!haushalt) return res.json([]);
        const pending = await db.getAndCleanHaushaltPendingDeletes(haushalt.id);
        res.json(pending);
    } catch (err) { res.json([]); }
});

router.post('/haushalt/transaktionen/:id/pending-delete', requireLogin, async (req, res) => {
    try {
        const db = await Database.getInstance();
        const haushalt = await db.getHaushaltForUser(req.session.userId);
        if (!haushalt) return res.status(404).json({ message: 'Kein Haushalt' });
        await db.setHaushaltPendingDelete(haushalt.id, req.params.id);
        res.json({ ok: true });
    } catch (err) { res.status(500).json({ message: err.message }); }
});

router.post('/haushalt/transaktionen/:id/undo-delete', requireLogin, async (req, res) => {
    try {
        const db = await Database.getInstance();
        const haushalt = await db.getHaushaltForUser(req.session.userId);
        if (!haushalt) return res.status(404).json({ message: 'Kein Haushalt' });
        await db.undoHaushaltPendingDelete(haushalt.id, req.params.id);
        res.json({ ok: true });
    } catch (err) { res.status(500).json({ message: err.message }); }
});

router.delete('/haushalt/transaktionen/:id', requireLogin, async (req, res) => {
    try {
        const db = await Database.getInstance();
        const haushalt = await db.getHaushaltForUser(req.session.userId);
        if (!haushalt) return res.status(404).json({ message: 'Kein Haushalt' });
        await db.deleteHaushaltTransaktion(haushalt.id, req.params.id);
        db.logActivity(req.session.userId, 'gelöscht', 'Haushalt-Transaktion', parseInt(req.params.id), null);
        res.json({ message: 'Gelöscht' });
    } catch (err) { res.status(500).json({ message: err.message }); }
});

// --- Haushalt Split Monats-Override ---

router.get('/haushalt/split/monat/:monat', requireLogin, async (req, res) => {
    try {
        const db = await Database.getInstance();
        const haushalt = await db.getHaushaltForUser(req.session.userId);
        if (!haushalt) return res.json(null);
        res.json(await db.getHaushaltSplitMonat(haushalt.id, req.params.monat));
    } catch (err) { res.status(500).json({ message: err.message }); }
});

router.post('/haushalt/split/monat/:monat', requireLogin, async (req, res) => {
    try {
        const db = await Database.getInstance();
        const haushalt = await db.getHaushaltForUser(req.session.userId);
        if (!haushalt) return res.status(404).json({ message: 'Kein Haushalt' });
        await db.setHaushaltSplitMonat(haushalt.id, req.params.monat, req.body.split_user1);
        res.json({ message: 'Gespeichert' });
    } catch (err) { res.status(500).json({ message: err.message }); }
});

router.delete('/haushalt/split/monat/:monat', requireLogin, async (req, res) => {
    try {
        const db = await Database.getInstance();
        const haushalt = await db.getHaushaltForUser(req.session.userId);
        if (!haushalt) return res.status(404).json({ message: 'Kein Haushalt' });
        await db.deleteHaushaltSplitMonat(haushalt.id, req.params.monat);
        res.json({ message: 'Gelöscht' });
    } catch (err) { res.status(500).json({ message: err.message }); }
});

// --- Haushalt Settings (globaler Split etc.) ---

router.get('/haushalt/settings', requireLogin, async (req, res) => {
    try {
        const db = await Database.getInstance();
        const haushalt = await db.getHaushaltForUser(req.session.userId);
        if (!haushalt) return res.json({ split_user1: 50, split_user2: 50 });
        res.json(await db.getHaushaltSettings(haushalt.id));
    } catch (err) { res.status(500).json({ message: err.message }); }
});

router.post('/haushalt/settings', requireLogin, async (req, res) => {
    try {
        const db = await Database.getInstance();
        const haushalt = await db.getHaushaltForUser(req.session.userId);
        if (!haushalt) return res.status(404).json({ message: 'Kein Haushalt' });
        await db.saveHaushaltSettings(haushalt.id, req.body);
        res.json({ message: 'Gespeichert' });
    } catch (err) { res.status(500).json({ message: err.message }); }
});

// --- Haushalt Sparziele ---

router.get('/haushalt/sparziele', requireLogin, async (req, res) => {
    try {
        const db = await Database.getInstance();
        const haushalt = await db.getHaushaltForUser(req.session.userId);
        if (!haushalt) return res.json([]);
        res.json(await db.getHaushaltSparziele(haushalt.id));
    } catch (err) { res.status(500).json({ message: err.message }); }
});

router.post('/haushalt/sparziele/add', requireLogin, async (req, res) => {
    try {
        const db = await Database.getInstance();
        const haushalt = await db.getHaushaltForUser(req.session.userId);
        if (!haushalt) return res.status(404).json({ message: 'Kein Haushalt' });
        const id = await db.createHaushaltSparziel(haushalt.id, req.body);
        res.json({ id, message: 'Sparziel erstellt' });
    } catch (err) { res.status(500).json({ message: err.message }); }
});

router.put('/haushalt/sparziele/:id', requireLogin, async (req, res) => {
    try {
        const db = await Database.getInstance();
        const haushalt = await db.getHaushaltForUser(req.session.userId);
        if (!haushalt) return res.status(404).json({ message: 'Kein Haushalt' });
        await db.updateHaushaltSparziel(haushalt.id, req.params.id, req.body);
        res.json({ message: 'Aktualisiert' });
    } catch (err) { res.status(500).json({ message: err.message }); }
});

router.delete('/haushalt/sparziele/:id', requireLogin, async (req, res) => {
    try {
        const db = await Database.getInstance();
        const haushalt = await db.getHaushaltForUser(req.session.userId);
        if (!haushalt) return res.status(404).json({ message: 'Kein Haushalt' });
        await db.deleteHaushaltSparziel(haushalt.id, req.params.id);
        res.json({ message: 'Gelöscht' });
    } catch (err) { res.status(500).json({ message: err.message }); }
});

// Einzahlung auf Sparziel (erstellt optional Haushalt-Transaktion)
router.post('/haushalt/sparziele/:id/einzahlen', requireLogin, async (req, res) => {
    try {
        const db = await Database.getInstance();
        const haushalt = await db.getHaushaltForUser(req.session.userId);
        if (!haushalt) return res.status(404).json({ message: 'Kein Haushalt' });
        const { betrag, als_transaktion, konto_id } = req.body;
        const goals = await db.getHaushaltSparziele(haushalt.id);
        const goal = goals.find(g => g.id == req.params.id);
        if (!goal) return res.status(404).json({ message: 'Sparziel nicht gefunden' });
        const neuerStand = (parseFloat(goal.aktuell) || 0) + (parseFloat(betrag) || 0);
        await db.updateHaushaltSparziel(haushalt.id, req.params.id, {
            ...goal, aktuell: neuerStand
        });
        if (als_transaktion && konto_id) {
            await db.addHaushaltTransaktion(haushalt.id, req.session.userId, {
                type: 'outbound', name: 'Sparziel: ' + goal.name,
                amount: parseFloat(betrag), category: 'Sparen',
                date: new Date().toISOString().substring(0, 10), konto_id
            });
        }
        res.json({ message: 'Einzahlung gebucht', aktuell: neuerStand });
    } catch (err) { res.status(500).json({ message: err.message }); }
});

// --- Haushalt Budgets ---

router.get('/haushalt/budgets', requireLogin, async (req, res) => {
    try {
        const db = await Database.getInstance();
        const haushalt = await db.getHaushaltForUser(req.session.userId);
        if (!haushalt) return res.json([]);
        res.json(await db.getHaushaltBudgets(haushalt.id));
    } catch (err) { res.status(500).json({ message: err.message }); }
});

router.post('/haushalt/budgets/upsert', requireLogin, async (req, res) => {
    try {
        const db = await Database.getInstance();
        const haushalt = await db.getHaushaltForUser(req.session.userId);
        if (!haushalt) return res.status(404).json({ message: 'Kein Haushalt' });
        const { kategorie, betrag } = req.body;
        if (!kategorie) return res.status(400).json({ message: 'Kategorie fehlt' });
        await db.upsertHaushaltBudget(haushalt.id, kategorie, betrag);
        res.json({ message: 'Budget gespeichert' });
    } catch (err) { res.status(500).json({ message: err.message }); }
});

router.delete('/haushalt/budgets/:id', requireLogin, async (req, res) => {
    try {
        const db = await Database.getInstance();
        const haushalt = await db.getHaushaltForUser(req.session.userId);
        if (!haushalt) return res.status(404).json({ message: 'Kein Haushalt' });
        await db.deleteHaushaltBudget(haushalt.id, req.params.id);
        res.json({ message: 'Budget gelöscht' });
    } catch (err) { res.status(500).json({ message: err.message }); }
});

// --- Settlement: Wer schuldet wem? ---

router.get('/haushalt/settlement/:monat', requireLogin, async (req, res) => {
    try {
        const db = await Database.getInstance();
        const haushalt = await db.getHaushaltForUser(req.session.userId);
        if (!haushalt) return res.status(403).json({ message: 'Kein Haushalt.' });

        const monat = req.params.monat; // YYYY-MM
        const mitglieder = await db.getHaushaltMitglieder(haushalt.id);
        const ausgleiche = await db.getHaushaltAusgleiche(haushalt.id, monat);

        if (mitglieder.length < 2) {
            return res.json({ owes: null, ausgleiche, mitglieder, balance: 0 });
        }

        const user1 = mitglieder[0];
        const user2 = mitglieder[1];

        const txs = await db.getHaushaltTransaktionenFuerMonat(haushalt.id, monat);

        // balance > 0 → user2 schuldet user1
        // balance < 0 → user1 schuldet user2
        let balance = 0;
        for (const tx of txs) {
            const a1 = parseFloat(tx.anteil_user1 ?? 50) / 100;
            const a2 = parseFloat(tx.anteil_user2 ?? 50) / 100;
            const amount = parseFloat(tx.amount) || 0;
            if (tx.eingetragen_von === user1.user_id) {
                balance += amount * a2; // user2 owes this share to user1
            } else if (tx.eingetragen_von === user2.user_id) {
                balance -= amount * a1; // user1 owes this share to user2
            }
        }

        // Bereits gebuchte Ausgleiche dieses Monats verrechnen
        for (const a of ausgleiche) {
            if (a.von_user_id === user2.user_id && a.an_user_id === user1.user_id) {
                balance -= parseFloat(a.betrag);
            } else if (a.von_user_id === user1.user_id && a.an_user_id === user2.user_id) {
                balance += parseFloat(a.betrag);
            }
        }

        let owes = null;
        if (Math.abs(balance) >= 0.01) {
            owes = {
                from: balance > 0 ? user2 : user1,
                to:   balance > 0 ? user1 : user2,
                amount: Math.abs(balance)
            };
        }

        res.json({ owes, ausgleiche, mitglieder, balance });
    } catch (err) {
        console.error('Settlement Fehler:', err);
        res.status(500).json({ message: err.message });
    }
});

router.post('/haushalt/ausgleich', requireLogin, async (req, res) => {
    try {
        const db = await Database.getInstance();
        const haushalt = await db.getHaushaltForUser(req.session.userId);
        if (!haushalt) return res.status(403).json({ message: 'Kein Haushalt.' });

        const { von_user_id, an_user_id, betrag, monat, notiz, mit_transaktion } = req.body;
        if (!von_user_id || !an_user_id || !betrag || !monat) {
            return res.status(400).json({ message: 'Fehlende Pflichtfelder.' });
        }

        const id = await db.addHaushaltAusgleich(haushalt.id, { von_user_id, an_user_id, betrag, monat, notiz });

        if (mit_transaktion) {
            const mitglieder = await db.getHaushaltMitglieder(haushalt.id);
            const anUser = mitglieder.find(m => m.user_id === an_user_id);
            const anName = anUser?.anzeigename || 'Person';
            const isUser1 = von_user_id === mitglieder[0]?.user_id;
            await db.addHaushaltTransaktion(haushalt.id, von_user_id, {
                name: `Ausgleich an ${anName}`,
                category: 'Ausgleich',
                amount: parseFloat(betrag),
                type: 'Ausgaben',
                date: monat + '-01',
                notiz: notiz || '',
                anteil_user1: isUser1 ? 100 : 0,
                anteil_user2: isUser1 ? 0 : 100,
            });
        }

        res.json({ success: true, id });
    } catch (err) {
        console.error('Ausgleich Fehler:', err);
        res.status(500).json({ message: err.message });
    }
});

// --- Fixkosten als Transaktion buchen ---

router.post('/haushalt/fixkosten/:id/buchen', requireLogin, async (req, res) => {
    try {
        const db = await Database.getInstance();
        const haushalt = await db.getHaushaltForUser(req.session.userId);
        if (!haushalt) return res.status(404).json({ message: 'Kein Haushalt' });
        const fixkosten = await db.getHaushaltFixkosten(haushalt.id);
        const f = fixkosten.find(x => x.id == req.params.id);
        if (!f) return res.status(404).json({ message: 'Fixkosten nicht gefunden' });
        const konten = await db.getHaushaltKonten(haushalt.id);
        const konto = konten[0];
        if (!konto) return res.status(400).json({ message: 'Kein Haushaltskonto vorhanden' });
        const txId = await db.addHaushaltTransaktion(haushalt.id, req.session.userId, {
            type: 'outbound', name: f.name,
            amount: f.betrag, category: f.kategorie,
            date: new Date().toISOString().substring(0, 10),
            konto_id: konto.id
        });
        res.json({ message: 'Als Transaktion gebucht', id: txId });
    } catch (err) { res.status(500).json({ message: err.message }); }
});

// --- Rechtliche Seiten ---

router.get('/impressum', (req, res) => {
    res.render('impressum', { isLoggedIn: getIsLoggedIn(req) });
});

router.get('/datenschutz', (req, res) => {
    res.render('datenschutz', { isLoggedIn: getIsLoggedIn(req) });
});

router.get('/agb', (req, res) => {
    res.render('agb', { isLoggedIn: getIsLoggedIn(req) });
});

// --- E-Mail Bestätigung ---

router.get('/verify-email', async (req, res) => {
    const { token } = req.query;
    if (!token) return res.redirect('/users/login');
    try {
        const db = await Database.getInstance();
        const user = await db.getUserByVerifyToken(token);
        if (!user) {
            return res.render('login_tpl', { isLoggedIn: false, error: 'Der Bestätigungslink ist ungültig oder bereits verwendet.', twoFactor: false });
        }
        await db.verifyEmail(token);
        // Auto-Login nach Bestätigung
        req.session.username = user.email;
        req.session.userId = user.id;
        req.session.isNewUser = true;
        return res.redirect('/users/onboarding');
    } catch (err) {
        console.error(err);
        res.status(500).send('Interner Serverfehler');
    }
});

// --- Onboarding ---

router.get('/onboarding', requireLogin, async (req, res) => {
    res.render('onboarding', { isLoggedIn: true, username: req.session.username });
});

router.post('/onboarding/complete', requireLogin, async (req, res) => {
    try {
        const db = await Database.getInstance();
        await db.completeOnboarding(req.session.userId);
        await db.seedDefaultCategories(req.session.userId); // Default-Kategorien für neuen User anlegen
        req.session.isNewUser = false;
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});


// ── UNIFIED FIXKOSTEN/ABOS/RECURRING ──────────────────────

// 1. Alle unified Einträge (Fixkosten + Abos + Recurring)
router.get('/fixkosten/unified', requireLogin, async (req, res) => {
    try {
        const db = await Database.getInstance();
        res.json(await db.getFixkostenUnified(req.session.userId));
    } catch (err) {
        console.error('Fehler beim Abrufen unified Fixkosten:', err);
        res.status(500).json({ message: 'Interner Serverfehler', error: err.message });
    }
});

// 2. Legacy-Liste (für alte Seiten wie meine-finanzen/overview)
router.get('/fixkosten/list', requireLogin, async (req, res) => {
    try {
        const db = await Database.getInstance();
        res.json(await db.getFixkosten(req.session.userId) || []);
    } catch (err) {
        console.error('Fehler beim Abrufen legacy Fixkosten:', err);
        res.status(500).json([]);
    }
});

// 3. Neuen unified Eintrag hinzufügen
router.post('/fixkosten/unified/add', requireLogin, async (req, res) => {
    const { name, betrag } = req.body;
    if (!name || betrag === undefined) {
        return res.status(400).json({ message: 'Name und Betrag erforderlich' });
    }

    try {
        const db = await Database.getInstance();
        const id = await db.addFixkostUnified(req.session.userId, req.body);
        db.logActivity(req.session.userId, 'erstellt', 'Fixkosten', id, { name, betrag: parseFloat(betrag) });
        res.status(201).json({ id, message: 'Eintrag gespeichert' });
    } catch (err) {
        console.error('Fehler beim Hinzufügen unified Fixkost:', err);
        res.status(500).json({ message: 'Interner Serverfehler', error: err.message });
    }
});

// 4. Unified Eintrag aktualisieren
router.put('/fixkosten/unified/:id', requireLogin, async (req, res) => {
    try {
        const db = await Database.getInstance();
        await db.updateFixkostUnified(req.session.userId, req.params.id, req.body);
        res.json({ message: 'Aktualisiert' });
    } catch (err) {
        console.error('Fehler beim Aktualisieren unified Fixkost:', err);
        res.status(500).json({ message: 'Interner Serverfehler', error: err.message });
    }
});

// 5. Unified Eintrag löschen
router.delete('/fixkosten/unified/:id', requireLogin, async (req, res) => {
    try {
        const db = await Database.getInstance();
        const allFk = await db.getFixkostenUnified(req.session.userId);
        const fk = allFk.find(f => f.id == req.params.id);
        await db.deleteFixkost(req.session.userId, req.params.id);
        if (fk) db.logActivity(req.session.userId, 'gelöscht', 'Fixkosten', parseInt(req.params.id), { name: fk.name });
        res.json({ message: 'Gelöscht' });
    } catch (err) {
        console.error('Fehler beim Löschen unified Fixkost:', err);
        res.status(500).json({ message: 'Interner Serverfehler', error: err.message });
    }
});

// 6. Unified Eintrag manuell buchen
router.post('/fixkosten/unified/:id/book', requireLogin, async (req, res) => {
    try {
        const db = await Database.getInstance();
        const result = await db.bookFixkostUnified(req.session.userId, req.params.id);
        res.json({ message: 'Gebucht', ...result });
    } catch (err) {
        if (err.message === 'KEIN_KONTO') {
            return res.status(400).json({ code: 'KEIN_KONTO', message: 'Kein Konto hinterlegt. Bitte Fixkost bearbeiten und ein Konto zuweisen.' });
        }
        console.error('Fehler beim manuellen Buchen unified Fixkost:', err);
        res.status(500).json({ message: 'Interner Serverfehler', error: err.message });
    }
});
export default router;