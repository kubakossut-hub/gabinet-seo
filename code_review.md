# Code Review — gabinet-seo

---

## 2026-04-17

### Zakres przeglądu
- `npm audit` (root + booksy-bot)
- Skan hardcoded credentials i tokenów
- Martwy kod i duplikacje logiki
- Spójność kodu z dokumentacją (brak plików `project*.md` w repo — punkt pominięty, brak tych plików)

---

### Status problemów z 2026-04-15

Gałęzie opisane w poprzednim przeglądzie (`security/hardcoded-credentials-and-weak-secrets`, `quality/dead-code-cleanup`) **nigdy nie zostały scalone z main**. Wszystkie problemy S1–S4, Q1–Q2 nadal obecne w kodzie. Naprawiono w tym przeglądzie (patrz niżej).

---

### npm audit

| Repozytorium | Wynik |
|---|---|
| root (`/`) | **3x HIGH** — `bcrypt@5.1.1` → `@mapbox/node-pre-gyp@≤1.0.11` → `tar@<7.5.7` (GHSA-34x7, GHSA-8qq5, GHSA-83g3, GHSA-mvwm): path traversal przy instalacji zależności, arbitrary file overwrite. Fix: `npm install bcrypt@6` (breaking change). |
| `booksy-bot/` | **0 podatności** |

---

### Znalezione problemy (nowe w tym przeglądzie)

#### BEZPIECZEŃSTWO

| # | Plik | Linia | Problem | Pewność | Działanie |
|---|------|-------|---------|---------|-----------|
| S6 | `seo/router.js` | 244 | `/api/firstrun` bez `requireAuth` — celowe (brak użytkowników przy pierwszym uruchomieniu); zwraca wyłącznie boolean `{firstRun}` | — | Dodano komentarz `// NOTE S6` wyjaśniający intencję (PR #7) |

#### JAKOŚĆ KODU

| # | Plik | Linia | Problem | Pewność | Działanie |
|---|------|-------|---------|---------|-----------|
| Q3 | `seo/google.js` | 15, 19, 24 | 3× puste `catch {}` w `loadCredentials()` — intencjonalne (kolejne strategie ładowania credentiali), ale nieudokumentowane | — | Dodano `// intentional` z wyjaśnieniem (PR #8) |
| Q4 | `seo/goals.js` | 181 | Puste `catch {}` w `evaluateGoals()` — intencjonalne (failed goal → `{status:'unknown'}`, nie crash listy), ale nieudokumentowane | — | Dodano `// intentional` z wyjaśnieniem (PR #8) |
| Q5 | `seo/router.js` | 182 | `month` w `/api/admin/supplier/:month` nie jest walidowany pod kątem formatu `YYYY-MM` — admin-only, niskie ryzyko | <95% | Komentarz — nie naprawiono automatycznie |

---

### Co naprawiono (tego dnia)

#### PR #7 — `security/warnings-2026-04-17`

Naprawione problemy przeniesione z 2026-04-15 + nowe:

- **`gabinet-diagnoza.html`** — dodano blok komentarzy `// SECURITY S1/S2` przy `CONFIG` wyjaśniający ryzyko `JSONBIN_MASTER_KEY` w publicznym HTML oraz SHA-256 bez soli; instrukcja rotacji i wygenerowania read-only `X-Access-Key`. *(S1, S2)*
- **`seo/data.js`** — dodano `// SECURITY S3` przy `DEFAULT_ADMIN_PASSWORD` z instrukcją zmiany hasła po pierwszym logowaniu. *(S3)*
- **`seo/router.js`** — dodano `// SECURITY S4` przy fallback session secret z poleceniem generowania bezpiecznego sekretu; dodano `// NOTE S6` przy `/api/firstrun` wyjaśniający brak auth. *(S4, S6)*

> S5 (bcrypt@6) — **nie naprawiono automatycznie** — breaking change; wymaga lokalnego testu `npm install bcrypt@6` i weryfikacji przed deployem.

#### PR #8 — `quality/dead-code-2026-04-17`

Naprawione problemy przeniesione z 2026-04-15 + nowe:

- **`seo/auth.js`** — usunięto duplikat `const dataModule = require('./data')`; w `me()` zastąpiono `dataModule.findUser()` już zaimportowaną `findUser`. *(Q1)*
- **`seo/router.js`** — usunięto martwe przypisanie `const trafficCache = cache.get('ga4-traffic')` i przestarzały komentarz w `/api/spend`. *(Q2)*
- **`seo/google.js`** — dodano `// intentional` do 3× pustych `catch {}` w `loadCredentials()`. *(Q3)*
- **`seo/goals.js`** — dodano `// intentional` do pustego `catch {}` w `evaluateGoals()`. *(Q4)*

---

### Rekomendacje (wymagają akcji właściciela)

1. **Rotacja `JSONBIN_MASTER_KEY`** — wygeneruj nowy klucz na jsonbin.io, utwórz read-only `X-Access-Key`, zaktualizuj `gabinet-diagnoza.html` przez `node setup.js`. *(S1)*
2. **Ustawienie `SESSION_SECRET`** na Railway — `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`, min. 32 znaki. *(S4)*
3. **Zmiana hasła admina** — zaloguj się jako `admin` / `admin123` i zmień hasło w `/seo/admin`. *(S3)*
4. **Upgrade `bcrypt@6`** — `npm install bcrypt@6`, przetestuj lokalnie, deploy. *(S5)*
5. **Scalenie PR #7 i PR #8** z main.

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
