# Code Review Log

---

## 2026-04-14 — Nocny code review (automatyczny)

### Zakres przeglądu
- Katalogi: `/` (root), `seo/`, `booksy-bot/`, `public/seo/`
- Pliki: wszystkie `.js`, `.html`, `.json` z wyłączeniem `node_modules`
- Narzędzia: `npm audit` (root + booksy-bot), grep po wzorcach credentials, analiza statyczna

### Znalezione problemy

#### [SECURITY — KRYTYCZNY] Credentials hardcoded w `gabinet-diagnoza.html`

| Pole | Wartość | Ryzyko |
|------|---------|--------|
| `JSONBIN_MASTER_KEY` | `$2a$10$DKf…` (live) | Pełny dostęp do konta JSONBin — odczyt i zapis danych przez każdego |
| `JSONBIN_BIN_ID` | `69d29d7a…` (live) | Znany ID bina — umożliwia bezpośredni dostęp |
| `PASSWORD_HASH` | SHA-256 (bez soli) | Podatny na ataki słownikowe i rainbow-table |

**Architektura** (zamierzona, patrz `setup.js`): plik jest przeznaczony do GitHub Pages — auth jest client-side. Jednak obecność `JSONBIN_MASTER_KEY` (zamiast read-only `JSONBIN_ACCESS_KEY`) daje każdemu czytelnikowi źródła pełne uprawnienia zapisu. `setup.js` próbuje wygenerować klucz read-only (`createAccessKey`), ale gdy API go nie zwróci (plan free), wstrzykuje master key — **trzeba rotować klucz JSONBin**.

**Działanie naprawcze:** Dodano komentarz ostrzegawczy w kodzie. **Klucz musi być ręcznie zrotowany** w panelu JSONBin.io → Settings → API Keys.

#### [SECURITY — WYSOKI] Twardy fallback dla `SESSION_SECRET` w `seo/router.js:15`

```js
secret: process.env.SESSION_SECRET || 'seo-secret-change-in-production',
```

Jeśli `SESSION_SECRET` nie jest ustawione, sesje można sfałszować znając publiczny kod źródłowy.

**Naprawione:** Dodano `console.warn` przy starcie serwera gdy env var brakuje.

#### [SECURITY — WYSOKI] npm audit — bcrypt 5.0.1-5.1.1 (HIGH, CVSS 8.2)

CVE via `tar` transitive dependency:
- GHSA-34x7-hfp2-rc4v — Arbitrary File Creation via Hardlink Path Traversal
- GHSA-8qq5-rm4j-mr97 — Arbitrary File Overwrite via Symlink Poisoning
- GHSA-83g3-92jg-28cx — Arbitrary File Read/Write via Hardlink
- GHSA-qffp-2rhf-9h96 — Hardlink Path Traversal via Drive-Relative Linkpath
- GHSA-9ppj-qmqm-q256 — Symlink Path Traversal via Drive-Relative Linkpath
- GHSA-r6q2-hw4h-h46w — Race Condition in Path Reservations (CVSS 8.8)

**Naprawione:** Zaktualizowano `bcrypt ^5.1.1` → `^6.0.0` w `package.json`.

#### [SECURITY — ŚREDNI] Domyślne hasło admina `admin123` w `seo/data.js:28`

Jeśli `users.json` nie istnieje, system tworzy konto admin z hasłem `admin123`. Wyciek kodu = wyciek hasła dostępowego przed pierwszym logowaniem.

**Działanie:** Dodano `console.warn` przy inicjalizacji. Hasła nie zmieniono (logika biznesowa).

---

#### [JAKOŚĆ — MARTWY KOD] Nieużywana zmienna `trafficCache` w `seo/router.js:94`

```js
const trafficCache = cache.get('ga4-traffic'); // nigdy nie używana dalej
```

**Naprawione:** Zmienna usunięta.

#### [JAKOŚĆ — BUG] Błędna kolejność sprawdzeń w `PUT /api/admin/users/:username` (`seo/router.js`)

Przed poprawką: `changePassword()` wywoływane przed sprawdzeniem czy użytkownik istnieje → przy nieistniejącym użytkowniku błąd 400 zamiast 404, a przy race condition możliwy niespójny stan.

**Naprawione:** Sprawdzenie istnienia użytkownika przeniesione na początek handlera.

#### [JAKOŚĆ — NIESPÓJNOŚĆ] Pole `organicSessions` vs `organicValue` (seo/router.js vs app.js)

API wysyła `organicValue: null` (komentarz: "calculated on frontend"), frontend odczytuje `e.organicSessions` — pole nigdy nie istnieje, więc kolumna ROI zawsze pokazuje "brak danych GA". Obliczanie wartości organicznej nie zostało zaimplementowane po stronie frontendu.

**Działanie:** Dodano komentarz TODO w kodzie. Nie naprawiono — wymaga decyzji projektowej o źródle danych `organicSessions`.

---

### Co naprawiono

| Plik | Zmiana | Gałąź PR |
|------|--------|----------|
| `package.json` | `bcrypt ^5.1.1` → `^6.0.0` | security/2026-04-14-review |
| `seo/router.js` | Ostrzeżenie przy brakującym `SESSION_SECRET` | security/2026-04-14-review |
| `gabinet-diagnoza.html` | Komentarz o ekspozycji `JSONBIN_MASTER_KEY` | security/2026-04-14-review |
| `seo/data.js` | `console.warn` przy domyślnym haśle admin | security/2026-04-14-review |
| `seo/router.js` | Usunięcie martwej zmiennej `trafficCache` | quality/2026-04-14-review |
| `seo/router.js` | Kolejność sprawdzeń w PUT users/:username | quality/2026-04-14-review |
| `seo/router.js` | Komentarz TODO o `organicSessions` | quality/2026-04-14-review |

### Co wymaga ręcznej akcji

1. **Rotacja klucza JSONBin** — `JSONBIN_MASTER_KEY` w `gabinet-diagnoza.html` jest live i publiczny. Wejdź na JSONBin.io → Settings → API Keys → Delete + Create.
2. **Ustawienie `SESSION_SECRET`** w zmiennych Railway (jeśli nie ustawione).
3. **Zmiana hasła `admin123`** po pierwszym logowaniu do SEO Dashboard.

