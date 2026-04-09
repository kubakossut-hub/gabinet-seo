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

async function dismissOverlays(page) {
  // Close any auto-opened modals: location prompt, login modal, promo, etc.
  // Booksy uses ESC-dismissable overlays and close buttons labeled "Zamknij"
  for (let i = 0; i < 3; i++) {
    let closed = false;

    // Try ESC
    await page.keyboard.press('Escape').catch(() => {});
    await page.waitForTimeout(200);

    // Try close buttons
    const closeBtns = await page.locator('button[aria-label="Zamknij" i], button[aria-label="Close" i]').all().catch(() => []);
    for (const btn of closeBtns) {
      if (await btn.isVisible().catch(() => false)) {
        await btn.click().catch(() => {});
        closed = true;
        await page.waitForTimeout(200);
      }
    }

    // Click X in header region if modal visible
    const xClicked = await page.evaluate(() => {
      const modals = [...document.querySelectorAll('[role="dialog"], [data-testid*="modal"], [class*="modal" i]')];
      for (const m of modals) {
        if (m.offsetParent === null) continue;
        const btns = [...m.querySelectorAll('button')];
        const closeBtn = btns.find(b => {
          const txt = (b.innerText || b.getAttribute('aria-label') || '').toLowerCase();
          return /zamknij|close|×/.test(txt) || b.querySelector('svg[class*="close" i]');
        });
        if (closeBtn) { closeBtn.click(); return true; }
      }
      return false;
    }).catch(() => false);
    if (xClicked) closed = true;

    if (!closed) break;
  }
}

const MONTH_MAP = {
  'styczeń': 1, 'luty': 2, 'marzec': 3, 'kwiecień': 4, 'maj': 5, 'czerwiec': 6,
  'lipiec': 7, 'sierpień': 8, 'wrzesień': 9, 'październik': 10, 'listopad': 11, 'grudzień': 12,
};

async function expandAllServiceCategories(page) {
  // Booksy groups services into collapsible categories ("3 usługi", "15 usług").
  // We need to expand them all so the Umów buttons are in DOM.
  for (let pass = 0; pass < 5; pass++) {
    const expanded = await page.evaluate(() => {
      let count = 0;
      // Strategy 1: click headers/buttons whose text matches "X usług(i)?" or "Pokaż więcej" / "Rozwiń"
      const candidates = [...document.querySelectorAll('button, [role="button"], a, h2, h3, h4, div[class*="header" i], div[class*="category" i]')];
      for (const el of candidates) {
        const txt = (el.innerText || '').trim();
        if (!txt) continue;
        // Match "3 usługi", "15 usług", "Pokaż więcej", "Rozwiń"
        const isCollapsedCat = /^\d+\s+usług[ai]?$/i.test(txt);
        const isShowMore = /^(pokaż więcej|pokaz wiecej|rozwiń|rozwin|show more|view all|zobacz wszystkie)$/i.test(txt);
        if (isCollapsedCat || isShowMore) {
          // Avoid clicking elements way down in shadow DOM, must be visible
          if (el.offsetParent === null) continue;
          // Check aria-expanded — skip if already expanded
          const expandedAttr = el.getAttribute('aria-expanded');
          if (expandedAttr === 'true') continue;
          el.click();
          count++;
        }
      }
      return count;
    });
    if (expanded === 0) break;
    console.log(`[booksy] Expanded ${expanded} categories (pass ${pass + 1})`);
    await page.waitForTimeout(500);
  }
}

async function scrollPageToBottom(page) {
  // Booksy lazy-loads — scroll through the entire page so all services render
  await page.evaluate(async () => {
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));
    let lastHeight = 0;
    for (let i = 0; i < 30; i++) {
      window.scrollBy(0, 800);
      await sleep(150);
      const h = document.body.scrollHeight;
      if (h === lastHeight && i > 5) break;
      lastHeight = h;
    }
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(500);
}

