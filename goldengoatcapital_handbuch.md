# GoldenGoat Capital – Technisches Handbuch
**Stand: März 2026 | Version 3.1**

---

## Inhaltsverzeichnis

1. [Systemübersicht](#1-systemübersicht)
2. [Architektur & Technik](#2-architektur--technik)
3. [Authentifizierung & Benutzerverwaltung](#3-authentifizierung--benutzerverwaltung)
4. [Tarife & Limitierungen](#4-tarife--limitierungen)
5. [Konten-System](#5-konten-system)
6. [Ausgabentracker & Transaktionen](#6-ausgabentracker--transaktionen)
7. [Konto-zu-Konto-Transfers](#7-konto-zu-konto-transfers)
8. [CSV-Import](#8-csv-import)
9. [Budget & Sparziele](#9-budget--sparziele)
10. [Fixkosten & Abos](#10-fixkosten--abos)
11. [Schulden-Tracker](#11-schulden-tracker)
12. [Regeln & Automationen](#12-regeln--automationen)
13. [Steuer-Modul](#13-steuer-modul)
14. [Aktivitätsprotokoll](#14-aktivitätsprotokoll)
15. [Haushalt-Modus](#15-haushalt-modus)
16. [Dashboard & Übersichten](#16-dashboard--übersichten)
17. [Kalender](#17-kalender)
18. [In-App Notifications](#18-in-app-notifications)
19. [Dokumente](#19-dokumente)
20. [Versicherungen](#20-versicherungen)
21. [Globale Suche](#21-globale-suche)
22. [Datenexport](#22-datenexport)
23. [Einstellungen & Profil](#23-einstellungen--profil)
24. [Feature-Interaktionen (Gesamtbild)](#24-feature-interaktionen-gesamtbild)
25. [PWA (Progressive Web App)](#25-pwa-progressive-web-app)
26. [Bekannte Schwachstellen & Verbesserungspotenziale](#26-bekannte-schwachstellen--verbesserungspotenziale)

---

## 1. Systemübersicht

GoldenGoat Capital ist eine persönliche Finanzverwaltungsanwendung, die lokal auf einem Server läuft. Sie bietet zwei vollständig getrennte Modi:

- **Privat-Modus**: Individuelle Finanzverwaltung für einen einzelnen Nutzer (Transaktionen, Konten, Budgets, Sparziele, Schulden, Steuern etc.)
- **Haushalt-Modus**: Gemeinsame Finanzverwaltung für zwei Personen mit Kostenaufteilung, gemeinsamen Konten und gemeinsamer Aufgabenverwaltung

Der Moduswechsel erfolgt über den Sidebar-Toggle. Der gewählte Modus wird sowohl im **localStorage** als auch in der **Server-Session** (`req.session.sidebar_mode`) gespeichert. `navheader.js` rendert sofort aus localStorage (kein Flash), gleicht dann mit dem Server ab. Haushalt-Seiten aktualisieren die Session automatisch.

---

## 2. Architektur & Technik

### Tech-Stack

| Schicht | Technologie |
|--------|-------------|
| Backend | Node.js (ES Modules), Express.js |
| Datenbank | SQLite3 via Sequelize ORM |
| Templating | EJS (`.html`-Dateiendung in `/views`) |
| Frontend | Vanilla JavaScript, Vanilla CSS |
| Auth | express-session, bcryptjs, TOTP (2FA) |
| E-Mail | Nodemailer |
| Cron-Jobs | node-cron |

### Datenbankdatei
```
db/webengDB.db  (SQLite, eine einzige Datei)
```

### Projektstruktur
```
server.js              → Express-Einstiegspunkt (Port 3000)
modules/
  database.js          → Singleton: alle DB-Tabellen + Methoden
  mailer.js            → E-Mail-Versand (Nodemailer)
  reminder.js          → Cron-Jobs für Erinnerungen
  profil.js            → Profilhilfsfunktionen
routes/
  users.js             → Alle Auth- + Nutzer-API-Routen
  Startseite.js        → Landingpage
views/                 → EJS-Templates (alle als .html)
public/                → Statische Assets, Client-JS, styles.css
```

### Initialisierung der Datenbank
`database.js` wird als **Singleton** via `Database.getInstance()` verwendet. Beim ersten Aufruf werden alle Tabellen per `CREATE TABLE IF NOT EXISTS` angelegt und fehlende Spalten via `try { ALTER TABLE ... } catch(e) {}` nachgerüstet. Migrations laufen automatisch beim Start. Das ermöglicht Zero-Downtime-Migrationen.

### Route-Konvention
- **Spezifische Routen** müssen immer **vor** parametrisierten Routen stehen:
  `GET /fixkosten/list` vor `GET /fixkosten/:id`
- **API-Routen** geben JSON zurück, **Seiten-Routen** rendern HTML – niemals mischen
- `requireLogin`-Middleware ist bei Zeile ~722 in `routes/users.js` definiert – alle Routen die sie nutzen müssen **danach** stehen

---

## 3. Authentifizierung & Benutzerverwaltung

### Tabellen
```sql
users (id, username, email, password [bcrypt-Hash], created_at)
user_profiles (user_id PK, display_name, avatar_url, tarif ['basis'|'pro'])
user_settings (user_id PK, language, theme ['dark'|'light'], currency,
               date_format, notifications_email, notifications_browser, two_factor,
               reminder_rechnungen, reminder_budget, reminder_sparziele)
totp_secrets (user_id PK, secret, enabled [0|1])
```

### Login-Ablauf
1. Nutzer gibt E-Mail + Passwort ein
2. Passwort wird mit `bcrypt.compare()` geprüft
3. Bei aktivierter 2FA: TOTP-Code-Eingabe als zweiter Schritt
4. Bei Erfolg: `req.session.userId` wird gesetzt
5. `requireLogin`-Middleware prüft bei jeder Anfrage ob `req.session.userId` existiert

### 2FA / TOTP
- Aktivierung über Einstellungen: QR-Code scannen mit Authenticator-App
- Geheimnis wird in `totp_secrets` gespeichert (`enabled = 1`)
- Bei Login: TOTP-Code wird mit `totp.verify()` geprüft (30-Sekunden-Fenster)
- Deaktivierung setzt `enabled = 0`

### Sidebar-Modus (serverseitig)
```
GET  /users/me/mode   → { mode: 'privat' | 'haushalt' }
POST /users/me/mode   → Body: { mode } → speichert in req.session.sidebar_mode
```
`navheader.js` liest den Modus sofort aus localStorage (Flash-free), gleicht dann asynchron mit dem Server ab. Haushalt-Seiten senden beim Laden automatisch `POST /me/mode` mit `'haushalt'`.

---

## 4. Tarife & Limitierungen

| Feature | Basis (kostenlos) | Pro |
|---------|-------------------|-----|
| Private Konten | max. 3 | unbegrenzt |
| Haushalt-Modus | ✗ | ✓ |
| PDF-Export | ✗ | ✓ |
| Datenexport (CSV/JSON) | ✓ | ✓ |
| Alle anderen Features | ✓ | ✓ |

Tarif-Feld: `user_profiles.tarif` → `'basis'` oder `'pro'`

Die Tarifprüfung erfolgt serverseitig beim Anlegen eines neuen Kontos. Die Tarif-Verwaltungsseite ist unter `/users/tarife` erreichbar. Der aktuelle Tarif wird als Badge in der Sidebar angezeigt (`#sidebarPlanBadge`).

---

## 5. Konten-System

### Tabelle
```sql
accounts (
    id, user_id,
    name TEXT,
    type TEXT,        -- 'girokonto'|'sparkonto'|'bargeld'|'depot'|'sonstiges'
    balance REAL,     -- manuell gesetzter Startbetrag / letzter Abgleich
    color TEXT,       -- Hex-Farbe für UI
    icon TEXT         -- RemixIcon-Klasse
)
```

### Kontostand-Berechnung
Der angezeigte **aktuelle Kontostand** wird dynamisch berechnet:
```
currentBalance = accounts.balance
              + SUM(Einnahmen-Transaktionen für dieses Konto)
              - SUM(Ausgaben-Transaktionen für dieses Konto)
```
`accounts.balance` ist der **Startbetrag**. Alle danach erfassten Transaktionen mit `account_id` werden addiert/subtrahiert.

### Kontostand-Abgleich
Der Nutzer gibt den tatsächlichen Kontostand ein. Der Server berechnet die **Differenz** und erstellt eine Ausgleichs-Transaktion (Kategorie: „Kontostandskorrektur"). `accounts.balance` wird **nicht** überschrieben – die Geschichte bleibt erhalten.

### API-Endpunkte
| Methode | Route | Funktion |
|---------|-------|----------|
| GET | `/accounts` | Alle Konten mit currentBalance |
| GET | `/accounts/all` | Privat + Haushalt-Konten kombiniert |
| POST | `/accounts/add` | Neues Konto erstellen |
| PUT | `/accounts/:id` | Konto bearbeiten |
| DELETE | `/accounts/:id` | Konto löschen |
| POST | `/accounts/:id/abgleich` | Kontostand-Abgleich |

---

## 6. Ausgabentracker & Transaktionen

### Tabelle
```sql
ausgabenDB (
    id, user_id,
    name TEXT,
    category TEXT,                -- Freitext (Rückwärtskompatibilität)
    category_id INTEGER,          -- FK auf categories.id (normalisiert, seit v3.0)
    date TEXT,                    -- ISO-Format: YYYY-MM-DD
    amount REAL,                  -- immer positiv
    type TEXT,                    -- 'Einnahmen' | 'Ausgaben'
    account_id INTEGER,           -- optional, FK auf accounts
    recurring_id INTEGER,         -- gesetzt wenn von Fixkost gebucht
    transfer_to_account_id INT,   -- gesetzt bei Transfers
    transfer_pair_id INTEGER,     -- ID der Gegentransaktion bei Transfers
    sparziel_id INTEGER           -- gesetzt wenn von Sparziel-Einzahlung
)
```

### Kategorien-Normalisierung (seit v3.0)
Kategorien sind in einer eigenen Tabelle verwaltet:

```sql
categories (
    id INTEGER PRIMARY KEY,
    user_id INTEGER,
    name TEXT,
    icon TEXT DEFAULT '',    -- RemixIcon-Klasse (optional)
    color TEXT DEFAULT '',   -- Hex-Farbe (optional)
    is_deleted INTEGER DEFAULT 0
)
```

**Migration (automatisch beim Start):**
1. `ALTER TABLE categories ADD COLUMN icon/color`
2. `ALTER TABLE ausgabenDB ADD COLUMN category_id`
3. Batch-Migration: alle `(user_id, category)`-Kombinationen → `categories` einfügen → `category_id` in `ausgabenDB` setzen

**`upsertCategory(userId, name)`** — sucht oder erstellt Kategorie, gibt `id` zurück. Wird von `createTransaction()` und `updateTransaction()` intern aufgerufen.

`GET /users/categories` gibt volle Objekte zurück: `{ id, name, icon, color, is_deleted }`. Clients mergen mit `DEFAULT_CATEGORIES` (lokale Standard-Liste) und filtern Duplikate.

`category TEXT` bleibt vorerst parallel gepflegt (für Rückwärtskompatibilität). Ziel: Entfernen nach stabilem Betrieb.

### Transaktionsliste

Die Tabelle hat **5 Spalten** (Sort-Header mit Klick):
| Spalte | Sortierbar | Anmerkung |
|--------|-----------|-----------|
| Checkbox | — | Select-All für Bulk-Aktionen |
| Bezeichnung | ja | Name + Konto-Name als Untertitel |
| Kategorie | ja | Icon + Kategoriename |
| Datum | ja | Sichtbar als eigene Spalte (seit v3.1) |
| Betrag | ja | **Einnahmen grün**, **Ausgaben rot** (seit v3.1) |
| Aktionen | — | Bearbeiten / Löschen |

**Kategorie-Filter-Dropdown**: Zeigt nur Kategorien, die in den aktuell geladenen Transaktionen tatsächlich vorkommen — keine leeren Einträge (seit v3.1).

### Transaktionen erfassen
- Formular: Name, Betrag, Typ, Kategorie, Datum, Konto (optional)
- **Live-Regelanwendung**: 250ms Debounce auf das Namensfeld → Kategorie + Typ werden automatisch gesetzt
- `createTransaction()` in `database.js` ruft intern `upsertCategory()` auf → `category_id` wird immer gesetzt

### Transaktionen bearbeiten
- Edit-Modal mit allen Feldern
- Transaktionen mit `recurring_id ≠ null` sind mit Schloss-Symbol markiert und **nicht editierbar**
- Transfer-Transaktionen: nicht editierbar, Löschen über eigene `deleteTransfer`-Logik
- Jede Bearbeitung schreibt Vorher/Nachher-Werte ins Activity-Log

### Transaktionen löschen (Undo-System)
Optimistisches Löschen:
1. Sofort aus Client-Array entfernen + UI neu rendern
2. Toast: „Rückgängig" (5 Sekunden)
3. Nach 5s: `DELETE /deleteTransaction/:id` an Server
4. Undo: `clearTimeout()` + Transaktion zurück ins Array

Bei Transfers: beide Transaktionen des Paares werden clientseitig entfernt, serverseitig über `DELETE /transfer/:id` gelöscht (bidirektional).

### Bulk-Auswahl & Massenaktionen (seit v3.0)
Jede Transaktionszeile hat eine **Checkbox**. Der Sort-Header hat eine Select-All-Checkbox (nur aktuelle Seite).

Sobald ≥ 1 Transaktion ausgewählt ist, erscheint eine **floating Action Bar** am unteren Bildschirmrand:
- Zeigt Anzahl der ausgewählten Transaktionen
- **Kategorie setzen**: Dropdown mit allen Kategorien → wendet sofort an
- **Löschen**: optimistisch mit 5s Undo-Toast für alle gewählten
- **✕**: Auswahl aufheben

Ausgewählte Zeilen werden blau hinterlegt. Auswahl wird bei jedem `loadData()` zurückgesetzt.

**API-Endpunkte für Bulk-Aktionen:**
| Methode | Route | Body | Funktion |
|---------|-------|------|----------|
| POST | `/transactions/bulk-delete` | `{ ids: [...] }` | Mehrere Transaktionen löschen |
| POST | `/transactions/bulk-categorize` | `{ ids: [...], category }` | Kategorie für mehrere setzen |

### API-Endpunkte
| Methode | Route | Funktion |
|---------|-------|----------|
| GET | `/getTransactions` | Alle Transaktionen des Nutzers |
| POST | `/addTransaction` | Transaktion hinzufügen (Regeln + upsertCategory) |
| PUT | `/updateTransaction/:id` | Bearbeiten (loggt Vorher/Nachher) |
| DELETE | `/deleteTransaction/:id` | Löschen |
| GET | `/categories` | Kategorien als volle Objekte `{id, name, icon, color}` |
| POST | `/categories/add` | Neue Kategorie anlegen |
| DELETE | `/categories/delete/:name` | Kategorie löschen |
| PUT | `/categories/update` | Kategorie umbenennen (synct `category` in ausgabenDB) |
| POST | `/transactions/bulk-delete` | Mehrere löschen |
| POST | `/transactions/bulk-categorize` | Kategorisieren |

---

## 7. Konto-zu-Konto-Transfers

### Konzept
Ein Transfer erzeugt immer **zwei verknüpfte Transaktionen**:
- Eine **Ausgabe** auf dem Quellkonto
- Eine **Einnahme** auf dem Zielkonto

Beide referenzieren sich gegenseitig über `transfer_pair_id`.

### Transfer-Typen
1. **Privat → Privat**: Zwischen zwei eigenen Konten
2. **Privat → Haushalt**: Vom Privatkonto auf ein Haushaltskonto
3. **Haushalt → Privat**: Vom Haushaltskonto zurück

### Transfer löschen (bidirektional, seit v3.0)
`DELETE /transfer/:id` löscht **beide** Transaktionen des Paares. Die Suche nach der Gegenseite erfolgt bidirektional:
- Primär: `WHERE id = transfer_pair_id`
- Fallback Reverse-Lookup: `WHERE transfer_pair_id = id` (verhindert Halb-Waisen bei inkonsistenten Paaren)

---

## 8. CSV-Import

### 3-Schritt-Wizard
**Schritt 1: Upload** — Drag & Drop, max. 5 MB, Bank-Presets: Auto, GoldenGoat, DKB, ING, Sparkasse, N26, Eigenes Format

**Schritt 2: Spalten-Mapping** — Pflicht: Datum, Bezeichnung, Betrag; Optional: Typ, Kategorie

**Schritt 3: Vorschau & Import**
- Import-Button steht **oben** (sichtbar ohne Scrollen)
- Editierbare Tabelle (Name, Typ, Kategorie, Konto pro Zeile)
- Auto-Kategorisierung via lokale Regeln (`applyRegelLocal`)
- **Duplikat-Check** (seit v3.1): Hash aus `name|date|amount.toFixed(2)|notes.trim()`. Wird **immer** serverseitig geprüft — keine Checkbox mehr. Duplikate werden sowohl gegen bestehende DB-Transaktionen als auch gegen den aktuellen Import-Batch geprüft. Server gibt `{ imported, skipped }` zurück.

**Zusammenfassungs-Leiste** (Schritt 3):
- Einnahmen, Ausgaben, Netto (Saldo des Imports), Anzahl Transaktionen
- Bei erkanntem Saldo-Wert (ING-Format): Stat „Ziel-Kontostand" wird eingeblendet

**Import-Endpunkt**: `POST /import/transactions`
- Gibt `{ imported: N, skipped: M }` zurück
- Loggt Activity-Log-Eintrag mit `bulk_import: N`

### Saldo-Erkennung (ING und ähnliche Banken)

Manche Banken liefern in ihrer CSV eine Spalte mit dem Kontostand nach der letzten Transaktion. Der Import-Wizard erkennt diesen Wert automatisch und zeigt ihn in der Zusammenfassungs-Leiste an.

**Saldo-Modus-Auswahl** (erscheint nur wenn Saldo erkannt):
| Option | Verhalten |
|--------|-----------|
| Auf `X,XX €` setzen (Zielkontostand) | Setzt `accounts.balance` so, dass der aktuelle Kontostand nach dem Import exakt dem erkannten Zielwert entspricht. |
| Nicht anpassen | Transaktionen werden importiert, Kontostand bleibt unverändert. |

**Technischer Ablauf bei „Zielkontostand":**
1. Server berechnet: `newStartBalance = targetBalance − (currentBalance − balance)`
2. `accounts.balance` wird aktualisiert (kein separater Abgleichs-Datensatz)
3. Erst **nach** dem Kontostand-Update wird Schritt 4 (Erfolgsmeldung) angezeigt — verhindert Race-Condition wenn Nutzer schnell navigiert

---

## 9. Budget & Sparziele

### Budget-System

#### Tabelle
```sql
budgets (id, user_id, kategorie TEXT UNIQUE per user, betrag REAL)
```

#### Funktionsweise
- Monatliches Budget pro Kategorie
- Verbrauch aus `ausgabenDB` (Typ: Ausgaben, aktiver Monat, passende Kategorie)
- **Farbampel**: grün < 70%, orange 70–90%, rot > 90%
- **Prognose** (ab Tag 3): bisherige Ausgaben ÷ vergangene Tage × Monatstage → Warnung wenn Prognose > Budget
- **Donut-Chart**: Top-8 Kategorien

---

### Sparziele

#### Tabelle
```sql
sparziele (
    id, user_id,
    name TEXT, zielbetrag REAL, gespart REAL,
    datum TEXT,     -- Zieldatum (ISO)
    farbe TEXT,     -- Hex-Farbe
    typ TEXT,       -- 'notgroschen'|'urlaub'|'auto'|'haus'|'rente'|...
    account_id INTEGER
)
```

#### Einzahlungen
`POST /sparziele/:id/add` erhöht `gespart` und erstellt optional eine Transaktion (Kategorie: „Sparziele"). `PUT /sparziele/:id` (Edit) darf `gespart` ändern **ohne** Transaktion – das ist korrekt so.

#### Konto-Aufteilung
Auf der Budget-Seite: Warnung wenn `SUM(sparziele.gespart WHERE account_id=X) > accounts.currentBalance`.

---

## 10. Fixkosten & Abos

### Tabelle (unified)
```sql
fixkosten (
    id, user_id,
    name TEXT, betrag REAL,
    datum_tag INTEGER,          -- Tag des Monats (Fallback wenn kein naechste_faelligkeit)
    haeufigkeit TEXT,           -- 'wöchentlich'|'monatlich'|'vierteljährlich'|...
    kategorie TEXT,
    account_id INTEGER,
    subtyp TEXT,                -- 'fixkosten' | 'abo' | 'recurring'
    notiz TEXT,
    naechste_faelligkeit TEXT,  -- ISO-Datum (bevorzugt gegenüber datum_tag)
    aktiv INTEGER DEFAULT 1,
    icon TEXT,
    farbe TEXT,
    tx_type TEXT DEFAULT 'Ausgaben',
    transfer_to_account_id INT,
    transfer_to_source TEXT,
    transfer_to_haushalt_id INT
)
```

Fixkosten, Abos und recurring_transactions sind **in einer Tabelle vereint** (`subtyp`). Migration läuft automatisch beim Start.

### Konto-Pflicht beim Buchen (seit v3.0)
`bookFixkostUnified()` wirft `KEIN_KONTO`, wenn kein Konto gesetzt ist (bei Nicht-Transfer-Fixkosten). Die Route gibt 400 zurück. Das UI zeigt eine Warnung im Buchungsmodal.

### API-Endpunkte
| Methode | Route | Funktion |
|---------|-------|----------|
| GET | `/fixkosten/unified` | Alle Fixkosten |
| POST | `/fixkosten/unified/add` | Neue Vorlage |
| PUT | `/fixkosten/unified/:id` | Bearbeiten |
| DELETE | `/fixkosten/unified/:id` | Löschen |
| POST | `/fixkosten/unified/:id/book` | Buchen + nächste Fälligkeit setzen |

---

## 11. Schulden-Tracker

### Tabellen
```sql
schulden (id, user_id, kreditor, betrag, zinssatz, monatlich,
          laufzeit_jahre, datum_start, notiz, gesamt_gezahlt, faelligkeitstag)

schulden_zahlungen (id, schulden_id, user_id, betrag, datum, notiz,
                    transaction_id, account_id)
```

### Zahlungen löschen (seit v3.0)
`DELETE /schulden/zahlungen/:id` löscht **sowohl die Zahlung als auch die verknüpfte Transaktion** in `ausgabenDB` (via `transaction_id`). Wird ins Activity-Log geschrieben.

---

## 12. Regeln & Automationen

### Tabelle
```sql
kategorisierungs_regeln (
    id, user_id,
    bedingung_operator TEXT,  -- 'enthält'|'beginnt_mit'|'endet_mit'|'gleich'
    bedingung_wert TEXT,
    aktion_kategorie TEXT,
    aktion_typ TEXT,
    aktiv INTEGER DEFAULT 1,
    modus TEXT DEFAULT 'beide', -- 'beide'|'privat'|'haushalt'
    priority INTEGER DEFAULT 0  -- höhere Zahl = höhere Priorität (seit v3.0)
)
```

### Prioritätssystem (seit v3.0)
Regeln werden nach `priority DESC, id ASC` sortiert. Höhere Priorität gewinnt. Priorität einstellbar von -99 bis +99 im Modal. Farbige Badge in der Regelliste zeigt die Priorität an. `toggleAktiv` behält `priority` bei.

### Anwendungspunkte
1. **Live bei Eingabe** (Client, 250ms Debounce)
2. **Beim Speichern** (Server, `POST /addTransaction`)
3. **CSV-Import** (Client, nach Mapping; Haushalt-Import: serverseitig via `applyRegeln` mit `modus='haushalt'`)
4. **Apply-All** — getrennt für Privat und Haushalt (seit v3.1)

### Apply-All mit „nur leere Felder"-Option (seit v3.0)
Backend-Flag `onlyEmpty`. Wenn aktiv: Regel wird nur auf Transaktionen angewendet, die noch keine Kategorie haben. Frontend-Checkbox „Nur Transaktionen ohne Kategorie" in der Apply-All-Funktion.

### Apply-All für Haushalt (seit v3.1)
Auf der Regeln-Seite gibt es zwei separate Buttons:
- **„Auf Haushalt-Transaktionen anwenden"** → `POST /haushalt/regeln/apply-all`
- **„Auf Privat-Transaktionen anwenden"** → `POST /regeln/apply-all`

`POST /haushalt/regeln/apply-all` iteriert über alle `haushalt_transaktionen` des Haushalts und wendet `applyRegeln(userId, ..., 'haushalt')` an. Gibt `{ updated: N }` zurück.

**API-Endpunkte Regeln:**
| Methode | Route | Funktion |
|---------|-------|----------|
| GET | `/regeln` | Alle Regeln des Nutzers |
| POST | `/regeln/add` | Neue Regel anlegen |
| PUT | `/regeln/:id` | Regel bearbeiten |
| DELETE | `/regeln/:id` | Regel löschen |
| PATCH | `/regeln/:id/toggle` | Aktivieren/Deaktivieren |
| POST | `/regeln/apply-all` | Alle Privat-Transaktionen re-kategorisieren |
| POST | `/haushalt/regeln/apply-all` | Alle Haushalt-Transaktionen re-kategorisieren |

---

## 13. Steuer-Modul

### Zugang
Sidebar → Finanzen → Steuer-Modul (`/users/steuern`)

### Dynamische Steuertarife (seit v3.0)
Alle Steuerparameter sind im `STEUER_TARIFE`-Objekt hinterlegt (aktuell 2022–2025):
```javascript
STEUER_TARIFE = {
    2025: { grundfreibetrag, progressionszonen, ruerupMaxPct, ruerupMax,
            riesterMax, sparerpauschbetrag, werbungskostenPausch, soliFreigrenze },
    2024: { ... },
    ...
}
```
`getTarif(jahr)` liefert die Parameter für das gewünschte Jahr (fallback auf aktuellstes). **Neues Jahr hinzufügen = ein Eintrag im Objekt ergänzen, kein weiterer Code-Aufwand.**

### „Aus Daten vorausfüllen"-Button (seit v3.0)
`vorausfuellenAusDaten()` summiert automatisch für das aktive Steuerjahr:
- Kapitalerträge aus `steuer_kapitalertraege`
- Rürup/Riester aus `steuer_altersvorsorge`
- Sonderausgaben aus `steuer_sonderausgaben`
- Werbungskosten aus `steuer_werbungskosten`

und füllt alle Felder im Erstattungsschätzer vor.

### Tab-Übersicht

| Tab | Inhalt |
|-----|--------|
| Jahresübersicht | Transaktionen des Steuerjahrs aus `ausgabenDB`, Werbungskosten-Vergleich, Monatsdiagramm |
| Erstattungsschätzer | Manuelle Eingabe + Berechnung + „Aus Daten vorausfüllen" |
| Werbungskosten | CRUD `steuer_werbungskosten`, Kategorien: Fahrtkosten, Arbeitsmittel, etc. |
| Kapitalerträge | CRUD `steuer_kapitalertraege` nach Institution |
| Altersvorsorge | CRUD `steuer_altersvorsorge`, Typen: riester, ruerup, bav, gkv |
| Sonderausgaben | CRUD `steuer_sonderausgaben`, Kategorien: Kirchensteuer, Spenden, etc. |
| Assistent | Checkliste `steuer_assistent`, Fristen-Anzeige |
| Steuer-Dokumente | Dokumente gefiltert nach `typ='steuer'` oder `typ='gehalt'` |

---

## 14. Aktivitätsprotokoll

### Tabelle
```sql
activity_log (
    id, user_id,
    aktion TEXT,     -- 'erstellt' | 'geändert' | 'gelöscht'
    entity TEXT,
    entity_id INT,
    details TEXT,    -- JSON {vorher: {...}, nachher: {...}} bei Änderungen
    created_at TEXT
)
```

### Geloggte Entitäten (vollständige Liste)
| entity | Wann |
|--------|------|
| Transaktion | erstellt, **geändert (Vorher/Nachher seit v3.0)**, gelöscht, CSV-Bulk |
| Konto | erstellt, bearbeitet, gelöscht |
| Finanzziel | erstellt, bearbeitet, gelöscht, Einzahlung |
| Budget | erstellt, bearbeitet, gelöscht |
| Schuld | erstellt, gelöscht |
| Schulden-Zahlung | **gelöscht (seit v3.0)** |
| Fixkosten | erstellt, gelöscht |
| Haushalt-Transaktion | erstellt, gelöscht |

### Anzeige
- Privat: `/users/activity` — Filter nach Entitätstyp
- Haushalt: `/users/activity?filter=Haushalt-Transaktion`
- Pagination: 50 pro Seite, Gruppierung nach Datum

---

## 15. Haushalt-Modus

### Tabellen-Übersicht
```sql
haushalte (id, name, erstellt_von, created_at)
haushalt_mitglieder (id, haushalt_id, user_id, anzeigename, rolle ['admin'|'mitglied'])
haushalt_konten_v2 (id, haushalt_id, name, balance, color, linked_account_id)
haushalt_transaktionen (id, haushalt_id, eingetragen_von, name, category, amount,
                        type, date, konto_id, anteil_user1, anteil_user2, notiz)
haushalt_anteile (id, haushalt_transaktionen_id, user_id, anteil,
                  UNIQUE(haushalt_transaktionen_id, user_id))  -- N-Personen-Vorbereitung
haushalt_fixkosten (id, haushalt_id, name, betrag, rhythmus, kategorie, ...)
haushalt_todos (id, haushalt_id, erstellt_von, task, completed, priority, due_date,
                label, notes, zugewiesen_an, wiederholung)
haushalt_dokumente (id, haushalt_id, hochgeladen_von, typ, name, ablageort, ...)
haushalt_tracker_categories (id, haushalt_id, name)
haushalt_ausgleiche (id, haushalt_id, von_user_id, an_user_id, betrag REAL,
                     monat TEXT, notiz TEXT, created_at TEXT)
haushalt_einladungen (id, haushalt_id, code TEXT, email TEXT, expires_at TEXT,
                      used INTEGER DEFAULT 0)
```

### N-Personen-Vorbereitung (seit v3.0)
`haushalt_anteile` ist als Fundament für eine spätere Migration auf N Personen angelegt. `anteil_user1`/`anteil_user2` in `haushalt_transaktionen` bleiben für Rückwärtskompatibilität bestehen. Keine UI-Änderung.

### Haushalt-Modus serverseitig (seit v3.0)
Modus wird in `req.session.sidebar_mode` gespeichert. `navheader.js` synchronisiert localStorage ↔ Server. Haushalt-Seiten setzen Session automatisch auf `'haushalt'`.

### Haushalt-Konto-Filter-Validierung (seit v3.0)
`tracker_active_accounts` (localStorage) wird beim Laden gegen `allAccounts` abgeglichen. Gelöschte Konto-IDs werden automatisch entfernt.

### UI-Design-Override
CSS-Variable `--haus-accent` (#10b981, Smaragdgrün) für alle Haushalt-Akzente. Klasse `sidebar-link-haus` in der Sidebar.

### Einladungs-Flow (seit v3.0)

Partner-Einladung über die Haushalt-Einstellungen (`/users/haushalt/einstellungen`):
1. Admin generiert Code → `POST /haushalt/invite` → 7-Tage-gültiger Code in `haushalt_einladungen`
2. Optional: E-Mail mit Einladungslink wird versendet (Nodemailer)
3. Link: `{BASE_URL}/users/haushalt/join/{code}` → `views/haushalt-join.html`
4. Partner gibt Anzeigenamen ein → `POST /haushalt/einladung/:code/accept`

### Settlement — „Wer schuldet wem?" (seit v3.0)

Im Haushalt-Transaktionen-Tab „Abrechnung":
- `GET /haushalt/settlement/:monat` — summiert `anteil_user1`/`anteil_user2` aller Transaktionen, berechnet Saldo → `{ owes: { from, to, amount } }`
- `POST /haushalt/ausgleich` — erstellt Record in `haushalt_ausgleiche` + optional Buchung
- Haushalt-Dashboard: kleines Settlement-Widget (1 Zeile, Link zur Abrechnung)

### Per-Transaktion Kostenaufteilung (seit v3.0)

Jede Haushalt-Transaktion hat `anteil_user1`/`anteil_user2` (0–100, Summe immer 100).
- Standardaufteilung: 50/50
- Im Schnelleintrag + Vollformular: Range-Slider 0–100
- Badge „60/40" in der Transaktionsliste wenn vom Standard abweichend

### Haushalt-Transaktions-Kategorien (seit v3.1)

`GET /haushalt/tracker/categories` befüllt `haushalt_tracker_categories` beim ersten Aufruf automatisch mit 13 Standard-Kategorien:

> Lebensmittel, Miete, Nebenkosten, Strom & Energie, Internet & Telefon, Versicherungen, Haushalt & Reinigung, Freizeit & Unterhaltung, Restaurant & Café, Kleidung, Gesundheit, Transport, Sonstiges

Zusätzlich werden alle Kategorien, die in bestehenden Transaktionen des Haushalts vorkommen, in die Liste gemischt (dedupliciert). Das Edit-Modal zeigt dieselbe Liste.

### Regeln & Automationen im Haushalt (seit v3.1)

Seite „Regeln & Automationen" (`/users/regeln`) gilt für beide Modi:
- Regeln mit `modus='haushalt'` oder `modus='beide'` werden auf Haushalt-Transaktionen angewendet
- Haushalt-CSV-Import wendet Regeln serverseitig an (`applyRegeln(..., 'haushalt')`)
- „Auf Haushalt-Transaktionen anwenden"-Button auf der Regeln-Seite → `POST /haushalt/regeln/apply-all`
- Sidebar-Link „Regeln & Automationen" ist auch im Haushalt-Bereich der Navigation verfügbar

### Haushalt-Aufgaben (seit v3.0)

`/users/haushalt/todos`:
- **Quick-Add-Bar**: Textfeld + Enter → sofort hinzufügen ohne Modal
- **Status-Filter**: Offen / Alle / Erledigt
- **Label-Filter-Pills**: Alle Labels / Einkaufen / Haushalt / Sonstiges
- Label „einkaufen" → Grocery-Style mit großen Touch-Checkboxen
- **Detailmodal**: Priorität (hoch/mittel/niedrig), Fälligkeitsdatum, Zuweisung an Haushaltsmitglied, Wiederholung, Notizen
- Aufgaben, die dem aktuellen Nutzer zugewiesen sind, werden grün hinterlegt

**Bekannte Einschränkung**: Das `wiederholung`-Feld (täglich/wöchentlich/monatlich) wird gespeichert, aber beim Abhaken einer wiederkehrenden Aufgabe wird **keine** neue Instanz automatisch erstellt (kein Cron-Job implementiert).

### Haushalt-Transaktionen-Tabelle (seit v3.1)

Gleiche Tabellenstruktur wie Privat-Modus:
- Separate Datum-Spalte (sortierbar)
- Beträge farbig: Einnahmen grün, Ausgaben rot
- Kategorie-Filter zeigt nur tatsächlich verwendete Kategorien

---

## 16. Dashboard & Übersichten

### Privates Dashboard (`/users/overview`)

#### Anstehende Zahlungen (seit v3.0 erweitert)
Widget zeigt die nächsten **14 Tage** (zuvor 7):
- **Fixkosten**: nutzt `naechste_faelligkeit` (bevorzugt) oder berechnet aus `datum_tag`
- **Schulden-Raten**: via `faelligkeitstag` aus `schulden`
- Jeder Eintrag ist ein klickbarer Link (→ Fixkosten oder Schulden)
- Header-Link führt zum Kalender

#### Net-Worth-Widget
Assets (Konten + Investments) minus Verbindlichkeiten (Schulden). Donut-Chart (Chart.js).

#### Cashflow-Prognose
Letzte 6 Monate + 3 Monate linear extrapoliert (Linie-Chart).

#### Financial Insights
Automatische Hinweise: Top-Kategorien, Budget-Überschreitungen, Fixkosten-Hinweise.

---

## 17. Kalender

### Zugang
Sidebar → „Zahlungskalender" (`/users/kalender`)

### Inhalte
Die Kalenderseite nutzt **FullCalendar** und zeigt:
- Eigene manuelle Events (erstellbar per Klick auf Datum)
- Fixkosten-Fälligkeiten (`naechste_faelligkeit`) — als farbige Overlay-Events
- Schulden-Raten (aus `faelligkeitstag`)

### Outlook-Integration (Pro)
Pro-Nutzer können Outlook-Kalender verbinden (OAuth). Outlook-Events werden neben eigenen Events und Fixkosten-Fälligkeiten dargestellt. Verbindung trennbar über das Kalender-UI.

**Hinweis zur Designprinzip-Abweichung**: Laut Sidebar-Beschriftung soll der Kalender ein reiner „Zahlungskalender" (Fixkosten/Raten-Fälligkeiten) sein. Aktuell ist es eine vollwertige Event-Calendar-Anwendung mit eigenem Event-Formular und Outlook-Sync. Eine Reduzierung auf den Zahlungskalender-Scope ist als mögliche Vereinfachung offen — die Fixkosten-Fälligkeiten sind bereits als Overlay eingebunden.

---

## 18. In-App Notifications

### Konzept (seit v3.0)
Benachrichtigungen werden **serverseitig generiert** beim Abruf durch den Client. Kein separater Cron-Job nötig. Das Glocken-Icon in der Topbar zeigt die Anzahl ungelesener Benachrichtigungen.

### Tabelle
```sql
notifications (
    id INTEGER PRIMARY KEY,
    user_id INTEGER,
    type TEXT,          -- 'budget' | 'unusual' | 'fixkost'
    title TEXT,
    message TEXT,
    link TEXT,          -- Ziel-URL beim Klick
    is_read INTEGER DEFAULT 0,
    dedup_key TEXT,     -- verhindert Duplikate im selben Monat
    created_at TEXT
)
```

**`dedup_key`** verhindert, dass für dieselbe Bedingung doppelte Benachrichtigungen entstehen. Format:
- Budget: `budget_{userId}_{kategorie}_{YYYY-MM}`
- Ungewöhnlich: `unusual_{userId}_{kategorie}_{YYYY-MM}`
- Fixkost: `fixkost_{userId}_{fixkostId}_{naechste_faelligkeit}`

### Benachrichtigungstypen
| Typ | Icon | Auslöser |
|-----|------|----------|
| `budget` | 🔴 | Monatsausgaben einer Kategorie > Budget-Limit |
| `unusual` | 🟡 | Ausgaben dieser Kategorie > 150% des Vormonats (ab 20€ Basis) |
| `fixkost` | 🔵 | `naechste_faelligkeit` innerhalb der nächsten 3 Tage |

### Generierung (`generateNotifications`)
Läuft bei jedem `GET /notifications`-Aufruf. Prüft per `upsertNotification()` ob bereits eine ungelesene Benachrichtigung mit demselben `dedup_key` existiert — falls ja, wird nichts neu erstellt.

### Frontend (navheader)
- **Glocken-Button** neben der Suchleiste mit rotem Badge (Unread-Count, max. „9+")
- **Dropdown-Panel**: Liste aller Benachrichtigungen, farbige Icons pro Typ
- Klick auf Eintrag → markiert als gelesen, navigiert zum Link
- „Alle gelesen"-Button

### API-Endpunkte
| Methode | Route | Funktion |
|---------|-------|----------|
| GET | `/notifications` | Generieren + alle zurückgeben |
| POST | `/notifications/read-all` | Alle als gelesen markieren |
| POST | `/notifications/:id/read` | Einzelne als gelesen markieren |

**Wichtig**: `read-all` muss vor `/:id/read` definiert sein (spezifische Route vor parametrisierter).

---

## 19. Dokumente

### Konzept (seit v3.0 vereinfacht)
Das Modul ist ein **Metadaten-Verzeichnis**, kein Datei-Manager. Es gibt keinen Datei-Upload mehr. Der Nutzer notiert wo ein Dokument physisch liegt.

### Tabelle
```sql
dokumente (
    id, user_id,
    typ TEXT,          -- 'steuer'|'gehalt'|'versicherung'|'sonstiges'|...
    name TEXT,
    datum TEXT,
    jahr INTEGER,
    notiz TEXT,
    ablageort TEXT,    -- Freitext oder URL (z.B. /Dokumente/2025 oder https://drive.google.com/...)
    betrag REAL,
    faellig_datum TEXT,
    aussteller TEXT,
    status TEXT,       -- 'offen'|'erledigt'|'abgelaufen'
    kategorie TEXT,
    brutto REAL, netto REAL,
    arbeitgeber TEXT,
    monat TEXT,
    steuer_art TEXT,
    steuerjahr INTEGER,
    created_at TEXT
)
```

`file_data`, `file_ext`, `file_mime` wurden **entfernt**. Der Upload-Mechanismus existiert nicht mehr.

### Ablageort-Anzeige
In der Detailseite (`/users/dokumente/:id`): Beginnt der Ablageort mit `http://` oder `https://`, wird er als klickbarer Link gerendert. Sonst als Klartext.

### Formular
Button heißt „Speichern" (nicht mehr „Hochladen"). Das Formular hat ein Textfeld „Ablageort" mit Hinweis-Text.

### Haushalt-Dokumente
Identisches Vorgehen für `haushalt_dokumente` — ebenfalls nur noch `ablageort`, kein Upload.

---

## 20. Versicherungen

### Tabelle
```sql
versicherungen (
    id, user_id,
    typ TEXT, anbieter TEXT, beitrag REAL,
    rhythmus TEXT,   -- 'monatlich'|'jährlich'|...
    beginn TEXT, ablauf TEXT, notiz TEXT
)
```

### Verknüpfung mit Fixkosten (seit v3.0)
In der Versicherungs-Detailseite gibt es den Button **„Als Fixkost erfassen"** (erscheint nur wenn `beitrag` vorhanden). Ein Klick erstellt automatisch einen `fixkosten`-Eintrag mit:
- Name: `{Versicherungsname} ({Anbieter})`
- Betrag, Haeufigkeit aus der Versicherung
- Kategorie: `Versicherungen`
- Subtyp: `fixkosten`

Nach Erfolg: 3 Sekunden grünes Status-Feedback, Button deaktiviert sich.

---

## 21. Globale Suche

### Zugang
`Strg+K` öffnet Such-Modal (alternativ: Suchfeld in der Topbar)

### Durchsuchte Bereiche
| Bereich | Felder | Ziel-Link |
|---------|--------|-----------|
| Transaktionen | name, category | `/ausgabentracker` |
| Konten | name | `/meine-finanzen` |
| Sparziele | name | `/budget#sparzieleTab` |
| Fixkosten | name | `/fixkosten` |
| Schulden | kreditor | `/schulden` |
| Dokumente | name, aussteller | `/dokumente` |

### Tastaturnavigation
`↑`/`↓` navigieren, `Enter` öffnet, `Esc` schließt.

---

## 22. Datenexport

### Zugang
Sidebar (Footer) → Daten exportieren (`/users/export`)

### Export-Typen
| Typ | Format | Inhalt |
|-----|--------|--------|
| Transaktionen | CSV oder JSON | Gefiltert nach Konto und Zeitraum |
| PDF-Bericht | PDF (jsPDF) | Diagramme + Monatsübersichten |
| Backup | JSON | Alle Daten (ohne Datei-Blobs — gibt es nicht mehr) |
| Einzelbereiche | CSV/JSON | Konten, Sparziele, Fixkosten, Schulden |
| Haushalt | JSON/CSV | Haushalt-Transaktionen, -Konten, -Fixkosten |

PDFs werden vollständig clientseitig generiert (jsPDF + Chart.js-Canvas-Screenshots).

---

## 23. Einstellungen & Profil

### Tabellen
- `user_profiles`: `display_name`, `avatar_url`, `tarif`
- `user_settings`: `theme`, `language`, `currency`, `notifications_*`, `two_factor`, `reminder_*`

### Cron-Erinnerungen
`modules/reminder.js` läuft täglich:
- Fixkosten in den nächsten 3 Tagen fällig → E-Mail
- Schulden-Raten bald fällig → E-Mail
- Sparziel-Zieldaten bald erreicht → E-Mail

In-App-Notifications (Kapitel 18) ergänzen die E-Mail-Erinnerungen — sie laufen unabhängig davon.

---

## 24. Feature-Interaktionen (Gesamtbild)

### Transaktions-Entstehungsquellen
| Quelle | Route | Besonderheiten |
|--------|-------|----------------|
| Manuell (Tracker) | `POST /addTransaction` | Regeln + upsertCategory |
| Sparziel-Einzahlung | `POST /sparziele/:id/add` | Nur wenn `createTransaction=true` |
| Schulden-Zahlung | `POST /schulden/:id/zahlungen` | Nur wenn `createTransaction=true` |
| Fixkost buchen | `POST /fixkosten/unified/:id/book` | `recurring_id` gesetzt, Konto Pflicht |
| Transfer | `POST /transfer` | Zwei Transaktionen, `transfer_pair_id` |
| Kontostand-Abgleich | `POST /accounts/:id/abgleich` | Kategorie: „Kontostandskorrektur" |
| CSV-Import | `POST /import/transactions` | Batch, `{ imported, skipped }` |

### Kategorien-Datenfluss (seit v3.0)
```
Transaktion speichern
    │
    └── upsertCategory(userId, name)
            │
            ├── Suche: categories WHERE user_id=? AND name=? AND is_deleted=0
            │       → gefunden: id zurückgeben
            │       → nicht gefunden: INSERT → id zurückgeben
            │
            └── category_id in ausgabenDB setzen
```

### Kontostand-Abhängigkeiten
```
accounts.balance (Startwert)
    + SUM(ausgabenDB WHERE type='Einnahmen' AND account_id=X)
    - SUM(ausgabenDB WHERE type='Ausgaben' AND account_id=X)
    = currentBalance
        └── Konto-Aufteilung:
                SUM(sparziele.gespart WHERE account_id=X) = reserviert
                currentBalance - reserviert = freies Geld
```

### Notification-Trigger-Logik
```
GET /notifications
    │
    └── generateNotifications(userId)
            ├── Budget: ausgabenDB Monatsausgaben > budgets.betrag → upsertNotification
            ├── Unusual: this_month > last_month × 1.5 (ab 20€) → upsertNotification
            └── Fixkost: naechste_faelligkeit zwischen heute und heute+3 → upsertNotification
                            └── dedup_key verhindert Duplikate
```

### Regeln-Anwendungsmatrix
| Kontext | Zeitpunkt | Modus-Filter | Wer |
|---------|-----------|-------------|-----|
| Privater Tracker (Eingabe) | Live (250ms) | `privat` oder `beide` | Client |
| Privater Tracker (Speichern) | Bei POST | `privat` oder `beide` | Server |
| Haushalt-Tracker (Eingabe) | Live (250ms) | `haushalt` oder `beide` | Client |
| Haushalt-CSV-Import | Beim Import | `haushalt` oder `beide` | Server |
| CSV-Import Privat (Vorschau) | Nach Mapping | `privat` oder `beide` | Client |
| Apply-All Privat | Manuell | `privat` oder `beide`, sortiert nach priority | Server |
| Apply-All Haushalt | Manuell | `haushalt` oder `beide`, sortiert nach priority | Server |

---

## 25. PWA (Progressive Web App)

Seit v3.0 ist die App als PWA installierbar:

### Web App Manifest (`/manifest.json`)
- `name`: „GoldenGoat Capital"
- `display`: `standalone`
- Icons in verschiedenen Größen (192×192, 512×512)

### Service Worker (`/sw.js`)
Aktueller Cache-Name: `ggc-shell-v3`

Gecachte Dateien beim Install:
- `/styles.css`, alle Client-JS-Dateien
- Fonts (Plus Jakarta Sans via Google Fonts CDN)
- RemixIcon CSS

**Strategie**: Cache-First für gecachte Assets, Network-Fallback für alles andere.

**Bei CSS/JS-Updates**: `CACHE_NAME` in `sw.js` auf neue Version bumpen (z.B. `ggc-shell-v4`). Der Browser löscht dann automatisch den alten Cache und lädt frische Assets.

---

## 26. Bekannte Schwachstellen & Verbesserungspotenziale

---

### Mittel (UX & Konsistenz)

#### 1. Sparziel-Einzahlung via Edit-Formular erzeugt keine Transaktion
**Problem**: `PUT /sparziele/:id` (Edit-Formular) ändert `gespart` ohne Transaktion. Nur der Einzahlen-Button (`POST /sparziele/:id/add`) erzeugt eine Transaktion. Manuell korrigierte `gespart`-Werte sind im Ausgabentracker unsichtbar.

**Verbesserung**: Edit-Formular sollte die Differenz erkennen und optional eine Transaktion anbieten.

#### 2. Haushalt nur für 2 Personen
**Problem**: `anteil_user1`/`anteil_user2` ist hard auf 2 Personen ausgelegt. `haushalt_anteile` ist als N-Personen-Fundament vorbereitet, aber noch keine UI-Migration.

#### 3. Steuer-Erstattungsschätzer ist vereinfacht
Die Berechnung ignoriert Kinderfreibeträge, Altersentlastungsbeträge, besondere Abzüge etc. Nur als Orientierung geeignet.

#### 4. Haushalt-Todos: Wiederholung ist UI-only
Das `wiederholung`-Feld (täglich/wöchentlich/monatlich) wird gespeichert, aber kein Cron-Job erstellt automatisch eine neue Instanz wenn eine wiederkehrende Aufgabe abgehakt wird.

#### 5. Haushalt-Todos: Label-Feld ist Freitext
Im Detail-Modal ist `ttLabel` ein `<input type="text">`. Nutzer können beliebige Labels eingeben, die dann nicht mit den festen Filter-Pills (Einkaufen / Haushalt / Sonstiges) übereinstimmen. Lösung: `<select>` mit den drei Werten.

#### 6. Haushalt-Einstellungen: Admin-Erkennung im Leave-Modal
`openLeaveModal()` prüft ob *irgendjemand* im Haushalt Admin ist, nicht ob der *aktuelle Nutzer* Admin ist. Der Warntext „Haushalt für alle Mitglieder gelöscht" erscheint damit auch für Nicht-Admins. Rein kosmetisch — serverseitig ist die Prüfung korrekt.

---

### Niedrig (Code-Qualität)

#### 7. `category TEXT` in ausgabenDB noch vorhanden
`category` und `category_id` werden parallel gepflegt. `category` soll nach stabilem Betrieb entfernt werden. Budget-Matching und Regeln nutzen noch `category TEXT`.

#### 8. DEFAULT_CATEGORIES clientseitig hardcodiert
Standard-Kategorien in `ausgabentracker.js`, `regeln.js` und `haushalt-tracker.js` sind als Array hardcodiert. Langfristig sollten sie aus der API kommen.

#### 9. Activity-Log: Keine Vorher-Nachher bei allen Entitäten
`updateTransaction` loggt Vorher/Nachher. Andere Entitäten (Budget-Änderung, Fixkost-Änderung) speichern keinen vollständigen Diff.

#### 10. `haushalt_anteile` ohne UI
Die Tabelle existiert als N-Personen-Fundament, wird aber noch nicht befüllt oder ausgelesen.

#### 11. Doppelte `GET /kalender`-Route in routes/users.js
Zeile 501 und Zeile 1561 deklarieren dieselbe Route. Die zweite ist totes Code — die erste fängt alle Requests ab.

#### 12. `finanzen.js` Tippfehler in `ACCOUNT_LABELS`
Zeile 17: `sparkont:` (falsch) steht direkt über `sparkonto:` (korrekt). Der falsche Key hat keine Wirkung (wird überschrieben), ist aber totes Code.

---

*Dieses Handbuch beschreibt den Stand von GoldenGoatCapital zum März 2026 (Version 3.1). Alle neuen Features sollten hier ergänzt und behobene Schwachstellen aus Kapitel 26 entfernt werden.*
