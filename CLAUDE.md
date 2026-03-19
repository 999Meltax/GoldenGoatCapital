# GoldenGoatCapital

Personal finance web application built with Node.js + Express + SQLite.

## Tech Stack

- **Backend:** Node.js (ES Modules), Express.js
- **Frontend:** EJS templating, Vanilla JavaScript, Vanilla CSS
- **Database:** SQLite3 via Sequelize ORM
- **Auth:** Express-session, bcryptjs, TOTP support
- **Email:** Nodemailer
- **Scheduled Jobs:** node-cron

## Project Structure
```
server.js          # Express entry point (port 3000)
modules/
  database.js      # Sequelize models & DB operations (singleton via getInstance())
  mailer.js        # Email service
  reminder.js      # Cron/reminder logic
  profil.js        # User profile helpers
routes/
  users.js         # Auth, user management, all main API endpoints
  Startseite.js    # Landing page
views/             # EJS templates (.html files)
public/            # Static assets, client-side JS, styles.css
db/webengDB.db     # SQLite database
```

## Running the App
```bash
node server.js
```

Or use `Server-start.cmd` on Windows. Server runs on port 3000 (configurable via `PORT` env var).

## Key Conventions

- ES6 modules (`import`/`export`) throughout
- Async/await pattern
- Mixed German/English naming (UI is German, code is mixed)
- No build step, no TypeScript, no frontend framework
- Database access always via `database.js` singleton

## Environment

Requires a `.env` file (not in git) with secrets including session key, email credentials, etc.

## Important Patterns

- Express route ordering: specific routes ALWAYS before parameterized ones (e.g. `/fixkosten/list` before `/:id`)
- `requireLogin` middleware must be defined BEFORE any routes that use it
- API routes return JSON, page routes render HTML — never mix them up
- DB migrations via try/catch ALTER TABLE for backward compatibility
- CSS variables in `.style.property` don't work — always use CSS classes
- `transfer_to_account_id` and `transfer_pair_id` link transfer transaction pairs

## Haushalt Mode

- Own tables: `haushalt_konten_v2`, `haushalt_transaktionen`
- Green design override with `--haus-accent`
- Access via `getHaushaltForUser(userId)`
- Multiple accounts supported via `haushalt_konten_v2`

## Tariffs

- `tarif` column in `user_profiles`: `'basis'` = Free, `'pro'` = Pro
- Free: max. 3 accounts, no Haushalt, no PDF export

## Sidebar-Struktur (Zielzustand)

Die Sidebar wird in 5 Gruppen gegliedert — nicht 18 einzelne Links. Jedes Feature hat eine Heimat, nichts geht verloren, aber der Nutzer sieht auf einen Blick Struktur statt Chaos.

```
Dashboard

Finanzen
  ├── Transaktionen (Ausgabentracker)
  ├── Konten
  ├── Transfers
  └── CSV-Import

Planung
  ├── Budget & Sparziele
  ├── Fixkosten & Abos
  ├── Schulden
  └── Finanzziele

Analyse
  ├── Insights / Net-Worth
  ├── Kalender
  └── Datenexport

Verwaltung
  ├── Steuer-Modul
  ├── Versicherungen
  └── Dokumente

Haushalt             ← nur bei Pro, eigener Bereich
  ├── Übersicht
  ├── Transaktionen
  ├── Fixkosten
  ├── Konten
  └── Aufgaben (ToDo nur im Haushalt-Kontext)

─────────────────────
Einstellungen / Profil
```

**Privat-ToDo wird entfernt** — ToDo existiert nur noch im Haushalt als gemeinsame Aufgabenliste. Im Privat-Modus öffnet niemand eine Finanz-App um eine Aufgabe zu notieren.

## Dokumente-Modul (Zielzustand: Metadaten statt Datei-Manager)

Das Modul wird **stark vereinfacht**: kein Datei-Upload mehr, nur noch strukturierte Metadaten-Verwaltung.

**Was bleibt:** Name, Typ, Datum, Aussteller, Jahr, Notiz, Status (`offen` / `erledigt` / `abgelaufen`), Ablageort (Freitext oder URL — Nutzer trägt ein wo die Datei physisch liegt).

