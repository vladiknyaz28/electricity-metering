import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import api from '../api/client'
import type { AuthUser, LoginResponse } from '../types/auth'

const TOKEN_KEY = 'accessToken'

export const useAuthStore = defineStore('auth', () => {
  const accessToken = ref<string | null>(localStorage.getItem(TOKEN_KEY))
  const user = ref<AuthUser | null>(null)

  const isAuthenticated = computed(() => Boolean(accessToken.value))
  const role = computed(() => user.value?.role ?? null)
  const isSuperAdmin = computed(() => user.value?.isSuperAdmin === true)

  function clearSession() {
    accessToken.value = null
    user.value = null
    localStorage.removeItem(TOKEN_KEY)
  }

  async function login(email: string, password: string) {
    const { data } = await api.post<LoginResponse>('/auth/login', {
      email,
      password,
    })
    accessToken.value = data.accessToken
    localStorage.setItem(TOKEN_KEY, data.accessToken)
    return data
  }

  async function fetchProfile() {
    const { data } = await api.get<AuthUser>('/auth/me')
    user.value = data
    return data
  }

  async function logout() {
    clearSession()
    const { default: router } = await import('../router')
    await router.push('/login')
  }

  if (accessToken.value) {
    fetchProfile().catch(() => {
      clearSession()
    })
  }

  return {
    accessToken,
    user,
    isAuthenticated,
    role,
    isSuperAdmin,
    login,
    fetchProfile,
    logout,
    clearSession,
  }
})
