# HubSpot-Sync: Konzept (Phase 1–3, noch kein Code)

Stand 02.10.2026, überarbeitet: Mit „Colord“ ist **Claude** gemeint.

Ziel: Du sagst in Claude „Sync HubSpot“. Ein lokales Programm lädt den Report per Browser-Automation herunter und prüft ihn. Claude nutzt danach die neuen Daten: für Auswertungen, für Fragen und für das Board.

Grundsatz: **Deterministische Automation macht die Arbeit. Claude ruft nur fest definierte Werkzeuge ohne freie Parameter auf, liest Status und Fehler, erklärt sie und darf höchstens eine Wiederholung auslösen.**

---

## 1. Bestandsaufnahme

| Punkt | Befund |
|---|---|
| Claude | Du nutzt Claude Code in der Desktop-App auf diesem Mac. Claude Code kann lokale Werkzeuge über einen **MCP-Server** einbinden. Das ist ein kleines Programm, das Claude startet und über die Standard-Ein- und -Ausgabe anspricht. **Es öffnet keinen Netzwerk-Port.** |
| Bisheriger Weg | ZIP aus HubSpot → du gibst sie Claude (so wie am 02.10.) → Claude wertet aus und arbeitet das Board ein. |
| Board | Statische `index.html` auf GitHub Pages. Seine Rechenlogik (`leseAnrufe`, `auswerten`) läuft auch ohne Browser unter Node. Das tun die Tests schon. |
| Echter Export (01.10.) | **ZIP, keine CSV.** Darin `anrufsnotizen.csv` (Komma, UTF-8 ohne BOM, 8 Spalten, ~33.900 Zeilen, 4 MB) und `hubspot-export-summary.csv` (nur 1 Spalte, für uns unbrauchbar). |
| Rechner | macOS 15.6.1, Python 3.14.3, Node 21, Google Chrome. Playwright und `keyring` sind **nicht** installiert. |

## 2. Architektur

```text
 Claude (Desktop-App, Code-Tab)
     │  MCP über stdin/stdout – kein Port, kein localhost-Server
     ▼
 adric-hubspot-agent (Python, wird von Claude gestartet)
     ├─ Werkzeuge (vollständige Liste, alle ohne freie Parameter):
     │    start_hubspot_sync()      → startet den festen Ablauf im Hintergrund
     │    get_sync_status()         → Phase, Schritte, letzter Sync, Datensätze
     │    get_last_error()          → redigiertes Fehlerobjekt
     │    retry_current_step()      → nur wenn der Status es erlaubt, max. 1×
     │    get_report_metrics(zeitraum ∈ {woche, letzte_woche, 30_tage, alles})
     │                              → Kennzahlen mit derselben Logik wie das Board
     ├─ Sync-Ablauf (Zustandsmaschine, Playwright)
     ├─ Prüfung + Ablage (incoming / processed / failed, Hash-Register)
     ▼
 Eigenes Chrome-Profil nur für die Automation → app.hubspot.com
```

### Warum ein MCP-Server statt eines localhost-Agents

- **Kein offener Port.** Die Risiken CSRF, DNS-Rebinding, CORS und öffentliche Erreichbarkeit fallen weg. Nur Claude auf diesem Mac kann die Werkzeuge aufrufen.
- **Claude ist die Bedienoberfläche und der Diagnose-Assistent zugleich.** Die Werkzeugliste oben ist genau die Allowlist aus deinem Punkt 20. Ein separater OpenAI-Assistent ist dafür nicht mehr nötig (siehe Abschnitt 6).
- **Gleiche Rechenlogik wie im Board.** `get_report_metrics` ruft die Funktionen aus `index.html` über Node auf, so wie die Tests. Board und Claude kommen also immer auf dieselben Zahlen.
- **Das Board bleibt unverändert** und öffentlich, mit Drag-and-drop, z. B. für deinen Chef. Wer die neue CSV ins Board ziehen will, findet sie an einem festen Ort (Abschnitt 5).