**Was entfernt wird:** `file_data` (Base64-Blob), `file_mime`, `file_ext`, der Upload-Mechanismus komplett.

**Begründung:** Base64 in SQLite skaliert nicht (DB-Größe wächst unkontrolliert, Backup-JSON muss `file_data` bereits ausschließen). 80% des Nutzens kommt aus den Metadaten ("Steuerbescheid vom 15.03., Finanzamt Aachen, Status: erledigt") — nicht aus dem Datei-Viewer. Das Modul wird zur **strukturierten Ablage-Notiz**, nicht zum Datei-Manager.

---

## Konzeptuelle Grundregeln (wichtig für alle Änderungen)

- **Sparziele = virtuelle Reservierungen**, keine echten Transaktionen. `gespart` ist nur eine Zuteilung von Geld das bereits auf einem Konto liegt. `PUT /sparziele/:id` (Edit) darf `gespart` ändern ohne Transaktion — das ist korrekt so. Nur `POST /sparziele/:id/add` (Einzahlen-Button) erzeugt optional eine Transaktion. Warnung anzeigen wenn `SUM(sparziele.gespart WHERE account_id=X) > account.currentBalance`.
- **Transaktionen = einzige Wahrheit für Geldbewegungen.** Schulden-Zahlungen, Fixkost-Buchungen, Transfers — alles läuft über `ausgabenDB`. Sparziel-Zuweisungen explizit ausgenommen (s.o.).
- **Kategorien-Matching ist aktuell Freitext** → fehleranfällig. Alle neuen Features die Kategorien verwenden müssen damit umgehen bis die Migration (Phase 1) abgeschlossen ist.

---

## Audit – Open Items

### ✅ Completed:
- Kontostand-Abgleich (Differenz-Transaktion, `accounts.balance` bleibt Startwert)
- Fixkosten/Abos/Recurring zusammengeführt (`recurring_transactions`, unified system)
- Sparziele mit Konten verbunden (virtuelle Konto-Aufteilung auf Budget-Seite)
- Haushalt mehrere Konten (`haushalt_konten_v2`, v2 entfernt UNIQUE-Constraint)
- Globale Suchfunktion (Ctrl+K, `GET /users/search?q=`)
- Datenexport (CSV, JSON, PDF via jsPDF clientseitig, Backup-JSON)
- 2FA / TOTP (QR-Code, `totp_secrets`, 30s-Fenster)
- Cashflow-Prognose (Dashboard-Widget, 6 Monate rückblickend + 3 Monate linear extrapoliert)
- Financial Insights (Dashboard-Widget: Top-Kategorien, Budget-Überschreitungen, Fixkosten-Hinweise)
- Konto-zu-Konto Umbuchungen inkl. Privat↔Haushalt (`transfer_pair_id`)
- CSV-Import Wizard (Upload → Spalten-Mapping → Vorschau → Import, Bank-Presets: DKB, ING, Sparkasse, N26)
- Regeln & Automationen (`kategorisierungs_regeln`, live 250ms + serverseitig + Apply-All)
- Net-Worth Dashboard (Donut-Chart: Cash, Investments, Schulden)
- Finanzziele mit Zeitplanung (Haus, Auto, Rente — eigene Tabelle, nicht nur Sparziele)
- Budget-Prognosen ("du wirst Budget überschreiten")
- Activity Log (`activity_log`, Pagination, Entitäts-Filter, Groupierung nach Datum)
- Undo nach Löschen (5-Sekunden-Toast, optimistisch clientseitig, `clearTimeout` bei Rückgängig)
- Steuer-Modul (7 Tabs: Jahresübersicht, Erstattungsschätzer, Werbungskosten, Kapitalerträge, Altersvorsorge, Sonderausgaben, Assistent)

---

### 🔴 Phase 1 – Datenkonsistenz (zuerst, blockiert alles andere)

