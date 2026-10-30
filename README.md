# Sicpic

Sicpic ist eine private Foto-App für eine feste Gruppe. Jede Person lädt Bilder in den eigenen Ordner hoch. Die Gruppe sieht alle Aufnahmen in einer Chronik, neueste zuerst. Es gibt keine öffentlichen Bild-Links.

Die Oberfläche ist Deutsch. Auf dem Handy lässt sich Sicpic als App auf den Home-Bildschirm legen.

## Was die App kann

- **Mein Ordner:** eigene Fotos hochladen, ansehen und löschen. Mehrere Dateien auf einmal, mit Fortschritt.
- **Gruppe:** alle Fotos aller Mitglieder, sortiert nach Aufnahmedatum. Pro Tag und Monat gruppiert. Antippen öffnet die große Ansicht und zeigt, wer hochgeladen hat.
- **Formate:** JPEG, PNG, HEIC/HEIF und Video (MOV, MP4, 3GP, WebM). Fotos bleiben im Original. Der Browser erzeugt beim Foto-Upload eine JPEG-Anzeigeversion und eine kleine Vorschau. Videos werden nicht auf dem Server umgewandelt. Eine Vorschau entsteht im Browser aus einem Bild des Videos, wenn der Browser den Codec abspielen kann.
- **Datum:** `DateTimeOriginal` aus den EXIF-Daten. Fehlt es, gilt das Uploaddatum. Fehlt die Zeitzone im EXIF, wird Europe/Berlin angenommen.
- **Große Sammlungen:** die Chronik lädt seitenweise (24, höchstens 48). Vorschaubilder sind WebP in 320 und 640 Pixeln, mit einem 16-Pixel-Platzhalter aus der Datenbank. Die Gruppe virtualisiert das Gitter, damit das Handy nicht zehntausende Knoten hält. Signierte Vorschau-URLs bleiben fünf Minuten gleich, die Datei selbst ist ein Jahr privat im Cache. Der Service Worker merkt sich Vorschaubilder am Objektpfad, ohne die Signatur. Wer noch alte JPEG-Vorschaubilder hat, erneuert sie im eigenen Ordner mit **Alte Vorschaubilder erneuern**. Eine Monatsleiste springt in der Chronik.
- **Rückmeldung:** Fehler oder Wunsch, optional mit Screenshot. Admins filtern nach Art und Status und setzen den Status auf neu, in Arbeit oder erledigt.
- **Mitglieder:** nur eingeladene E-Mail-Adressen können sich anmelden. Admins pflegen die Liste. Die erste Admin-Person kommt aus `INITIAL_ADMIN_EMAIL`.

## Sicherheit

- Anmeldung nur mit Google, über Supabase Auth.
- Wer nicht auf der Allowlist steht, wird nach dem Login sofort abgemeldet.
- Postgres-Tabellen haben Row Level Security. Anonyme Zugriffe sind entzogen.
- Der R2-Bucket ist privat. Der Browser lädt Dateien mit kurzlebigen signierten PUT-URLs direkt hoch. Ausgeliefert wird nur über signierte GET-URLs (wenige Minuten), und nur nachdem der Server Sitzung und Mitgliedschaft geprüft hat.
- Schlüssel erzeugt der Server. Sie liegen immer unter `members/<mitglied>/…` oder `feedback/<mitglied>/…`.
- Keine Geheimnisse im Repository. Vorlage: `.env.example`.
- Jede HTML-Antwort bekommt eine Content-Security-Policy mit einem einmaligen Nonce. `script-src` erlaubt kein `unsafe-inline`. Dadurch kann Netlify das Badge-Skript `/.netlify/scripts/hud` nicht ausführen.

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
npm run build
```

`npm test` führt die Unit-, Routen- und Komponententests mit Vitest aus und verlangt mindestens 85 Prozent Zeilen- und Zweigabdeckung für `lib`, `app/api` und `app/auth`. Jeder Test läuft isoliert, ohne gemeinsames Daten und ohne echtes Netz. Zeiten in den Tests sind fest (gefälschte Timer), damit das Karussell nicht von der Uhr abhängt.

Die Datenbanktests liegen daneben und brauchen ein lokales Postgres 16. Die Migration aus `supabase/migrations` wird darin wirklich ausgeführt. Rolle, Tabellen und Policies kommen aus dieser Datei, nicht aus einem nachgebauten Schema.

```bash
docker run --rm -e POSTGRES_USER=sicpic -e POSTGRES_PASSWORD=sicpic -e POSTGRES_DB=sicpic_test -p 5432:5432 postgres:16
DATABASE_URL=postgres://sicpic:sicpic@127.0.0.1:5432/sicpic_test npm run test:db
```

Der End-to-End-Lauf startet die gebaute App (`next start`) und spricht sie mit Playwright an. Dafür gibt es einen Test-Login, der nur gleichzeitig beide Variablen `SICPIC_E2E_AUTH=1` und `SICPIC_E2E_LOCAL=1` sieht, nur auf `localhost` oder `127.0.0.1` antwortet und sich abschaltet, sobald `NETLIFY` gesetzt ist oder `CONTEXT` `production`, `deploy-preview` oder `branch-deploy` ist. Auf Netlify lässt sich der Bypass damit nicht einschalten. Das Cookie `sicpic-e2e` muss `SICPIC_E2E_TOKEN` entsprechen.

```bash
NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co \
NEXT_PUBLIC_SUPABASE_ANON_KEY=test-anon-key \
NEXT_PUBLIC_APP_URL=http://127.0.0.1:4173 \
npm run build

