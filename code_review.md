# Code Review — gabinet-seo

---

## 2026-04-15

### Zakres przeglądu
- `npm audit` (root + booksy-bot)
- Skan hardcoded credentials i tokenów
- Martwy kod i duplikacje logiki
- Spójność kodu z dokumentacją (brak plików `project*.md` w repo — punkt pominięty)

---

### Znalezione problemy

#### KRYTYCZNE / HIGH (bezpieczeństwo)

| # | Plik | Linia | Problem |
|---|------|-------|---------|
| S1 | `gabinet-diagnoza.html` | 215–217 | **Hardcoded JSONBin Master Key** — plik serwowany publicznie przez GitHub Pages; każdy kto zobaczy source code może odczytać `JSONBIN_MASTER_KEY` i mieć pełny dostęp read/write do bina. Eksponowane też `JSONBIN_BIN_ID`. |
| S2 | `gabinet-diagnoza.html` | 214 | **SHA-256 bez soli** — `PASSWORD_HASH` to czysty SHA-256 bez soli; podatny na rainbow tables i brute-force GPU. |
| S3 | `seo/data.js` | 28 | **Słabe domyślne hasło admina** — `DEFAULT_ADMIN_PASSWORD = 'admin123'` jest publicznie znane w kodzie źródłowym. |
| S4 | `seo/router.js` | 14–16 | **Fallback session secret** — gdy `SESSION_SECRET` nie jest ustawiony, aplikacja używa `'seo-secret-change-in-production'` — klucz publiczny, pozwala na fałszowanie ciasteczek sesji. |
| S5 | `package.json` | — | **npm audit: 3x HIGH** — `bcrypt@5.1.1` → `node-tar ≤7.5.10` (path traversal przy instalacji). Naprawić: `npm install bcrypt@6` (breaking change — wymaga weryfikacji). |

#### JAKOŚĆ KODU

| # | Plik | Linia | Problem |
|---|------|-------|---------|
| Q1 | `seo/auth.js` | 2–3 | **Duplikat importu** — `require('./data')` importowany dwa razy: raz z destrukturizacją (`{ findUser, ... }`), raz jako `dataModule` — używany tylko do `dataModule.findUser()`, czyli tej samej funkcji. |
| Q2 | `seo/router.js` | 92–93 | **Martwy kod** — `trafficCache = cache.get('ga4-traffic')` przypisany, ale nigdy nieużywany; `organicValue` hardcoded na `null`. |

#### BRAK DOKUMENTACJI

- Brak plików `project*.md` w repozytorium — nie można sprawdzić spójności kodu z dokumentacją. Zalecane stworzenie `project-architecture.md` opisującego moduły seo/, booksy-bot/ i gabinet-diagnoza.html.

---

### Co naprawiono (tego dnia)

#### Branch `security/hardcoded-credentials-and-weak-secrets`

- **`gabinet-diagnoza.html`** — dodano blok komentarzy przy `CONFIG` wyjaśniający ryzyko eksponowania `JSONBIN_MASTER_KEY` w publicznym pliku HTML; instrukcja jak wygenerować read-only `X-Access-Key` i zrotować klucz. *(S1, S2 — komentarz; klucze wymagają ręcznej rotacji przez właściciela konta JSONBin)*
- **`seo/data.js`** — dodano komentarz `// SECURITY:` przy `DEFAULT_ADMIN_PASSWORD` z instrukcją zmiany po pierwszym logowaniu. *(S3 — komentarz)*
- **`seo/router.js`** — dodano komentarz `// SECURITY:` przy fallback session secret informujący o ryzyku i nakazujący ustawienie `SESSION_SECRET` na Railway. *(S4 — komentarz)*

> S5 (bcrypt@6) — **nie naprawiono automatycznie** — npm flaguje jako breaking change; wymaga weryfikacji API i ręcznego `npm install bcrypt@6` + testu.

#### Branch `quality/dead-code-cleanup`

- **`seo/auth.js`** — usunięto duplikat `const dataModule = require('./data')`; w `me()` użyto już zaimportowanej `findUser`. *(Q1)*
- **`seo/router.js`** — usunięto przypisanie `const trafficCache = cache.get('ga4-traffic')` wraz z przestarzałym komentarzem. *(Q2)*

---

### Rekomendacje (wymagają akcji właściciela)

1. **Rotacja `JSONBIN_MASTER_KEY`** — wygeneruj nowy klucz na jsonbin.io, wygeneruj read-only `X-Access-Key`, zaktualizuj `gabinet-diagnoza.html` przez `node setup.js`.
2. **Ustawienie `SESSION_SECRET`** na Railway — minimum 32 losowe znaki.
3. **Zmiana hasła admina** — zaloguj się jako `admin` / `admin123` i zmień hasło natychmiast w `/seo/admin`.
4. **Upgrade `bcrypt@6`** — przetestuj lokalnie `npm install bcrypt@6`, zweryfikuj brak błędów, deploy.
5. **Rozważyć `.gitignore` dla `gabinet-diagnoza.html`** lub przenieść auth do backendu (SEO dashboard już to robi poprawnie).
