// Prüft Parser und Kennzahlen aus index.html ohne Browser.
// Aufruf:  node test/tests.mjs
// Die erwarteten Zahlen sind von Hand aus test/testdaten.csv nachgezählt.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';

const hier = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(hier, '..', 'index.html'), 'utf8');
const kern = html.match(/<script id="kern">([\s\S]*?)<\/script>/)[1];
const A = new Function(kern + '\nreturn ADRIC;')();
const csv = readFileSync(join(hier, 'testdaten.csv'), 'utf8');

let ok = 0, fehler = 0;
function test(name, fn) {
  try { fn(); ok++; console.log('  ok   ' + name); }
  catch (e) { fehler++; console.log('  FEHLER ' + name + '\n       ' + e.message.split('\n').join('\n       ')); }
}

console.log('\nCSV-Parser');
test('Semikolon, Komma, Zeilenumbruch und "" im Feld', () => {
  const t = 'a;b;c\n"x; y, z";"Zeile 1\nZeile 2";"er sagte ""ja"""\n';
  assert.deepEqual(A.parseCSV(t).zeilen, [['a', 'b', 'c'], ['x; y, z', 'Zeile 1\nZeile 2', 'er sagte "ja"']]);
});
test('Komma als Trennzeichen mit Semikolon im Feld', () => {
  const t = 'a,b,c\n"x; y, z",2,"q ""w"" e"';
  const r = A.parseCSV(t);
  assert.equal(r.trennzeichen, ',');
  assert.deepEqual(r.zeilen, [['a', 'b', 'c'], ['x; y, z', '2', 'q "w" e']]);
});
test('BOM, CRLF, leere Felder, keine Schlusszeile', () => {
  const t = '﻿a;b;c\r\n1;;3\r\n;;\r\n"r\r\nn";"";x';
  assert.deepEqual(A.parseCSV(t).zeilen, [['a', 'b', 'c'], ['1', '', '3'], ['', '', ''], ['r\r\nn', '', 'x']]);
});
test('Anführungszeichen mitten im Feld bleiben stehen', () => {
  assert.deepEqual(A.parseCSV('a;b\n24" Monitor;x').zeilen, [['a', 'b'], ['24" Monitor', 'x']]);
});
test('Trennzeichen-Erkennung ignoriert Zeichen in Anführungszeichen', () => {
  assert.equal(A.erkenneTrennzeichen('"a;b;c;d",x,y\n'), ',');
  assert.equal(A.erkenneTrennzeichen('"a,b,c,d";x;y\n'), ';');
});

