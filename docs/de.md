# Somfy Protect für Gladys

Steuere deine **Somfy-Protect**-Alarmanlage aus Gladys: aktivieren und
deaktivieren, sehen, was Melder und Kameras melden, und in deinen Szenen auf
Alarme reagieren.

Somfy Protect ist ein **Cloud**-Dienst: Die Integration spricht mit den
Somfy-Servern, genau wie die Somfy-Protect-App. Eine Internetverbindung ist
nötig, Somfy bietet keinen lokalen Zugriff.

## Was du bekommst

| In Somfy Protect             | In Gladys                                                            |
| ---------------------------- | -------------------------------------------------------------------- |
| Jeder Standort (Alarmanlage) | Ein Gerät „Somfy Protect _Standort_“: Sicherheitsstufe + Alarm aktiv |
| Bewegungsmelder              | Bewegung (30 s lang 1 bei jeder Erkennung), Batterie, Temperatur     |
| IntelliTag                   | Erkennung (30 s lang 1), Batterie, Temperatur                        |
| Schlüsselanhänger            | Anwesenheit (1 = zu Hause), Batterie                                 |
| Rauchmelder                  | Rauch, Batterie                                                      |
| Innenkamera, Somfy One       | Kamerabild, Schalter „Kamera aktiv“ (Sichtschutz)                    |
| Türschloss                   | Schloss (1 = verriegelt)                                             |
| Video-Türklingel             | Klingeln                                                             |
| Sirene, Link, Repeater       | Batterie, Temperatur, Sabotage, wenn das Gerät sie meldet            |

Die Sicherheitsstufe ist eine Liste mit drei Werten, die Gladys auf Englisch
anzeigt: **Disarmed** (deaktiviert), **Partial** (teilweise) und **Armed**
(aktiviert). Eine Änderung in Gladys ändert sie in Somfy Protect.

Jedes Gerät trägt ein **Cloud**-Abzeichen. Es wechselt zu **Nicht
erreichbar**, wenn die Somfy-Cloud nicht antwortet oder der Link den Kontakt
zum Gerät verloren hat. Das Abzeichen des Standorts bekommt einen orangen
Punkt, wenn die Echtzeit-Ereignisse ausgefallen sind.

## Einrichtung

Die Integration benötigt **Gladys 5.3.0 oder neuer**.

1. Öffne in Gladys **Integrationen**, suche **Somfy Protect** und installiere
   sie.
2. Gib auf der Seite **Konfiguration** die **E-Mail** und das **Passwort**
   deines Somfy-Protect-Kontos ein und speichere.
3. Drücke **Verbindung testen**: Deine Standorte und Geräte werden angezeigt.
4. Öffne den Reiter **Erkennung** und lege die gewünschten Geräte an.

> Tipp: Lege in der Somfy-Protect-App (Einstellungen, Benutzer) einen eigenen
> Benutzer für Gladys an. Dein eigenes Konto bleibt privat, und du kannst
> diesen Benutzer jederzeit entfernen.

### Einstellungen

| Einstellung                     | Standard | Wirkung                                                                                  |
| ------------------------------- | -------- | ---------------------------------------------------------------------------------------- |
| Aktualisierungsintervall (s)    | 120      | Wie oft Batterien, Temperaturen und Zustände gelesen werden (60 bis 3600)                |
| Echtzeit-Ereignisse             | an       | Alarme, Stufenwechsel und Erkennungen kommen in einer Sekunde an. Für die Auslöser nötig |
| Intervall der Kamerabilder (s)  | 0        | Sendet alle N Sekunden ein Kamerabild. 0 = nur auf Anfrage                               |
| Detaillierte Protokolle (Debug) | aus      | Protokolliert jede Anfrage und jedes Ereignis, zur Fehlersuche                           |

## Szenen

### Auslöser

- **Somfy-Protect-Alarm ausgelöst**: Einbruchs-, Panik- oder Feueralarm.
  Filter auf Standort und Art. Variablen: Name des Standorts, Art, Name des
  auslösenden Geräts.
- **Somfy-Protect-Alarm beendet**: Der Alarm hat aufgehört.
- **Somfy-Protect-Sicherheitsstufe geändert**: Filter auf die neue Stufe.

Die Gerätezustände (Bewegung, Anwesenheit, Rauch, Sicherheitsstufe...)
funktionieren auch mit dem Standard-Auslöser **Gerätezustand**.

### Aktionen

- **Somfy-Protect-Sicherheitsstufe setzen**
- **Somfy-Protect-Alarm stoppen**
- **Sichtschutz einer Kamera öffnen oder schließen**
- **Somfy-Protect-Kamerabild aufnehmen**: Setze sie vor die Aktion
  **Kamerabild senden**, um ein aktuelles Bild zu erhalten.

Beispiel: „Wenn der Alarm ausgelöst wird, ein Bild der Wohnzimmerkamera
aufnehmen und mir senden“.

## Dashboard-Widget

Füge das Widget **Somfy-Protect-Alarmanlage** zu einem Dashboard hinzu. Es
zeigt die Sicherheitsstufe, den Alarm, nicht erreichbare Geräte und schwache
Batterien sowie Schaltflächen zum Aktivieren des Standorts.

Die Schaltflächen **Deaktivieren** und **Alarm stoppen** erscheinen nur, wenn
die Widget-Einstellung **Deaktivieren erlauben** angehakt ist. Lass sie auf
einem für alle zugänglichen Dashboard aus (z. B. ein Tablet im Flur). Jede
Schaltfläche fragt nach einer Bestätigung.

## Fehlerbehebung

- **„Somfy Protect hat das Konto abgelehnt“**: Prüfe zuerst E-Mail und Passwort
  in der Somfy-Protect-App.
- **„Somfy Protect begrenzt die Anfragen“**: Somfy sperrt Konten, die sich zu
  oft anmelden. Warte die angezeigten Sekunden ab, die Integration versucht es
  selbst erneut. Speichere die Konfiguration nicht mehrmals hintereinander.
- **Keine Echtzeit-Ereignisse**: Prüfe, ob der Container
  `websocket.myfox.io` auf Port 443 erreicht. Die Zustände werden trotzdem im
  gewählten Intervall aktualisiert.
- **Kein Kamerabild**: Der Sichtschutz der Kamera ist geschlossen oder die
  Kamera ist offline.
- Schalte **Detaillierte Protokolle** ein, reproduziere das Problem und lies
  die Protokolle der Integration. Passwörter und Tokens stehen nie darin.

## Datenschutz und Sicherheit

- Dein Passwort wird nur an Somfy gesendet. Gladys speichert es als Geheimnis.
- Die Integration bewahrt ein Somfy-Refresh-Token in ihrem privaten
  `/data`-Volume auf, damit ein Neustart keine neue Anmeldung auslöst.
- Diese Integration wird von Somfy weder entwickelt noch unterstützt. Sie nutzt
  dieselben Server wie die Somfy-Protect-App.
