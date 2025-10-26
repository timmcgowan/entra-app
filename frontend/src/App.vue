<template>
  <div style="font-family: system-ui; padding: 20px;">
    <h1>Entra App - Skeleton</h1>

    <div style="margin-bottom: 1rem">
      <button v-if="!activeAccount" @click="login">Sign in</button>
      <button v-else @click="logout">Sign out</button>
      <span style="margin-left:1rem">Current account: <strong>{{ activeAccount ? activeAccount.username : 'none' }}</strong></span>
    </div>

    <div style="margin-bottom: 1rem">
      <label>Accounts:</label>
      <select v-model="selectedAccountId" @change="onSelectAccount">
        <option v-for="acc in accounts" :key="acc.homeAccountId || acc.localAccountId || acc.username" :value="acc.homeAccountId || acc.localAccountId || acc.username">
          {{ acc.username }}
        </option>
      </select>
      <span style="margin-left:1rem">Token expires: {{ expiresDisplay }}</span>
    </div>

    <div>
      <button @click="callPublic">Call /api/public</button>
      <button @click="callProtected">Call /api/protected</button>
    </div>

    <div style="margin-top:1rem; background:#fff6f6; padding:10px; color:#900" v-if="error">
      <strong>Error:</strong> {{ error }}
      <div style="margin-top:0.5rem">
        <button @click="reauth">Re-authenticate</button>
        <button style="margin-left:8px" @click="clearError">Dismiss</button>
      </div>
    </div>

    <pre style="margin-top:1rem; background:#f6f6f6; padding:10px">{{ output }}</pre>
  </div>
</template>

<script setup>

import { ref, onMounted, computed } from 'vue'
import axios from 'axios'
import { useAuthStore } from './store'
import { useUserStore } from './userStore'
import { loginRedirect, logoutRedirect, defaultScopes, processRedirect, getAccounts, acquireTokenForAccount, scheduleRefreshForAccount, requestReLogin, stopRefreshForAccount } from './auth'

const store = useAuthStore()
const output = ref('')
const selectedAccountId = ref('')

const accounts = computed(() => store.accounts)
const activeAccount = computed(() => store.account)
const error = computed(() => store.error)
const expiresDisplay = computed(() => {
  if (!store.tokenExpiresAt) return 'n/a'
  const diff = store.tokenExpiresAt - Date.now()
  if (diff <= 0) return 'expired'
  const s = Math.floor(diff / 1000)
  return `${s}s`
})

// Start a redirect login flow
function login() {
  // clear previous error
  store.setError(null)
  loginRedirect(defaultScopes).catch(err => {
    store.setError('login redirect failed: ' + (err.message || err))
  })
}

// Logout via redirect
function logout() {
  logoutRedirect().catch(() => {})
  // clear scheduled refreshes and state
  store.setToken('')
  store.setAccount(null)
  store.setAccounts([])
  store.setTokenExpiresAt(null)
  store.setError(null)
  output.value = 'signed out'
}

