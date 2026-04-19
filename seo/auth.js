const bcrypt = require('bcrypt');
const { findUser, getUsers, saveUsers } = require('./data');

async function login(req, res) {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'Podaj login i hasło' });
  }
  const user = findUser(username);
  if (!user) {
    return res.status(401).json({ error: 'Nieprawidłowy login lub hasło' });
  }
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) {
    return res.status(401).json({ error: 'Nieprawidłowy login lub hasło' });
  }
  req.session.user = { username: user.username, role: user.role };

  // Clear first-run flag after first successful admin login
  if (user.role === 'admin') {
    const data = getUsers();
    if (data.firstRun) {
      data.firstRun = false;
      saveUsers(data);
    }
  }

  res.json({ username: user.username, role: user.role });
}

function logout(req, res) {
  req.session.destroy(() => res.json({ ok: true }));
}

function me(req, res) {
  if (!req.session.user) return res.status(401).json({ error: 'Nie zalogowano' });
  // Include email from user record (may have been updated since session started)
  const user = findUser(req.session.user.username);
  res.json({ ...req.session.user, email: user ? (user.email || '') : '' });
}

function requireAuth(req, res, next) {
  if (!req.session.user) {
    if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'Nie zalogowano' });
    return res.redirect('/seo/login');
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session.user) {
    if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'Nie zalogowano' });
    return res.redirect('/seo/login');
  }
  if (req.session.user.role !== 'admin') {
    if (req.path.startsWith('/api/')) return res.status(403).json({ error: 'Brak uprawnień' });
    return res.status(403).send('Brak uprawnień admina');
  }
  next();
}

module.exports = { login, logout, me, requireAuth, requireAdmin };
