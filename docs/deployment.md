# Deployment — przewodnik wdrożenia

Projekt jest przygotowany do wdrożenia na platformie [Railway](https://railway.app). Główna aplikacja i Booksy Bot są wdrażane jako **oddzielne serwisy**.

---

## Spis treści

- [Architektura wdrożenia](#architektura-wdrożenia)
- [Wymagania wstępne](#wymagania-wstępne)
- [Wdrożenie głównej aplikacji (SEO Dashboard)](#wdrożenie-głównej-aplikacji-seo-dashboard)
- [Wdrożenie Booksy Bot](#wdrożenie-booksy-bot)
- [Zmienne środowiskowe — kompletna lista](#zmienne-środowiskowe--kompletna-lista)
- [Persystencja danych](#persystencja-danych)
- [Konfiguracja domeny i SSL](#konfiguracja-domeny-i-ssl)
- [Aktualizacja aplikacji](#aktualizacja-aplikacji)
- [Monitoring i logi](#monitoring-i-logi)
- [Rozwiązywanie problemów](#rozwiązywanie-problemów)

---

## Architektura wdrożenia

```
GitHub Repository
       │
       ├── main branch → Railway: SEO Dashboard (główna aplikacja)
       │                     Port: $PORT (Railway auto)
       │                     URL: https://gabinet-seo.railway.app
       │
       └── booksy-bot/ → Railway: Booksy Bot (osobna usługa)
                             Dockerfile: booksy-bot/Dockerfile
                             Port: $PORT (Railway auto)
                             URL: https://booksy-bot.railway.app
```

---

## Wymagania wstępne

1. Konto [Railway](https://railway.app)
2. Konto [GitHub](https://github.com) z repozytorium projektu
3. Projekt Google Cloud z włączonymi API (patrz [docs/seo-dashboard.md](seo-dashboard.md#integracja-z-google))
4. Konto [JSONBin.io](https://jsonbin.io) (dla narzędzia diagnostycznego — opcjonalne)

---

## Wdrożenie głównej aplikacji (SEO Dashboard)

### Krok 1: Utwórz projekt Railway

1. Wejdź na [railway.app](https://railway.app) → **New Project**
2. Wybierz **Deploy from GitHub repo**
3. Wybierz repozytorium `gabinet-seo`
4. Railway wykryje `package.json` i użyje `npm start`

### Krok 2: Ustaw zmienne środowiskowe

W Railway Dashboard → serwis → **Variables**:

```
SESSION_SECRET=<losowy-ciag-min-32-znaki>
GOOGLE_SERVICE_ACCOUNT_JSON=<json-lub-base64>
GSC_PROPERTY=sc-domain:gabinet.pl
GA4_PROPERTY_ID=properties/123456789
NODE_ENV=production
```

**Generowanie SESSION_SECRET:**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**Kodowanie klucza Google jako base64 (opcjonalne):**
```bash
cat google-service-account.json | base64 -w 0
```

### Krok 3: Wdróż

Railway automatycznie uruchomi deploy po połączeniu z repozytorium. Każdy push do brancha `main` wyzwoli nowy deploy.

### Krok 4: Weryfikacja

```bash
# Sprawdź czy aplikacja działa
curl https://twoja-aplikacja.railway.app/seo/

# Sprawdź API
curl https://twoja-aplikacja.railway.app/seo/api/firstrun
```

---

## Wdrożenie Booksy Bot

Bot wymaga Dockera (Chromium ma specyficzne zależności systemowe).

### Krok 1: Utwórz oddzielny projekt Railway

1. Railway → **New Project** → **Deploy from GitHub repo**
2. Wybierz to samo repozytorium
3. Zmień **Root Directory** na `booksy-bot` (Settings → Source → Root Directory)
4. Railway wykryje `railway.toml` i użyje `Dockerfile`

### Krok 2: Zmienne środowiskowe bota

```
BOOKSY_EMAIL=twoj@email.pl
BOOKSY_PASSWORD=haslodoBooksy
WEBHOOK_SECRET=<losowy-sekret-do-webhooka>
SESSION_PATH=/data/session.json
```

### Krok 3: Wolumin persystentny (krytyczne!)

Bez woluminu sesja Playwright zostanie utracona przy każdym restarcie.

1. Railway Dashboard → serwis Booksy Bot
2. **Volumes** → **Add Volume**
3. Mount Path: `/data`

### Krok 4: Inicjalizacja sesji

Po wdrożeniu kontenera musisz zalogować się do Booksy raz:

```bash
# Na lokalnej maszynie (potrzebny Node.js + Playwright)
cd booksy-bot
npm install
npx playwright install chromium

# Uruchom helper — przeglądarka otworzy się lokalnie
node login-helper.js https://twoj-booksy-bot.railway.app twoj-webhook-secret
```

### Krok 5: Weryfikacja

```bash
curl https://twoj-booksy-bot.railway.app/health
# { "status": "ok" }
```

---

## Zmienne środowiskowe — kompletna lista

### SEO Dashboard

| Zmienna | Przykład | Opis |
|---|---|---|
| `SESSION_SECRET` | `a3f9e1...` | Min. 32 losowych znaków |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | `{"type":"service_account"...}` | JSON lub base64 |
| `GSC_PROPERTY` | `sc-domain:gabinet.pl` | Właściwość GSC |
| `GA4_PROPERTY_ID` | `properties/123456789` | ID właściwości GA4 |
| `NODE_ENV` | `production` | Włącza `secure` cookies |
| `PORT` | — | Ustawiany automatycznie przez Railway |

**Format GSC_PROPERTY:**
- Dla właściwości domenowej: `sc-domain:przykład.pl`
- Dla właściwości URL: `https://www.przykład.pl/` (ze slashem na końcu)

**Format GA4_PROPERTY_ID:**
- Zawsze `properties/` + numer, np. `properties/123456789`
- Numer znajdziesz w GA4 → Admin → Informacje o właściwości

### Booksy Bot

| Zmienna | Przykład | Opis |
|---|---|---|
| `BOOKSY_EMAIL` | `konto@email.pl` | E-mail konta Booksy |
| `BOOKSY_PASSWORD` | `haslo` | Hasło konta Booksy |
| `WEBHOOK_SECRET` | `tajny-klucz-123` | Sekret autoryzacji webhooka |
| `SESSION_PATH` | `/data/session.json` | Ścieżka do pliku sesji Playwright |
| `PORT` | — | Ustawiany automatycznie przez Railway |

---

## Persystencja danych

### SEO Dashboard

Railway nie gwarantuje persystencji plików po restarcie (ephemeral filesystem). Dla danych produkcyjnych:

**Opcja A: Railway Volume (zalecana)**

1. Railway Dashboard → SEO Dashboard → **Volumes** → **Add Volume**
2. Mount Path: `/app/data`
3. Pliki `users.json`, `seo-config.json`, `spend.json`, `goals.json` będą persystentne

**Opcja B: Zewnętrzna baza danych**

Projekt używa prostych plików JSON — można zrefaktorować `data.js` do obsługi PostgreSQL lub innej bazy.

### Booksy Bot

Wymaga woluminu dla `session.json` (patrz wyżej: Mount Path `/data`).

---

## Konfiguracja domeny i SSL

Railway automatycznie generuje domenę `*.railway.app` z ważnym certyfikatem SSL.

**Własna domena:**
1. Railway Dashboard → serwis → **Settings** → **Domains** → **Add Domain**
2. Dodaj rekord CNAME w panelu DNS swojej domeny:
   ```
   CNAME www twoja-aplikacja.railway.app
   ```
3. Railway automatycznie wyda certyfikat Let's Encrypt

**Ważne:** Po skonfigurowaniu własnej domeny z HTTPS ustaw `NODE_ENV=production` — włącza `secure: true` dla ciasteczka sesji.

---

## Aktualizacja aplikacji

### Automatyczna (CI/CD)

Każdy push do `main` wyzwala automatyczny deploy na Railway. Zero downtime: Railway uruchamia nową instancję, czeka na healthcheck, a dopiero potem kieruje ruch.

### Ręczna

```bash
# Railway CLI
npm install -g @railway/cli
railway login
railway up
```

---

## Monitoring i logi

### Logi aplikacji

```bash
# Railway CLI
railway logs

# Lub w Railway Dashboard → serwis → Logs
```

### Healthcheck

Railway sprawdza żywotność serwisu przez cykliczne zapytania HTTP. Domyślnie Railway monitoruje port `$PORT`.

Dla Booksy Bot — healthcheck skonfigurowany w `railway.toml`:
```toml
[deploy]
healthcheckPath = "/health"
healthcheckTimeout = 300
restartPolicyType = "ON_FAILURE"
restartPolicyMaxRetries = 3
```

---

## Rozwiązywanie problemów

### Aplikacja nie startuje

1. Sprawdź logi: `railway logs`
2. Zweryfikuj zmienne środowiskowe — zwłaszcza `GOOGLE_SERVICE_ACCOUNT_JSON`
3. Sprawdź czy `data/` katalog istnieje i ma uprawnienia zapisu

### Błąd 500 przy danych Google

```json
{ "error": "Google nie skonfigurowane", "keywords": [] }
```

Przyczyny:
- Brak lub nieprawidłowy `GOOGLE_SERVICE_ACCOUNT_JSON`
- Konto usługi nie ma dostępu do właściwości GSC/GA4
- Nieprawidłowy format `GSC_PROPERTY` lub `GA4_PROPERTY_ID`

### Sesja wygasa zbyt szybko

Domyślny czas sesji to 8 godzin. Edytuj w `seo/router.js`:
```js
maxAge: 8 * 60 * 60 * 1000 // zmień na np. 24 * 60 * 60 * 1000 (24h)
```

### Booksy Bot — błąd "business not available"

- Sprawdź URL profilu Booksy
- Poczekaj i spróbuj ponownie (IP Railway może być tymczasowo zablokowane)
- Jeśli problem persystuje — rozważ użycie proxy lub własnego serwera

### Cache nie aktualizuje się

Odczekaj 1 godzinę (TTL cache) lub wyczyść ręcznie:
```bash
curl -X POST https://twoja-aplikacja.railway.app/seo/api/admin/cache/clear \
  -H "Cookie: connect.sid=..."
```
