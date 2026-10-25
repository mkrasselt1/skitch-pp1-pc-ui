# PP1 Steuerung (PC)

Browser-Oberfläche, um die Brother Skitch PP1 per Web Bluetooth vom PC aus zu steuern, ohne Android-Telefon.

**▶ [Direkt im Browser starten](https://mkrasselt1.github.io/skitch-pp1-pc-ui/)** (Chrome oder Edge) · **⬇ [Desktop-App herunterladen](https://github.com/mkrasselt1/skitch-pp1-pc-ui/releases/latest)** (Windows, Linux)

## Desktop-App (empfohlen)

Fertige Programme ohne Browser-Einrichtung, zum Download unter [Releases](https://github.com/mkrasselt1/skitch-pp1-pc-ui/releases/latest):

| System | Datei |
|---|---|
| Windows | `PP1-Steuerung-…-win-x64.exe` (Installer) oder `PP1-Steuerung-…-portable.exe` (ohne Installation) |
| Linux | `PP1-Steuerung-…-x86_64.AppImage` (ausführbar machen und starten) oder `….flatpak` (`flatpak install --user <Datei>`) |

Die Desktop-App bringt ihren eigenen Chromium mit Web Bluetooth mit. Unter Linux koppelt der Knopf **„Maschine mit PC koppeln“** die PP1 einmalig, der Umweg über `bluetoothctl` entfällt.

Selbst bauen: `npm install`, dann `npm start` (testen) oder `npm run dist` (Pakete in `dist/`).

## Im Browser starten

```bash
python3 serve.py
```

Dann `http://localhost:8000` in **Chrome oder Edge** öffnen. Web Bluetooth läuft nur dort und nur über `localhost` oder `https`.

## Pairing unter Linux

Die PP1 verlangt eine verschlüsselte Bluetooth-Verbindung. Android koppelt sie automatisch im Hintergrund, unter Linux muss sie **einmal** mit dem PC gekoppelt werden. Ohne Kopplung beantwortet die Maschine keine Anfrage, die App meldet dann „Die Maschine antwortet nicht“.

1. In der App „Trennen“ klicken (oder den Tab schließen), damit Chrome die Maschine freigibt.
2. Im Terminal `bluetoothctl` starten und dort nacheinander eingeben (Adresse durch die deiner Maschine ersetzen, `devices` zeigt sie an):
   ```
   pairable on
   agent NoInputNoOutput
   default-agent
   pair 94:DD:F8:52:72:66
   trust 94:DD:F8:52:72:66
   disconnect 94:DD:F8:52:72:66
   ```
3. Danach in der App neu verbinden.

## Ablauf an der Maschine

An einer echten PP1 erprobt:

1. In der App verbinden und die Stickdatei übertragen.
2. An der Maschine den Stickrahmen abnehmen.
3. **Annahme-Taste** drücken und die Initialisierung abwarten (der Wagen fährt, Hände weg).
4. Rahmen wieder einsetzen.
5. **Start/Stop** an der Maschine drücken.

Gestartet wird immer an der Maschine. Der Bluetooth-Befehl „Start“ (1806) bereitet nur vor; im Status „Initialisierung“ nimmt die Maschine ihn nicht an. Die App zeigt in jedem Zustand an, was an der Maschine zu tun ist.

## Was funktioniert

- **Vorschau** von `.pes`, `.jef`, `.exp`, `.dst`, `.vp3`, `.xxx`. Gelesen wird mit [tsembroidery](https://github.com/GuillaumeMMM/tsembroidery) 2.8.0 (MIT), einem Port von pyembroidery. Die Bibliothek und ihre Abhängigkeiten liegen unverändert in `vendor/` und werden per Import-Map geladen, ohne CDN und ohne Build-Schritt.
- **Live-Fortschritt**: Gestickter Teil in Farbe, Rest blass, Nadelposition rot. Bei verbundener Maschine kommt der Fortschritt alle 3 s von der PP1 (Befehl 1799).
- **Zeitstrahl** mit geschätzter Dauer, Farbblöcken und Fadenwechseln. Die Schätzung ist Stichzahl ÷ Stiche pro Minute plus eine feste Pause je Fadenwechsel; beide Werte sind einstellbare Annahmen.
- **Sprachen**: Deutsch, Englisch, Französisch und Spanisch (Auswahl oben rechts, sonst nach Browsersprache).
- **Bluetooth-Steuerung**: Verbinden, Status und Fehler der Maschine anzeigen, Start, Fortsetzen, Rahmen wegfahren und Start-Stich setzen („Springe zu Stich“).

## Übertragen auf die Maschine

`pen.js` erzeugt die Stichdaten im Format der PP1: Vernähstiche am Anfang und Ende, Fadenschnitte nach langen Sprüngen und Farbwechsel. Die Umsetzung ist eigenständig geschrieben und liefert dieselben Bytes wie die Hersteller-App, geprüft mit echten Dateien und 5.000 Zufallsmustern. Das Motiv wird in der Rahmenmitte gestickt, ohne Drehung.

Danach sendet die App die Daten wie die Hersteller-App: Löschen (1800), Kopf (4608), Datenblöcke (4609), Abschluss abwarten, Layout (1797), Muster-ID (1802).

An einer echten PP1 erfolgreich getestet (Blockgröße 500 Byte unter Linux mit Chrome). Web Bluetooth verrät die MTU nicht, deshalb wird bei Schreibfehlern automatisch kleiner probiert.

