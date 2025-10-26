require('dotenv').config();
const { ConfidentialClientApplication } = require('@azure/msal-node');
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

const clientId = process.env.AZ_CLIENT_ID;
const clientSecret = process.env.AZ_CLIENT_SECRET;
const tenant = process.env.AZ_TENANT_ID || 'common';
const authority = process.env.AZ_ISSUER || `https://login.microsoftonline.com/${tenant}`;

if (!clientId || !clientSecret) {
  // Note: we allow the module to load in dev, but OBO will fail until these are provided.
  console.warn('AZ_CLIENT_ID or AZ_CLIENT_SECRET not set: OBO flows will not work until configured.');
}

const msalConfig = {
  auth: {
    clientId,
    authority,
    clientSecret,
  }
};

const cca = new ConfidentialClientApplication(msalConfig);

async function getOboToken(incomingAccessToken, scopes = ['https://graph.microsoft.com/.default']) {
  if (!incomingAccessToken) throw new Error('missing_on_behalf_of_token');
  if (!clientId || !clientSecret) throw new Error('client_credentials_not_configured');

  const oboRequest = {
    oboAssertion: incomingAccessToken,
    scopes: scopes,
  };

  const resp = await cca.acquireTokenOnBehalfOf(oboRequest);
  if (!resp || !resp.accessToken) throw new Error('obo_acquire_failed');
  return resp.accessToken;
}

async function callGraph(path, accessToken) {
  const url = `https://graph.microsoft.com/v1.0${path}`;
  const r = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    }
  });
  if (!r.ok) {
    const body = await r.text();
    const err = new Error(`graph_error ${r.status}: ${body}`);
    err.status = r.status;
    err.body = body;
    throw err;
  }
  return r.json();
}

async function getUserProfile(accessToken) {
  // select common profile fields
  const select = 'id,givenName,surname,displayName,mail,userPrincipalName,employeeId,jobTitle,department'
  return callGraph(`/me?$select=${encodeURIComponent(select)}`, accessToken);
}

async function getManager(accessToken) {
  // manager may be present or 404
  try {
    return await callGraph('/me/manager?$select=displayName,id,mail', accessToken);
  } catch (e) {
    if (e.status === 404) return null;
    throw e;
  }
}

async function getMemberOf(accessToken) {
  // return groups (memberOf returns directoryObjects; for simplicity we'll map displayName/id)
  const j = await callGraph('/me/memberOf', accessToken);
  const groups = (j.value || []).map(g => ({ id: g.id, displayName: g.displayName || g.securityEnabled || g.mail }))
  return groups;
}

async function getOrganization(accessToken) {
  try {
    const j = await callGraph('/organization', accessToken);
    return j.value && j.value.length ? j.value[0] : null;
  } catch (e) {
    return null;
  }
}

module.exports = {
  getOboToken,
  getUserProfile,
  getManager,
  getMemberOf,
  getOrganization,
};