console.log('\nKlassifikation, Nummerntyp, Datum');
test('Klassifikation inkl. Vorrang von Liste 1', () => {
  assert.equal(A.klassifiziere('VOICEMAIL').kategorie, 'niemand');
  assert.equal(A.klassifiziere('Abwesenheitsnotiz').kategorie, 'falsch');
  assert.equal(A.klassifiziere('Mailbox, laut Ansage Urlaub bis Montag').kategorie, 'niemand');
  assert.equal(A.klassifiziere('Gutes Gespräch, Demo am Freitag').kategorie, 'gespraech');
  assert.equal(A.klassifiziere('Drückt mich weg').kategorie, 'niemand');
});
test('Tippfehler und Ergänzungen aus dem echten Export', () => {
  const k = s => A.klassifiziere(s).kategorie;
  assert.equal(k('geht nciht ran'), 'niemand');
  assert.equal(k('gehz nivht ran'), 'niemand');
  assert.equal(k('Zentrale: haben ihn nihct erreicht'), 'niemand');
  assert.equal(k('Nciht ran'), 'niemand');                        // Großschreibung
  assert.equal(k('mobilbox'), 'niemand');
  assert.equal(k('keine handynummer hinterlegt'), 'niemand');
  assert.equal(k('zentrale blockt ab'), 'niemand');
  assert.equal(k('ist schon im ruhestand'), 'falsch');
  // dürfen NICHT treffen
  assert.equal(k('ist im urlaub, aber gerne ab dem 17. august'), 'gespraech');
  assert.equal(k('Unternehmen Nichtrostend GmbH, gutes Gespräch'), 'gespraech');
  assert.equal(k('wollte aber keine nummer geben'), 'gespraech');
});
test('Termin gebucht: Treffer und Fallen aus dem echten Export', () => {
  const t = s => A.klassifiziere(s).termin;
  assert.equal(t('hat den pain mit manueller rechnungsprüfung call gebucht'), true);
  assert.equal(t('Provisionsmodell erklärt, Termin ausgemacht'), true);
  assert.equal(t('Sehr gutes Gespräch, Termin am Freitag 10 Uhr vereinbart'), true);   // Wörter dazwischen
  // dürfen NICHT zählen
  assert.equal(t('wollte keinen termin sondern erst unterlagen'), false);
  assert.equal(t('2. termin konnte ich nicht ausmachen, da er aufgelegt hat'), false);
  assert.equal(t('call wurde schon vereinbart'), false);
  assert.equal(t('Zentrale: Aktuell in einem termin'), false);
  assert.equal(t('Termin wäre schön. Verträge werden vereinbart'), false);              // nicht über den Punkt
  assert.equal(t('Mailbox, Termin für Freitag vereinbart?'), false);                    // niemand erreicht gewinnt
});
test('Nummerntyp', () => {
  const f = A.nummernTyp;
  assert.equal(f('+49 151 2345678'), 'mobil');
  assert.equal(f('+49 (0)171 2345678'), 'mobil');
  assert.equal(f('0049 160 1'), 'mobil');
  assert.equal(f('0176/1234567'), 'mobil');
  assert.equal(f('+49 89 12345-678'), 'festnetz');
  assert.equal(f('+49 (0)711 987654'), 'festnetz');
  assert.equal(f('0711 222333'), 'festnetz');
  assert.equal(f('+43 1 5321234'), 'ausland');
  assert.equal(f('+41 171 1234567'), 'ausland');
  assert.equal(f(''), 'keine');
  assert.equal(f('(Kein Wert)'), 'keine');
});
test('Datum mit Versatz, auch über Mitternacht', () => {
  const d = A.parseDatum('2026-09-27 19:30', 5);
  assert.equal(d.toISOString(), '2026-09-28T00:30:00.000Z');
  assert.equal(A.parseDatum('01.10.2026 05:33', 5).toISOString(), '2026-10-01T10:33:00.000Z');
  assert.equal(A.parseDatum('Quatsch', 5), null);
});
test('HTML-Notizen werden zu Text', () => {
  assert.equal(A.htmlZuText('<p>Rückruf &amp; Mail</p><p>Teil 2</p>'), 'Rückruf & Mail\nTeil 2');
});
test('Zeiträume (heute = Do 01.10.2026)', () => {
  assert.deepEqual(A.zeitraum('woche', '2026-10-01'), { von: '2026-09-28', bis: '2026-10-04' });
  assert.deepEqual(A.zeitraum('letzteWoche', '2026-10-01'), { von: '2026-09-21', bis: '2026-09-27' });
  assert.deepEqual(A.zeitraum('30tage', '2026-10-01'), { von: '2026-09-02', bis: '2026-10-01' });
  assert.deepEqual(A.zeitraum('woche', '2026-10-04'), { von: '2026-09-28', bis: '2026-10-04' }); // Sonntag
  assert.deepEqual(A.zeitraum('woche', '2026-09-28'), { von: '2026-09-28', bis: '2026-10-04' }); // Montag
});

console.log('\nTestdaten (test/testdaten.csv), Versatz +5');
const { anrufe, stat } = A.leseAnrufe(csv, 5);
test('Einlesen: 24 Datenzeilen, 3 ohne Notiz, 2 Dubletten, 19 Anrufe', () => {
  assert.equal(stat.trennzeichen, ';');
  assert.equal(stat.datenzeilen, 24);
  assert.equal(stat.keinAnruf, 3);
  assert.equal(stat.dubletten, 2);
  assert.equal(stat.ohneDatum, 0);
  assert.equal(anrufe.length, 19);
});
test('Mehrzeilige Notiz bleibt vollständig', () => {
  const a = anrufe.find(x => x.engagementId === '1019');
  assert.equal(a.notiz, 'Lange Diskussion über Reporting\n\nZweiter Absatz mit Zitat: "Wir sind zufrieden"');
});

