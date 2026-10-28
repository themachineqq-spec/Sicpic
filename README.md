# Sicpic

Sicpic ist eine private Foto-App für eine feste Gruppe. Jede Person lädt Bilder in den eigenen Ordner hoch. Die Gruppe sieht alle Aufnahmen in einer Chronik, neueste zuerst. Es gibt keine öffentlichen Bild-Links.

Die Oberfläche ist Deutsch. Auf dem Handy lässt sich Sicpic als App auf den Home-Bildschirm legen.

## Was die App kann

- **Mein Ordner:** eigene Fotos hochladen, ansehen und löschen. Mehrere Dateien auf einmal, mit Fortschritt.
- **Gruppe:** alle Fotos aller Mitglieder, sortiert nach Aufnahmedatum. Pro Tag und Monat gruppiert. Antippen öffnet die große Ansicht und zeigt, wer hochgeladen hat.
- **Formate:** JPEG, PNG, HEIC/HEIF. Das Original bleibt erhalten. Der Browser erzeugt beim Upload eine JPEG-Anzeigeversion und eine kleine Vorschau, damit HEIC überall sichtbar ist. Dafür ist keine Bildverarbeitung auf dem Server nötig.
- **Datum:** `DateTimeOriginal` aus den EXIF-Daten. Fehlt es, gilt das Uploaddatum. Fehlt die Zeitzone im EXIF, wird Europe/Berlin angenommen.
- **Große Sammlungen:** die Chronik lädt seitenweise und zeigt nur Vorschaubilder. Originale werden nie alle auf einmal geladen.
- **Rückmeldung:** Fehler oder Wunsch, optional mit Screenshot. Admins filtern nach Art und Status und setzen den Status auf neu, in Arbeit oder erledigt.
- **Mitglieder:** nur eingeladene E-Mail-Adressen können sich anmelden. Admins pflegen die Liste. Die erste Admin-Person kommt aus `INITIAL_ADMIN_EMAIL`.

## Sicherheit

- Anmeldung nur mit Google, über Supabase Auth.
- Wer nicht auf der Allowlist steht, wird nach dem Login sofort abgemeldet.
- Postgres-Tabellen haben Row Level Security. Anonyme Zugriffe sind entzogen.
- Der R2-Bucket ist privat. Der Browser lädt Dateien mit kurzlebigen signierten PUT-URLs direkt hoch. Ausgeliefert wird nur über signierte GET-URLs (wenige Minuten), und nur nachdem der Server Sitzung und Mitgliedschaft geprüft hat.
- Schlüssel erzeugt der Server. Sie liegen immer unter `members/<mitglied>/…` oder `feedback/<mitglied>/…`.
- Keine Geheimnisse im Repository. Vorlage: `.env.example`.

## Lokal starten

```bash
npm install
cp .env.example .env.local
# Werte eintragen, dann:
npm run dev
```

Prüfen:

```bash
npm test
npm run lint
npm run typecheck
```

Die App wird nicht von diesem Repository aus deployed. Deployment macht Vercel, sobald das Projekt dort verbunden ist.

## Einrichtung für den Betrieb

Lege diese Konten und Schlüssel selbst an. Nichts davon gehört ins Git.

1. Supabase-Projekt
2. Google-Cloud-OAuth-Client (die Client-Daten kommen in Supabase, nicht in Vercel)
3. Cloudflare-R2-Bucket und API-Token
4. Vercel-Projekt mit den Umgebungsvariablen
5. Die Google-Adresse in `INITIAL_ADMIN_EMAIL` (kein extra Konto)

### 1. Supabase-Projekt

