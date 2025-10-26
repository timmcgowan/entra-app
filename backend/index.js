require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const authorizer = require('./authorizer');

const app = express();
app.use(cors());
app.use(bodyParser.json());

// Public route
app.get('/api/public', (req, res) => {
  res.json({ message: 'This is a public endpoint' });
});

// Protected route
app.get('/api/protected', authorizer(), (req, res) => {
  res.json({ message: 'This is a protected endpoint', user: req.user || null });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Backend listening on port ${PORT}`);
});
