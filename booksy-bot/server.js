require('dotenv').config();
const express = require('express');
const { bookAppointment, saveSession } = require('./booksy');

const app = express();
app.use(express.json());

// Simple async queue — prevents parallel Playwright instances
let queue = Promise.resolve();
function enqueue(fn) {
  const result = queue.then(fn);
  queue = result.catch(() => {});
  return result;
}

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.post('/book', async (req, res) => {
  const { secret, businessUrl, service, date, time, staff, notes } = req.body || {};

  if (!process.env.WEBHOOK_SECRET || secret !== process.env.WEBHOOK_SECRET) {
    return res.status(401).json({ success: false, error: 'Invalid secret' });
  }

  if (!businessUrl || !service || !date || !time) {
    return res.status(400).json({
      success: false,
      error: 'Required fields: businessUrl, service, date (YYYY-MM-DD), time (HH:MM)',
    });
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ success: false, error: 'date must be YYYY-MM-DD' });
  }

  if (!/^\d{2}:\d{2}$/.test(time)) {
    return res.status(400).json({ success: false, error: 'time must be HH:MM' });
  }

  console.log(`[server] Booking request queued: ${service} @ ${date} ${time}`);

  const result = await enqueue(() =>
    bookAppointment({ businessUrl, service, date, time, staff, notes })
  );

  res.status(result.success ? 200 : 500).json(result);
});

app.post('/set-session', (req, res) => {
  const { secret, storageState } = req.body || {};
  if (!process.env.WEBHOOK_SECRET || secret !== process.env.WEBHOOK_SECRET) {
    return res.status(401).json({ success: false, error: 'Invalid secret' });
  }
  if (!storageState) {
    return res.status(400).json({ success: false, error: 'Missing storageState' });
  }
  saveSession(storageState);
  console.log('[server] Session updated via /set-session');
  res.json({ success: true, message: 'Session saved' });
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`[server] Booksy bot running on port ${port}`));
