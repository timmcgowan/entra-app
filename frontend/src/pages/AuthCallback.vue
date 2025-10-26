<template>
  <div style="padding: 20px; font-family: system-ui;">
    <h2>Auth callback</h2>
    <p v-if="status">{{ status }}</p>
    <p v-if="error" style="color: #900">Error: {{ error }}</p>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { processRedirect, getAccounts, acquireTokenForAccount, scheduleRefreshForAccount } from '../auth'
import { useAuthStore } from '../store'
import { useUserStore } from '../userStore'

const status = ref('processing...')
const error = ref(null)
const store = useAuthStore()
const router = useRouter()

onMounted(async () => {
  try {
    const result = await processRedirect()
    // update accounts
    const accs = getAccounts()
    store.setAccounts(accs)

    if (result && result.account) {
      // try to silently acquire token for this account and schedule refresh
      try {
        const resp = await acquireTokenForAccount(result.account)
        if (resp && resp.accessToken) {
          store.setToken(resp.accessToken)
          store.setAccount(result.account)
          const payload = resp.accessToken ? JSON.parse(atob(resp.accessToken.split('.')[1])) : null
          if (payload && payload.exp) store.setTokenExpiresAt(payload.exp * 1000)
          // populate user profile from backend using OBO
          try {
            const userStore = useUserStore()
            userStore.loadProfile(resp.accessToken).catch(() => {})
          } catch (e) {
            // ignore
          }

          scheduleRefreshForAccount(result.account, resp.accessToken, (r) => {
            if (r && r.accessToken) {
              store.setToken(r.accessToken)
              const p = r.accessToken ? JSON.parse(atob(r.accessToken.split('.')[1])) : null
              if (p && p.exp) store.setTokenExpiresAt(p.exp * 1000)
            }
          }, (err) => store.setError(err.message || String(err)))
          status.value = 'Sign in successful'
        } else {
          status.value = 'Sign in complete, waiting for token acquisition'
        }
      } catch (e) {
        error.value = e.message || String(e)
        store.setError(error.value)
      }
    } else {
      status.value = 'No redirect results; returning to home'
    }

    // navigate back to home after a short delay using router
    setTimeout(() => {
      router.replace({ path: '/' })
    }, 800)
  } catch (e) {
    error.value = e.message || String(e)
    store.setError(error.value)
    status.value = 'Error processing redirect'
    setTimeout(() => router.replace({ path: '/' }), 1200)
  }
})
</script>
