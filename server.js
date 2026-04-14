require('dotenv').config();
const express = require('express');
const path = require('path');
const app = express();

app.set('trust proxy', 1); // Required for secure cookies behind Railway / Heroku proxy
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// SEO Dashboard module
const seoRouter = require('./seo/router');
const { initUsers } = require('./seo/data');
initUsers().catch(console.error);
app.use('/seo', seoRouter);

// Original app
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'gabinet-diagnoza.html'));
});

const port = process.env.PORT || 3000;
if (require.main === module) {
  app.listen(port, () => console.log(`Running on port ${port}`));
}

module.exports = app;