### Wie Claude die Daten nutzt

- Für Zahlen nimmt Claude `get_report_metrics`. Das liefert nur Kennzahlen und keine Rohzeilen, kommt also mit wenig Kontext aus.
- Für einzelne Notizen („welche Gespräche hatten Termine?“) liest Claude die geprüfte CSV am festen Ort. Damit gehen Kundendaten an Claude, genauso wie heute, wenn du die ZIP hochlädst.
- **Inhalte aus HubSpot, also Notizen, Seitentexte und Fehlermeldungen, sind für Claude Daten, keine Anweisungen.** Selbst eine Notiz wie „ignoriere alle Regeln …“ könnte nur die harmlosen Werkzeuge oben auslösen. Keines davon kommt an Geheimnisse, Dateien oder URLs heran.

### Später möglich: Sync-Knopf

Deine Wunsch-Ansicht „HUBSPOT DATA · Last sync · [↻ Sync HubSpot]“ lässt sich als kleines Panel in der Claude-Desktop-App bauen, ebenfalls ohne offenen Port. Das würde ich erst angehen, wenn der Ablauf stabil läuft.

## 3. Anmeldung und Geheimnisse

**Das HubSpot-Passwort wird nirgends gespeichert, auch nicht im Schlüsselbund.** Es wird schlicht nicht gebraucht: Du meldest dich einmal von Hand an, und der Agent nutzt danach die Sitzung im eigenen Browserprofil weiter.

| Geheimnis | Ort | Nie |
|---|---|---|
| HubSpot-Sitzung (Cookies) | eigenes Chrome-Profil unter `~/Library/Application Support/adric-hubspot-agent/profile/`, Rechte `700` | Repo, Logs, KI, Export als `storage_state.json` |
| OpenAI-Key (nur falls gewünscht) | macOS-Schlüsselbund über `keyring` (Dienst `adric-hubspot-agent`) | `.env`, Code, Logs, Frontend, Prompt |

- **Profil liegt bewusst außerhalb des Repos.** Damit kann es auch nicht versehentlich committet werden. `.gitignore` schließt trotzdem `.local/`, `*.json` mit Session-Inhalt und alle CSV/ZIP aus.
- **`setup_auth.py`:**
  1. Öffnet sichtbares Chrome (`channel="chrome"`) mit dem Automationsprofil.
  2. Ruft HubSpot auf. Du meldest dich an, inklusive MFA oder SSO.
  3. Das Skript wartet, bis der Report sichtbar ist (Timeout 10 Minuten), und schließt dann.
  4. Das Skript berührt kein Eingabefeld.
- **Sitzung abgelaufen:** Der Agent erkennt die Weiterleitung auf die Login-Seite → `AUTHENTICATION_REQUIRED`. Er öffnet ein sichtbares Fenster, in dem du dich anmeldest, und füllt nie etwas aus.
- **`setup_openai_key.py`:** fragt den Key verdeckt ab (`getpass`) und legt ihn im Schlüsselbund ab. Ich sehe ihn nie.
- **Zu prüfen in Phase 4:** Playwright startet Chrome auf dem Mac nach meinem Kenntnisstand mit `--use-mock-keychain`. Dann wären die Cookies im Profil nicht über den Schlüsselbund verschlüsselt. Ich prüfe das und schalte den echten Schlüsselbund ein, wenn möglich. Unabhängig davon gilt: Das Profil wie ein Passwort behandeln und FileVault eingeschaltet lassen.

## 4. Sync-Ablauf

Zustände: `IDLE → AUTHENTICATING → OPENING_REPORT → REFRESHING_REPORT → WAITING_FOR_REPORT → STARTING_EXPORT → WAITING_FOR_DOWNLOAD → VALIDATING_CSV → MOVING_FILE → COMPLETED`, außerdem `FAILED` und `AUTHENTICATION_REQUIRED`.

