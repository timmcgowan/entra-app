# Entra App (skeleton)

This repository contains a skeleton demonstrating a Policy Enforcement Point (PEP) and Policy Decision Point (PDP) using an Express backend and OPA as the decision service. The frontend is a minimal Vue 3 + Pinia app used to gate UI and call the backend.

Quick start (local dev)

1. Backend

```bash
cd backend
npm install
npm run start
```

2. Frontend

```bash
cd frontend
npm install
npm run dev
```

The frontend uses relative API paths (e.g. `/api/protected`). When running frontend dev server and backend on different ports, configure a proxy in Vite or call backend directly.

Run with Docker (OPA + backend + frontend static server):

```bash
# from repository root
docker compose up --build
```

Files of interest

- `backend/authorizer.js` - Express middleware that queries OPA for allowance decisions.
- `opa/policy.rego` - example Rego policy demonstrating role and resource checks.
- `frontend/src` - small Vue + Pinia app to demonstrate token storage and API calls.

Environment & MS Entra integration
---------------------------------

The backend authorizer supports validating JWTs issued by Microsoft Entra (Azure AD) using the provider's JWKS endpoint.

Set these environment variables for proper validation when running the backend:

- `AZ_TENANT_ID` - your tenant id (or use `common` for testing). Used to construct the issuer and JWKS URL.
- `AZ_AUDIENCE` - expected audience (the API's Application (client) ID or scope/audience).
- `AZ_ISSUER` - optional issuer override. If not set the middleware builds it from `AZ_TENANT_ID`.
- `DISABLE_JWT_VALIDATION` - set to `true` to skip signature verification (dev only).

Example `.env` for development (create `backend/.env`):

```
AZ_TENANT_ID=your-tenant-id
AZ_AUDIENCE=your-api-client-id
OPA_URL=http://opa:8181/v1/data/authz/allow
ALLOW_ALL=false
DISABLE_JWT_VALIDATION=false
```

Next steps to wire MSAL-based SPA
---------------------------------
- Use `@azure/msal-browser` in the SPA to sign in users and obtain access tokens.
- Configure the SPA with an application registration and set the API scope to the backend audience.
- The SPA should send the access token in the `Authorization: Bearer <token>` header when calling protected backend endpoints.
- The backend will validate the token signature and claims before sending the decision request to OPA.

SPA (MSAL) quick guide
----------------------

This skeleton includes a small MSAL wrapper at `frontend/src/auth.js` and a login flow wired into `frontend/src/App.vue`.

Configure the SPA by setting Vite environment variables (create a `.env` file in `frontend/`):

```
VITE_MSAL_CLIENT_ID=your-spa-client-id
VITE_MSAL_AUTHORITY=https://login.microsoftonline.com/your-tenant-id
VITE_MSAL_SCOPES=api://your-backend-client-id/.default

If you prefer a redirect-based flow (recommended for SPAs in many production scenarios), set a redirect URI and the app will handle the callback on load.

Add the redirect URI (optional, defaults to app origin):

```
VITE_MSAL_REDIRECT_URI=https://localhost:5173
```

Notes about redirect flow in this skeleton:
- The SPA now uses redirect flows. Clicking "Login" will redirect to the Entra sign-in page and return to the app's redirect URI.
- On app load the code calls `processRedirect()` to parse the response and then attempts to `acquireTokenSilent()` to obtain the access token. If silent acquisition fails an interactive redirect may be triggered by `acquireToken()`.

Auth callback route and retry/backoff
-----------------------------------

This project now provides a dedicated redirect callback route at `/auth-callback` (implemented with `vue-router`). Set `VITE_MSAL_REDIRECT_URI` to a path that ends with `/auth-callback`, e.g. `http://localhost:5173/auth-callback` and register that exact URI in your Entra app registration.

Silent refresh behavior:
- Tokens are refreshed silently and scheduled 60s before expiry.
- If a silent refresh fails, the client uses exponential backoff (2s, 4s, 8s, ...) up to 5 attempts. After repeated failures the UI surface shows an error and you should re-authenticate.

Files added/changed for this feature:
- `frontend/src/router/index.js` - router and `/auth-callback` route.
- `frontend/src/pages/AuthCallback.vue` - component that handles MSAL redirect result.
- `frontend/src/auth.js` - added `getAccounts`, `scheduleRefreshForAccount`, and retry/backoff logic.
- `frontend/src/main.js` - registers the router.

```

Notes:
- `VITE_MSAL_SCOPES` is a comma-separated list of scopes the SPA will request. For a backend-protected API, set the API scope (for example `api://<api-client-id>/access_as_user`).
- The SPA uses popup flows by default to simplify testing. For production you'd typically use redirect flows and proper route handling.
- The SPA stores tokens in memory/Pinia and uses `Authorization: Bearer <token>` when calling the backend.

When you run the frontend dev server (`npm run dev`), Vite will inject `import.meta.env` variables.

Next steps / integration notes

- Replace the simple JWT parsing in `authorizer.js` with proper verification against Microsoft Entra (validate signatures, issuer, audiences).
- Enrich OPA input with PIP context: device posture, Entra claims (roles/groups), resource metadata, IP, geolocation, tenant, feature flags.
- Add CI/CD to validate Rego policies (opa test, opa eval) and rollout policies via pipeline.
- Consider using Styra or an OPA sidecar for large-scale deployments.
