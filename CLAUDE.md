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
Bank integration requires `GOCARDLESS_SECRET_ID`, `GOCARDLESS_SECRET_KEY`, `BASE_URL`.

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
- Split columns `anteil_user1` / `anteil_user2` on `haushalt_transaktionen` (0–100)
- Settlement table: `haushalt_ausgleiche` (Phase 3-C)

## Tariffs

- `tarif` column in `user_profiles`: `'basis'` = Free, `'pro'` = Pro
- Free: max. 3 accounts, no Haushalt, no PDF export
- Bank integration (Phase 4) is Pro-only

## Konzeptuelle Grundregeln (wichtig für alle Änderungen)

- **Sparziele = virtuelle Reservierungen**, keine echten Transaktionen. `gespart` ist nur eine Zuteilung von Geld das bereits auf einem Konto liegt. `PUT /sparziele/:id` (Edit) darf `gespart` ändern ohne Transaktion — das ist korrekt so. Nur `POST /sparziele/:id/add` (Einzahlen-Button) erzeugt optional eine Transaktion. Warnung anzeigen wenn `SUM(sparziele.gespart WHERE account_id=X) > account.currentBalance`.
- **Transaktionen = einzige Wahrheit für Geldbewegungen.** Schulden-Zahlungen, Fixkost-Buchungen, Transfers — alles läuft über `ausgabenDB`. Sparziel-Zuweisungen explizit ausgenommen (s.o.).
- **Kategorien laufen über `category_id`** (FK auf `categories`-Tabelle). `category TEXT` in `ausgabenDB` ist deprecated — nie für neue Features verwenden.

## Sidebar-Zielstruktur

Die Struktur bleibt 5 Gruppen — das ist richtig für den Scope der App. Das Problem ist visuelle
Hierarchie: "Verwaltung" soll sekundär wirken (kleiner, zusammenklappbar), nicht gleichwertig
mit "Finanzen". "Kalender" meint immer **Zahlungskalender** (wann sind Fixkosten/Raten fällig) —
kein generischer Eventkalender.

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

Haushalt             ← nur bei Pro
  ├── Übersicht
  ├── Transaktionen
  ├── Fixkosten
  ├── Konten
  └── Aufgaben

── ── ── ── ── (visuell leichter / sekundär)
Analyse & Mehr
  ├── Insights / Net-Worth
  ├── Zahlungskalender
  ├── Steuer-Modul
  ├── Versicherungen
  ├── Dokumente
  └── Datenexport