1. Auf [supabase.com](https://supabase.com) ein Projekt im Free-Tarif anlegen.
2. Unter **Project Settings → API** notieren:
   - Project URL → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon` `public` Key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` Key → `SUPABASE_SERVICE_ROLE_KEY` (nur Server, nie im Client)
3. Unter **SQL Editor** den Inhalt von `supabase/migrations/20261028120000_init.sql` ausführen. Die Datei legt Tabellen, RLS-Policies und Hilfsfunktionen an.
4. Unter **Authentication → Providers** E-Mail/Passwort und alle anderen Provider auslassen. Nur **Google** aktivieren.
5. Unter **Authentication → URL Configuration**:
   - Site URL: `https://<dein-vercel-projekt>.vercel.app` (lokal zusätzlich `http://localhost:3000` testen, indem du die Site URL zeitweise umstellst oder beide Redirect-URLs einträgst)
   - Redirect URLs:
     - `http://localhost:3000/auth/callback`
     - `https://<dein-vercel-projekt>.vercel.app/auth/callback`

### 2. Google-Anmeldung

1. In der [Google Cloud Console](https://console.cloud.google.com/) ein Projekt anlegen.
2. **APIs & Services → OAuth consent screen** konfigurieren. Für eine private Gruppe reicht der Testmodus: dort jede Google-Adresse als Testnutzer eintragen, die sich anmelden soll. Solange die App nicht verifiziert und veröffentlicht ist, kommen nur Testnutzer durch Google durch. Die Sicpic-Allowlist ist eine zweite, eigene Schranke.
3. **Credentials → Create credentials → OAuth client ID → Web application.**
4. Authorized redirect URI, exakt so:

   `https://<project-ref>.supabase.co/auth/v1/callback`

5. Client ID und Client Secret in Supabase unter **Authentication → Providers → Google** eintragen. Diese beiden Werte kommen nicht in `.env`.

### 3. Cloudflare R2

1. Im Cloudflare-Dashboard **R2** öffnen und einen Bucket anlegen, zum Beispiel `sicpic`.
2. Öffentlichen Zugriff aus lassen. Keine Custom Domain für öffentliche Reads, keine `r2.dev`-Freigabe.
3. Unter **R2 → Manage R2 API Tokens** einen Token mit **Object Read & Write** nur für diesen Bucket erzeugen.
   - Access Key ID → `R2_ACCESS_KEY_ID`
   - Secret Access Key → `R2_SECRET_ACCESS_KEY`
   - Account ID → `R2_ACCOUNT_ID`
4. Bucket-Name → `R2_BUCKET_NAME`.
5. CORS des Buckets setzen, sonst blockiert der Browser den direkten Upload. Ersetze die Origins durch deine echten Adressen:

```json
[
  {
    "AllowedOrigins": ["http://localhost:3000", "https://dein-projekt.vercel.app"],
    "AllowedMethods": ["GET", "PUT", "HEAD"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

`<img>`-Vorschauen brauchen dafür kein CORS. Der PUT aus dem Browser schon.

### 4. Vercel

1. Das GitHub-Repository mit einem neuen Vercel-Projekt verbinden. Framework: Next.js. Nichts weiter einstellen.
2. Unter **Settings → Environment Variables** alle Variablen aus `.env.example` eintragen, für Production und Preview. `NEXT_PUBLIC_*` muss beim Build gesetzt sein.
3. `NEXT_PUBLIC_APP_URL` ist die echte HTTPS-Adresse, ohne Slash am Ende.
4. `INITIAL_ADMIN_EMAIL` ist die Google-Adresse der ersten Admin-Person, klein geschrieben.
5. Deploy auslösen. Dieses Repository deployed selbst nichts.

### 5. Erste Person und weitere Mitglieder

1. Mit der Adresse aus `INITIAL_ADMIN_EMAIL` über **Mit Google anmelden** einloggen. Die App legt den Admin-Eintrag an, solange es noch keinen Admin gibt.
2. Unter **Verwaltung → Mitglieder** weitere Google-Adressen eintragen. Die Adresse muss exakt die des Google-Kontos sein.
3. Diese Personen melden sich an. Wer nicht auf der Liste steht, sieht „Nicht eingeladen“.

Fotos löschen kann nur, wer sie hochgeladen hat, und nur im eigenen Ordner. Ein Admin kann ein Mitglied entfernen; dabei werden dessen Fotos im Bucket mitgelöscht. Die letzte Admin-Person bleibt geschützt.

### 6. Auf den Home-Bildschirm

Die App muss über HTTPS laufen (Vercel). Lokal ist das Installieren unzuverlässig.

**iPhone**

1. In Safari öffnen und anmelden.
2. Teilen-Button, dann **Zum Home-Bildschirm**.
3. Sicpic öffnet sich danach ohne Browserleiste.

**Android**

1. In Chrome öffnen und anmelden.
2. Menü, dann **App installieren** oder **Zum Startbildschirm hinzufügen**.

Der Service Worker speichert nur das App-Gerüst und die Icons, keine Fotos und keine API-Antworten. Bild-URLs sind nur wenige Minuten gültig.

## Hinweise zum Betrieb

- Viele hundert Gigabyte passen, weil die Bytes in R2 liegen und Postgres nur Metadaten hält. Die Chronik holt jeweils 24 Vorschaubilder.
- HEIC wird auf dem Handy umgewandelt. Das kann bei großen Dateien einen Moment dauern. Schlägt die Umwandlung fehl, bleibt der Rest der Auswahl unberührt.
- Signierte URLs leben standardmäßig fünf Minuten (`PRESIGN_EXPIRES_SECONDS`, erlaubt 60 bis 600). Eine abgelaufene Vorschau wird beim Fehler neu angefordert.
- Die Gruppenansicht ist neueste Aufnahme zuerst. Innerhalb eines Tages ebenfalls. Gleiche Zeitpunkte werden stabil über die ID sortiert.
- Kostenrahmen der genannten Tarife: Supabase Free, Cloudflare R2 Free-Kontingent, Vercel Hobby. R2-Speicher über dem Freikontingent berechnet Cloudflare.

## Skripte

| Befehl | Zweck |
| --- | --- |
| `npm run dev` | Entwicklungsserver |
| `npm test` | Tests für EXIF-Sortierung, Rechte und signierte URLs |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript |
| `npm run build` | Produktionsbuild |
| `npm run icons` | PWA-Icons neu zeichnen |