const alles = A.auswerten(anrufe, null, null);
test('Alles: 19 Anrufe, 6 Gespräche, 9 niemand, 4 falsch, 14 Kontakte, 8 Firmen, 8 Tage', () => {
  const g = alles.gesamt;
  assert.deepEqual([g.anrufe, g.gespraech, g.niemand, g.falsch], [19, 6, 9, 4]);
  assert.deepEqual([alles.kontakte, alles.firmen, alles.telefontage], [14, 8, 8]);
});
test('Alles: Nummerntypen', () => {
  const n = Object.fromEntries(alles.proNummerTyp.map(t => [t.typ, [t.anrufe, t.gespraech]]));
  assert.deepEqual(n, { mobil: [6, 0], festnetz: [9, 4], ausland: [2, 2], keine: [2, 0] });
});
test('Alles: Top-Firmen', () => {
  assert.deepEqual(alles.topFirmen.slice(0, 4).map(f => [f.name, f.anrufe, f.gespraech]), [
    ['Schmidt & Söhne KG', 3, 2], ['Nordlicht Steuerberatung', 3, 1],
    ['Müller Logistik GmbH', 3, 0], ['Weber Bau AG', 3, 0],
  ]);
});

const zw = A.zeitraum('woche', '2026-10-01');
const woche = A.auswerten(anrufe, zw.von, zw.bis);
test('Diese Woche: 15 Anrufe, 4 Gespräche, 13 Kontakte, 7 Firmen, 4 Tage', () => {
  const g = woche.gesamt;
  assert.deepEqual([g.anrufe, g.gespraech, g.niemand, g.falsch], [15, 4, 7, 4]);
  assert.deepEqual([woche.kontakte, woche.firmen, woche.telefontage], [13, 7, 4]);
  assert.equal(g.kleineStichprobe, false);
  assert.deepEqual([g.termin, woche.termine.map(a => a.engagementId)], [1, ['1010']]);
  assert.equal(g.terminKleineStichprobe, true);   // nur 4 Gespräche
});
test('Diese Woche: pro Tag', () => {
  assert.deepEqual(woche.proTag.map(t => [t.tag, t.anrufe, t.gespraech]), [
    ['2026-09-28', 4, 1], ['2026-09-29', 3, 1], ['2026-09-30', 4, 1], ['2026-10-01', 4, 1],
  ]);
  assert.ok(woche.proTag.every(t => t.kleineStichprobe));
});
test('Diese Woche: pro Stunde (nach Versatz)', () => {
  const s = woche.proStunde.filter(t => t.anrufe).map(t => [t.stunde, t.anrufe, t.gespraech]);
  assert.deepEqual(s, [[0, 1, 0], [2, 1, 0], [7, 1, 0], [8, 2, 0], [9, 3, 2], [10, 4, 1], [11, 1, 0], [13, 1, 1], [14, 1, 0]]);
});
test('Diese Woche: Gesprächsliste chronologisch', () => {
  assert.deepEqual(woche.gespraeche.map(a => a.engagementId), ['1002', '1007', '1010', '1014']);
});

const lw = A.zeitraum('letzteWoche', '2026-10-01');
test('Letzte Woche: 2 Anrufe, Quote 50 %, als zu kleine Stichprobe markiert', () => {
  const r = A.auswerten(anrufe, lw.von, lw.bis).gesamt;
  assert.deepEqual([r.anrufe, r.gespraech, r.quote, r.kleineStichprobe], [2, 1, 0.5, true]);
});
test('Letzte 30 Tage: 18 Anrufe (ohne 15.08.)', () => {
  const z = A.zeitraum('30tage', '2026-10-01');
  assert.equal(A.auswerten(anrufe, z.von, z.bis).gesamt.anrufe, 18);
});
test('Versatz 0: Sonntagsanruf rutscht in letzte Woche, 9 Telefontage', () => {
  const r0 = A.leseAnrufe(csv, 0).anrufe;
  assert.equal(A.auswerten(r0, lw.von, lw.bis).gesamt.anrufe, 3);
  assert.equal(A.auswerten(r0, null, null).telefontage, 9);
});

