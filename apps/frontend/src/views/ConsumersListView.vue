<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Search } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import axios from 'axios'
import { useAuthStore } from '../stores/auth'
import { getObjects } from '../api/objects'
import {
  deleteConsumer,
  getConsumers,
  hardDeleteConsumer,
} from '../api/consumers'
import type { EnergyObject } from '../types/object'
import type { Consumer } from '../types/consumer'
import ConsumerFormDialog from '../components/ConsumerFormDialog.vue'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const isAdmin = computed(() => authStore.role === 'admin')

const consumers = ref<Consumer[]>([])
const objects = ref<EnergyObject[]>([])
const loading = ref(false)
const search = ref('')
const statusFilter = ref<'all' | 'active' | 'inactive'>('all')
const objectFilter = ref<string>('all')
const currentPage = ref(1)
const pageSize = 9
const highlightedId = ref<string | null>(null)

const dialogVisible = ref(false)
const editingConsumer = ref<Consumer | null>(null)

const typeLabels: Record<string, string> = {
  individual: 'Физическое лицо',
  legal_entity: 'Юридическое лицо',
}

const queryObjectId = computed(() => {
  const value = route.query.objectId
  return typeof value === 'string' && value ? value : null
})

const filteredObjectName = computed(() => {
  if (!queryObjectId.value) return ''
  return (
    objects.value.find((item) => item.id === queryObjectId.value)?.name ||
    consumers.value.find((item) => item.objectId === queryObjectId.value)?.object?.name ||
    ''
  )
})

const filteredConsumers = computed(() => {
  const query = search.value.trim().toLowerCase()
  return consumers.value.filter((item) => {
    const matchesStatus =
      statusFilter.value === 'all' ? true : item.status === statusFilter.value
    const matchesObject =
      objectFilter.value === 'all' ? true : item.objectId === objectFilter.value
    const matchesSearch =
      !query ||
      item.name.toLowerCase().includes(query) ||
      (item.contactPerson ?? '').toLowerCase().includes(query) ||
      (item.email ?? '').toLowerCase().includes(query)
    return matchesStatus && matchesObject && matchesSearch
  })
})

const pagedConsumers = computed(() => {
  const start = (currentPage.value - 1) * pageSize
  return filteredConsumers.value.slice(start, start + pageSize)
})

const totalFiltered = computed(() => filteredConsumers.value.length)

async function loadData() {
  loading.value = true
  try {
    const [consumersData, objectsData] = await Promise.all([
      getConsumers(),
      getObjects(),
    ])
    consumers.value = consumersData
    objects.value = objectsData
  } catch {
    ElMessage.error('Не удалось загрузить потребителей')
  } finally {
    loading.value = false
  }
}

function applyQueryObjectFilter() {
  if (queryObjectId.value) {
    objectFilter.value = queryObjectId.value
    currentPage.value = 1
  }
}

function clearObjectQueryFilter() {
  objectFilter.value = 'all'
  router.replace({ path: '/consumers', query: {} })
}

function openCreate() {
  editingConsumer.value = null
  dialogVisible.value = true
}

function openEdit(consumer: Consumer) {
  editingConsumer.value = consumer
  dialogVisible.value = true
}

function onSaved(saved: Consumer) {
  const index = consumers.value.findIndex((item) => item.id === saved.id)
  if (index >= 0) {
    consumers.value[index] = {
      ...saved,
      _count: saved._count ?? consumers.value[index]._count,
      object: saved.object ?? consumers.value[index].object,
      tariff: saved.tariff ?? null,
    }
  } else {
    consumers.value.unshift({
      ...saved,
      _count: saved._count ?? { meters: 0, users: 0 },
    })
  }
}

async function onDelete(consumer: Consumer) {
  try {
    const updated = await deleteConsumer(consumer.id)
    const index = consumers.value.findIndex((item) => item.id === consumer.id)
    if (index >= 0) {
      consumers.value[index] = {
        ...consumers.value[index],
        ...updated,
        status: 'inactive',
        _count: updated._count ?? consumers.value[index]._count,
      }
    }
    ElMessage.success('Потребитель удалён')
  } catch {
    ElMessage.error('Не удалось удалить потребителя')
  }
}