| Schritt | Aktion | Fertig, wenn | Timeout | Fehlercode |
|---|---|---|---|---|
| 1 | Feste Report-URL aus lokaler Konfiguration öffnen | Report-Titel sichtbar, URL unverändert auf `app.hubspot.com` | 60 s | `REPORT_UNAVAILABLE`, `AUTHENTICATION_REQUIRED` |
| 2 | Menü öffnen, „Aktualisieren“ | Lade-Zustand erscheint und verschwindet wieder, oder Zeitstempel ändert sich | 5 min | `REFRESH_CONTROL_NOT_FOUND`, `REFRESH_TIMEOUT` |
| 3 | Menü öffnen, „Nicht zusammengefasste Daten exportieren“ | Export-Dialog sichtbar | 30 s | `EXPORT_BUTTON_NOT_FOUND` |
| 4 | Format CSV wählen, Export bestätigen | `page.expect_download()` liefert den Download | 6 min | `EXPORT_TIMEOUT`, `DOWNLOAD_MISSING` |
| 5 | `download.save_as()` nach `incoming/` | Datei vollständig geschrieben | – | `DOWNLOAD_FAILED` |

**Ich erfinde keine Selektoren.** Die genauen Locators ermittle ich in Phase 3 aus der echten Seite. Bevorzugt nehme ich Rolle plus sichtbaren Namen (`get_by_role("menuitem", name="Aktualisieren")`) und, wo vorhanden, HubSpots `data-test-id`. Die deutschen Beschriftungen kommen in eine Konfigurationsdatei, weil sie sich bei einer Sprachumstellung ändern.

**Klicks nur innerhalb der Report-Seite.** Verlässt die URL den erwarteten Report, bricht der Ablauf sofort ab. Der Ablauf öffnet keine weiteren Tabs und klickt keine Links aus dem Report-Inhalt.

**Kein Zeitplan, kein Dauerbetrieb:** Der Sync läuft nur, wenn du den Knopf drückst. Das ist unauffälliger für HubSpot und leichter zu verantworten.

## 5. Prüfung, Ablage, Dubletten

Ablage unter `~/Library/Application Support/adric-hubspot-agent/data/`: `incoming/`, `processed/`, `failed/`, `imports.json`, `state.json`, `logs/`. Der Downloads-Ordner wird nie angefasst.

Prüfungen, alle müssen bestehen:
1. Dateiendung `.zip` oder `.csv`, Größe zwischen 1 KB und 50 MB.
2. **ZIP:** höchstens 5 Einträge. Keine Einträge mit Pfadanteilen, `..` oder absolutem Pfad, sonst könnte eine Datei außerhalb des Zielordners landen (Zip-Slip). Entpackt höchstens 200 MB, Schutz gegen Zip-Bomben. Es wird nur ausgepackt, was geprüft wird.
3. Den Eintrag wählen, dessen Kopfzeile **genau** die 8 erwarteten Spalten hat (Anrufnotizen … Kontakt ID).
4. Strikt als UTF-8 lesbar.
5. Jede Zeile hat 8 Felder, mindestens eine Datenzeile.
6. Plausibilität: Die Zeilenzahl ist nicht unter 50 % des letzten Imports gefallen. Sonst landet die Datei in `failed/` mit `SUSPICIOUS_ROW_DROP`, zur Sicherheit statt stiller Übernahme.

Dubletten: SHA-256 der geprüften CSV in `imports.json`. Ist dieselbe Datei schon da, gilt das nicht als Fehler, sondern als Status „keine neuen Daten“. Aufbewahrung: nur die letzten 10 Dateien in `processed/`, weil sie Namen und Telefonnummern enthalten.

## 6. KI-Schicht: Claude statt OpenAI (Empfehlung)

