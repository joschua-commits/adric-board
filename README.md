# Anruf-Wochenboard

Wertet den HubSpot-Export „Anrufsnotizen“ aus und zeigt ein Wochenboard: Anrufe, Gespräche, Kontakte, Firmen, Quoten pro Tag, Wochentag und Stunde, Erreichbarkeit nach Nummerntyp, alle Gespräche und die Top-Firmen.

Alles steckt in **einer Datei: `index.html`**. Es gibt kein Backend und keinen Build-Schritt. Die CSV wird nur im Browser gelesen und nirgendwohin hochgeladen. Ohne Internet funktioniert alles; es fehlt dann nur die Schrift IBM Plex Mono, und die Systemschrift springt ein (die Ziffern bleiben gleich breit).

## Online-Daten aktualisieren (v2)

Die Website lädt beim Öffnen `data/anrufe.enc.json` und fragt nach dem Passwort. Die Daten sind mit AES-256-GCM verschlüsselt, der Schlüssel wird per PBKDF2 mit 600.000 Runden aus dem Passwort abgeleitet. Entschlüsselt wird nur im Browser.

Neuer HubSpot-Export (ZIP oder CSV):

```bash
cd ~/Documents/adric-board
node tools/update.mjs ~/Downloads/hubspot-custom-report-anrufsnotizen-JJJJ-MM-TT.zip
git add data && git commit -m "Daten aktualisiert" && git push
```

- **KI:** Nur neue oder geänderte Notizen gehen an OpenAI (`gpt-5-mini`, einstellbar über `OPENAI_MODEL`). Bekannte Notizen kommen aus `.lokal/ki-cache.json`. Der Key wird aus `~/adric job scraping/.env` gelesen und landet nie im Repo oder auf der Website.
- **Passwort:** wird beim ersten Lauf gesetzt (mindestens 12 Zeichen) und liegt im macOS-Schlüsselbund. Neues Passwort setzen: `--neues-passwort`.
- **Korrekturen von Hand:** in `.lokal/korrekturen.json`. Dort lassen sich Anrufe als Termin markieren, wenn der Termin erst danach per E-Mail zustande kam, und fehlende Firmennamen nachtragen. Termine ganz ohne Anruf gehören in `.lokal/termine-ohne-anruf.json` (`[{ "datum": "JJJJ-MM-TT", "firma": "…", "name": "…" }]`).
- `.lokal/` steht in `.gitignore` und wird nie hochgeladen.

## Benutzen

1. `index.html` im Browser öffnen (Doppelklick genügt).
2. CSV hineinziehen oder „Datei auswählen“.
3. Zeitraum wählen: Diese Woche (Standard), Letzte Woche, Letzte 30 Tage, Alles oder eigene Von/Bis-Daten.
4. Stundenversatz prüfen. Standard ist **+5 Stunden**, weil die Zeiten im Export nicht in deutscher Ortszeit liegen. Der Versatz verschiebt alle Uhrzeiten und damit auch Tage, Wochentage und Zeiträume. Ein Anruf um 21:30 im Export zählt so als 02:30 am nächsten Tag.
5. „Drucken / PDF“ erzeugt eine helle Fassung ohne Bedienelemente für den Chef.

Wochen laufen von Montag bis Sonntag. „Letzte 30 Tage“ heißt: heute und die 29 Tage davor.

## Was gezählt wird

- **Kein Anruf:** Zeilen mit leerer Anrufnotiz oder „(Kein Wert)“ fliegen raus.
- **Dubletten:** Gleiche Engagement ID zählt nur einmal. Zeilen ohne Engagement ID werden nicht zusammengefasst.
- **Kontakte:** verschiedene Kontakt IDs. Fehlt die ID, zählen Name und Telefonnummer.
- **Firmen:** verschiedene Unternehmensnamen, Groß-/Kleinschreibung egal.
- **Telefontage:** Tage mit mindestens einem Anruf, nach Versatz.
- **Nummerntyp:** deutsche Nummer mit 015, 016 oder 017 = Mobil, andere deutsche = Festnetz/Durchwahl, alles andere = Ausland, leer = keine Nummer. Die Schreibweisen +49, 0049, +49 (0) und 0151 werden erkannt.

### Klassifikation der Notizen

Jede Notiz wird anhand von Stichwörtern einer von drei Kategorien zugeordnet: **Niemand erreicht**, **Falscher Kontakt / abwesend** oder **Gespräch**. Die Wortlisten stehen ganz oben in `index.html` (`WOERTER_NIEMAND_ERREICHT` und `WOERTER_FALSCHER_KONTAKT`), kommentiert und leicht erweiterbar.

**„Gespräch“ ist eine Obergrenze.** Alles, was kein Stichwort trifft, zählt als Gespräch, auch „Rückruf morgen“ oder Tippfehler wie „Mailbx“. Von Hand nachgezählt fällt der Wert niedriger aus. Wer solche Notizen in der Gesprächstabelle findet, ergänzt einfach das passende Wort in der Liste.