function canHardDelete(consumer: Consumer) {
  return (
    consumer.status === 'inactive' &&
    (consumer._count?.meters ?? 0) === 0 &&
    (consumer._count?.users ?? 0) === 0
  )
}

function getErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const message = error.response?.data?.message
    if (Array.isArray(message)) return message.join(', ')
    if (typeof message === 'string' && message) return message
  }
  return 'Не удалось удалить потребителя окончательно'
}

async function onHardDelete(consumer: Consumer) {
  try {
    await hardDeleteConsumer(consumer.id)
    consumers.value = consumers.value.filter((item) => item.id !== consumer.id)
    ElMessage.success('Потребитель удалён окончательно')
  } catch (error) {
    ElMessage.error(getErrorMessage(error))
  }
}

function goToMeters(consumerId: string) {
  router.push({ path: '/meters', query: { consumerId } })
}

function goToObject(objectId: string) {
  router.push({ path: '/objects', query: { highlightId: objectId } })
}

async function applyHighlight() {
  const highlightId =
    typeof route.query.highlightId === 'string' ? route.query.highlightId : null
  if (!highlightId) return

  const indexInFiltered = filteredConsumers.value.findIndex(
    (item) => item.id === highlightId,
  )
  if (indexInFiltered < 0) return

  currentPage.value = Math.floor(indexInFiltered / pageSize) + 1
  highlightedId.value = highlightId
  await nextTick()
  const el = document.getElementById(`consumer-card-${highlightId}`)
  el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  window.setTimeout(() => {
    if (highlightedId.value === highlightId) highlightedId.value = null
  }, 2500)
}

watch(
  () => route.query.objectId,
  () => {
    applyQueryObjectFilter()
  },
)

watch(
  () => route.query.highlightId,
  async () => {
    if (!loading.value) await applyHighlight()
  },
)

onMounted(async () => {
  applyQueryObjectFilter()
  await loadData()
  applyQueryObjectFilter()
  await applyHighlight()
})
</script>

