import { PublicClientApplication } from "@azure/msal-browser";

// Uses Vite env vars: VITE_MSAL_CLIENT_ID, VITE_MSAL_AUTHORITY, VITE_MSAL_SCOPES, VITE_MSAL_REDIRECT_URI
const clientId = import.meta.env.VITE_MSAL_CLIENT_ID || '<YOUR_CLIENT_ID>';
const authority = import.meta.env.VITE_MSAL_AUTHORITY || 'https://login.microsoftonline.com/common';
const scopesEnv = import.meta.env.VITE_MSAL_SCOPES || '';
const defaultScopes = scopesEnv ? scopesEnv.split(',').map(s => s.trim()) : ['openid', 'profile'];
const redirectUri = import.meta.env.VITE_MSAL_REDIRECT_URI || window.location.origin;

const msalConfig = {
  auth: {
    clientId,
    authority,
    redirectUri,
  },
  cache: {
    cacheLocation: 'localStorage',
    storeAuthStateInCookie: false,
  }
};

const pca = new PublicClientApplication(msalConfig);

// Start a redirect login flow
function loginRedirect(scopes = defaultScopes) {
  const req = { scopes };
  return pca.loginRedirect(req);
}

// Logout (redirect)
function logoutRedirect() {
  return pca.logoutRedirect();
}

// Process the redirect response on app load. Returns the auth result if present.
async function processRedirect() {
  // handleRedirectPromise resolves when the redirect flow returns to the app
  const result = await pca.handleRedirectPromise();
  return result; // may be null if no redirect happened
}

// Get accounts available in the MSAL cache
function getAccounts() {
  return pca.getAllAccounts() || [];
}

// Acquire token: try silent, fallback to redirect (interactive)
async function acquireTokenForAccount(account, scopes = defaultScopes) {
  if (!account) throw new Error('no_account');
  const request = { account, scopes };
  try {
    const resp = await pca.acquireTokenSilent(request);
    return resp; // return whole response (accessToken, expiresOn etc.)
  } catch (err) {
    // fallback to interactive redirect - this will redirect the browser
    await pca.acquireTokenRedirect(request);
    return null; // token will be available after redirect and processRedirect
  }
}

// Helper: decode JWT payload to inspect exp claim (no verification here)
function decodeJwtPayload(token) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
    return payload;
  } catch (e) {
    return null;
  }
}

// Token auto-refresh scheduler
const refreshTimers = new Map();

function scheduleRefreshForAccount(account, accessToken, onRefresh, onError) {
  if (!account || !accessToken) return;
  const payload = decodeJwtPayload(accessToken);
  if (!payload || !payload.exp) return;
  const expiresAt = payload.exp * 1000; // ms
  const now = Date.now();
  // refresh 60 seconds before expiry (or immediately if already close)
  const refreshAt = Math.max(now + 1000, expiresAt - 60000);
  const delay = Math.max(0, refreshAt - now);

  // clear existing timer
  const key = account.homeAccountId || account.localAccountId || account.username || account.username;
  if (refreshTimers.has(key)) {
    clearTimeout(refreshTimers.get(key));
  }

  // we implement retry/backoff when refresh fails
  let attempt = 0
  const maxAttempts = 5

  const doRefresh = async () => {
    attempt++
    try {
      const resp = await acquireTokenForAccount(account)
      if (resp && resp.accessToken) {
        // schedule next refresh based on new token
        scheduleRefreshForAccount(account, resp.accessToken, onRefresh, onError)
        if (onRefresh) onRefresh(resp)
      }
    } catch (e) {
      if (attempt <= maxAttempts) {
        // exponential backoff: base 2s * 2^(attempt-1)
        const backoff = 2000 * Math.pow(2, attempt - 1)
        const t = setTimeout(doRefresh, backoff)
        const key = account.homeAccountId || account.localAccountId || account.username
        refreshTimers.set(key, t)
      } else {
        if (onError) onError(e)
      }
    }
  }

  const timer = setTimeout(doRefresh, delay)

  refreshTimers.set(key, timer);
}

function stopRefreshForAccount(account) {
  if (!account) return;
  const key = account.homeAccountId || account.localAccountId || account.username || account.username;
  const t = refreshTimers.get(key);
  if (t) {
    clearTimeout(t);
    refreshTimers.delete(key);
  }
}

function stopAllRefresh() {
  for (const t of refreshTimers.values()) clearTimeout(t);
  refreshTimers.clear();
}

export {
  pca,
  loginRedirect,
  logoutRedirect,
  processRedirect,
  getAccounts,
  acquireTokenForAccount,
  scheduleRefreshForAccount,
  stopRefreshForAccount,
  stopAllRefresh,
  defaultScopes,
};
