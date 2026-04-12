require('dotenv').config();
const express = require('express');
const path = require('path');
const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

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
app.listen(port, () => console.log(`Running on port ${port}`));
