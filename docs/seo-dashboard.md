# SEO Dashboard — dokumentacja

Panel analityczny do monitorowania widoczności organicznej gabinetu medycyny estetycznej w Google. Integruje Google Search Console (GSC) i Google Analytics 4 (GA4) z systemem śledzenia celów i budżetu.

---

## Spis treści

- [Architektura](#architektura)
- [Role i uprawnienia](#role-i-uprawnienia)
- [Pierwsze uruchomienie](#pierwsze-uruchomienie)
- [Moduły backendowe](#moduły-backendowe)
- [Frontend](#frontend)
- [Integracja z Google](#integracja-z-google)
- [System celów](#system-celów)
- [Cache](#cache)
- [Bezpieczeństwo](#bezpieczeństwo)

---

## Architektura

```
Przeglądarka
    │
    ▼
Express Router (/seo/*)
    │
    ├── Middleware sesji (express-session, 8h TTL)
    ├── Middleware uwierzytelniania (auth.js)
    │
    ├── Strony statyczne (login.html, dashboard.html, admin.html)
    │
    └── REST API
            │
            ├── auth.js       → Logowanie, wylogowanie, weryfikacja sesji
            ├── data.js       → Persystencja JSON (users, config, goals, spend)
            ├── cache.js      → Cache plikowy z TTL 1h
            └── google.js     → GSC + GA4 API (z cache)
```

Dane są przechowywane w plikach JSON w katalogu `data/`. Brak zewnętrznej bazy danych.

---

## Role i uprawnienia

| Funkcja | `viewer` | `admin` |
|---|---|---|
| Podgląd dashboardu | Tak | Tak |
| Podgląd celów SEO | Tak | Tak |
| Zarządzanie użytkownikami | Nie | Tak |
| Konfiguracja GSC/GA4 | Nie | Tak |
| Zarządzanie celami | Nie | Tak |
| Wpisywanie budżetu | Nie | Tak |
| Czyszczenie cache | Nie | Tak |

---

## Pierwsze uruchomienie

Przy pierwszym starcie serwera (`npm start`) moduł `data.js` automatycznie tworzy plik `data/users.json` z domyślnym administratorem:

- **Login:** `admin`
- **Hasło:** `admin123`

Po zalogowaniu (flaga `firstRun: true`) system ustawia flagę na `false`. **Zmień hasło natychmiast** przez panel Admin → Użytkownicy.

```
http://localhost:3000/seo/login     # Logowanie
http://localhost:3000/seo/dashboard # Dashboard (wymaga sesji)
http://localhost:3000/seo/admin     # Panel admin (wymaga roli admin)
```

---

## Moduły backendowe

### `seo/router.js`

Główny router Express montowany pod `/seo`. Odpowiada za:
- Konfigurację sesji (`express-session`)
- Serwowanie plików statycznych z `public/seo/`
- Rejestrację wszystkich tras stron i endpointów API

Wywołanie `parsePeriod(req)` na początku handlera każdego endpointu danych odczytuje parametry `?days=`, `?from=` i `?to=` z query string, sanityzuje je i zwraca obiekt `{ days, from, to }` przekazywany do `google.js`.

### `seo/auth.js`

Warstwa uwierzytelniania oparta na `bcrypt` i sesjach Express.

| Funkcja | Opis |
|---|---|
| `login(req, res)` | Weryfikuje login/hasło, tworzy sesję, czyści flagę `firstRun` po pierwszym logowaniu admina |
| `logout(req, res)` | Niszczy sesję |
| `me(req, res)` | Zwraca dane zalogowanego użytkownika (odczytuje świeży e-mail z pliku) |
| `requireAuth` | Middleware — przekierowuje na `/seo/login` lub zwraca 401 dla API |
| `requireAdmin` | Middleware — jak wyżej + sprawdza rolę `admin`, zwraca 403 jeśli nieuprawniony |

### `seo/data.js`

Warstwa persystencji. Wszystkie dane są przechowywane jako pliki JSON w `data/`.

| Plik | Zawartość | Domyślna wartość |
|---|---|---|
| `users.json` | Lista użytkowników + flaga `firstRun` | Tworzony automatycznie |
| `seo-config.json` | Konfiguracja GSC, GA4, słowa kluczowe | `DEFAULT_CONFIG` z `.env` |
| `spend.json` | Miesięczny budżet kampanii | `{ entries: [] }` |
| `supplier.json` | Dane dostawcy/agencji per miesiąc | `{ entries: [] }` |
| `goals.json` | Cele SEO | `{ goals: [] }` |

**Model użytkownika:**
```json
{
  "username": "admin",
  "passwordHash": "$2b$10$...",
  "role": "admin",
  "email": "kontakt@gabinet.pl",
  "createdAt": "2024-01-01T12:00:00.000Z"
}
```

**Model konfiguracji:**
```json
{
  "gscProperty": "sc-domain:gabinet.pl",
  "ga4PropertyId": "properties/123456789",
  "trackedKeywords": ["botoks warszawa", "wolumetria warszawa"],
  "avgCpcPln": 8.5,
  "agencyEmail": "agencja@seo.pl",
  "updatedAt": "2024-01-01T12:00:00.000Z"
}
```

**Model wpisu budżetu:**
```json
{ "month": "2024-01", "spendPln": 3000, "note": "Kampania styczeń" }
```

### `seo/cache.js`

Prosty cache plikowy z TTL. Pliki cache są zapisywane w `data/cache/*.json`.

| Funkcja | Opis |
|---|---|
| `get(key)` | Zwraca dane jeśli nie wygasły (TTL 3600s), inaczej `null` |
| `set(key, data, ttlSeconds?)` | Zapisuje dane z timestampem |
| `clear()` | Usuwa wszystkie pliki `.json` z `data/cache/` |

Cache jest kluczowany przez `periodKey(opts)` — np. `d28` dla ostatnich 28 dni lub `2024-01-01_2024-01-31` dla zakresu dat.

### `seo/google.js`

Integracja z Google API. Wymaga konta usługi Google Cloud z uprawnieniami:
- `https://www.googleapis.com/auth/webmasters.readonly` (GSC)
- `https://www.googleapis.com/auth/analytics.readonly` (GA4)

**Ładowanie poświadczeń** (kolejność priorytetu):
1. Zmienna środowiskowa `GOOGLE_SERVICE_ACCOUNT_JSON` jako JSON string
2. Zmienna środowiskowa `GOOGLE_SERVICE_ACCOUNT_JSON` jako base64
3. Plik lokalny `data/google-service-account.json`

**Dane GSC** (Google Search Console) uwzględniają opóźnienie ~2 dni (GSC nie aktualizuje się w czasie rzeczywistym). Wszystkie zakresy dat są przesunięte o `-2 dni`.

**Eksportowane funkcje:**

| Funkcja | Źródło danych | Opis |
|---|---|---|
| `fetchKeywords(opts)` | GSC | Śledzone słowa kluczowe: pozycja, CTR, kliknięcia, trendy |
| `fetchPages(opts)` | GSC | Top 10 stron (kliknięcia, wyświetlenia, CTR, pozycja) |
| `fetchDevices(opts)` | GSC | Podział urządzeń (desktop/mobile/tablet) |
| `fetchChart(opts)` | GSC | Agregacja tygodniowa kliknięć i wyświetleń |
| `fetchTraffic(opts)` | GA4 | Sesje organiczne: bieżące, poprzednie, delta %, trend tygodniowy |

**Parametry `opts`:**
```js
{
  days: 28,        // Liczba dni (1-365), domyślnie 28
  from: null,      // Data początkowa YYYY-MM-DD (opcjonalnie)
  to: null         // Data końcowa YYYY-MM-DD (opcjonalnie)
}
```

Gdy podane są `from` i `to`, system automatycznie oblicza równoległy poprzedni okres tej samej długości.

---

## Frontend

### `public/seo/app.js`

Aplikacja SPA (vanilla JavaScript, bez frameworka). Po załadowaniu strony:
1. Pobiera `/api/me` — weryfikuje sesję i rolę
2. Pobiera konfigurację publiczną (`/api/public/config`) — e-mail agencji
3. Ładuje dane z wybranego okresu (domyślnie 28 dni)
4. Renderuje zakładki: Frazy, Ruch, Strony, Urządzenia, Wykres, Cele, Budżet

### `public/seo/admin.html`

Panel administracyjny z sekcjami:
- **Użytkownicy** — dodawanie, edycja roli/e-maila, zmiana hasła, usuwanie
- **Konfiguracja** — właściwość GSC, ID GA4, śledzone słowa kluczowe, średni CPC, e-mail agencji
- **Cele SEO** — tworzenie, edycja, usuwanie celów z podpowiedziami

---

## Integracja z Google

### Konfiguracja konta usługi

1. Wejdź na [Google Cloud Console](https://console.cloud.google.com)
2. Utwórz projekt (lub użyj istniejącego)
3. Włącz API:
   - **Google Search Console API**
   - **Google Analytics Data API**
4. Utwórz konto usługi (Service Account)
5. Pobierz klucz JSON konta usługi
6. Dodaj adres e-mail konta usługi jako użytkownika w Google Search Console (właściwość)
7. Dodaj adres e-mail konta usługi jako widza w Google Analytics 4

### Dodawanie konta usługi do GSC

1. Otwórz [Google Search Console](https://search.google.com/search-console)
2. Wybierz właściwość → Ustawienia → Użytkownicy i uprawnienia
3. Dodaj e-mail konta usługi z uprawnieniem **Pełny**

### Zmienne środowiskowe

```bash
# Wklej cały JSON konta usługi jako jedną linię:
GOOGLE_SERVICE_ACCOUNT_JSON='{"type":"service_account","project_id":"...","private_key":"..."}'

# Lub zakoduj base64:
GOOGLE_SERVICE_ACCOUNT_JSON=$(cat klucz.json | base64 -w 0)

# Właściwość GSC:
GSC_PROPERTY=sc-domain:gabinet.pl
# lub
GSC_PROPERTY=https://www.gabinet.pl/

# ID właściwości GA4 (znajdziesz w GA4 → Admin → Dane o usłudze):
GA4_PROPERTY_ID=properties/123456789
```

---

## System celów

Cele SEO są konfigurowane przez administratora i automatycznie oceniane przez `seo/goals.js` przy każdym żądaniu do `/api/goals`.

### Typy celów

| Klucz | Opis | Pola |
|---|---|---|
| `keyword_position` | Pozycja konkretnej frazy ≤ N | `keyword`, `maxPosition` |
| `keywords_in_top_n` | Liczba fraz w Top N ≥ min | `topN`, `minCount` |
| `traffic_growth` | Wzrost ruchu organicznego ≥ X% | `minGrowthPct` |
| `min_sessions` | Minimalna liczba sesji organicznych | `minSessions` |
| `keyword_ctr` | CTR konkretnej frazy ≥ X% | `keyword`, `minCtr` |
| `min_impressions` | Minimalna liczba wyświetleń | `minImpressions` |

### Statusy oceny

| Status | Znaczenie |
|---|---|
| `ok` | Cel osiągnięty |
| `warn` | Blisko celu (80-100%) |
| `fail` | Daleko od celu (< 80%) |
| `unknown` | Brak danych do oceny |

### Model celu

```json
{
  "id": "lz3k2abc",
  "type": "keyword_position",
  "params": { "keyword": "botoks warszawa", "maxPosition": 5 },
  "priority": "high",
  "note": "Główna fraza kliniki",
  "createdAt": "2024-01-01T12:00:00.000Z"
}
```

---

## Cache

Google API jest kosztowne — każde zapytanie liczy się do limitów projektu. Cache plikowy z TTL 1 godziny minimalizuje liczbę zapytań.

| Klucz cache | Dane |
|---|---|
| `gsc-keywords-d28` | Frazy kluczowe, ostatnie 28 dni |
| `gsc-pages-d28` | Top strony, ostatnie 28 dni |
| `gsc-devices-d28` | Urządzenia, ostatnie 28 dni |
| `gsc-chart-d28` | Wykres tygodniowy, ostatnie 28 dni |
| `ga4-traffic-d28` | Ruch organiczny, ostatnie 28 dni |

Zmiana konfiguracji (endpoint `POST /api/admin/config`) automatycznie czyści cały cache. Admin może też czyścić cache ręcznie przez endpoint `POST /api/admin/cache/clear`.

---

## Bezpieczeństwo

- **Hasła** — bcrypt z 10 rundami hashowania
- **Sesje** — `httpOnly`, `secure: true` w produkcji (wymaga HTTPS / proxy)
- **Konto usługi Google** — przechowywane jako zmienna środowiskowa (nigdy w repozytorium)
- **Role** — `admin` i `viewer` — wszystkie endpointy administracyjne wymagają roli `admin`
- **CSRF** — ochrona przez losowy `SESSION_SECRET` i ciasteczka `httpOnly`
- **Proxy** — `app.set('trust proxy', 1)` dla prawidłowej obsługi za Railway/Heroku

**Pliki gitignored z wrażliwymi danymi:**
```
data/users.json
data/seo-config.json
data/spend.json
data/supplier.json
data/goals.json
data/google-service-account.json
data/cache/
```
