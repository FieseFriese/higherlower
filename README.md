# Higher or Lower

Ein interaktives Quiz-Spiel, bei dem Spieler Karten nach einem Wert (z.B. Marktwert, Alter, Geschwindigkeit) auf einer Skala von niedrig nach hoch einordnen müssen.

Die Web-App funktioniert ohne Anmeldung. Spielname, eigene Vorlagen und Einstellungen werden lokal im jeweiligen Browser gespeichert.

## Online spielen

[Higher or Lower starten](https://higher-lower-spiel.henry-friesen50650.chatgpt.site)

## Features

- **Drag & Drop** — Karten per Maus oder Touch auf die Skala ziehen
- **Mehrspieler-Modus** — Beliebig viele Spieler mit Lebens-System, Nachzieh-Mechanik und Gewinner-Animation
- **Vorlagen-System** — Eingebaute und eigene Vorlagen, Import/Export als JSON
- **Spielname** — Jede Runde kann einen eigenen Namen bekommen
- **Bilder-Support** — Bild-URLs oder Datei-Upload (automatisch komprimiert)
- **6 Themes** — Dark, Midnight Blue, Twitch Purple, Dark Forest, Sunset, Hell
- **Spiellog** — Nachverfolgung aller Züge pro Runde
- **Tooltip** — Mouseover-Info auf allen Karten
- **Vollbild & Responsive** — Funktioniert auf Desktop und Mobilgeraeten

## Eingebaute Vorlagen

| Vorlage | Thema | Einheit |
|---|---|---|
| Stadionkapazitaet | Deutsche Fussballstadien | Zuschauer |
| Einwohnerzahl Staedte | Deutsche Staedte | Einwohner |
| Deutsche Twitch-Streamer | Twitch-Abonnenten | Abonnenten |
| Marktwert Fussballer | Top 25 europaeische Spieler | Mio. EUR |
| Legenden — Alter | Fussball-Legenden der letzten 30 Jahre | Jahre |

## Zusaetzliche Vorlagen (JSON-Import)

Im Repository befinden sich weitere Vorlagen als JSON-Dateien:

- `vorlage-handyspiele-downloads.json` — Top 25 Handyspiele nach Downloads
- `vorlage-hoechste-gebaeude.json` — Top 20 hoechste Gebaeude der Welt nach architektonischer Hoehe
- `vorlage-hauptstaedte-einwohner.json` — 25 Hauptstaedte nach Einwohnerzahl
- `vorlage-lebensmittel-preise.json` — 20 Lebensmittel nach Supermarkt-Preis
- `vorlage-legenden-alter.json` — 25 Fussball-Legenden nach Alter
- `vorlage-fussballer-rueckennummern.json` — Beste Fussballer nach Rueckennummer
- `vorlage-modegeschaefte-filialen.json` — Modegeschaefte nach Filialanzahl in Deutschland
- `vorlage-schnellste-tiere.json` — 25 schnellste Tiere der Welt nach km/h
- `vorlage-teuerste-transfers-deutscher-spieler.json` — Top 25 Transfers deutscher Spieler nach fester Abloesesumme

Diese koennen ueber den **Importieren**-Button im Vorlagen-Tab geladen werden.

## Spielregeln (Mehrspieler)

1. Jeder Spieler platziert pro Runde eine Karte auf der Skala
2. **Richtig platziert** — Karte bleibt, naechster Spieler ist dran
3. **Falsch platziert** — Spieler verliert ein Herz, Karte geht zurueck in den Pool
4. **Nachzieh-Mechanik** — Wenn alle Spieler einer Runde auf 0 Herzen fallen, werden die Herzen zurueckgegeben (Schutz vor totalem Knockout)
5. **Letzter Spieler** — Wer als Letztes noch Herzen hat, gewinnt

## Nutzung

Einfach `index.html` im Browser oeffnen — keine Installation, kein Build-Prozess, keine Abhaengigkeiten. Alles laeuft clientseitig im Browser.

## Tech-Stack

- Vanilla HTML/CSS/JavaScript (kein Framework)
- LocalStorage fuer gespeicherte Vorlagen
- Responsive Design mit CSS Grid/Flexbox
