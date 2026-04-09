const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

// SESSION_PATH can point to a Railway Volume (e.g. /data/session.json)
// to survive restarts. Defaults to local file.
const SESSION_FILE = process.env.SESSION_PATH || path.join(__dirname, 'session.json');

// In-memory session cache — survives within the same process lifetime
let cachedStorageState = null;

function loadSession() {
  if (cachedStorageState) return cachedStorageState;
  if (fs.existsSync(SESSION_FILE)) {
    try {
      cachedStorageState = JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8'));
      console.log('[booksy] Loaded session from disk');
      return cachedStorageState;
    } catch {
      console.log('[booksy] Session file corrupt, ignoring');
    }
  }
  return null;
}

function saveSession(storageState) {
  cachedStorageState = storageState;
  fs.writeFileSync(SESSION_FILE, JSON.stringify(storageState, null, 2));
  console.log('[booksy] Session saved');
}

async function isLoggedIn(page) {
  try {
    const loginBtn = page.locator('[data-testid="login-modal"]');
    await loginBtn.waitFor({ timeout: 5000 });
    const text = await loginBtn.textContent();
    // If the button still says "Zaloguj się" — we're NOT logged in
    return !text.includes('Zaloguj');
  } catch {
    return false;
  }
}

async function login(page) {
  console.log('[booksy] Logging in...');

  // Dismiss cookie banner if present
  const cookieBtn = page.getByRole('button', { name: 'Allow all' });
  if (await cookieBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await cookieBtn.click();
    await page.waitForTimeout(500);
  }

  // Open login modal
  await page.locator('[data-testid="login-modal"]').click();

  // Step 1: enter email
  await page.locator('[data-testid="email-input"]').waitFor({ timeout: 10000 });
  await page.locator('[data-testid="email-input"]').fill(process.env.BOOKSY_EMAIL);
  await page.locator('[data-testid="login-continue"]').click();

  // Step 2: enter password
  await page.locator('[data-testid="password-input"]').waitFor({ timeout: 10000 });
  await page.locator('[data-testid="password-input"]').fill(process.env.BOOKSY_PASSWORD);
  await page.locator('[data-testid="login-continue"]').click();

  // Wait until "Zaloguj się" disappears from the header button → login OK
  await page.waitForFunction(
    () => {
      const btn = document.querySelector('[data-testid="login-modal"]');
      return btn && !btn.textContent.includes('Zaloguj');
    },
    { timeout: 15000 }
  );
  console.log('[booksy] Login successful');
}

async function selectDate(page, dateStr) {
  // dateStr format: YYYY-MM-DD
  const [year, month, day] = dateStr.split('-').map(Number);
  const target = new Date(year, month - 1, day);

  // Navigate calendar months until we reach the target month
  for (let attempt = 0; attempt < 12; attempt++) {
    const monthLabel = await page
      .locator('.calendar-header, [class*="CalendarHeader"], [class*="month-label"]')
      .first()
      .textContent()
      .catch(() => '');

    const currentDate = parseMonthLabel(monthLabel);
    if (currentDate && currentDate.year === year && currentDate.month === month) break;

    if (currentDate && (currentDate.year < year || (currentDate.year === year && currentDate.month < month))) {
      await page.getByRole('button', { name: /nast[eę]pn|next|›|>|arrow.right/i }).first().click();
    } else {
      await page.getByRole('button', { name: /poprz|prev|‹|<|arrow.left/i }).first().click();
    }
    await page.waitForTimeout(400);
  }

  // Click the specific day
  await page.getByRole('button', { name: new RegExp(`^${day}$`) }).first().click();
}

function parseMonthLabel(text) {
  const months = {
    'styczeń': 1, 'stycznia': 1, 'january': 1,
    'luty': 2, 'lutego': 2, 'february': 2,
    'marzec': 3, 'marca': 3, 'march': 3,
    'kwiecień': 4, 'kwietnia': 4, 'april': 4,
    'maj': 5, 'maja': 5, 'may': 5,
    'czerwiec': 6, 'czerwca': 6, 'june': 6,
    'lipiec': 7, 'lipca': 7, 'july': 7,
    'sierpień': 8, 'sierpnia': 8, 'august': 8,
    'wrzesień': 9, 'września': 9, 'september': 9,
    'październik': 10, 'października': 10, 'october': 10,
    'listopad': 11, 'listopada': 11, 'november': 11,
    'grudzień': 12, 'grudnia': 12, 'december': 12,
  };
  const lower = (text || '').toLowerCase();
  for (const [name, num] of Object.entries(months)) {
    if (lower.includes(name)) {
      const yearMatch = lower.match(/\d{4}/);
      if (yearMatch) return { month: num, year: parseInt(yearMatch[0]) };
    }
  }
  return null;
}