console.log('\nGleiche Daten als Komma-CSV mit CRLF');
test('liefert identische Kennzahlen', () => {
  const q = v => /[",\r\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
  const komma = '﻿' + A.parseCSV(csv).zeilen.map(z => z.map(q).join(',')).join('\r\n');
  const r = A.leseAnrufe(komma, 5);
  assert.equal(r.stat.trennzeichen, ',');
  const k = A.auswerten(r.anrufe, null, null);
  assert.deepEqual(
    [k.gesamt.anrufe, k.gesamt.gespraech, k.kontakte, k.firmen, k.telefontage],
    [19, 6, 14, 8, 8]);
  assert.deepEqual(r.anrufe.map(a => a.notiz), anrufe.map(a => a.notiz));
});

console.log('\nKI-Übernahme, ZIP, Verschlüsselung');
const atest = [];
async function testA(name, fn) { atest.push([name, fn]); }
testA('KI-Ergebnis übernimmt Kategorie, Detail und Termin', async () => {
  const { anrufe: liste } = A.leseAnrufe(csv, 5);
  const a = liste.find(x => x.engagementId === '1007');           // Regel: Gespräch
  const b = liste.find(x => x.engagementId === '1001');           // Regel: Mailbox
  const ki = {
    '1007': { h: A.notizHash(a.notiz), ergebnis: 'gespraech', termin: true, interesse: 'hoch', schritt: 'Demo', sicherheit: 0.9 },
    '1001': { h: A.notizHash(b.notiz), ergebnis: 'gespraech', termin: false, interesse: 'keins', sicherheit: 0.4 },   // unsicher
  };
  A.wendeKiAn(liste, ki);
  assert.deepEqual([a.quelle, a.kategorie, a.detail, a.termin, a.interesse, a.uneinig], ['ki', 'gespraech', 'gespraech', true, 'hoch', true]);
  assert.deepEqual([b.quelle, b.kategorie, b.uneinig], ['regel', 'niemand', true]);
  const r = A.auswerten(liste, null, null);
  assert.deepEqual([r.kiAnzahl, r.unsicher.length, r.uneinig.length, r.gesamt.termin], [1, 1, 2, 2]);
});
testA('Termine ohne Anruf zählen nur im Zeitraum und nicht in Gesprächsquoten', async () => {
  const { anrufe: liste } = A.leseAnrufe(csv, 5);
  const extra = [{ datum: '2026-09-30', firma: 'X', name: 'Y' }, { datum: '2026-08-01', firma: 'Z' }, { datum: 'kaputt' }];
  const r = A.auswerten(liste, '2026-09-28', '2026-10-04', extra);
  assert.deepEqual([r.termineOhneAnruf.length, r.gesamt.termin, r.gesamt.gespraech], [1, 1, 4]);
});
testA('Korrektur von Hand markiert einen Anruf als Termin', async () => {
  const { anrufe: liste } = A.leseAnrufe(csv, 5);
  A.wendeKorrekturenAn(liste, { termin: { '1007': true, '1010': false } });
  const a = liste.find(x => x.engagementId === '1007'), b = liste.find(x => x.engagementId === '1010');
  assert.deepEqual([a.termin, a.manuell, b.termin], [true, true, false]);
});
testA('KI-Eintrag mit veraltetem Notiz-Hash wird ignoriert', async () => {
  const { anrufe: liste } = A.leseAnrufe(csv, 5);
  A.wendeKiAn(liste, { '1001': { h: '00000000', ergebnis: 'gespraech', sicherheit: 1 } });
  assert.equal(liste.find(x => x.engagementId === '1001').kategorie, 'niemand');
});
testA('ZIP: richtige CSV wird gefunden', async () => {
  const { mkdtempSync, writeFileSync, readFileSync: rf } = await import('node:fs');
  const { execFileSync } = await import('node:child_process');
  const { tmpdir } = await import('node:os');
  const d = mkdtempSync(join(tmpdir(), 'adric-'));
  writeFileSync(join(d, 'hubspot-export-summary.csv'), '"Anrufnotizen"\n"x"\n');
  writeFileSync(join(d, 'anrufsnotizen.csv'), csv);
  execFileSync('zip', ['-q', '-j', join(d, 'e.zip'), join(d, 'hubspot-export-summary.csv'), join(d, 'anrufsnotizen.csv')]);
  const z = rf(join(d, 'e.zip'));
  const r = await A.anrufCsvAus(z.buffer.slice(z.byteOffset, z.byteOffset + z.byteLength), 'e.zip');
  assert.equal(r.quelle, 'e.zip › anrufsnotizen.csv');
  assert.equal(A.leseAnrufe(r.text, 5).anrufe.length, 19);
});
testA('ZIP: Pfade im Dateinamen werden abgelehnt', async () => {
  const { mkdtempSync, writeFileSync, mkdirSync, readFileSync: rf } = await import('node:fs');
  const { execFileSync } = await import('node:child_process');
  const { tmpdir } = await import('node:os');
  const d = mkdtempSync(join(tmpdir(), 'adric-'));
  mkdirSync(join(d, 'sub')); writeFileSync(join(d, 'sub', 'a.csv'), 'x');
  execFileSync('zip', ['-q', '-r', 'e.zip', 'sub'], { cwd: d });
  const z = rf(join(d, 'e.zip'));
  await assert.rejects(A.anrufCsvAus(z.buffer.slice(z.byteOffset, z.byteOffset + z.byteLength)), /Unerlaubter Dateiname/);
});
testA('Verschlüsselung: Hin und zurück, falsches Passwort scheitert', async () => {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const paket = await A.verschluessle(JSON.stringify({ hallo: 'Welt ä' }), 'richtig-langes-passwort', salt);
  assert.equal(paket.runden, 600000);
  const { inhalt, schluessel } = await A.entschluessle(paket, 'richtig-langes-passwort');
  assert.deepEqual(inhalt, { hallo: 'Welt ä' });
  assert.deepEqual((await A.entschluessle(paket, schluessel)).inhalt, { hallo: 'Welt ä' });   // gemerkter Schlüssel
  await assert.rejects(A.entschluessle(paket, 'falsch-falsch-falsch'), /Falsches Passwort/);
});
for (const [name, fn] of atest) {
  try { await fn(); ok++; console.log('  ok   ' + name); }
  catch (e) { fehler++; console.log('  FEHLER ' + name + '\n       ' + e.message.split('\n').join('\n       ')); }
}

console.log(`\n${ok} bestanden, ${fehler} fehlgeschlagen`);

if (process.argv.includes('--zahlen')) {
  const pz = x => x == null ? '–' : (x * 100).toFixed(1).replace('.', ',') + ' %';
  const zeile = (l, t) => console.log(`  ${l.padEnd(24)} ${String(t.anrufe).padStart(3)} Anrufe  ${String(t.gespraech).padStart(2)} Gespr.  ${pz(t.quote).padStart(7)}${t.kleineStichprobe ? '  ⚠ Stichprobe < 10' : ''}`);
  for (const [name, r] of [['ALLES', alles], ['DIESE WOCHE 28.09.–04.10.', woche]]) {
    console.log(`\n=== ${name} ===`);
    console.log(`  Anrufe ${r.gesamt.anrufe} | Gespräche ${r.gesamt.gespraech} (${pz(r.gesamt.quote)}) | niemand ${r.gesamt.niemand} | falsch/abwesend ${r.gesamt.falsch}`);
    console.log(`  Kontakte ${r.kontakte} | Firmen ${r.firmen} | Telefontage ${r.telefontage}`);
    console.log('  -- pro Tag'); r.proTag.forEach(t => zeile(t.tag, t));
    console.log('  -- pro Wochentag'); r.proWochentag.filter(t => t.anrufe).forEach(t => zeile(t.label, t));
    console.log('  -- pro Stunde'); r.proStunde.filter(t => t.anrufe).forEach(t => zeile(String(t.stunde).padStart(2, '0') + ' Uhr', t));
    console.log('  -- Nummerntyp'); r.proNummerTyp.forEach(t => zeile(t.label, t));
    console.log('  -- Top-Firmen'); r.topFirmen.slice(0, 5).forEach(t => zeile(t.name, t));
  }
}
process.exit(fehler ? 1 : 0);
