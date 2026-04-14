# API Reference — SEO Dashboard

Wszystkie endpointy są montowane pod ścieżką `/seo`. Aplikacja używa sesji HTTP (ciasteczko `connect.sid`).

**Base URL:** `http://localhost:3000/seo` (lokalnie) lub `https://twoja-aplikacja.railway.app/seo` (produkcja)

---

## Spis treści

- [Uwierzytelnianie](#uwierzytelnianie)
- [Endpointy Auth](#endpointy-auth)
- [Endpointy danych (wszyscy zalogowani)](#endpointy-danych-wszyscy-zalogowani)
- [Endpointy administracyjne](#endpointy-administracyjne)
- [Parametry okresu](#parametry-okresu)
- [Kody błędów](#kody-błędów)

---

## Uwierzytelnianie

Wszystkie endpointy (oprócz `/api/login` i `/api/firstrun`) wymagają aktywnej sesji. Sesja jest tworzona przez `POST /api/login` i przechowywana w ciasteczku.

- **Czas życia sesji:** 8 godzin
- **Ciasteczko:** `httpOnly`, `secure` (tylko w produkcji z HTTPS)

---

## Endpointy Auth

### `POST /api/login`

Loguje użytkownika i tworzy sesję.

**Ciało żądania:**
```json
{ "username": "admin", "password": "haslo123" }
```

**Odpowiedź sukcesu (200):**
```json
{ "username": "admin", "role": "admin" }
```

**Odpowiedź błędu (400 / 401):**
```json
{ "error": "Nieprawidłowy login lub hasło" }
```

---

### `POST /api/logout`

Niszczy aktualną sesję.

**Odpowiedź (200):**
```json
{ "ok": true }
```

---

### `GET /api/me`

Zwraca dane zalogowanego użytkownika.

**Odpowiedź sukcesu (200):**
```json
{ "username": "admin", "role": "admin", "email": "admin@gabinet.pl" }
```

**Odpowiedź (401) — brak sesji:**
```json
{ "error": "Nie zalogowano" }
```

---

### `GET /api/firstrun`

Sprawdza czy to pierwsze uruchomienie (brak zmiany hasła admina).

**Odpowiedź (200):**
```json
{ "firstRun": true }
```

---

## Endpointy danych (wszyscy zalogowani)

Wymagają aktywnej sesji (dowolna rola: `admin` lub `viewer`).

### Parametry okresu

Wszystkie endpointy danych przyjmują opcjonalne parametry query string:

| Parametr | Typ | Domyślna | Opis |
|---|---|---|---|
| `days` | integer | `28` | Liczba dni (1–365). Ignorowany jeśli podano `from`/`to` |
| `from` | string | — | Data początkowa `YYYY-MM-DD` |
| `to` | string | — | Data końcowa `YYYY-MM-DD` |

**Przykłady:**
```
GET /api/keywords              # ostatnie 28 dni
GET /api/keywords?days=90      # ostatnie 90 dni
GET /api/keywords?from=2024-01-01&to=2024-03-31  # konkretny zakres
```

---

### `GET /api/keywords`

Pozycje, kliknięcia i CTR śledzonych słów kluczowych z Google Search Console.

**Odpowiedź (200):**
```json
{
  "keywords": [
    {
      "keyword": "botoks warszawa",
      "position": 4.2,
      "positionPrev": 5.1,
      "delta": -0.9,
      "clicks": 48,
      "clicksPrev": 35,
      "impressions": 1200,
      "ctr": 4.0,
      "trend": "up"
    }
  ],
  "currQuarter": "ostatnie 28 dni (2024-02-15 – 2024-03-14)",
  "prevQuarter": "poprzednie 28 dni (2024-01-18 – 2024-02-14)"
}
```

**Pola słowa kluczowego:**

| Pole | Typ | Opis |
|---|---|---|
| `keyword` | string | Fraza kluczowa |
| `position` | number\|null | Średnia pozycja w bieżącym okresie (1 decimal) |
| `positionPrev` | number\|null | Średnia pozycja w poprzednim okresie |
| `delta` | number\|null | Zmiana pozycji (`position - positionPrev`, ujemna = poprawa) |
| `clicks` | integer | Kliknięcia w bieżącym okresie |
| `clicksPrev` | integer | Kliknięcia w poprzednim okresie |
| `impressions` | integer | Wyświetlenia w bieżącym okresie |
| `ctr` | number | CTR w % (1 decimal) |
| `trend` | `"up"\|"down"\|"stable"` | Trend (`up` = poprawa, `down` = pogorszenie) |

---

### `GET /api/traffic`

Sesje organiczne z Google Analytics 4.

**Odpowiedź (200):**
```json
{
  "current": { "sessions": 1250, "users": 980, "newUsers": 620 },
  "previous": { "sessions": 1100, "users": 850, "newUsers": 530 },
  "sessionsDelta": 13,
  "usersDelta": 15,
  "newUsersDelta": 17,
  "weeklyTrend": [
    { "week": "202401", "sessions": 280 },
    { "week": "202402", "sessions": 310 }
  ],
  "currQuarter": "ostatnie 28 dni (2024-02-15 – 2024-03-14)",
  "prevQuarter": "poprzednie 28 dni (2024-01-18 – 2024-02-14)"
}
```

**Pola:**

| Pole | Typ | Opis |
|---|---|---|
| `current` | object | Bieżący okres: sesje, użytkownicy, nowi użytkownicy |
| `previous` | object | Poprzedni okres (taka sama długość) |
| `sessionsDelta` | integer\|null | Zmiana % sesji |
| `usersDelta` | integer\|null | Zmiana % użytkowników |
| `newUsersDelta` | integer\|null | Zmiana % nowych użytkowników |
| `weeklyTrend` | array | Ostatnie 12 tygodni sesji organicznych |

---

### `GET /api/pages`

Top 10 stron z Google Search Console.

**Odpowiedź (200):**
```json
{
  "pages": [
    {
      "url": "https://gabinet.pl/botoks",
      "clicks": 120,
      "impressions": 3500,
      "ctr": 3.4,
      "position": 3.2
    }
  ],
  "quarter": "ostatnie 28 dni (2024-02-15 – 2024-03-14)"
}
```

---

### `GET /api/devices`

Podział ruchu według urządzeń (GSC).

**Odpowiedź (200):**
```json
{
  "devices": [
    { "device": "MOBILE", "clicks": 380, "impressions": 9500 },
    { "device": "DESKTOP", "clicks": 140, "impressions": 3200 },
    { "device": "TABLET", "clicks": 20, "impressions": 450 }
  ]
}
```

---

### `GET /api/chart`

Tygodniowa agregacja kliknięć i wyświetleń (GSC).

**Odpowiedź (200):**
```json
{
  "weeks": [
    { "date": "2024-01-07", "clicks": 95, "impressions": 2800 },
    { "date": "2024-01-14", "clicks": 110, "impressions": 3100 }
  ]
}
```

---

### `GET /api/spend`

Miesięczny budżet kampanii SEO z szacunkową wartością organiczną.

**Odpowiedź (200):**
```json
{
  "entries": [
    {
      "month": "2024-03",
      "spendPln": 3000,
      "note": "Kampania marzec",
      "organicValue": null,
      "avgCpc": 8.5
    }
  ],
  "avgCpc": 8.5
}
```

Pole `organicValue` jest obliczane po stronie klienta (frontend) na podstawie danych o ruchu.

---

### `GET /api/supplier`

Dane dostawcy/agencji SEO per miesiąc.

**Odpowiedź (200):**
```json
{
  "entries": [
    {
      "month": "2024-03",
      "publishedArticles": 4,
      "backlinks": 12,
      "technicalFixes": 3,
      "note": "Dobre wyniki w marcu"
    }
  ]
}
```

---

### `GET /api/goals`

Ewaluacja celów SEO (wymaga pobrania świeżych danych z Google API).

**Odpowiedź (200):**
```json
{
  "goals": [
    {
      "id": "lz3k2abc",
      "type": "keyword_position",
      "params": { "keyword": "botoks warszawa", "maxPosition": 5 },
      "priority": "high",
      "note": "Główna fraza",
      "desc": "Fraza \"botoks warszawa\" na pozycji ≤ 5",
      "unit": "",
      "lowerIsBetter": true,
      "current": 4.2,
      "target": 5,
      "status": "ok",
      "progress": 100,
      "createdAt": "2024-01-01T12:00:00.000Z"
    }
  ]
}
```

**Pola ewaluacji:**

| Pole | Typ | Opis |
|---|---|---|
| `desc` | string | Czytelny opis celu |
| `unit` | string | Jednostka miary (np. `"%"`, `"sesji"`, `""`) |
| `lowerIsBetter` | boolean | Czy niższa wartość jest lepsza (np. pozycja) |
| `current` | number\|null | Aktualna wartość metryki |
| `target` | number\|null | Wartość docelowa |
| `status` | `"ok"\|"warn"\|"fail"\|"unknown"` | Status realizacji |
| `progress` | integer | Procent realizacji celu (0–100) |

---

### `GET /api/public/config`

Publiczna konfiguracja (dostępna dla wszystkich zalogowanych).

**Odpowiedź (200):**
```json
{ "agencyEmail": "agencja@seo.pl" }
```

---

## Endpointy administracyjne

Wymagają sesji z rolą `admin`.

---

### `GET /api/admin/users`

Lista wszystkich użytkowników.

**Odpowiedź (200):**
```json
[
  {
    "username": "admin",
    "role": "admin",
    "email": "admin@gabinet.pl",
    "createdAt": "2024-01-01T12:00:00.000Z"
  }
]
```

---

### `POST /api/admin/users`

Tworzy nowego użytkownika.

**Ciało żądania:**
```json
{
  "username": "kasia",
  "password": "bezpieczneHaslo123",
  "role": "viewer",
  "email": "kasia@gabinet.pl"
}
```

**Wymagane pola:** `username`, `password`, `role` (`admin` lub `viewer`)

**Odpowiedź (200):**
```json
{ "ok": true }
```

**Odpowiedź błędu (400):**
```json
{ "error": "User already exists" }
```

---

### `PUT /api/admin/users/:username`

Aktualizuje użytkownika (hasło, rola, e-mail).

**Ciało żądania (wszystkie pola opcjonalne):**
```json
{
  "password": "noweHaslo456",
  "role": "admin",
  "email": "nowy@gabinet.pl"
}
```

**Odpowiedź (200):**
```json
{ "ok": true }
```

---

### `DELETE /api/admin/users/:username`

Usuwa użytkownika. Nie można usunąć własnego konta.

**Odpowiedź (200):**
```json
{ "ok": true }
```

**Odpowiedź błędu (400):**
```json
{ "error": "Nie możesz usunąć własnego konta" }
```

---

### `GET /api/admin/config`

Pobiera pełną konfigurację SEO.

**Odpowiedź (200):**
```json
{
  "gscProperty": "sc-domain:gabinet.pl",
  "ga4PropertyId": "properties/123456789",
  "trackedKeywords": ["botoks warszawa", "wolumetria warszawa"],
  "avgCpcPln": 8.5,
  "agencyEmail": "agencja@seo.pl",
  "updatedAt": "2024-03-01T10:00:00.000Z"
}
```

---

### `POST /api/admin/config`

Aktualizuje konfigurację SEO. Automatycznie czyści cache.

**Ciało żądania (wszystkie pola opcjonalne):**
```json
{
  "gscProperty": "sc-domain:gabinet.pl",
  "ga4PropertyId": "properties/123456789",
  "trackedKeywords": ["botoks warszawa", "wolumetria warszawa"],
  "avgCpcPln": 8.5,
  "agencyEmail": "agencja@seo.pl"
}
```

**Odpowiedź (200):**
```json
{ "ok": true }
```

---

### `POST /api/admin/spend`

Dodaje lub aktualizuje wpis budżetu za dany miesiąc.

**Ciało żądania:**
```json
{
  "month": "2024-03",
  "spendPln": 3000,
  "note": "Kampania marzec"
}
```

**Wymagane:** `month` (format `YYYY-MM`), `spendPln`

**Odpowiedź (200):**
```json
{ "ok": true }
```

---

### `PUT /api/admin/supplier/:month`

Aktualizuje dane dostawcy za dany miesiąc.

**Parametr URL:** `:month` — format `YYYY-MM`

**Ciało żądania** (dowolne pola):
```json
{
  "publishedArticles": 4,
  "backlinks": 12,
  "technicalFixes": 3,
  "note": "Dobre wyniki"
}
```

**Odpowiedź (200):**
```json
{ "ok": true }
```

---

### `POST /api/admin/cache/clear`

Czyści cały cache Google API.

**Odpowiedź (200):**
```json
{ "ok": true, "message": "Cache wyczyszczony" }
```

---

### `GET /api/admin/goal-types`

Zwraca definicje dostępnych typów celów (dla formularza admin).

**Odpowiedź (200):**
```json
{
  "types": [
    {
      "key": "keyword_position",
      "label": "Pozycja konkretnej frazy",
      "hint": "Np. „botoks warszawa" ma być na pozycji ≤ 5",
      "fields": [
        { "key": "keyword", "label": "Fraza kluczowa", "type": "keyword-select" },
        { "key": "maxPosition", "label": "Maksymalna pozycja (≤)", "type": "number", "min": 1, "max": 100, "placeholder": "10" }
      ],
      "suggestions": [
        { "values": { "maxPosition": 10 }, "label": "Pierwsza strona", "desc": "Pozycje 1–10..." }
      ]
    }
  ]
}
```

---

### `POST /api/admin/goals`

Tworzy nowy cel SEO.

**Ciało żądania:**
```json
{
  "type": "keyword_position",
  "params": { "keyword": "botoks warszawa", "maxPosition": 5 },
  "priority": "high",
  "note": "Główna fraza kliniki"
}
```

**Pola `priority`:** `low`, `medium`, `high`

**Odpowiedź (200):**
```json
{ "ok": true, "id": "lz3k2abc" }
```

**Odpowiedź błędu (400):**
```json
{ "error": "Nieznany typ celu" }
```

---

### `PUT /api/admin/goals/:id`

Aktualizuje istniejący cel.

**Ciało żądania (wszystkie pola opcjonalne):**
```json
{
  "params": { "keyword": "botoks warszawa", "maxPosition": 3 },
  "priority": "high",
  "note": "Zaktualizowany cel"
}
```

**Odpowiedź (200):**
```json
{ "ok": true }
```

**Odpowiedź błędu (404):**
```json
{ "error": "Cel nie istnieje" }
```

---

### `DELETE /api/admin/goals/:id`

Usuwa cel SEO.

**Odpowiedź (200):**
```json
{ "ok": true }
```

---

## Kody błędów

| Kod | Znaczenie |
|---|---|
| 400 | Złe żądanie — brakujące lub nieprawidłowe parametry |
| 401 | Brak autoryzacji — wymagane logowanie |
| 403 | Brak uprawnień — wymagana rola `admin` |
| 404 | Zasób nie istnieje |
| 500 | Błąd serwera — sprawdź logi (problem z Google API, błąd danych) |

Wszystkie błędy zwracają JSON:
```json
{ "error": "Opis błędu po polsku" }
```
