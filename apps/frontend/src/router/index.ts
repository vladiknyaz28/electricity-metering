import { createRouter, createWebHistory } from 'vue-router'
import { ElMessage } from 'element-plus'
import { useAuthStore } from '../stores/auth'
import LoginView from '../views/LoginView.vue'
import MainLayout from '../layouts/MainLayout.vue'
import DashboardView from '../views/DashboardView.vue'
import ObjectsListView from '../views/ObjectsListView.vue'
import ConsumersListView from '../views/ConsumersListView.vue'
import MetersListView from '../views/MetersListView.vue'
import ReadingsListView from '../views/ReadingsListView.vue'
import TariffsListView from '../views/TariffsListView.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/login',
      name: 'login',
      component: LoginView,
      meta: { requiresAuth: false },
    },
    {
      path: '/',
      component: MainLayout,
      meta: { requiresAuth: true },
      children: [
        {
          path: '',
          redirect: '/dashboard',
        },
        {
          path: 'dashboard',
          name: 'dashboard',
          component: DashboardView,
        },
        {
          path: 'objects',
          name: 'objects',
          component: ObjectsListView,
          meta: { roles: ['admin', 'object_manager'] },
        },
        {
          path: 'consumers',
          name: 'consumers',
          component: ConsumersListView,
          meta: { roles: ['admin', 'object_manager'] },
        },
        {
          path: 'meters',
          name: 'meters',
          component: MetersListView,
          meta: { roles: ['admin', 'object_manager', 'consumer'] },
        },
        {
          path: 'readings',
          name: 'readings',
          component: ReadingsListView,
          meta: { roles: ['admin', 'object_manager', 'consumer'] },
        },
        {
          path: 'tariffs',
          name: 'tariffs',
          component: TariffsListView,
          meta: { roles: ['admin', 'object_manager'] },
        },
      ],
    },
    {
      path: '/:pathMatch(.*)*',
      redirect: '/dashboard',
    },
  ],
})

router.beforeEach((to) => {
  const authStore = useAuthStore()

  if (to.meta.requiresAuth && !authStore.isAuthenticated) {
    return {
      path: '/login',
      query: { redirect: to.fullPath },
    }
  }

  if (to.path === '/login' && authStore.isAuthenticated) {
    const redirect =
      typeof to.query.redirect === 'string' ? to.query.redirect : '/dashboard'
    return redirect || '/dashboard'
  }

  const roles = to.matched
    .map((record) => record.meta.roles as string[] | undefined)
    .find((value) => Array.isArray(value) && value.length > 0)

  if (roles && authStore.role && !roles.includes(authStore.role)) {
    ElMessage.error('Недостаточно прав')
    return { path: '/dashboard' }
  }

  return true
})

export default router