- [ ] **Kategorien normalisieren:** Freitext in `ausgabenDB.category` → `category_id` (FK auf neue `categories`-Tabelle mit id, user_id, name, icon, color). Standard-Kategorien aus clientseitigem Array in DB migrieren. Budget und Regeln gegen `category_id` matchen statt Text. Migration: `SELECT DISTINCT category` → in `categories` einfügen → `UPDATE ausgabenDB SET category_id = ...` → alte `category TEXT` Spalte nach stabilem Betrieb entfernen.
- [ ] **Schulden-Zahlung löschen:** `DELETE /schulden/zahlungen/:id` muss die verknüpfte Transaktion (`schulden_zahlungen.transaction_id`) mitlöschen — aktuell bleibt sie als Datenmüll in `ausgabenDB`.
- [ ] **Activity Log für `updateTransaction`:** `PUT /updateTransaction/:id` schreibt aktuell keinen Log-Eintrag. Hinzufügen mit Vorher/Nachher-Werten: `{ vorher: {name, amount, category}, nachher: {...} }`.
- [ ] **Regeln Apply-All: Option "nur leere Felder":** Aktuell überschreibt `POST /regeln/apply-all` auch manuell gesetzte Kategorien. Option hinzufügen: "nur Transaktionen ohne Kategorie auffüllen" vs. "alle überschreiben".
- [ ] **Fixkosten Konto-Pflicht:** Beim Buchen einer Fixkost (`POST /fixkosten/unified/:id/book`) muss ein Konto angegeben werden — sonst beeinflusst die Ausgabe keinen Kontostand und ist quasi unsichtbar. UI-Hinweis oder Pflichtfeld.

---

### 🟠 Phase 2 – Technische Schulden abbauen

- [ ] **Haushalt-Modus serverseitig:** `sidebar_mode` raus aus `localStorage` → in `req.session` oder `user_settings` speichern. Aktuell können zwei Browser-Tabs unterschiedliche Modi anzeigen, was zu echten Datenfehlern führen kann.
- [ ] **Dokumente aus SQLite raus:** `dokumente.file_data` (Base64) → Filesystem (`/uploads/docs/[user_id]/[filename]`), Pfad statt Blob in DB speichern. Backup-JSON schließt `file_data` bereits aus — das zeigt dass das Problem bekannt und real ist.
- [ ] **Regeln Prioritätssystem:** Neue Spalte `priority INTEGER DEFAULT 0`, `ORDER BY priority DESC, id ASC`. UI: Drag & Drop oder einfaches Zahlenfeld. Aktuell ist Reihenfolge nur durch Löschen+Neu-Anlegen änderbar.
- [ ] **CSV-Import Duplikat-Check:** Hash aus `name + amount + date` vor Import prüfen. Nutzer-Hinweis bei Duplikaten statt blindem Doppel-Import.
- [ ] **Steuertarif dynamisieren:** Grundfreibetrag und Progressionszonen in `steuern.js` sind auf 2024 hardgecoded. Konfig-Objekt nach Jahr → bei 2025 automatisch korrekte Werte.
- [ ] **Steuer-Modul: "Aus Daten vorausfüllen"-Button:** Kapitalerträge aus `steuer_kapitalertraege`, Altersvorsorge aus `steuer_altersvorsorge`, Sonderausgaben aus `steuer_sonderausgaben` automatisch in den Erstattungsschätzer übernehmen. Aktuell muss der Nutzer alles doppelt eingeben — das zerstört das Vertrauen in das Feature.
- [ ] **Haushalt-Konto-Filter validieren:** `tracker_active_accounts` (localStorage) kann gelöschte Konto-IDs enthalten → beim Laden gegen aktuelle Konten abgleichen und ungültige IDs entfernen.
- [ ] **Transfer-Pair Validierung:** Bei `DELETE /transfer/:id` prüfen ob beide Hälften des Paares existieren; verwaiste Transaktionen erkennen und bereinigen.

---

### 🟡 Phase 3 – Features verbessern (kein Neubau, sondern aufwerten)