// On app load, process redirect response (if any) and acquire token silently
onMounted(async () => {
  // process redirect result if any
  try {
    const redirectResult = await processRedirect()
    // refresh account list
    const accs = getAccounts()
    store.setAccounts(accs)

    if (redirectResult && redirectResult.account) {
      // after redirect, attempt to acquire token silently and schedule refresh
      try {
        const resp = await acquireTokenForAccount(redirectResult.account)
        if (resp && resp.accessToken) {
          store.setToken(resp.accessToken)
          store.setAccount(redirectResult.account)
          // set expiry (if available)
          const payload = resp.accessToken ? JSON.parse(atob(resp.accessToken.split('.')[1])) : null
          if (payload && payload.exp) store.setTokenExpiresAt(payload.exp * 1000)
          // load profile via backend OBO
          try { const userStore = useUserStore(); userStore.loadProfile(resp.accessToken).catch(()=>{}); } catch(e) {}
          // schedule refresh
          scheduleRefreshForAccount(redirectResult.account, resp.accessToken, (r) => {
            if (r && r.accessToken) {
              store.setToken(r.accessToken)
              const p = r.accessToken ? JSON.parse(atob(r.accessToken.split('.')[1])) : null
              if (p && p.exp) store.setTokenExpiresAt(p.exp * 1000)
            }
          }, (err) => store.setError(err.message || String(err)))
          output.value = 'signed in (redirect)'
        }
      } catch (e) {
        store.setError('token acquisition after redirect failed: ' + (e.message || e))
      }
    } else {
      // if no redirect result, try to load existing accounts and silent-acquire tokens
      if (accs && accs.length) {
        // pick first account as active by default
        const a = accs[0]
        store.setAccount(a)
        selectedAccountId.value = a.homeAccountId || a.localAccountId || a.username
        try {
          const resp = await acquireTokenForAccount(a)
          if (resp && resp.accessToken) {
            store.setToken(resp.accessToken)
            const p = resp.accessToken ? JSON.parse(atob(resp.accessToken.split('.')[1])) : null
            if (p && p.exp) store.setTokenExpiresAt(p.exp * 1000)
              // load profile via backend OBO
              try { const userStore = useUserStore(); userStore.loadProfile(resp.accessToken).catch(()=>{}); } catch(e) {}
            scheduleRefreshForAccount(a, resp.accessToken, (r) => {
              if (r && r.accessToken) {
                store.setToken(r.accessToken)
                const p2 = r.accessToken ? JSON.parse(atob(r.accessToken.split('.')[1])) : null
                if (p2 && p2.exp) store.setTokenExpiresAt(p2.exp * 1000)
              }
            }, (err) => store.setError(err.message || String(err)))
            output.value = 'signed in (silent)'
          }
        } catch (e) {
          // ignore - may need interactive login later
        }
      }
    }
  } catch (e) {
    if (e && e.message) store.setError('redirect processing error: ' + e.message)
  }
})

async function onSelectAccount() {
  const id = selectedAccountId.value
  if (!id) return
  const acc = store.accounts.find(a => (a.homeAccountId || a.localAccountId || a.username) === id)
  if (!acc) return
  store.setAccount(acc)
  store.setError(null)
  try {
    const resp = await acquireTokenForAccount(acc)
    if (resp && resp.accessToken) {
      store.setToken(resp.accessToken)
      const p = resp.accessToken ? JSON.parse(atob(resp.accessToken.split('.')[1])) : null
      if (p && p.exp) store.setTokenExpiresAt(p.exp * 1000)
        // load profile via backend OBO
        try { const userStore = useUserStore(); userStore.loadProfile(resp.accessToken).catch(()=>{}); } catch(e) {}
      scheduleRefreshForAccount(acc, resp.accessToken, (r) => {
        if (r && r.accessToken) {
          store.setToken(r.accessToken)
          const p2 = r.accessToken ? JSON.parse(atob(r.accessToken.split('.')[1])) : null
          if (p2 && p2.exp) store.setTokenExpiresAt(p2.exp * 1000)
        }
      }, (err) => store.setError(err.message || String(err)))
      output.value = 'token refreshed for selected account'
    }
  } catch (e) {
    store.setError('acquire token for selected account failed: ' + (e.message || e))
  }
}

function reauth() {
  // prefer the selected account, then active account, then first account
  const acc = store.accounts.find(a => (a.homeAccountId || a.localAccountId || a.username) === selectedAccountId.value) || store.account || (store.accounts && store.accounts[0])
  try {
    // stop refresh timers for this account to avoid concurrent retries
    if (acc) stopRefreshForAccount(acc)
  } catch (e) {
    // ignore
  }
  // initiate redirect login with hint
  requestReLogin(acc, defaultScopes).catch(err => store.setError(err.message || String(err)))
}

function clearError() {
  store.setError(null)
}

async function callPublic() {
  try {
    const r = await axios.get('/api/public')
    output.value = JSON.stringify(r.data, null, 2)
  } catch (err) {
    output.value = err.toString()
  }
}

async function callProtected() {
  try {
    let token = store.token
    if (!token) {
      // try to silently acquire
      try {
        if (store.account) {
          const resp = await acquireTokenForAccount(store.account)
          if (resp && resp.accessToken) {
            token = resp.accessToken
            store.setToken(token)
          }
        }
      } catch (e) {
        output.value = 'unable to acquire token: ' + (e.message || e)
        return
      }
    }

    const headers = { Authorization: `Bearer ${token}` }
    const r = await axios.get('/api/protected', { headers })
    output.value = JSON.stringify(r.data, null, 2)
  } catch (err) {
    output.value = err.response ? JSON.stringify(err.response.data) : err.toString()
  }
}
</script>