<template>
  <div v-loading="loading" class="page">
    <div class="toolbar">
      <h2>Потребители</h2>
      <div class="toolbar-actions">
        <el-input
          v-model="search"
          clearable
          placeholder="Поиск по имени, контакту или email"
          :prefix-icon="Search"
          style="width: 280px"
          @input="currentPage = 1"
        />
        <el-select
          v-model="statusFilter"
          style="width: 150px"
          @change="currentPage = 1"
        >
          <el-option label="Все" value="all" />
          <el-option label="Активен" value="active" />
          <el-option label="Неактивен" value="inactive" />
        </el-select>
        <el-select
          v-model="objectFilter"
          filterable
          style="width: 220px"
          :disabled="Boolean(queryObjectId)"
          @change="currentPage = 1"
        >
          <el-option label="Все объекты" value="all" />
          <el-option
            v-for="item in objects"
            :key="item.id"
            :label="item.name"
            :value="item.id"
          />
        </el-select>
        <el-button v-if="isAdmin" type="primary" @click="openCreate">
          Добавить потребителя
        </el-button>
      </div>
    </div>

    <el-alert
      v-if="queryObjectId"
      class="banner"
      type="info"
      show-icon
      closable
      @close="clearObjectQueryFilter"
    >
      <template #title>
        <div class="banner-row">
          <span>
            Показаны потребители объекта:
            {{ filteredObjectName || 'выбранного объекта' }}
          </span>
          <el-button link type="primary" @click="clearObjectQueryFilter">
            Показать всех потребителей
          </el-button>
        </div>
      </template>
    </el-alert>

    <el-empty
      v-if="!loading && consumers.length === 0"
      description="Пока нет ни одного потребителя"
    >
      <el-button v-if="isAdmin" type="primary" @click="openCreate">
        Добавить потребителя
      </el-button>
    </el-empty>

    <el-empty
      v-else-if="!loading && filteredConsumers.length === 0"
      description="Потребители не найдены"
    />

    <template v-else-if="!loading">
      <div class="grid">
        <el-card
          v-for="item in pagedConsumers"
          :id="`consumer-card-${item.id}`"
          :key="item.id"
          shadow="hover"
          class="card"
          :class="{ highlighted: highlightedId === item.id }"
        >
          <div class="card-top">
            <strong>{{ item.name }}</strong>
            <el-tag :type="item.status === 'active' ? 'success' : 'info'" size="small">
              {{ item.status === 'active' ? 'Активен' : 'Неактивен' }}
            </el-tag>
          </div>

          <div class="meta">{{ typeLabels[item.type] || item.type }}</div>
          <div class="line">
            Объект:
            <el-link type="primary" @click="goToObject(item.objectId)">
              → {{ item.object?.name || '—' }}
            </el-link>
          </div>
          <div v-if="item.contactPerson" class="line">Контакт: {{ item.contactPerson }}</div>
          <div v-if="item.phone" class="line">Телефон: {{ item.phone }}</div>
          <div v-if="item.email" class="line">Email: {{ item.email }}</div>
          <div class="line">Тариф: {{ item.tariff?.name || 'Не назначен' }}</div>

          <div class="counts">
            <el-link type="primary" @click="goToMeters(item.id)">
              Счётчики: {{ item._count?.meters ?? 0 }}
            </el-link>
            <span>Пользователи: {{ item._count?.users ?? 0 }}</span>
          </div>

          <div v-if="isAdmin" class="actions">
            <el-button size="small" @click="openEdit(item)">Редактировать</el-button>
            <el-popconfirm
              :title="`Удалить потребителя ${item.name}?`"
              confirm-button-text="Удалить"
              cancel-button-text="Отмена"
              @confirm="onDelete(item)"
            >
              <template #reference>
                <el-button size="small" type="danger">Удалить</el-button>
              </template>
            </el-popconfirm>
            <el-popconfirm
              v-if="canHardDelete(item)"
              title="Это действие необратимо. Потребитель и вся история будут удалены без возможности восстановления. Продолжить?"
              confirm-button-text="Да, удалить навсегда"
              cancel-button-text="Отмена"
              confirm-button-type="danger"
              @confirm="onHardDelete(item)"
            >
              <template #reference>
                <el-button size="small" type="danger" plain>Удалить окончательно</el-button>
              </template>
            </el-popconfirm>
          </div>
        </el-card>
      </div>

      <div class="pager">
        <el-pagination
          v-model:current-page="currentPage"
          background
          layout="prev, pager, next"
          :page-size="pageSize"
          :total="totalFiltered"
        />
      </div>
    </template>

    <ConsumerFormDialog
      v-model="dialogVisible"
      :consumer="editingConsumer"
      @saved="onSaved"
    />
  </div>
</template>

<style scoped>
.page {
  min-height: 320px;
}

.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
  margin-bottom: 1rem;
  flex-wrap: wrap;
}

.toolbar h2 {
  margin: 0;
}

.toolbar-actions {
  display: flex;
  gap: 0.75rem;
  align-items: center;
  flex-wrap: wrap;
}

.banner {
  margin-bottom: 1rem;
}

.banner-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 1rem;
}

.card.highlighted {
  outline: 2px solid var(--el-color-primary);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--el-color-primary) 25%, transparent);
}

.card-top {
  display: flex;
  justify-content: space-between;
  gap: 0.5rem;
  align-items: flex-start;
  margin-bottom: 0.5rem;
}

.meta,
.line {
  color: #4b5563;
  font-size: 0.9rem;
  margin: 0.2rem 0;
}

.counts {
  display: flex;
  gap: 1rem;
  margin: 0.75rem 0;
  font-size: 0.9rem;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.pager {
  display: flex;
  justify-content: center;
  margin-top: 1.25rem;
}
</style>
