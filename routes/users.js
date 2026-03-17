import express from 'express';
import { check, validationResult } from 'express-validator';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import Database from '../modules/database.js';
import { sendMail, greetingHtml, ctaButtonHtml, dividerHtml, sectionTitleHtml } from '../modules/mailer.js';

const router = express.Router();

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
        return res.redirect('/users/overview');
    }
    res.render('login_tpl', { isLoggedIn: false, error: null });
});

// Route für Login
router.post('/check_login', async (req, res) => {
    const username = req.body.user;
    const password = req.body.pw;
    try {
        const db = await Database.getInstance();
        const isValid = await db.validateUser(username, password);
        if (isValid) {
            // E-Mail-Bestätigung prüfen
            const user = await db.getUserByEmail(username);
            if (!user || !user.email_verified) {
                return res.render('login_tpl', { isLoggedIn: false, error: 'Bitte bestätige zuerst deine E-Mail-Adresse. Schau in dein Postfach.' });
            }
            req.session.username = username;
            req.session.userId = user.id;
            if (user.is_new_user) {
                return res.redirect('/users/onboarding');
            }
            res.redirect('/users/overview');
        } else {
            res.render('login_tpl', { isLoggedIn: false, error: 'Benutzer existiert nicht oder Passwort ist ungültig' });
        }
    } catch (error) {
        console.error(error);
        res.status(500).send('Interner Serverfehler');
    }
});

