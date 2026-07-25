<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Search } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import axios from 'axios'
import { useAuthStore } from '../stores/auth'
import { deleteMeter, getMeters } from '../api/meters'
import { getObjects } from '../api/objects'
import { getConsumers } from '../api/consumers'
import type { Meter } from '../types/meter'
import type { EnergyObject } from '../types/object'
import type { Consumer } from '../types/consumer'
import EntityCard from '../components/EntityCard.vue'
import MeterFormDialog from '../components/MeterFormDialog.vue'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()

const canManage = computed(
  () => authStore.role === 'admin' || authStore.role === 'object_manager',
)

const meters = ref<Meter[]>([])
const objects = ref<EnergyObject[]>([])
const consumers = ref<Consumer[]>([])
const loading = ref(false)
const search = ref('')
const statusFilter = ref<'all' | 'active' | 'inactive'>('all')
const objectFilter = ref<string>('all')
const consumerFilterId = ref<string | null>(null)
const currentPage = ref(1)
const pageSize = 9

const dialogVisible = ref(false)
const editingMeter = ref<Meter | null>(null)

const tariffTypeLabels: Record<string, string> = {
  single: 'Однотарифный',
  double: 'Двухтарифный',
  triple: 'Трёхтарифный',
}

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
  const query = search.value.trim().toLowerCase()
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
    const matchesStatus =
      statusFilter.value === 'all' ? true : item.status === statusFilter.value
    const matchesSearch =
      !query ||
      item.name.toLowerCase().includes(query) ||
      item.serialNumber.toLowerCase().includes(query) ||
      (item.object?.name ?? '').toLowerCase().includes(query) ||
      (item.consumer?.name ?? '').toLowerCase().includes(query)
    return (
      matchesObjectQuery &&
      matchesConsumerQuery &&
      matchesStatus &&
      matchesSearch
    )
  })
})

const pagedMeters = computed(() => {
  const start = (currentPage.value - 1) * pageSize
  return filteredMeters.value.slice(start, start + pageSize)
})

const totalFiltered = computed(() => filteredMeters.value.length)

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
  currentPage.value = 1
}

function clearQueryFilters() {
  objectFilter.value = 'all'
  consumerFilterId.value = null
  router.replace({ path: '/meters', query: {} })
}

function statusLabel(status: string) {
  if (status === 'active') return 'Активен'
  if (status === 'inactive') return 'Неактивен'
  return status
}

function tariffLabel(tariffType: string) {
  return tariffTypeLabels[tariffType] || tariffType
}

function formatRatio(value: number | string | null) {
  if (value == null || value === '') return '—'
  const num = Number(value)
  return Number.isFinite(num) ? String(num) : String(value)
}

function openCreate() {
  editingMeter.value = null
  dialogVisible.value = true
}

function openEdit(meter: Meter) {
  editingMeter.value = meter
  dialogVisible.value = true
}

function onSaved(saved: Meter) {
  const index = meters.value.findIndex((item) => item.id === saved.id)
  if (index >= 0) {
    meters.value[index] = {
      ...saved,
      _count: saved._count ?? meters.value[index]._count,
      object: saved.object ?? meters.value[index].object,
      consumer: saved.consumer ?? meters.value[index].consumer,
    }
  } else {
    meters.value.unshift({
      ...saved,
      _count: saved._count ?? { readings: 0 },
    })
  }
}

async function onDelete(meter: Meter) {
  try {
    const updated = await deleteMeter(meter.id)
    const index = meters.value.findIndex((item) => item.id === meter.id)
    if (index >= 0) {
      meters.value[index] = {
        ...meters.value[index],
        ...updated,
        status: 'inactive',
        _count: updated._count ?? meters.value[index]._count,
      }
    }
    ElMessage.success('Счётчик удалён')
  } catch (error) {
    if (axios.isAxiosError(error)) {
      ElMessage.error('Не удалось удалить счётчик')
    }
  }
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
})
</script>

<template>
  <div v-loading="loading" class="page">
    <div class="toolbar">
      <h2>Счётчики</h2>
      <div class="toolbar-actions">
        <el-input
          v-model="search"
          clearable
          placeholder="Поиск по названию или серийному номеру"
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
          :disabled="Boolean(filterObjectId)"
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
        <el-button v-if="canManage" type="primary" @click="openCreate">
          Добавить счётчик
        </el-button>
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
      v-if="!loading && meters.length === 0"
      description="Пока нет ни одного счётчика"
    >
      <el-button v-if="canManage" type="primary" @click="openCreate">
        Добавить счётчик
      </el-button>
    </el-empty>

    <el-empty
      v-else-if="!loading && filteredMeters.length === 0"
      description="Счётчики не найдены"
    />

    <template v-else-if="!loading">
      <div class="grid">
        <EntityCard
          v-for="item in pagedMeters"
          :key="item.id"
          :title="item.name"
          :status-label="statusLabel(item.status)"
          :status-type="item.status === 'active' ? 'success' : 'info'"
        >
          <div class="line">Серийный номер: {{ item.serialNumber }}</div>
          <div
            v-if="item.transformerRatio != null && item.transformerRatio !== ''"
            class="line"
          >
            Коэфф. трансформации:
            {{ item.primaryCurrent }}/{{ item.secondaryCurrent }} =
            {{ formatRatio(item.transformerRatio) }}
          </div>
          <div class="line">
            Объект:
            <el-link type="primary" @click="goToObject(item.objectId)">
              → {{ item.object?.name || '—' }}
            </el-link>
          </div>
          <div class="line">
            Потребитель:
            <el-link
              v-if="item.consumerId"
              type="primary"
              @click="goToConsumer(item.consumerId)"
            >
              → {{ item.consumer?.name || '—' }}
            </el-link>
            <span v-else>Без потребителя</span>
          </div>
          <div class="line">Тариф: {{ tariffLabel(item.tariffType) }}</div>
          <div class="counts">
            <el-link type="primary" @click="goToReadings(item.id)">
              Показания ({{ item._count?.readings ?? 0 }})
            </el-link>
          </div>

          <template v-if="canManage" #actions>
            <el-button type="primary" plain @click="openEdit(item)">
              Редактировать
            </el-button>
            <el-popconfirm
              :title="`Удалить счётчик ${item.name}?`"
              confirm-button-text="Удалить"
              cancel-button-text="Отмена"
              @confirm="onDelete(item)"
            >
              <template #reference>
                <el-button type="danger" plain>Удалить</el-button>
              </template>
            </el-popconfirm>
          </template>
        </EntityCard>
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

    <MeterFormDialog
      v-model="dialogVisible"
      :meter="editingMeter"
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
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 1rem;
  align-items: stretch;
}

.pager {
  display: flex;
  justify-content: center;
  margin-top: 1.25rem;
}
</style>
