require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const authorizer = require('./authorizer');
const graph = require('./graph');

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

// On-Behalf-Of Graph profile endpoint
app.get('/api/me', authorizer(), async (req, res) => {
  try {
    // Expect the frontend to pass the incoming access token in Authorization header
    const auth = req.headers.authorization || '';
    const incoming = auth.startsWith('Bearer ') ? auth.slice('Bearer '.length) : null;
    if (!incoming) return res.status(400).json({ error: 'missing_bearer_token' });

    // Exchange the incoming token for an OBO token for Graph
    const obo = await graph.getOboToken(incoming);

    // Fetch profile pieces in parallel
    const [profile, manager, memberOf, org] = await Promise.all([
      graph.getUserProfile(obo),
      graph.getManager(obo),
      graph.getMemberOf(obo),
      graph.getOrganization(obo),
    ]);

    const normalized = {
      id: profile.id,
      employeeId: profile.employeeId || null,
      email: profile.mail || profile.userPrincipalName || null,
      firstName: profile.givenName || null,
      lastName: profile.surname || null,
      displayName: profile.displayName || null,
      jobTitle: profile.jobTitle || null,
      department: profile.department || null,
      organization: org ? { id: org.id, displayName: org.displayName } : null,
      manager: manager ? { id: manager.id, displayName: manager.displayName, mail: manager.mail } : null,
      groups: Array.isArray(memberOf) ? memberOf : [],
    };

    res.json({ profile: normalized });
  } catch (err) {
    console.error('api/me error', err && err.message);
    res.status(500).json({ error: 'failed_to_load_profile', details: err && err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Backend listening on port ${PORT}`);
});
