import { defineStore } from 'pinia'
import { ref } from 'vue'
import axios from 'axios'

export const useUserStore = defineStore('user', () => {
  const profile = ref(null)
  const loading = ref(false)
  const error = ref(null)

  async function loadProfile(accessToken) {
    loading.value = true
    error.value = null
    try {
      const resp = await axios.get('/api/me', {
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      })
      profile.value = resp.data && resp.data.profile ? resp.data.profile : null
      return profile.value
    } catch (err) {
      error.value = err && err.response ? err.response.data : err.message
      profile.value = null
      throw err
    } finally {
      loading.value = false
    }
  }

  function clear() {
    profile.value = null
    error.value = null
    loading.value = false
  }

  return { profile, loading, error, loadProfile, clear }
})
