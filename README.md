# Higher or Lower

Ein interaktives Quiz-Spiel, bei dem Spieler Karten nach einem Wert (z.B. Marktwert, Alter, Geschwindigkeit) auf einer Skala von niedrig nach hoch einordnen müssen.

Die Web-App funktioniert ohne Anmeldung. Spielname, eigene Vorlagen und Einstellungen werden lokal im jeweiligen Browser gespeichert.

## Online spielen

[Higher or Lower starten](https://higher-lower.fiesefriese.workers.dev)

## Online-Duell (2 Handys)

Unter [/duell](https://higher-lower.fiesefriese.workers.dev/duell) spielen zwei Personen auf zwei Geraeten gegeneinander:

1. Spieler 1 waehlt ein Thema und erstellt ein Duell, er bekommt einen 4-stelligen Code bzw. einen Einladungslink.
2. Spieler 2 oeffnet den Link oder gibt den Code ein.
3. Abwechselnd bekommt jeder eine Karte und tippt auf die Luecke in der Skala, wo sie hingehoert. Falsch = ein Herz weniger, die Karte geht zurueck in den Stapel. Sind beide in einer Runde bei 0 Herzen, gibt es fuer beide eines zurueck (wie im Hauptspiel). Wer zuletzt noch Herzen hat, gewinnt; sind alle Karten gelegt, entscheiden die Herzen.

Die Seite laesst sich auf dem iPhone ueber Teilen → „Zum Home-Bildschirm“ als App installieren. Der Spielstand liegt auf dem Server (Cloudflare Durable Object pro Code, `worker.js`), Kartenwerte werden erst nach dem Legen an die Geraete geschickt. Laeuft ein Duell 48 Stunden nicht, wird es geloescht. Bei Verbindungsabbruch verbindet sich die App selbst neu; nach einem Neustart geht es ueber „Weiterspielen“ weiter.

Mitteilungen: In der installierten App kann man ueber die Glocke oben (oder im Warteraum) Mitteilungen einschalten. Man bekommt dann eine iPhone-Mitteilung, wenn man dran ist, der Gegner beigetreten ist, das Spiel endet oder eine Revanche startet, aber nur, wenn die App gerade nicht offen ist. Technisch: Web-Push mit Service Worker (`sw.js`), Verschluesselung und VAPID-Signatur in `push.js` (ohne Fremdbibliothek, geprueft gegen den Testvektor aus RFC 8291). Der private VAPID-Schluessel liegt als Cloudflare-Secret `VAPID_PRIVATE_JWK`, lokal in `.dev.vars` (nicht im Git).

Lokal testen: `npm run dev` (Wrangler mit Durable Objects, http://127.0.0.1:8787/duell).

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
| Staedte der Welt | 25 bekannte Staedte weltweit, mit Foto des Wahrzeichens | Einwohner |
| Allgemeinwissen | 5 Vorlagen, siehe unten | – |

### Allgemeinwissen (eingebaut, mit Bildern und Quelle)

Die Quelle wird im Spiel unter dem Thema bzw. im Duell unter der Skala angezeigt.

| Vorlage | Inhalt | Einheit | Quelle |
|---|---|---|---|
| Planeten & Monde | 16 Himmelskoerper nach Durchmesser | km | [NASA NSSDC Planetary Fact Sheets](https://nssdc.gsfc.nasa.gov/planetary/factsheet/) (Sonne: 2 x mittlerer Radius) |
| Laender nach Flaeche | 23 Laender, Gesamtflaeche inkl. Binnengewaesser | km² | [Wikipedia: List of countries and dependencies by area](https://en.wikipedia.org/wiki/List_of_countries_and_dependencies_by_area) (UN-Statistikabteilung, USA: US Census) |
| Laengste Fluesse | 20 Flusssysteme | km | [Wikipedia: List of river systems by length](https://en.wikipedia.org/wiki/List_of_river_systems_by_length) |
| Berge der Welt | 21 bekannte Berge | m | Deutsche Wikipedia, Hoehenangaben der einzelnen Bergartikel (gerundet) |
| Bundeslaender | 16 Bundeslaender nach Einwohnern | Einwohner | [Statistische Aemter des Bundes und der Laender](https://www.statistikportal.de/de/bevoelkerung/flaeche-und-bevoelkerung), Bevoelkerungsstand 2025, Basis Zensus 2022 |

Bilder: Flaggen und Wappen von Wikimedia Commons, sonst das Titelbild des jeweiligen Wikipedia-Artikels.

## Zusaetzliche Vorlagen (JSON-Import)

Im Repository befinden sich weitere Vorlagen als JSON-Dateien:

- `vorlage-handyspiele-downloads.json` — Top 25 Handyspiele nach Downloads
- `vorlage-hoechste-gebaeude.json` — Top 20 hoechste Gebaeude der Welt nach architektonischer Hoehe
- `vorlage-hauptstaedte-einwohner.json` — 25 Hauptstaedte nach Einwohnerzahl
- `vorlage-staedte-welt-einwohner.json` — 25 bekannte Staedte weltweit nach Einwohnerzahl, mit Foto des Wahrzeichens (auch eingebaut)
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

Einfach `index.html` im Browser oeffnen — keine Installation, kein Build-Prozess, keine Abhaengigkeiten. Das klassische Spiel laeuft komplett clientseitig im Browser; nur das Online-Duell braucht den Worker.

## Tech-Stack

- Vanilla HTML/CSS/JavaScript (kein Framework), eingebaute Vorlagen in `templates.js`
- Online-Duell: Cloudflare Worker + Durable Object (`worker.js`), WebSocket
- LocalStorage fuer gespeicherte Vorlagen
- Responsive Design mit CSS Grid/Flexbox
