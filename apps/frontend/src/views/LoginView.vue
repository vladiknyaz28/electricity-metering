<script setup lang="ts">
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import axios from 'axios'
import { useAuthStore } from '../stores/auth'

const authStore = useAuthStore()
const router = useRouter()
const route = useRoute()

const email = ref('')
const password = ref('')
const errorMessage = ref('')
const loading = ref(false)

async function onSubmit() {
  errorMessage.value = ''
  loading.value = true

  try {
    await authStore.login(email.value, password.value)
    await authStore.fetchProfile()

    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/'
    await router.push(redirect || '/')
  } catch (error) {
    if (axios.isAxiosError(error)) {
      if (error.response?.status === 401) {
        errorMessage.value = 'Неверный email или пароль'
      } else if (!error.response) {
        errorMessage.value = 'Не удаётся подключиться к серверу'
      } else {
        errorMessage.value = 'Не удалось войти. Попробуйте ещё раз.'
      }
    } else {
      errorMessage.value = 'Не удалось войти. Попробуйте ещё раз.'
    }
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <main class="page">
    <form class="card" @submit.prevent="onSubmit">
      <h1>Вход</h1>
      <p class="hint">Сервис учёта энергоресурсов</p>

      <label>
        Email
        <input v-model="email" type="email" required autocomplete="username" />
      </label>

      <label>
        Пароль
        <input
          v-model="password"
          type="password"
          required
          minlength="6"
          autocomplete="current-password"
        />
      </label>

      <p v-if="errorMessage" class="error">{{ errorMessage }}</p>

      <button type="submit" :disabled="loading">
        {{ loading ? 'Вход...' : 'Войти' }}
      </button>
    </form>
  </main>
</template>

<style scoped>
.page {
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: 1.5rem;
  background: #f4f6f8;
}

.card {
  width: min(100%, 380px);
  display: grid;
  gap: 0.85rem;
  padding: 1.5rem;
  background: #fff;
  border: 1px solid #d9dee5;
  border-radius: 8px;
}

h1 {
  margin: 0;
  font-size: 1.4rem;
}

.hint {
  margin: 0 0 0.5rem;
  color: #5b6573;
  font-size: 0.95rem;
}

label {
  display: grid;
  gap: 0.35rem;
  font-size: 0.9rem;
}

input {
  padding: 0.55rem 0.65rem;
  border: 1px solid #c5CCD6;
  border-radius: 6px;
  font: inherit;
}

button {
  margin-top: 0.35rem;
  padding: 0.65rem 0.9rem;
  border: none;
  border-radius: 6px;
  background: #1f6feb;
  color: #fff;
  font: inherit;
  cursor: pointer;
}

button:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

.error {
  margin: 0;
  color: #b42318;
  font-size: 0.9rem;
}
</style>
