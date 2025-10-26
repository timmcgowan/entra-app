import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useAuthStore = defineStore('auth', () => {
  const token = ref('')
  const account = ref(null)
  const accounts = ref([])
  const tokenExpiresAt = ref(null)
  const error = ref(null)

  function setToken(t) { token.value = t }
  function setAccount(a) { account.value = a }
  function setAccounts(list) { accounts.value = list }
  function setTokenExpiresAt(ts) { tokenExpiresAt.value = ts }
  function setError(e) { error.value = e }

  return { token, account, accounts, tokenExpiresAt, error, setToken, setAccount, setAccounts, setTokenExpiresAt, setError }
})