─────────────────────
Einstellungen / Profil
```

**Designprinzip:** Finanzen + Planung + Haushalt = Hauptnavigation (prominent).
Analyse & Mehr = sekundäre Navigation (kleinere Schrift, visuell getrennt, auf Mobile eingeklappt).

Privat-ToDo existiert nicht mehr — nur noch im Haushalt-Kontext.

---

## Was NICHT priorisiert wird (bewusste Entscheidung)

- **Steuer-Modul erweitern**: Funktioniert. Nicht weiter ausbauen — hoher Wartungsaufwand,
  rechtliche Grauzone. Nur bugfixen.
- **Versicherungen / Dokumente weiterentwickeln**: Bleiben als sekundäre Features erhalten,
  werden aber nicht weiter ausgebaut. Kein Kernfeature.
- **Neue Verwaltungs-Features**: Keine weiteren Features in der Verwaltungs-Gruppe hinzufügen.
- **Bankintegration (GoCardless)**: Bewusst zurückgestellt auf ganz am Ende — erst wenn die
  gesamte Website perfekt ist.

---

## Produktstrategie & Positionierung

**Ziel:** Veröffentlichung als bezahltes SaaS-Produkt. Die App soll wirklich genutzt werden.

**Alleinstellungsmerkmal:**
> "Der einzige persönliche Finanzmanager, der deine privaten Finanzen und euren gemeinsamen
> Haushalt in einer App zusammendenkt."

Splitwise splittet Kosten. YNAB trackt Budget. Niemand kombiniert beides nahtlos mit
vollständigem Finanz-Tracking. Das ist die Lücke.

**Konkurrenz:** MoneyMoney (€30 einmalig), Finanzguru (kostenlos, Bank-Integration),
YNAB (~€100/Jahr), Splitwise (kostenlos).

**Unser Vorteil:** Haushalt-Modus + persönliches Tracking + Privacy-First (Daten bleiben lokal).

---

## Roadmap zur Veröffentlichungsreife

Abarbeitungsreihenfolge. Jede Phase muss vollständig abgeschlossen sein bevor die nächste beginnt.
Abhaken mit `[x]` wenn erledigt.

---

### Phase A — Kritische Bugs & Code-Hygiene
*Muss als erstes rein. Nichts anderes starten bevor das sauber ist.*

- [x] **A-1: Doppelte `/kalender`-Route entfernen** — `routes/users.js:1561` gelöscht
- [x] **A-2: Tippfehler `sparkont:` entfernen** — `public/finanzen.js:17`
- [x] **A-3: `ichBinAdmin`-Check korrigieren** — `haushalt-einstellungen.html openLeaveModal`:
      prüft jetzt `currentUserId === m.user_id && m.rolle === 'admin'`; Modal-Text zeigt
      je nach Rolle unterschiedliche Warnung
- [x] **A-4: Haushalt-Tracker Account-Filter** — `GET /haushalt/tracker/accounts` gibt jetzt
      echte `haushalt_konten_v2`-Konten mit `currentBalance` zurück; Account-Namen in der
      Transaktionsliste, Account-Karten und Form-Selects werden korrekt befüllt
- [x] **A-5: Todos Label-Freitext → Select** — `ttLabel` in `haushalt-todos.html` ist jetzt
      `<select>` mit Einkaufen/Haushalt/Sonstiges
- [x] **A-6: Todos-Wiederholung implementieren** — `PATCH /haushalt/todos/:id/complete` erstellt
      beim Abhaken einer wiederkehrenden Aufgabe automatisch eine neue Instanz mit berechnetem
      nächsten Fälligkeitsdatum (täglich +1d, wöchentlich +7d, monatlich +1M)

---

### Phase B — Vertrauen & Rechtliches
*Ohne das darf die App nicht veröffentlicht werden.*

- [x] **B-1: Impressum** — `views/impressum.html` + Route `/users/impressum` existiert;
      `[Vorname Nachname]`, `[Adresse]` müssen vor Veröffentlichung befüllt werden
- [x] **B-2: Datenschutzerklärung** — `views/datenschutz.html` + Route existiert;
      `[Vorname Nachname]`, `[Adresse]` müssen vor Veröffentlichung befüllt werden
- [x] **B-3: AGB für Pro-Tarif** — `views/agb.html` + Route existiert;
      `[Vorname Nachname]` muss vor Veröffentlichung befüllt werden
- [x] **B-4: Steuer-Modul Disclaimer** — Amber-Banner "Kein Ersatz für Steuerberatung"
      vor den Tabs in `views/steuern.html` eingefügt
- [x] **B-5: Finanzscore transparent machen** — Info-Icon mit Hover-Tooltip hinzugefügt
      (Formel: Sparquote 30 Pkt + Budget 25 Pkt + Notgroschen 25 Pkt + Schulden 20 Pkt)

---

### Phase C — Onboarding komplett neu
*Der erste Eindruck entscheidet ob jemand bleibt oder sofort geht.*

- [x] **C-1: Onboarding-Seite redesignt** — 5 Schritte: USP-Welcome → Konto → Transaktionen
      (CSV oder manuell wählbar) → erste Kategorisierungsregel → Aha-Moment mit Next-Steps-Grid
- [x] **C-2: Leere Zustände (Empty States)** — Ausgabentracker unterscheidet jetzt "komplett leer"
      (mit CSV-Import + Manuell-CTAs) vs. "keine Treffer bei Filtern"; Regeln und Budget haben
      jetzt einladende Empty States mit CTA-Buttons
- [x] **C-3: Landingpage aufgewertet** — Hero kommuniziert USP ("privat + haushalt in einer App"),
      neue USP-Vergleichssektion (GGC vs. Splitwise/YNAB/Cloud), Hero-Feature-Cards statt
      Stockfotos; eingeloggte User werden direkt zu `/users/overview` weitergeleitet

---

### Phase D — UX-Schwachstellen die Nutzer verlieren
*Dinge die dazu führen dass Nutzer verwirrt aufhören.*

- [x] **D-1: Sparziele-Verwirrung lösen** — `overview.js` Kontokacheln zeigen jetzt
      "Davon reserviert (Sparziele)" + "Frei verfügbar" als zwei separate Zeilen mit
      klaren Labels. `budget.html` hat Info-Banner oberhalb der Sparziele-Liste.
- [x] **D-2: Dokumentenverwaltung — Upload implementiert** — Option A: multer-basierter
      Datei-Upload, Speicherung in `uploads/user_{id}/`, max. 10 MB. Anhang-Indikator
      auf Karten, Download-Button auf Detailseite, Dateilöschung beim Dokument-Löschen.
- [x] **D-3: Zahlungskalender reduziert** — Event-Formular entfernt, Seite heißt jetzt
      "Zahlungskalender". Zeigt Fixkosten (violett), Schuldenraten (rot) und
      Sparziel-Zieldaten (grün). Outlook bleibt Pro-Feature. Ansicht: Month + List.
- [x] **D-4: Mobile UX-Audit** — CSS-Fixes in `styles.css`: min-height 44px für Buttons,
      overflow-x auto für Tabellen, Modal-Close-Button immer sichtbar (44px), Modals
      auf Mobile von unten eingeblendet (bottom-sheet Stil).
- [x] **D-5: Ladezeit-Optimierung** — `overview.js`, `budget.js`, `finanzen.js` verwenden
      bereits `Promise.all()` für parallele API-Calls.

---

### Phase E — Haushalt-Modus zum echten Differenzierungsmerkmal machen
*Das ist unser Alleinstellungsmerkmal. Es muss poliert sein.*

- [x] **E-1: Haushalt-Onboarding** — 3-stufiger Onboarding-Flow in `renderOnboardingStep()`:
      Schritt 1 USP-Welcome mit Feature-Cards, Schritt 2 Erstellen/Beitreten-Formular,
      Schritt 3 Partner-Einladungs-Screen nach Haushalt-Erstellung.
- [x] **E-2: Partner-Einladung für Nicht-Nutzer verbessern** — `haushalt-join.html`
      zeigt jetzt "Kostenloses Konto erstellen & beitreten" als primäre CTA mit
      kurzem GGC-Pitch, Login als sekundäre Option.
- [x] **E-3: Haushalt-Dashboard "Diese Woche"-Widget** — `renderWeeklyWidget()` in
      `haushalt-dashboard.html`: filtert `ausgRes` auf aktuelle Woche, zeigt pro Person
      Gesamtbetrag + Top-3-Kategorien als Tags.
- [x] **E-4: E-Mail-Benachrichtigung bei großen Ausgaben** — `benachrichtigung_schwelle`
      in `haushalt_settings`; UI-Feld in `haushalt-einstellungen.html`; Trigger in
      `POST /haushalt/ausgaben/add` sendet asynchron E-Mail an beide Mitglieder.
- [x] **E-5: Monatliche Abrechnungs-Erinnerung** — `checkHaushaltAbrechnungen()` in
      `reminder.js`: läuft am 1. des Monats, berechnet Saldo aus Vormonatstransaktionen,
      sendet E-Mail an beide Haushaltsmitglieder mit Schuldenstand und CTA.

---

### Phase F — Preismodell & Monetarisierung
*Erst wenn A–E abgeschlossen sind.*

- [x] **F-1: Preise festlegen** — 4,99 €/Monat oder 39,99 €/Jahr (3,33 €/Mo, –33%)
      auf der Tarif-Seite mit Monatlich/Jährlich-Toggle angezeigt.
- [x] **F-2: Tarif-Seite ausbauen** — `/users/tarife` hat Feature-Vergleichstabelle,
      Preisanzeige mit Toggle, Trial-Banner, Stripe-CTA oder Fallback-Button.
- [x] **F-3: Zahlungsintegration** — Stripe integriert: Checkout-Session (`GET /stripe/checkout?billing=monthly|yearly`),
      Webhook (`POST /stripe/webhook`) setzt Pro automatisch, Customer Portal (`GET /stripe/portal`)
      für Abo-Verwaltung. Keys in `.env` als Kommentare vorbereitet.
- [x] **F-4: Trial-Periode** — 14 Tage Pro für neue Nutzer: `trial_until` in `user_profiles`,
      `setTrial()` bei Registrierung, `getUserPlan()` prüft trial_until, Trial-Banner mit
      Countdown auf Tarif-Seite, kein Kreditkarte-Zwang.

---

## Aktueller Stand

**Phase A:** 6/6 erledigt ✅
**Phase B:** 5/5 erledigt ✅
**Phase C:** 3/3 erledigt ✅
**Phase D:** 5/5 erledigt ✅
**Phase E:** 5/5 erledigt ✅
**Phase F:** 4/4 erledigt ✅

---

### Phase H — Qualitätssicherung & Nutzungstauglichkeit
*Analyse der App als externer Tester. Alles was einen echten Nutzer aufhalten oder verwirren würde.*

---

#### H-KRITISCH — Broken Features (Vertrauen-zerstörend, sofort fixen)

- [x] **H-1: Account löschen implementiert** — `profil.html:347` ruft `deleteAccount()` auf, die
      Funktion ist aber ein leerer Stub: `showToast('Funktion noch nicht implementiert', 'error')`.
      Wenn jemand sein Konto löschen will, bekommt er eine Fehler-Toast. Das ist ein No-Go für
      eine echte App (auch rechtlich: Nutzer müssen ihr Konto löschen können).
      **Umsetzung:** Backend-Route `DELETE /users/account` → alle Daten des Users löschen,
      Session zerstören, Weiterleitung zur Startseite.

- [x] **H-2: Light Mode funktioniert nicht obwohl anklickbar** — `Einstellungen.html:77` zeigt
      den Light-Mode-Button mit dem Badge „Bald verfügbar" — aber der Button hat trotzdem ein
      aktives `onclick="selectTheme('light')"`. Nutzer klickt, passiert nichts sichtbares oder
      unerwartetes. **Umsetzung:** Entweder Light Mode wirklich implementieren (CSS-Variablen
      für `[data-theme="light"]` definieren), oder den Button deaktivieren/ausgegraut darstellen
      und `onclick` entfernen bis er fertig ist.

---

#### H-NAVIGATION — Sidebar entspricht nicht der geplanten Struktur

- [x] **H-3: "Transfers" fehlt in der Sidebar** — Laut CLAUDE.md-Zielstruktur gehört
      „Transfers" unter Finanzen zwischen Konten und CSV-Import. Aktuell gibt es zwar
      Transfer-Transaktionen (Typ „Transfer" in Ausgabentracker), aber keinen dedizierten
      Einstiegspunkt. Nutzer finden Transfers nicht.
      **Umsetzung:** Sidebar-Link „Transfers" unter Finanzen → entweder als gefilterte
      Ausgabentracker-Ansicht (`/users/ausgabentracker?typ=transfer`) oder eigene leichte
      Seite zum schnellen Transfer erstellen.

- [x] **H-4: Datenexport erscheint doppelt in der Sidebar** — `navheader.html:100` im
      „Mehr"-Dropdown und `navheader.html:180` im Footer. Zwei Einträge für dieselbe Seite
      machen die Navigation unaufgeräumt und wirken unfertig.
      **Umsetzung:** Footer-Link (`navheader.html:180-183`) entfernen. Nur der „Mehr"-Eintrag
      bleibt.

- [x] **H-5: „Finanzziele" fehlt als Menüpunkt** — Laut CLAUDE.md-Zielstruktur steht unter
      Planung: Budget & Sparziele | Fixkosten | Schulden | **Finanzziele**. Aktuell gibt es
      nur „Regeln & Automationen" an dieser Position, aber kein „Finanzziele". Sparziele sind
      unter Budget & Sparziele gut versteckt. Unklar ob „Finanzziele" = Sparziele oder
      eigenständige Seite.
      **Klärung nötig:** Ist „Finanzziele" == Sparziele (dann nur Sidebar-Label ändern)?
      Oder ist es eine eigene Langzeit-Finanzplanung (Rentenziel, Haus kaufen etc.)?
      Aktuell als Blockerpunkt dokumentiert bis der User entscheidet.

- [x] **H-6: „Regeln & Automationen" in der falschen Gruppe** — Steht in Planung, passt
      aber konzeptuell zu Finanzen (automatische Kategorisierung von Transaktionen). Nutzer
      die Regeln suchen schauen instinktiv unter „Finanzen", nicht unter „Planung".
      **Umsetzung:** Link von Planung nach Finanzen verschieben (nach CSV-Import).

- [x] **H-7: Zinseszinsrechner in „Mehr" ohne Kontext** — `navheader.html:104` Link zu
      `/users/zinseszinsrechner`. Dieser Taschenrechner ist ein Solitär in der „Mehr"-Sektion
      ohne Bezug zu den anderen Analyse-Tools. Passt nicht zur kommunizierten App-Identität.
      **Umsetzung:** Prüfen ob der Rechner wirklich genutzt wird. Wenn ja, unter „Planung"
      oder als Teil von „Finanzziele" positionieren. Wenn nicht, aus der Sidebar entfernen
      (Seite kann bestehen bleiben, nur Sidebar-Link weg).

---

#### H-EINSTELLUNGEN — Tote UI-Elemente die falschen Eindruck erwecken

- [x] **H-8: Währungsauswahl implementiert** — EUR + USD, via localStorage + window.GGC_CURRENCY global, alle Formatter dynamisch — `Einstellungen.html:90–98` zeigt ein Dropdown
      mit 5 Währungen (€, $, £, CHF, ¥). Die Auswahl wird zwar gespeichert
      (`user_settings.currency`), aber die gesamte App benutzt hartkodierte EUR-Formatter
      (`fmtEur`, `€`-Symbole) — die Einstellung hat keinerlei Auswirkung.
      **Umsetzung Option A:** Währungsauswahl entfernen bis sie wirklich implementiert ist.
      **Umsetzung Option B:** Alle Betragsformatierungen auf den gespeicherten Währungswert
      umstellen (aufwändig, aber dann wirklich nützlich).

- [x] **H-9: Sprachauswahl zeigt 7 Sprachen, nur Deutsch existiert** — `Einstellungen.html:131–138`
      zeigt Deutsch, Englisch, Französisch, Spanisch, Italienisch, Polnisch, Türkisch im
      Dropdown. Es gibt bereits einen Info-Banner „vollständige Mehrsprachigkeit folgt",
      aber 7 auswählbare Sprachen + 1 Info-Banner ist widersprüchlich.
      **Umsetzung:** Dropdown auf nur Deutsch reduzieren, alle anderen Optionen raus.
      Info-Banner stattdessen: „Weitere Sprachen folgen in einer zukünftigen Version."

- [x] **H-10: Browser-Benachrichtigungen Toggle ohne Backend** — `Einstellungen.html:172–181`
      zeigt einen Toggle für Browser-Push-Notifications. Es gibt zwar `public/sw.js` (Service
      Worker), aber kein Push-Subscription-Flow, kein `PushManager`, keine Backend-Route
      zum Senden von Push-Nachrichten.
      **Umsetzung:** Toggle entweder mit echtem Push-Flow implementieren oder entfernen
      und nur E-Mail-Benachrichtigungen als Kanal anbieten.

---

#### H-UX — Verwirrende oder irreführende Nutzererfahrung

- [x] **H-11: Haushalt-Toggle in Sidebar für Free-Nutzer** — Oben in der Sidebar gibt es
      einen Privat/Haushalt-Toggle. Free-Nutzer klicken auf „Haushalt" → werden zur
      Tarif-Seite weitergeleitet → aber der Toggle bleibt optisch auf „Haushalt" → visuell
      falsch. Außerdem: Der Toggle selbst ist für Nutzer ohne Haushalt verwirrend (wohin
      führt „Haushalt"? Muss ich erst etwas einrichten?).
      **Umsetzung:** Toggle nur anzeigen wenn User Pro-Tarif hat und Haushalt bereits
      existiert. Free-Nutzer sehen keinen Toggle, sondern ggf. einen „Haushalt freischalten"-
      Banner ganz unten in der Sidebar.

- [x] **H-12: Benachrichtigungs-Glocke in der Topbar zeigt immer leer** — Die Glocke
      (`navheader.html:268–282`) ist immer sichtbar und erscheint professionell. Aber sie
      zeigt dauerhaft „Keine neuen Benachrichtigungen". Nutzer klicken drauf, sehen nichts,
      fragen sich ob etwas nicht stimmt. Ohne echte Inhalte wirkt das Panel wie ein
      unfertiges Feature.
      **Umsetzung:** Prüfen was die Glocke befüllen soll (Budget-Überschreitungen?
      Fällige Zahlungen?). Wenn keine echten Notifications implementiert sind → Glocke
      aus der Topbar entfernen bis sie befüllt wird.

- [x] **H-13: Globale Suche (Strg+K) — Erwartungen vs. Realität prüfen** — Die Suchleiste
      in der Topbar mit `Strg+K`-Shortcut ist prominent platziert. Das erweckt die
      Erwartung einer leistungsfähigen Suche. Was sie tatsächlich durchsucht (Transaktionen?
      Dokumente? Alles?) und ob die Ergebnisse vollständig sind muss geprüft werden.
      **Umsetzung:** Testen was gesucht wird. Falls unvollständig: Scope der Suche im
      Placeholder-Text klar kommunizieren oder ausbauen.

- [x] **H-14: Haushalt-Sektion in Privat-Sidebar sichtbar für Nicht-Haushalt-Nutzer** —
      Im `privatNav` gibt es keinen Hinweis auf Haushalt. Aber beim Wechsel zu `haushaltNav`
      zeigt die Sidebar Links wie `/users/haushalt/import` — eine Route die existiert aber
      nur sinnvoll ist wenn ein Haushalt existiert. Kein Guard, kein Onboarding-Hinweis.
      **Umsetzung:** Wenn kein Haushalt vorhanden, zeigt haushaltNav nur den Onboarding-
      Flow, keine echten Feature-Links.

---

#### H-QUALITÄT — Kleinere Bugs und Inkonsistenzen

- [x] **H-15: „Meine Finanzen" vs. „Konten" — Verwirrende Benennung** —
      Datei heißt `meine-finanzen.html`, Route ist `/users/meine-finanzen`, aber in der
      Sidebar steht „Konten". In der mobilen Bottom-Nav steht auch „Konten". Die Seite
      zeigt tatsächlich Konten — aber der interne Name ist uneinheitlich.
      **Umsetzung:** Route + View umbenennen zu `/users/konten` bzw. `konten.html`
      für Konsistenz, oder zumindest sicherstellen dass überall „Konten" steht.

- [x] **H-16: „Abrechnung" in Haushalt-Sidebar führt zu `/users/haushalt/ausgaben?tab=abrechnung`**
      — `navheader.html:135`. Ob dieser Tab auf der Ausgaben-Seite wirklich existiert und
      funktioniert muss geprüft werden. Wenn der Tab nicht existiert landet der Nutzer
      auf der normalen Ausgaben-Ansicht ohne Feedback.
      **Umsetzung:** Prüfen ob `?tab=abrechnung` korrekt verarbeitet wird. Falls nicht:
      Sidebar-Link anpassen oder Tab implementieren.

- [x] **H-17: Profil-Seite und Einstellungen-Seite — Redundanz** — Es gibt sowohl
      `/users/profil` als auch `/users/einstellungen` als separate Seiten mit eigenem
      Sidebar-Eintrag. Auf Profil: Avatar, Name, E-Mail, Tarif, 2FA, Passwort, Konto löschen.
      Auf Einstellungen: Darstellung, Sprache, Benachrichtigungen, Sicherheit, Datenschutz.
      „Sicherheit" erscheint auf beiden Seiten (2FA auf Profil, Sicherheits-Abschnitt auf
      Einstellungen). Das ist verwirrend — zwei Seiten für dasselbe Thema.
      **Umsetzung (langfristig):** Beides zu einer einzigen Seite zusammenführen mit
      klarer Tab-Struktur: Profil | Darstellung | Benachrichtigungen | Sicherheit | Datenschutz.

---

**Aktueller Stand Phase H:** 17/17 erledigt ✅

---

### Phase I — Produktreife & Vertrauen
*Basierend auf externem Audit. Ziel: App wirkt fertig, professionell und vertrauenswürdig.*

---

#### I-KRITISCH — Vertrauen wird sofort zerstört

- [x] **I-1: Passwort-Validierung ernst nehmen** — Registrierung und Passwort-Änderung
      akzeptieren aktuell jedes Passwort ab 1 Zeichen. Das ist eine sofortige Red Flag für
      jeden sicherheitsbewussten Nutzer.
      **Umsetzung:** Mindestanforderung: 8 Zeichen, 1 Großbuchstabe, 1 Zahl oder Sonderzeichen.
      Validierung im Frontend (Live-Feedback mit Checkmarks) und im Backend (Fehler zurückgeben
      wenn Anforderung nicht erfüllt). Betrifft: Registrierung + Passwort-Änderung in Profil.

- [x] **I-2: Konten archivieren statt löschen** — Wenn ein Konto gelöscht wird, verlieren
      alle verknüpften Transaktionen ihre `account_id`-Zuordnung. Das ist ein stiller
      Datenintegritätsbug. Nutzer die ein altes Konto „aufräumen" wollen verlieren Historien-Daten.
      **Umsetzung:** `accounts`-Tabelle um Spalte `archived BOOLEAN DEFAULT 0` ergänzen.
      In der Konten-Übersicht: „Archivieren"-Button statt Löschen (Löschen nur wenn keine
      Transaktionen vorhanden). Archivierte Konten ausblendbar aber weiterhin in Transaktionen
      referenzierbar. Löschen nur nach expliziter Bestätigung mit Warnung.

---

#### I-DASHBOARD — Fokus fehlt

- [x] **I-3: Dashboard entschlacken** — Das Dashboard zeigt aktuell gleichwertig:
      Kontokacheln, Finanzscore, Sparziele-Widget, Fixkosten-Widget, Schulden-Widget,
      Transaktions-Feed. Kein visuelles Gewicht, kein klarer Fokus — Nutzer wissen nicht
      wohin sie schauen sollen.
      **Umsetzung:** Primäre Zone (oben): Kontostand + Ausgaben diese Woche + Haushalt-Balance
      (wenn vorhanden). Sekundäre Zone: Sparziele + Fixkosten als kompakte Kacheln.
      Finanzscore nach unten verschieben (nicht auf den ersten Blick). Schulden-Widget
      nur anzeigen wenn Schulden > 0.

- [x] **I-4: Finanzscore handlungsorientiert machen** — Der Score zeigt eine Zahl (0–100)
      und eine Formel. Aber: „Was tue ich jetzt damit?" bleibt unbeantwortet. Nutzer
      schauen einmal drauf und ignorieren ihn danach.
      **Umsetzung:** Unter dem Score: 1–3 konkrete Handlungsempfehlungen basierend auf den
      schwächsten Teilscores. Beispiel: Score Notgroschen < 50% → „Dein Notgroschen deckt
      nur X Monate. Ziel: 3 Monate Ausgaben reservieren." Mit direktem Link zur relevanten
      Seite (Sparziele / Budget / Schulden).

---

#### I-POSITIONIERUNG — Haushalt als Hauptfeature zeigen

- [x] **I-5: Landingpage auf Haushalt-USP fokussieren** — Die Landingpage kommuniziert
      aktuell „privat + Haushalt in einer App" — aber Haushalt ist gleichwertig mit allen
      anderen Features. Der echte Differenzierungspunkt (Splitwise + YNAB in einer App)
      kommt nicht sofort durch.
      **Umsetzung:** Hero-Headline auf Haushalt-USP ausrichten: „Deine Finanzen. Euer
      Haushalt. Eine App." Feature-Cards: statt allgemeiner Finanzfeatures → konkrete
      Haushalt-Szenarien zeigen (wer hat was ausgegeben, automatische Abrechnung,
      gemeinsame Sparziele). Splitwise/YNAB-Vergleich noch prominenter.

- [x] **I-6: Haushalt-Promo für Nutzer ohne Haushalt** — Nutzer die die App nutzen
      ohne Haushalt sehen nie aktiv eine Einladung den Haushalt-Modus zu erkunden.
      Der Privat/Haushalt-Toggle ist für Free-Nutzer nach H-11 ausgeblendet — damit
      ist der Haushalt-Modus komplett unsichtbar.
      **Umsetzung:** Im privaten Dashboard (Overview): eine Promo-Kachel/Banner
      „Lebt ihr zusammen?" mit kurzem Pitch + CTA zu `/users/haushalt` oder Tarif-Seite.
      Nur anzeigen wenn kein Haushalt existiert. Wegklickbar (localStorage-Flag).

---

#### I-UX — Komplexität reduzieren

- [x] **I-7: Regeln & Automationen für Einsteiger vereinfachen** — Die Regelseite ist
      mächtig aber einschüchternd: Felder wie „Bedingungstyp", „Operator", „Zielfeld" wirken
      technisch. 80% der Nutzer wollen nur: „Wenn Titel enthält X → Kategorie Y".
      **Umsetzung:** Oben auf der Regelseite einen „Einfach-Modus" anbieten:
      Ein-Zeilen-Formular „Wenn Bezeichnung enthält [___] → Kategorie [___] [Speichern]".
      Erweiterte Optionen hinter einem „Erweitert"-Toggle verstecken.

- [x] **I-8: Profil + Einstellungen zu einer Seite zusammenführen** — Zwei separate
      Seiten (`/users/profil` und `/users/einstellungen`) mit überlappenden Themen
      (Sicherheit erscheint auf beiden) verwirren Nutzer.
      **Umsetzung:** Eine einzige Seite `/users/konto` mit Tab-Navigation:
      Profil | Darstellung | Benachrichtigungen | Sicherheit | Datenschutz.
      Redirect von `/profil` und `/einstellungen` auf `/konto`. Sidebar zeigt nur einen
      Eintrag „Konto & Einstellungen".

---

**Aktueller Stand Phase I:** 8/8 erledigt ✅

---

### Phase J — Qualitätssicherung Runde 2 (Page-by-Page Review)
*Vollständiger Durchgang aller Seiten und Features — gefundene Restfehler und Inkonsistenzen.*

---

#### J-KRITISCH — Residual-Bugs aus vorherigen Phasen

- [x] **J-1: `konten.html` zeigt noch „Meine Finanzen"** — H-15 hat die Route korrekt auf
      `/users/konten` + `konten.html` umgestellt, aber den Seiteninhalt nicht angepasst.
      `konten.html:7` hat `<title>Meine Finanzen – Golden Goat Capital</title>` und
      `konten.html:17` hat `<h1>Meine Finanzen</h1>`. Nutzer, die über die Sidebar-Link
      „Konten" navigieren, landen auf einer Seite die „Meine Finanzen" sagt — Verwirrung.
      **Umsetzung:** `konten.html` `<title>` auf „Konten – Golden Goat Capital" und `<h1>`
      auf „Konten" mit Sub-Text „Alle deine Konten und Auswertungen auf einen Blick" ändern.

- [x] **J-2: `konto-detail.html` nutzt hartkodiertes EUR** — Die Inline-Skripte auf
      `konto-detail.html:33–34` deklarieren `const fmt = new Intl.NumberFormat('de-DE',
      { style: 'currency', currency: 'EUR' })` statt `window.GGC_CURRENCY`. Damit greift
      die H-8-Währungseinstellung auf der Konto-Detailseite nicht.
      **Umsetzung:** Beide Formatter auf `window.GGC_LOCALE||'de-DE'` /
      `window.GGC_CURRENCY||'EUR'` umstellen.

---

#### J-POLISH — Währungs-Konsistenz vervollständigen

- [x] **J-3: Chart-Tooltips hartkodieren EUR** — `ausgabentracker.js:1623` und
      `haushalt-tracker.js:1260` haben im Chart.js-Tooltip-Formatter `currency:'EUR'`
      statt `window.GGC_CURRENCY||'EUR'`. Beim Hovern über Balken/Linien zeigt die
      Tooltip-Zahl immer €, auch wenn der Nutzer USD eingestellt hat.
      **Umsetzung:** Beide Stellen auf dynamische Währung umstellen.

- [x] **J-4: Totes View-File `meine-finanzen.html` entfernen** — Die Route
      `/users/meine-finanzen` leitet seit H-15 per 301 auf `/users/konten` weiter; der
      echte Content ist in `konten.html`. Trotzdem existiert `views/meine-finanzen.html`
      noch als totes File mit dem alten Inhalt. Das ist verwirrend beim Coden.
      **Umsetzung:** `views/meine-finanzen.html` löschen. Route `/meine-finanzen → 301`
      bleibt für externe Links.

- [x] **J-5: Formular-Labels „Betrag (€)" hartkodiert** — In `haushalt-tracker.html`
      (Schnelleintrag-Form, Zeile ~75) und an weiteren Stellen steht `Betrag (€)` als
      Label-Text hartkodiert. Bei USD-Einstellung sieht der Nutzer weiterhin „€".
      **Umsetzung:** Labels auf „Betrag" (ohne Symbol) kürzen oder per JS mit dem
      Currency-Symbol aus `window.GGC_CURRENCY` befüllen.

---

#### J-NAVIGATION — Klarheit der Labels

- [x] **J-6: Sidebar-Label „Insights & Aktivität" passt nicht zur Seite** — Die Seite
      `/users/activity` heißt intern „Aktivitätsprotokoll" und zeigt ein reines Audit-Log
      (wer hat wann was geändert). Das Label „Insights & Aktivität" weckt die Erwartung
      von Analyse-Charts und KPIs. Nutzer finden keine Insights und sind enttäuscht.
      **Umsetzung Option A (schnell):** Label in `navheader.html` auf
      „Aktivitätsprotokoll" umbenennen — setzt ehrlichere Erwartungen.
      **Umsetzung Option B (besser):** Eigene Insights-Seite mit Monats-/Jahresvergleich,
      Top-Kategorien-Chart, Nettoentwicklung aufbauen und unter diesem Label positionieren;
      Aktivitätsprotokoll als separate Unterseite oder im Profil verlinken.

---

#### J-RESPONSIVE — Mobile-Verbesserungen

- [x] **J-7: Schulden-Tabs wrappen auf Mobile** — `.schulden-tabs` in `schulden.html:304`
      nutzt `flex-wrap: wrap`. Bei 6 Tabs (Alle / Kredit / Kreditkarte / Privatdarlehen /
      Ratenkauf / Studienkredit) entstehen auf schmalen Screens zwei Zeilen, was unordentlich
      aussieht. Alle anderen Tab-Bars in der App (haushalt-ausgaben, steuern, etc.) nutzen
      `overflow-x: auto` mit `white-space: nowrap`.
      **Umsetzung:** `.schulden-tabs` auf `flex-wrap: nowrap; overflow-x: auto;` umstellen
      + `::-webkit-scrollbar { display: none; }` für sauberes Scrolling, identisch mit
      `.aus-tab-strip`-Muster.

---

**Aktueller Stand Phase J:** 7/7 erledigt ✅

---

## Zukünftige Aufgaben (NICHT umsetzen bis explizit angefordert)

> **WICHTIG:** Die folgenden Punkte sind bewusst zurückgestellt. Claude soll diese
> **niemals eigenständig anstoßen oder umsetzen**, auch nicht im Rahmen anderer
> Aufgaben. Nur wenn der User explizit "setz X um" oder "arbeite an X" sagt, darf
> daran gearbeitet werden.

### Stripe Live-Konfiguration
- Stripe-Account anlegen und Live-Keys (`sk_live_...`) in `.env` eintragen
- Zwei Produkte im Stripe Dashboard anlegen: "GGC Pro Monatlich" (4,99 €) und "GGC Pro Jährlich" (39,99 €)
- Preis-IDs (`price_...`) als `STRIPE_PRICE_MONTHLY` und `STRIPE_PRICE_YEARLY` in `.env` eintragen
- Webhook-Endpoint in Stripe registrieren: `POST /users/stripe/webhook`
- `STRIPE_WEBHOOK_SECRET` (`whsec_...`) in `.env` eintragen
- Customer Portal in Stripe aktivieren (Dashboard → Billing → Customer Portal)

### Bankintegration (GoCardless / Nordigen)
- PSD2-konforme Bankanbindung, ~500 deutsche Banken
- Kostenlos für kleines Volumen
- Nur für Pro-Nutzer
- Details erst ausarbeiten wenn die App live ist und gut läuft
