# GoldenGoat Capital – Technisches Handbuch
**Stand: März 2026 | Version 2.0**

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
18. [To-do-Liste](#18-to-do-liste)
19. [Dokumente](#19-dokumente)
20. [Versicherungen](#20-versicherungen)
21. [Globale Suche](#21-globale-suche)
22. [Datenexport](#22-datenexport)
23. [Einstellungen & Profil](#23-einstellungen--profil)
24. [Feature-Interaktionen (Gesamtbild)](#24-feature-interaktionen-gesamtbild)
25. [Bekannte Schwachstellen & Verbesserungspotenziale](#25-bekannte-schwachstellen--verbesserungspotenziale)

---

## 1. Systemübersicht

GoldenGoat Capital ist eine persönliche Finanzverwaltungsanwendung, die lokal auf einem Server läuft. Sie bietet zwei vollständig getrennte Modi:

- **Privat-Modus**: Individuelle Finanzverwaltung für einen einzelnen Nutzer (Transaktionen, Konten, Budgets, Sparziele, Schulden, Steuern etc.)
- **Haushalt-Modus**: Gemeinsame Finanzverwaltung für zwei Personen mit Kostenaufteilung, gemeinsamen Konten und gemeinsamer Aufgabenverwaltung

Der Moduswechsel erfolgt über den Sidebar-Toggle oben links. Der gewählte Modus wird im **localStorage** des Browsers gespeichert (`sidebar_mode: 'privat'` oder `'haushalt'`), nicht in der Session – das bedeutet, zwei offene Browser-Tabs können unterschiedliche Modi anzeigen.

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
  profil.js            → Profilhilfs­funktionen
routes/
  users.js             → Alle Auth- + Nutzer-API-Routen
  Startseite.js        → Landingpage
views/                 → EJS-Templates (alle als .html)
public/                → Statische Assets, Client-JS, styles.css
```

### Initialisierung der Datenbank
`database.js` wird als **Singleton** via `Database.getInstance()` verwendet. Beim ersten Aufruf werden alle Tabellen per `CREATE TABLE IF NOT EXISTS` angelegt und fehlende Spalten via `try { ALTER TABLE ... } catch(e) {}` nachgerüstet. Das ermöglicht Zero-Downtime-Migrationen.

### Route-Konvention
- **Spezifische Routen** müssen immer **vor** parametrisierten Routen stehen:
  `GET /fixkosten/list` vor `GET /fixkosten/:id`
- **API-Routen** geben JSON zurück, **Seiten-Routen** rendern HTML – niemals mischen
- `requireLogin`-Middleware muss vor allen geschützten Routen definiert sein

---

## 3. Authentifizierung & Benutzerverwaltung

### Tabellen
```sql
users (id, username, email, password [bcrypt-Hash], created_at)
user_profiles (user_id PK, display_name, avatar_url, tarif ['basis'|'pro'])
user_settings (user_id PK, language, theme ['dark'|'light'], currency,
               date_format, notifications_email, notifications_browser, two_factor)
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

### E-Mail-Verifikation & Passwort-Reset
- Passwort-Reset per E-Mail-Link (Token-basiert, zeitlich begrenzt)
- Willkommens-E-Mail bei Registrierung (Nodemailer)

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

### Kontostand-Berechnung (getAccountsWithBalance)
Der angezeigte **aktuelle Kontostand** wird nicht aus `accounts.balance` gelesen, sondern dynamisch berechnet:
```
currentBalance = accounts.balance
              + SUM(Einnahmen-Transaktionen für dieses Konto)
              - SUM(Ausgaben-Transaktionen für dieses Konto)
```
Das bedeutet: `accounts.balance` ist der **Startbetrag** (oder der Betrag zum Zeitpunkt des letzten manuellen Abgleichs). Alle danach erfassten Transaktionen mit `account_id` werden addiert/subtrahiert.

### Kontostand-Abgleich
Über den „Abgleich"-Button kann der Nutzer den tatsächlichen Kontostand eingeben. Der Server berechnet dann die **Differenz** zwischen gemeldetem und berechnetem Stand und erstellt eine Ausgleichs-Transaktion (Kategorie: „Kontostand-Abgleich"), damit die Geschichte erhalten bleibt. `accounts.balance` wird **nicht** direkt überschrieben.

### Konten anlegen
- Basis-Tarif: Prüfung ob bereits 3 Konten vorhanden → 409-Fehler wenn ja
- Pro-Tarif: unbegrenzt

### API-Endpunkte
| Methode | Route | Funktion |
|---------|-------|----------|
| GET | `/accounts` | Alle Konten mit currentBalance |
| GET | `/accounts/all` | Privat + Haushalt-Konten kombiniert (für Transfer-Dropdowns) |
| POST | `/accounts/add` | Neues Konto erstellen |
| PUT | `/accounts/:id` | Konto bearbeiten |
| DELETE | `/accounts/:id` | Konto löschen |
| GET | `/accounts/:id/transactions` | Transaktionen eines Kontos |
| POST | `/accounts/:id/abgleich` | Kontostand-Abgleich |

### Interaktion mit anderen Features
- **Transaktionen**: Transaktionen können optional einer `account_id` zugewiesen werden. Ist keine angegeben, fließen sie in keine Kontostandsberechnung ein.
- **Sparziele**: Ein Sparziel kann einem Konto zugewiesen sein (`sparziele.account_id`). Die Konto-Aufteilungs-Visualisierung auf der Budget-Seite zeigt an, wie viel des Kontostands für Sparziele „reserviert" ist.
- **Transfers**: Transfers zwischen zwei Konten erzeugen je eine Einnahme- und eine Ausgabe-Transaktion mit `transfer_pair_id` und `transfer_to_account_id`.
- **Fixkosten**: Beim Buchen einer Fixkost kann ein Konto angegeben werden, dem die Ausgabe zugeordnet wird.
- **Schulden-Zahlungen**: Zahlungen können einem Konto zugewiesen werden (`schulden_zahlungen.account_id`).
- **CSV-Import**: Importierte Transaktionen können einem Konto zugewiesen werden.

---

## 6. Ausgabentracker & Transaktionen

### Tabelle
```sql
ausgabenDB (
    id, user_id,
    name TEXT,                    -- Bezeichnung
    category TEXT,                -- Kategorie (frei wählbar)
    date TEXT,                    -- ISO-Format: YYYY-MM-DD
    amount REAL,                  -- immer positiv
    type TEXT,                    -- 'Einnahmen' | 'Ausgaben'
    account_id INTEGER,           -- optional, FK auf accounts
    recurring_id INTEGER,         -- gesetzt wenn von Fixkost gebucht
    transfer_to_account_id INT,   -- gesetzt bei Transfers
    transfer_pair_id INTEGER,     -- ID der Gegentransaktion bei Transfers
    notes TEXT                    -- optionale Notiz
)
```

### Transaktionen erfassen
- Formular: Name, Betrag, Typ (Einnahmen/Ausgaben), Kategorie, Datum, Konto (optional), Notiz (optional)
- **Live-Regelanwendung**: Während der Namens-Eingabe (250ms Debounce) werden Regeln geprüft. Passt eine Regel, werden Kategorie und/oder Typ automatisch gesetzt und ein Hinweis-Badge zeigt welche Regel griff (`Regel angewendet: …`).
- Nach dem Speichern wird die Transaktion optimistisch in der UI angezeigt und ein Activity-Log-Eintrag geschrieben.

### Ansichten & Filter
- **Listenansicht**: Alle Transaktionen, nach Datum absteigend sortiert
- **Filter**: Typ (Alle/Einnahmen/Ausgaben), Kategorie, Suchbegriff, Konto, Zeitraum
- **Konto-Tab**: Wenn ein Konto-Filter aktiv ist, werden nur Transaktionen dieses Kontos angezeigt

### Transaktionen bearbeiten
- Inline-Bearbeitung via Edit-Modal
- Transaktionen mit `recurring_id ≠ null` werden mit einem **Schloss-Symbol** markiert und können **nicht bearbeitet** werden (sie sind von einer Fixkost gebucht)
- Transfer-Transaktionen haben ein eigenes Icon

### Transaktionen löschen (Undo-System)
Das Löschen erfolgt **optimistisch**:
1. Transaktion wird sofort aus dem Client-Array entfernt und die Liste neu gerendert
2. Ein Toast erscheint unten: „Transaktion gelöscht – Rückgängig"
3. Nach **5 Sekunden** wird der DELETE-Request an den Server gesendet
4. Klick auf „Rückgängig" innerhalb von 5 Sekunden: `clearTimeout()` verhindert den Server-Aufruf, die Transaktion wird wieder ins Array eingefügt

**Wichtig**: Bei Transfers (erkennbar an `transfer_pair_id`) werden **beide** Transaktionen des Paares gleichzeitig entfernt und nach 5 Sekunden beide serverseitig gelöscht.

### Kategorien
- Kategorien sind **frei wählbar** – kein festes Schema
- Der Nutzer kann eigene Kategorien anlegen (`/users/categories/add`), die dann in Dropdowns vorgeschlagen werden
- Tabelle: `custom_categories (id, user_id, name)`
- Standard-Kategorien sind clientseitig hardcodiert: `['Essen & Trinken', 'Lebensmittel', 'Klamotten', 'Freizeit', 'Tanken', 'Wohnen', 'Transport', 'Gesundheit', 'Gehalt', 'Sonstiges']`
- **Kritisch**: Budget-Kategorien und Transaktions-Kategorien sind durch denselben Freitext-Mechanismus verknüpft. Tippfehler führen zu Nicht-Übereinstimmungen.

### API-Endpunkte
| Methode | Route | Funktion |
|---------|-------|----------|
| GET | `/getTransactions` | Alle Transaktionen des Nutzers |
| POST | `/addTransaction` | Transaktion hinzufügen (wendet Regeln an) |
| PUT | `/updateTransaction/:id` | Transaktion bearbeiten |
| DELETE | `/deleteTransaction/:id` | Transaktion löschen |
| GET | `/categories` | Alle (Standard + eigene) Kategorien |
| POST | `/categories/add` | Eigene Kategorie hinzufügen |
| DELETE | `/categories/:id` | Eigene Kategorie löschen |

---

## 7. Konto-zu-Konto-Transfers

### Konzept
Ein Transfer ist eine **bidirektionale Umbuchung** zwischen zwei Konten. Er erzeugt immer **zwei verknüpfte Transaktionen**:
- Eine **Ausgabe** auf dem Quellkonto (Typ: Ausgaben, `account_id` = Quelle)
- Eine **Einnahme** auf dem Zielkonto (Typ: Einnahmen, `account_id` = Ziel)

Beide Transaktionen referenzieren sich gegenseitig über `transfer_pair_id`.

### Transfer-Typen
1. **Privat → Privat**: Zwischen zwei eigenen Konten
2. **Privat → Haushalt**: Vom Privatkonto auf ein Haushaltskonto
3. **Haushalt → Privat**: Vom Haushaltskonto zurück auf ein Privatkonto

Die Konten-Auswahl im Transfer-Formular nutzt `/accounts/all`, das sowohl private als auch Haushalt-Konten zurückgibt.

### Technische Details
```sql
-- Quell-Transaktion (Ausgabe auf Konto A):
INSERT INTO ausgabenDB (..., transfer_to_account_id=B_id, transfer_pair_id=NULL)
→ gibt ID zurück: pair_id

-- Ziel-Transaktion (Einnahme auf Konto B):
INSERT INTO ausgabenDB (..., transfer_to_account_id=A_id, transfer_pair_id=pair_id)
→ UPDATE erste Transaktion: SET transfer_pair_id = neue_ID
```

### Transfer löschen
Beim Löschen eines Transfers (`DELETE /transfer/:id`) werden **beide** Transaktionen des Paares gelöscht. Der Server erkennt die Gegenseite anhand von `transfer_pair_id`.

### Anzeige im Tracker
Transfer-Transaktionen werden mit einem speziellen Icon (`ri-exchange-2-line`) angezeigt. Das Löschen über das Undo-System entfernt clientseitig beide Transaktionen (`transfer_pair_id`), dann serverseitig nach 5 Sekunden.

---

## 8. CSV-Import

### Zugang
Sidebar → Finanzen → CSV-Import (`/users/import`)

### 3-Schritt-Wizard

#### Schritt 1: Datei hochladen
- Drag & Drop oder Klick-Upload
- Akzeptiert `.csv` und `.txt`, max. 5 MB
- **Encoding**: UTF-8 (deutsche Umlaute werden korrekt gelesen)
- **Bank-Voreinstellungen** wählbar:
  - `Auto-Erkennung`: analysiert Spaltennamen und wählt Mapping automatisch
  - `GoldenGoat CSV`: eigenes Exportformat
  - `DKB`: Spalten Buchungsdatum, Zahlungspflichtige\*r, Betrag (€)
  - `ING`: Spalten Buchung, Auftraggeber/Empfänger, Betrag
  - `Sparkasse`: Buchungstag, Beguenstigter, Betrag
  - `N26`: Datum, Empfänger, Betrag (EUR)
  - `Eigenes Format`: manuelles Mapping

**CSV-Parser** (clientseitig in `import.js`):
- Erkennt Trennzeichen automatisch (`;`, `,`, `\t`, `|`) durch Spaltenanzahl-Vergleich
- Unterstützt quoted fields: `"Feld mit, Komma"`
- Escaped quotes: `""` innerhalb von Feldern
- Überspringt Metadaten-Zeilen vor dem Header (z.B. DKB hat mehrere Informationszeilen oben)

#### Schritt 2: Spalten zuordnen
- Pflichtfelder: **Datum**, **Bezeichnung**, **Betrag**
- Optionale Felder: Typ, Kategorie, Bezeichnung 2 (wird an Bezeichnung angehängt mit ` · `)
- Vorschau der ersten 3 Datenzeilen im Original-Format
- Mapping per Dropdown (jede CSV-Spalte wählbar)

**Auto-Erkennung** (bei `auto`-Preset):
Die Spaltennamen werden case-insensitiv gegen Regex-Muster geprüft:
- Datum: `/datum|date|buchung|valuta/`
- Name: `/empfänger|auftraggeber|name|zahlungspflichtige|beguenstigt/`
- Betrag: `/betrag|amount|umsatz|wert|summe/`
- Typ: `/typ|type|art\b/`
- Kategorie: `/kategorie|category/`

#### Schritt 3: Vorschau & Import
**Datum-Parsing** (mehrere Formate unterstützt):
- `DD.MM.YYYY` oder `DD.MM.YY` → `YYYY-MM-DD`
- `YYYY-MM-DD` → direkt übernommen
- `MM/DD/YYYY` → umgewandelt
- 2-stellige Jahre: <50 → 20xx, ≥50 → 19xx

**Betrags-Parsing** (deutsche Notation):
- Entfernt `€`, `EUR`, Leerzeichen
- Erkennt deutsche Notation: `1.234,56` → `1234.56`
- Erkennt englische Notation: `1,234.56` → `1234.56`
- Betrag wird immer als Absolutwert gespeichert (`Math.abs()`)

**Typ-Erkennung** (Einnahmen vs. Ausgaben):
1. Typ-Spalte vorhanden → Schlüsselwörter: `einnahm/income/credit/gutschr/haben` → Einnahmen; `ausgab/expens/debit/soll` → Ausgaben
2. Explizites `+` am Anfang des Betrags → Einnahmen
3. Fallback: Ausgaben

**Auto-Kategorisierung via Regeln**:
Nach dem Mapping wird für jede Zeile `applyRegelLocal(name)` aufgerufen (clientseitig). Diese Funktion filtert Regeln mit `modus !== 'haushalt'` und wendet Bedingungen gegen den Transaktionsnamen an. Passende Regeln setzen Kategorie und/oder Typ. Ein Badge zeigt welche Regel griff.

**Editierbare Vorschau-Tabelle**:
- Jede Zeile: Checkbox (inkludieren/exkludieren), Name (editierbar), Betrag, Typ-Dropdown, Kategorie (editierbar), Konto-Dropdown
- „Alle aktivieren" / „Alle deaktivieren"
- Live-Zusammenfassung: Anzahl, Einnahmen, Ausgaben, Saldo
- Banner zeigt Anzahl automatisch kategorisierter Transaktionen

**Import-Endpunkt**: `POST /import/transactions`
- Nimmt Array von `{name, amount, type, category, date, account_id}` entgegen
- Schreibt jede gültige Transaktion per `saveTransaction()` in `ausgabenDB`
- Loggt einen Activity-Log-Eintrag mit `bulk_import: N`
- Gibt `{ imported: N }` zurück

---

## 9. Budget & Sparziele

### Budget-System

#### Tabelle
```sql
budgets (id, user_id, kategorie TEXT UNIQUE per user, betrag REAL)
```

#### Funktionsweise
- Jede Kategorie kann ein **monatliches Budget** erhalten
- Der Verbrauch wird aus `ausgabenDB` (Typ: Ausgaben, aktiver Monat, passende Kategorie) summiert
- **Farbampel**: grün < 70%, orange 70–90%, rot > 90% des Budgets
- **Prognose** (ab Tag 3 des Monats): Bisherige Ausgaben ÷ vergangene Tage × Monatstage
  - Zeigt eine vertikale Markierungslinie auf dem Balken
  - Warnung wenn Prognose > Budget: globales Warning-Banner mit betroffenen Kategorien
- **Donut-Chart**: Top-8 Kategorien nach Ausgaben (restliche in „Sonstiges")

#### Budgets anlegen/bearbeiten
- Werden per Kategoriename identifiziert (UNIQUE constraint per Nutzer)
- Kein Budget für eine Kategorie → Ausgaben trotzdem sichtbar als „kein Budget gesetzt"
- Löschen mit Undo-Toast (5 Sekunden)

---

### Sparziele (Finanzziele)

#### Tabelle
```sql
sparziele (
    id, user_id,
    name TEXT,
    zielbetrag REAL,
    gespart REAL,            -- aktuell angespartes Kapital
    datum TEXT,              -- optionales Zieldatum (ISO)
    farbe TEXT,              -- Hex-Farbe
    typ TEXT,                -- Zieltyp (s.u.)
    account_id INTEGER       -- optionales verknüpftes Konto
)
```

#### Zieltypen
`notgroschen`, `urlaub`, `auto`, `haus`, `rente`, `ausbildung`, `hochzeit`, `elektronik`, `sonstiges`

Jeder Typ hat ein eigenes Icon und eine passende Monatsspar-Berechnung.

#### Fortschrittsanzeige
- Prozentbalken mit aktuellem Fortschritt
- **Benötigte monatliche Sparrate**: `(zielbetrag - gespart) / MoNate bis Datum`
- **Status-Badge**:
  - „Auf Kurs" wenn tatsächlicher Fortschritt ≥ Soll-Fortschritt − 5%
  - „Hinter Plan" bei mehr als 5% Rückstand
  - „Erreicht" bei 100%
- Ohne Datum: Prognose auf Basis der durchschnittlichen Sparrate der letzten 3 Monate (aus Transaktionen der Kategorie „Sparziele" ermittelt)

#### Einzahlungen
Über den „Einzahlen"-Button öffnet sich ein Modal mit:
1. Betrag-Eingabe
2. Checkbox: **„Als Ausgabe im Ausgabentracker erfassen"** (Standard: aktiviert)

Bei Bestätigung:
- `POST /sparziele/:id/add` → erhöht `gespart` (maximal `zielbetrag`)
- Wenn Checkbox aktiv: erstellt eine Transaktion in `ausgabenDB`:
  - Name: `Sparziel: [Name des Ziels]`
  - Kategorie: `Sparziele`
  - Typ: `Ausgaben`
  - Konto: das verknüpfte Konto des Sparziels (falls vorhanden)
  - Datum: aktueller Tag

**Initiale Einzahlung**: Wird bei `POST /sparziele/add` mit `gespart > 0` ebenfalls automatisch eine Transaktion erstellt.

**Achtung**: Wenn `gespart` direkt über `PUT /sparziele/:id` (Edit-Formular) geändert wird, wird **keine** Transaktion erstellt. Diese Route ist für reine Metadaten-Änderungen gedacht, aber es gibt keine clientseitige Unterscheidung.

#### Konto-Aufteilung
Auf der Budget-Seite gibt es eine visuelle Aufteilung aller verknüpften Konten:
- Zeigt für jedes Konto: Gesamtstand, davon für Sparziele reserviert, freier Rest
- Warnung wenn die Summe aller Sparziele eines Kontos den Kontostand übersteigt

---

## 10. Fixkosten & Abos

### Tabelle
```sql
recurring_transactions (
    id, user_id,
    name TEXT,
    category TEXT,
    amount REAL,
    type TEXT,               -- 'Einnahmen' | 'Ausgaben'
    account_id INTEGER,
    rhythmus TEXT,           -- 'wöchentlich'|'monatlich'|'vierteljährlich'|'halbjährlich'|'jährlich'
    naechste_faelligkeit TEXT, -- ISO-Datum des nächsten Termins
    aktiv INTEGER DEFAULT 1, -- 1 = aktiv, 0 = pausiert
    notiz TEXT,
    subtyp TEXT,             -- 'fixkosten' | 'abo' | 'recurring'
    icon TEXT                -- RemixIcon-Klasse
)
```

### Unified-System
Fixkosten, Abos und wiederkehrende Transaktionen sind in einer einzigen Tabelle vereint. Die Unterscheidung erfolgt über `subtyp`:
- `fixkosten`: Regelmäßige Kosten (Miete, Strom)
- `abo`: Abonnements (Netflix, Spotify)
- `recurring`: Sonstige wiederkehrende Buchungen

### Erinnerungs-Leiste
Auf der Ausgabentracker-Seite erscheint am oberen Rand eine farbige Leiste, wenn Fixkosten fällig sind (`naechste_faelligkeit ≤ heute`). Sie zeigt bis zu 3 überfällige Positionen mit einem Quick-Book-Button.

### Buchen einer Fälligkeit
`POST /fixkosten/unified/:id/book`:
1. Erstellt eine neue Transaktion in `ausgabenDB` mit `recurring_id = fixkost.id`
2. Berechnet das nächste Fälligkeitsdatum basierend auf `rhythmus`
3. Aktualisiert `naechste_faelligkeit` in der Tabelle
4. Gibt das neue Datum zurück (für die Client-Aktualisierung)

**Nächste-Fälligkeit-Berechnung**:
- Monatlich: +1 Monat (gleicher Tag)
- Wöchentlich: +7 Tage
- Vierteljährlich: +3 Monate
- Halbjährlich: +6 Monate
- Jährlich: +1 Jahr

### Gebuchte Transaktionen
Transaktionen mit `recurring_id ≠ null` werden im Ausgabentracker mit einem Schloss-Icon angezeigt und sind **nicht editierbar** (verhindert inkonsistente Zustände).

### API-Endpunkte
| Methode | Route | Funktion |
|---------|-------|----------|
| GET | `/fixkosten/unified` | Alle wiederkehrenden Vorlagen |
| POST | `/fixkosten/unified/add` | Neue Vorlage |
| PUT | `/fixkosten/unified/:id` | Vorlage bearbeiten |
| DELETE | `/fixkosten/unified/:id` | Vorlage löschen |
| POST | `/fixkosten/unified/:id/book` | Buchen + Fälligkeit vorschreiben |

---

## 11. Schulden-Tracker

### Tabellen
```sql
schulden (
    id, user_id,
    kreditor TEXT,           -- Gläubiger
    betrag REAL,             -- ursprünglicher Schuldbetrag
    ausgezahlt REAL,         -- erhaltener Betrag (bei Krediten < Schuldbetrag möglich)
    zinssatz REAL,           -- jährlicher Zinssatz in %
    monatlich REAL,          -- monatliche Rate
    laufzeit_jahre REAL,
    datum_start TEXT,
    notiz TEXT,
    gesamt_gezahlt REAL      -- Summe aller erfassten Zahlungen
)

schulden_zahlungen (
    id, schulden_id,
    user_id INTEGER,
    betrag REAL,
    datum TEXT,
    notiz TEXT,
    transaction_id INTEGER,  -- optional: verknüpfte Transaktion in ausgabenDB
    account_id INTEGER       -- optional: verwendetes Konto
)
```

### Schulden erfassen
- Felder: Gläubiger, Schuldbetrag, monatliche Rate, Zinssatz, Startdatum, Notiz
- Dashboard zeigt: Restschuld (`betrag - gesamt_gezahlt`), gezahlte Summe, Fortschrittsbalken, nächste Rate

### Zahlungen erfassen
`POST /schulden/:id/zahlungen`:
- Erhöht `gesamt_gezahlt` um den Zahlungsbetrag
- Erstellt optional eine Transaktion in `ausgabenDB` (Typ: Ausgaben, Kategorie: „Schulden")
- `transaction_id` in `schulden_zahlungen` verweist auf die erstellte Transaktion

**Undo beim Löschen**: Zahlungen können mit Undo-Toast gelöscht werden. Achtung: Die verknüpfte Transaktion wird beim Löschen der Zahlung **nicht** automatisch mitgelöscht.

### Interaktion mit Transaktionen
Schulden-Zahlungen können optionale Transaktionen erzeugen. Die Verknüpfung ist einseitig: `schulden_zahlungen.transaction_id` zeigt auf `ausgabenDB.id`, aber nicht umgekehrt. Das bedeutet: Wird die Transaktion direkt gelöscht, bleibt die Zahlung bestehen (mit verwaister `transaction_id`).

---

## 12. Regeln & Automationen

### Tabelle
```sql
kategorisierungs_regeln (
    id, user_id,
    bedingung_operator TEXT,  -- 'enthält' | 'beginnt_mit' | 'endet_mit' | 'gleich'
    bedingung_wert TEXT,      -- Suchtext (case-insensitiv geprüft)
    aktion_kategorie TEXT,    -- zu setzende Kategorie (optional)
    aktion_typ TEXT,          -- zu setzender Typ: 'Einnahmen' | 'Ausgaben' (optional)
    aktiv INTEGER DEFAULT 1,
    modus TEXT DEFAULT 'beide'-- 'beide' | 'privat' | 'haushalt'
)
```

### Bedingungsoperatoren
| Operator | Beschreibung |
|----------|-------------|
| `enthält` | Transaktionsname enthält den Wert |
| `beginnt_mit` | Transaktionsname beginnt mit dem Wert |
| `endet_mit` | Transaktionsname endet mit dem Wert |
| `gleich` | Transaktionsname ist exakt gleich dem Wert |

Der Vergleich erfolgt immer **case-insensitiv** (beide Seiten `.toLowerCase()`).

### Modi
| Modus | Wird angewendet in |
|-------|-------------------|
| `beide` | Privaten Transaktionen + Haushalt-Transaktionen |
| `privat` | Nur privaten Transaktionen |
| `haushalt` | Nur Haushalt-Transaktionen |

### Anwendungspunkte
Regeln werden an **drei Stellen** angewendet:

**1. Live während Eingabe (clientseitig)**
Beim Tippen des Transaktionsnamens im Ausgabentracker oder Haushalt-Tracker (Debounce: 250ms) wird `applyRegelLocal()` aufgerufen. Die erste passende Regel setzt Kategorie und/oder Typ im Formular und zeigt einen Hinweis-Badge. Im Haushalt-Tracker werden nur Regeln mit `modus = 'beide'` oder `modus = 'haushalt'` berücksichtigt; im Privat-Tracker nur `'beide'` oder `'privat'`.

**2. Beim Speichern (serverseitig)**
`POST /addTransaction` ruft `db.applyRegeln(userId, name, category, type, 'privat')` auf. Nur wenn die Regel passt und `modus` `'beide'` oder `'privat'` ist, wird sie angewendet. Serverseitig überschreibt die Regel die client-seitig gesetzten Werte (falls vom Client kein Wert mitgegeben wurde).

**3. Beim CSV-Import (clientseitig)**
Nach dem Spalten-Mapping wendet `import.js` Regeln auf alle importierten Zeilen an. Nur Regeln mit `modus !== 'haushalt'` werden berücksichtigt.

**4. Batch-Anwendung**
`POST /regeln/apply-all` wendet alle aktiven Regeln rückwirkend auf **alle bestehenden Transaktionen** des Nutzers an. Nur die erste passende Regel pro Transaktion wird angewendet. Transaktionen mit bereits gesetzter Kategorie werden **überschrieben**.

### Regelreihenfolge
Die Regeln werden in der Reihenfolge ihrer Erstellung (nach ID) geprüft. **Die erste passende Regel gewinnt** – es gibt kein Prioritätssystem. Werden Regeln bearbeitet, ändert sich ihre Reihenfolge nicht.

### Aktion
Jede Regel kann eine oder beide Aktionen ausführen:
- **Kategorie setzen**: z.B. „REWE" → Kategorie = „Lebensmittel"
- **Typ setzen**: z.B. „Gehalt" → Typ = „Einnahmen"
Eine Regel ohne beide Aktionen ist technisch möglich, aber nutzlos.

---

## 13. Steuer-Modul

### Zugang
Sidebar → Finanzen → Steuer-Modul (`/users/steuern`)

### Tab-Übersicht

---

#### Tab 1: Jahresübersicht
Lädt alle Transaktionen des Nutzers für das gewählte Steuerjahr und stellt dar:
- **Stat-Karten**: Gesamteinnahmen, Gesamtausgaben, Werbungskosten, Netto-Saldo
- **Werbungskosten**: Summe aus `steuer_werbungskosten` + Vergleich mit Pauschbetrag (1.230 €)
- **Monatliches Balkendiagramm**: Einnahmen vs. Ausgaben (Chart.js)
- **Werbungskosten-Balken**: Aufschlüsselung nach Kategorie
- **Monatstabelle**: Detaillierte Monatsauswertung

⚠️ **Wichtig**: Die Jahresübersicht zeigt Transaktionen aus `ausgabenDB` (Ausgabentracker). Das sind **keine** Steuerdaten – Bruttoeinkommen aus der Lohnsteuerbescheinigung ist separat im Erstattungsschätzer einzugeben.

---

#### Tab 2: Erstattungsschätzer
Berechnung der geschätzten Einkommensteuer und Erstattung/Nachzahlung.

**Eingabefelder**:
| Bereich | Feld | Details |
|---------|------|---------|
| Einkommen | Bruttoeinkommen | Jahresbetrag |
| Einkommen | Steuerklasse | I–VI |
| Einkommen | Kirchensteuer | Keine / 8% (BY, BW) / 9% (andere) |
| Abzüge | Werbungskosten | Minimum: 1.230 € Pauschale |
| Abzüge | Sonderausgaben | Kirchensteuer, Spenden etc. |
| Abzüge | Außergewöhnliche Belastungen | Arztkosten etc. |
| Abzüge | Gezahlte Lohnsteuer | Aus Lohnsteuerbescheinigung |
| Kapitalerträge | Kapitalerträge gesamt | Dividenden + Zinsen + Kursgewinne |
| Kapitalerträge | Genutzte FSA | Freistellungsaufträge |
| Altersvorsorge | Rürup-Beitrag | 94% absetzbar, max. 27.565 € |
| Altersvorsorge | Riester-Beitrag | Max. 2.100 € |

**Berechnungslogik**:
1. Werbungskosten: `max(Eingabe, 1.230)`
2. Rürup-Abzug: `min(Eingabe × 0,94, 27.565 × 0,94)`
3. Riester-Abzug: `min(Eingabe, 2.100)`
4. Grundfreibetrag 2024: 11.604 € (ledig) / 23.208 € (verheiratet, Kl. III)
5. ZVE: `max(0, Brutto - Werbung - Sonder - Belastungen - Altersvorsorge-Abzug - Grundfreibetrag)`
6. ESt aus Grundtabelle 2024 (vereinfacht, 4 Progressionszonen)
7. Soli: 5,5% der ESt wenn ESt > 18.130 € (mit Gleitzone)
8. Kirchensteuer: 8% oder 9% der ESt
9. **Kapitalerträge**: Abgeltungssteuer 25% auf `max(0, Kapitalerträge - FSA)`
10. Soli auf Abgeltungssteuer: 5,5% wenn Abgeltungssteuer > 972,50 €
11. Differenz zu gezahlter Lohnsteuer = Erstattung (positiv) oder Nachzahlung (negativ)

**Einschränkungen**: Die Berechnung ist vereinfacht und dient nur als Orientierung. Keine Berücksichtigung von Kinderfreibeträgen, Altersentlastungsbeträgen, besonderen Abzügen etc.

---

#### Tab 3: Werbungskosten
Erfassung absetzbarer Berufsausgaben.

**Tabelle**: `steuer_werbungskosten (id, user_id, kategorie, bezeichnung, betrag, datum, steuerjahr, notiz)`

**Kategorien**: Fahrtkosten, Arbeitsmittel, Fortbildung, Homeoffice, Bewerbungen, Sonstiges

**Anzeige**: Gruppiert nach Kategorie, mit Jahresgesamtbetrag und Vergleich mit Pauschbetrag (1.230 €). Jahresübersichtstab zeigt auch Werbungskosten-Chart.

Löschen mit Undo-Toast (5 Sekunden).

---

#### Tab 4: Kapitalerträge
Erfassung von Kapitalerträgen nach Depot/Konto.

**Tabelle**: `steuer_kapitalertraege (id, user_id, institution, steuerjahr, freistellungsauftrag, dividenden, zinsen, kursgewinne)`

**Logik pro Eintrag**:
- Gesamterträge = Dividenden + Zinsen + Kursgewinne
- Steuerpflichtiger Anteil = `max(0, Gesamterträge - Freistellungsauftrag)`
- Abgeltungssteuer = Steuerpflichtiger Anteil × 25%

**Gesamtübersicht**:
- Summe aller Erträge und FSA-Beträge über alle Einträge
- Warnung wenn Gesamt-FSA < Sparerpauschbetrag (1.000 € ledig / 2.000 € verheiratet)

**Interaktion mit Erstattungsschätzer**: Die Kapitalerträge-Daten werden **nicht** automatisch in den Schätzer übernommen – der Nutzer muss die Werte manuell eintragen.

---

#### Tab 5: Altersvorsorge
Erfassung von Altersvorsorge-Verträgen.

**Tabelle**: `steuer_altersvorsorge (id, user_id, typ, bezeichnung, eigenbeitrag, ag_beitrag, zulage, steuerjahr)`

**Vertragstypen**:
| Typ | Erklärung | Steuerlicher Tipp |
|-----|-----------|-------------------|
| `riester` | Riester-Rente | bis 2.100 € als Sonderausgabe (inkl. Zulage: 175 €/J Grundzulage) |
| `ruerup` | Rürup/Basisrente | 94% des Beitrags absetzbar (2024), max. 27.565 € |
| `bav` | Betriebliche Altersvorsorge | AG-Beiträge bis 4% der BBG (3.624 €/2024) steuerfrei |
| `gkv` | Gesetzliche Rentenversicherung | Automatisch über Lohnsteuerbescheinigung |

**Hinweis-Texte**: Das Modal zeigt typ-abhängige Hinweise. AG-Beitragsfeld nur bei bAV; Zulagen-Feld nur bei Riester.

---

#### Tab 6: Sonderausgaben
Erfassung sonstiger absetzbarer Ausgaben.

**Tabelle**: `steuer_sonderausgaben (id, user_id, kategorie, bezeichnung, betrag, steuerjahr, notiz)`

**Kategorien**:
| Kategorie | Max. Abzug | Hinweis |
|-----------|-----------|---------|
| `kirchensteuer` | vollständig | Gezahlte Kirchensteuer selbst absetzbar |
| `spenden` | 20% des Einkommens | Bis 300 € reicht Kontoauszug |
| `schulgeld` | 4.000 €/Kind | 2/3 der Kosten, Kinder unter 14 |
| `ausbildung` | 6.000 € | Erstausbildung / Studium |
| `unterhalt` | 13.805 € | Nur mit Anlage U (Zustimmung Empfänger) |
| `sonstiges` | variabel | |

---

#### Tab 7: Steuererklärung-Assistent
Checkliste zur Vorbereitung der Steuererklärung.

**Tabelle**: `steuer_assistent (user_id PK, checks_json TEXT)` – speichert ein JSON-Objekt mit `{[checkboxId]: true/false}`.

Gruppen: Einkommensnachweise, Werbungskosten, Sonderausgaben & Versicherungen, Außergewöhnliche Belastungen, Sonstiges.

**Fortschrittsanzeige** in der Sidebar: `erledigt / gesamt` mit Fortschrittsbalken.

**Fristen**: Anzeige wichtiger Abgabefristen (31. Juli ohne Berater, 28. Februar übernächstes Jahr mit Berater, 1 Monat Einspruchsfrist).

---

#### Tab 8: Steuer-Dokumente
Zeigt Dokumente aus dem allgemeinen Dokumentenportal, gefiltert nach `typ = 'steuer'` oder `typ = 'gehalt'`. Gruppiert nach Jahr. Direktlink zur Dokumentenübersicht für den Upload.

---

## 14. Aktivitätsprotokoll

### Tabelle
```sql
activity_log (
    id, user_id,
    aktion TEXT,     -- 'erstellt' | 'geändert' | 'gelöscht'
    entity TEXT,     -- Entitätstyp (s.u.)
    entity_id INT,   -- ID der betroffenen Entität (null bei Bulk-Operationen)
    details TEXT,    -- JSON mit relevanten Feldwerten
    created_at TEXT
)
```

### Geloggte Entitäten
| entity | Wann geloggt |
|--------|-------------|
| Transaktion | erstellt, gelöscht, CSV-Bulk-Import |
| Konto | erstellt, bearbeitet, gelöscht |
| Finanzziel | erstellt, bearbeitet, gelöscht, Einzahlung |
| Budget | erstellt, bearbeitet, gelöscht |
| Schuld | erstellt, gelöscht |
| Fixkosten | erstellt, gelöscht |
| Haushalt-Transaktion | erstellt, gelöscht |

**Nicht geloggt**: `PUT /updateTransaction` (Bearbeitung privater Transaktionen), Kategorien-Änderungen, Einstellungsänderungen.

### details-JSON
Das `details`-Feld enthält je nach Entität unterschiedliche Felder:
- Transaktion: `{ name, amount, type, category, date }`
- Finanzziel: `{ name, zielbetrag }` oder `{ name, betrag }` bei Einzahlung
- Budget: `{ kategorie, betrag }`
- Bulk-Import: `{ bulk_import: N, quelle: 'CSV-Import' }`

### Anzeige
- **Privat**: `/users/activity` – Filter nach Entitätstyp
- **Haushalt**: `/users/activity?filter=Haushalt-Transaktion`
- Pagination: 50 Einträge pro Seite, „Mehr laden"-Button
- Gruppierung nach Datum (Heute / Gestern / Wochentag + Datum)
- Icons: Entitäts-Icon + Aktions-Icon + Farbcodierung (grün=erstellt, blau=geändert, rot=gelöscht)
- Detail-Tags: Betrag, Typ, Kategorie, Datum aus dem `details`-JSON

---

## 15. Haushalt-Modus

### Konzept
Der Haushalt-Modus ermöglicht gemeinsame Finanzverwaltung für **zwei Personen**. Alle Haushaltsdaten sind vollständig von den privaten Daten getrennt (eigene Tabellen, eigene Kategorien).

### Tabellen-Übersicht
```sql
haushalte (id, name, erstellt_von INTEGER, created_at)
haushalt_mitglieder (id, haushalt_id, user_id, anzeigename, rolle)
haushalt_konten_v2 (id, haushalt_id, name, balance, color, linked_account_id)
haushalt_transaktionen (id, haushalt_id, eingetragen_von, name, category, amount,
                        type, date, konto_id, anteil_user1, anteil_user2, notiz)
haushalt_fixkosten (id, haushalt_id, name, betrag, rhythmus, kategorie,
                    anteil_user1, anteil_user2, datum_tag, erstellt_von)
haushalt_fixkosten_monat (id, haushalt_id, fixkosten_id, monat, betrag,
                          anteil_user1, anteil_user2, UNIQUE(...))
haushalt_gehaelter (id, haushalt_id, user_id, monat, gehalt, sparbetrag)
haushalt_ausgaben (id, haushalt_id, erstellt_von, name, betrag, datum, kategorie,
                   notiz, tx_id)
haushalt_todos (id, haushalt_id, erstellt_von, task, completed, priority,
                due_date, label, notes)
haushalt_dokumente (id, haushalt_id, hochgeladen_von, typ, name, ...)
haushalt_tracker_categories (id, haushalt_id, name, UNIQUE(haushalt_id, name))
```

### Haushalt erstellen & einladen
- Nutzer erstellt Haushalt über `/users/haushalt` → erhält Einladungs-Code
- Zweite Person nimmt Einladung an (`/users/haushalt/einladung/:code/accept`)
- Beide Mitglieder sehen den Haushalt im Haushalt-Modus
- Max. 2 Mitglieder pro Haushalt

### Haushalt-Konten (haushalt_konten_v2)
- Mehrere Konten pro Haushalt möglich (v2 entfernt den UNIQUE-Constraint auf `haushalt_id`)
- Konten können mit privaten Konten verlinkt werden (`linked_account_id`)
- Kontostand wird analog zu privaten Konten dynamisch aus `haushalt_transaktionen` berechnet
- Konto-Filter im Tracker: Im localStorage gespeichert als `tracker_active_accounts` (Array von Konto-IDs)

### Haushalt-Transaktionen
- Felder ähnlich wie private Transaktionen
- Zusätzlich: `konto_id`, `anteil_user1`, `anteil_user2` (Kostenaufteilung in %)
- `eingetragen_von`: ID des Nutzers, der die Transaktion erfasst hat
- Regeln mit `modus = 'haushalt'` oder `'beide'` werden angewendet
- Live-Regelanwendung im Haushalt-Tracker mit Hinweis-Badge
- Löschen mit Undo-Toast (5 Sekunden)

### Haushalt-Fixkosten
- Separate Tabelle mit Kostenaufteilung
- `anteil_user1` / `anteil_user2`: prozentuale Anteile (sollten zusammen 100 ergeben)
- `datum_tag`: Tag des Monats für die Fälligkeit
- **Monats-Abweichungen** (`haushalt_fixkosten_monat`): Für einen bestimmten Monat kann der Betrag abweichen (z.B. Jahresabrechnung)

### Haushalt-Gehälter
Für jeden Nutzer und jeden Monat kann ein Gehalt + Sparbetrag eingetragen werden (`haushalt_gehaelter`). Wird für das Haushalt-Dashboard verwendet.

### UI-Design-Override
Im Haushalt-Modus wird die CSS-Variable `--haus-accent` (standardmäßig `#10b981`, Smaragdgrün) für Akzentfarben, Links und Badges verwendet statt des lila `--accent`. Alle Haushalt-spezifischen Links in der Sidebar haben die Klasse `sidebar-link-haus`.

### Haushalt-Regeln
Regeln mit `modus = 'haushalt'` oder `'beide'` gelten für Haushalt-Transaktionen. Die Regelverwaltung ist dieselbe Seite (`/users/regeln`) – Modus wird pro Regel definiert. Im Haushalt-Tracker filtert `applyRegelLocal()` clientseitig die Regeln nach Modus.

### API-Endpunkte (Auswahl)
| Methode | Route | Funktion |
|---------|-------|----------|
| GET | `/haushalt` | Haushalt-Dashboard |
| POST | `/haushalt/create` | Haushalt erstellen |
| POST | `/haushalt/invite` | Einladungs-Code generieren |
| POST | `/haushalt/einladung/:code/accept` | Einladung annehmen |
| GET | `/haushalt/tracker` | Transaktionen-Seite |
| GET | `/haushalt/transaktionen` | JSON: alle Transaktionen |
| POST | `/haushalt/transaktionen/add` | Transaktion hinzufügen |
| DELETE | `/haushalt/transaktionen/:id` | Transaktion löschen |
| GET | `/haushalt/konto/data` | `{ konten, konto: konten[0] }` |
| POST | `/haushalt/konto/create` | Neues Haushalt-Konto |
| POST | `/haushalt/konto/import` | Privatkonto importieren |
| GET | `/haushalt/fixkosten` | Haushalt-Fixkosten-Seite |
| GET | `/haushalt/ausgaben` | Fixkosten & Planung |

---

## 16. Dashboard & Übersichten

### Privates Dashboard (`/users/overview`)

#### Net-Worth-Widget
Zeigt das Nettovermögen: Assets (Konten + Investments) minus Verbindlichkeiten (Schulden).
- Konten: `accounts.currentBalance`
- Investments: `finanzen_investments.portfoliowert` (manuell eintragbar)
- Immobilien: kann manuell ergänzt werden
- Schulden: Summe aller `schulden.betrag - gesamt_gezahlt`
- Visualisierung als Donut-Chart (Chart.js)

#### Cashflow-Prognose
- Zeigt Einnahmen und Ausgaben der letzten 6 Monate aus `ausgabenDB`
- Prognose für kommende 3 Monate (linear extrapoliert aus Ø der letzten 3 Monate)
- Linie-Chart mit Chart.js

#### Financial Insights
Automatisch generierte Hinweise auf Basis der Transaktionsdaten:
- Höchste Ausgaben-Kategorien
- Budget-Überschreitungen
- Ungewöhnliche Ausgaben (Vergleich zu Vormonat)
- Hinweis auf fällige Fixkosten

#### Meine Finanzen (`/users/meine-finanzen`)
Detaillierte Übersicht:
- Konten mit Ständen und Transaktionshistorie
- Investitions-Portfolio (manuell über `finanzen_investments`)
- Schulden-Übersicht
- Cashflow-Diagramm

### Haushalt-Dashboard (`/users/haushalt`)
- Gesamteinnahmen/-ausgaben des Haushalts
- Monatsübersicht
- Letzte gemeinsame Transaktionen
- Fixkosten-Übersicht
- Aufgaben-Liste

---

## 17. Kalender

### Zugang
Sidebar → Kalender (`/users/kalender`)

### Inhalte
Der Kalender zeigt Einträge aus verschiedenen Quellen:
- **Fälligkeiten** (Fixkosten): `naechste_faelligkeit` aus `recurring_transactions`
- **Schulden-Raten**: `monatlich` aus `schulden` (nächste Rate berechnet aus `datum_start`)
- **Sparziel-Zieldaten**: `datum` aus `sparziele` falls gesetzt
- **Erinnerungen** aus `erinnerungen`-Tabelle (falls vorhanden)
- **To-do-Fälligkeiten**: `due_date` aus `todos`

Klick auf einen Eintrag navigiert zur entsprechenden Seite (z.B. Fixkosten, Schulden).

---

## 18. To-do-Liste

### Tabelle (privat)
```sql
todos (
    id, user_id,
    task TEXT,
    completed INTEGER DEFAULT 0,
    priority TEXT DEFAULT 'mittel',  -- 'hoch' | 'mittel' | 'niedrig'
    due_date TEXT,
    label TEXT,
    notes TEXT,
    created_at TEXT
)
```

### Zugang
Sidebar → To-do-Liste (`/users/todo`)

### Funktionen
- Erstellen, Bearbeiten, Abhaken, Löschen von Aufgaben
- Prioritätsstufen mit Farbcodierung
- Fälligkeitsdatum (erscheint auch im Kalender)
- Labels/Tags für Gruppierung

---

## 19. Dokumente

### Tabelle
```sql
dokumente (
    id, user_id,
    typ TEXT,          -- 'steuer' | 'gehalt' | 'versicherung' | 'sonstiges' | ...
    name TEXT,
    datum TEXT,
    jahr INTEGER,
    notiz TEXT,
    file_data TEXT,    -- BASE64-kodierte Datei (⚠ Performance-Problem, s. Kap. 25)
    file_ext TEXT,
    file_mime TEXT,
    betrag REAL,
    faellig_datum TEXT,
    aussteller TEXT,
    status TEXT,       -- 'offen' | 'erledigt' | 'abgelaufen'
    kategorie TEXT,
    brutto REAL, netto REAL,
    arbeitgeber TEXT,
    monat TEXT,
    steuer_art TEXT,
    steuerjahr INTEGER,
    created_at TEXT
)
```

### Dokumenttypen
Steuer-relevante Typen (`steuer`, `gehalt`) erscheinen auch im Steuer-Modul (Tab „Steuer-Dokumente").

### Upload
Dateien werden als Base64 in der SQLite-Datenbank gespeichert (`file_data`). Das funktioniert für kleine Dateien, wird aber bei großen Dokumentenmengen zum Performance-Problem (DB-Größe, Abfrage-Geschwindigkeit). Dies ist als offenes Item 1.8 dokumentiert.

### Anzeigen
`GET /users/dokumente/:id/view` liefert die Datei mit korrektem MIME-Type für Browser-Anzeige.

---

## 20. Versicherungen

### Tabelle
```sql
versicherungen (
    id, user_id,
    typ TEXT,            -- Versicherungstyp
    anbieter TEXT,
    beitrag REAL,
    rhythmus TEXT,       -- 'monatlich' | 'jährlich' etc.
    beginn TEXT,
    ablauf TEXT,
    notiz TEXT
)
```

Einfaches CRUD-Modul. Keine direkte Verknüpfung mit Transaktionen oder Fixkosten, aber die Beiträge könnten manuell als Fixkosten erfasst werden.

---

## 21. Globale Suche

### Zugang
`Strg+K` überall in der App → öffnet Such-Modal

### Implementierung
Die Suche (`#ggcSearchInput`) sendet nach 300ms Debounce eine Anfrage an `GET /users/search?q=...`.

### Durchsuchte Bereiche
| Bereich | Felder | Ziel-Link |
|---------|--------|-----------|
| Transaktionen | name, category | `/ausgabentracker` |
| Konten | name | `/meine-finanzen` |
| Sparziele | name | `/budget#sparzieleTab` |
| Fixkosten | name | `/fixkosten` |
| Schulden | kreditor | `/schulden` |
| Todos | task | `/todo` |
| Dokumente | name, aussteller | `/dokumente` |

### Tastaturnavigation
- `↑`/`↓`: Ergebnisse durchsuchen
- `Enter`: Ausgewähltes Ergebnis öffnen
- `Esc`: Modal schließen

---

## 22. Datenexport

### Zugang
Sidebar (Footer) → Daten exportieren (`/users/export`)

### Export-Typen

| Typ | Format | Inhalt |
|-----|--------|--------|
| Transaktionen | CSV oder JSON | Gefiltert nach Konto und Zeitraum |
| PDF-Bericht | PDF (jsPDF) | Diagramme + Monatsübersichten |
| Monatsanalyse | PDF | Ein Monat detailliert |
| Backup | JSON | Alle Daten (ohne Datei-Anhänge) |
| Einzelbereiche | CSV/JSON | Konten, Sparziele, Fixkosten, Schulden, etc. |
| Haushalt | JSON/CSV | Haushalt-Transaktionen, -Konten, -Fixkosten |

### PDF-Export (jsPDF, clientseitig)
PDFs werden vollständig im Browser generiert. Chart.js-Diagramme werden als Canvas-Screenshot eingebettet. Dokument-Anhänge sind **nicht** im Export enthalten (nur Metadaten).

### Backup-JSON
`GET /export/data` gibt alle Daten des Nutzers zurück. `file_data` (Base64) wird bewusst **ausgelassen**, da es sonst die JSON-Datei zu groß werden würde.

---

## 23. Einstellungen & Profil

### Tabellen
- `user_profiles`: `display_name`, `avatar_url`, `tarif`
- `user_settings`: `theme`, `language`, `currency`, `notifications_*`, `two_factor`

### Theme
Dark/Light-Mode über `user_settings.theme`. Die Auswahl wird serverseitig gespeichert und beim Laden der Seite als CSS-Klasse auf `<body>` gesetzt.

### Profil-Seite
- Anzeigename, Avatar (URL)
- Passwort ändern
- 2FA aktivieren/deaktivieren

### Einstellungen-Seite
- Theme
- Sprache (aktuell nur Deutsch)
- Währung (aktuell nur EUR)
- E-Mail-Benachrichtigungen

### Cron-Erinnerungen
`modules/reminder.js` läuft täglich und versendet Erinnerungs-E-Mails wenn:
- Fixkosten in den nächsten 3 Tagen fällig sind
- Schulden-Raten bald fällig sind
- Sparziel-Zieldaten bald erreicht werden

---

## 24. Feature-Interaktionen (Gesamtbild)

### Datenflusskarte

```
CSV-Import
    │
    ├──[Regeln anwenden]──→ Kategorien setzen
    │
    └──→ ausgabenDB.INSERT
              │
              ├──[account_id]──→ Kontostand-Berechnung
              │                       └──[Sparziel.account_id]──→ Konto-Aufteilung
              │
              ├──[category]──→ Budget-Auswertung
              │                       └──[Prognose]──→ Budget-Warnung
              │
              ├──[recurring_id]──→ Schloss in UI (nicht editierbar)
              │
              ├──[transfer_pair_id]──→ Transfer-Anzeige + Löschen beider Seiten
              │
              └──[logActivity]──→ activity_log
```

### Transaktions-Entstehungsquellen
Eine Transaktion in `ausgabenDB` kann entstehen durch:

| Quelle | Route | Besonderheiten |
|--------|-------|----------------|
| Manuell (Tracker) | `POST /addTransaction` | Regeln werden angewendet |
| Sparziel-Einzahlung | `POST /sparziele/:id/add` | Nur wenn `createTransaction = true` |
| Sparziel-Neuerstellung | `POST /sparziele/add` | Nur wenn `gespart > 0` |
| Schulden-Zahlung | `POST /schulden/:id/zahlungen` | Nur wenn `createTransaction = true` |
| Fixkost buchen | `POST /fixkosten/unified/:id/book` | `recurring_id` gesetzt |
| Transfer | `POST /transfer` | Zwei Transaktionen, `transfer_pair_id` |
| Kontostand-Abgleich | `POST /accounts/:id/abgleich` | Kategorie: „Kontostand-Abgleich" |
| CSV-Import | `POST /import/transactions` | Batch, Regeln clientseitig angewendet |

### Regeln-Anwendungsmatrix

| Kontext | Zeitpunkt | Modus-Filter | Wer wendet an |
|---------|-----------|-------------|---------------|
| Privater Tracker (Eingabe) | Live (250ms) | `privat` oder `beide` | Client |
| Privater Tracker (Speichern) | Bei POST | `privat` oder `beide` | Server |
| Haushalt-Tracker (Eingabe) | Live (250ms) | `haushalt` oder `beide` | Client |
| Haushalt-Tracker (Speichern) | Bei POST | `haushalt` oder `beide` | Server |
| CSV-Import (Vorschau) | Nach Mapping | `privat` oder `beide` | Client |
| Regeln → Apply-All | Manuell | alle aktiven | Server |

### Kontostand-Abhängigkeiten

```
accounts.balance (Startwert)
    + SUM(ausgabenDB WHERE type='Einnahmen' AND account_id=X)
    - SUM(ausgabenDB WHERE type='Ausgaben' AND account_id=X)
    = currentBalance (berechnet, nie gespeichert)
        └── Konto-Aufteilung:
                - SUM(sparziele.gespart WHERE account_id=X) = reserviert
                - currentBalance - reserviert = freies Geld
```

### Budget ↔ Transaktionen
Budget-Auswertung liest Transaktionen des **aktuellen Monats** für jede Kategorie:
```
ausgabenDB WHERE user_id=X AND type='Ausgaben' AND date LIKE 'YYYY-MM-%' AND category=Y
```
Da Kategorien Freitext sind, ist die Verknüpfung **fehleranfällig**: `"Lebensmittel"` ≠ `"lebensmittel"` ≠ `"Lebensmittel "`.

### Steuer-Interaktionen
- Die Jahresübersicht zeigt Transaktionen aus `ausgabenDB` – das sind **keine** echten Steuerdaten
- Kapitalerträge, Altersvorsorge, Sonderausgaben in eigenen Tabellen
- Erstattungsschätzer ist vollständig manuell – keine Daten werden automatisch übernommen
- Steuer-Dokumente kommen aus dem allgemeinen `dokumente`-Pool (gefiltert nach Typ)

---

## 25. Bekannte Schwachstellen & Verbesserungspotenziale

### Kritisch (Datenkonsistenz)

#### 1. Sparziel-Einzahlung via Edit-Formular erzeugt keine Transaktion
**Problem**: Wenn der Nutzer `gespart` direkt über das Edit-Formular eines Sparziels (`PUT /sparziele/:id`) ändert, wird keine Transaktion erstellt. Nur `POST /sparziele/:id/add` (der Einzahlen-Button) erzeugt Transaktionen. Das bedeutet, manuell korrigierte `gespart`-Werte sind im Ausgabentracker unsichtbar.

**Verbesserung**: Edit-Formular sollte bei `gespart`-Änderung die Differenz erkennen und optional eine Transaktion erstellen.

#### 2. Schulden-Zahlung löschen entfernt nicht die verknüpfte Transaktion
**Problem**: `DELETE /schulden/zahlungen/:id` löscht die Zahlung, aber die über `transaction_id` verknüpfte Transaktion in `ausgabenDB` bleibt bestehen. Das führt zu einer verwaisten Transaktion.

**Verbesserung**: Serverseitig beim Löschen einer Zahlung: `DELETE FROM ausgabenDB WHERE id = zahlung.transaction_id`.

#### 3. Transaktions-Bearbeitung wird nicht ins Activity-Log geschrieben
**Problem**: `PUT /updateTransaction/:id` fehlt ein `logActivity()`-Aufruf. Änderungen an Transaktionen (Kategorie, Betrag, Name) sind im Aktivitätsprotokoll nicht nachvollziehbar.

**Verbesserung**: Activity-Log bei jedem `updateTransaction`-Aufruf schreiben, idealerweise mit vorherigen und neuen Werten.

#### 4. Kategorien sind reiner Freitext ohne Normalisierung
**Problem**: Budget-Kategorien und Transaktions-Kategorien sind durch Freitext-Matching verbunden. Groß-/Kleinschreibung, Leerzeichen oder Tippfehler führen dazu, dass Transaktionen nicht dem richtigen Budget zugeordnet werden.

**Verbesserung**: Kategorien über eine zentrale Tabelle verwalten (aktuell `custom_categories`), aber auch Standard-Kategorien dort hineinmigrieren. Budget und Transaktion sollten gegen dieselbe Quelle matchen.

---

### Hoch (Funktionalität)

#### 5. Dokumente als Base64 in SQLite (offenes Item 1.8)
**Problem**: `dokumente.file_data` speichert Dateien Base64-kodiert direkt in SQLite. Bei größeren Dokumentenmengen oder größeren Dateien wächst die Datenbank stark an, Abfragen werden langsam, und das Backup-JSON wäre riesig (deshalb ist `file_data` aus dem Export-Endpoint ausgeschlossen).

**Verbesserung**: Dateien ins Filesystem speichern (`/uploads/docs/[user_id]/[filename]`), `file_data` durch einen Dateipfad ersetzen.

#### 6. Haushalt-Modus nur für 2 Personen
**Problem**: Das Datenmodell (`anteil_user1`, `anteil_user2`) ist hart auf genau zwei Personen ausgelegt. Eine dritte Person kann den Haushalt nicht sinnvoll nutzen.

**Verbesserung**: Kostenaufteilung als flexible N-Personen-Tabelle statt zwei fester Spalten.

#### 7. Modus-Zustand im localStorage (nicht Session-sicher)
**Problem**: Der aktive Modus (Privat/Haushalt) wird im localStorage gespeichert, nicht im Server-Session. Bei zwei Tabs kann ein Nutzer versehentlich im falschen Modus arbeiten.

**Verbesserung**: Modus in `req.session` speichern, oder zumindest server-seitig validieren.

---

### Mittel (UX & Konsistenz)

#### 8. Regeln werden in `apply-all` immer überschreibend angewendet
**Problem**: `POST /regeln/apply-all` überschreibt Kategorien aller Transaktionen, auch wenn der Nutzer manuell eine abweichende Kategorie gesetzt hat.

**Verbesserung**: Option „nur leere Kategorien auffüllen" vs. „alle überschreiben".

#### 9. CSV-Import: Keine Duplikatserkennung
**Problem**: Wird dieselbe CSV-Datei zweimal importiert, werden alle Transaktionen doppelt erstellt. Es gibt keine Prüfung auf bereits vorhandene Daten (z.B. per Datum + Name + Betrag).

**Verbesserung**: Duplikatserkennung im Import-Endpoint (Hash aus Datum + Name + Betrag vergleichen) oder Nutzer-Hinweis.

#### 10. Fixkosten ohne Konto-Auswahlerzwingung
**Problem**: Beim Buchen einer Fixkost ist ein Konto optional. Gebuchte Fixkosten ohne Konto-Zuweisung beeinflussen keinen Kontostand.

**Verbesserung**: UI-Hinweis wenn kein Konto bei der Buchung ausgewählt ist.

#### 11. Regeln: „Erste Regel gewinnt" ohne Prioritätssystem
**Problem**: Die Reihenfolge der Regeln bestimmt welche greift, aber diese Reihenfolge ist nicht sortierbar (nur per Löschen/Neu-Anlegen änderbar).

**Verbesserung**: Drag-and-Drop-Sortierung für Regeln, oder ein `prioritaet`-Feld.

#### 12. Steuer-Erstattungsschätzer: Manuell, keine Datensynchronisation
**Problem**: Der Schätzer ist von allen anderen Steuer-Daten entkoppelt. Kapitalerträge, Altersvorsorge und Sonderausgaben die der Nutzer in den jeweiligen Tabs eingetragen hat, werden **nicht** automatisch in den Schätzer übernommen.

**Verbesserung**: Button „Aus erfassten Daten vorausfüllen" der die Jahressummen der entsprechenden Tabellen in die Schätzer-Felder einsetzt.

---

### Niedrig (Code-Qualität / Kleinigkeiten)

#### 13. Haushalt-Konto-Filter im localStorage kann veralten
`tracker_active_accounts` (Array von Konto-IDs) wird im localStorage gespeichert. Wenn ein Konto gelöscht wird, bleibt seine ID im Filter bestehen (führt zu leerem Filter statt allen Konten).

#### 14. Grundfreibetrag und Steuertarif sind hardgecoded
In `steuern.js` (Funktion `berechnEStGrundtabelle`) sind die Steuerparameter 2024 fest einkodiert. Für das Steuerjahr 2025 müssten sie manuell aktualisiert werden.

#### 15. Transfer-Pair-Inkonsistenz möglich bei halbem Löschen
Wenn `DELETE /transfer/:id` die zweite Transaktion des Paares aus einem technischen Fehler nicht findet (z.B. durch manuelles DB-Eingreifen), bleibt eine „verwaiste" Transaktion ohne Gegenstück zurück.

#### 16. activity_log speichert keine Vorher-Nachher-Werte bei Änderungen
Änderungen (`aktion = 'geändert'`) speichern nur den neuen Zustand, nicht was vorher war. Ein echter Audit-Trail würde `{ vorher: {...}, nachher: {...} }` benötigen.

#### 17. `saveTransaction` vs. `addTransaction` – Inkonsistente DB-Methodennamen
Die Methode zum Erstellen einer Transaktion heißt `saveTransaction()`. Das ist missverständlich (klingt nach Update). Konsistenter wäre `createTransaction()` oder `addTransaction()`.

---

*Dieses Handbuch beschreibt den Stand von GoldenGoatCapital zum März 2026. Alle neuen Features sollten hier ergänzt und alle Verbesserungen aus Kapitel 25 nach Umsetzung als ✅ markiert werden.*
