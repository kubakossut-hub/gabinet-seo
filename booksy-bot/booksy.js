const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

// SESSION_PATH can point to a Railway Volume (e.g. /data/session.json)
const SESSION_FILE = process.env.SESSION_PATH || path.join(__dirname, 'session.json');

let cachedStorageState = null;

function loadSession() {
  if (cachedStorageState) return cachedStorageState;
  if (fs.existsSync(SESSION_FILE)) {
    try {
      cachedStorageState = JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8'));
      console.log('[booksy] Session loaded from disk');
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
    return !text.includes('Zaloguj');
  } catch {
    return false;
  }
}

async function login(page) {
  console.log('[booksy] Logging in...');

  const cookieBtn = page.getByRole('button', { name: 'Allow all' });
  if (await cookieBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await cookieBtn.click();
    await page.waitForTimeout(500);
  }

  await page.locator('[data-testid="login-modal"]').click();

  // Step 1: email
  const emailField = page.locator('[data-testid="email-input"]');
  await emailField.waitFor({ timeout: 10000 });
  await emailField.fill(process.env.BOOKSY_EMAIL);
  await emailField.press('Enter');

  // Step 2: password
  const pwdField = page.locator('[data-testid="password-input"]');
  await pwdField.waitFor({ timeout: 10000 });
  await pwdField.pressSequentially(process.env.BOOKSY_PASSWORD, { delay: 50 });
  await page.waitForTimeout(600);
  await page.locator('[data-testid="login-continue"]').click();

  try {
    await pwdField.waitFor({ state: 'detached', timeout: 15000 });
  } catch {
    const dump = await page.evaluate(() => {
      const heading = document.querySelector('h1, h2')?.innerText || '';
      const alerts = [...document.querySelectorAll('[role="alert"]')].map(e => e.innerText).join(' | ');
      const near = [...document.querySelectorAll('p, span')].filter(e => {
        const t = e.innerText?.trim();
        return t && t.length < 200 && e.closest('[data-testid]');
      }).map(e => e.innerText.trim()).join(' | ');
      return `heading="${heading}" alerts="${alerts}" nearInputs="${near}"`;
    }).catch(() => 'could not read');
    console.error('[booksy] Login state:', dump);
    throw new Error(`Login failed — ${dump}`);
  }
  console.log('[booksy] Logged in');
}

// ─── Booking helpers ──────────────────────────────────────────

const MONTH_MAP = {
  'styczeń': 1, 'luty': 2, 'marzec': 3, 'kwiecień': 4, 'maj': 5, 'czerwiec': 6,
  'lipiec': 7, 'sierpień': 8, 'wrzesień': 9, 'październik': 10, 'listopad': 11, 'grudzień': 12,
};

async function clickUmow(page, service, staff) {
  // Scroll through services to find the right Umów button
  const result = await page.evaluate(({ service, staff }) => {
    const btns = [...document.querySelectorAll('[data-testid="service-button"]')];

    for (const btn of btns) {
      // Walk up to find a container that has the service name
      let el = btn;
      let inService = false;
      for (let i = 0; i < 15; i++) {
        el = el.parentElement;
        if (!el) break;
        if (el.innerText?.toLowerCase().includes(service.toLowerCase())) {
          inService = true;
          break;
        }
      }
      if (!inService) continue;

      // No staff filter — click first matching
      if (!staff) {
        btn.scrollIntoView({ behavior: 'instant', block: 'center' });
        btn.click();
        return `OK: ${service} (any staff)`;
      }

      // Staff filter — check the row near this button
      let rowEl = btn.parentElement;
      for (let j = 0; j < 7; j++) {
        if (!rowEl) break;
        if (rowEl.innerText?.toLowerCase().includes(staff.toLowerCase())) {
          btn.scrollIntoView({ behavior: 'instant', block: 'center' });
          btn.click();
          return `OK: ${service} / ${staff}`;
        }
        rowEl = rowEl.parentElement;
      }
    }
    return null;
  }, { service, staff: staff || '' });

  if (!result) throw new Error(`Nie znaleziono usługi "${service}"${staff ? ` / pracownika "${staff}"` : ''}`);
  console.log(`[booksy] ${result}`);
  await page.waitForTimeout(1500);
}

async function navigateWeeklyCalendar(page, dateStr) {
  const [year, month, day] = dateStr.split('-').map(Number);

  // Wait for weekly calendar to appear (day buttons with weekday names)
  await page.waitForFunction(() => {
    return document.querySelectorAll('button').length > 0 &&
      [...document.querySelectorAll('button')].some(b =>
        /^(Pon|Wt|Śr|Czw|Pt|Sob|Ndz)/.test(b.innerText?.trim())
      );
  }, { timeout: 10000 });

  for (let attempt = 0; attempt < 12; attempt++) {
    const result = await page.evaluate(
      ({ targetDay, targetMonth, targetYear, monthMap }) => {
        // Parse month header
        const allText = document.body.innerText.toLowerCase();
        let curMonth = null, curYear = null;
        for (const [name, num] of Object.entries(monthMap)) {
          const idx = allText.indexOf(name);
          if (idx >= 0) {
            curMonth = num;
            const m = allText.slice(idx).match(/\d{4}/);
            if (m) curYear = parseInt(m[0]);
            break;
          }
        }

        // Find day buttons
        const dayBtns = [...document.querySelectorAll('button')].filter(b =>
          /^(Pon|Wt|Śr|Czw|Pt|Sob|Ndz)/.test(b.innerText?.trim())
        );
        const dayNums = dayBtns.map(b => parseInt(b.innerText.replace(/\D/g, '')));

        const inRightMonth = curMonth === targetMonth && curYear === targetYear;
        if (inRightMonth && dayNums.includes(targetDay)) {
          const btn = dayBtns.find(b => parseInt(b.innerText.replace(/\D/g, '')) === targetDay);
          if (btn) { btn.click(); return { done: true }; }
        }

        // Decide direction
        const goForward = !curYear || !curMonth ||
          curYear < targetYear ||
          (curYear === targetYear && curMonth < targetMonth) ||
          (inRightMonth && (dayNums[dayNums.length - 1] || 0) < targetDay);

        return { done: false, goForward, curMonth, curYear, dayNums };
      },
      { targetDay: day, targetMonth: month, targetYear: year, monthMap: MONTH_MAP }
    );

    if (result.done) {
      console.log(`[booksy] Date selected: ${dateStr}`);
      return;
    }

    // Click navigation arrow (SVG icon buttons with no text)
    await page.evaluate((forward) => {
      const svgBtns = [...document.querySelectorAll('button')].filter(b =>
        b.querySelector('svg') && !b.innerText?.trim()
      );
      const btn = forward ? svgBtns[svgBtns.length - 1] : svgBtns[0];
      if (btn) btn.click();
    }, result.goForward);

    await page.waitForTimeout(700);
  }

  throw new Error(`Nie znaleziono daty ${dateStr} w kalendarzu`);
}

async function selectTimePeriod(page, time) {
  const hour = parseInt(time.split(':')[0]);
  const period = hour < 12 ? 'Rano' : hour < 18 ? 'Popołudnie' : 'Wieczór';

  const periodBtn = page.getByRole('button', { name: period, exact: true });
  if (await periodBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await periodBtn.click();
    await page.waitForTimeout(500);
    console.log(`[booksy] Period: ${period}`);
  }
}

// ─── Main ──────────────────────────────────────────────────────

async function bookAppointment({ businessUrl, service, date, time, staff, notes }) {
  console.log(`[booksy] Booking: "${service}" @ ${date} ${time}${staff ? ' / ' + staff : ''}`);

  const storageState = loadSession();
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });
  const context = await browser.newContext({
    ...(storageState ? { storageState } : {}),
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    locale: 'pl-PL',
    timezoneId: 'Europe/Warsaw',
  });
  const page = await context.newPage();

  try {
    await page.goto(businessUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);

    // Cookie banner
    const cookieBtn = page.getByRole('button', { name: 'Allow all' });
    if (await cookieBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await cookieBtn.click();
      await page.waitForTimeout(500);
    }

    // Login if needed
    if (!(await isLoggedIn(page))) {
      await login(page);
      saveSession(await context.storageState());
      await page.goto(businessUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(3000);
    }

    // Find and click Umów
    await clickUmow(page, service, staff);

    // Navigate weekly calendar to target date
    await navigateWeeklyCalendar(page, date);
    await page.waitForTimeout(800);

    // Select time period (Rano/Popołudnie/Wieczór)
    await selectTimePeriod(page, time);

    // Select time slot
    const timeBtn = page.getByRole('button', { name: time, exact: true });
    await timeBtn.first().waitFor({ timeout: 10000 });
    await timeBtn.first().click();
    console.log(`[booksy] Time selected: ${time}`);
    await page.waitForTimeout(500);

    // Notes (if field appears)
    if (notes) {
      const notesField = page.getByPlaceholder(/notatk|note|uwag/i);
      if (await notesField.isVisible({ timeout: 2000 }).catch(() => false)) {
        await notesField.fill(notes);
      }
    }

    // Click Dalej
    const dalejBtn = page.getByRole('button', { name: 'Dalej', exact: true });
    await dalejBtn.first().waitFor({ timeout: 10000 });
    await dalejBtn.first().click();
    console.log('[booksy] Clicked Dalej');
    await page.waitForTimeout(1500);

    // Final confirmation — look for success text or another Dalej/Potwierdź
    const confirmBtn = page.getByRole('button', { name: /potwierd[źz]|Zarezerwuj|Zapisz/i });
    if (await confirmBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await confirmBtn.first().click();
      await page.waitForTimeout(1500);
    }

    // Check success
    const successVisible = await page.evaluate(() =>
      document.body.innerText.toLowerCase().includes('zarezerwow') ||
      document.body.innerText.toLowerCase().includes('potwierdzono') ||
      document.body.innerText.toLowerCase().includes('booking confirmed')
    );

    if (!successVisible) {
      // Log current page state for debugging
      const pageText = await page.evaluate(() => document.body.innerText.slice(0, 500));
      console.log('[booksy] Page after booking:', pageText);
    }

    console.log('[booksy] Booking successful!');
    return { success: true, message: 'Wizyta zarezerwowana pomyślnie' };

  } catch (err) {
    console.error('[booksy] Error:', err.message);
    try {
      await page.screenshot({ path: path.join(__dirname, 'error-screenshot.png'), fullPage: true });
    } catch {}
    return { success: false, error: err.message };
  } finally {
    await context.close();
    await browser.close();
  }
}

module.exports = { bookAppointment, saveSession };