- [ ] **Versicherungen mit Fixkosten verknüpfen:** Aktuell komplett isoliertes CRUD. Einen "Als Fixkost erfassen"-Button hinzufügen der den Versicherungsbeitrag direkt als `recurring_transaction` anlegt. Damit hat das Modul echten Mehrwert statt nur Datenpflege zu sein.
- [ ] **Kalender prominenter machen:** Der Kalender ist das einzige Feature das Fixkosten-Fälligkeiten, Schulden-Raten und Sparziel-Zieldaten zusammenführt. Aktuell in der Sidebar versteckt. Dashboard-Widget "Diese Woche fällig" oder Kalender-Vorschau ins Dashboard integrieren.
- [ ] **Steuer-Assistent: Steuerjahr-Wechsel:** Grundfreibetrag und Tarifparameter müssen jährlich aktualisierbar sein ohne Code-Änderung.
- [ ] **Haushalt auf N Personen vorbereiten:** `anteil_user1 / anteil_user2` ist auf 2 hardgecoded. Neue Tabelle `haushalt_anteile (haushalt_transaktionen_id, user_id, anteil)` für spätere Erweiterung vorbereiten — muss nicht sofort UI-seitig angeboten werden.
- [ ] **`saveTransaction()` umbenennen zu `createTransaction()`:** Klingt nach Update, ist aber ein Insert. Verwirrend bei Code-Navigation.

---

### 🟢 Phase 4 – Neue Features (erst nach stabilem Core)

- [ ] **Bankintegration / Open Banking:** Tabelle `bank_connections` vorbereiten, PSD2-API anbinden (Nordigen = kostenlos für kleine Volumen, GoCardless, finAPI als Alternativen). Das ist der einzige Hebel der die App von "CSV-Tool" zu "echter Finanz-App" macht.
- [ ] **In-App Notifications:** Budget-Überschreitung, ungewöhnliche Ausgabe (Vergleich Vormonat), Fixkost fällig — aktuell nur E-Mail via Cron. Browser-Notification API oder In-App Notification-Center.
- [ ] **Mobile UX / PWA:** Service Worker + Manifest für App-like Nutzung auf dem Handy. Finanzapps werden primär mobil genutzt.
- [ ] **Bulk Edit / Multi-Select Transaktionen:** Mehrere Transaktionen gleichzeitig kategorisieren oder löschen.

---

### ⏸ Bewusst nicht angefasst (Begründung)

- **Kalender:** Nicht entfernen — er aggregiert Fälligkeiten aus Fixkosten, Schulden und Sparzielen an einem Ort. Aufwerten in Phase 3 (Dashboard-Widget), nicht löschen.
- **Steuer-Modul:** Nicht entfernen sondern reparieren (Phase 2: Auto-Vorausfüllung aus eigenen Daten). Erst danach beurteilen ob es als Feature trägt.
- **Versicherungen:** Nicht entfernen, sondern mit Fixkosten verknüpfen (Phase 3: "Als Fixkost erfassen"-Button). Erst dann hat es Daseinsberechtigung.
- **Mehrwährungen / Internationalisierung:** `user_settings.currency` und `language` existieren als Stubs, aktuell nur EUR/Deutsch. Kein Handlungsbedarf bis Bankintegration steht.
- **Haushalt Rechte/Rollen:** Erst relevant wenn Haushalt auf N Personen erweitert wird (Phase 3).

---

### 🗑 Zu entfernen

Diese Entscheidungen sind getroffen — Umsetzung sobald Abhängigkeiten migriert sind:

- **Privat-ToDo** (`/users/todo`, `todos`-Tabelle): wird entfernt. ToDo bleibt nur im Haushalt-Kontext (`haushalt_todos`). Im Privat-Modus kein Mehrwert.
- **Dokumente-Upload** (`file_data`, `file_mime`, `file_ext`): Upload-Mechanismus komplett entfernen. Nur Metadaten + Ablageort-Feld bleiben (s. Abschnitt "Dokumente-Modul").
- **`category TEXT`** Spalte in `ausgabenDB`: nach vollständiger Migration zu `category_id` entfernen.
- **Hardcodierte Standard-Kategorien** im Client-JS: nach DB-Migration durch API-Call auf `categories`-Tabelle ersetzen.