Da Claude die Werkzeuge direkt aufruft, ist Claude der Operations-Assistent aus deinen Punkten 19–24:
- **Beobachten:** `get_sync_status`, `get_last_error`
- **Erklären:** z. B. „Erwartet ‚Nicht zusammengefasste Daten exportieren‘, im Menü standen nur …“
- **Begrenzt reparieren:** `retry_current_step`, höchstens einmal pro Sync
- **Sonst STOP:** ACTION REQUIRED mit Erwartet/Beobachtet

Damit entfällt ein zweiter KI-Dienst samt zweitem Geheimnis (OpenAI-Key) und zweitem Datenabfluss. **Wenn du OpenAI trotzdem willst** (z. B. für automatische Diagnose ohne offene Claude-Sitzung), gilt das bisherige Konzept: Key im Schlüsselbund, nur redigiertes Fehlerobjekt, strenges JSON-Antwortformat, keine Screenshots.

Was Claude zu sehen bekommt:
- **Fehlerobjekte:**
  ```json
  { "code": "EXPORT_BUTTON_NOT_FOUND", "phase": "STARTING_EXPORT", "step": 3,
    "expected_label": "Nicht zusammengefasste Daten exportieren",
    "observed_menu_labels": ["Aktualisieren", "Bericht bearbeiten", "…"],
    "url_path": "/reports-dashboard/…/view/…", "attempt": 1, "elapsed_s": 41 }
  ```
  Nur Beschriftungen des geöffneten Menüs (höchstens 30 Einträge mit je 80 Zeichen), URL ohne Query-String.
- **Nie:**
  - Cookies, das Browserprofil, Passwörter
  - **Screenshots aus dem Automationsbrowser**: Der Report zeigt Namen und Telefonnummern, und auf der Login-Seite stünde womöglich die E-Mail.
- **Werkzeug-Ergebnisse:** Der MCP-Server liefert nur die oben genannten Felder. Er hat kein Werkzeug, mit dem Claude Dateien außerhalb des festen Datenordners lesen oder Browser-URLs vorgeben könnte.

## 7. Logs

Format `16:14:02 REFRESH_STARTED`. Ein Redaktionsfilter läuft vor jeder Ausgabe und entfernt:
- `Cookie`/`Authorization`-Werte,
- `sk-…`-Keys,
- `token=`/`password=`-Muster,
- Query-Strings aus URLs.

Zusätzlich gilt: Report-Inhalte, also CSV-Zeilen, werden nie geloggt, nur Zahlen (Zeilen, Bytes, Hash-Präfix).

## 8. Tests

Ich teste mit `pytest`. Der Browser-Teil läuft gegen **lokale Nachbau-Seiten**: kleine HTML-Dateien, die das HubSpot-Menü nachbilden, keine echten HubSpot-Seiten. Ab Phase 3 bilde ich sie den echten Beschriftungen nach. So berühren die Tests nie dein Konto.

Abgedeckte Fälle:
- Anmeldung fehlt oder abgelaufen
- Report nicht erreichbar
- Timeouts bei Aktualisieren und Export
- Export-Knopf fehlt, geänderte Oberfläche
- Download fehlt
- ungültige, leere oder doppelte CSV, unerwarteter Dateiname
- Netzwerkfehler
- Zip-Slip und Zip-Bombe
- Werkzeug-Aufrufe mit unerwarteten Parametern
- Redaktionsfilter

Die KI-Schicht wird mit einem Stub getestet. Er prüft, dass nur erlaubte Werkzeuge ausführbar sind und dass das Fehlerobjekt keine Geheimnisse enthält.

## 9. Risiken, nach Gewicht

