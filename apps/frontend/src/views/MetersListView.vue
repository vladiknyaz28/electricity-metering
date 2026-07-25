<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { getMeters } from '../api/meters'
import { getObjects } from '../api/objects'
import { getConsumers } from '../api/consumers'
import type { Meter } from '../types/meter'
import type { EnergyObject } from '../types/object'
import type { Consumer } from '../types/consumer'

const route = useRoute()
const router = useRouter()

const meters = ref<Meter[]>([])
const objects = ref<EnergyObject[]>([])
const consumers = ref<Consumer[]>([])
const loading = ref(false)
const objectFilter = ref<string>('all')
const consumerFilterId = ref<string | null>(null)

const filterObjectId = computed(() => {
  const value = route.query.objectId
  return typeof value === 'string' && value ? value : null
})

const filterConsumerId = computed(() => {
  const value = route.query.consumerId
  return typeof value === 'string' && value ? value : null
})

const hasQueryFilter = computed(
  () => Boolean(filterObjectId.value || filterConsumerId.value),
)

const filterBannerText = computed(() => {
  const parts: string[] = []
  if (filterObjectId.value) {
    const objectName =
      objects.value.find((item) => item.id === filterObjectId.value)?.name ||
      meters.value.find((item) => item.objectId === filterObjectId.value)?.object?.name
    parts.push(`объекта: ${objectName || 'выбранного объекта'}`)
  }
  if (filterConsumerId.value) {
    const consumerName =
      consumers.value.find((item) => item.id === filterConsumerId.value)?.name ||
      meters.value.find((item) => item.consumerId === filterConsumerId.value)?.consumer
        ?.name
    parts.push(`потребителя: ${consumerName || 'выбранного потребителя'}`)
  }
  return `Показаны счётчики ${parts.join(' / ')}`
})

const filteredMeters = computed(() => {
  return meters.value.filter((item) => {
    const matchesObjectQuery = filterObjectId.value
      ? item.objectId === filterObjectId.value
      : objectFilter.value === 'all'
        ? true
        : item.objectId === objectFilter.value
    const matchesConsumerQuery = filterConsumerId.value
      ? item.consumerId === filterConsumerId.value
      : consumerFilterId.value
        ? item.consumerId === consumerFilterId.value
        : true
    return matchesObjectQuery && matchesConsumerQuery
  })
})

async function loadData() {
  loading.value = true
  try {
    const [metersData, objectsData, consumersData] = await Promise.all([
      getMeters(),
      getObjects().catch(() => [] as EnergyObject[]),
      getConsumers().catch(() => [] as Consumer[]),
    ])
    meters.value = metersData
    objects.value = objectsData
    consumers.value = consumersData
  } catch {
    ElMessage.error('Не удалось загрузить счётчики')
  } finally {
    loading.value = false
  }
}

function applyQueryFilters() {
  if (filterObjectId.value) {
    objectFilter.value = filterObjectId.value
  }
  consumerFilterId.value = filterConsumerId.value
}

function clearQueryFilters() {
  objectFilter.value = 'all'
  consumerFilterId.value = null
  router.replace({ path: '/meters', query: {} })
}

function goToReadings(meterId: string) {
  router.push({ path: '/readings', query: { meterId } })
}

function goToObject(objectId: string) {
  router.push({ path: '/objects', query: { highlightId: objectId } })
}

function goToConsumer(consumerId: string) {
  router.push({ path: '/consumers', query: { highlightId: consumerId } })
}

watch(
  () => [route.query.objectId, route.query.consumerId],
  () => {
    applyQueryFilters()
  },
)

onMounted(async () => {
  applyQueryFilters()
  await loadData()
  await nextTick()
})
</script>

<template>
  <div v-loading="loading" class="page">
    <div class="toolbar">
      <h2>Счётчики</h2>
      <div class="toolbar-actions">
        <el-select
          v-model="objectFilter"
          filterable
          style="width: 240px"
          :disabled="Boolean(filterObjectId)"
        >
          <el-option label="Все объекты" value="all" />
          <el-option
            v-for="item in objects"
            :key="item.id"
            :label="item.name"
            :value="item.id"
          />
        </el-select>
      </div>
    </div>

    <el-alert
      v-if="hasQueryFilter"
      class="banner"
      type="info"
      show-icon
      closable
      @close="clearQueryFilters"
    >
      <template #title>
        <div class="banner-row">
          <span>{{ filterBannerText }}</span>
          <el-button link type="primary" @click="clearQueryFilters">
            Показать все счётчики
          </el-button>
        </div>
      </template>
    </el-alert>

    <el-empty
      v-if="!loading && filteredMeters.length === 0"
      description="Счётчики не найдены"
    />

    <el-table v-else-if="!loading" :data="filteredMeters" stripe>
      <el-table-column prop="name" label="Название" min-width="140" />
      <el-table-column prop="serialNumber" label="Серийный номер" min-width="140" />
      <el-table-column label="Объект" min-width="140">
        <template #default="{ row }">
          <el-link type="primary" @click="goToObject(row.objectId)">
            {{ row.object?.name || '—' }}
          </el-link>
        </template>
      </el-table-column>
      <el-table-column label="Потребитель" min-width="140">
        <template #default="{ row }">
          <el-link
            v-if="row.consumerId"
            type="primary"
            @click="goToConsumer(row.consumerId)"
          >
            {{ row.consumer?.name || '—' }}
          </el-link>
          <span v-else>—</span>
        </template>
      </el-table-column>
      <el-table-column label="Статус" width="120">
        <template #default="{ row }">
          <el-tag :type="row.status === 'active' ? 'success' : 'info'" size="small">
            {{ row.status === 'active' ? 'Активен' : row.status }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="Действия" min-width="160">
        <template #default="{ row }">
          <el-link type="primary" @click="goToReadings(row.id)">
            Показания ({{ row._count?.readings ?? 0 }})
          </el-link>
        </template>
      </el-table-column>
    </el-table>
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
</style>
