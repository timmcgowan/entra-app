const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
const jwt = require('jsonwebtoken');
const jwksRsa = require('jwks-rsa');

/*
  Authorizer middleware with optional MS Entra JWT validation.

  Environment variables:
    - OPA_URL: URL for OPA decision API (defaults to http://opa:8181/v1/data/authz/allow)
    - ALLOW_ALL: if 'true', skip checks (dev convenience)
    - AZ_TENANT_ID: Azure AD tenant id (or leave blank to use 'common')
    - AZ_AUDIENCE: Expected audience (client id / API id)
    - AZ_ISSUER: Optional issuer override (if not provided, built from tenant id)
    - DISABLE_JWT_VALIDATION: if 'true', do not validate JWT signatures (dev only)
*/

module.exports = function authorizer(options = {}) {
  const opaUrl = process.env.OPA_URL || options.opaUrl || 'http://opa:8181/v1/data/authz/allow';
  const allowAll = process.env.ALLOW_ALL === 'true';
  const disableJwt = process.env.DISABLE_JWT_VALIDATION === 'true';

  const tenant = process.env.AZ_TENANT_ID || 'common';
  const issuer = process.env.AZ_ISSUER || `https://login.microsoftonline.com/${tenant}/v2.0`;
  const jwksUri = `${issuer}/discovery/v2.0/keys`;
  const audience = process.env.AZ_AUDIENCE || process.env.AZ_CLIENT_ID || undefined;

  const jwksClient = jwksRsa({
    jwksUri,
    cache: true,
    cacheMaxEntries: 5,
    cacheMaxAge: 3600000,
    rateLimit: true,
    jwksRequestsPerMinute: 10
  });

  function getKey(header, callback) {
    jwksClient.getSigningKey(header.kid, function (err, key) {
      if (err) return callback(err);
      const signingKey = key.getPublicKey ? key.getPublicKey() : key.rsaPublicKey;
      callback(null, signingKey);
    });
  }

  return async function (req, res, next) {
    if (allowAll) return next();

    const auth = req.headers.authorization || '';
    let token = null;
    if (auth.toLowerCase().startsWith('bearer ')) token = auth.slice(7).trim();

    let user = null;

    if (token) {
      if (disableJwt) {
        // decode without verification (dev/test only)
        try {
          const parts = token.split('.');
          if (parts.length === 3) {
            const payload = Buffer.from(parts[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
            user = JSON.parse(payload);
          } else {
            user = { sub: token };
          }
        } catch (e) {
          user = { sub: token };
        }
      } else {
        // Verify signature and claims using JWKS
        try {
          const verifyOptions = { algorithms: ['RS256'] };
          if (audience) verifyOptions.audience = audience;
          if (issuer) verifyOptions.issuer = issuer;

          user = await new Promise((resolve, reject) => {
            jwt.verify(token, getKey, verifyOptions, (err, decoded) => {
              if (err) return reject(err);
              resolve(decoded);
            });
          });
        } catch (e) {
          console.warn('JWT verification failed:', e.message || e);
          return res.status(401).json({ error: 'invalid_token', details: e.message || e });
        }
      }
    }

    // Build input for OPA
    const input = {
      user: user,
      method: req.method,
      path: req.path,
      ip: req.ip,
      headers: req.headers
    };

    try {
      const r = await fetch(opaUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input })
      });
      const j = await r.json();
      const allowed = j && (j.result === true || (Array.isArray(j.result) ? j.result.length > 0 : false));
      if (allowed) {
        req.user = user;
        return next();
      }
      return res.status(403).json({ error: 'forbidden' });
    } catch (err) {
      console.error('OPA check failed', err);
      return res.status(500).json({ error: 'decision-service-error' });
    }
  };
};
