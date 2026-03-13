import 'dotenv/config';
import express from 'express';
import path from 'path';
import bodyParser from 'body-parser';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import session from 'express-session';
import usersRouter from './routes/users.js';
import ejsMate from 'ejs-mate';
import Database from './modules/database.js';
import infoRouter from './routes/Startseite.js';
import cron from 'node-cron';
import { Sequelize } from 'sequelize';
import './modules/reminder.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

// Body Parser Middleware
app.use(bodyParser.urlencoded({ extended: true, limit: "15mb" }));
app.use(bodyParser.json({ limit: "15mb" }));

// Session Middleware
app.use(session({
    secret: 'secret_key',
    resave: false,
    saveUninitialized: true,
}));

// Globale Template-Variablen
app.use((req, res, next) => {
    res.locals.isLoggedIn = !!req.session.username;
    res.locals.username = req.session.username || null;
    res.locals.userId = req.session.userId || null;
    next();
});

// Template-Engine
app.engine('html', ejsMate);
app.set('view engine', 'html');
app.set('views', path.join(__dirname, 'views'));

// Routen
app.use('/users', usersRouter);
app.use('/Startseite', infoRouter);

app.get('/', (req, res) => {
    res.render('startseite');
});

app.use(express.static(path.join(__dirname, 'public')));

// === AUTOMATISCHE EINTRÄGE (wie deine Google Scripts) ===
async function startCronJobs() {
    const dbInstance = await Database.getInstance();

    cron.schedule('0 0 * * *', async () => {
        console.log('Cron: Automatische Einträge werden geprüft...');
        try {
            const users = await dbInstance._database.query('SELECT id FROM users', { 
                type: Sequelize.QueryTypes.SELECT 
            });
            for (const user of users) {
                await dbInstance.addAutomatischeEintrage(user.id);
            }
            console.log(`Cron fertig – ${users.length} User bearbeitet`);

            // Haushalt-Fixkosten automatisch eintragen
            const haushalte = await dbInstance._database.query('SELECT id FROM haushalte', {
                type: Sequelize.QueryTypes.SELECT
            });
            for (const h of haushalte) {
                try {
                    await dbInstance.addHaushaltFixkostenTransaktionen(h.id);
                } catch (e) {
                    console.error('Haushalt Fixkosten Cron Fehler (haushalt_id=' + h.id + '):', e.message);
                }
            }
            console.log(`Haushalt-Fixkosten Cron fertig – ${haushalte.length} Haushalte bearbeitet`);
        } catch (err) {
            console.error('Cron-Fehler:', err);
        }
    });

    console.log('Cron-Job erfolgreich gestartet (täglich 00:00)');
}

// Server starten
app.listen(PORT, async () => {
    console.log(`Server läuft auf http://localhost:${PORT}`);
    await startCronJobs();
});