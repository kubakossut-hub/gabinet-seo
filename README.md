# Gabinet SEO

Platforma analityczna i narzędziowa dla gabinetów medycyny estetycznej w Polsce. Projekt składa się z trzech niezależnych modułów:

| Moduł | Opis |
|---|---|
| **SEO Dashboard** | Panel analityczny oparty na Google Search Console i Google Analytics 4 |
| **Booksy Bot** | Automat do rezerwacji wizyt przez Booksy.com (Playwright) |
| **Narzędzie Diagnostyczne** | Standalone checklist diagnostyczny (HTML + JSONBin.io) |

---

## Spis treści

- [Wymagania](#wymagania)
- [Szybki start](#szybki-start)
- [Zmienne środowiskowe](#zmienne-środowiskowe)
- [Struktura projektu](#struktura-projektu)
- [Moduły](#moduły)
- [Uruchamianie testów](#uruchamianie-testów)
- [Wdrożenie](#wdrożenie)
- [Dokumentacja szczegółowa](#dokumentacja-szczegółowa)

---

## Wymagania

- **Node.js** >= 18 (wymagane dla wbudowanego runnera testów `node:test`)
- **npm** >= 9
- Konto Google Cloud z włączonym Search Console API i Google Analytics Data API
- Konto Railway (lub inny hosting) dla wdrożenia produkcyjnego

---

## Szybki start

```bash
# 1. Sklonuj repozytorium
git clone https://github.com/kubakossut-hub/gabinet-seo.git
cd gabinet-seo

# 2. Zainstaluj zależności głównej aplikacji
npm install

# 3. Skonfiguruj zmienne środowiskowe
cp .env.example .env
# Uzupełnij wartości w pliku .env (patrz sekcja niżej)

# 4. Uruchom serwer
npm start
# Serwer startuje na http://localhost:3000
```

Po pierwszym uruchomieniu:
- Plik `data/users.json` zostaje automatycznie utworzony z domyślnym kontem `admin` / `admin123`.
- Zaloguj się pod adresem `http://localhost:3000/seo/login` i **natychmiast zmień hasło** w panelu Admin.

---

## Zmienne środowiskowe

Skopiuj `.env.example` do `.env` i wypełnij wartości.

### Główna aplikacja (`/.env`)

| Zmienna | Wymagana | Opis |
|---|---|---|
| `SESSION_SECRET` | Tak | Losowy ciąg znaków dla podpisywania sesji Express |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Tak | JSON konta usługi Google Cloud (jako string JSON lub base64) |
| `GSC_PROPERTY` | Tak | Właściwość GSC, np. `sc-domain:example.pl` lub `https://example.pl/` |
| `GA4_PROPERTY_ID` | Tak | ID właściwości GA4, np. `properties/123456789` |
| `NODE_ENV` | Nie | `production` włącza bezpieczne ciasteczka (HTTPS only) |
| `PORT` | Nie | Port serwera (domyślnie `3000`) |

### Booksy Bot (`/booksy-bot/.env`)

| Zmienna | Wymagana | Opis |
|---|---|---|
| `BOOKSY_EMAIL` | Tak | E-mail konta Booksy |
| `BOOKSY_PASSWORD` | Tak | Hasło konta Booksy |
| `WEBHOOK_SECRET` | Tak | Sekret do autoryzacji żądań webhooka |
| `SESSION_PATH` | Nie | Ścieżka do pliku sesji Playwright (domyślnie `session.json`) |
| `PORT` | Nie | Port serwera bota (domyślnie `3000`) |

---

## Struktura projektu

```
gabinet-seo/
├── server.js                   # Główny punkt wejścia aplikacji Express
├── setup.js                    # Skrypt konfiguracyjny narzędzia diagnostycznego
├── package.json                # Zależności i skrypty
├── .env.example                # Wzorzec zmiennych środowiskowych
├── gabinet-diagnoza.html       # Standalone narzędzie diagnostyczne
│
├── seo/                        # Backend panelu SEO
│   ├── router.js               # Trasy Express i endpointy API
│   ├── auth.js                 # Uwierzytelnianie i middleware sesji
│   ├── data.js                 # Warstwa persystencji danych (JSON)
│   ├── cache.js                # Cache plikowy z TTL
│   ├── google.js               # Integracje Google Search Console i GA4
│   └── goals.js                # Definicje i ewaluacja celów SEO
│
├── public/seo/                 # Frontend panelu SEO (vanilla JS)
│   ├── login.html              # Strona logowania
│   ├── dashboard.html          # Główny dashboard analityczny
│   ├── admin.html              # Panel administratora
│   ├── app.js                  # Logika aplikacji frontendowej
│   └── style.css               # Style (ciemny motyw)
│
├── booksy-bot/                 # Moduł automatycznych rezerwacji
│   ├── server.js               # Serwer Express bota (webhooki)
│   ├── booksy.js               # Logika automatyzacji Playwright
│   ├── login-helper.js         # Pomocnik logowania (tryb lokalny)
│   ├── package.json            # Zależności bota
│   ├── Dockerfile              # Obraz Docker z Chromium
│   └── railway.toml            # Konfiguracja wdrożenia Railway
│
├── data/                       # Persystencja danych (gitignored częściowo)
│   ├── seo-config.json         # Konfiguracja SEO (generowana)
│   ├── users.json              # Użytkownicy (generowany przy starcie)
│   ├── goals.json              # Cele SEO (generowany)
│   ├── spend.json              # Budżet kampanii (generowany)
│   └── cache/                 # Pliki cache Google API (TTL 1h)
│
├── docs/                       # Dokumentacja szczegółowa
│   ├── seo-dashboard.md        # Panel SEO — architektura i użytkowanie
│   ├── booksy-bot.md           # Booksy Bot — konfiguracja i wdrożenie
│   ├── diagnostic-tool.md      # Narzędzie diagnostyczne — setup i użycie
│   ├── api.md                  # Pełna dokumentacja API REST
│   └── deployment.md           # Przewodnik wdrożenia (Railway)
│
└── tests/                      # Testy jednostkowe
    ├── goals.test.js           # Testy logiki ewaluacji celów
    ├── cache.test.js           # Testy modułu cache
    └── data.test.js            # Testy warstwy danych
```

---

## Moduły

### SEO Dashboard

Panel dostępny pod `/seo`. Integruje się z Google Search Console (pozycje, CTR, wyświetlenia) i Google Analytics 4 (sesje organiczne, użytkownicy). Szczegóły: [`docs/seo-dashboard.md`](docs/seo-dashboard.md).

**Domyślne konto po pierwszym starcie:**
- Login: `admin`
- Hasło: `admin123` — zmień natychmiast po zalogowaniu!

### Booksy Bot

Oddzielnie wdrażany serwis (katalog `booksy-bot/`). Nasłuchuje na webhooki i automatyzuje rezerwacje przez Booksy.com przy użyciu przeglądarki Chromium sterowanej Playwright. Szczegóły: [`docs/booksy-bot.md`](docs/booksy-bot.md).

### Narzędzie Diagnostyczne

Plik `gabinet-diagnoza.html` — samowystarczalna aplikacja frontendowa dostępna pod `/`. Wymaga jednorazowego setupu przez `node setup.js`. Szczegóły: [`docs/diagnostic-tool.md`](docs/diagnostic-tool.md).

---

## Uruchamianie testów

```bash
npm test
```

Testy używają wbudowanego runnera `node:test` (Node.js >= 18) — brak zewnętrznych zależności testowych.

Pokrycie testów:
- `tests/goals.test.js` — ewaluacja wszystkich 6 typów celów SEO
- `tests/cache.test.js` — zapis, odczyt i wygasanie cache
- `tests/data.test.js` — operacje CRUD na użytkownikach, konfiguracji, budżecie, celach

---

## Wdrożenie

Projekt jest przygotowany do wdrożenia na platformie [Railway](https://railway.app).

```bash
# Główna aplikacja
# Ustaw zmienne środowiskowe w Railway Dashboard i wdróż przez GitHub

# Booksy Bot (oddzielna usługa)
cd booksy-bot
# Wdróż jako osobny projekt Railway z Dockerfile
```

Pełny przewodnik: [`docs/deployment.md`](docs/deployment.md).

---

## Dokumentacja szczegółowa

| Dokument | Zawartość |
|---|---|
| [`docs/seo-dashboard.md`](docs/seo-dashboard.md) | Architektura, role, cele, integracja Google |
| [`docs/booksy-bot.md`](docs/booksy-bot.md) | Konfiguracja, sesje Playwright, webhooki |
| [`docs/diagnostic-tool.md`](docs/diagnostic-tool.md) | Setup, JSONBin, struktura danych |
| [`docs/api.md`](docs/api.md) | Pełna dokumentacja REST API |
| [`docs/deployment.md`](docs/deployment.md) | Railway, zmienne, wolumeny, SSL |

---

## Licencja

Projekt prywatny — wszelkie prawa zastrzeżone.