async function bookAppointment({ businessUrl, service, date, time, staff, notes }) {
  console.log(`[booksy] Booking: ${service} @ ${date} ${time}`);

  const storageState = loadSession();
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const context = await browser.newContext({
    ...(storageState ? { storageState } : {}),
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    locale: 'pl-PL',
    timezoneId: 'Europe/Warsaw',
  });
  const page = await context.newPage();

  try {
    // Navigate to business page
    await page.goto(businessUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);

    // Dismiss cookie banner if present
    const cookieBtn = page.getByRole('button', { name: 'Allow all' });
    if (await cookieBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await cookieBtn.click();
      await page.waitForTimeout(500);
    }

    // Check login status; re-login if needed
    if (!(await isLoggedIn(page))) {
      await login(page);
      saveSession(await context.storageState());
      // Reload business page after login
      await page.goto(businessUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(3000);
    }

    // Find and click the booking / "Zarezerwuj" button on the business page
    const bookBtn = page.getByRole('button', { name: /zarezerwuj|book now|um[oó]w/i }).first();
    if (await bookBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await bookBtn.click();
      await page.waitForTimeout(1000);
    }

    // Select service
    const serviceEl = page.getByText(service, { exact: false });
    await serviceEl.first().waitFor({ timeout: 15000 });
    await serviceEl.first().click();
    console.log(`[booksy] Selected service: ${service}`);

    // Select staff if provided
    if (staff) {
      const staffEl = page.getByText(staff, { exact: false });
      if (await staffEl.first().isVisible({ timeout: 5000 }).catch(() => false)) {
        await staffEl.first().click();
        console.log(`[booksy] Selected staff: ${staff}`);
      }
    }

    // Click "Wybierz termin" / "Choose date" if needed
    const chooseDateBtn = page.getByRole('button', { name: /wybierz termin|choose date|dalej|next/i });
    if (await chooseDateBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await chooseDateBtn.click();
    }

    // Navigate calendar to target date and click it
    await selectDate(page, date);
    console.log(`[booksy] Selected date: ${date}`);

    // Select time slot
    const timeSlot = page.getByRole('button', { name: new RegExp(time.replace(':', '[:\\.]')) });
    await timeSlot.first().waitFor({ timeout: 15000 });
    await timeSlot.first().click();
    console.log(`[booksy] Selected time: ${time}`);

    // Fill notes if provided
    if (notes) {
      const notesField = page.getByPlaceholder(/notatk|note|uwag/i);
      if (await notesField.isVisible({ timeout: 3000 }).catch(() => false)) {
        await notesField.fill(notes);
      }
    }

    // Confirm booking
    const confirmBtn = page.getByRole('button', { name: /potwierd[źz]|confirm|zarezerwuj|book/i });
    await confirmBtn.first().waitFor({ timeout: 10000 });
    await confirmBtn.first().click();

    // Wait for success confirmation
    await page.waitForSelector('[class*="success"], [class*="confirmation"], [class*="booked"]', { timeout: 15000 });
    console.log('[booksy] Booking confirmed!');

    return { success: true, message: 'Wizyta zarezerwowana pomyślnie' };
  } catch (err) {
    console.error('[booksy] Error:', err.message);

    // Save a screenshot for debugging
    try {
      const screenshotPath = path.join(__dirname, 'error-screenshot.png');
      await page.screenshot({ path: screenshotPath, fullPage: true });
      console.log(`[booksy] Screenshot saved: ${screenshotPath}`);
    } catch {}

    return { success: false, error: err.message };
  } finally {
    await context.close();
    await browser.close();
  }
}

module.exports = { bookAppointment };
