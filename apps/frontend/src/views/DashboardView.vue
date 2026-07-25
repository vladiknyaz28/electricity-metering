<script setup lang="ts">
import { computed } from 'vue'
import { useAuthStore } from '../stores/auth'

const authStore = useAuthStore()

const roleLabels: Record<string, string> = {
  admin: 'Администратор',
  object_manager: 'Менеджер объекта',
  consumer: 'Потребитель',
  auditor: 'Аудитор',
}

const greetingName = computed(
  () => authStore.user?.fullName || authStore.user?.email || 'пользователь',
)

const roleLabel = computed(() => {
  const role = authStore.role
  if (!role) return '—'
  return roleLabels[role] ?? role
})
</script>

<template>
  <main class="page">
    <header class="header">
      <div>
        <h1>Здравствуйте, {{ greetingName }}</h1>
        <p v-if="authStore.role === 'admin'">Вы вошли как: Администратор</p>
        <p v-else-if="authStore.role === 'object_manager'">Вы вошли как: Менеджер объекта</p>
        <p v-else-if="authStore.role === 'consumer'">Вы вошли как: Потребитель</p>
        <p v-else-if="authStore.role === 'auditor'">Вы вошли как: Аудитор</p>
        <p v-else>Вы вошли как: {{ roleLabel }}</p>
      </div>
      <button type="button" @click="authStore.logout()">Выйти</button>
    </header>

    <section class="card">
      <h2>Dashboard</h2>
      <p>Это заглушка главной страницы. Ролевая навигация появится на следующих шагах.</p>
      <ul>
        <li>Email: {{ authStore.user?.email }}</li>
        <li>Роль (код): {{ authStore.user?.role }}</li>
        <li>consumerId: {{ authStore.user?.consumerId ?? '—' }}</li>
      </ul>
    </section>
  </main>
</template>

<style scoped>
.page {
  min-height: 100vh;
  padding: 1.5rem;
  background: #f4f6f8;
}

.header {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  align-items: flex-start;
  margin-bottom: 1rem;
}

h1 {
  margin: 0 0 0.35rem;
  font-size: 1.4rem;
}

h2 {
  margin: 0 0 0.5rem;
  font-size: 1.1rem;
}

p {
  margin: 0;
  color: #445;
}

.card {
  padding: 1.25rem;
  background: #fff;
  border: 1px solid #d9dee5;
  border-radius: 8px;
}

ul {
  margin: 0.75rem 0 0;
  padding-left: 1.2rem;
}

button {
  padding: 0.55rem 0.9rem;
  border: 1px solid #c5ccd6;
  border-radius: 6px;
  background: #fff;
  font: inherit;
  cursor: pointer;
}
</style>
