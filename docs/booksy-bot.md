# Booksy Bot — dokumentacja

Autonomiczny serwis do automatycznej rezerwacji wizyt przez Booksy.com. Steruje przeglądarką Chromium przy użyciu Playwright i wystawia prosty webhook HTTP.

---

## Spis treści

- [Architektura](#architektura)
- [Konfiguracja](#konfiguracja)
- [Pierwsze uruchomienie i logowanie](#pierwsze-uruchomienie-i-logowanie)
- [API webhooka](#api-webhooka)
- [Logika automatyzacji](#logika-automatyzacji)
- [Kolejkowanie żądań](#kolejkowanie-żądań)
- [Obsługa sesji](#obsługa-sesji)
- [Wdrożenie (Docker / Railway)](#wdrożenie-docker--railway)
- [Debugowanie](#debugowanie)

---

## Architektura

```
Klient zewnętrzny
       │  POST /book { secret, businessUrl, service, date, time }
       ▼
Express Server (server.js)
       │
       ├── Walidacja secretu (WEBHOOK_SECRET)
       ├── Walidacja parametrów
       ├── Async Queue (zapobiega równoległym instancjom Playwright)
       │
       ▼
bookAppointment() (booksy.js)
       │
       ├── Wczytanie sesji (session.json lub cachedStorageState)
       ├── Uruchomienie Chromium (headless, anty-bot headers)
       ├── Nawigacja do businessUrl
       ├── Akceptacja cookies
       ├── Logowanie (jeśli sesja wygasła)
       ├── Szukanie usługi i kliknięcie "Umów"
       ├── Nawigacja kalendarza do daty
       ├── Wybór godziny
       ├── Potwierdzenie rezerwacji
       │
       └── { success: true } lub { success: false, error: "..." }
```

---

## Konfiguracja

Skopiuj `.env.example` do `.env` w katalogu `booksy-bot/`:

```bash
cd booksy-bot
cp .env.example .env
```

| Zmienna | Wymagana | Opis |
|---|---|---|
| `BOOKSY_EMAIL` | Tak | E-mail konta Booksy używanego do rezerwacji |
| `BOOKSY_PASSWORD` | Tak | Hasło konta Booksy |
| `WEBHOOK_SECRET` | Tak | Dowolny losowy ciąg — musi być identyczny w żądaniach klienta |
| `SESSION_PATH` | Nie | Ścieżka do pliku sesji Playwright. Domyślnie `session.json` obok `server.js`. Na Railway ustaw na ścieżkę wolumenu, np. `/data/session.json` |
| `PORT` | Nie | Port serwera (domyślnie `3000`) |

---

## Pierwsze uruchomienie i logowanie

Bot używa **persystentnej sesji Playwright** (plik JSON ze stanem cookies/local storage). Sesja musi być zainicjalizowana raz — przez `login-helper.js`.

### Lokalnie (dla wdrożenia produkcyjnego)

```bash
# 1. Zainstaluj zależności i przeglądarkę
cd booksy-bot
npm install
npx playwright install chromium

# 2. Uruchom helper — otwiera przeglądarkę GUI, logujesz się ręcznie
node login-helper.js https://twoja-aplikacja.railway.app twoj-webhook-secret

# Helper:
# - Otwiera Booksy.com w przeglądarce (headful)
# - Czeka, aż zamkniesz przeglądarkę po zalogowaniu się
# - Eksportuje stan sesji i wysyła go do produkcji przez POST /set-session
```

### Wymagania dla login-helper.js

- Lokalna instalacja Node.js z Playwright (lub uruchomienie na maszynie deweloperskiej)
- Aplikacja produkcyjna musi być uruchomiona i dostępna przez HTTP

### Odświeżanie sesji

Sesja Booksy wygasa po pewnym czasie (typowo kilka tygodni). Jeśli bot zacznie zwracać błędy logowania, uruchom ponownie `login-helper.js`.

---

## API webhooka

### `GET /health`

Sprawdzenie stanu serwisu.

**Odpowiedź:**
```json
{ "status": "ok" }
```

---

### `POST /book`

Wykonuje rezerwację wizyty.

**Nagłówki:**
```
Content-Type: application/json
```

**Ciało żądania:**

| Pole | Typ | Wymagane | Opis |
|---|---|---|---|
| `secret` | string | Tak | Wartość `WEBHOOK_SECRET` |
| `businessUrl` | string | Tak | Pełny URL profilu salonu na Booksy.com |
| `service` | string | Tak | Nazwa usługi (musi pasować do nazwy na stronie Booksy) |
| `date` | string | Tak | Data wizyty w formacie `YYYY-MM-DD` |
| `time` | string | Tak | Godzina wizyty w formacie `HH:MM` |
| `staff` | string | Nie | Imię pracownika (jeśli podane, filtruje wyniki) |
| `notes` | string | Nie | Notatka do wizyty |

**Przykład żądania:**
```json
{
  "secret": "moj-tajny-klucz",
  "businessUrl": "https://booksy.com/pl-pl/123456_salon_warszawa",
  "service": "Botoks — 1 okolica",
  "date": "2024-03-15",
  "time": "14:30",
  "staff": "Anna Kowalska",
  "notes": "Pierwsza wizyta"
}
```

**Odpowiedź sukcesu (200):**
```json
{ "success": true, "message": "Wizyta zarezerwowana pomyślnie" }
```

**Odpowiedź błędu (500):**
```json
{ "success": false, "error": "Nie znaleziono usługi \"Botoks — 1 okolica\"..." }
```

**Kody błędów:**

| Kod HTTP | Przyczyna |
|---|---|
| 400 | Brakujące lub nieprawidłowe parametry (`date`, `time` — zły format) |
| 401 | Nieprawidłowy `secret` |
| 500 | Błąd automatyzacji (zły URL, usługa nieznaleziona, błąd logowania, itp.) |

---

### `POST /set-session`

Aktualizuje stan sesji Playwright. Używane przez `login-helper.js`.

**Ciało żądania:**
```json
{
  "secret": "moj-tajny-klucz",
  "storageState": { "cookies": [...], "origins": [...] }
}
```

**Odpowiedź:**
```json
{ "success": true, "message": "Session saved" }
```

---

## Logika automatyzacji

Funkcja `bookAppointment()` w `booksy.js` wykonuje następujące kroki:

### 1. Uruchomienie przeglądarki

Chromium uruchamiany w trybie headless z flagami anty-bot:
- `--no-sandbox`, `--disable-setuid-sandbox` — wymagane w kontenerze Docker
- `--disable-blink-features=AutomationControlled` — ukrywa ślady automatyzacji
- Własny `userAgent` (prawdziwy Chrome 124)
- Locale `pl-PL`, strefa czasowa `Europe/Warsaw`
- `navigator.webdriver` ustawiony na `undefined` (init script)

### 2. Akceptacja cookies (`acceptCookies`)

Próbuje kliknąć przycisk akceptacji w wielu wariantach językowych (polskie i angielskie).

### 3. Zamykanie popupów (`dismissOverlays`)

Zamyka automatycznie otwierające się modale (lokalizacja, promo, itp.) przez ESC i kliknięcie przycisków zamknięcia.

### 4. Logowanie (`login`)

Jeśli sesja jest nieważna, wypełnia formularz email+hasło. Po zalogowaniu zapisuje nowy stan sesji do pliku.

### 5. Wyszukiwanie usługi (`clickUmow`)

Trójpoziomowy algorytm dopasowywania:
1. **Dokładne dopasowanie** (exact line match) — najwyższy priorytet
2. **Substring match** — nazwa usługi zawarta w tekście kontenera
3. **Fuzzy match** — wszystkie słowa z nazwy usługi są obecne w kontenerze

Przed wyszukiwaniem bot:
- Przewija stronę do dołu (lazy loading Booksy)
- Rozszerza wszystkie zwinięte kategorie usług ("3 usługi", "Pokaż więcej")

### 6. Nawigacja kalendarza (`navigateWeeklyCalendar`)

Nawiguje tygodniowy kalendarz Booksy do zadanej daty, klikając strzałki nawigacji w odpowiednim kierunku. Parsuje nazwy miesięcy w języku polskim.

### 7. Wybór godziny

1. Wybiera porę dnia (`Rano` / `Popołudnie` / `Wieczór`) na podstawie godziny
2. Klika przycisk z dokładną godziną w formacie `HH:MM`

### 8. Potwierdzenie

Klika "Dalej", a następnie "Potwierdź"/"Zarezerwuj" jeśli pojawi się dodatkowy krok.

---

## Kolejkowanie żądań

Server używa prostej **async queue** opartej na łańcuchu Promise:

```js
let queue = Promise.resolve();

function enqueue(fn) {
  const result = queue.then(fn);
  queue = result.catch(() => {});
  return result;
}
```

Gwarantuje to, że w danym momencie działa tylko jedna instancja Playwright. Kolejne żądania czekają na zakończenie poprzedniego. Nie ma limitu kolejki — wszystkie żądania zostaną obsłużone.

---

## Obsługa sesji

Stan sesji (cookies, local storage) jest przechowywany w pliku JSON:

```
booksy-bot/session.json              # lokalnie
/data/session.json                   # na Railway (wolumin persystentny)
```

W pamięci trzymany jest `cachedStorageState` — odczyt z dysku następuje tylko raz (przy starcie lub po restarcie). Zapis następuje po każdym odświeżeniu logowania.

**Ważne:** na Railway, bez woluminu persystentnego, sesja zostanie utracona przy każdym restarcie kontenera.

---

## Wdrożenie (Docker / Railway)

### Dockerfile

```dockerfile
FROM node:20-slim

# Chromium dependencies
RUN apt-get update && apt-get install -y \
    chromium \
    fonts-liberation \
    libappindicator3-1 \
    libasound2 \
    libatk-bridge2.0-0 \
    # ...
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY . .
RUN npm ci
RUN npx playwright install chromium

CMD ["node", "server.js"]
```

### Railway — kroki wdrożenia

1. Utwórz nowy projekt Railway z katalogu `booksy-bot/`
2. Ustaw zmienne środowiskowe: `BOOKSY_EMAIL`, `BOOKSY_PASSWORD`, `WEBHOOK_SECRET`
3. Dodaj **Volume** z mount path `/data`
4. Ustaw `SESSION_PATH=/data/session.json`
5. Wdróż projekt
6. Uruchom `login-helper.js` lokalnie, podając URL aplikacji Railway

### Healthcheck

Railway sprawdza `GET /health` — serwis jest gotowy gdy zwraca `{ status: "ok" }`.

---

## Debugowanie

### Błąd: "Nie znaleziono usługi"

- Sprawdź dokładną nazwę usługi na stronie Booksy (kopiuj z UI)
- Nazwa musi pasować (nawet częściowo) do nazwy wyświetlanej w interfejsie
- Bot obsługuje fuzzy matching po słowach, ale nazwy muszą się pokrywać

### Błąd: "Ten biznes nie jest już dostępny"

Możliwe przyczyny:
1. Nieprawidłowy URL profilu
2. Booksy wykryło ruch automatyczny i blokuje IP (Railway)
3. Profil salonu faktycznie wyłączony

### Błąd logowania

Sesja wygasła — uruchom `login-helper.js` ponownie.

### Zrzut ekranu błędu

Przy błędzie automatyzacji bot zapisuje plik `booksy-bot/error-screenshot.png`. Na Railway jest to dostępne tylko przez `railway run cat` lub volume mount.

### Logi

```bash
# Railway CLI
railway logs

# Lokalnie
node server.js
# Wszystkie etapy logowane z prefiksem [booksy]
```
