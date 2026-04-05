#!/usr/bin/env node
/**
 * setup.js — Jednorazowa konfiguracja strony gabinet-diagnoza.html
 *
 * Co robi:
 *  1. Pyta o hasło → generuje SHA-256 hash
 *  2. Tworzy nowy bin w JSONBin.io z pustą strukturą danych
 *  3. Automatycznie wstrzykuje CONFIG do gabinet-diagnoza.html
 *
 * Wymagania:
 *  - Node.js 18+ (fetch wbudowany)
 *  - X-Master-Key z konta na https://jsonbin.io
 *
 * Użycie:
 *  node setup.js
 */

const readline = require('readline');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

function ask(question) {
  return new Promise(resolve => rl.question(question, resolve));
}

async function sha256hex(str) {
  return crypto.createHash('sha256').update(str, 'utf8').digest('hex');
}

async function createBin(masterKey, initialData) {
  const res = await fetch('https://api.jsonbin.io/v3/b', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Master-Key': masterKey,
      'X-Bin-Name': 'gabinet-diagnoza',
      'X-Bin-Private': 'true'
    },
    body: JSON.stringify(initialData)
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`JSONBin API error ${res.status}: ${text}`);
  }
  return res.json();
}

async function createAccessKey(masterKey, binId) {
  try {
    const res = await fetch('https://api.jsonbin.io/v3/a', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Master-Key': masterKey
      },
      body: JSON.stringify({
        name: 'gabinet-diagnoza-read',
        permissions: {
          bins: {
            [binId]: ['r']
          }
        }
      })
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json.record?.secretKey || null;
  } catch {
    return null;
  }
}

function buildInitialState() {
  const state = {};
  ['p1','p2','p3','p4','p5','p6'].forEach(id => {
    state[id] = { comments: [], closed: false, finalComment: '' };
  });
  return state;
}

async function main() {
  console.log('\n╔══════════════════════════════════════════╗');
  console.log('║  Setup: gabinet-diagnoza.html            ║');
  console.log('╚══════════════════════════════════════════╝\n');

  // 1. Password
  const password = await ask('Podaj hasło dostępu do strony: ');
  if (!password.trim()) {
    console.error('\n❌ Hasło nie może być puste.');
    rl.close(); process.exit(1);
  }
  const hash = await sha256hex(password.trim());
  console.log('\n✓ Hash hasła wygenerowany');

  // 2. JSONBin Master Key
  console.log('\nWejdź na https://jsonbin.io → Settings → API Keys → skopiuj X-Master-Key');
  const masterKey = await ask('Wklej X-Master-Key: ');
  if (!masterKey.trim()) {
    console.error('\n❌ Master Key nie może być pusty.');
    rl.close(); process.exit(1);
  }

  // 3. Create bin
  console.log('\n⏳ Tworzę bin w JSONBin.io…');
  let binId, accessKey;
  try {
    const result = await createBin(masterKey.trim(), buildInitialState());
    binId = result.metadata?.id;
    if (!binId) throw new Error('Brak ID bina w odpowiedzi');
    console.log(`✓ Bin utworzony (ID: ${binId})`);
  } catch (e) {
    console.error('\n❌ Błąd tworzenia bina:', e.message);
    console.log('Sprawdź czy Master Key jest poprawny i masz aktywne konto na jsonbin.io');
    rl.close(); process.exit(1);
  }

  // 4. Create read-only access key (optional)
  console.log('\n⏳ Próba wygenerowania X-Access-Key (read-only)…');
  accessKey = await createAccessKey(masterKey.trim(), binId);
  if (accessKey) {
    console.log('✓ X-Access-Key wygenerowany');
  } else {
    console.log('ℹ  X-Access-Key niedostępny (plan free) — strona będzie używać Master Key do odczytu');
  }

  rl.close();

  // 5. Inject CONFIG directly into gabinet-diagnoza.html
  const htmlPath = path.join(__dirname, 'gabinet-diagnoza.html');
  const newConfig = `const CONFIG = {
  PASSWORD_HASH: '${hash}',
  JSONBIN_MASTER_KEY: '${masterKey.trim()}',
  JSONBIN_ACCESS_KEY: '${accessKey || ''}',
  JSONBIN_BIN_ID: '${binId}'
};`;

  let html = fs.readFileSync(htmlPath, 'utf8');
  html = html.replace(/const CONFIG = \{[\s\S]*?\};/, newConfig);
  fs.writeFileSync(htmlPath, html, 'utf8');

  console.log('\n✅ CONFIG wstrzyknięty do gabinet-diagnoza.html');
  console.log('\n' + '═'.repeat(50));
  console.log('Kolejne kroki:');
  console.log('  1. Utwórz prywatne repo na GitHub');
  console.log('  2. Wypchnij gabinet-diagnoza.html na GitHub');
  console.log('  3. Włącz GitHub Pages (Settings → Pages → branch: main)');
  console.log('  4. Udostępnij URL + hasło zespołowi\n');
}

main().catch(e => {
  console.error('Nieoczekiwany błąd:', e);
  rl.close();
  process.exit(1);
});