// Route für Registrierung
router.post('/register', [
    check('user').trim().notEmpty().isEmail().withMessage('Bitte geben Sie eine gültige E-Mail-Adresse ein'),
    check('pw').notEmpty().withMessage('Passwort fehlt'),
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
        const transactionType = type === "inbound" ? "Einnahmen" : "Ausgaben";
        const transactionId = await db.saveTransaction(
            userId, name, category, date, parseFloat(amount), transactionType,
            account_id ? parseInt(account_id) : null
        );
        res.status(201).json({ message: 'Transaktion erfolgreich hinzugefügt', transactionId });
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
            const deleteResult = await db.deleteTransaction(userId, transactionId);
            console.log('Löschergebnis:', deleteResult);
            if (deleteResult) {
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

router.get('/todo', async (req, res) => {
    if (!req.session.username) return res.redirect('/users/login');
    res.render('todo', { isLoggedIn: true });
});

// JSON API: Alle Todos laden
router.get('/todos', async (req, res) => {
    if (!req.session.username || !req.session.userId) {
        return res.status(401).json({ message: 'Nicht autorisiert' });
    }
    try {
        const db    = await Database.getInstance();
        const todos = await db.getTodosForUser(req.session.userId);
        res.json(todos);
    } catch (error) {
        console.error('Fehler beim Abrufen der Todos:', error);
        res.status(500).json({ message: 'Interner Serverfehler' });
    }
});

// JSON API: Todo hinzufügen
router.post('/todos/add', async (req, res) => {
    if (!req.session.username) return res.status(401).json({ message: 'Nicht autorisiert' });
    const { task, quantity, priority, due_date, label, notes } = req.body;
    if (!task) return res.status(400).json({ message: 'Aufgabe erforderlich' });
    try {
        const db = await Database.getInstance();
        const id = await db.addTodo(req.session.userId, task, parseInt(quantity) || 0, priority || 'mittel', due_date || null, label || '', notes || '');
        res.status(201).json({ id, message: 'Todo erstellt' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Interner Serverfehler' });
    }
});

// JSON API: Todo bearbeiten
router.put('/todos/:id', async (req, res) => {
    if (!req.session.username) return res.status(401).json({ message: 'Nicht autorisiert' });
    try {
        const db = await Database.getInstance();
        await db.updateTodo(req.session.userId, req.params.id, req.body);
        res.json({ message: 'Todo aktualisiert' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Fehler beim Aktualisieren' });
    }
});

// JSON API: Todo als erledigt markieren / wieder öffnen
router.patch('/todos/:id', async (req, res) => {
    if (!req.session.username || !req.session.userId) {
        return res.status(401).json({ message: 'Nicht autorisiert' });
    }
    const { completed } = req.body;
    try {
        const db = await Database.getInstance();
        if (completed) {
            await db.completeTodo(req.session.userId, req.params.id);
        } else {
            await db.uncompleteTodo(req.session.userId, req.params.id);
        }
        res.status(200).json({ message: 'Todo-Status aktualisiert' });
    } catch (error) {
        console.error('Fehler beim Aktualisieren des Todo-Status:', error);
        res.status(500).json({ message: 'Interner Serverfehler' });
    }
});

// JSON API: Zähler erhöhen
router.post('/todos/:id/increment', async (req, res) => {
    if (!req.session.username) return res.status(401).json({ message: 'Nicht autorisiert' });
    try {
        const db      = await Database.getInstance();
        const success = await db.incrementTodo(req.session.userId, req.params.id);
        if (success) res.json({ message: 'Erhöht' });
        else res.status(400).json({ message: 'Zähler konnte nicht erhöht werden' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Interner Serverfehler' });
    }
});

// JSON API: Todo löschen
router.delete('/todos/:id', async (req, res) => {
    if (!req.session.username) return res.status(401).json({ message: 'Nicht autorisiert' });
    try {
        const db = await Database.getInstance();
        await db.deleteTodo(req.session.userId, req.params.id);
        res.json({ message: 'Todo gelöscht' });
    } catch (error) {
        console.error('Fehler beim Löschen:', error);
        res.status(500).json({ message: 'Interner Serverfehler' });
    }
});

// Legacy POST-Routen (Rückwärtskompatibilität für Dashboard etc.)
router.post('/todo/add', async (req, res) => {
    if (!req.session.username) return res.status(401).send('Nicht autorisiert');
    const { task, quantity } = req.body;
    if (!task) return res.status(400).send('Aufgabe erforderlich');
    try {
        const db = await Database.getInstance();
        await db.addTodo(req.session.userId, task, parseInt(quantity) || 0);
        res.redirect('/users/todo');
    } catch (error) {
        console.error(error);
        res.status(500).send('Interner Serverfehler');
    }
});

router.post('/todo/increment/:id', async (req, res) => {
    if (!req.session.username) return res.status(401).send('Nicht autorisiert');
    try {
        const db      = await Database.getInstance();
        const success = await db.incrementTodo(req.session.userId, req.params.id);
        if (success) res.redirect('/users/todo');
        else res.status(400).send('Zähler konnte nicht erhöht werden');
    } catch (error) {
        console.error(error);
        res.status(500).send('Interner Serverfehler');
    }
});

router.post('/todo/complete/:id', async (req, res) => {
    if (!req.session.username) return res.status(401).send('Nicht autorisiert');
    try {
        const db = await Database.getInstance();
        await db.completeTodo(req.session.userId, req.params.id);
        res.redirect('/users/todo');
    } catch (error) {
        console.error(error);
        res.status(500).send('Interner Serverfehler');
    }
});

router.post('/todo/delete/:id', async (req, res) => {
    if (!req.session.username) return res.status(401).send('Nicht autorisiert');
    try {
        const db = await Database.getInstance();
        await db.deleteTodo(req.session.userId, req.params.id);
        res.redirect('/users/todo');
    } catch (error) {
        console.error('Fehler beim Löschen:', error);
        res.status(500).send('Interner Serverfehler');
    }
});

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

// ── Plan-Helper ───────────────────────────────────────────────

async function getUserPlan(userId) {
    const db = await Database.getInstance();
    return db.getUserPlan(userId);
}

// ── Tarif / Upgrade Routen ────────────────────────────────────

router.get('/tarife', requireLogin, async (req, res) => {
    const plan = await getUserPlan(req.session.userId);
    const reason = req.query.reason || null;
    res.render('tarife', { isLoggedIn: true, currentPlan: plan, reason });
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

router.get('/me/plan', requireLogin, async (req, res) => {
    try {
        const plan = await getUserPlan(req.session.userId);
        res.json({ plan });
    } catch { res.json({ plan: 'free' }); }
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

// Seite: Meine Finanzen
router.get('/meine-finanzen', requireLogin, (req, res) => {
    res.render('meine-finanzen');
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
// ══════════════════════════════════════════════════════════
// ── UNIFIED FIXKOSTEN/ABOS/RECURRING ──────────────────────
// ══════════════════════════════════════════════════════════

// Seite: einzige Anlaufstelle für alle wiederkehrenden Zahlungen
router.get('/fixkosten', requireLogin, (req, res) => {
    res.render('fixkosten', { isLoggedIn: true });
});

// API: Alle unified Einträge laden
router.get('/fixkosten/unified', requireLogin, async (req, res) => {
    try {
        const db = await Database.getInstance();
        res.json(await db.getFixkostenUnified(req.session.userId));
    } catch (err) { res.status(500).json([]); }
});

// API: Legacy-Liste (für meine-finanzen, overview etc.)
router.get('/fixkosten/list', requireLogin, async (req, res) => {
    try {
        const db = await Database.getInstance();
        res.json(await db.getFixkosten(req.session.userId) || []);
    } catch (err) { res.status(500).json([]); }
});

// API: Neuen unified Eintrag hinzufügen
router.post('/fixkosten/unified/add', requireLogin, async (req, res) => {
    const { name, betrag } = req.body;
    if (!name || betrag === undefined) return res.status(400).json({ message: 'Name und Betrag erforderlich' });
    try {
        const db = await Database.getInstance();
        const id = await db.addFixkostUnified(req.session.userId, req.body);
        res.status(201).json({ id, message: 'Eintrag gespeichert' });
    } catch (err) { console.error(err); res.status(500).json({ message: 'Interner Serverfehler' }); }
});

// API: Unified Eintrag aktualisieren
router.put('/fixkosten/unified/:id', requireLogin, async (req, res) => {
    try {
        const db = await Database.getInstance();
        await db.updateFixkostUnified(req.session.userId, req.params.id, req.body);
        res.json({ message: 'Aktualisiert' });
    } catch (err) { res.status(500).json({ message: 'Fehler' }); }
});

// API: Unified Eintrag löschen
router.delete('/fixkosten/unified/:id', requireLogin, async (req, res) => {
    try {
        const db = await Database.getInstance();
        await db.deleteFixkost(req.session.userId, req.params.id);
        res.json({ message: 'Gelöscht' });
    } catch (err) { res.status(500).json({ message: 'Fehler' }); }
});

// API: Unified Eintrag manuell buchen
router.post('/fixkosten/unified/:id/book', requireLogin, async (req, res) => {
    try {
        const db = await Database.getInstance();
        const result = await db.bookFixkostUnified(req.session.userId, req.params.id);
        res.json({ message: 'Gebucht', ...result });
    } catch (err) { res.status(500).json({ message: err.message || 'Fehler' }); }
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

// 4. Kategorien laden (für Ausgabentracker + Finanzen)
router.get('/categories', requireLogin, async (req, res) => {
    try {
        const db = await Database.getInstance();
        const cats = await db.getCategories(req.session.userId);
        res.json(cats.map(c => c.name));
    } catch (err) {
        console.error(err);
        res.json([]);
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
        await db.updateTransaction(req.session.userId, req.params.id, name, category, parseFloat(amount), date, type, account_id || null);
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
        res.json(await db.getAccountsWithBalance(req.session.userId));
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
        res.status(201).json({ message: 'Konto hinzugefügt', id });
    } catch (err) { res.status(500).json({ message: 'Fehler' }); }
});

router.put('/accounts/:id', requireLogin, async (req, res) => {
    const { name, type, balance, color, icon } = req.body;
    try {
        const db = await Database.getInstance();
        await db.updateAccount(req.session.userId, req.params.id, name, type, parseFloat(balance)||0, color, icon);
        res.json({ message: 'Konto aktualisiert' });
    } catch (err) { res.status(500).json({ message: 'Fehler' }); }
});

router.delete('/accounts/:id', requireLogin, async (req, res) => {
    try {
        const db = await Database.getInstance();
        await db.deleteAccount(req.session.userId, req.params.id);
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
    if (newPassword.length < 6) return res.status(400).json({ message: 'Passwort muss mindestens 6 Zeichen lang sein' });
    try {
        const db = await Database.getInstance();
        await db.updateUserPassword(req.session.userId, currentPassword, newPassword);
        res.json({ message: 'Passwort geändert' });
    } catch (err) {
        console.error(err);
        res.status(400).json({ message: err.message || 'Fehler' });
    }
});

// ── Einstellungen-Seite ─────────────────────────────────────────
router.get('/einstellungen', requireLogin, (req, res) => {
    res.render('einstellungen', { isLoggedIn: true });
});

// API: Einstellungen laden
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

router.get('/kalender', (req, res) => {
    if (!req.session.username) return res.redirect('/users/login');
    res.render('kalender', { isLoggedIn: true });
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
router.post('/dokumente/add', requireLogin, async (req, res) => {
    const { name, typ } = req.body;
    if (!name || !typ) return res.status(400).json({ message: 'Name und Typ erforderlich' });
    try {
        const db = await Database.getInstance();
        const id = await db.addDokument(req.session.userId, req.body);
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
        await db.deleteDokument(req.session.userId, req.params.id);
        res.json({ message: 'Dokument gelöscht' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Fehler beim Löschen' });
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
        res.status(201).json({ id, message: 'Budget gespeichert' });
    } catch (err) { res.status(500).json({ message: 'Fehler' }); }
});

router.put('/budgets/:id', requireLogin, async (req, res) => {
    const { kategorie, betrag } = req.body;
    try {
        const db = await Database.getInstance();
        await db.updateBudget(req.session.userId, req.params.id, kategorie, parseFloat(betrag));
        res.json({ message: 'Budget aktualisiert' });
    } catch (err) { res.status(500).json({ message: 'Fehler' }); }
});

router.delete('/budgets/:id', requireLogin, async (req, res) => {
    try {
        const db = await Database.getInstance();
        await db.deleteBudget(req.session.userId, req.params.id);
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
    const { name, zielbetrag, gespart, datum, farbe } = req.body;
    if (!name || !zielbetrag) return res.status(400).json({ message: 'Name und Zielbetrag erforderlich' });
    try {
        const db = await Database.getInstance();
        const id = await db.addSparziel(req.session.userId, name, parseFloat(zielbetrag), parseFloat(gespart) || 0, datum || null, farbe || '#6358e6');
        res.status(201).json({ id, message: 'Sparziel erstellt' });
    } catch (err) { res.status(500).json({ message: 'Fehler' }); }
});

router.put('/sparziele/:id', requireLogin, async (req, res) => {
    const { name, zielbetrag, gespart, datum, farbe } = req.body;
    try {
        const db = await Database.getInstance();
        await db.updateSparziel(req.session.userId, req.params.id, name, parseFloat(zielbetrag), parseFloat(gespart) || 0, datum || null, farbe);
        res.json({ message: 'Aktualisiert' });
    } catch (err) { res.status(500).json({ message: 'Fehler' }); }
});

router.post('/sparziele/:id/add', requireLogin, async (req, res) => {
    const { betrag } = req.body;
    if (!betrag) return res.status(400).json({ message: 'Betrag erforderlich' });
    try {
        const db = await Database.getInstance();
        await db.addToSparziel(req.session.userId, req.params.id, parseFloat(betrag));
        res.json({ message: 'Betrag hinzugefügt' });
    } catch (err) { res.status(500).json({ message: 'Fehler' }); }
});

router.delete('/sparziele/:id', requireLogin, async (req, res) => {
    try {
        const db = await Database.getInstance();
        await db.deleteSparziel(req.session.userId, req.params.id);
        res.json({ message: 'Gelöscht' });
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
        await db.deleteSchuld(req.session.userId, req.params.id);
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
        const mitglieder = await db.getHaushaltMitglieder(haushalt.id);
        // Kontostand für Dashboard-Widget
        const konto = await db.getHaushaltKontoMitStand(haushalt.id);
        res.json({ haushalt, mitglieder, konto: konto || null });
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
        // Zufälligen Code generieren
        const code = Math.random().toString(36).substring(2, 10).toUpperCase();
        await db.createHaushaltEinladung(haushalt.id, req.session.userId, email, code);
        res.json({ code, message: 'Einladungscode erstellt' });
    } catch (err) { res.status(500).json({ message: err.message }); }
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
        const id = await db.addHaushaltPersoenlicheFixkost(haushalt.id, req.session.userId, req.body);
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
        await db.setHaushaltGehaltDefault(haushalt.id, req.session.userId, gehalt, sparbetrag);
        res.json({ message: 'Gespeichert' });
    } catch (err) { res.status(500).json({ message: err.message }); }
});

router.post('/haushalt/gehaelter/monat/:monat', requireLogin, async (req, res) => {
    const { gehalt, sparbetrag } = req.body;
    try {
        const db = await Database.getInstance();
        const haushalt = await db.getHaushaltForUser(req.session.userId);
        if (!haushalt) return res.status(404).json({ message: 'Kein Haushalt' });
        await db.setHaushaltGehaltMonat(haushalt.id, req.session.userId, req.params.monat, gehalt, sparbetrag);
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
        const id = await db.addHaushaltTransaktion(haushalt.id, req.session.userId, {
            name:         req.body.name,
            category:     req.body.kategorie || req.body.category || 'Sonstiges',
            amount:       Math.abs(parseFloat(req.body.betrag || req.body.amount) || 0),
            type:         req.body.type || 'Ausgaben',
            date:         req.body.datum || req.body.date || new Date().toISOString().slice(0, 10),
            notiz:        req.body.notiz || '',
            anteil_user1: req.body.anteil_user1 ?? 50,
            anteil_user2: req.body.anteil_user2 ?? 50,
        });
        res.status(201).json({ id });
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
        await db.completeHaushaltTodo(haushalt.id, req.params.id);
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

// Vollwertiger Haushalt-Ausgabentracker
router.get('/haushalt/tracker', requireLogin, async (req, res) => {
    res.render('haushalt-tracker', { isLoggedIn: true });
});

// Haushalt-Tracker: Kategorien (Standard-Set, kein custom per User)
router.get('/haushalt/tracker/categories', requireLogin, async (req, res) => {
    try {
        const db = await Database.getInstance();
        const haushalt = await db.getHaushaltForUser(req.session.userId);
        if (!haushalt) return res.json([]);
        const cats = await db.getHaushaltTrackerCategories(haushalt.id);
        res.json(cats);
    } catch (err) { res.status(500).json({ message: err.message }); }
});

// Haushalt-Tracker: Konten (kein Konto-Filter im Haushalt nötig – leeres Array)
router.get('/haushalt/tracker/accounts', requireLogin, async (req, res) => {
    res.json([]);
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

// Konto-Status abrufen (mit aktuellem Stand)
router.get('/haushalt/konto/data', requireLogin, async (req, res) => {
    try {
        const db = await Database.getInstance();
        const haushalt = await db.getHaushaltForUser(req.session.userId);
        if (!haushalt) return res.json({ konto: null });
        const konto = await db.getHaushaltKontoMitStand(haushalt.id);
        res.json({ konto });
    } catch (err) { res.status(500).json({ message: err.message }); }
});

// Konto anlegen
router.post('/haushalt/konto/create', requireLogin, async (req, res) => {
    try {
        const db = await Database.getInstance();
        const haushalt = await db.getHaushaltForUser(req.session.userId);
        if (!haushalt) return res.status(404).json({ message: 'Kein Haushalt gefunden' });
        const existing = await db.getHaushaltKonto(haushalt.id);
        if (existing) return res.status(409).json({ message: 'Haushaltskonto existiert bereits' });
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
        const existing = await db.getHaushaltKonto(haushalt.id);
        if (existing) return res.status(409).json({ message: 'Haushaltskonto existiert bereits' });

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

// Konto bearbeiten
router.patch('/haushalt/konto', requireLogin, async (req, res) => {
    try {
        const db = await Database.getInstance();
        const haushalt = await db.getHaushaltForUser(req.session.userId);
        if (!haushalt) return res.status(404).json({ message: 'Kein Haushalt' });
        const { name, balance, color } = req.body;
        await db.updateHaushaltKonto(haushalt.id, name, parseFloat(balance) || 0, color);
        res.json({ message: 'Gespeichert' });
    } catch (err) { res.status(500).json({ message: err.message }); }
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
        const id = await db.addHaushaltTransaktion(haushalt.id, req.session.userId, req.body);
        res.json({ id, message: 'Transaktion hinzugefügt' });
    } catch (err) { res.status(500).json({ message: err.message }); }
});

router.put('/haushalt/transaktionen/:id', requireLogin, async (req, res) => {
    try {
        const db = await Database.getInstance();
        const haushalt = await db.getHaushaltForUser(req.session.userId);
        if (!haushalt) return res.status(404).json({ message: 'Kein Haushalt' });
        await db.updateHaushaltTransaktion(haushalt.id, req.params.id, req.body);
        res.json({ message: 'Aktualisiert' });
    } catch (err) { res.status(500).json({ message: err.message }); }
});

router.delete('/haushalt/transaktionen/:id', requireLogin, async (req, res) => {
    try {
        const db = await Database.getInstance();
        const haushalt = await db.getHaushaltForUser(req.session.userId);
        if (!haushalt) return res.status(404).json({ message: 'Kein Haushalt' });
        await db.deleteHaushaltTransaktion(haushalt.id, req.params.id);
        res.json({ message: 'Gelöscht' });
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
            return res.render('login_tpl', { isLoggedIn: false, error: 'Der Bestätigungslink ist ungültig oder bereits verwendet.' });
        }
        await db.verifyEmail(token);
        // Auto-Login nach Bestätigung
        req.session.username = user.email;
        req.session.userId = user.id;
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
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

export default router;