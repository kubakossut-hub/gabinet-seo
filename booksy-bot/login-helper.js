/**
 * login-helper.js — uruchom lokalnie, zaloguj się przez Google,
 * skrypt wyśle sesję prosto na Railway.
 *
 * Użycie:
 *   node login-helper.js <URL_RAILWAY> <WEBHOOK_SECRET>
 *
 * Przykład:
 *   node login-helper.js https://gabinet-diagnoza-production.up.railway.app 28c244d5...
 */

const { chromium } = require('playwright');

const RAILWAY_URL = process.argv[2];
const SECRET = process.argv[3];

if (!RAILWAY_URL || !SECRET) {
  console.error('Użycie: node login-helper.js <RAILWAY_URL> <WEBHOOK_SECRET>');
  process.exit(1);
}

(async () => {
  console.log('🌐 Otwieram przeglądarkę — zaloguj się przez Google...\n');

  const browser = await chromium.launch({ headless: false, slowMo: 100 });
  const context = await browser.newContext({ locale: 'pl-PL', timezoneId: 'Europe/Warsaw' });
  const page = await context.newPage();

  await page.goto('https://booksy.com/pl-pl/');

  // Dismiss cookie banner
  try {
    await page.getByRole('button', { name: 'Allow all' }).click({ timeout: 5000 });
  } catch {}

  console.log('⏳ Czekam aż się zalogujesz (maks. 3 min)...');
  console.log('   Kliknij "Zaloguj się" i użyj Google.\n');

  // Wait up to 3 minutes for user to login
  await page.waitForFunction(() => {
    const btn = document.querySelector('[data-testid="login-modal"]');
    return btn && !btn.textContent.includes('Zaloguj');
  }, { timeout: 180_000 }).catch(() => {
    console.error('❌ Timeout — nie wykryto logowania.');
    process.exit(1);
  });

  console.log('✅ Zalogowano! Zapisuję sesję...\n');

  const storageState = await context.storageState();
  await browser.close();

  // Send session to Railway
  const res = await fetch(`${RAILWAY_URL}/set-session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ secret: SECRET, storageState }),
  });

  const data = await res.json();
  if (data.success) {
    console.log('🚀 Sesja wysłana na Railway! Bot jest teraz zalogowany.');
    console.log('   Następne rezerwacje nie będą wymagały logowania.\n');
  } else {
    console.error('❌ Błąd:', data.error);
  }
})();