### Termin gebucht

Ein Gespräch zählt zusätzlich als **Termin gebucht**, wenn die Notiz ein Wort aus `WOERTER_TERMIN_GEBUCHT` enthält, etwa „Termin vereinbart“, „Termin ausgemacht“ oder „call gebucht“, und keines aus `WOERTER_KEIN_TERMIN`, etwa „keinen Termin“, „nicht ausmachen“ oder „schon vereinbart“. In den Listen steht `…` für bis zu 40 Zeichen im selben Satz, „Termin am Freitag 10 Uhr vereinbart“ zählt also auch. Termine erscheinen als Kennzahl (mit Anteil an den Gesprächen), als Spalte pro Tag, Wochentag, Stunde und Firma und als eigene Liste „Gebuchte Termine“.

### Kleine Stichproben

Jede Quote, die aus weniger als 10 Anrufen berechnet wird, trägt den Hinweis **⚠ Stichprobe zu klein (n)**. Bei den Top-Firmen wird deshalb gar keine Quote gezeigt, weil einzelne Firmen fast nie auf 10 Anrufe kommen. Die Grenze steht als `MINDEST_STICHPROBE` oben in `index.html`.

## Export in HubSpot erzeugen

Die Datei kommt aus einem HubSpot-Bericht mit Anrufen und den zugehörigen Kontakt- und Firmendaten. Die Menünamen können je nach HubSpot-Version leicht abweichen.

**Vorhandenen Bericht exportieren:**

1. In HubSpot **Berichte → Berichte** öffnen.
2. Den Bericht „Anrufsnotizen“ suchen und öffnen.
3. Oben rechts **Aktionen → Exportieren** wählen.
4. Als Dateiformat **CSV** wählen und exportieren. Größere Exporte schickt HubSpot per E-Mail als Download-Link.

**Bericht neu anlegen, falls es ihn noch nicht gibt:**

1. **Berichte → Berichte → Bericht erstellen → Benutzerdefinierter Berichts-Generator**.
2. Als Datenquellen **Anrufe** (primär), **Kontakte** und **Unternehmen** wählen.
3. Diese Felder aufnehmen: Anrufnotizen, Aktivitätsdatum, Engagement ID (aus Anrufe); Telefonnummer, Vorname, Nachname, Kontakt ID (aus Kontakte); Unternehmensname (aus Unternehmen).
4. Als Tabelle speichern, Name „Anrufsnotizen“, dann wie oben exportieren.

Wichtig sind die Spaltennamen. Pflicht sind **Anrufnotizen** und **Aktivitätsdatum**, die übrigen Spalten sind optional. Die Reihenfolge ist egal. Semikolon, Komma oder Tab als Trennzeichen werden automatisch erkannt. Wurde die Datei in Excel neu gespeichert (Windows-Zeichensatz statt UTF-8), funktioniert sie ebenfalls.

## Auf GitHub Pages veröffentlichen

1. Auf github.com oben rechts **+ → New repository**, Name zum Beispiel `adric-board`, **Create repository**.
2. Auf der leeren Repo-Seite **uploading an existing file** anklicken, `index.html` hineinziehen (README und den Ordner `test` kann man mit hochladen, muss man aber nicht) und **Commit changes** drücken.
3. **Settings → Pages**. Unter „Build and deployment“ bei Source **Deploy from a branch** wählen, Branch **main** und Ordner **/ (root)**, **Save**.
4. Nach ein bis zwei Minuten ist das Board erreichbar unter `https://<github-name>.github.io/adric-board/`.

Für Updates einfach die neue `index.html` im Repo hochladen; Pages aktualisiert sich von selbst.

**Datenschutz:** Die Seite selbst enthält keine Kundendaten, die CSV bleibt immer im Browser dessen, der sie öffnet. **Echte HubSpot-Exporte nie ins Repository hochladen.** Bei kostenlosen GitHub-Konten ist ein Pages-Repo öffentlich. `test/testdaten.csv` enthält nur erfundene Daten.

## Tests

Parser und Kennzahlen lassen sich ohne Browser prüfen (Node.js nötig):

```bash
node test/tests.mjs
```

Mit `--zahlen` werden zusätzlich alle Auswertungen der Testdaten ausgegeben. Die erwarteten Werte in den Tests sind von Hand aus `test/testdaten.csv` nachgezählt. Die Testdatei enthält absichtlich alle schwierigen Fälle: BOM, Semikolon und Komma in Notizen, mehrzeilige Notizen, verdoppelte Anführungszeichen, „(Kein Wert)“, leere Notizen, Dubletten und einen Anruf, der durch den Versatz in die nächste Woche rutscht. Zum Ausprobieren der Oberfläche kann man `test/testdaten.csv` ins Board ziehen; „Diese Woche“ zeigt dann nur Daten, wenn heute in der Woche vom 28.09.2026 liegt, sonst „Alles“ wählen.
