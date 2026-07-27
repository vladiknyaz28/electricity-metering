import axios from 'axios'

const apiBaseUrl =
  import.meta.env.VITE_API_BASE_URL?.trim() || 'http://localhost:4000'

const api = axios.create({
  baseURL: apiBaseUrl,
})

api.interceptors.request.use(async (config) => {
  const { useAuthStore } = await import('../stores/auth')
  const authStore = useAuthStore()
  if (authStore.accessToken) {
    config.headers.Authorization = `Bearer ${authStore.accessToken}`
  }
  return config
})

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const status = error.response?.status
    const url = String(error.config?.url ?? '')

    if (status === 401 && !url.includes('/auth/login')) {
      const { useAuthStore } = await import('../stores/auth')
      const authStore = useAuthStore()
      authStore.clearSession()

      const { default: router } = await import('../router')
      if (router.currentRoute.value.path !== '/login') {
        await router.push({
          path: '/login',
          query: { redirect: router.currentRoute.value.fullPath },
        })
      }
    }

    return Promise.reject(error)
  },
)

export default api
