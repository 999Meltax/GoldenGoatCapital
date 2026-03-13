import express from 'express';
import Database from '../modules/database.js';

const router = express.Router();

// Route für Info
router.get('/', async (req, res) => {
    if (!req.session.username) {
        return res.redirect('/users/login');
    }
    console.log("startseite.js");
    try {
        const db = await Database.getInstance();
        const profil = await db.getProfil(req.session.username);

        if (profil) {
            res.render('C:/Users/max.delafuente/Documents/Mein Projekt/views/startseite.html', { profil });
        } else {
            res.status(404).send('Profil nicht gefunden');
        }
    } catch (error) {
        console.error(error);
        res.status(500).send('Interner Serverfehler');
    }
});

export default router;