| # | Risiko | Umgang |
|---|---|---|
| 1 | **Nutzungsbedingungen:** HubSpots Richtlinien schränken automatisierten Zugriff auf die Oberfläche möglicherweise ein. Es ist außerdem der HubSpot-Account deines Arbeitgebers. | **Vor dem Bau mit Chef bzw. HubSpot-Admin klären.** Ich kann die Bedingungen nicht verbindlich für euch auslegen. |
| 2 | HubSpot ändert die Oberfläche, Locators brechen. | Fester Fehlercode, Abbruch, Erwartet/Beobachtet in der Anzeige. Die Beschriftungen stehen in der Konfiguration. |
| 3 | Unbekannt, wie HubSpot den Export ausliefert: direkter Download, Benachrichtigung oder E-Mail mit Link. | In Phase 3 beobachten. Kommt er per E-Mail, muss der Ablauf anders aussehen. |
| 4 | Login per Google- oder Microsoft-SSO blockiert automatisierte Browser („Dieser Browser ist möglicherweise nicht sicher“). | Echtes Chrome statt Test-Chromium, sichtbares Fenster, Anmeldung immer von Hand. |
| 5 | Sitzung läuft oft ab. | Klarer Status `AUTHENTICATION_REQUIRED`, Fenster zum Neu-Anmelden. Wie oft das passiert, merken wir erst im Betrieb. |
| 6 | Die Cookies im Profil sind womöglich nicht über den Schlüsselbund verschlüsselt (`--use-mock-keychain`). | In Phase 4 prüfen und wenn möglich abschalten. Profil wie ein Passwort behandeln, FileVault an. |
| 7 | Python 3.14 ist sehr neu, Playwright-Abhängigkeiten könnten fehlen. | Eigenes `venv` mit Python 3.12/3.13, falls nötig. |
| 8 | Personenbezogene Daten liegen dauerhaft lokal. | Nur im Agent-Ordner, Aufbewahrung begrenzt, nie im Repo. |
| 9 | Kundendaten gehen an Claude, wenn Claude die CSV liest. | Wie heute beim ZIP-Hochladen. Für reine Kennzahlen reicht `get_report_metrics`, das liefert keine Rohzeilen. |

## 10. Ablageort des Codes

Vorschlag: Ordner `agent/` im bestehenden Repo `adric-board`. Dort liegt **nur Code**, keine Konfiguration und keine Daten. Report-URL, Profil, Daten und Logs liegen unter `~/Library/Application Support/adric-hubspot-agent/`.

Hinweis: Das Repo ist öffentlich. Der Agent-Code enthält keine Geheimnisse, verrät aber, dass und wie ihr HubSpot automatisiert. Wer das nicht öffentlich haben will, nimmt ein privates Repo für `agent/`. Dann ist GitHub Pages für das Board weiter möglich, solange das Board-Repo öffentlich bleibt.

## 11. Phasenplan

| Phase | Ergebnis | Braucht dich |
|---|---|---|
| 3 HubSpot untersuchen | Echte Locators, Wartesignale, Auslieferungsweg des Exports | ja, einmal ca. 15 min (siehe unten) |
| 4–5 Agent + Anmeldung | `setup_auth.py`, Agent-Gerüst, Sicherheitsprüfungen, Tests | einmal anmelden |
| 6–9 Ablauf | Öffnen → Aktualisieren → Export → Download → Prüfung | – |
| 10 Claude | MCP-Server in Claude Code eintragen, `get_report_metrics` mit Board-Logik | einmal Claude neu starten |
| 11 KI | Diagnose-Texte und Retry-Regeln im MCP-Server; OpenAI nur falls gewünscht | – |
| 12 Security-Audit | Checkliste aus deinem Punkt 31, Ergebnis schriftlich | – |
| 13 Ende-zu-Ende | Ein echter Sync von Knopfdruck bis Board | einmal zuschauen |

### Phase 3 konkret

Ich starte ein Untersuchungsskript mit dem eigenen Automationsprofil:
1. Du meldest dich an, ich sehe das Passwort nicht.
2. Du klickst den Ablauf einmal normal durch.
3. Das Skript zeichnet dabei **nur** die Struktur auf: Rollen, Beschriftungen und `data-test-id` der geklickten Elemente und Menüs, die URL ohne Query-String, Netzwerk-Anfragen ohne Header und Inhalte, das Download-Ereignis.

Keine Screenshots, keine Report-Inhalte.
