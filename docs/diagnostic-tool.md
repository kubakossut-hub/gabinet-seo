# Narzędzie Diagnostyczne — dokumentacja

`gabinet-diagnoza.html` to samodzielna aplikacja frontendowa (single HTML file) — operacyjna lista kontrolna dla gabinetów medycyny estetycznej. Nie wymaga serwera backendowego — dane są synchronizowane z chmurą przez JSONBin.io.

---

## Spis treści

- [Przegląd](#przegląd)
- [Wymagania](#wymagania)
- [Setup (jednorazowy)](#setup-jednorazowy)
- [Struktura danych](#struktura-danych)
- [Funkcje aplikacji](#funkcje-aplikacji)
- [Bezpieczeństwo](#bezpieczeństwo)
- [Wdrożenie (GitHub Pages)](#wdrożenie-github-pages)
- [Modyfikacja zawartości](#modyfikacja-zawartości)

---

## Przegląd

Aplikacja umożliwia zespołowi kliniki:
- Prowadzenie 6-panelowej listy kontrolnej (kategorie diagnostyczne p1–p6)
- Dodawanie komentarzy w każdej kategorii (tryb wątkowy)
- Zamykanie i opisywanie wniosków końcowych dla każdego panelu
- Automatyczny zapis i wczytywanie danych z chmury (JSONBin.io)
- Wydruk raportu diagnostycznego

**Dostęp**: chroniony hasłem. Dane przechowywane w prywatnym binie JSONBin.io.

---

## Wymagania

- **Node.js 18+** — wyłącznie do jednorazowego setup (`setup.js`)
- Konto na [jsonbin.io](https://jsonbin.io) (plan Free wystarczy)
- Hosting pliku HTML (GitHub Pages, Railway, własny serwer)

---

## Setup (jednorazowy)

Skrypt `setup.js` automatycznie konfiguruje aplikację:

```bash
node setup.js
```

Skrypt wykona następujące kroki:

### Krok 1: Hasło

Wpisz hasło dostępu dla użytkowników aplikacji. Skrypt generuje hash SHA-256 i wstrzykuje go do pliku HTML. Hasła nigdy nie są przesyłane przez sieć — weryfikacja odbywa się lokalnie w przeglądarce.

### Krok 2: JSONBin Master Key

1. Wejdź na [jsonbin.io](https://jsonbin.io)
2. Zarejestruj konto (plan Free — do 10 000 żądań/miesiąc)
3. Przejdź do **Settings → API Keys**
4. Skopiuj **X-Master-Key** i wklej do skryptu

### Krok 3: Tworzenie bina

Skrypt automatycznie tworzy prywatny bin z pustą strukturą danych:

```json
{
  "p1": { "comments": [], "closed": false, "finalComment": "" },
  "p2": { "comments": [], "closed": false, "finalComment": "" },
  "p3": { "comments": [], "closed": false, "finalComment": "" },
  "p4": { "comments": [], "closed": false, "finalComment": "" },
  "p5": { "comments": [], "closed": false, "finalComment": "" },
  "p6": { "comments": [], "closed": false, "finalComment": "" }
}
```

### Krok 4: Iniekcja konfiguracji

Skrypt wstrzykuje `CONFIG` bezpośrednio do pliku HTML:

```js
const CONFIG = {
  PASSWORD_HASH: 'abc123...',       // SHA-256 hasła
  JSONBIN_MASTER_KEY: '$2b...',     // Klucz główny JSONBin
  JSONBIN_ACCESS_KEY: '',           // Klucz tylko do odczytu (opcjonalny, plan płatny)
  JSONBIN_BIN_ID: '664abc...'       // ID bina danych
};
```

Po uruchomieniu skryptu plik `gabinet-diagnoza.html` jest gotowy do wdrożenia.

---

## Struktura danych

### Format bina JSONBin

```json
{
  "p1": {
    "comments": [
      {
        "author": "Anna K.",
        "text": "Należy sprawdzić procedurę dezynfekcji narzędzi",
        "timestamp": "2024-03-15T10:30:00.000Z"
      }
    ],
    "closed": false,
    "finalComment": ""
  },
  "p2": { ... },
  ...
  "p6": { ... }
}
```

### Panele diagnostyczne

| ID | Kategoria |
|---|---|
| `p1` | Panel 1 (pierwsza kategoria diagnostyczna) |
| `p2` | Panel 2 |
| `p3` | Panel 3 |
| `p4` | Panel 4 |
| `p5` | Panel 5 |
| `p6` | Panel 6 |

### Pola panelu

| Pole | Typ | Opis |
|---|---|---|
| `comments` | Array | Lista komentarzy wątku |
| `closed` | Boolean | Czy panel jest zamknięty (zakończony) |
| `finalComment` | String | Wniosek końcowy po zamknięciu panelu |

### Struktura komentarza

| Pole | Typ | Opis |
|---|---|---|
| `author` | String | Imię autora komentarza |
| `text` | String | Treść komentarza |
| `timestamp` | ISO 8601 String | Data i godzina dodania |

---

## Funkcje aplikacji

### Logowanie

- Użytkownik wpisuje hasło w formularzu startowym
- Aplikacja oblicza SHA-256 hasła po stronie klienta (Web Crypto API)
- Porównuje z `CONFIG.PASSWORD_HASH`
- Przy powodzeniu — ładuje dane z JSONBin i wyświetla interfejs

### Zakładki nawigacji

Aplikacja wyświetla 6 zakładek (p1–p6). Kliknięcie zakładki:
1. Aktywuje odpowiedni panel
2. Wyświetla komentarze danej kategorii

### Dodawanie komentarzy

W każdym panelu:
1. Wpisz imię i treść komentarza
2. Kliknij "Dodaj" — komentarz trafia do lokalnego stanu
3. Zapis do JSONBin następuje przy każdej zmianie (debounced lub natychmiast)

### Zamykanie panelu

Po zakończeniu diagnostyki danej kategorii:
1. Kliknij "Zamknij panel"
2. Wpisz wniosek końcowy
3. Panel wyświetla status "Zamknięty"

### Synchronizacja z chmurą

- **Wczytywanie**: po zalogowaniu — GET `https://api.jsonbin.io/v3/b/{BIN_ID}/latest`
- **Zapis**: po każdej zmianie — PUT `https://api.jsonbin.io/v3/b/{BIN_ID}`
- Nagłówek autoryzacji: `X-Master-Key` lub `X-Access-Key` (jeśli dostępny)

### Wydruk

Przycisk "Drukuj" otwiera widok przyjazny dla drukarki ze wszystkimi panelami i komentarzami.

---

## Bezpieczeństwo

### Hasło

- Hash SHA-256 generowany i przechowywany w pliku HTML (widoczny w source)
- Weryfikacja **wyłącznie po stronie klienta** — nie istnieje mechanizm server-side
- Nie używaj tego jako silnego zabezpieczenia produkcyjnych danych medycznych
- Hasło chroni przed przypadkowym dostępem, nie przed celowym atakiem

### Klucze JSONBin

- `JSONBIN_MASTER_KEY` jest widoczny w źródle HTML (client-side app)
- JSONBin bin ustawiony jako **prywatny** — wymaga klucza do dostępu
- Opcjonalny `JSONBIN_ACCESS_KEY` (tylko odczyt) może być używany dla zewnętrznych przeglądających

**Zalecenie:** Jeśli plik HTML jest hostowany publicznie (np. GitHub Pages w publicznym repo), bin i tak jest prywatny — bez klucza nie można go odczytać przez API.

---

## Wdrożenie (GitHub Pages)

Po wykonaniu `setup.js`:

```bash
# 1. Utwórz prywatne repozytorium GitHub
git init
git add gabinet-diagnoza.html
git commit -m "Add diagnostic tool"
git remote add origin https://github.com/uzytkownik/gabinet-diagnoza.git
git push -u origin main

# 2. Włącz GitHub Pages
# GitHub → Settings → Pages → Source: Deploy from a branch → branch: main, folder: /

# 3. URL aplikacji:
# https://uzytkownik.github.io/gabinet-diagnoza/gabinet-diagnoza.html
```

Lub wdróż jako część głównej aplikacji przez Railway — plik jest serwowany przez `server.js` pod adresem `/`.

---

## Modyfikacja zawartości

### Zmiana etykiet paneli

W pliku `gabinet-diagnoza.html` znajdź sekcje HTML oznaczone jako `id="p1"`, `id="p2"` itd. i zmień ich tytuły oraz zawartość checklist.

### Zmiana hasła

```bash
# Uruchom setup.js ponownie — nadpisze CONFIG z nowym hasłem
node setup.js
```

Lub ręcznie oblicz SHA-256 nowego hasła i zaktualizuj `PASSWORD_HASH` w `CONFIG`.

### Zmiana JSONBin

Jeśli chcesz użyć nowego bina (np. przy zmianie klienta):
1. Utwórz nowy bin przez JSONBin dashboard lub API
2. Zaktualizuj `JSONBIN_BIN_ID` w `CONFIG` w pliku HTML
