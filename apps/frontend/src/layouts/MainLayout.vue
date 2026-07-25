<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useAuthStore } from '../stores/auth'

const route = useRoute()
const authStore = useAuthStore()

const displayName = computed(
  () => authStore.user?.fullName || authStore.user?.email || 'Пользователь',
)

const menuItems = [
  { path: '/', label: 'Дашборд' },
  { path: '/objects', label: 'Объекты' },
  { path: '/consumers', label: 'Потребители' },
  { path: '/meters', label: 'Счётчики' },
  { path: '/readings', label: 'Показания' },
]

function isActive(path: string) {
  if (path === '/') {
    return route.path === '/'
  }
  return route.path === path || route.path.startsWith(`${path}/`)
}
</script>

<template>
  <div class="layout">
    <aside class="sidebar">
      <div class="brand">Учёт энергоресурсов</div>
      <nav class="menu">
        <RouterLink
          v-for="item in menuItems"
          :key="item.path"
          :to="item.path"
          class="menu-item"
          :class="{ active: isActive(item.path) }"
        >
          {{ item.label }}
        </RouterLink>
      </nav>
    </aside>

    <div class="main">
      <header class="topbar">
        <span class="user-name">{{ displayName }}</span>
        <el-button @click="authStore.logout()">Выйти</el-button>
      </header>
      <section class="content">
        <router-view />
      </section>
    </div>
  </div>
</template>

<style scoped>
.layout {
  display: flex;
  min-height: 100vh;
  background: #f4f6f8;
}

.sidebar {
  width: 220px;
  flex-shrink: 0;
  background: #1f2937;
  color: #e5e7eb;
  padding: 1rem 0.75rem;
}

.brand {
  font-weight: 700;
  font-size: 0.95rem;
  padding: 0.5rem 0.75rem 1rem;
  border-bottom: 1px solid #374151;
  margin-bottom: 0.75rem;
}

.menu {
  display: grid;
  gap: 0.25rem;
}

.menu-item {
  display: block;
  padding: 0.55rem 0.75rem;
  border-radius: 6px;
  color: #d1d5db;
  text-decoration: none;
}

.menu-item:hover {
  background: #374151;
  color: #fff;
}

.menu-item.active {
  background: #2563eb;
  color: #fff;
}

.main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.topbar {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem 1.25rem;
  background: #fff;
  border-bottom: 1px solid #e5e7eb;
}

.user-name {
  color: #374151;
  font-size: 0.95rem;
}

.content {
  padding: 1.25rem;
  flex: 1;
}
</style>