SICPIC_E2E_AUTH=1 SICPIC_E2E_LOCAL=1 SICPIC_E2E_TOKEN=e2e-token \
NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co \
NEXT_PUBLIC_SUPABASE_ANON_KEY=test-anon-key \
npm run start -- -p 4173
```

In einem zweiten Terminal:

```bash
SICPIC_URL=http://127.0.0.1:4173 SICPIC_E2E_TOKEN=e2e-token npm run test:e2e
```

Dieselben drei Stufen laufen in GitHub Actions bei jedem Pull Request und bei jedem Push auf `main`: Lint, Typprüfung, Unit-Tests mit Abdeckung, Build, Postgres-Integration und der Playwright-Lauf.

Die App wird nicht von diesem Repository aus deployed. Deployment macht Netlify, sobald die Site dort verbunden ist.

## Einrichtung für den Betrieb

Lege diese Konten und Schlüssel selbst an. Nichts davon gehört ins Git.

1. Supabase-Projekt
2. Google-Cloud-OAuth-Client (die Client-Daten kommen in Supabase, nicht in Netlify)
3. Cloudflare-R2-Bucket und API-Token
4. Netlify-Site mit den Umgebungsvariablen
5. Die Google-Adresse in `INITIAL_ADMIN_EMAIL` (kein extra Konto)

### 1. Supabase-Projekt

1. Auf [supabase.com](https://supabase.com) ein Projekt im Free-Tarif anlegen.
2. Unter **Project Settings → API** notieren:
   - Project URL → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon` `public` Key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` Key → `SUPABASE_SERVICE_ROLE_KEY` (nur Server, nie im Client)
3. Unter **SQL Editor** nacheinander ausführen:
   - `supabase/migrations/20261028120000_init.sql`
   - `supabase/migrations/20261030140000_video_media.sql`
   - `supabase/migrations/20261030180000_perf_thumbs.sql`

   Die erste Datei legt Tabellen, RLS-Policies und Hilfsfunktionen an. Die zweite ergänzt Videos. Die dritte legt die kleinen WebP-Vorschaubilder, den Platzhalter und die Monatszählung an.
4. Unter **Authentication → Providers** E-Mail/Passwort und alle anderen Provider auslassen. Nur **Google** aktivieren.
5. Unter **Authentication → URL Configuration**:
   - Site URL: `https://<site>.netlify.app`
   - Redirect URLs:
     - `http://localhost:3000/auth/callback`
     - `https://<site>.netlify.app/auth/callback`

   Der Callback-Pfad der App ist `/auth/callback`. `NEXT_PUBLIC_APP_URL` muss dieselbe Origin sein, ohne Slash am Ende, weil die Anmeldung dorthin zurückleitet.

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
    "AllowedOrigins": ["http://localhost:3000", "https://<site>.netlify.app"],
    "AllowedMethods": ["GET", "PUT", "HEAD"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

`<img>`-Vorschauen brauchen dafür kein CORS. Der PUT aus dem Browser schon. Mehrteilige Video-Uploads lesen die Antwortkopfzeile `ETag`. Die steht oben schon in `ExposeHeaders`. Ohne sie bricht der Upload nach dem ersten Teil ab. Methoden bleiben GET, PUT und HEAD. Ein Teil ist ein PUT, genau wie ein Foto.

Videos dürfen bis zu 4 GB groß sein. Die App schickt sie in Teilen von 16 MB, mehrere Teile parallel, und bricht einen fehlgeschlagenen Upload wieder ab. Es gibt keine bezahlte Transcodierung. Was das Handy nicht abspielen kann, lässt sich herunterladen.

| Datei | Codec | iPhone Safari | Android Chrome | Desktop Chrome |
| --- | --- | --- | --- | --- |
| MOV | H.264 | ja | meistens | meistens |
| MOV | HEVC, auch 4K, HDR, Zeitlupe | ja | nein | nein |
| MP4 | H.264 | ja | ja | ja |
| MP4 | H.265/HEVC | ja | nur auf manchen Geräten | nein |
| 3GP | H.264 | unsicher | oft | unsicher |
| WebM | VP8/VP9 | nein | ja | ja |

Zeitlupe bleibt die gespeicherte Datei. Sicpic baut die iPhone-Zeitlupen-Schnittliste nicht nach. HDR und 4K werden nicht heruntergerechnet.

### 4. Netlify

1. Auf [netlify.com](https://www.netlify.com) im Free-Tarif eine Site aus diesem GitHub-Repository anlegen. Framework: Next.js. Die Datei `netlify.toml` setzt Build-Befehl `npm run build`, Publish-Verzeichnis `.next` und Node 22 (erfüllt Node 20+). Netlify erkennt den OpenNext-Adapter von selbst. `@netlify/plugin-nextjs` nicht zusätzlich eintragen, sonst bleiben Adapter-Updates aus.
2. Unter **Site configuration → Environment variables** alle Variablen aus `.env.example` eintragen. `NEXT_PUBLIC_*` muss beim Build gesetzt sein, weil Next sie einbettet. Dieselben Werte für Production und Deploy Previews verwenden, oder `NEXT_PUBLIC_APP_URL` pro Kontext auf die jeweilige HTTPS-Adresse setzen.
3. `NEXT_PUBLIC_APP_URL` ist die öffentliche Adresse ohne Slash am Ende, zum Beispiel `https://<site>.netlify.app`. Absolute URLs kommen nur daher, nicht aus einer Host-Variable der Plattform. Die signierten R2-Routen und `/auth/callback` laufen als Node-Serverless-Function, nicht in der Edge-Runtime. Der AWS-SDK braucht Node.
4. `INITIAL_ADMIN_EMAIL` ist die Google-Adresse der ersten Admin-Person, klein geschrieben.
5. Deploy auslösen. Dieses Repository deployed selbst nichts. In den Build-Logs sollte der OpenNext-Adapter erscheinen, ohne dass ein Plugin in `netlify.toml` steht.

### 5. Erste Person und weitere Mitglieder

1. Mit der Adresse aus `INITIAL_ADMIN_EMAIL` über **Mit Google anmelden** einloggen. Die App legt den Admin-Eintrag an, solange es noch keinen Admin gibt.
2. Unter **Verwaltung → Mitglieder** weitere Google-Adressen eintragen. Die Adresse muss exakt die des Google-Kontos sein.
3. Diese Personen melden sich an. Wer nicht auf der Liste steht, sieht „Nicht eingeladen“.

Fotos und Videos löschen kann nur, wer sie hochgeladen hat, und nur im eigenen Ordner. Ein Admin kann ein Mitglied entfernen; dabei werden dessen Dateien im Bucket mitgelöscht. Die letzte Admin-Person bleibt geschützt.

### 6. Auf den Home-Bildschirm

Die App muss über HTTPS laufen (Netlify). Lokal ist das Installieren unzuverlässig.

**iPhone**

1. In Safari öffnen und anmelden.
2. Teilen-Button, dann **Zum Home-Bildschirm**.
3. Sicpic öffnet sich danach ohne Browserleiste.

**Android**

1. In Chrome öffnen und anmelden.
2. Menü, dann **App installieren** oder **Zum Startbildschirm hinzufügen**.

Der Service Worker speichert nur das App-Gerüst und die Icons, keine Fotos und keine API-Antworten. Bild-URLs sind nur wenige Minuten gültig.

## Startseiten-Fotos

Die sechs Hintergrundbilder liegen unter `public/carousel/`. Lizenz und Fotografen: [public/carousel/CREDITS.md](public/carousel/CREDITS.md).

## Hinweise zum Betrieb

- Viele hundert Gigabyte passen, weil die Bytes in R2 liegen und Postgres nur Metadaten hält. Die Chronik holt jeweils 24 Vorschaubilder.
- HEIC wird auf dem Handy umgewandelt. Das kann bei großen Dateien einen Moment dauern. Schlägt die Umwandlung fehl, bleibt der Rest der Auswahl unberührt.
- Signierte URLs leben standardmäßig fünf Minuten (`PRESIGN_EXPIRES_SECONDS`, erlaubt 60 bis 600). Eine abgelaufene Vorschau wird beim Fehler neu angefordert.
- Die Gruppenansicht ist neueste Aufnahme zuerst. Innerhalb eines Tages ebenfalls. Gleiche Zeitpunkte werden stabil über die ID sortiert.
- Kostenrahmen der genannten Tarife: Supabase Free, Cloudflare R2 Free-Kontingent, Netlify Free. R2-Speicher über dem Freikontingent berechnet Cloudflare.

## Skripte

| Befehl | Zweck |
| --- | --- |
| `npm run dev` | Entwicklungsserver |
| `npm test` | Tests für EXIF-Sortierung, Rechte und signierte URLs |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript |
| `npm run build` | Produktionsbuild |
| `npm run icons` | PWA-Icons neu zeichnen |