async function clickUmow(page, service, staff) {
  // Make sure all services are loaded and expanded
  await scrollPageToBottom(page);
  await expandAllServiceCategories(page);
  await scrollPageToBottom(page);
  await expandAllServiceCategories(page);

  // Find the correct Umów/Book button. We use a 3-tier matching:
  //   1. exact match on service name
  //   2. case-insensitive substring match
  //   3. fuzzy match (all words from search appear in row)
  const result = await page.evaluate(({ service, staff }) => {
    const norm = (s) => (s || '').toLowerCase().replace(/\s+/g, ' ').trim();
    const targetNorm = norm(service);
    const targetWords = targetNorm.split(' ').filter(w => w.length > 2);

    // Collect all clickable "book" buttons
    const allBtns = [...document.querySelectorAll('button, a')];
    const bookBtns = allBtns.filter(b => {
      const t = norm(b.innerText);
      return /^(umów|umow|book|zarezerwuj|book now|wybierz|select)$/i.test(t) ||
             b.getAttribute('data-testid') === 'service-button';
    });

    // For each book button, walk up to find smallest container holding the service name
    const findRow = (btn) => {
      let el = btn;
      let bestRow = null;
      let bestScore = -1;
      for (let i = 0; i < 20; i++) {
        el = el.parentElement;
        if (!el) break;
        const txt = norm(el.innerText);
        if (!txt) continue;

        let score = -1;
        // Tier 1: exact match on a line
        const lines = txt.split('\n').map(l => l.trim());
        if (lines.some(l => l === targetNorm)) score = 1000;
        // Tier 2: substring match
        else if (txt.includes(targetNorm)) score = 500;
        // Tier 3: all words present
        else if (targetWords.every(w => txt.includes(w))) score = 100;

        if (score > 0) {
          // Prefer smaller containers (closer to button) — they're more specific
          if (bestRow === null || (el.innerText.length < bestRow.innerText.length)) {
            bestRow = el;
            bestScore = score;
          }
        }
      }
      return bestRow ? { row: bestRow, score: bestScore } : null;
    };

    const matches = [];
    for (const btn of bookBtns) {
      const m = findRow(btn);
      if (!m) continue;
      if (staff && !norm(m.row.innerText).includes(norm(staff))) continue;
      matches.push({ btn, ...m });
    }

    if (matches.length === 0) {
      // Collect available service names from the page for debugging
      const allText = document.body.innerText;
      const serviceNameLines = allText.split('\n')
        .map(l => l.trim())
        .filter(l => l.length > 8 && l.length < 80 && /[a-ząęłńóśźż]/i.test(l) && !/^\d/.test(l))
        .slice(0, 50);
      return { found: false, available: serviceNameLines, btnCount: bookBtns.length };
    }

    // Pick the highest-scoring match
    matches.sort((a, b) => b.score - a.score);
    const chosen = matches[0];
    chosen.btn.setAttribute('data-booksy-target', 'true');
    chosen.btn.scrollIntoView({ behavior: 'instant', block: 'center' });
    return { found: true, score: chosen.score, btnCount: bookBtns.length };
  }, { service, staff: staff || '' });

  if (!result.found) {
    const sample = result.available.slice(0, 30).join(' | ');
    throw new Error(
      `Nie znaleziono usługi "${service}"${staff ? ` / pracownika "${staff}"` : ''}. ` +
      `Buttons znalezione: ${result.btnCount}. Dostępne wiersze: ${sample}`
    );
  }

  console.log(`[booksy] Found service (score ${result.score}, ${result.btnCount} buttons total)`);
  const target = page.locator('[data-booksy-target="true"]');
  await target.first().click({ timeout: 10000 });
  console.log(`[booksy] Clicked Umów: ${service}${staff ? ' / ' + staff : ''}`);
  await page.waitForTimeout(1500);

  // After clicking, Booksy may pop a login modal — dismiss it (guest booking)
  await dismissOverlays(page);
  await page.waitForTimeout(500);
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

    // Dismiss any auto-opened modal (location, login, etc.)
    await dismissOverlays(page);

    // Find and click Umów — Booksy allows guest booking, no login needed
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
